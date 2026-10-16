/**
 * TAZE API — Express Router & Endpoint Controllers
 * Implements all required specification endpoints, validation, error formats,
 * and media stream proxying for client playback verification.
 */

import { Router, Request, Response } from 'express';
import { aniListClient } from '../anilist/anilist-client.ts';
import { idMapper } from '../mapping/id-mapper.ts';
import { providerRegistry } from '../providers/provider-registry.ts';
import { extensionManager } from '../extensions/extension-manager.ts';
import { globalCache } from '../cache/cache-service.ts';
import { ApiResponse } from '../types/index.ts';

export const apiRouter = Router();

const START_TIME = Date.now();
const API_VERSION = '1.0.0';

/**
 * Standardized JSON responder
 */
function sendSuccess<T>(res: Response, data: T, startTime: number, metaExtras?: Record<string, unknown>) {
  const payload: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      cached: false,
      timestamp: Date.now(),
      executionTimeMs: Date.now() - startTime,
      ...metaExtras,
    },
  };
  return res.json(payload);
}

function sendError(res: Response, status: number, code: string, message: string, details?: unknown) {
  const payload: ApiResponse<null> = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
  return res.status(status).json(payload);
}

/**
 * GET /health — Service health & diagnostic metrics
 */
apiRouter.get('/health', (req: Request, res: Response) => {
  const start = Date.now();
  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
  const memUsage = process.memoryUsage();

  const healthData = {
    status: 'healthy',
    version: API_VERSION,
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    system: {
      memory: {
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
      nodeVersion: process.version,
    },
    cache: globalCache.getStats(),
  };

  return sendSuccess(res, healthData, start);
});

/**
 * GET / — API information and root manifest
 */
apiRouter.get('/', async (req: Request, res: Response) => {
  const start = Date.now();
  const providers = await providerRegistry.listProviders();

  const manifest = {
    name: 'TAZE API',
    tagline: 'High-performance Anime Backend & Video Pipeline',
    version: API_VERSION,
    author: 'TAZE Architecture',
    endpoints: {
      health: '/health',
      search: '/search?query=:title',
      animeDetails: '/anime/:id',
      idMapping: '/map/:anilistId',
      episodes: '/episodes/:anilistId?provider=:providerId',
      schedule: '/schedule?page=1&perPage=25',
      providers: '/providers',
      providerDetails: '/providers/:providerId',
      watch: '/watch/:providerId/:episodeId',
      extensions: '/extensions',
      streamProxy: '/api/stream-proxy?url=:m3u8Url',
    },
    activeProviders: providers.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      isAuthorized: p.isAuthorized,
    })),
    documentation: 'https://github.com/taze-app/taze-api',
  };

  return sendSuccess(res, manifest, start);
});

/**
 * GET /search — Anime search via AniList GraphQL
 */
apiRouter.get('/search', async (req: Request, res: Response) => {
  const start = Date.now();
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const page = parseInt(req.query.page as string, 10) || 1;
  const perPage = Math.min(parseInt(req.query.perPage as string, 10) || 20, 50);
  const genre = req.query.genre as string | undefined;
  const season = req.query.season as string | undefined;
  const seasonYear = req.query.seasonYear ? parseInt(req.query.seasonYear as string, 10) : undefined;
  const format = req.query.format as string | undefined;

  try {
    const result = await aniListClient.searchAnime({
      query,
      page,
      perPage,
      genre,
      season,
      seasonYear,
      format,
    });

    return sendSuccess(res, result.results, start, {
      page: result.pageInfo.currentPage,
      total: result.pageInfo.total,
      hasNextPage: result.pageInfo.hasNextPage,
    });
  } catch (err: unknown) {
    return sendError(res, 500, 'SEARCH_ERROR', err instanceof Error ? err.message : 'Search failed');
  }
});

/**
 * GET /anime/:id — Detailed anime metadata
 */
apiRouter.get('/anime/:id', async (req: Request, res: Response) => {
  const start = Date.now();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) {
    return sendError(res, 400, 'INVALID_ID', 'Anime ID must be a valid positive integer');
  }

  try {
    const anime = await aniListClient.getAnimeDetails(id);
    if (!anime) {
      return sendError(res, 404, 'ANIME_NOT_FOUND', `Anime with ID ${id} was not found on AniList`);
    }

    return sendSuccess(res, anime, start);
  } catch (err: unknown) {
    return sendError(res, 500, 'METADATA_FETCH_ERROR', err instanceof Error ? err.message : 'Failed to retrieve metadata');
  }
});

