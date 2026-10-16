/**
 * TAZE API — MegaCloud / RapidCloud Stream Extractor
 * Handles extraction and resolution for MegaCloud / RapidCloud video sources,
 * tracks, and intro/outro timestamps.
 */

import { IVideoExtractor, ExtractorResult } from './extractor-interface.ts';
import { HlsExtractor } from './hls-extractor.ts';
import { PlaybackSource, SubtitleTrack } from '../types/index.ts';

export class MegaCloudExtractor implements IVideoExtractor {
  public readonly id = 'megacloud';
  public readonly name = 'MegaCloud / RapidCloud Extractor';
  private hlsExtractor = new HlsExtractor();

  public async extract(embedUrl: string, headers?: Record<string, string>): Promise<ExtractorResult> {
    const emptyResult: ExtractorResult = { sources: [], subtitles: [], audioTracks: [] };

    try {
      const urlObj = new URL(embedUrl);
      const videoId = urlObj.pathname.split('/').pop()?.split('?')[0];

      if (!videoId) {
        throw new Error('Invalid MegaCloud embed URL: video ID not found');
      }

      // Origin domain
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      const apiUrl = `${domain}/embed-2/ajax/e-1/getSources?id=${videoId}`;

      const res = await fetch(apiUrl, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': embedUrl,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers,
        },
      });

      if (!res.ok) {
        // Fallback: check if the embedUrl itself points directly to a stream
        if (embedUrl.includes('.m3u8')) {
          return this.hlsExtractor.extract(embedUrl, headers);
        }
        return emptyResult;
      }

      const json = await res.json() as any;
      const sources: PlaybackSource[] = [];
      const subtitles: SubtitleTrack[] = [];

      if (json.sources && Array.isArray(json.sources)) {
        for (const s of json.sources) {
          if (s.file) {
            if (s.file.endsWith('.m3u8') || s.type === 'hls') {
              const hlsRes = await this.hlsExtractor.extract(s.file, { Referer: domain });
              sources.push(...hlsRes.sources);
              if (hlsRes.subtitles.length > 0) subtitles.push(...hlsRes.subtitles);
            } else {
              sources.push({
                url: s.file,
                type: s.type === 'mp4' ? 'mp4' : 'hls',
                quality: 'default',
                headers: { Referer: domain },
              });
            }
          }
        }
      }

      // Tracks (subtitles)
      if (json.tracks && Array.isArray(json.tracks)) {
        for (const t of json.tracks) {
          if (t.kind === 'captions' || t.kind === 'subtitles') {
            subtitles.push({
              url: t.file,
              label: t.label || 'English',
              lang: t.label ? t.label.toLowerCase().slice(0, 2) : 'en',
              isDefault: t.default || false,
            });
          }
        }
      }

      return {
        sources,
        subtitles,
        audioTracks: [],
        intro: json.intro,
        outro: json.outro,
      };
    } catch (err) {
      console.warn('[MegaCloudExtractor] Extraction error:', err);
      return emptyResult;
    }
  }
}
