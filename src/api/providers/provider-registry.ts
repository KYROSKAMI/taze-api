/**
 * TAZE API — Provider Registry & Concurrency Manager
 * Coordinates registered streaming providers with bounded concurrency, timeouts,
 * automatic fallback, and health monitoring.
 */

import { IAnimeProvider } from './provider-interface.ts';
import { AuthorizedDemoProvider } from './authorized-demo-provider.ts';
import { GogoAnimeProvider } from './gogoanime-provider.ts';
import { ZoroProvider } from './zoro-provider.ts';
import {
  ProviderMetadata,
  EpisodeItem,
  PlaybackContractResponse,
} from '../types/index.ts';
import { globalCache, CacheService } from '../cache/cache-service.ts';

export class ProviderRegistry {
  private providers: Map<string, IAnimeProvider> = new Map();

  constructor() {
    // Register built-in providers
    this.register(new AuthorizedDemoProvider());
    this.register(new GogoAnimeProvider());
    this.register(new ZoroProvider());
  }

  /**
   * Register a new streaming provider
   */
  public register(provider: IAnimeProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Remove a provider
   */
  public unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  /**
   * Get provider by ID
   */
  public get(providerId: string): IAnimeProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * List all registered providers with real-time capability and health metrics
   */
  public async listProviders(): Promise<ProviderMetadata[]> {
    const cacheKey = 'providers:list';
    const cached = globalCache.get<ProviderMetadata[]>(cacheKey);
    if (cached) return cached;

    const list: ProviderMetadata[] = [];
    const entries = Array.from(this.providers.values());

    // Query health with 5s timeout
    await Promise.allSettled(
      entries.map(async (provider) => {
        try {
          const meta = await this.withTimeout(provider.getMetadata(), 5000);
          list.push(meta);
        } catch {
          list.push({
            id: provider.id,
            name: provider.name,
            description: provider.description,
            version: provider.version,
            isAuthorized: provider.isAuthorized,
            status: 'OFFLINE',
            capabilities: {
              supportsSub: true,
              supportsDub: true,
              supportsHls: true,
              supportsDash: false,
              supportsDirectMp4: false,
              supportsIntroOutro: false,
              supportsMultiAudio: false,
            },
          });
        }
      })
    );

    // Sort authorized first, then by status
    list.sort((a, b) => {
      if (a.isAuthorized && !b.isAuthorized) return -1;
      if (!a.isAuthorized && b.isAuthorized) return 1;
      return a.id.localeCompare(b.id);
    });

    globalCache.set(cacheKey, list, CacheService.TTL.PROVIDERS);
    return list;
  }

  /**
   * Episode Discovery with Provider Fallback
   * Tries specified provider first; if unavailable, cascades to registered alternatives
   */
  public async discoverEpisodes(
    anilistId: number,
    preferredProviderId?: string,
    providerAnimeId?: string
  ): Promise<{
    episodes: EpisodeItem[];
    activeProvider: string;
    attemptedProviders: string[];
    fallbackUsed: boolean;
  }> {
    const attemptedProviders: string[] = [];
    const providerQueue: IAnimeProvider[] = [];

    // Prioritize preferred provider if requested
    if (preferredProviderId && this.providers.has(preferredProviderId)) {
      providerQueue.push(this.providers.get(preferredProviderId)!);
    }

    // Add other providers in priority order (authorized first)
    for (const provider of this.providers.values()) {
      if (!providerQueue.some((p) => p.id === provider.id)) {
        providerQueue.push(provider);
      }
    }

    for (const provider of providerQueue) {
      attemptedProviders.push(provider.id);
      try {
        const queryId = providerAnimeId || `anime-${anilistId}`;
        const eps = await this.withTimeout(provider.getEpisodes(queryId, anilistId), 7000);

        if (eps && eps.length > 0) {
          // Deduplicate and order strictly
          const deduplicated = this.deduplicateEpisodes(eps);
          return {
            episodes: deduplicated,
            activeProvider: provider.id,
            attemptedProviders,
            fallbackUsed: preferredProviderId ? provider.id !== preferredProviderId : false,
          };
        }
      } catch (err) {
        console.warn(`[ProviderRegistry] Provider ${provider.id} episode lookup failed:`, err);
      }
    }

    // If external providers return 0 (e.g. datacenter IP blocked), fallback to AuthorizedDemoProvider
    const demo = this.providers.get('authorized-demo');
    if (demo) {
      const demoEps = await demo.getEpisodes(`anime-${anilistId}`, anilistId);
      return {
        episodes: demoEps,
        activeProvider: demo.id,
        attemptedProviders,
        fallbackUsed: true,
      };
    }

    return {
      episodes: [],
      activeProvider: 'none',
      attemptedProviders,
      fallbackUsed: false,
    };
  }

  /**
   * Resolves playback using specified provider with strict timeout protection
   */
  public async resolvePlayback(
    providerId: string,
    episodeId: string,
    anilistId: number = 0
  ): Promise<PlaybackContractResponse> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      // If provider is not found or unsupported, fallback to authorized-demo
      const demo = this.providers.get('authorized-demo')!;
      return demo.resolvePlayback(episodeId, anilistId);
    }

    try {
      const result = await this.withTimeout(
        provider.resolvePlayback(episodeId, anilistId),
        9000
      );

      // If the third-party provider failed to resolve playable streams, provide a graceful fallback
      if (!result.success || result.sources.length === 0) {
        const demo = this.providers.get('authorized-demo')!;
        const fallback = await demo.resolvePlayback(episodeId, anilistId);
        fallback.error = `Provider '${providerId}' upstream streams were restricted or timed out. Switched to authorized stream fallback.`;
        return fallback;
      }

      return result;
    } catch (err: unknown) {
      const demo = this.providers.get('authorized-demo')!;
      const fallback = await demo.resolvePlayback(episodeId, anilistId);
      fallback.error = `Provider '${providerId}' error: ${err instanceof Error ? err.message : 'timeout'}. Playing authorized stream fallback.`;
      return fallback;
    }
  }

  /**
   * Remove duplicate episode entries and sort by episode number ascending
   */
  public deduplicateEpisodes(episodes: EpisodeItem[]): EpisodeItem[] {
    const seen = new Set<number>();
    const unique: EpisodeItem[] = [];

    for (const ep of episodes) {
      if (!seen.has(ep.number)) {
        seen.add(ep.number);
        unique.push(ep);
      }
    }

    return unique.sort((a, b) => a.number - b.number);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
      promise
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

export const providerRegistry = new ProviderRegistry();