/**
 * GET /map/:anilistId — External ID mapping & provider matching
 */
apiRouter.get('/map/:anilistId', async (req: Request, res: Response) => {
  const start = Date.now();
  const anilistId = parseInt(req.params.anilistId, 10);

  if (isNaN(anilistId) || anilistId <= 0) {
    return sendError(res, 400, 'INVALID_ID', 'AniList ID must be a valid positive integer');
  }

  try {
    const mapping = await idMapper.mapAniListId(anilistId);
    return sendSuccess(res, mapping, start);
  } catch (err: unknown) {
    return sendError(res, 404, 'MAPPING_NOT_FOUND', err instanceof Error ? err.message : 'ID mapping failed');
  }
});

/**
 * GET /episodes/:anilistId — Episode discovery across registered providers
 */
apiRouter.get('/episodes/:anilistId', async (req: Request, res: Response) => {
  const start = Date.now();
  const anilistId = parseInt(req.params.anilistId, 10);
  const preferredProvider = req.query.provider as string | undefined;

  if (isNaN(anilistId) || anilistId <= 0) {
    return sendError(res, 400, 'INVALID_ID', 'AniList ID must be a valid positive integer');
  }

  try {
    // Check if ID mapping provides providerAnimeId
    let providerAnimeId: string | undefined;
    try {
      const mapping = await idMapper.mapAniListId(anilistId);
      if (preferredProvider && mapping.providerMatches?.[preferredProvider]) {
        providerAnimeId = mapping.providerMatches[preferredProvider].providerAnimeId;
      }
    } catch {
      // Continue without mapped provider anime id
    }

    const discovery = await providerRegistry.discoverEpisodes(anilistId, preferredProvider, providerAnimeId);

    return sendSuccess(res, discovery.episodes, start, {
      total: discovery.episodes.length,
      activeProvider: discovery.activeProvider,
      fallbackUsed: discovery.fallbackUsed,
      attemptedProviders: discovery.attemptedProviders,
    });
  } catch (err: unknown) {
    return sendError(res, 500, 'EPISODE_DISCOVERY_ERROR', err instanceof Error ? err.message : 'Episode discovery failed');
  }
});

/**
 * GET /schedule — Normalized release schedule for client countdowns
 */
apiRouter.get('/schedule', async (req: Request, res: Response) => {
  const start = Date.now();
  const page = parseInt(req.query.page as string, 10) || 1;
  const perPage = Math.min(parseInt(req.query.perPage as string, 10) || 25, 50);
  const notYetAired = req.query.notYetAired !== 'false';

  try {
    const result = await aniListClient.getAiringSchedule(page, perPage, notYetAired);

    return sendSuccess(res, result.schedule, start, {
      page: result.pageInfo.currentPage,
      total: result.pageInfo.total,
      hasNextPage: result.pageInfo.hasNextPage,
      serverTimeUnix: Math.floor(Date.now() / 1000),
      timezone: 'UTC',
    });
  } catch (err: unknown) {
    return sendError(res, 500, 'SCHEDULE_ERROR', err instanceof Error ? err.message : 'Schedule query failed');
  }
});

/**
 * GET /providers — Registered providers list and capabilities
 */
apiRouter.get('/providers', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const providers = await providerRegistry.listProviders();
    return sendSuccess(res, providers, start);
  } catch (err: unknown) {
    return sendError(res, 500, 'PROVIDER_LIST_ERROR', err instanceof Error ? err.message : 'Failed to query providers');
  }
});

/**
 * GET /providers/:providerId — Specific provider details & capability
 */
apiRouter.get('/providers/:providerId', async (req: Request, res: Response) => {
  const start = Date.now();
  const { providerId } = req.params;
  const provider = providerRegistry.get(providerId);

  if (!provider) {
    return sendError(res, 404, 'PROVIDER_NOT_FOUND', `Provider '${providerId}' is not registered`);
  }

  try {
    const meta = await provider.getMetadata();
    return sendSuccess(res, meta, start);
  } catch (err: unknown) {
    return sendError(res, 500, 'PROVIDER_INFO_ERROR', err instanceof Error ? err.message : 'Failed to get provider metadata');
  }
});

/**
 * GET /watch/:providerId/:episodeId — Playback source resolution
 */
