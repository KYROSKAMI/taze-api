/**
 * TAZE API — AniList GraphQL Engine
 * Direct integration with AniList GraphQL API (https://graphql.anilist.co)
 * Includes rate-limiting protection, request timeout, backoff, and caching.
 */

import { AnimeMetadata, ScheduleItem } from '../types/index.ts';
import { globalCache, CacheService } from '../cache/cache-service.ts';

const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';
const DEFAULT_TIMEOUT_MS = 10_000;

interface GraphQLResponse<T> {
  data?: T;
  errors?: {
    message: string;
    status?: number;
    locations?: { line: number; column: number }[];
  }[];
}

export interface SearchOptions {
  query?: string;
  page?: number;
  perPage?: number;
  genre?: string;
  season?: string;
  seasonYear?: number;
  format?: string;
  sort?: string[];
  isAdult?: boolean;
}

export class AniListClient {
  private endpoint: string;

  constructor(endpoint: string = ANILIST_GRAPHQL_ENDPOINT) {
    this.endpoint = endpoint;
  }

  /**
   * Execute an authenticated or public GraphQL query with retry on rate limit
   */
  private async executeQuery<T>(query: string, variables: Record<string, unknown> = {}, retries = 2): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TAZE-API/1.0 (+https://github.com/taze-app)',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle 429 Too Many Requests
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryDelaySec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 3;

        if (retries > 0) {
          console.warn(`[AniList] 429 Rate Limit hit. Retrying in ${retryDelaySec}s...`);
          await new Promise((r) => setTimeout(r, Math.min(retryDelaySec * 1000, 5000)));
          return this.executeQuery<T>(query, variables, retries - 1);
        }
        throw new Error(`AniList API rate limit exceeded. Retry after ${retryDelaySec}s`);
      }

