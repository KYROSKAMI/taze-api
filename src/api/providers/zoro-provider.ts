/**
 * TAZE API — Zoro / Aniwatch Community Candidate Provider
 * Resolves episodes and sources using MegaCloud extraction architecture.
 */

import { IAnimeProvider, ProviderSearchResult } from './provider-interface.ts';
import {
  EpisodeItem,
  PlaybackContractResponse,
  ProviderMetadata,
} from '../types/index.ts';
import { MegaCloudExtractor } from '../extractors/megacloud-extractor.ts';

export class ZoroProvider implements IAnimeProvider {
  public readonly id = 'zoro';
  public readonly name = 'Zoro / Aniwatch (Candidate)';
  public readonly description = 'Community candidate provider with sub, dub, and MegaCloud playback pipeline';
  public readonly version = '1.0.4';
  public readonly isAuthorized = false;

  private baseUrl = 'https://hianime.to';
  private megaCloud = new MegaCloudExtractor();

  public async getMetadata(): Promise<ProviderMetadata> {
    const health = await this.checkHealth();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      isAuthorized: this.isAuthorized,
      status: health.isHealthy ? 'ONLINE' : 'DEGRADED',
      latencyMs: health.latencyMs,
      capabilities: {
        supportsSub: true,
        supportsDub: true,
        supportsHls: true,
        supportsDash: false,
        supportsDirectMp4: false,
        supportsIntroOutro: true,
        supportsMultiAudio: false,
      },
    };
  }

  public async search(query: string): Promise<ProviderSearchResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const searchUrl = `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      clearTimeout(timeout);
      if (!res.ok) return [];

      const html = await res.text();
      const results: ProviderSearchResult[] = [];

      const itemRegex = /<div class="flw-item">[\s\S]*?<a href="\/watch\/([^"]+)"[\s\S]*?title="([^"]+)"[\s\S]*?<img src="([^"]+)"/gi;
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        results.push({
          id: match[1],
          title: match[2],
          image: match[3],
          subOrDub: 'both',
        });
      }

      return results;
    } catch (err) {
      clearTimeout(timeout);
      return [];
    }
  }

  public async getEpisodes(providerAnimeId: string, anilistId: number = 0): Promise<EpisodeItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      // hiAnime anime id is usually at end of slug (e.g. "one-piece-100" -> 100)
      const idMatch = providerAnimeId.match(/-(\d+)$/);
      const internalId = idMatch ? idMatch[1] : providerAnimeId;

      const ajaxUrl = `${this.baseUrl}/ajax/v2/episode/list/${internalId}`;
      const res = await fetch(ajaxUrl, {
        signal: controller.signal,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      clearTimeout(timeout);
      if (!res.ok) return [];

      const json = await res.json() as any;
      if (!json.html) return [];

      const episodes: EpisodeItem[] = [];
      const epRegex = /<a[^>]+data-number="(\d+)"[^>]+data-id="([^"]+)"[^>]+title="([^"]*)"/gi;
      let epMatch;

      while ((epMatch = epRegex.exec(json.html)) !== null) {
        const epNum = parseInt(epMatch[1], 10);
        const epInternalId = epMatch[2];
        const epTitle = epMatch[3] || `Episode ${epNum}`;

        episodes.push({
          id: `${this.id}:${epInternalId}`,
          animeId: anilistId,
          providerId: this.id,
          providerEpisodeId: epInternalId,
          number: epNum,
          title: epTitle,
          hasDub: true,
          hasSub: true,
          availability: 'AVAILABLE',
        });
      }

      episodes.sort((a, b) => a.number - b.number);
      return episodes;
    } catch (err) {
      clearTimeout(timeout);
      return [];
    }
  }

  public async resolvePlayback(episodeId: string, anilistId: number = 0): Promise<PlaybackContractResponse> {
    const cleanEpId = episodeId.replace(/^zoro:/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      // Step 1: get servers
      const serversUrl = `${this.baseUrl}/ajax/v2/episode/servers?episodeId=${cleanEpId}`;
      const res = await fetch(serversUrl, {
        signal: controller.signal,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      clearTimeout(timeout);
      if (!res.ok) {
        return {
          success: false,
          animeId: anilistId,
          episode: { id: episodeId, number: 1 },
          provider: { id: this.id, name: this.name },
          sources: [],
          subtitles: [],
          audioTracks: [],
          error: `Could not retrieve servers from ${this.baseUrl} (HTTP ${res.status})`,
        };
      }

      const json = await res.json() as any;
      const serverIdMatch = json.html?.match(/data-id="([^"]+)"/);

      if (!serverIdMatch) {
        return {
          success: false,
          animeId: anilistId,
          episode: { id: episodeId, number: 1 },
          provider: { id: this.id, name: this.name },
          sources: [],
          subtitles: [],
          audioTracks: [],
          error: 'No active streaming server ID found for episode',
        };
      }

      // Step 2: get embed link
      const embedApi = `${this.baseUrl}/ajax/v2/episode/sources?id=${serverIdMatch[1]}`;
      const embedRes = await fetch(embedApi, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });

      const embedJson = await embedRes.json() as any;
      if (!embedJson.link) {
        return {
          success: false,
          animeId: anilistId,
          episode: { id: episodeId, number: 1 },
          provider: { id: this.id, name: this.name },
          sources: [],
          subtitles: [],
          audioTracks: [],
          error: 'No embed link generated by upstream server',
        };
      }

      // Extract via MegaCloud
      const extracted = await this.megaCloud.extract(embedJson.link);

      return {
        success: extracted.sources.length > 0,
        animeId: anilistId,
        episode: {
          id: episodeId,
          number: 1,
        },
        provider: {
          id: this.id,
          name: this.name,
          version: this.version,
        },
        sources: extracted.sources,
        subtitles: extracted.subtitles,
        audioTracks: extracted.audioTracks,
        intro: extracted.intro,
        outro: extracted.outro,
        error: extracted.sources.length === 0 ? 'Extracted 0 playable sources' : null,
      };
    } catch (err) {
      clearTimeout(timeout);
      return {
        success: false,
        animeId: anilistId,
        episode: { id: episodeId, number: 1 },
        provider: { id: this.id, name: this.name },
        sources: [],
        subtitles: [],
        audioTracks: [],
        error: err instanceof Error ? err.message : 'Upstream server error',
      };
    }
  }

  public async checkHealth(): Promise<{ isHealthy: boolean; latencyMs: number; message?: string }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(this.baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      clearTimeout(timeout);
      return {
        isHealthy: res.ok,
        latencyMs: Date.now() - start,
        message: res.ok ? 'HiAnime/Zoro gateway reachable' : `Status ${res.status}`,
      };
    } catch {
      return {
        isHealthy: false,
        latencyMs: Date.now() - start,
        message: 'HiAnime gateway unreachable or Cloudflare challenge active',
      };
    }
  }
}
