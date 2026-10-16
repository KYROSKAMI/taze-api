/**
 * TAZE API — GogoAnime Community Provider Integration
 * Candidate provider for GogoAnime mirrors with timeout bounds, error isolation,
 * and HLS source extraction.
 */

import { IAnimeProvider, ProviderSearchResult } from './provider-interface.ts';
import {
  EpisodeItem,
  PlaybackContractResponse,
  ProviderMetadata,
} from '../types/index.ts';
import { HlsExtractor } from '../extractors/hls-extractor.ts';

export class GogoAnimeProvider implements IAnimeProvider {
  public readonly id = 'gogoanime';
  public readonly name = 'GogoAnime (Candidate Mirror)';
  public readonly description = 'Community mirror integration with multi-quality HLS streams';
  public readonly version = '1.1.0';
  public readonly isAuthorized = false;

  private primaryBase = 'https://anitaku.to';
  private apiMirrors = [
    'https://anitaku.to',
    'https://gogoanime3.co',
  ];
  private hlsExtractor = new HlsExtractor();

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
        supportsDirectMp4: true,
        supportsIntroOutro: false,
        supportsMultiAudio: false,
      },
    };
  }

  public async search(query: string): Promise<ProviderSearchResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const searchUrl = `${this.primaryBase}/search.html?keyword=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      clearTimeout(timeout);
      if (!res.ok) {
        return [];
      }

      const html = await res.text();
      const results: ProviderSearchResult[] = [];

      // Parse search HTML elements
      const itemRegex = /<li[^>]*>[\s\S]*?<div class="img">[\s\S]*?<a href="\/category\/([^"]+)" title="([^"]+)">[\s\S]*?<img src="([^"]+)"[\s\S]*?<\/li>/gi;
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        const slug = match[1];
        const title = match[2];
        const image = match[3];

        results.push({
          id: slug,
          title,
          subOrDub: title.toLowerCase().includes('(dub)') ? 'dub' : 'sub',
          image,
        });
      }

      return results;
    } catch (err) {
      clearTimeout(timeout);
      console.warn('[GogoAnimeProvider] Search warning:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  public async getEpisodes(providerAnimeId: string, anilistId: number = 0): Promise<EpisodeItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      // Step 1: Query anime page to get movie_id
      const pageUrl = `${this.primaryBase}/category/${providerAnimeId}`;
      const pageRes = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!pageRes.ok) {
        clearTimeout(timeout);
        return [];
      }

      const html = await pageRes.text();
      const movieIdMatch = html.match(/id="movie_id" value="([^"]+)"/);
      const defaultEpMatch = html.match(/id="default_ep" value="([^"]+)"/);
      const aliasMatch = html.match(/id="alias_anime" value="([^"]+)"/);

      if (!movieIdMatch) {
        clearTimeout(timeout);
        return [];
      }

      const movieId = movieIdMatch[1];
      const defaultEp = defaultEpMatch ? defaultEpMatch[1] : '0';
      const alias = aliasMatch ? aliasMatch[1] : providerAnimeId;

      // Step 2: Fetch episode list from AJAX endpoint
      const epListUrl = `https://ajax.gogocdn.net/ajax/load-list-episode?ep_start=0&ep_end=2000&id=${movieId}&default_ep=${defaultEp}&alias=${alias}`;
      const epRes = await fetch(epListUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      clearTimeout(timeout);
      if (!epRes.ok) return [];

      const epHtml = await epRes.text();
      const episodes: EpisodeItem[] = [];

      const epRegex = /<a href="\/([^"]+)">[\s\S]*?<div class="name">[\s\S]*?EP\s*(\d+)<\/div>/gi;
      let epMatch;
      while ((epMatch = epRegex.exec(epHtml)) !== null) {
        const epSlug = epMatch[1].trim();
        const epNum = parseInt(epMatch[2], 10);

        epEpisodesPush(episodes, {
          id: `${this.id}:${epSlug}`,
          animeId: anilistId,
          providerId: this.id,
          providerEpisodeId: epSlug,
          number: epNum,
          title: `Episode ${epNum}`,
          hasDub: providerAnimeId.includes('-dub'),
          hasSub: true,
          availability: 'AVAILABLE',
        });
      }

      // Sort episodes ascending
      episodes.sort((a, b) => a.number - b.number);
      return episodes;
    } catch (err) {
      clearTimeout(timeout);
      console.warn('[GogoAnimeProvider] getEpisodes error:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  public async resolvePlayback(episodeId: string, anilistId: number = 0): Promise<PlaybackContractResponse> {
    const cleanEpId = episodeId.replace(/^gogoanime:/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const epPageUrl = `${this.primaryBase}/${cleanEpId}`;
      const res = await fetch(epPageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
          error: `Failed to fetch episode page from ${this.primaryBase} (HTTP ${res.status})`,
        };
      }

      const html = await res.text();
      // Extract iframe player source
      const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
      if (!iframeMatch) {
        return {
          success: false,
          animeId: anilistId,
          episode: { id: episodeId, number: 1 },
          provider: { id: this.id, name: this.name },
          sources: [],
          subtitles: [],
          audioTracks: [],
          error: 'No embedded player iframe located in upstream response',
        };
      }

      let embedUrl = iframeMatch[1];
      if (embedUrl.startsWith('//')) {
        embedUrl = `https:${embedUrl}`;
      }

      // Extract sources using HLS extractor if direct, or through embed
      const extracted = await this.hlsExtractor.extract(embedUrl);

      const numMatch = cleanEpId.match(/episode-(\d+)/);
      const episodeNum = numMatch ? parseInt(numMatch[1], 10) : 1;

      return {
        success: extracted.sources.length > 0,
        animeId: anilistId,
        episode: {
          id: episodeId,
          number: episodeNum,
          title: `Episode ${episodeNum}`,
        },
        provider: {
          id: this.id,
          name: this.name,
          version: this.version,
        },
        sources: extracted.sources,
        subtitles: extracted.subtitles,
        audioTracks: extracted.audioTracks,
        error: extracted.sources.length === 0 ? 'No playable streams extracted from provider embed' : null,
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
        error: err instanceof Error ? err.message : 'Unknown provider resolution error',
      };
    }
  }

  public async checkHealth(): Promise<{ isHealthy: boolean; latencyMs: number; message?: string }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(this.primaryBase, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      return {
        isHealthy: res.ok,
        latencyMs,
        message: res.ok ? 'Mirror reachable' : `Mirror returned HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        isHealthy: false,
        latencyMs: Date.now() - start,
        message: 'Mirror unreachable or blocked by Cloudflare/datacenter filter',
      };
    }
  }
}

function epEpisodesPush(arr: EpisodeItem[], item: EpisodeItem) {
  // Prevent duplicate episode entries
  if (!arr.some((e) => e.number === item.number)) {
    arr.push(item);
  }
}