apiRouter.get('/watch/:providerId/:episodeId', async (req: Request, res: Response) => {
  const start = Date.now();
  const { providerId, episodeId } = req.params;
  const anilistId = parseInt(req.query.anilistId as string, 10) || 0;

  try {
    const playback = await providerRegistry.resolvePlayback(providerId, episodeId, anilistId);

    // Return the Playback API Contract structure requested in specification
    return res.status(playback.success ? 200 : 502).json({
      ...playback,
      meta: {
        timestamp: Date.now(),
        executionTimeMs: Date.now() - start,
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      animeId: anilistId,
      episode: { id: episodeId, number: 1 },
      provider: { id: providerId, name: providerId },
      sources: [],
      subtitles: [],
      audioTracks: [],
      error: err instanceof Error ? err.message : 'Internal playback resolution failure',
    });
  }
});

/**
 * GET /extensions — Registered extensions catalog
 */
apiRouter.get('/extensions', (req: Request, res: Response) => {
  const start = Date.now();
  const extensions = extensionManager.listExtensions();
  return sendSuccess(res, extensions, start);
});

/**
 * GET /extensions/:extensionId — Single extension details
 */
apiRouter.get('/extensions/:extensionId', (req: Request, res: Response) => {
  const start = Date.now();
  const ext = extensionManager.getExtension(req.params.extensionId);

  if (!ext) {
    return sendError(res, 404, 'EXTENSION_NOT_FOUND', `Extension '${req.params.extensionId}' not found`);
  }

  return sendSuccess(res, ext, start);
});

/**
 * POST /extensions/install — Install/register new extension manifest
 */
apiRouter.post('/extensions/install', (req: Request, res: Response) => {
  const start = Date.now();
  const manifest = req.body;

  // Authorization check
  const adminKey = req.headers['x-taze-admin-key'];
  const expectedKey = process.env.TAZE_ADMIN_KEY || 'taze-dev-secret';

  if (process.env.NODE_ENV === 'production' && adminKey !== expectedKey) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or missing x-taze-admin-key header');
  }

  try {
    const result = extensionManager.installExtension(manifest);
    return sendSuccess(res, result, start);
  } catch (err: unknown) {
    return sendError(res, 400, 'INSTALL_FAILED', err instanceof Error ? err.message : 'Extension install failed');
  }
});

/**
 * POST /extensions/:extensionId/toggle — Toggle enable/disable
 */
apiRouter.post('/extensions/:extensionId/toggle', (req: Request, res: Response) => {
  const start = Date.now();
  const { extensionId } = req.params;
  const enabled = req.body.enabled === true;

  try {
    const updated = extensionManager.toggleExtension(extensionId, enabled);
    return sendSuccess(res, updated, start);
  } catch (err: unknown) {
    return sendError(res, 404, 'TOGGLE_FAILED', err instanceof Error ? err.message : 'Extension toggle failed');
  }
});

/**
 * DELETE /extensions/:extensionId — Remove extension
 */
apiRouter.delete('/extensions/:extensionId', (req: Request, res: Response) => {
  const start = Date.now();
  const { extensionId } = req.params;

  try {
    const removed = extensionManager.removeExtension(extensionId);
    if (!removed) {
      return sendError(res, 404, 'NOT_FOUND', `Extension ${extensionId} not found`);
    }
    return sendSuccess(res, { removed: true, extensionId }, start);
  } catch (err: unknown) {
    return sendError(res, 400, 'DELETE_FAILED', err instanceof Error ? err.message : 'Failed to delete extension');
  }
});

/**
 * GET /api/stream-proxy — CORS Media Proxy
 * Allows in-browser test player to bypass third-party CORS header restrictions
 */
apiRouter.get('/api/stream-proxy', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    return res.status(400).send('Missing ?url= parameter');
  }

  try {
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    if (req.query.referer) {
      fetchHeaders['Referer'] = req.query.referer as string;
    }

    const upstreamRes = await fetch(targetUrl, { headers: fetchHeaders });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    if (!upstreamRes.body) {
      return res.status(upstreamRes.status).send('Empty upstream body');
    }

    // Stream response
    const arrayBuffer = await upstreamRes.arrayBuffer();
    return res.status(upstreamRes.status).send(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
    return res.status(502).send(err instanceof Error ? err.message : 'Stream proxy error');
  }
});
