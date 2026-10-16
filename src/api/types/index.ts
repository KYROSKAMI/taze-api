/**
 * TAZE API — Core Data Contracts and Models
 * Standardized types for metadata, ID mapping, episodes, playback, and extensions.
 */

export interface AnimeTitle {
  romaji?: string;
  english?: string;
  native?: string;
  userPreferred?: string;
}

export interface AnimeCoverImage {
  extraLarge?: string;
  large?: string;
  medium?: string;
  color?: string;
}

export interface AnimeFuzzyDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface AnimeRelation {
  id: number;
  relationType: string;
  title: AnimeTitle;
  format?: string;
  type?: string;
  status?: string;
  coverImage?: AnimeCoverImage;
}

export interface AnimeMetadata {
  id: number; // AniList ID
  idMal?: number;
  title: AnimeTitle;
  synopsis?: string;
  format?: string;
  status?: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS' | string;
  episodes?: number;
  duration?: number;
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL' | string;
  seasonYear?: number;
  startDate?: AnimeFuzzyDate;
  endDate?: AnimeFuzzyDate;
  genres: string[];
  tags: string[];
  averageScore?: number;
  popularity?: number;
  coverImage: AnimeCoverImage;
  bannerImage?: string;
  isAdult?: boolean;
  nextAiringEpisode?: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  };
  relations?: AnimeRelation[];
  externalLinks?: {
    id: number;
    url: string;
    site: string;
  }[];
}

export interface ExternalIdMapping {
  anilistId: number;
  malId?: number;
  anidbId?: number;
  kitsuId?: string | number;
  tmdbId?: string | number;
  tvdbId?: string | number;
  matchedTitles: {
    primary: string;
    synonyms: string[];
  };
  confidence: number; // 0.0 to 1.0
  isAmbiguous: boolean;
  notes?: string;
  providerMatches?: Record<string, {
    providerAnimeId: string;
    matchedTitle: string;
    confidence: number;
  }>;
}

export interface EpisodeItem {
  id: string; // Uniform ID: e.g. "gogo:jujutsu-kaisen-episode-1" or "demo:1"
  animeId: number; // AniList ID
  providerId: string;
  providerEpisodeId: string;
  number: number;
  absoluteNumber?: number;
  season?: number;
  title?: string;
  thumbnail?: string;
  releaseDate?: string;
  isFiller?: boolean;
  hasDub?: boolean;
  hasSub?: boolean;
  availability: 'AVAILABLE' | 'UPCOMING' | 'UNAVAILABLE';
}

export interface ScheduleItem {
  id: number; // AiringSchedule ID
  airingAt: number; // Unix timestamp (seconds)
  timeUntilAiring: number; // Seconds remaining from reference time
  airingAtIso: string; // ISO 8601 string
  episode: number;
  media: {
    id: number;
    title: AnimeTitle;
    format?: string;
    status?: string;
    episodes?: number;
    coverImage: AnimeCoverImage;
    bannerImage?: string;
    genres: string[];
    averageScore?: number;
  };
}

export type MediaFormat = 'hls' | 'dash' | 'mp4' | 'mkv' | 'webm';

export interface PlaybackSource {
  url: string;
  type: MediaFormat;
  quality: 'auto' | '1080p' | '720p' | '480p' | '360p' | 'default' | string;
  headers?: Record<string, string>;
  isM3U8?: boolean;
  expiresAt?: number | null;
  bitrate?: number;
}

export interface SubtitleTrack {
  url: string;
  lang: string;
  label: string;
  kind?: 'subtitles' | 'captions';
  isDefault?: boolean;
}

export interface AudioTrack {
  url?: string;
  lang: string;
  label: string;
  kind?: 'main' | 'dub' | 'commentary';
  isDefault?: boolean;
}

export interface PlaybackContractResponse {
  success: boolean;
  animeId: number;
  episode: {
    id: string;
    number: number;
    title?: string;
    season?: number;
  };
  provider: {
    id: string;
    name: string;
    version?: string;
  };
  sources: PlaybackSource[];
  subtitles: SubtitleTrack[];
  audioTracks: AudioTrack[];
  downloadUrl?: string;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  error?: string | null;
}

export interface ProviderCapability {
  supportsSub: boolean;
  supportsDub: boolean;
  supportsHls: boolean;
  supportsDash: boolean;
  supportsDirectMp4: boolean;
  supportsIntroOutro: boolean;
  supportsMultiAudio: boolean;
}

export interface ProviderMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  isAuthorized: boolean;
  capabilities: ProviderCapability;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNVERIFIED';
  latencyMs?: number;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  developer: string;
  icon?: string;
  minApiVersion: string;
  homepage?: string;
  enabled: boolean;
  capabilities: ProviderCapability;
  providerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    cached: boolean;
    timestamp: number;
    executionTimeMs: number;
    total?: number;
    page?: number;
    hasNextPage?: boolean;
  };
}
