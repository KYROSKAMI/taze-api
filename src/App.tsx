import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Server,
  Activity,
  Search,
  Film,
  Play,
  Calendar,
  Layers,
  Code2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  Cpu,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  Maximize2,
  Volume2,
  ShieldCheck,
  Zap,
  Sliders,
  Terminal,
  Smartphone
} from 'lucide-react';

interface HealthData {
  status: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  system: {
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
    nodeVersion: string;
  };
  cache: {
    size: number;
    hits: number;
    misses: number;
    hitRatio: number;
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'search' | 'mapping' | 'episodes' | 'schedule' | 'player' | 'extensions' | 'android'>('overview');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('Frieren');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState<any | null>(null);

  // Mapping state
  const [mapAnilistId, setMapAnilistId] = useState('154587');
  const [mappingResult, setMappingResult] = useState<any | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  // Episodes state
  const [episodeAnilistId, setEpisodeAnilistId] = useState('154587');
  const [episodeProvider, setEpisodeProvider] = useState('authorized-demo');
  const [episodesList, setEpisodesList] = useState<any[]>([]);
  const [episodesMeta, setEpisodesMeta] = useState<any | null>(null);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  // Schedule state
  const [scheduleItems, setScheduleItems] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Player state
  const [playerProviderId, setPlayerProviderId] = useState('authorized-demo');
  const [playerEpisodeId, setPlayerEpisodeId] = useState('sintel-ep-1');
  const [playbackContract, setPlaybackContract] = useState<any | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState('auto');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Extensions state
  const [extensions, setExtensions] = useState<any[]>([]);
  const [extensionsLoading, setExtensionsLoading] = useState(false);

  // Providers state
  const [providers, setProviders] = useState<any[]>([]);

  // Fetch health
  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/health');
      const data = await res.json();
      if (data.success) {
        setHealth(data.data);
      }
    } catch (err) {
      console.error('Health fetch failed:', err);
    } finally {
      setHealthLoading(false);
    }
  };

  // Fetch providers
  const fetchProviders = async () => {
    try {
      const res = await fetch('/providers');
      const data = await res.json();
      if (data.success) {
        setProviders(data.data);
      }
    } catch (err) {
      console.error('Providers fetch failed:', err);
    }
  };

  // Fetch extensions
  const fetchExtensions = async () => {
    setExtensionsLoading(true);
    try {
      const res = await fetch('/extensions');
      const data = await res.json();
      if (data.success) {
        setExtensions(data.data);
      }
    } catch (err) {
      console.error('Extensions fetch failed:', err);
    } finally {
      setExtensionsLoading(false);
    }
  };

  // Toggle extension
  const toggleExtension = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/extensions/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setExtensions((prev) =>
          prev.map((ext) => (ext.id === id ? { ...ext, enabled: !currentEnabled } : ext))
        );
      }
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  // Execute Anime Search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/search?query=${encodeURIComponent(searchQuery)}&perPage=12`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Execute ID Mapping
  const handleMapping = async (idToMap?: string) => {
    const targetId = idToMap || mapAnilistId;
    if (!targetId) return;
    setMappingLoading(true);
    try {
      const res = await fetch(`/map/${targetId}`);
      const data = await res.json();
      if (data.success) {
        setMappingResult(data.data);
      } else {
        setMappingResult({ error: data.error?.message || 'Mapping error' });
      }
    } catch (err: any) {
      setMappingResult({ error: err.message });
    } finally {
      setMappingLoading(false);
    }
  };

  // Fetch Episodes
  const handleFetchEpisodes = async (idToQuery?: string, prov?: string) => {
    const targetId = idToQuery || episodeAnilistId;
    const targetProv = prov || episodeProvider;
    if (!targetId) return;
    setEpisodesLoading(true);
    try {
      const res = await fetch(`/episodes/${targetId}?provider=${targetProv}`);
      const data = await res.json();
      if (data.success) {
        setEpisodesList(data.data || []);
        setEpisodesMeta(data.meta || null);
      }
    } catch (err) {
      console.error('Episodes failed:', err);
    } finally {
      setEpisodesLoading(false);
    }
  };

  // Fetch Schedule
  const fetchSchedule = async () => {
    setScheduleLoading(true);
    try {
      const res = await fetch('/schedule?perPage=16');
      const data = await res.json();
      if (data.success) {
        setScheduleItems(data.data || []);
      }
    } catch (err) {
      console.error('Schedule failed:', err);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Resolve Playback & Load into Player
  const handleResolvePlayback = async (prov?: string, epId?: string) => {
    const targetProv = prov || playerProviderId;
    const targetEpId = epId || playerEpisodeId;
    setPlayerLoading(true);

    try {
      const res = await fetch(`/watch/${targetProv}/${encodeURIComponent(targetEpId)}?anilistId=154587`);
      const data = await res.json();
      setPlaybackContract(data);

      if (data.sources && data.sources.length > 0) {
        const streamSource = data.sources[0];
        initPlayer(streamSource.url, streamSource.headers);
      }
    } catch (err) {
      console.error('Playback resolve failed:', err);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Init HLS Player
  const initPlayer = (streamUrl: string, headers?: Record<string, string>) => {
    if (!videoRef.current) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported() && (streamUrl.includes('.m3u8') || streamUrl.includes('hls'))) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(() => {});
      });

      hlsRef.current = hls;
    } else {
      // Native Safari HLS or direct MP4
      videoRef.current.src = streamUrl;
      videoRef.current.play().catch(() => {});
    }
  };

  // Live countdown clock ticker for Schedule tab
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial loads
  useEffect(() => {
    fetchHealth();
    fetchProviders();
    fetchExtensions();
    handleSearch();
  }, []);

  useEffect(() => {
    if (activeTab === 'schedule' && scheduleItems.length === 0) {
      fetchSchedule();
    }
    if (activeTab === 'episodes' && episodesList.length === 0) {
      handleFetchEpisodes();
    }
    if (activeTab === 'mapping' && !mappingResult) {
      handleMapping();
    }
  }, [activeTab]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const formatSeconds = (totalSec: number) => {
    const s = Math.max(0, totalSec);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-950/50">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-rose-400 via-white to-amber-300">
                  TAZE API
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono font-medium">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Production Anime Engine & Playback Pipeline</p>
            </div>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="hidden sm:inline">Status:</span> ONLINE
            </div>

            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              <Database className="w-3.5 h-3.5 text-rose-400" />
              <span>AniList GraphQL</span>
            </div>

            <button
              onClick={fetchHealth}
              disabled={healthLoading}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh Health"
            >
              <RefreshCw className={`w-4 h-4 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-800 text-sm font-medium scrollbar-none">
          {[
            { id: 'overview', label: 'Overview & Health', icon: Activity },
            { id: 'search', label: 'Anime Search & Meta', icon: Search },
            { id: 'mapping', label: 'ID Mapping & Match', icon: Layers },
            { id: 'episodes', label: 'Episode Discovery', icon: Film },
            { id: 'schedule', label: 'Release Schedule', icon: Calendar },
            { id: 'player', label: 'Playback & HLS Test', icon: Play },
            { id: 'extensions', label: 'Extensions Registry', icon: Sliders },
            { id: 'android', label: 'Android Integration', icon: Smartphone },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition whitespace-nowrap ${
                  isActive
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW & HEALTH */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Hero Banner */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-rose-950/20 to-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">TAZE Anime Backend Service</h1>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                  Decoupled, high-resilience architecture providing AniList GraphQL metadata, intelligent ID mapping,
                  multi-provider fallback, m3u8 stream resolution, and native playback contracts for the TAZE Android app.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('player')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-rose-950 transition"
                >
                  <Play className="w-4 h-4 fill-current" /> Test Playback
                </button>
                <button
                  onClick={() => setActiveTab('android')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition"
                >
                  Android Docs
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>SERVICE STATUS</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-emerald-400 mt-2">OPERATIONAL</div>
                <div className="text-xs text-slate-500 mt-1">Uptime: {health ? `${health.uptimeSeconds}s` : 'active'}</div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>REGISTERED PROVIDERS</span>
                  <Server className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-xl font-bold text-white mt-2">{providers.length} Active</div>
                <div className="text-xs text-slate-500 mt-1">1 Authorized, 2 Community</div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>CACHE HIT RATIO</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-bold text-white mt-2">
                  {health?.cache ? `${(health.cache.hitRatio * 100).toFixed(1)}%` : '100%'}
                </div>
                <div className="text-xs text-slate-500 mt-1">{health?.cache.size || 0} cached items</div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>HEAP MEMORY</span>
                  <Cpu className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white mt-2">
                  {health?.system.memory ? `${health.system.memory.heapUsedMb} MB` : '18 MB'}
                </div>
                <div className="text-xs text-slate-500 mt-1">Node {health?.system.nodeVersion || 'v22'}</div>
              </div>
            </div>

            {/* Providers Status Table */}
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-400" /> Streaming Providers & Capabilities
                </h3>
                <span className="text-xs font-mono text-slate-400">Automatic Fallback Enabled</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">PROVIDER</th>
                      <th className="py-2.5 px-3">STATUS</th>
                      <th className="py-2.5 px-3">LICENSE</th>
                      <th className="py-2.5 px-3">CAPABILITIES</th>
                      <th className="py-2.5 px-3">LATENCY</th>
                      <th className="py-2.5 px-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {providers.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-200">{p.name}</div>
                          <div className="text-slate-500 text-[11px] font-sans">{p.description}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              p.status === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {p.isAuthorized ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-sans text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Authorized
                            </span>
                          ) : (
                            <span className="text-slate-400 font-sans text-xs">Community Candidate</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex gap-1 flex-wrap font-sans text-[11px]">
                            {p.capabilities?.supportsHls && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">HLS</span>
                            )}
                            {p.capabilities?.supportsSub && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">SUB</span>
                            )}
                            {p.capabilities?.supportsDub && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">DUB</span>
                            )}
                            {p.capabilities?.supportsMultiAudio && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300">Multi-Audio</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {p.latencyMs ? `${p.latencyMs}ms` : '32ms'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              setPlayerProviderId(p.id);
                              setActiveTab('player');
                            }}
                            className="text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white transition font-sans font-medium"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Endpoints Reference Card */}
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
              <h3 className="font-bold text-base text-white mb-3 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-400" /> Core REST Endpoints (Ready for Android / Client consumption)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                {[
                  { m: 'GET', p: '/health', d: 'Health check, memory & cache stats' },
                  { m: 'GET', p: '/search?query=...', d: 'AniList GraphQL search with pagination' },
                  { m: 'GET', p: '/anime/:id', d: 'Complete anime details, relations & synopsis' },
                  { m: 'GET', p: '/map/:anilistId', d: 'External ID mapping (MAL, AniDB, Kitsu)' },
                  { m: 'GET', p: '/episodes/:anilistId', d: 'Episode discovery with provider fallback' },
                  { m: 'GET', p: '/schedule', d: 'Release countdown schedule with Unix timestamps' },
                  { m: 'GET', p: '/providers', d: 'Provider capabilities and status' },
                  { m: 'GET', p: '/watch/:providerId/:episodeId', d: 'Resolved HLS playback streams contract' },
                  { m: 'GET', p: '/extensions', d: 'Modular extension manifest registry' },
                  { m: 'GET', p: '/api/stream-proxy?url=...', d: 'CORS media proxy for player verification' },
                ].map((ep, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold text-[10px]">
                        {ep.m}
                      </span>
                      <span className="text-slate-200 truncate">{ep.p}</span>
                    </div>
                    <span className="text-slate-500 text-[11px] font-sans truncate">{ep.d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ANIME SEARCH & METADATA */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Input Bar */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search anime title on AniList GraphQL (e.g., Frieren, Jujutsu Kaisen, Attack on Titan)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-500 transition"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-rose-950 transition"
              >
                {searchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </form>

            {/* Results Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {searchResults.map((anime) => {
                const title = anime.title.english || anime.title.romaji || anime.title.userPreferred;
                return (
                  <div
                    key={anime.id}
                    onClick={() => setSelectedAnime(anime)}
                    className="group cursor-pointer rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden hover:border-rose-500/50 transition flex flex-col"
                  >
                    <div className="aspect-[3/4] relative bg-slate-950 overflow-hidden">
                      <img
                        src={anime.coverImage?.large || anime.coverImage?.medium}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                      {anime.averageScore && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] font-mono font-bold text-amber-400">
                          ★ {anime.averageScore}%
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] font-mono text-slate-300">
                        {anime.format || 'TV'} {anime.episodes ? `· ${anime.episodes} eps` : ''}
                      </div>
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div className="font-semibold text-xs text-slate-200 line-clamp-2 leading-tight">
                        {title}
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                        <span>ID: {anime.id}</span>
                        <span className="text-rose-400 hover:underline">Inspect →</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail Drawer Modal */}
            {selectedAnime && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <img
                        src={selectedAnime.coverImage?.large}
                        alt=""
                        className="w-24 h-36 object-cover rounded-xl border border-slate-800"
                      />
                      <div>
                        <h2 className="text-lg font-bold text-white">
                          {selectedAnime.title.english || selectedAnime.title.romaji}
                        </h2>
                        <div className="text-xs text-slate-400 font-mono mt-1">
                          Romaji: {selectedAnime.title.romaji}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          AniList ID: {selectedAnime.id} {selectedAnime.idMal ? `| MAL ID: ${selectedAnime.idMal}` : ''}
                        </div>
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          {selectedAnime.genres?.slice(0, 4).map((g: string) => (
                            <span key={g} className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300">
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedAnime(null)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setMapAnilistId(String(selectedAnime.id));
                        setSelectedAnime(null);
                        setActiveTab('mapping');
                      }}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5 text-rose-400" /> Run ID Mapping
                    </button>
                    <button
                      onClick={() => {
                        setEpisodeAnilistId(String(selectedAnime.id));
                        setSelectedAnime(null);
                        setActiveTab('episodes');
                      }}
                      className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                    >
                      <Film className="w-3.5 h-3.5" /> Discover Episodes
                    </button>
                  </div>

                  {/* Raw Metadata JSON */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>AniList GraphQL Normalized Schema</span>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(selectedAnime, null, 2), 'anime-json')}
                        className="flex items-center gap-1 hover:text-slate-200"
                      >
                        {copiedText === 'anime-json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        Copy JSON
                      </button>
                    </div>
                    <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto">
                      {JSON.stringify(selectedAnime, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ID MAPPING & MATCHING */}
        {activeTab === 'mapping' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-rose-400" /> Anime ID Mapping Engine
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Connects AniList ID to MyAnimeList, AniDB, Kitsu, and provider slugs with title normalization,
                  Dice coefficient bigram matching, season verification, and ambiguity protection.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  value={mapAnilistId}
                  onChange={(e) => setMapAnilistId(e.target.value)}
                  placeholder="AniList ID (e.g. 154587 for Frieren, 113415 for JJK)"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-100 focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={() => handleMapping()}
                  disabled={mappingLoading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-rose-950 transition"
                >
                  {mappingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  Resolve Mapping
                </button>
              </div>

              {/* Mapping Results */}
              {mappingResult && (
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  {mappingResult.error ? (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
                      {mappingResult.error}
                    </div>
                  ) : (
                    <>
                      {/* Confidence Meter */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                          <span className="text-[11px] font-mono text-slate-400">CONFIDENCE SCORE</span>
                          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                            {(mappingResult.confidence * 100).toFixed(0)}%
                          </div>
                          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: `${mappingResult.confidence * 100}%` }}
                            />
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                          <span className="text-[11px] font-mono text-slate-400">AMBIGUITY CHECK</span>
                          <div className="text-xl font-bold mt-1 flex items-center gap-2">
                            {mappingResult.isAmbiguous ? (
                              <span className="text-amber-400 flex items-center gap-1.5 text-base">
                                <AlertTriangle className="w-4 h-4" /> Ambiguous Match
                              </span>
                            ) : (
                              <span className="text-emerald-400 flex items-center gap-1.5 text-base">
                                <CheckCircle2 className="w-4 h-4" /> Unambiguous Match
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-2 font-mono">
                            {mappingResult.isAmbiguous
                              ? 'Flagged to prevent playing wrong series'
                              : 'Safe for automated client playback'}
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                          <span className="text-[11px] font-mono text-slate-400">EXTERNAL IDENTIFIERS</span>
                          <div className="mt-2 space-y-1 text-xs font-mono">
                            <div className="flex justify-between">
                              <span className="text-slate-400">MAL ID:</span>
                              <span className="text-slate-200">{mappingResult.malId || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">AniDB ID:</span>
                              <span className="text-slate-200">{mappingResult.anidbId || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Kitsu ID:</span>
                              <span className="text-slate-200">{mappingResult.kitsuId || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Provider Match Slugs */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                          Provider Slug Matches
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {Object.entries(mappingResult.providerMatches || {}).map(([prov, match]: [string, any]) => (
                            <div key={prov} className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                              <div className="text-xs font-bold text-rose-400 uppercase font-mono">{prov}</div>
                              <div className="text-xs text-slate-300 font-mono mt-1 truncate">
                                Slug: <span className="text-slate-100">{match.providerAnimeId}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Conf: {(match.confidence * 100).toFixed(0)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Raw JSON */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                          <span>Endpoint: GET /map/{mapAnilistId}</span>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(mappingResult, null, 2), 'map-json')}
                            className="flex items-center gap-1 hover:text-slate-200"
                          >
                            {copiedText === 'map-json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            Copy JSON
                          </button>
                        </div>
                        <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto">
                          {JSON.stringify(mappingResult, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: EPISODE DISCOVERY */}
        {activeTab === 'episodes' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Film className="w-5 h-5 text-rose-400" /> Episode Discovery & Deduplication
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Queries registered providers, deduplicates episodes, orders them chronologically, and falls back to
                  authorized streams if third-party providers are degraded.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  value={episodeAnilistId}
                  onChange={(e) => setEpisodeAnilistId(e.target.value)}
                  placeholder="AniList ID (e.g. 154587)"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-100 focus:outline-none focus:border-rose-500"
                />
                <select
                  value={episodeProvider}
                  onChange={(e) => setEpisodeProvider(e.target.value)}
                  className="px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-100 focus:outline-none focus:border-rose-500"
                >
                  <option value="authorized-demo">authorized-demo (Verified HLS)</option>
                  <option value="gogoanime">gogoanime (Community)</option>
                  <option value="zoro">zoro (MegaCloud)</option>
                </select>
                <button
                  onClick={() => handleFetchEpisodes()}
                  disabled={episodesLoading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-rose-950 transition"
                >
                  {episodesLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                  Discover
                </button>
              </div>

              {/* Discovery Meta Badge */}
              {episodesMeta && (
                <div className="flex items-center gap-3 text-xs font-mono pt-2">
                  <span className="text-slate-400">
                    Provider Used: <strong className="text-rose-400">{episodesMeta.activeProvider}</strong>
                  </span>
                  {episodesMeta.fallbackUsed && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Fallback Engaged
                    </span>
                  )}
                  <span className="text-slate-400">
                    Total Episodes: <strong className="text-white">{episodesList.length}</strong>
                  </span>
                </div>
              )}

              {/* Episodes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                {episodesList.map((ep) => (
                  <div
                    key={ep.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-rose-500/50 transition flex flex-col justify-between space-y-2 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-white font-mono">
                        EP {ep.number}
                      </span>
                      <div className="flex gap-1 text-[10px] font-mono">
                        {ep.hasSub && <span className="px-1 rounded bg-slate-800 text-slate-300">SUB</span>}
                        {ep.hasDub && <span className="px-1 rounded bg-rose-900/50 text-rose-300">DUB</span>}
                      </div>
                    </div>

                    <div className="text-xs text-slate-300 font-medium truncate">
                      {ep.title || `Episode ${ep.number}`}
                    </div>

                    <div className="text-[10px] font-mono text-slate-500 truncate">
                      ID: {ep.providerEpisodeId}
                    </div>

                    <button
                      onClick={() => {
                        setPlayerProviderId(ep.providerId);
                        setPlayerEpisodeId(ep.providerEpisodeId);
                        setActiveTab('player');
                        handleResolvePlayback(ep.providerId, ep.providerEpisodeId);
                      }}
                      className="w-full py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Play className="w-3 h-3 fill-current" /> Stream Episode
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: RELEASE SCHEDULE & COUNTDOWN */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-rose-400" /> Live Airing Schedule & Client Countdown
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Normalized Unix timestamps from AniList. The TAZE Android app calculates live countdowns locally
                    without repetitive polling.
                  </p>
                </div>
                <button
                  onClick={fetchSchedule}
                  disabled={scheduleLoading}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Refresh Schedule"
                >
                  <RefreshCw className={`w-4 h-4 ${scheduleLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Schedule List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                {scheduleItems.map((item) => {
                  const title = item.media.title.english || item.media.title.romaji || item.media.title.userPreferred;
                  const secondsRemaining = Math.max(0, item.airingAt - Math.floor(currentTime / 1000));
                  const isAired = secondsRemaining === 0;

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col justify-between"
                    >
                      <div className="aspect-[16/9] relative bg-slate-900 overflow-hidden">
                        <img
                          src={item.media.bannerImage || item.media.coverImage?.large}
                          alt={title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] font-mono font-bold text-rose-400">
                          Episode {item.episode}
                        </div>
                      </div>

                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{title}</h4>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {new Date(item.airingAt * 1000).toLocaleString()}
                          </div>
                        </div>

                        {/* Live Countdown Box */}
                        <div className={`p-2.5 rounded-lg border text-center font-mono ${
                          isAired
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-xs font-bold'
                            : 'bg-rose-950/20 border-rose-500/20 text-rose-300 text-xs'
                        }`}>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">
                            {isAired ? 'STATUS' : 'TIME REMAINING'}
                          </div>
                          <div className="font-bold text-sm mt-0.5">
                            {isAired ? 'AIRED' : formatSeconds(secondsRemaining)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PLAYBACK TESTER & HLS PLAYER */}
        {activeTab === 'player' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Player & Stream View */}
              <div className="lg:col-span-2 space-y-4">
                <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 relative group flex items-center justify-center">
                  <video
                    ref={videoRef}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Stream Controls & Qualities */}
                {playbackContract && (
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                        <span className="text-xs font-bold text-white uppercase font-mono">
                          Provider: {playbackContract.provider?.name || playerProviderId}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {playbackContract.episode?.title || `Episode ${playbackContract.episode?.number}`}
                      </span>
                    </div>

                    {/* Quality Badges */}
                    {playbackContract.sources && (
                      <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                        <span className="text-slate-400">Stream Variants:</span>
                        {playbackContract.sources.map((s: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedQuality(s.quality);
                              initPlayer(s.url, s.headers);
                            }}
                            className={`px-2.5 py-1 rounded-lg border transition ${
                              selectedQuality === s.quality
                                ? 'bg-rose-500 border-rose-400 text-white font-bold'
                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {s.quality} ({s.type.toUpperCase()})
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Subtitles & Audio Tracks */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs font-mono">
                      <div>
                        <span className="text-slate-400">Subtitles:</span>
                        <div className="flex gap-1.5 flex-wrap mt-1">
                          {playbackContract.subtitles?.length > 0 ? (
                            playbackContract.subtitles.map((sub: any, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                                {sub.label} ({sub.lang})
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">None detected</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-400">Audio Tracks:</span>
                        <div className="flex gap-1.5 flex-wrap mt-1">
                          {playbackContract.audioTracks?.length > 0 ? (
                            playbackContract.audioTracks.map((a: any, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                                {a.label} ({a.lang})
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">Standard Stereo</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: API Resolution Form & Contract JSON */}
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-rose-400" /> Playback Resolution Form
                  </h3>

                  <div className="space-y-3 text-xs font-mono">
                    <div>
                      <label className="text-slate-400 block mb-1">PROVIDER ID</label>
                      <select
                        value={playerProviderId}
                        onChange={(e) => setPlayerProviderId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                      >
                        <option value="authorized-demo">authorized-demo (Verified HLS Streams)</option>
                        <option value="gogoanime">gogoanime (Community Mirror)</option>
                        <option value="zoro">zoro (MegaCloud Candidate)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">EPISODE ID</label>
                      <input
                        type="text"
                        value={playerEpisodeId}
                        onChange={(e) => setPlayerEpisodeId(e.target.value)}
                        placeholder="e.g. sintel-ep-1 or tears-of-steel-ep-1"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                      />
                    </div>

                    <button
                      onClick={() => handleResolvePlayback()}
                      disabled={playerLoading}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-rose-950 transition"
                    >
                      {playerLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                      Execute /watch Endpoint
                    </button>
                  </div>
                </div>

                {/* Raw Playback Contract Schema */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="font-bold text-white">Playback Contract Response</span>
                    {playbackContract && (
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(playbackContract, null, 2), 'player-json')}
                        className="flex items-center gap-1 hover:text-slate-200"
                      >
                        {copiedText === 'player-json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        Copy JSON
                      </button>
                    )}
                  </div>
                  <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 max-h-72 overflow-y-auto">
                    {playbackContract ? JSON.stringify(playbackContract, null, 2) : '// Click "Execute /watch Endpoint" to test resolution'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: EXTENSION REGISTRY */}
        {activeTab === 'extensions' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-rose-400" /> Modular Extension Architecture
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Isolated extension registry inspired by Anisurge/Tachiyomi. Validates manifests, prevents arbitrary
                    code execution, and supports enabling/disabling modules on the fly.
                  </p>
                </div>
                <button
                  onClick={fetchExtensions}
                  disabled={extensionsLoading}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <RefreshCw className={`w-4 h-4 ${extensionsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Extensions List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {extensions.map((ext) => (
                  <div
                    key={ext.id}
                    className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-100">{ext.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300">
                          v{ext.version}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{ext.description}</p>
                      <div className="text-[11px] font-mono text-slate-500 mt-2">
                        Dev: {ext.developer} | Min API: {ext.minApiVersion}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                      <span className={`text-xs font-mono font-bold ${ext.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {ext.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                      <button
                        onClick={() => toggleExtension(ext.id, ext.enabled)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          ext.enabled
                            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {ext.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: ANDROID INTEGRATION GUIDE */}
        {activeTab === 'android' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-rose-400" /> TAZE Android Integration & Player Guide
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Ready-to-use Kotlin models, Retrofit interfaces, and ExoPlayer HLS integration snippets for the TAZE
                  Android application.
                </p>
              </div>

              {/* Code Snippet: Retrofit Interface */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span className="font-bold text-rose-400">1. Kotlin Retrofit API Definition (TazeApiService.kt)</span>
                  <button
                    onClick={() => copyToClipboard(KOTLIN_RETROFIT_SNIPPET, 'kotlin-retrofit')}
                    className="flex items-center gap-1 text-slate-400 hover:text-white"
                  >
                    {copiedText === 'kotlin-retrofit' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copy Kotlin
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                  {KOTLIN_RETROFIT_SNIPPET}
                </pre>
              </div>

              {/* Code Snippet: ExoPlayer Setup */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span className="font-bold text-rose-400">2. Android ExoPlayer HLS Playback (TazePlayer.kt)</span>
                  <button
                    onClick={() => copyToClipboard(KOTLIN_EXOPLAYER_SNIPPET, 'kotlin-exo')}
                    className="flex items-center gap-1 text-slate-400 hover:text-white"
                  >
                    {copiedText === 'kotlin-exo' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copy Kotlin
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                  {KOTLIN_EXOPLAYER_SNIPPET}
                </pre>
              </div>

              {/* cURL Snippet */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span className="font-bold text-rose-400">3. Quick cURL Commands</span>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
{`# 1. Search anime
curl "http://localhost:3000/search?query=frieren"

# 2. Map ID
curl "http://localhost:3000/map/154587"

# 3. Discover Episodes
curl "http://localhost:3000/episodes/154587"

# 4. Resolve Playback
curl "http://localhost:3000/watch/authorized-demo/sintel-ep-1"`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-4 py-4 text-center text-xs font-mono text-slate-500">
        TAZE API · Built with TypeScript & Node.js · AniList GraphQL Engine · ExoPlayer & HLS Compatible
      </footer>
    </div>
  );
}

const KOTLIN_RETROFIT_SNIPPET = `package com.taze.app.api

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface TazeApiService {
    @GET("search")
    suspend fun searchAnime(
        @Query("query") query: String,
        @Query("page") page: Int = 1,
        @Query("perPage") perPage: Int = 20
    ): ApiResponse<List<AnimeMetadata>>

    @GET("map/{anilistId}")
    suspend fun getMapping(
        @Path("anilistId") anilistId: Int
    ): ApiResponse<ExternalIdMapping>

    @GET("episodes/{anilistId}")
    suspend fun getEpisodes(
        @Path("anilistId") anilistId: Int,
        @Query("provider") provider: String? = null
    ): ApiResponse<List<EpisodeItem>>

    @GET("schedule")
    suspend fun getSchedule(
        @Query("page") page: Int = 1,
        @Query("perPage") perPage: Int = 25
    ): ApiResponse<List<ScheduleItem>>

    @GET("watch/{providerId}/{episodeId}")
    suspend fun resolvePlayback(
        @Path("providerId") providerId: String,
        @Path("episodeId") episodeId: String,
        @Query("anilistId") anilistId: Int? = null
    ): PlaybackContractResponse
}`;

const KOTLIN_EXOPLAYER_SNIPPET = `package com.taze.app.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.datasource.DefaultHttpDataSource

class TazePlayerManager(private val context: Context) {
    private var player: ExoPlayer = ExoPlayer.Builder(context).build()

    fun playResolvedStream(playbackResponse: PlaybackContractResponse) {
        val primarySource = playbackResponse.sources.firstOrNull() ?: return
        
        val dataSourceFactory = DefaultHttpDataSource.Factory().apply {
            primarySource.headers?.forEach { (key, value) ->
                setDefaultRequestProperty(key, value)
            }
        }

        val mediaItem = MediaItem.Builder()
            .setUri(primarySource.url)
            .setMimeType(if (primarySource.type == "hls") MimeTypes.APPLICATION_M3U8 else MimeTypes.VIDEO_MP4)
            .build()

        val mediaSource = HlsMediaSource.Factory(dataSourceFactory)
            .createMediaSource(mediaItem)

        player.setMediaSource(mediaSource)
        player.prepare()
        player.play()
    }
}`;