      if (!response.ok) {
        throw new Error(`AniList upstream error: HTTP ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as GraphQLResponse<T>;

      if (json.errors && json.errors.length > 0) {
        const errMessage = json.errors.map((e) => e.message).join('; ');
        throw new Error(`AniList GraphQL Error: ${errMessage}`);
      }

      if (!json.data) {
        throw new Error('AniList returned empty data payload');
      }

      return json.data;
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`AniList request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }
      throw err;
    }
  }

  /**
   * Search Anime with pagination and filters
   */
  public async searchAnime(options: SearchOptions): Promise<{
    results: AnimeMetadata[];
    pageInfo: {
      total: number;
      perPage: number;
      currentPage: number;
      lastPage: number;
      hasNextPage: boolean;
    };
  }> {
    const {
      query,
      page = 1,
      perPage = 20,
      genre,
      season,
      seasonYear,
      format,
      sort = ['POPULARITY_DESC'],
      isAdult = false,
    } = options;

    const cacheKey = `search:${JSON.stringify({ query, page, perPage, genre, season, seasonYear, format, sort, isAdult })}`;
    const cached = globalCache.get<{ results: AnimeMetadata[]; pageInfo: any }>(cacheKey);
    if (cached) return cached;

    const gqlQuery = `
      query SearchAnime(
        $search: String,
        $page: Int,
        $perPage: Int,
        $genre: String,
        $season: MediaSeason,
        $seasonYear: Int,
        $format: MediaFormat,
        $sort: [MediaSort],
        $isAdult: Boolean
      ) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            perPage
            currentPage
            lastPage
            hasNextPage
          }
          media(
            search: $search,
            genre: $genre,
            season: $season,
            seasonYear: $seasonYear,
            format: $format,
            sort: $sort,
            isAdult: $isAdult,
            type: ANIME
          ) {
            id
            idMal
            title {
              romaji
              english
              native
              userPreferred
            }
            format
            status
            episodes
            duration
            season
            seasonYear
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            genres
            tags {
              name
            }
            averageScore
            popularity
            coverImage {
              extraLarge
              large
              medium
              color
            }
            bannerImage
            isAdult
            nextAiringEpisode {
              airingAt
              timeUntilAiring
              episode
            }
          }
        }
      }
    `;

    const variables: Record<string, unknown> = {
      page,
      perPage,
      sort,
      isAdult,
    };

    if (query && query.trim()) variables.search = query.trim();
    if (genre) variables.genre = genre;
    if (season) variables.season = season.toUpperCase();
    if (seasonYear) variables.seasonYear = seasonYear;
    if (format) variables.format = format.toUpperCase();

    const data = await this.executeQuery<{
      Page: {
        pageInfo: any;
        media: any[];
      };
    }>(gqlQuery, variables);

    const formattedResults: AnimeMetadata[] = data.Page.media.map((m) => ({
      id: m.id,
      idMal: m.idMal || undefined,
      title: m.title,
      format: m.format,
      status: m.status,
      episodes: m.episodes || undefined,
      duration: m.duration || undefined,
      season: m.season || undefined,
      seasonYear: m.seasonYear || undefined,
      startDate: m.startDate,
      endDate: m.endDate,
      genres: m.genres || [],
      tags: (m.tags || []).slice(0, 10).map((t: any) => t.name),
      averageScore: m.averageScore || undefined,
      popularity: m.popularity || undefined,
      coverImage: m.coverImage,
      bannerImage: m.bannerImage || undefined,
      isAdult: m.isAdult || false,
      nextAiringEpisode: m.nextAiringEpisode || undefined,
    }));

    const result = {
      results: formattedResults,
      pageInfo: data.Page.pageInfo,
    };

    globalCache.set(cacheKey, result, CacheService.TTL.METADATA);
    return result;
  }

  /**
   * Get complete Anime Details including relations, external links, and synopsis
   */
  public async getAnimeDetails(id: number): Promise<AnimeMetadata | null> {
    const cacheKey = `anime:${id}`;
    const cached = globalCache.get<AnimeMetadata>(cacheKey);
    if (cached) return cached;

    const gqlQuery = `
      query GetAnimeDetails($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          title {
            romaji
            english
            native
            userPreferred
          }
          description(asHtml: false)
          format
          status
          episodes
          duration
          season
          seasonYear
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          genres
          tags {
            name
          }
          averageScore
          popularity
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          isAdult
          nextAiringEpisode {
            airingAt
            timeUntilAiring
            episode
          }
          relations {
            edges {
              relationType
              node {
                id
                type
                format
                status
                title {
                  romaji
                  english
                  native
                  userPreferred
                }
                coverImage {
                  large
                  medium
                }
              }
            }
          }
          externalLinks {
            id
            url
            site
          }
        }
      }
    `;

    try {
      const data = await this.executeQuery<{ Media: any }>(gqlQuery, { id });
      if (!data.Media) return null;

      const m = data.Media;
      const relations = (m.relations?.edges || [])
        .filter((edge: any) => edge.node.type === 'ANIME')
        .map((edge: any) => ({
          id: edge.node.id,
          relationType: edge.relationType,
          title: edge.node.title,
          format: edge.node.format,
          type: edge.node.type,
          status: edge.node.status,
          coverImage: edge.node.coverImage,
        }));

      const metadata: AnimeMetadata = {
        id: m.id,
        idMal: m.idMal || undefined,
        title: m.title,
        synopsis: m.description || undefined,
        format: m.format,
        status: m.status,
        episodes: m.episodes || undefined,
        duration: m.duration || undefined,
        season: m.season || undefined,
        seasonYear: m.seasonYear || undefined,
        startDate: m.startDate,
        endDate: m.endDate,
        genres: m.genres || [],
        tags: (m.tags || []).slice(0, 15).map((t: any) => t.name),
        averageScore: m.averageScore || undefined,
        popularity: m.popularity || undefined,
        coverImage: m.coverImage,
        bannerImage: m.bannerImage || undefined,
        isAdult: m.isAdult || false,
        nextAiringEpisode: m.nextAiringEpisode || undefined,
        relations,
        externalLinks: m.externalLinks || [],
      };

      globalCache.set(cacheKey, metadata, CacheService.TTL.METADATA);
      return metadata;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Not Found')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get Airing Schedule with normalized Unix and ISO 8601 timestamps
   */
  public async getAiringSchedule(
    page: number = 1,
    perPage: number = 25,
    notYetAired: boolean = true
  ): Promise<{
    schedule: ScheduleItem[];
    pageInfo: {
      total: number;
      perPage: number;
      currentPage: number;
      lastPage: number;
      hasNextPage: boolean;
    };
  }> {
    const cacheKey = `schedule:${page}:${perPage}:${notYetAired}`;
    const cached = globalCache.get<{ schedule: ScheduleItem[]; pageInfo: any }>(cacheKey);
    if (cached) return cached;

    const nowUnix = Math.floor(Date.now() / 1000);

    const gqlQuery = `
      query AiringSchedule($page: Int, $perPage: Int, $airingAt_greater: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            perPage
            currentPage
            lastPage
            hasNextPage
          }
          airingSchedules(
            airingAt_greater: $airingAt_greater,
            sort: TIME
          ) {
            id
            airingAt
            timeUntilAiring
            episode
            media {
              id
              title {
                romaji
                english
                native
                userPreferred
              }
              format
              status
              episodes
              coverImage {
                large
                medium
                color
              }
              bannerImage
              genres
              averageScore
            }
          }
        }
      }
    `;

    const variables: Record<string, unknown> = {
      page,
      perPage,
      airingAt_greater: notYetAired ? nowUnix : nowUnix - 86400 * 7,
    };

    const data = await this.executeQuery<{
      Page: {
        pageInfo: any;
        airingSchedules: any[];
      };
    }>(gqlQuery, variables);

    const schedule: ScheduleItem[] = data.Page.airingSchedules.map((item) => {
      const airingTimestampMs = item.airingAt * 1000;
      const currentNowSec = Math.floor(Date.now() / 1000);
      const remainingSeconds = Math.max(0, item.airingAt - currentNowSec);

      return {
        id: item.id,
        airingAt: item.airingAt,
        timeUntilAiring: remainingSeconds,
        airingAtIso: new Date(airingTimestampMs).toISOString(),
        episode: item.episode,
        media: {
          id: item.media.id,
          title: item.media.title,
          format: item.media.format,
          status: item.media.status,
          episodes: item.media.episodes || undefined,
          coverImage: item.media.coverImage,
          bannerImage: item.media.bannerImage || undefined,
          genres: item.media.genres || [],
          averageScore: item.media.averageScore || undefined,
        },
      };
    });

    const result = {
      schedule,
      pageInfo: data.Page.pageInfo,
    };

    globalCache.set(cacheKey, result, CacheService.TTL.SCHEDULE);
    return result;
  }
}

export const aniListClient = new AniListClient();
