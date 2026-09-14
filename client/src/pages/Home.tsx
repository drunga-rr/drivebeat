import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock3,
  Cloud,
  FileAudio,
  FolderOpen,
  Heart,
  Home as HomeIcon,
  ListPlus,
  ListMusic,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  Pause,
  Play,
  Plus,
  Repeat2,
  RefreshCw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocalAlbum, getLocalFolder, getLocalTrackTitle, isLocalMp3 } from "@shared/library";
import { readMp3Metadata } from "@shared/mp3Metadata";
import { clearStoredTracks, loadStoredTracks, LocalLibraryStorageError, saveStoredTracks, sortStoredTracks, StorageFailureCode, StoredLocalTrack } from "@/lib/localLibraryStore";
import { applyEqualizerGains, createEqualizerGraph } from "@/lib/audioEqualizer";
import { buildShuffleQueue, clampProgress, getNextPlaybackIndex, getNextTrackIndex, getPreviousHistoryId, reconcileShuffleQueue, seekAudio, toggleAudioPlayback } from "@shared/player";
import { EQUALIZER_FREQUENCIES, EQUALIZER_PRESETS, EqualizerPresetId, clampEqualizerGain, formatEqualizerFrequency, getEqualizerPreset, normalizeEqualizerBands } from "@shared/equalizer";
import { toast } from "sonner";

type Track = {
  id: string;
  order: number;
  title: string;
  artist: string;
  album: string;
  folder: string;
  duration: string;
  accent: string;
  src: string;
  fileName: string;
  coverUrl?: string;
  blob?: Blob;
  coverBlob?: Blob;
};

function revokeTrackUrls(track: Track) {
  if (track.src.startsWith("blob:")) URL.revokeObjectURL(track.src);
  if (track.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(track.coverUrl);
}

function toStoredTrack(track: Track): StoredLocalTrack {
  const { src: _src, coverUrl: _coverUrl, ...stored } = track;
  return {
    ...stored,
    blob: new Blob([track.blob ?? new Blob()], { type: track.blob?.type || "audio/mpeg" }),
    coverBlob: track.coverBlob ? new Blob([track.coverBlob], { type: track.coverBlob.type }) : undefined,
  };
}

const gradients = [
  "from-fuchsia-500 to-violet-950",
  "from-cyan-400 to-blue-950",
  "from-orange-400 to-rose-950",
  "from-emerald-400 to-teal-950",
  "from-amber-300 to-orange-950",
  "from-indigo-400 to-slate-950",
];

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

const EQUALIZER_STORAGE_KEY = "drivebeat-equalizer";
const FAVORITES_STORAGE_KEY = "drivebeat-favorites";
const PLAYLISTS_STORAGE_KEY = "drivebeat-playlists";

type Playlist = { id: string; name: string; trackIds: string[]; cover?: string; createdAt: number };

function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.trackIds)) : [];
  } catch { return []; }
}

function loadFavoriteIds() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}


function loadEqualizerPreferences() {
  const fallback = { enabled: true, preset: "flat" as EqualizerPresetId, bands: normalizeEqualizerBands(getEqualizerPreset("flat").gains) };
  try {
    const raw = localStorage.getItem(EQUALIZER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { enabled?: unknown; preset?: unknown; bands?: unknown };
    const preset = typeof parsed.preset === "string" && ["flat", "bass", "vocal", "rock", "classical", "electronic", "custom"].includes(parsed.preset) ? parsed.preset as EqualizerPresetId : fallback.preset;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : fallback.enabled,
      preset,
      bands: Array.isArray(parsed.bands) ? normalizeEqualizerBands(parsed.bands.filter((value): value is number => typeof value === "number")) : fallback.bands,
    };
  } catch {
    return fallback;
  }
}

