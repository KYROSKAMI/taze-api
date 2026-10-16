/**
 * TAZE API — Direct Media Extractor
 * Resolves direct media streams (MP4, MKV, WebM, HLS) and attaches track metadata.
 */

import { IVideoExtractor, ExtractorResult } from './extractor-interface.ts';
import { PlaybackSource, MediaFormat } from '../types/index.ts';

export class DirectMediaExtractor implements IVideoExtractor {
  public readonly id = 'direct';
  public readonly name = 'Direct Media Stream Extractor';

  public async extract(mediaUrl: string, headers?: Record<string, string>): Promise<ExtractorResult> {
    const isHls = mediaUrl.includes('.m3u8') || mediaUrl.includes('m3u8');
    const isDash = mediaUrl.includes('.mpd');
    const isMp4 = mediaUrl.includes('.mp4');

    let type: MediaFormat = 'hls';
    if (isDash) type = 'dash';
    else if (isMp4) type = 'mp4';

    const source: PlaybackSource = {
      url: mediaUrl,
      type,
      quality: 'default',
      isM3U8: isHls,
      headers: headers || {},
    };

    return {
      sources: [source],
      subtitles: [],
      audioTracks: [],
    };
  }
}
