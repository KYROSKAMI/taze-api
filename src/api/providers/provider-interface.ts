/**
 * TAZE API — Streaming Provider Interface
 * Decoupled provider specification for anime search, episode listing,
 * playback source resolution, and health reporting.
 */

import {
  ProviderMetadata,
  EpisodeItem,
  PlaybackContractResponse,
} from '../types/index.ts';

export interface ProviderSearchResult {
  id: string; // Provider-specific ID/slug
  title: string;
  subOrDub?: 'sub' | 'dub' | 'both';
  releaseYear?: number;
  totalEpisodes?: number;
  image?: string;
}

export interface IAnimeProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly isAuthorized: boolean;

  /**
   * Returns current metadata, status, and capabilities
   */
  getMetadata(): Promise<ProviderMetadata>;

  /**
   * Search anime on the provider
   */
  search(query: string): Promise<ProviderSearchResult[]>;

  /**
   * Retrieve episode list for a provider anime ID
   */
  getEpisodes(providerAnimeId: string, anilistId?: number): Promise<EpisodeItem[]>;

  /**
   * Resolve playback sources, subtitles, and audio tracks for an episode
   */
  resolvePlayback(episodeId: string, anilistId?: number): Promise<PlaybackContractResponse>;

  /**
   * Quick health check / ping
   */
  checkHealth(): Promise<{ isHealthy: boolean; latencyMs: number; message?: string }>;
}