export default function Home() {
  const { user, isAuthenticated, loading, error, logout } = useAuth();
  const [library, setLibrary] = useState<Track[]>([]);
  const localLibraryRef = useRef<Track[]>([]);
  const [cloudLibrary, setCloudLibrary] = useState<Track[]>([]);
  const [mode, setMode] = useState<"local" | "cloud">(() => {
    try { return localStorage.getItem("drivebeat-mode") === "cloud" ? "cloud" : "local"; } catch { return "local"; }
  });
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavoriteIds());
  const [shuffleEnabled, setShuffleEnabled] = useState(() => { try { return localStorage.getItem("drivebeat-shuffle") === "true"; } catch { return false; } });
  const [repeatEnabled, setRepeatEnabled] = useState(() => { try { return localStorage.getItem("drivebeat-repeat") === "true"; } catch { return false; } });
  const [equalizerOpen, setEqualizerOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("equalizer") === "1");
  const [equalizerEnabled, setEqualizerEnabled] = useState(() => loadEqualizerPreferences().enabled);
  const [equalizerPreset, setEqualizerPreset] = useState<EqualizerPresetId>(() => loadEqualizerPreferences().preset);
  const [equalizerBands, setEqualizerBands] = useState<number[]>(() => loadEqualizerPreferences().bands);
  const shuffleRef = useRef(shuffleEnabled);
  const repeatRef = useRef(repeatEnabled);
  const shuffleQueueRef = useRef<string[]>([]);
  const historyRef = useRef<string[]>([]);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("Início");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(76);
  const [isMuted, setIsMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(76);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const liked = Boolean(activeTrack && favoriteIds.includes(activeTrack.id));
  const [isImporting, setIsImporting] = useState(false);
  const [persistenceState, setPersistenceState] = useState<"restoring" | "saving" | "saved" | "idle" | StorageFailureCode>("restoring");
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadPlaylists());
  const [playlistFilter, setPlaylistFilter] = useState<string | null>(null);
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [playlistTargetTrack, setPlaylistTargetTrack] = useState<Track | null>(null);
  const [playlistTargetFolder, setPlaylistTargetFolder] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const loadGoogleLibrary = async () => {
    if (!isAuthenticated) return [];
    setGoogleSyncing(true);
    try {
      const response = await fetch("/api/google/library", { credentials: "include" });
      if (response.status === 401) { startLogin(); return []; }
      if (!response.ok) throw new Error("Falha ao carregar o Google Drive");
      const data = await response.json() as { files: Array<{ id: string; title: string; artist: string; album: string; folder: string; duration: string }> };
      const tracks = data.files.map((file, index) => ({
        id: `google:${file.id}`,
        order: index,
        title: file.title,
        artist: file.artist || "Google Drive",
        album: file.album || "Minha coleção",
        folder: file.folder || "Meu Google Drive",
        duration: file.duration || "—",
        accent: gradients[index % gradients.length],
        src: `/api/google/audio/${encodeURIComponent(file.id)}`,
        fileName: `${file.title}.mp3`,
      } satisfies Track));
      setCloudLibrary(tracks);
      if (mode === "cloud") {
        setLibrary(tracks);
        setActiveTrack(current => tracks.find(track => track.id === current?.id) || tracks[0] || null);
      }
      return tracks;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar o Google Drive.");
      return [];
    } finally {
      setGoogleSyncing(false);
    }
  };

  useEffect(() => {
    try { localStorage.setItem("drivebeat-mode", mode); } catch { /* preferência opcional */ }
    const nextLibrary = mode === "cloud" ? cloudLibrary : localLibraryRef.current;
    setLibrary(nextLibrary);
    setActiveTrack(current => nextLibrary.find(track => track.id === current?.id) || nextLibrary[0] || null);
  }, [mode, cloudLibrary]);

  useEffect(() => {
    if (!isAuthenticated || mode !== "cloud") return;
    void loadGoogleLibrary();
  }, [isAuthenticated, mode]);

  useEffect(() => { shuffleRef.current = shuffleEnabled; try { localStorage.setItem("drivebeat-shuffle", String(shuffleEnabled)); } catch { /* preferência opcional */ } }, [shuffleEnabled]);
  useEffect(() => { try { localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds)); } catch { /* preferência opcional */ } }, [favoriteIds]);
  useEffect(() => { try { localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists)); } catch { /* preferência opcional */ } }, [playlists]);
  useEffect(() => { repeatRef.current = repeatEnabled; try { localStorage.setItem("drivebeat-repeat", String(repeatEnabled)); } catch { /* preferência opcional */ } }, [repeatEnabled]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const equalizerFiltersRef = useRef<BiquadFilterNode[]>([]);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<Track[]>([]);

  const ensureAudioGraph = () => {
    const audio = audioRef.current;
    if (!audio || typeof window === "undefined") return null;
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      const context = new AudioContextConstructor();
      const graph = createEqualizerGraph(audio, context);
      audioContextRef.current = context;
      audioSourceRef.current = graph.source;
      equalizerFiltersRef.current = graph.filters;
      applyEqualizerGains(graph.filters, equalizerBands, equalizerEnabled);
      return context;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    applyEqualizerGains(equalizerFiltersRef.current, equalizerBands, equalizerEnabled);
    try {
      localStorage.setItem(EQUALIZER_STORAGE_KEY, JSON.stringify({ enabled: equalizerEnabled, preset: equalizerPreset, bands: normalizeEqualizerBands(equalizerBands) }));
    } catch { /* preferência opcional */ }
  }, [equalizerEnabled, equalizerPreset, equalizerBands]);

  useEffect(() => () => {
    audioContextRef.current?.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    let cancelled = false;
    void loadStoredTracks().then((storedTracks) => {
      if (cancelled) return;
      const restoredTracks = sortStoredTracks(storedTracks).map((track) => ({
        ...track,
        src: URL.createObjectURL(track.blob),
        coverUrl: track.coverBlob ? URL.createObjectURL(track.coverBlob) : undefined,
      }));
      localLibraryRef.current = restoredTracks;
      setLibrary(restoredTracks);
      if (restoredTracks[0]) setActiveTrack(restoredTracks[0]);
      setPersistenceState(restoredTracks.length ? "saved" : "idle");
    }).catch((error: unknown) => {
      if (cancelled) return;
      setPersistenceState(error instanceof LocalLibraryStorageError ? error.code : "unavailable");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      libraryRef.current.forEach(revokeTrackUrls);
    };
  }, []);

  const toggleMute = () => {
    setIsMuted((muted) => {
      if (muted) {
        setVolume(volumeBeforeMuteRef.current || 76);
        return false;
      }
      volumeBeforeMuteRef.current = volume || 76;
      return true;
    });
  };

  const visibleTracks = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const selectedPlaylist = playlistFilter ? playlists.find((playlist) => playlist.id === playlistFilter) : null;
    return library.filter((track) => {
      const belongsToFolder = !folderFilter || track.folder === folderFilter;
      const matchesSearch = !normalized || `${track.title} ${track.artist} ${track.album} ${track.folder}`.toLowerCase().includes(normalized);
      const matchesFavorites = activeNav !== "Favoritos" || favoriteIds.includes(track.id);
      const belongsToPlaylist = !selectedPlaylist || selectedPlaylist.trackIds.includes(track.id);
      return belongsToFolder && matchesSearch && matchesFavorites && belongsToPlaylist;
    });
  }, [activeNav, favoriteIds, library, query, folderFilter, playlistFilter, playlists]);

  const folders = useMemo(() => {
    const grouped = new Map<string, Track[]>();
    library.forEach((track) => grouped.set(track.folder, [...(grouped.get(track.folder) ?? []), track]));
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map(([name, folderTracks], index) => ({
        name,
        count: `${folderTracks.length} ${folderTracks.length === 1 ? "faixa" : "faixas"}`,
        accent: gradients[index % gradients.length],
        firstTrack: folderTracks[0],
      }));
  }, [library]);

  const albums = useMemo(() => {
    const grouped = new Map<string, Track[]>();
    library.forEach((track) => grouped.set(track.album, [...(grouped.get(track.album) ?? []), track]));
    return Array.from(grouped.entries()).map(([name, albumTracks], index) => ({
      name,
      count: `${albumTracks.length} ${albumTracks.length === 1 ? "faixa" : "faixas"}`,
      folder: albumTracks[0]?.folder ?? "Minha coleção",
      accent: gradients[(index + 2) % gradients.length],
    }));
  }, [library]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume / 100;
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    audio.src = activeTrack.src;
    audio.load();
    setProgress(0);
    setCurrentTime(0);
  }, [activeTrack?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    if (isPlaying) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
    }, [activeTrack, isPlaying]);
  useEffect(() => {
    const ids = visibleTracks.map((track) => track.id);
    if (shuffleRef.current) shuffleQueueRef.current = reconcileShuffleQueue(ids, activeTrack?.id ?? null, shuffleQueueRef.current);
    historyRef.current = historyRef.current.filter((id, index) => ids.includes(id) && historyRef.current.indexOf(id) === index);
  }, [visibleTracks, activeTrack?.id]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [activeTrack, library]);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) => isLocalMp3(file.name, file.type));
    if (selectedFiles.length === 0) {
      toast.error("Nenhum MP3 foi selecionado.");
      return;
    }
    setIsImporting(true);
    const imported = await Promise.all(selectedFiles.map(async (file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
      const folder = getLocalFolder(relativePath);
      const metadata = await readMp3Metadata(file);
      return {
        id: `${file.name}-${file.lastModified}-${file.size}`,
        order: Date.now() + selectedFiles.indexOf(file),
        title: metadata.title || getLocalTrackTitle(file.name),
        artist: metadata.artist || "Arquivo local",
        album: metadata.album || getLocalAlbum(file.name, folder),
        folder,
        duration: "—",
        accent: gradients[(library.length + selectedFiles.indexOf(file)) % gradients.length],
        src: URL.createObjectURL(file),
        fileName: file.name,
        coverUrl: metadata.coverUrl,
        blob: file,
        coverBlob: metadata.coverBlob,
      } satisfies Track;
    }));
    const existingIds = new Set(library.map((track) => track.id));
    const freshTracks = imported.filter((track) => {
      if (existingIds.has(track.id)) {
        revokeTrackUrls(track);
        return false;
      }
      existingIds.add(track.id);
      return true;
    });
    let didPersist = true;
    try {
      setPersistenceState("saving");
      await saveStoredTracks(freshTracks.map(toStoredTrack));
      setPersistenceState("saved");
    } catch (error: unknown) {
      didPersist = false;
      const code = error instanceof LocalLibraryStorageError ? error.code : "unknown";
      setPersistenceState(code);
      toast.error(code === "quota-exceeded" ? "Não há espaço suficiente para salvar a coleção." : "O navegador bloqueou o salvamento da coleção local.");
    }
    localLibraryRef.current = [...localLibraryRef.current, ...freshTracks];
    setLibrary(localLibraryRef.current);
    if (!activeTrack) setActiveTrack(freshTracks[0] ?? null);
    setIsImporting(false);
    if (didPersist) {
      toast.success(`${freshTracks.length} ${freshTracks.length === 1 ? "faixa adicionada" : "faixas adicionadas"}`, { description: freshTracks.length ? "Sua coleção foi salva neste navegador." : "Esses arquivos já estavam na coleção." });
    } else {
      toast.error(`${freshTracks.length} ${freshTracks.length === 1 ? "faixa carregada" : "faixas carregadas"}, mas não salvas`, { description: "A reprodução funciona nesta sessão; libere o armazenamento e importe novamente para persistir." });
    }
    event.target.value = "";
  };

  const selectTrack = (track: Track) => {
    const context = ensureAudioGraph();
    if (context?.state === "suspended") void context.resume();
    setActiveTrack(track);
    setIsPlaying(true);
    toast.success(`Tocando “${track.title}”`, { description: track.folder });
  };

  const togglePlay = () => {
    if (!activeTrack) {
      toast("Escolha uma faixa para começar a ouvir.");
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    const context = ensureAudioGraph();
    if (context?.state === "suspended") void context.resume();
    try {
      const nextState = toggleAudioPlayback(audio);
      setIsPlaying(nextState === "playing");
    } catch {
      toast.error("Não foi possível reproduzir este arquivo.");
    }
  };

  const selectRelativeTrack = (direction: 1 | -1) => {
    const queue = visibleTracks;
    if (queue.length === 0) return toast("Nenhuma faixa disponível nesta seleção.");
    const currentIndex = activeTrack ? queue.findIndex((track) => track.id === activeTrack.id) : -1;
    if (shuffleRef.current && direction === -1) {
      const previousId = getPreviousHistoryId(historyRef.current);
      if (previousId) {
        historyRef.current = historyRef.current.slice(0, -1);
        const previousTrack = queue.find((track) => track.id === previousId);
        if (previousTrack) return selectTrack(previousTrack);
      }
    }
    if (shuffleRef.current && direction === 1) {
      shuffleQueueRef.current = reconcileShuffleQueue(queue.map((track) => track.id), activeTrack?.id ?? null, shuffleQueueRef.current);
      const queueIndex = activeTrack ? shuffleQueueRef.current.indexOf(activeTrack.id) : -1;
      const nextId = shuffleQueueRef.current[(queueIndex + 1) % shuffleQueueRef.current.length];
      const nextTrack = queue.find((track) => track.id === nextId);
      if (activeTrack) historyRef.current = [...historyRef.current, activeTrack.id];
      if (nextTrack) return selectTrack(nextTrack);
    }
    const nextIndex = getNextTrackIndex(currentIndex < 0 ? 0 : currentIndex, queue.length, direction);
    selectTrack(queue[nextIndex]);
  };

  const toggleShuffle = () => {
    const next = !shuffleRef.current;
    shuffleRef.current = next;
    if (next) shuffleQueueRef.current = buildShuffleQueue(visibleTracks.map((track) => track.id), activeTrack?.id ?? null);
    else { shuffleQueueRef.current = []; historyRef.current = []; }
    setShuffleEnabled(next);
  };

  const toggleRepeat = () => {
    const next = !repeatRef.current;
    repeatRef.current = next;
    setRepeatEnabled(next);
  };

  const applyEqualizerPreset = (presetId: Exclude<EqualizerPresetId, "custom">) => {
    setEqualizerPreset(presetId);
    setEqualizerBands(normalizeEqualizerBands(getEqualizerPreset(presetId).gains));
  };

  const updateEqualizerBand = (index: number, value: number) => {
    setEqualizerPreset("custom");
    setEqualizerBands((current) => current.map((gain, bandIndex) => bandIndex === index ? clampEqualizerGain(value) : gain));
  };

  const resetEqualizer = () => applyEqualizerPreset("flat");

  const handleEnded = () => {
    const queue = visibleTracks;
    if (queue.length === 0) return;
    if (!activeTrack || !queue.some((track) => track.id === activeTrack.id)) {
      selectTrack(queue[0]);
      return;
    }
    const currentIndex = queue.findIndex((track) => track.id === activeTrack.id);
    if (repeatRef.current) {
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; void audio.play().catch(() => setIsPlaying(false)); }
      setIsPlaying(true);
      return;
    }
    if (shuffleRef.current) {
      shuffleQueueRef.current = reconcileShuffleQueue(queue.map((track) => track.id), activeTrack.id, shuffleQueueRef.current);
      const queueIndex = shuffleQueueRef.current.indexOf(activeTrack.id);
      const nextId = shuffleQueueRef.current[(queueIndex + 1) % shuffleQueueRef.current.length];
      const nextTrack = queue.find((track) => track.id === nextId);
      if (nextTrack) { historyRef.current = [...historyRef.current, activeTrack.id]; selectTrack(nextTrack); }
      return;
    }
    const nextIndex = getNextPlaybackIndex(currentIndex, queue.length, { shuffle: false, repeat: false });
    selectTrack(queue[nextIndex]);
  };

  const toggleFavorite = (track: Track | null = activeTrack) => {
    if (!track) {
      toast("Escolha uma faixa para adicionar aos favoritos.");
      return;
    }
    const alreadyFavorite = favoriteIds.includes(track.id);
    setFavoriteIds((current) => alreadyFavorite ? current.filter((id) => id !== track.id) : [...current, track.id]);
    toast(alreadyFavorite ? `“${track.title}” removida dos favoritos.` : `“${track.title}” adicionada aos favoritos.`);
  };

  const seek = (value: number) => {
    const safeValue = clampProgress(value);
    setProgress(safeValue);
    const audio = audioRef.current;
    if (audio) {
      seekAudio(audio, safeValue);
      setCurrentTime(audio.currentTime);
    }
  };

  const removeLocalFolder = async (folderName: string) => {
    if (mode !== "local") return;
    const removedTracks = localLibraryRef.current.filter((track) => track.folder === folderName);
    if (!removedTracks.length) return;
    const removedIds = new Set(removedTracks.map((track) => track.id));
    removedTracks.forEach(revokeTrackUrls);
    localLibraryRef.current = localLibraryRef.current.filter((track) => !removedIds.has(track.id));
    try {
      await clearStoredTracks();
      if (localLibraryRef.current.length) {
        await saveStoredTracks(localLibraryRef.current.map(toStoredTrack));
        setPersistenceState("saved");
      } else {
        setPersistenceState("idle");
      }
    } catch (error: unknown) {
      setPersistenceState(error instanceof LocalLibraryStorageError ? error.code : "unknown");
      toast.error("Não foi possível atualizar a coleção local.");
      return;
    }
    setFavoriteIds((current) => current.filter((id) => !removedIds.has(id)));
    setPlaylists((current) => current.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((id) => !removedIds.has(id)) })));
    if (activeTrack && removedIds.has(activeTrack.id)) {
      audioRef.current?.pause();
      if (audioRef.current) { audioRef.current.removeAttribute("src"); audioRef.current.load(); }
      const nextTrack = localLibraryRef.current[0] ?? null;
      setActiveTrack(nextTrack);
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
    }
    setLibrary(localLibraryRef.current);
    toast.success(`Pasta “${folderName}” retirada`, { description: `${removedTracks.length} ${removedTracks.length === 1 ? "faixa removida" : "faixas removidas"}.` });
  };

  const openPlaylistDialog = (track: Track | null = activeTrack) => {
    if (!track) return toast("Escolha uma faixa para adicionar a uma playlist.");
    setPlaylistTargetTrack(track);
    setPlaylistTargetFolder(null);
    setPlaylistDialogOpen(true);
  };

  const openPlaylistFolderDialog = (folderName: string) => {
    const folderTracks = library.filter((track) => track.folder === folderName);
    if (!folderTracks.length) return toast("Esta pasta não tem músicas disponíveis.");
    setPlaylistTargetTrack(null);
    setPlaylistTargetFolder(folderName);
    setPlaylistDialogOpen(true);
  };

  const openNewPlaylistDialog = () => {
    setPlaylistTargetTrack(null);
    setPlaylistTargetFolder(null);
    setPlaylistDialogOpen(true);
  };

  const createPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return toast.error("Digite um nome para a playlist.");
    const folderTrackIds = playlistTargetFolder ? library.filter((track) => track.folder === playlistTargetFolder).map((track) => track.id) : [];
    const trackIds = playlistTargetTrack ? [playlistTargetTrack.id] : folderTrackIds;
    const playlist: Playlist = { id: `playlist:${Date.now()}`, name, trackIds, createdAt: Date.now() };
    setPlaylists((current) => [...current, playlist]);
    setNewPlaylistName("");
    setPlaylistDialogOpen(false);
    setPlaylistTargetTrack(null);
    setPlaylistTargetFolder(null);
    toast.success(`Playlist “${name}” criada${trackIds.length ? ` com ${trackIds.length} ${trackIds.length === 1 ? "faixa" : "faixas"}` : ""}.`);
  };

  const addTrackToPlaylist = (playlistId: string) => {
    if (!playlistTargetTrack) return;
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId
      ? { ...playlist, trackIds: playlist.trackIds.includes(playlistTargetTrack.id) ? playlist.trackIds : [...playlist.trackIds, playlistTargetTrack.id] }
      : playlist));
    const playlist = playlists.find((item) => item.id === playlistId);
    setPlaylistDialogOpen(false);
    const already = Boolean(playlist?.trackIds.includes(playlistTargetTrack.id));
    toast.success(already ? `“${playlistTargetTrack.title}” já está nessa playlist.` : `“${playlistTargetTrack.title}” adicionada à playlist.`);
  };

  const addFolderToPlaylist = (playlistId: string) => {
    if (!playlistTargetFolder) return;
    const folderTracks = library.filter((track) => track.folder === playlistTargetFolder);
    const folderIds = folderTracks.map((track) => track.id);
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId
      ? { ...playlist, trackIds: [...playlist.trackIds, ...folderIds.filter((id) => !playlist.trackIds.includes(id))] }
      : playlist));
    const playlist = playlists.find((item) => item.id === playlistId);
    setPlaylistDialogOpen(false);
    setPlaylistTargetFolder(null);
    const addedCount = folderIds.filter((id) => !playlist?.trackIds.includes(id)).length;
    toast.success(addedCount ? `${addedCount} ${addedCount === 1 ? "faixa adicionada" : "faixas adicionadas"} à playlist “${playlist?.name ?? "Playlist"}”.` : `As músicas de “${playlistTargetFolder}” já estão nessa playlist.`);
  };

  const removeTrackFromPlaylist = (trackId: string) => {
    if (!playlistFilter) return;
    const playlist = playlists.find((item) => item.id === playlistFilter);
    if (!playlist) return;
    setPlaylists((current) => current.map((item) => item.id === playlistFilter ? { ...item, trackIds: item.trackIds.filter((id) => id !== trackId) } : item));
    const track = library.find((item) => item.id === trackId);
    toast.success(`“${track?.title ?? "Faixa"}” removida de “${playlist.name}”.`);
  };

  const playPlaylist = (playlist: Playlist) => {
    const tracks = library.filter((track) => playlist.trackIds.includes(track.id));
    if (!tracks.length) return toast("Esta playlist ainda não tem músicas disponíveis na coleção atual.");
    setActiveNav(playlist.name);
    setPlaylistFilter(playlist.id);
    setFolderFilter(null);
    setQuery("");
  };

  const deletePlaylist = (playlistId: string) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    setPlaylists((current) => current.filter((item) => item.id !== playlistId));
    if (playlistFilter === playlistId) { setPlaylistFilter(null); setActiveNav("Início"); }
    toast(`Playlist “${playlist?.name ?? "Playlist"}” excluída.`);
  };

  const chooseMode = (nextMode: "local" | "cloud") => {
    if (nextMode === "cloud" && !isAuthenticated) {
      startLogin();
      return;
    }
    setQuery("");
    setFolderFilter(null);
    setPlaylistFilter(null);
    setMode(nextMode);
  };

  const syncCloud = () => {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    void loadGoogleLibrary();
  };

  const showAllTracks = () => {
    setActiveNav("Todas as músicas");
    setQuery("");
    setFolderFilter(null);
    setPlaylistFilter(null);
    setMobileMenu(false);
    window.setTimeout(() => document.getElementById("tracks")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
  };

  const showFolderTracks = (folderName: string) => {
    setFolderFilter(folderName);
    setPlaylistFilter(null);
    setQuery("");
    setActiveNav("Início");
    setMobileMenu(false);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#090a0f] text-white/60"><Loader2 className="mr-3 animate-spin text-violet-300" size={20} /> Carregando sua sessão…</div>;

  return (
    <div className="drivebeat-shell min-h-screen bg-[#090a0f] text-white">
      <input ref={filesRef} type="file" accept=".mp3,audio/mpeg" multiple className="hidden" onChange={addFiles} />
      <input ref={folderRef} type="file" accept=".mp3,audio/mpeg" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={addFiles} />
      <aside style={{ touchAction: "pan-y", overscrollBehaviorY: "contain" }} className={cn("sidebar fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col overflow-y-auto overscroll-y-contain border-r border-white/[0.06] bg-[#0d0f16] px-5 py-7 transition-transform duration-200 lg:translate-x-0", mobileMenu ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-11 flex items-center justify-between px-2">
          <button className="flex items-center gap-3" onClick={() => { setActiveNav("Início"); setQuery(""); setFolderFilter(null); }} aria-label="Ir para início"><span className="brand-mark"><span /><span /><span /></span><span className="font-display text-[21px] font-bold tracking-[-0.04em]">Drivebeat</span></button>
          <button className="rounded-lg p-1 text-white/50 hover:bg-white/5 hover:text-white lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={19} /></button>
        </div>
        <nav className="space-y-1" aria-label="Navegação principal">
          {[{ label: "Início", icon: HomeIcon }, { label: "Favoritos", icon: Heart }].map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActiveNav(label); setQuery(""); setFolderFilter(null); setPlaylistFilter(null); setMobileMenu(false); }} className={cn("nav-item", activeNav === label && "nav-item-active")}><Icon size={18} strokeWidth={activeNav === label ? 2.5 : 1.8} fill={label === "Favoritos" && activeNav === label ? "currentColor" : "none"} /> {label}{label === "Favoritos" && library.filter((track) => favoriteIds.includes(track.id)).length > 0 ? <span className="ml-auto text-[10px] text-white/30">{library.filter((track) => favoriteIds.includes(track.id)).length}</span> : null}</button>)}
          <button onClick={showAllTracks} className={cn("nav-item", activeNav === "Todas as músicas" && "nav-item-active")}><ListMusic size={18} strokeWidth={activeNav === "Todas as músicas" ? 2.5 : 1.8} /> Todas as músicas</button>
        </nav>
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Suas pastas <button onClick={() => folderRef.current?.click()} className="text-white/45 hover:text-white" aria-label="Adicionar pasta"><Plus size={14} /></button></div>
          <div className="space-y-1">
            {folders.length === 0 ? <p className="px-2 text-xs leading-5 text-white/30">Suas pastas aparecerão aqui quando você importar uma coleção.</p> : folders.map((folder) => <div key={folder.name} className={cn("group flex w-full items-center gap-1 rounded-xl", folderFilter === folder.name && "bg-violet-300/10")}><button onClick={() => showFolderTracks(folder.name)} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white", folderFilter === folder.name && "text-white")}><span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px] bg-gradient-to-br", folder.accent)} /><span className="truncate">{folder.name}</span></button><button onClick={(event) => { event.stopPropagation(); openPlaylistFolderDialog(folder.name); }} className="mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-violet-500/10 hover:text-violet-200" aria-label={`Adicionar a pasta ${folder.name} a uma playlist`} title={`Adicionar pasta ${folder.name} à playlist`}><ListPlus size={14} /></button>{mode === "local" && <button onClick={(event) => { event.stopPropagation(); void removeLocalFolder(folder.name); }} className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-rose-500/10 hover:text-rose-300" aria-label={`Retirar pasta ${folder.name}`} title={`Retirar pasta ${folder.name}`}><span className="text-lg leading-none">−</span></button>}</div>)}
          </div>
        </div>
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35"><span>Suas playlists</span><button onClick={() => { openNewPlaylistDialog(); }} className="text-white/45 hover:text-white" aria-label="Nova playlist" title="Nova playlist"><Plus size={14} /></button></div>
          <div className="space-y-1">{playlists.length === 0 ? <p className="px-2 text-xs leading-5 text-white/30">Crie sua primeira playlist.</p> : [...playlists].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map((playlist) => <button key={playlist.id} onClick={() => playPlaylist(playlist)} className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white", playlistFilter === playlist.id && "bg-violet-300/10 text-white")}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-400 to-fuchsia-700"><ListMusic size={13} /></span><span className="truncate">{playlist.name}</span><span className="ml-auto text-[10px] text-white/25">{playlist.trackIds.length}</span></button>)}</div>
        </div>
        <div className="mb-4 rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/10 to-violet-500/[0.04] p-4"><div className="mb-3 flex items-center justify-between"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-300/15 text-cyan-200"><Cloud size={16} /></div><span className={cn("h-2 w-2 rounded-full", isAuthenticated ? "bg-emerald-300" : "bg-white/20")} /></div><p className="mb-1 text-sm font-semibold">Google Drive</p><p className="mb-4 text-xs leading-5 text-white/40">{isAuthenticated ? `${cloudLibrary.length} faixas disponíveis` : "Entre com sua conta Google para ouvir seus MP3s."}</p><div className="space-y-2"><Button onClick={syncCloud} disabled={googleSyncing} className="h-9 w-full rounded-lg bg-cyan-200 text-xs font-semibold text-[#10151d] hover:bg-cyan-100">{googleSyncing ? <Loader2 size={14} className="mr-2 animate-spin" /> : isAuthenticated ? <RefreshCw size={14} className="mr-2" /> : <Cloud size={14} className="mr-2" />}{isAuthenticated ? "Sincronizar agora" : "Entrar com Google"}</Button></div></div>
        <div className="mt-auto rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/[0.03] p-4"><div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-violet-400/15 text-violet-300"><Sparkles size={16} /></div><p className="mb-1 text-sm font-semibold">Coleção local</p><p className="mb-4 text-xs leading-5 text-white/40">Seus MP3s ficam no navegador, sem upload e sem custo.</p><Button onClick={() => folderRef.current?.click()} className="h-9 w-full rounded-lg bg-white text-xs font-semibold text-[#11131a] hover:bg-white/90"><FolderOpen size={14} className="mr-2" /> Adicionar pasta</Button></div>
      </aside>
      {mobileMenu && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Fechar menu" />}
      <main className="min-h-screen pb-32 lg:ml-[248px]">
        <header className="sticky top-0 z-20 flex h-[84px] items-center justify-between border-b border-white/[0.05] bg-[#090a0f]/85 px-5 backdrop-blur-xl sm:px-8 lg:px-12">
          <div className="flex items-center gap-4"><button className="rounded-lg p-2 text-white/60 hover:bg-white/5 lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={21} /></button><div className="relative hidden w-[260px] sm:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={17} /><Input value={query} onChange={(event) => { setFolderFilter(null); setQuery(event.target.value); }} placeholder="Buscar na sua coleção" className="h-10 rounded-xl border-white/[0.08] bg-white/[0.045] pl-10 text-sm text-white placeholder:text-white/30 focus-visible:ring-violet-400/40" /></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] p-1 sm:flex" role="group" aria-label="Modo da biblioteca"><button onClick={() => chooseMode("local")} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors", mode === "local" ? "bg-white text-[#11131a]" : "text-white/50 hover:text-white")}><FolderOpen size={13} /> Local</button><button onClick={() => chooseMode("cloud")} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors", mode === "cloud" ? "bg-violet-400 text-[#17121f]" : "text-white/50 hover:text-white")}><Cloud size={13} /> Cloud</button></div>{isAuthenticated ? <button onClick={() => void logout()} title="Sair da conta" className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-3 text-sm transition-colors hover:border-white/20"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-600 text-xs font-bold">{user?.name?.charAt(0) ?? "D"}</span><span className="hidden max-w-[120px] truncate text-xs text-white/70 sm:block">{user?.name ?? "Sua conta"}</span><LogOut size={14} className="ml-1 text-white/35" /></button> : <Button onClick={() => startLogin()} variant="outline" className="h-9 rounded-full border-white/15 bg-transparent text-xs text-white hover:bg-white/10"><LogIn size={14} className="mr-2" /> Entrar</Button>}</div>
        </header>
        <div className="px-5 pt-8 sm:px-8 lg:px-12 lg:pt-11">
          <section className="mt-10" id="playlists" aria-labelledby="playlists-heading">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div><p className="section-eyebrow">Sua coleção</p><h2 id="playlists-heading" className="font-display mt-1 text-2xl font-semibold tracking-[-0.04em]">Playlists</h2></div>
              <button onClick={showAllTracks} className="group inline-flex shrink-0 items-center gap-2 rounded-full border-2 border-violet-300/50 bg-violet-400/15 px-5 py-2.5 text-xs font-bold text-white shadow-[0_8px_30px_rgba(139,92,246,0.2)] transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-400/25 hover:shadow-[0_10px_35px_rgba(139,92,246,0.3)]">Ver todas <span className="text-sm transition-transform group-hover:translate-x-0.5">→</span></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button onClick={showAllTracks} className="playlist-card group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-violet-500/20 via-violet-500/[0.06] to-white/[0.02] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-violet-300/30">
                <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-600 shadow-lg"><ListMusic size={22} /></div><p className="text-sm font-semibold text-white/90">Todas as músicas</p><p className="mt-1 text-xs text-white/35">{library.length} {library.length === 1 ? "faixa" : "faixas"}</p><Play size={15} className="absolute bottom-4 right-4 text-white/25 transition-colors group-hover:text-white" />
              </button>
              <button onClick={() => { setActiveNav("Favoritos"); setQuery(""); setFolderFilter(null); setPlaylistFilter(null); }} className="playlist-card group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-pink-500/15 via-fuchsia-500/[0.05] to-white/[0.02] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-pink-300/25"><div className="mb-7 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-400 to-rose-600 shadow-lg"><Heart size={21} fill="currentColor" /></div><p className="text-sm font-semibold text-white/90">Favoritos</p><p className="mt-1 text-xs text-white/35">{library.filter((track) => favoriteIds.includes(track.id)).length} {library.filter((track) => favoriteIds.includes(track.id)).length === 1 ? "faixa" : "faixas"}</p><Play size={15} className="absolute bottom-4 right-4 text-white/25 transition-colors group-hover:text-white" /></button>
              {[...playlists].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map((playlist, index) => <button key={playlist.id} onClick={() => playPlaylist(playlist)} className="playlist-card group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-cyan-400/15 via-blue-500/[0.05] to-white/[0.02] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/25">
                <div className={cn("mb-7 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg", gradients[(index + 3) % gradients.length])}><ListMusic size={21} /></div><p className="truncate text-sm font-semibold text-white/90">{playlist.name}</p><p className="mt-1 text-xs text-white/35">{playlist.trackIds.length} {playlist.trackIds.length === 1 ? "faixa" : "faixas"}</p><Play size={15} className="absolute bottom-4 right-4 text-white/25 transition-colors group-hover:text-white" />
              </button>)}
              {playlists.length === 0 && <button onClick={() => { openNewPlaylistDialog(); }} className="playlist-card group relative overflow-hidden rounded-2xl border border-dashed border-violet-300/20 bg-violet-400/[0.04] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-violet-300/40"><div className="mb-7 flex h-12 w-12 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-violet-200"><Plus size={22} /></div><p className="text-sm font-semibold text-white/90">+ Nova playlist</p><p className="mt-1 text-xs text-white/35">Organize suas músicas</p></button>}
            </div>
          </section>
          <section className="mt-11" id="tracks"><div className="mb-5 flex items-end justify-between"><div><p className="section-eyebrow">Fila da coleção</p><h2 className="font-display mt-1 text-2xl font-semibold tracking-[-0.04em]">{folderFilter || (activeNav === "Favoritos" ? "Favoritos" : activeNav === "Todas as músicas" ? "Todas as músicas" : query ? "Resultados da busca" : "Continue ouvindo")}</h2></div><div className="hidden gap-2 sm:flex"><button onClick={() => setEqualizerOpen((open) => !open)} className={cn("icon-button", equalizerOpen && "border-violet-300/40 bg-violet-300/10 text-violet-200")} aria-label="Equalizador gráfico" aria-expanded={equalizerOpen} title="Equalizador gráfico"><SlidersHorizontal size={15} /></button></div></div><div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.018]"><div className="grid grid-cols-[32px_minmax(180px,1fr)_minmax(120px,0.7fr)_70px_40px] items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25 sm:px-5"><span>#</span><span>Título</span><span className="hidden sm:block">Álbum / pasta</span><span><Clock3 size={14} /></span><span /></div>{visibleTracks.length ? visibleTracks.map((track, index) => <div key={track.id} className={cn("track-row group grid w-full grid-cols-[32px_minmax(180px,1fr)_minmax(120px,0.7fr)_70px_40px] items-center gap-3 px-4 py-3.5 sm:px-5", activeTrack?.id === track.id && "track-row-active")}><button onClick={() => selectTrack(track)} className="col-span-4 grid min-w-0 grid-cols-[32px_minmax(180px,1fr)_minmax(120px,0.7fr)_70px] items-center gap-3 text-left"><span className="relative text-xs text-white/30">{activeTrack?.id === track.id && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : index + 1}</span><span className="flex min-w-0 items-center gap-3"><span className={cn("track-thumb bg-gradient-to-br", track.accent)} style={track.coverUrl ? { backgroundImage: `url(${track.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span className="track-thumb-shine" />{activeTrack?.id === track.id && isPlaying ? <Pause size={13} className="relative z-10 text-white" /> : <Play size={13} className="relative z-10 translate-x-px text-white opacity-0 transition-opacity group-hover:opacity-100" />}</span><span className="min-w-0"><span className={cn("block truncate text-sm font-medium", activeTrack?.id === track.id ? "text-violet-200" : "text-white/80")}>{track.title}</span><span className="mt-0.5 block truncate text-xs text-white/35">{track.artist}</span></span></span><span className="hidden truncate text-xs text-white/38 sm:block">{track.album} <span className="text-white/20">·</span> {track.folder}</span><span className="text-xs text-white/35">{track.duration}</span></button><span className="flex items-center justify-end gap-2">{favoriteIds.includes(track.id) && <Heart size={13} fill="currentColor" className="text-pink-400" aria-label="Faixa favorita" />}{playlistFilter && <button onClick={() => removeTrackFromPlaylist(track.id)} className="rounded-md p-1 text-white/20 hover:bg-rose-500/10 hover:text-rose-300" title="Remover da playlist" aria-label="Remover da playlist"><X size={14} /></button>}</span></div>) : <div className="px-5 py-12 text-center"><ListMusic className="mx-auto mb-3 text-white/20" size={26} /><p className="text-sm text-white/45">{activeNav === "Favoritos" ? "Você ainda não favoritou nenhuma faixa." : "Nenhuma faixa na fila ainda."}</p><p className="mt-1 text-xs text-white/25">{activeNav === "Favoritos" ? "Use o coração no player para salvar suas músicas preferidas." : "Adicione MP3s para começar a ouvir."}</p></div>}</div></section>
        </div>
      </main>
      {playlistDialogOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-label="Adicionar à playlist" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151621] p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><p className="section-eyebrow">Playlists</p><h2 className="font-display mt-1 text-xl font-semibold">{playlistTargetTrack ? `Adicionar “${playlistTargetTrack.title}”` : playlistTargetFolder ? `Adicionar pasta “${playlistTargetFolder}”` : "Nova playlist"}</h2></div><button onClick={() => setPlaylistDialogOpen(false)} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white"><X size={17} /></button></div><div className="mb-4 flex gap-2"><Input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createPlaylist(); }} placeholder="Nome da nova playlist" className="border-white/10 bg-white/[0.04] text-white" /><Button onClick={createPlaylist} className="shrink-0 bg-violet-500 hover:bg-violet-400"><Plus size={15} className="mr-1" /> Criar</Button></div>{playlists.length > 0 && <div className="max-h-64 space-y-1 overflow-y-auto">{playlists.map((playlist) => <div key={playlist.id} className="flex items-center gap-2 rounded-xl p-2 hover:bg-white/[0.05]"><button onClick={() => playlistTargetFolder ? addFolderToPlaylist(playlist.id) : addTrackToPlaylist(playlist.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-fuchsia-700"><ListMusic size={15} /></span><span className="min-w-0"><span className="block truncate text-sm text-white/85">{playlist.name}</span><span className="text-[11px] text-white/30">{playlist.trackIds.length} faixas</span></span><Plus size={15} className="ml-auto text-white/30" /></button><button onClick={() => deletePlaylist(playlist.id)} className="rounded-lg p-2 text-white/20 hover:bg-rose-500/10 hover:text-rose-300" title="Excluir playlist"><X size={14} /></button></div>)}</div>}</section></div>}
      {equalizerOpen && <section role="dialog" aria-label="Equalizador gráfico" className="equalizer-panel fixed bottom-[88px] left-3 right-3 z-40 overflow-y-auto rounded-2xl border border-white/10 bg-[#151621]/95 p-4 shadow-2xl backdrop-blur-2xl sm:left-auto sm:right-8 sm:w-[min(560px,calc(100vw-3rem))]"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="section-eyebrow">Processamento em tempo real</p><h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.03em]">Equalizador gráfico</h2><p className="mt-1 text-xs text-white/40">Ajuste o som das faixas locais e do Google Drive.</p></div><button onClick={() => setEqualizerOpen(false)} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Fechar equalizador"><X size={16} /></button></div><div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Presets do equalizador">{EQUALIZER_PRESETS.map((preset) => <button key={preset.id} onClick={() => applyEqualizerPreset(preset.id)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors", equalizerPreset === preset.id ? "border-violet-300/40 bg-violet-300/15 text-violet-100" : "border-white/10 text-white/50 hover:border-white/20 hover:text-white")} aria-pressed={equalizerPreset === preset.id}>{preset.label}</button>)}<button onClick={resetEqualizer} className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/50 hover:border-white/20 hover:text-white">Restaurar</button></div><div className="eq-bands rounded-xl border border-white/[0.06] bg-black/15 px-3 pb-3 pt-4">{EQUALIZER_FREQUENCIES.map((frequency, index) => <label key={frequency} className="eq-band"><span className="text-[10px] font-medium text-white/45">{equalizerBands[index] ?? 0} dB</span><input type="range" min="-12" max="12" step="1" value={equalizerBands[index] ?? 0} onChange={(event) => updateEqualizerBand(index, Number(event.target.value))} className="eq-range" aria-label={`${formatEqualizerFrequency(frequency)} Hz`} /><span className="text-[10px] font-semibold text-white/65">{formatEqualizerFrequency(frequency)}</span></label>)}</div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-white/40">{equalizerEnabled ? "Equalizador ativo" : "Equalizador em bypass"}</span><button onClick={() => setEqualizerEnabled((enabled) => !enabled)} className={cn("rounded-lg border px-3 py-2 text-xs font-medium transition-colors", equalizerEnabled ? "border-violet-300/30 bg-violet-300/10 text-violet-100" : "border-white/10 text-white/55 hover:text-white")} aria-pressed={equalizerEnabled}>{equalizerEnabled ? "Desativar" : "Ativar"}</button></div></section>}
      {(error || ["blocked", "quota-exceeded"].includes(persistenceState)) && <div className="fixed left-1/2 top-[88px] z-30 -translate-x-1/2 rounded-full border border-rose-400/20 bg-rose-950/70 px-4 py-2 text-xs text-rose-200 shadow-xl">{error ? "Não foi possível carregar a sessão. O modo local continua disponível." : persistenceState === "quota-exceeded" ? "Sem espaço para salvar a coleção neste dispositivo." : "O armazenamento local está bloqueado neste navegador."}</div>}
      <div className="player-bar fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#101118]/95 px-4 py-3 backdrop-blur-2xl lg:left-[248px] sm:px-8"><div className="mx-auto flex max-w-[1480px] items-center gap-4"><div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[210px] sm:flex-[0.75]"><div className={cn("player-cover bg-gradient-to-br", activeTrack?.accent ?? "from-violet-500 to-indigo-950")} style={activeTrack?.coverUrl ? { backgroundImage: `url(${activeTrack.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!activeTrack?.coverUrl && <span className="cover-sun" />}</div><div className="min-w-0"><p className="truncate text-sm font-medium text-white/90">{activeTrack?.title ?? "Nenhuma faixa selecionada"}</p><p className="mt-0.5 truncate text-xs text-white/35">{activeTrack?.artist ?? "Adicione uma coleção local para começar"}</p></div><button onClick={() => openPlaylistDialog()} disabled={!activeTrack} className="ml-1 shrink-0 rounded-full p-1.5 text-white/35 transition-colors hover:text-white disabled:opacity-30" aria-label="Adicionar à playlist" title="Adicionar à playlist"><Plus size={16} /></button><button onClick={() => toggleFavorite()} disabled={!activeTrack} className={cn("ml-1 shrink-0 rounded-full p-1.5 transition-colors disabled:opacity-30", liked ? "text-pink-400" : "text-white/35 hover:text-white")} aria-label={liked ? "Remover dos favoritos" : "Favoritar"} title={liked ? "Remover dos favoritos" : "Adicionar aos favoritos"}><Heart size={16} fill={liked ? "currentColor" : "none"} /></button></div><div className="flex flex-[1.3] flex-col items-center gap-2"><div className="flex items-center gap-4 sm:gap-6"><button onClick={toggleShuffle} className={cn("hidden transition-colors hover:text-white sm:block", shuffleEnabled ? "text-violet-300" : "text-white/35")} aria-label={shuffleEnabled ? "Desativar ordem aleatória" : "Ativar ordem aleatória"} aria-pressed={shuffleEnabled} title={shuffleEnabled ? "Ordem aleatória ativada" : "Ordem aleatória desativada"}><Shuffle size={15} /></button><button onClick={() => selectRelativeTrack(-1)} className="text-white/60 hover:text-white" aria-label="Faixa anterior"><SkipBack size={17} fill="currentColor" /></button><button onClick={togglePlay} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0d0f16] transition-transform hover:scale-105 active:scale-95" aria-label={isPlaying ? "Pausar" : "Reproduzir"}>{isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-px" />}</button><button onClick={() => selectRelativeTrack(1)} className="text-white/60 hover:text-white" aria-label="Próxima faixa"><SkipForward size={17} fill="currentColor" /></button><button onClick={toggleRepeat} className={cn("hidden transition-colors hover:text-white sm:block", repeatEnabled ? "text-violet-300" : "text-white/35")} aria-label={repeatEnabled ? "Desativar repetição" : "Ativar repetição"} aria-pressed={repeatEnabled} title={repeatEnabled ? "Repetição ativada" : "Repetição desativada"}><Repeat2 size={15} /></button><button onClick={() => setEqualizerOpen((open) => !open)} className={cn("text-white/60 hover:text-white sm:hidden", equalizerOpen && "text-violet-300")} aria-label="Equalizador gráfico" aria-expanded={equalizerOpen}><SlidersHorizontal size={15} /></button></div><div className="hidden w-full max-w-[460px] items-center gap-3 sm:flex"><span className="text-[10px] text-white/30">{formatDuration(currentTime)}</span><input type="range" min="0" max="100" value={progress} onChange={(event) => seek(Number(event.target.value))} className="player-range" style={{ background: `linear-gradient(90deg, #a78bfa 0 ${progress}%, rgba(255,255,255,.15) ${progress}% 100%)` }} aria-label="Progresso da faixa" /><span className="text-[10px] text-white/30">{formatDuration(duration)}</span></div></div><div className="hidden flex-1 items-center justify-end gap-4 sm:flex sm:flex-[0.75]"><button onClick={toggleMute} className="rounded-full p-1 text-white/50 transition-colors hover:text-white" aria-label={isMuted ? "Ativar som" : "Mudo"} title={isMuted ? "Ativar som" : "Mudo"}>{isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><input type="range" min="0" max="100" value={volume} onChange={(event) => { const nextVolume = Number(event.target.value); setVolume(nextVolume); if (nextVolume > 0) setIsMuted(false); }} className="volume-range" style={{ background: `linear-gradient(90deg, #fff 0 ${isMuted ? 0 : volume}%, rgba(255,255,255,.15) ${isMuted ? 0 : volume}% 100%)` }} aria-label="Volume" /></div></div></div>
      <audio ref={audioRef} className="hidden" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={handleEnded} />
    </div>
  );
}
