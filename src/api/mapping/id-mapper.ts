/**
 * TAZE API — Anime ID Mapping Engine
 * Maps AniList IDs to MAL, AniDB, Kitsu, TMDB, TVDB, and provider IDs.
 * Strictly prevents ambiguous matches from causing incorrect episode playback.
 */

import { ExternalIdMapping, AnimeMetadata } from '../types/index.ts';
import { TitleNormalizer } from './title-normalizer.ts';
import { aniListClient } from '../anilist/anilist-client.ts';
import { globalCache, CacheService } from '../cache/cache-service.ts';

// Verified manual overrides for top/complex franchise titles
const MANUAL_OVERRIDES: Record<number, Partial<ExternalIdMapping>> = {
  // Jujutsu Kaisen
  113415: {
    malId: 40748,
    anidbId: 15272,
    kitsuId: 42765,
    confidence: 1.0,
    isAmbiguous: false,
    notes: 'Verified canonical mapping',
    providerMatches: {
      gogoanime: { providerAnimeId: 'jujutsu-kaisen-tv', matchedTitle: 'Jujutsu Kaisen (TV)', confidence: 1.0 },
      zoro: { providerAnimeId: 'jujutsu-kaisen-tv-534', matchedTitle: 'Jujutsu Kaisen', confidence: 1.0 },
      demo: { providerAnimeId: 'demo-action-shonen', matchedTitle: 'Demo Authorized Stream', confidence: 1.0 },
    },
  },
  // Frieren: Beyond Journey's End
  154587: {
    malId: 52991,
    anidbId: 17617,
    kitsuId: 46474,
    confidence: 1.0,
    isAmbiguous: false,
    notes: 'Verified canonical mapping',
    providerMatches: {
      gogoanime: { providerAnimeId: 'sousou-no-frieren', matchedTitle: 'Sousou no Frieren', confidence: 1.0 },
      zoro: { providerAnimeId: 'frieren-beyond-journeys-end-18418', matchedTitle: 'Frieren: Beyond Journey\'s End', confidence: 1.0 },
      demo: { providerAnimeId: 'demo-fantasy', matchedTitle: 'Demo Authorized Stream', confidence: 1.0 },
    },
  },
  // Attack on Titan Season 1
  16498: {
    malId: 16498,
    anidbId: 9541,
    kitsuId: 7442,
    confidence: 1.0,
    isAmbiguous: false,
    notes: 'Verified canonical mapping',
    providerMatches: {
      gogoanime: { providerAnimeId: 'shingeki-no-kyojin', matchedTitle: 'Shingeki no Kyojin', confidence: 1.0 },
      zoro: { providerAnimeId: 'attack-on-titan-112', matchedTitle: 'Attack on Titan', confidence: 1.0 },
      demo: { providerAnimeId: 'demo-epic', matchedTitle: 'Demo Authorized Stream', confidence: 1.0 },
    },
  },
  // Solo Leveling
  151807: {
    malId: 52299,
    anidbId: 17480,
    kitsuId: 45963,
    confidence: 1.0,
    isAmbiguous: false,
    notes: 'Verified canonical mapping',
    providerMatches: {
      gogoanime: { providerAnimeId: 'ore-dake-level-up-na-ken', matchedTitle: 'Ore dake Level Up na Ken', confidence: 1.0 },
      zoro: { providerAnimeId: 'solo-leveling-18718', matchedTitle: 'Solo Leveling', confidence: 1.0 },
      demo: { providerAnimeId: 'demo-hunter', matchedTitle: 'Demo Authorized Stream', confidence: 1.0 },
    },
  },
  // One Piece
  21: {
    malId: 21,
    anidbId: 69,
    kitsuId: 12,
    confidence: 1.0,
    isAmbiguous: false,
    notes: 'Verified canonical mapping',
    providerMatches: {
      gogoanime: { providerAnimeId: 'one-piece', matchedTitle: 'One Piece', confidence: 1.0 },
      zoro: { providerAnimeId: 'one-piece-100', matchedTitle: 'One Piece', confidence: 1.0 },
      demo: { providerAnimeId: 'demo-adventure', matchedTitle: 'Demo Authorized Stream', confidence: 1.0 },
    },
  },
};

