# TAZE API — High-Performance Anime Backend Engine

A complete, production-oriented anime backend service engineered from scratch for the **TAZE** streaming ecosystem and Android application.

Built with **Node.js, Express, TypeScript, AniList GraphQL, HLS.js, and a modular streaming provider & extension architecture**.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Automated Verification Tests
```bash
npm test
```
All 19 tests across AniList GraphQL, ID Mapping, Episode Deduplication, Playback Schema, and Extractors will execute and validate.

### 3. Start Development Server
```bash
npm run dev
```
Dev server starts at `http://localhost:3000`.

### 4. Build & Production Start
```bash
npm run build
npm start
```

---

## 🚀 Key Architectural Subsystems

### 1. AniList GraphQL Metadata Engine (`src/api/anilist/`)
- Direct integration with `https://graphql.anilist.co`.
- Full query support: Title search, English/Romaji/Native titles, Synopsis, Episodes, Format, Seasons, Studios, Rankings, Relations, External Links.
- Built-in rate-limit resilience: Monitors `x-ratelimit-remaining` and handles HTTP 429 with exponential backoff.
- In-memory cache layer (`24h` TTL for metadata).

### 2. Anime ID Mapping & Ambiguity Detection (`src/api/mapping/`)
- Connects AniList IDs to MyAnimeList, AniDB, Kitsu, TMDB, TVDB, and provider-specific slugs.
- Title normalizer strips season tags, punctuation, and audio tags (`[TV]`, `(Dub)`).
- Sorensen-Dice bigram coefficient with season mismatch penalization.
- Rejects matches with confidence `< 0.65` or close candidate ties to prevent playing the wrong anime.

### 3. Episode Discovery & Deduplication (`src/api/providers/`)
- Uniform episode contract: `id`, `animeId`, `providerId`, `providerEpisodeId`, `number`, `title`, `thumbnail`, `hasSub`, `hasDub`.
- Automatic deduplication and strict ascending chronological sorting.
- Bounded concurrency with 7s timeout: if a community provider times out or blocks datacenter IPs, cascades safely to next provider without hanging.

### 4. Release Schedule & Countdown (`/schedule`)
- Normalized Unix timestamps (`airingAt`) and ISO-8601 strings (`airingAtIso`).
- Returns remaining seconds for accurate **client-side countdown calculation** in the TAZE Android app, eliminating unnecessary polling.

### 5. Playback Contract & Video Extractor Pipeline (`src/api/extractors/`)
- Resolves playable HLS (`.m3u8`), MPEG-DASH (`.mpd`), and direct MP4 streams.
- Master playlist parser extracts quality variants (`1080p`, `720p`, `480p`, `360p`), WebVTT subtitle tracks, and audio groups.
- `AuthorizedDemoProvider`: 100% verified, license-compliant multi-resolution HLS streams with multi-language WebVTT subtitles and multi-audio tracks for guaranteed player verification.
- `MegaCloudExtractor` & `DirectMediaExtractor` for candidate embeds.

### 6. Modular Extension Registry (`src/api/extensions/`)
- Inspired by Anisurge / Tachiyomi extension specifications.
- Validates manifests (semver, `minApiVersion`, permissions, provider IDs).
- Supports runtime enable/disable and secure isolation.

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health, memory footprint, cache stats, uptime |
| `GET` | `/` | API Information, active providers, and endpoints manifest |
| `GET` | `/search?query=:title` | Search anime via AniList GraphQL with pagination |
| `GET` | `/anime/:id` | Full anime details, relations, external links, synopsis |
| `GET` | `/map/:anilistId` | External ID mapping (MAL, AniDB, Kitsu) and provider slugs |
| `GET` | `/episodes/:anilistId` | Episode discovery with provider fallback |
| `GET` | `/schedule` | Airing schedule with Unix timestamps for client countdowns |
| `GET` | `/providers` | Registered providers, capabilities, and latency status |
| `GET` | `/providers/:providerId` | Single provider capability inspection |
| `GET` | `/watch/:providerId/:episodeId` | Playback source resolution adhering to Playback Contract |
| `GET` | `/extensions` | Registered extension catalog |
| `GET` | `/extensions/:extensionId` | Extension details and manifest |
| `POST` | `/extensions/install` | Install extension manifest (`x-taze-admin-key` protected) |
| `POST` | `/extensions/:extensionId/toggle` | Enable or disable extension |
| `DELETE`| `/extensions/:extensionId` | Remove extension |
| `GET` | `/api/stream-proxy?url=...` | CORS proxy for in-browser HLS stream playback |

---

## 📱 TAZE Android Integration

### 1. Retrofit Service Definition (Kotlin)
```kotlin
package com.taze.app.api

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface TazeApiService {
    @GET("search")
    suspend fun searchAnime(@Query("query") query: String): ApiResponse<List<AnimeMetadata>>

    @GET("map/{anilistId}")
    suspend fun getMapping(@Path("anilistId") anilistId: Int): ApiResponse<ExternalIdMapping>

    @GET("episodes/{anilistId}")
    suspend fun getEpisodes(
        @Path("anilistId") anilistId: Int,
        @Query("provider") provider: String? = null
    ): ApiResponse<List<EpisodeItem>>

    @GET("schedule")
    suspend fun getSchedule(): ApiResponse<List<ScheduleItem>>

    @GET("watch/{providerId}/{episodeId}")
    suspend fun resolvePlayback(
        @Path("providerId") providerId: String,
        @Path("episodeId") episodeId: String,
        @Query("anilistId") anilistId: Int? = null
    ): PlaybackContractResponse
}
```

### 2. ExoPlayer Playback Setup (Kotlin)
```kotlin
val mediaItem = MediaItem.Builder()
    .setUri(primarySource.url)
    .setMimeType(if (primarySource.type == "hls") MimeTypes.APPLICATION_M3U8 else MimeTypes.VIDEO_MP4)
    .build()

val dataSourceFactory = DefaultHttpDataSource.Factory().apply {
    primarySource.headers?.forEach { (k, v) -> setDefaultRequestProperty(k, v) }
}

val mediaSource = HlsMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
exoPlayer.setMediaSource(mediaSource)
exoPlayer.prepare()
exoPlayer.play()
```

---

## 🔒 Security & Performance Guidelines
- **Zero Secrets in Code**: Configuration loaded via environment variables (`.env`).
- **No Stack Traces**: Production error responses return structured codes (`SEARCH_ERROR`, `MAPPING_NOT_FOUND`, etc.).
- **Bounded Concurrency**: Providers are wrapped with strict timeouts to prevent upstream hanging.
- **LRU Cache Store**: Bounded to 5,000 entries with automatic expired key purges.
