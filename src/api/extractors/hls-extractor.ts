/**
 * TAZE API — HLS (HTTP Live Streaming) Master Playlist Extractor
 * Parses .m3u8 manifests to extract video qualities, bitrates, audio tracks, and subtitles.
 */

import { IVideoExtractor, ExtractorResult } from './extractor-interface.ts';
import { PlaybackSource, SubtitleTrack, AudioTrack } from '../types/index.ts';

export class HlsExtractor implements IVideoExtractor {
  public readonly id = 'hls';
  public readonly name = 'HLS Master Playlist Extractor';

  public async extract(m3u8Url: string, headers?: Record<string, string>): Promise<ExtractorResult> {
    const sources: PlaybackSource[] = [];
    const subtitles: SubtitleTrack[] = [];
    const audioTracks: AudioTrack[] = [];

    // Always include the master source as 'auto'
    sources.push({
      url: m3u8Url,
      type: 'hls',
      quality: 'auto',
      isM3U8: true,
      headers: headers || {},
    });

    try {
      const response = await fetch(m3u8Url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers,
        },
      });

      if (!response.ok) {
        // Return master source if fetch fails
        return { sources, subtitles, audioTracks };
      }

      const content = await response.text();
      const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

      // Parse variant streams
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Subtitle media tag
        if (line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')) {
          const nameMatch = line.match(/NAME="([^"]+)"/);
          const langMatch = line.match(/LANGUAGE="([^"]+)"/);
          const uriMatch = line.match(/URI="([^"]+)"/);
          const defaultMatch = line.match(/DEFAULT=(YES|NO)/);

          if (uriMatch) {
            const subUrl = uriMatch[1].startsWith('http') ? uriMatch[1] : baseUrl + uriMatch[1];
            subtitles.push({
              url: subUrl,
              label: nameMatch ? nameMatch[1] : (langMatch ? langMatch[1] : 'Unknown'),
              lang: langMatch ? langMatch[1] : 'und',
              isDefault: defaultMatch ? defaultMatch[1] === 'YES' : false,
            });
          }
        }

        // Audio media tag
        if (line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
          const nameMatch = line.match(/NAME="([^"]+)"/);
          const langMatch = line.match(/LANGUAGE="([^"]+)"/);
          const uriMatch = line.match(/URI="([^"]+)"/);
          const defaultMatch = line.match(/DEFAULT=(YES|NO)/);

          if (nameMatch) {
            const audioUrl = uriMatch
              ? (uriMatch[1].startsWith('http') ? uriMatch[1] : baseUrl + uriMatch[1])
              : undefined;

            audioTracks.push({
              url: audioUrl,
              label: nameMatch[1],
              lang: langMatch ? langMatch[1] : 'und',
              isDefault: defaultMatch ? defaultMatch[1] === 'YES' : false,
            });
          }
        }

        // Video variant stream
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          const bandMatch = line.match(/BANDWIDTH=(\d+)/);

          let nextLine = '';
          while (i + 1 < lines.length) {
            i++;
            nextLine = lines[i].trim();
            if (nextLine && !nextLine.startsWith('#')) break;
          }

          if (nextLine && !nextLine.startsWith('#')) {
            const streamUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
            let quality = 'default';

            if (resMatch) {
              const height = resMatch[1].split('x')[1];
              quality = `${height}p`;
            } else if (bandMatch) {
              const bandwidth = parseInt(bandMatch[1], 10);
              if (bandwidth > 4_000_000) quality = '1080p';
              else if (bandwidth > 2_000_000) quality = '720p';
              else if (bandwidth > 1_000_000) quality = '480p';
              else quality = '360p';
            }

            sources.push({
              url: streamUrl,
              type: 'hls',
              quality,
              bitrate: bandMatch ? parseInt(bandMatch[1], 10) : undefined,
              isM3U8: true,
              headers: headers || {},
            });
          }
        }
      }
    } catch (err) {
      // In case of parsing error, still return the base auto source safely
      console.warn('[HlsExtractor] Manifest parsing warning:', err);
    }

    return {
      sources,
      subtitles,
      audioTracks,
    };
  }
}