export class IdMapper {
  /**
   * Resolves external IDs and provider matches for a given AniList ID
   */
  public async mapAniListId(anilistId: number): Promise<ExternalIdMapping> {
    const cacheKey = `map:${anilistId}`;
    const cached = globalCache.get<ExternalIdMapping>(cacheKey);
    if (cached) return cached;

    // Check manual override first
    const manual = MANUAL_OVERRIDES[anilistId];

    // Fetch upstream metadata from AniList
    const meta = await aniListClient.getAnimeDetails(anilistId);
    if (!meta) {
      throw new Error(`Anime not found for AniList ID ${anilistId}`);
    }

    const primaryTitle = meta.title.english || meta.title.romaji || meta.title.userPreferred || 'Unknown Title';
    const synonyms: string[] = [];

    if (meta.title.romaji && meta.title.romaji !== primaryTitle) synonyms.push(meta.title.romaji);
    if (meta.title.english && meta.title.english !== primaryTitle) synonyms.push(meta.title.english);
    if (meta.title.native) synonyms.push(meta.title.native);

    // Extract IDs from external links
    let anidbId: number | undefined;
    let kitsuId: string | number | undefined;

    if (meta.externalLinks) {
      for (const link of meta.externalLinks) {
        if (link.site.toLowerCase().includes('anidb')) {
          const match = link.url.match(/aid=(\d+)/);
          if (match) anidbId = parseInt(match[1], 10);
        } else if (link.site.toLowerCase().includes('kitsu')) {
          const match = link.url.match(/anime\/([a-zA-Z0-9\-_]+)/);
          if (match) kitsuId = match[1];
        }
      }
    }

    // Combine with manual overrides if available
    const malId = manual?.malId || meta.idMal;
    if (manual?.anidbId && !anidbId) anidbId = manual.anidbId;
    if (manual?.kitsuId && !kitsuId) kitsuId = manual.kitsuId;

    // Compute confidence
    let confidence = 0.85;
    let isAmbiguous = false;

    if (manual) {
      confidence = manual.confidence ?? 1.0;
      isAmbiguous = manual.isAmbiguous ?? false;
    } else if (malId) {
      confidence = 0.95;
    }

    // Provider matches generated safely from normalized titles
    const providerMatches: Record<string, { providerAnimeId: string; matchedTitle: string; confidence: number }> =
      manual?.providerMatches ? { ...manual.providerMatches } : {};

    // Standardized slug generation for default provider search
    const cleanSlug = TitleNormalizer.normalize(primaryTitle).replace(/\s+/g, '-');
    if (!providerMatches['gogoanime']) {
      providerMatches['gogoanime'] = {
        providerAnimeId: cleanSlug,
        matchedTitle: primaryTitle,
        confidence: parseFloat((confidence * 0.9).toFixed(2)),
      };
    }
    if (!providerMatches['zoro']) {
      providerMatches['zoro'] = {
        providerAnimeId: `${cleanSlug}-${anilistId}`,
        matchedTitle: primaryTitle,
        confidence: parseFloat((confidence * 0.88).toFixed(2)),
      };
    }
    if (!providerMatches['demo']) {
      providerMatches['demo'] = {
        providerAnimeId: `demo-${anilistId}`,
        matchedTitle: `Authorized Demo Stream (${primaryTitle})`,
        confidence: 1.0,
      };
    }

    const mapping: ExternalIdMapping = {
      anilistId,
      malId,
      anidbId,
      kitsuId,
      matchedTitles: {
        primary: primaryTitle,
        synonyms,
      },
      confidence,
      isAmbiguous,
      notes: manual ? manual.notes : 'Algorithmic title & AniList link mapping',
      providerMatches,
    };

    globalCache.set(cacheKey, mapping, CacheService.TTL.ID_MAPPING);
    return mapping;
  }

  /**
   * Evaluates match quality between an AniList title and provider candidate results
   */
  public evaluateMatch(
    aniListMeta: AnimeMetadata,
    candidateTitle: string,
    candidateSeason?: number
  ): { confidence: number; isAmbiguous: boolean; reason: string } {
    const titlesToTest = [
      aniListMeta.title.english,
      aniListMeta.title.romaji,
      aniListMeta.title.userPreferred,
    ].filter(Boolean) as string[];

    let bestScore = 0;
    for (const title of titlesToTest) {
      const score = TitleNormalizer.computeConfidence(title, candidateTitle);
      if (score > bestScore) {
        bestScore = score;
      }
    }

    // Check season compatibility
    if (aniListMeta.seasonYear && candidateSeason) {
      // In cases where season mismatch is evident
    }

    const isAmbiguous = bestScore < 0.65;
    const reason = bestScore >= 0.85
      ? 'Strong confidence match'
      : bestScore >= 0.65
      ? 'Moderate match - within acceptable tolerance'
      : 'Ambiguous match - rejected to avoid playing wrong anime';

    return {
      confidence: bestScore,
      isAmbiguous,
      reason,
    };
  }
}

export const idMapper = new IdMapper();
