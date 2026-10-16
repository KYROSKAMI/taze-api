/**
 * TAZE API — Video Extractor Interface
 * Modular contract for resolving media embed URLs into playable HLS/MP4 streams,
 * subtitles, and audio tracks.
 */

import { PlaybackSource, SubtitleTrack, AudioTrack } from '../types/index.ts';

export interface ExtractorResult {
  sources: PlaybackSource[];
  subtitles: SubtitleTrack[];
  audioTracks: AudioTrack[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface IVideoExtractor {
  readonly id: string;
  readonly name: string;
  extract(embedUrl: string, headers?: Record<string, string>): Promise<ExtractorResult>;
}
