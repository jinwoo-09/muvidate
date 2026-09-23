import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Lock, 
  Check, 
  Radio, 
  Loader2, 
  AlertCircle,
  Headphones,
  Crop,
  Film,
  Layers,
  ChevronDown,
  Subtitles
} from "lucide-react";
import { rtdb } from "../lib/firebase";
import { ref, onChildAdded, off, get } from "firebase/database";
import { SeriesStructure, extractSeriesStructure, getEpisodeUrl, getSubtitleForEpisode, convertSrtToVtt } from "../lib/seriesUtils";

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  isHost: boolean;
  controlsLocked: boolean;
  syncState?: {
    isPlaying: boolean;
    currentTime: number;
    lastUpdated: number;
    updatedBy: string;
    audioTrackIndex?: number;
  };
  onPlaybackChange?: (state: { isPlaying: boolean; currentTime: number }) => void;
  onAudioTrackChange?: (index: number) => void;
  onVideoEnded?: () => void;
  roomCode?: string;
  currentUserId?: string;
  isVoiceRecording?: boolean;
  seriesStructure?: SeriesStructure;
  currentSeason?: number;
  currentEpisode?: number;
  onSelectEpisode?: (seasonNum: number, episodeNum: number, episodeUrl: string) => void;
  subtitle?: string;
}

function VideoPlayerComponent({
  src,
  poster,
  isHost,
  controlsLocked,
  syncState,
  onPlaybackChange,
  onAudioTrackChange,
  onVideoEnded,
  roomCode,
  currentUserId,
  isVoiceRecording = false,
  seriesStructure: propSeriesStructure,
  currentSeason: propCurrentSeason,
  currentEpisode: propCurrentEpisode,
  onSelectEpisode,
  subtitle
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isBuffering, setIsBuffering] = useState(true);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const [displayMode, setDisplayMode] = useState<"fit" | "zoom" | "stretch">("fit");
  const [isSubtitlesEnabled, setIsSubtitlesEnabled] = useState(true);
  const [hasCurrentSubtitle, setHasCurrentSubtitle] = useState(false);
  const isSubtitlesEnabledRef = useRef(true);
  const activeBlobUrlRef = useRef<string | null>(null);
  const subtitleRequestIdRef = useRef<number>(0);

  useEffect(() => {
    isSubtitlesEnabledRef.current = isSubtitlesEnabled;
  }, [isSubtitlesEnabled]);

  useEffect(() => {
    const handleGlobalClick = () => {
      setShowAudioMenu(false);
      setShowDisplayMenu(false);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  // Fullscreen chat message overlay
  const [fullscreenChatOverlay, setFullscreenChatOverlay] = useState<{
    id: string;
    username: string;
    text: string;
  } | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const fullscreenEnteredAtRef = useRef<number>(Infinity);
  const isFullscreenRef = useRef<boolean>(false);

  // Audio track support detection
  const [availableAudioTracks, setAvailableAudioTracks] = useState<any[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);

  // Auto-hiding Real-time Sync Indicator state
  const [showSyncIndicator, setShowSyncIndicator] = useState(false);
  const syncIndicatorTimerRef = useRef<number | null>(null);

  const triggerSyncIndicator = useCallback(() => {
    setShowSyncIndicator(true);
    if (syncIndicatorTimerRef.current) {
      clearTimeout(syncIndicatorTimerRef.current);
    }
    syncIndicatorTimerRef.current = window.setTimeout(() => {
      setShowSyncIndicator(false);
      syncIndicatorTimerRef.current = null;
    }, 2000);
  }, []);

  // Cleanup sync indicator timer on unmount
  useEffect(() => {
    return () => {
      if (syncIndicatorTimerRef.current) {
        clearTimeout(syncIndicatorTimerRef.current);
      }
    };
  }, []);

  const controlsTimeoutRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const isApplyingRemoteSyncRef = useRef(false);
  const isUserIntentionalActionRef = useRef(false);
  const hasSystemInterruptionRef = useRef(false);
  const preVoiceRecordingMutedRef = useRef<boolean | null>(null);

  const lastEmittedState = useRef<{ isPlaying: boolean; currentTime: number } | null>(null);
  const lastSyncProcessedRef = useRef<{
    lastUpdated: number;
    isPlaying: boolean;
    currentTime: number;
    audioTrackIndex?: number;
  } | null>(null);

  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;
  const hasInitialSyncAppliedRef = useRef(false);

  // Single-shot buffering recovery state tracking
  const wasBufferingRef = useRef(false);
  const isRecoveringFromBufferRef = useRef(false);
  const currentMediaKeyRef = useRef(`${roomCode || ""}:${src}`);

  useEffect(() => {
    currentMediaKeyRef.current = `${roomCode || ""}:${src}`;
    wasBufferingRef.current = false;
    isRecoveringFromBufferRef.current = false;
    hasInitialSyncAppliedRef.current = false;
  }, [roomCode, src]);

  const onVideoEndedRef = useRef(onVideoEnded);
  onVideoEndedRef.current = onVideoEnded;

  const canControl = isHost || !controlsLocked;

  // Series / Season / Episode detection & state
  const effectiveSeries = React.useMemo(() => {
    if (propSeriesStructure) return propSeriesStructure;
    return extractSeriesStructure(src);
  }, [propSeriesStructure, src]);

  const [localSeason, setLocalSeason] = useState(1);
  const [localEpisode, setLocalEpisode] = useState(1);
  const [isSeasonMenuOpen, setIsSeasonMenuOpen] = useState(false);
  const [isEpisodeMenuOpen, setIsEpisodeMenuOpen] = useState(false);
  const seasonMenuRef = useRef<HTMLDivElement>(null);
  const episodeMenuRef = useRef<HTMLDivElement>(null);

  const selectedSeasonNum = propCurrentSeason !== undefined ? propCurrentSeason : localSeason;
  const selectedEpisodeNum = propCurrentEpisode !== undefined ? propCurrentEpisode : localEpisode;

  const currentSeasonData = effectiveSeries.seasons.find(
    (s) => s.seasonNumber === selectedSeasonNum
  ) || effectiveSeries.seasons[0];

  const currentSeasonEpisodes = currentSeasonData ? currentSeasonData.episodes : [];

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        seasonMenuRef.current &&
        !seasonMenuRef.current.contains(e.target as Node)
      ) {
        setIsSeasonMenuOpen(false);
      }
      if (
        episodeMenuRef.current &&
        !episodeMenuRef.current.contains(e.target as Node)
      ) {
        setIsEpisodeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSelectSeason = (seasonNum: number) => {
    resetControlsTimeout();
    setIsSeasonMenuOpen(false);
    if (!canControl) return;

    const targetSeason = effectiveSeries.seasons.find((s) => s.seasonNumber === seasonNum);
    const firstEp = targetSeason && targetSeason.episodes[0] ? targetSeason.episodes[0] : null;
    const firstEpNum = firstEp ? firstEp.episodeNumber : 1;
    const firstEpUrl = firstEp ? firstEp.url : "";

    if (onSelectEpisode && firstEpUrl) {
      onSelectEpisode(seasonNum, firstEpNum, firstEpUrl);
    } else {
      setLocalSeason(seasonNum);
      setLocalEpisode(firstEpNum);
      if (videoRef.current && firstEpUrl) {
        videoRef.current.src = firstEpUrl;
        videoRef.current.currentTime = 0;
      }
    }
  };

  const handleSelectEpisode = (episodeNum: number) => {
    resetControlsTimeout();
    setIsEpisodeMenuOpen(false);
    if (!canControl) return;

    const targetEp = currentSeasonEpisodes.find((ep) => ep.episodeNumber === episodeNum);
    const epUrl = targetEp ? targetEp.url : "";

    if (onSelectEpisode && epUrl) {
      onSelectEpisode(selectedSeasonNum, episodeNum, epUrl);
    } else {
      setLocalEpisode(episodeNum);
      if (videoRef.current && epUrl) {
        videoRef.current.src = epUrl;
        videoRef.current.currentTime = 0;
      }
    }
  };

  // Resolve current active subtitle URL (following selected episode)
  const activeSubtitleUrl = React.useMemo(() => {
    if (!subtitle || typeof subtitle !== "string" || !subtitle.trim()) return null;
    return getSubtitleForEpisode(subtitle, selectedEpisodeNum);
  }, [subtitle, selectedEpisodeNum]);

  // Load and attach subtitle track to video element via safe fetch, SRT-to-WebVTT conversion & local Blob URL
  useEffect(() => {
    const video = videoRef.current;
    const requestId = ++subtitleRequestIdRef.current;

    // 1. Immediately remove all existing <track> elements from video element DOM and disable tracks
    if (video) {
      const existingTracks = video.querySelectorAll("track");
      existingTracks.forEach((t) => {
        try {
          if (t.track) t.track.mode = "disabled";
        } catch {}
        t.remove();
      });
      if (video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          try {
            video.textTracks[i].mode = "disabled";
          } catch {}
        }
      }
    }

    // 2. Revoke the previous Blob URL once old tracks are removed
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }

    // 3. If no subtitle for this episode, update state and return
    if (!activeSubtitleUrl) {
      setHasCurrentSubtitle(false);
      return;
    }

    setHasCurrentSubtitle(true);

    // Helper to attach a track with the resolved VTT URL (either blob: or direct URL)
    const attachTrack = (vttUrl: string, isBlob: boolean) => {
      if (subtitleRequestIdRef.current !== requestId) {
        if (isBlob) URL.revokeObjectURL(vttUrl);
        return;
      }

      const currentVideo = videoRef.current;
      if (!currentVideo) {
        if (isBlob) URL.revokeObjectURL(vttUrl);
        return;
      }

      if (isBlob) {
        activeBlobUrlRef.current = vttUrl;
      }

      // Ensure old tracks are cleanly gone
      currentVideo.querySelectorAll("track").forEach((t) => {
        try {
          if (t.track) t.track.mode = "disabled";
        } catch {}
        t.remove();
      });

      const trackEl = document.createElement("track");
      trackEl.kind = "subtitles";
      trackEl.label = "Subtitles";
      trackEl.srclang = "en";
      trackEl.src = vttUrl;
      trackEl.default = isSubtitlesEnabledRef.current;

      // Handle load event to ensure mode is set correctly once cues are ready
      const handleTrackLoaded = () => {
        if (subtitleRequestIdRef.current !== requestId) return;
        try {
          if (trackEl.track) {
            trackEl.track.mode = isSubtitlesEnabledRef.current ? "showing" : "disabled";
          }
        } catch {}
      };

      trackEl.addEventListener("load", handleTrackLoaded);
      currentVideo.appendChild(trackEl);

      // Also set mode immediately in case load is synchronous or already fired
      try {
        if (trackEl.track) {
          trackEl.track.mode = "hidden";
          trackEl.track.mode = isSubtitlesEnabledRef.current ? "showing" : "disabled";
        }
      } catch {}
    };

    // Direct blob: or data: URL
    if (activeSubtitleUrl.startsWith("blob:") || activeSubtitleUrl.startsWith("data:")) {
      attachTrack(activeSubtitleUrl, false);
      return;
    }

    // Fetch remote subtitle, convert SRT to WebVTT, and create a brand new Blob URL
    const loadSub = async () => {
      try {
        const res = await fetch(activeSubtitleUrl);
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }
        const text = await res.text();

        // If another episode has been selected while fetch was in flight, discard old result
        if (subtitleRequestIdRef.current !== requestId) {
          return;
        }

        const vtt = convertSrtToVtt(text);
        const blob = new Blob([vtt], { type: "text/vtt" });
        const localBlobUrl = URL.createObjectURL(blob);

        attachTrack(localBlobUrl, true);
      } catch (err) {
        if (subtitleRequestIdRef.current === requestId) {
          console.warn("Subtitle load failed (CORS or network error). Video playback will continue.", err);
          setHasCurrentSubtitle(false);
        }
      }
    };

    loadSub();
  }, [activeSubtitleUrl]);

  // Clean up Blob URL and tracks when player unmounts
  useEffect(() => {
    return () => {
      subtitleRequestIdRef.current += 1;
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
      const video = videoRef.current;
      if (video) {
        video.querySelectorAll("track").forEach((t) => {
          try {
            if (t.track) t.track.mode = "disabled";
          } catch {}
          t.remove();
        });
      }
    };
  }, []);

  const handleToggleSubtitles = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = !isSubtitlesEnabled;
    setIsSubtitlesEnabled(nextVal);
    isSubtitlesEnabledRef.current = nextVal;

    const video = videoRef.current;
    if (video && video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        try {
          video.textTracks[i].mode = nextVal ? "showing" : "disabled";
        } catch {}
      }
    }
    resetControlsTimeout();
  };

  // Handle voice note recording: mute video during recording without pausing; restore previous mute state afterwards
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVoiceRecording) {
      if (preVoiceRecordingMutedRef.current === null) {
        preVoiceRecordingMutedRef.current = video.muted;
      }
      video.muted = true;
      setIsMuted(true);
    } else {
      if (preVoiceRecordingMutedRef.current !== null) {
        const wasMutedBefore = preVoiceRecordingMutedRef.current;
        preVoiceRecordingMutedRef.current = null;
        video.muted = wasMutedBefore;
        setIsMuted(wasMutedBefore);
      }
    }
  }, [isVoiceRecording]);

  // Auto-hide controls after 2.5 seconds of inactivity
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
      setShowAudioMenu(false);
      setShowDisplayMenu(false);
      setIsSeasonMenuOpen(false);
      setIsEpisodeMenuOpen(false);
      controlsTimeoutRef.current = null;
    }, 2500);
  }, []);

  const resetControlsTimeoutRef = useRef(resetControlsTimeout);
  resetControlsTimeoutRef.current = resetControlsTimeout;

  // Audio Tracks Detection (where browser supports HTML5 audioTracks API)
  const detectAudioTracks = useCallback(() => {
    const video = videoRef.current as any;
    if (video && video.audioTracks && video.audioTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < video.audioTracks.length; i++) {
        const track = video.audioTracks[i];
        tracks.push({
          index: i,
          label: track.label || track.language || `Track ${i + 1}`,
          enabled: track.enabled
        });
      }
      setAvailableAudioTracks(tracks);
    } else {
      setAvailableAudioTracks([
        { index: 0, label: "Default Audio", enabled: true }
      ]);
    }
  }, []);

  const detectAudioTracksRef = useRef(detectAudioTracks);
  detectAudioTracksRef.current = detectAudioTracks;

  // Handle incoming remote syncState changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !syncState) return;

    const isInitialSync = !hasInitialSyncAppliedRef.current;
    hasInitialSyncAppliedRef.current = true;

    // Skip if this sync update is older than or equal to the last processed sync update
    if (
      !isInitialSync &&
      lastSyncProcessedRef.current &&
      syncState.lastUpdated <= lastSyncProcessedRef.current.lastUpdated
    ) {
      return;
    }

    // If local user initiated this action while already actively connected, record it without resetting local playback
    if (!isInitialSync && syncState.updatedBy === currentUserId) {
      lastSyncProcessedRef.current = {
        lastUpdated: syncState.lastUpdated,
        isPlaying: syncState.isPlaying,
        currentTime: syncState.currentTime,
        audioTrackIndex: syncState.audioTrackIndex
      };
      return;
    }

    lastSyncProcessedRef.current = {
      lastUpdated: syncState.lastUpdated,
      isPlaying: syncState.isPlaying,
      currentTime: syncState.currentTime,
      audioTrackIndex: syncState.audioTrackIndex
    };

    // Calculate expected playback time accounting for elapsed seconds since sync event was dispatched
    const now = Date.now();
    const elapsed = syncState.isPlaying && syncState.lastUpdated
      ? Math.max(0, (now - syncState.lastUpdated) / 1000)
      : 0;
    const expectedTime = syncState.isPlaying
      ? Math.max(0, syncState.currentTime + elapsed)
      : syncState.currentTime;

    // On initial sync/rejoin or when time drift exceeds threshold (1.5 seconds)
    let hasMeaningfulSync = false;
    const timeDiff = Math.abs(video.currentTime - expectedTime);
    if (isInitialSync || timeDiff > 1.5) {
      if (expectedTime > 0 || isInitialSync) {
        isApplyingRemoteSyncRef.current = true;
        video.currentTime = expectedTime;
        setCurrentTime(expectedTime);
        setTimeout(() => {
          isApplyingRemoteSyncRef.current = false;
        }, 200);
      }
      hasMeaningfulSync = true;
    }

    // Match play/pause state
    if (syncState.isPlaying && video.paused) {
      isApplyingRemoteSyncRef.current = true;
      video.play().catch(() => {
        // Autoplay policy fallback: muted play or wait for interaction
        console.warn("Autoplay blocked by browser until user gesture");
      }).finally(() => {
        setTimeout(() => {
          isApplyingRemoteSyncRef.current = false;
        }, 200);
      });
      hasMeaningfulSync = true;
    } else if (!syncState.isPlaying && !video.paused) {
      isApplyingRemoteSyncRef.current = true;
      video.pause();
      setTimeout(() => {
        isApplyingRemoteSyncRef.current = false;
      }, 200);
      hasMeaningfulSync = true;
    }

    // Match audio track index if provided and supported
    if (
      syncState.audioTrackIndex !== undefined &&
      (video as any).audioTracks &&
      (video as any).audioTracks.length > syncState.audioTrackIndex &&
      currentAudioTrack !== syncState.audioTrackIndex
    ) {
      const audioTracks = (video as any).audioTracks;
      for (let i = 0; i < audioTracks.length; i++) {
        audioTracks[i].enabled = i === syncState.audioTrackIndex;
      }
      setCurrentAudioTrack(syncState.audioTrackIndex);
      hasMeaningfulSync = true;
    }

    if (hasMeaningfulSync) {
      triggerSyncIndicator();
    }
  }, [syncState, currentUserId, currentAudioTrack, triggerSyncIndicator]);

  // Video listeners: mounted with [src] to prevent teardown/re-attach on unrelated renders (e.g. chat)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      resetControlsTimeoutRef.current?.();
    };

    const onPause = () => {
      setIsPlaying(false);
      resetControlsTimeoutRef.current?.();

      // Detect external/system pauses (e.g. phone calls, OS audio interruption).
      // Do not sync these unexpected system pauses to the room!
      if (!isUserIntentionalActionRef.current && !isApplyingRemoteSyncRef.current) {
        hasSystemInterruptionRef.current = true;
        console.log("System interruption detected on video playback. Will not sync pause to room.");
      }
      isUserIntentionalActionRef.current = false;
    };

    const onTimeUpdate = () => {
      if (!isSeekingRef.current) {
        setCurrentTime(video.currentTime);
      }
      // Update buffered
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
      // If time is advancing, video is playing smoothly and not buffering
      setIsBuffering(false);
    };

    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setIsBuffering(false);
      setPlaybackError(null);
      detectAudioTracksRef.current?.();

      // Restore synchronized room timeline upon metadata loaded
      if (syncStateRef.current) {
        const sync = syncStateRef.current;
        const now = Date.now();
        const elapsed = sync.isPlaying && sync.lastUpdated
          ? Math.max(0, (now - sync.lastUpdated) / 1000)
          : 0;
        const expectedTime = sync.isPlaying
          ? Math.min(video.duration || Infinity, Math.max(0, sync.currentTime + elapsed))
          : Math.min(video.duration || Infinity, Math.max(0, sync.currentTime));

        if (expectedTime > 0) {
          isApplyingRemoteSyncRef.current = true;
          video.currentTime = expectedTime;
          setCurrentTime(expectedTime);
          setTimeout(() => {
            isApplyingRemoteSyncRef.current = false;
          }, 200);
        }

        if (sync.isPlaying && video.paused) {
          isApplyingRemoteSyncRef.current = true;
          video.play().catch(() => {}).finally(() => {
            setTimeout(() => {
              isApplyingRemoteSyncRef.current = false;
            }, 200);
          });
        } else if (!sync.isPlaying && !video.paused) {
          video.pause();
        }
      }
    };

    const onWaiting = () => {
      // Only show buffering indicator if video is not paused, not ended, and actively lacking media data
      if (video && !video.paused && !video.ended && video.readyState < 3) {
        setIsBuffering(true);
        wasBufferingRef.current = true;
      }
    };

    const onStalled = () => {
      if (video && !video.paused && !video.ended && video.readyState < 3) {
        setIsBuffering(true);
        wasBufferingRef.current = true;
      }
    };

    const onPlaying = () => {
      setIsBuffering(false);

      // Single-shot buffering recovery:
      // If the video was genuinely buffering/stalled and has now recovered,
      // fetch the latest room playback state once to resync any lost timeline drift
      if (wasBufferingRef.current && !isRecoveringFromBufferRef.current && roomCode) {
        wasBufferingRef.current = false;
        isRecoveringFromBufferRef.current = true;

        const capturedMediaKey = currentMediaKeyRef.current;
        const capturedRoomCode = roomCode;
        const playbackRef = ref(rtdb, `rooms/${capturedRoomCode}/playbackState`);

        get(playbackRef)
          .then((snapshot) => {
            const currentVid = videoRef.current;
            // Ignore stale recovery request if media, room, or video element has changed
            if (
              !currentVid ||
              currentMediaKeyRef.current !== capturedMediaKey ||
              roomCode !== capturedRoomCode
            ) {
              return;
            }

            const latestState = snapshot.val();
            if (!latestState || typeof latestState.currentTime !== "number") return;

            const now = Date.now();
            const elapsed = latestState.isPlaying && latestState.lastUpdated
              ? Math.max(0, (now - latestState.lastUpdated) / 1000)
              : 0;
            const expectedTime = latestState.isPlaying
              ? Math.max(0, latestState.currentTime + elapsed)
              : latestState.currentTime;

            const timeDiff = Math.abs(currentVid.currentTime - expectedTime);

            // If time drift is noticeable (> 1.0s), resync local playback position
            if (timeDiff > 1.0) {
              isApplyingRemoteSyncRef.current = true;
              currentVid.currentTime = expectedTime;
              setCurrentTime(expectedTime);
              triggerSyncIndicator();
              setTimeout(() => {
                isApplyingRemoteSyncRef.current = false;
              }, 200);
            }

            // Also ensure play/pause matches latest room timeline
            if (latestState.isPlaying && currentVid.paused) {
              isApplyingRemoteSyncRef.current = true;
              currentVid.play().catch(() => {}).finally(() => {
                setTimeout(() => {
                  isApplyingRemoteSyncRef.current = false;
                }, 200);
              });
            } else if (!latestState.isPlaying && !currentVid.paused) {
              isApplyingRemoteSyncRef.current = true;
              currentVid.pause();
              setTimeout(() => {
                isApplyingRemoteSyncRef.current = false;
              }, 200);
            }
          })
          .catch((err) => {
            console.warn("Buffering recovery sync fetch notice:", err);
          })
          .finally(() => {
            isRecoveringFromBufferRef.current = false;
          });
      } else {
        wasBufferingRef.current = false;
      }
    };

    const onCanPlay = () => {
      setIsBuffering(false);
    };

    const onCanPlayThrough = () => {
      setIsBuffering(false);
    };

    const onProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEndVal = video.buffered.end(video.buffered.length - 1);
        setBufferedEnd(bufferedEndVal);
        if (video.currentTime < bufferedEndVal) {
          setIsBuffering(false);
        }
      }
    };

    const onLoadedData = () => {
      setIsBuffering(false);
      setPlaybackError(null);
    };

    const onError = () => {
      setIsBuffering(false);
      const err = video.error;
      let msg = "Playback failed: Unable to load or play video stream.";
      if (
        err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ||
        err?.code === MediaError.MEDIA_ERR_DECODE ||
        src.startsWith("blob:")
      ) {
        msg = "Android Chrome cannot decode this video's codec. Please select a video encoded with a codec supported by your device.";
      } else if (err?.code === MediaError.MEDIA_ERR_NETWORK) {
        msg = "A network error caused the video download to fail.";
      }
      setPlaybackError(msg);
    };

    const onEnded = () => {
      setIsPlaying(false);
      if (onVideoEndedRef.current) onVideoEndedRef.current();
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("canplaythrough", onCanPlayThrough);
    video.addEventListener("progress", onProgress);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("canplaythrough", onCanPlayThrough);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  // Screen Orientation helpers for mobile fullscreen
  const lockLandscapeOrientation = async () => {
    try {
      const orientation =
        window.screen?.orientation ||
        (window.screen as any)?.mozOrientation ||
        (window.screen as any)?.msOrientation;

      if (orientation && typeof orientation.lock === "function") {
        await orientation.lock("landscape").catch(() => {
          // Ignore browsers/devices that reject or do not support programmatic orientation lock
        });
      } else if ((window.screen as any)?.lockOrientation) {
        (window.screen as any).lockOrientation("landscape");
      } else if ((window.screen as any)?.mozLockOrientation) {
        (window.screen as any).mozLockOrientation("landscape");
      } else if ((window.screen as any)?.msLockOrientation) {
        (window.screen as any).msLockOrientation("landscape");
      }
    } catch {
      // Safe fallback - do not crash
    }
  };

  const unlockScreenOrientation = () => {
    try {
      const orientation =
        window.screen?.orientation ||
        (window.screen as any)?.mozOrientation ||
        (window.screen as any)?.msOrientation;

      if (orientation && typeof orientation.unlock === "function") {
        orientation.unlock();
      } else if ((window.screen as any)?.unlockOrientation) {
        (window.screen as any).unlockOrientation();
      } else if ((window.screen as any)?.mozUnlockOrientation) {
        (window.screen as any).mozUnlockOrientation();
      } else if ((window.screen as any)?.msUnlockOrientation) {
        (window.screen as any).msUnlockOrientation();
      }
    } catch {
      // Safe fallback - do not crash
    }
  };

  const isCurrentlyFullscreen = () => {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      (videoRef.current as any)?.webkitDisplayingFullscreen
    );
  };

  // Fullscreen change listener & mobile orientation lock
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = isCurrentlyFullscreen();
      setIsFullscreen(isFs);
      isFullscreenRef.current = isFs;
      if (isFs) {
        fullscreenEnteredAtRef.current = Date.now();
        lockLandscapeOrientation();
      } else {
        fullscreenEnteredAtRef.current = Infinity;
        setFullscreenChatOverlay(null);
        if (overlayTimerRef.current) {
          clearTimeout(overlayTimerRef.current);
          overlayTimerRef.current = null;
        }
        unlockScreenOrientation();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    const video = videoRef.current;
    const onWebkitBegin = () => {
      setIsFullscreen(true);
      isFullscreenRef.current = true;
      fullscreenEnteredAtRef.current = Date.now();
      lockLandscapeOrientation();
    };
    const onWebkitEnd = () => {
      setIsFullscreen(false);
      isFullscreenRef.current = false;
      fullscreenEnteredAtRef.current = Infinity;
      setFullscreenChatOverlay(null);
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      unlockScreenOrientation();
    };

    if (video) {
      video.addEventListener("webkitbeginfullscreen", onWebkitBegin);
      video.addEventListener("webkitendfullscreen", onWebkitEnd);
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      if (video) {
        video.removeEventListener("webkitbeginfullscreen", onWebkitBegin);
        video.removeEventListener("webkitendfullscreen", onWebkitEnd);
      }
      unlockScreenOrientation();
    };
  }, []);

  // Sync fullscreen state ref
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
    if (isFullscreen) {
      fullscreenEnteredAtRef.current = Date.now();
    } else {
      fullscreenEnteredAtRef.current = Infinity;
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      setFullscreenChatOverlay(null);
    }
  }, [isFullscreen]);

  // Realtime Database Fullscreen Chat Message Overlay Listener
  useEffect(() => {
    if (!roomCode) return;

    const chatRef = ref(rtdb, `rooms/${roomCode}/chat`);

    const handleChildAdded = (snapshot: any) => {
      const msg = snapshot.val();
      if (!msg) return;

      // Only show when in fullscreen
      if (!isFullscreenRef.current) return;

      // Do not show user's own message
      if (currentUserId && msg.uid === currentUserId) return;

      // Only show messages received after the user entered fullscreen; do not replay old chat messages
      const msgTime = Number(msg.createdAt) || 0;
      if (msgTime < fullscreenEnteredAtRef.current) return;

      const displayContent =
        msg.type === "voice"
          ? "🎤 Sent a voice note"
          : (msg.text || "");

      if (!displayContent) return;

      setFullscreenChatOverlay({
        id: snapshot.key || Date.now().toString(),
        username: msg.username || "Participant",
        text: displayContent
      });

      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
      overlayTimerRef.current = window.setTimeout(() => {
        setFullscreenChatOverlay(null);
        overlayTimerRef.current = null;
      }, 2000);
    };

    onChildAdded(chatRef, handleChildAdded);

    return () => {
      off(chatRef, "child_added", handleChildAdded);
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
    };
  }, [roomCode, currentUserId]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs/chat
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekRelative(10);
      } else if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const emitPlaybackState = (newPlaying: boolean, newTime: number) => {
    if (!canControl) return;
    triggerSyncIndicator();
    lastEmittedState.current = { isPlaying: newPlaying, currentTime: newTime };
    if (onPlaybackChange) {
      onPlaybackChange({ isPlaying: newPlaying, currentTime: newTime });
    }
  };

  const togglePlayPause = async () => {
    const video = videoRef.current;
    if (!video || !canControl) return;

    if (video.paused) {
      // If resuming after a system interruption, fetch the latest timeline from RTDB before playing
      if (hasSystemInterruptionRef.current) {
        hasSystemInterruptionRef.current = false;
        if (roomCode) {
          try {
            const playbackRef = ref(rtdb, `rooms/${roomCode}/playbackState`);
            const snap = await get(playbackRef);
            if (snap.exists()) {
              const latest = snap.val();
              if (latest) {
                const now = Date.now();
                const elapsed = latest.isPlaying && latest.lastUpdated
                  ? Math.max(0, (now - latest.lastUpdated) / 1000)
                  : 0;
                const expectedTime = latest.isPlaying
                  ? Math.max(0, latest.currentTime + elapsed)
                  : latest.currentTime;
                const bounded = Math.min(video.duration || expectedTime, expectedTime);
                video.currentTime = bounded;
                setCurrentTime(bounded);
              }
            }
          } catch (err) {
            console.error("Failed to recover timeline after interruption:", err);
          }
        }
      }

      isUserIntentionalActionRef.current = true;
      video.play().then(() => {
        emitPlaybackState(true, video.currentTime);
      }).catch(console.error);
    } else {
      isUserIntentionalActionRef.current = true;
      video.pause();
      emitPlaybackState(false, video.currentTime);
    }
  };

  const seekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !canControl) return;
    isUserIntentionalActionRef.current = true;
    const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    video.currentTime = target;
    setCurrentTime(target);
    emitPlaybackState(!video.paused, target);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canControl) return;
    const target = Number(e.target.value);
    setCurrentTime(target);
  };

  const handleSeekStart = () => {
    if (!canControl) return;
    isSeekingRef.current = true;
  };

  const handleSeekEnd = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    if (!canControl) return;
    isSeekingRef.current = false;
    isUserIntentionalActionRef.current = true;
    const video = videoRef.current;
    if (video) {
      video.currentTime = currentTime;
      emitPlaybackState(!video.paused, currentTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    resetControlsTimeout();
  };

  const handleAudioTrackSelect = (trackIndex: number) => {
    const video = videoRef.current as any;
    if (video && video.audioTracks && video.audioTracks.length > trackIndex) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = i === trackIndex;
      }
      setCurrentAudioTrack(trackIndex);
      if (onAudioTrackChange && canControl) {
        triggerSyncIndicator();
        onAudioTrackChange(trackIndex);
      }
    } else {
      setCurrentAudioTrack(trackIndex);
    }
    setShowAudioMenu(false);
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const isFs = isCurrentlyFullscreen();

    if (!isFs) {
      if (container.requestFullscreen) {
        container
          .requestFullscreen()
          .then(() => {
            lockLandscapeOrientation();
          })
          .catch((err) => {
            console.warn("Container requestFullscreen failed, attempting video element:", err);
            if (video && typeof (video as any).webkitEnterFullscreen === "function") {
              (video as any).webkitEnterFullscreen();
            }
          });
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
        lockLandscapeOrientation();
      } else if (video && typeof (video as any).webkitEnterFullscreen === "function") {
        (video as any).webkitEnterFullscreen();
      }
    } else {
      unlockScreenOrientation();
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(console.warn);
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if (video && typeof (video as any).webkitExitFullscreen === "function") {
        (video as any).webkitExitFullscreen();
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canControl) {
      togglePlayPause();
      resetControlsTimeout();
    } else {
      // For locked non-admin users, tapping the video toggles/shows controls and resets the 2s timer
      if (!showControls) {
        setShowControls(true);
        resetControlsTimeout();
      } else {
        setShowControls(false);
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
          controlsTimeoutRef.current = null;
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
      onClick={() => {
        if (!showControls) {
          setShowControls(true);
          resetControlsTimeout();
        } else if (!canControl) {
          setShowControls(false);
          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
          }
        } else {
          resetControlsTimeout();
        }
      }}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden group select-none shadow-2xl border border-neutral-800 flex items-center justify-center"
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        className={`w-full h-full cursor-pointer ${
          displayMode === "fit"
            ? "object-contain"
            : displayMode === "zoom"
              ? "object-cover"
              : "object-fill"
        }`}
        onClick={handleVideoClick}
      />

      {/* Buffering Indicator */}
      {isBuffering && !playbackError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="p-4 rounded-2xl bg-neutral-900/80 backdrop-blur-md border border-neutral-700 shadow-xl flex items-center gap-3 text-white">
            <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
            <span className="text-sm font-medium">Buffering video stream...</span>
          </div>
        </div>
      )}

      {/* Playback Error Overlay */}
      {playbackError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-neutral-950/90 p-6 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <h4 className="text-lg font-bold text-white mb-1">Playback Error</h4>
          <p className="text-sm text-neutral-400 max-w-md mb-4">{playbackError}</p>
          <button
            onClick={() => {
              setPlaybackError(null);
              videoRef.current?.load();
            }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition"
          >
            Retry Video
          </button>
        </div>
      )}

      {/* Top-Left Overlays Container (Series Controls, Lock Notice & Fullscreen Chat Overlay) */}
      <div className="absolute top-4 left-4 z-40 flex flex-col items-start gap-2 pointer-events-none max-w-[90vw] sm:max-w-md">
        {/* Episode / Season Controls for Series (Auto-hides with showControls, shown on interaction) */}
        {effectiveSeries.isSeries && (
          <div
            className={`flex items-center flex-wrap gap-2 transition-opacity duration-300 pointer-events-auto ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Season Selector (only if multiple seasons exist) */}
            {effectiveSeries.seasons.length > 1 && (
              <div className="relative" ref={seasonMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    resetControlsTimeout();
                    if (!canControl) return;
                    setIsSeasonMenuOpen((prev) => !prev);
                    setIsEpisodeMenuOpen(false);
                  }}
                  disabled={!canControl}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 backdrop-blur-md border border-neutral-700/80 text-white text-xs font-semibold shadow-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
                  title={!canControl ? "Controls locked by host" : "Select Season"}
                >
                  <Layers className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>S{selectedSeasonNum}</span>
                  <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
                </button>

                {isSeasonMenuOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-36 max-h-56 overflow-y-auto bg-neutral-900/95 border border-neutral-700 rounded-xl shadow-2xl py-1 z-50 backdrop-blur-lg">
                    {effectiveSeries.seasons.map((s) => (
                      <button
                        key={s.seasonNumber}
                        type="button"
                        onClick={() => handleSelectSeason(s.seasonNumber)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition ${
                          s.seasonNumber === selectedSeasonNum
                            ? "bg-rose-500/20 text-rose-300 font-bold"
                            : "text-neutral-200 hover:bg-neutral-800"
                        }`}
                      >
                        <span>{s.label}</span>
                        {s.seasonNumber === selectedSeasonNum && (
                          <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Episode Selector */}
            <div className="relative" ref={episodeMenuRef}>
              <button
                type="button"
                onClick={() => {
                  resetControlsTimeout();
                  if (!canControl) return;
                  setIsEpisodeMenuOpen((prev) => !prev);
                  setIsSeasonMenuOpen(false);
                }}
                disabled={!canControl}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 backdrop-blur-md border border-neutral-700/80 text-white text-xs font-semibold shadow-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
                title={!canControl ? "Controls locked by host" : "Select Episode"}
              >
                <Film className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>EP {selectedEpisodeNum}</span>
                <span className="text-[10px] text-neutral-400 font-normal">
                  ({currentSeasonEpisodes.length})
                </span>
                <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>

              {isEpisodeMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-48 max-h-60 overflow-y-auto bg-neutral-900/95 border border-neutral-700 rounded-xl shadow-2xl py-1 z-50 backdrop-blur-lg">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                    {effectiveSeries.seasons.length > 1
                      ? `Season ${selectedSeasonNum} Episodes`
                      : "Episodes"}
                  </div>
                  {currentSeasonEpisodes.map((ep) => (
                    <button
                      key={ep.episodeNumber}
                      type="button"
                      onClick={() => handleSelectEpisode(ep.episodeNumber)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition ${
                        ep.episodeNumber === selectedEpisodeNum
                          ? "bg-rose-500/20 text-rose-300 font-bold"
                          : "text-neutral-200 hover:bg-neutral-800"
                      }`}
                    >
                      <span className="truncate">{ep.label}</span>
                      {ep.episodeNumber === selectedEpisodeNum && (
                        <Check className="w-3.5 h-3.5 text-rose-400 shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Control Lock Notice for non-admin */}
        {!canControl && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/85 backdrop-blur-md border border-amber-500/30 text-amber-400 text-xs font-medium shadow-lg transition-opacity duration-300 pointer-events-auto ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Host Locked Playback Controls</span>
          </div>
        )}

        {/* Fullscreen Chat Message Overlay */}
        {isFullscreen && fullscreenChatOverlay && (
          <div
            key={fullscreenChatOverlay.id}
            className="w-full transition-all duration-200"
          >
            <div className="flex items-start gap-2.5 px-3.5 py-2 rounded-xl bg-neutral-950/90 border border-neutral-750/90 backdrop-blur-md shadow-2xl text-white">
              <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 animate-pulse" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-rose-400 truncate">
                  @{fullscreenChatOverlay.username}
                </p>
                <p className="text-xs text-neutral-200 break-words line-clamp-2 mt-0.5 leading-snug">
                  {fullscreenChatOverlay.text}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Sync Indicator (auto-hides after temporary timeout) */}
      {showSyncIndicator && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-emerald-500/40 text-emerald-400 text-[11px] font-mono shadow-md transition-opacity duration-300">
          <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
          <span>Sync Active</span>
        </div>
      )}

      {/* Centered Large YouTube-Style Controls (only rendered when user can control playback) */}
      {canControl && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-6 sm:gap-10 pointer-events-none transition-opacity duration-300">
          {/* Left: 10s Back */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              seekRelative(-10);
              resetControlsTimeout();
            }}
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-neutral-900/85 text-white flex flex-col items-center justify-center border border-neutral-750 shadow-xl transition pointer-events-auto relative hover:bg-rose-600 hover:border-rose-500 cursor-pointer ${
              showControls ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
            }`}
            title="Skip backward 10s"
          >
            <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] font-bold absolute bottom-2">10</span>
          </button>

          {/* Center: Play/Pause */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
              resetControlsTimeout();
            }}
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl backdrop-blur-md transition pointer-events-auto relative hover:bg-rose-500 cursor-pointer ${
              showControls || !isPlaying ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
            }`}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 sm:w-9 sm:h-9 fill-white" />
            ) : (
              <Play className="w-7 h-7 sm:w-9 sm:h-9 fill-white ml-1" />
            )}
          </button>

          {/* Right: 10s Forward */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              seekRelative(10);
              resetControlsTimeout();
            }}
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-neutral-900/85 text-white flex flex-col items-center justify-center border border-neutral-750 shadow-xl transition pointer-events-auto relative hover:bg-rose-600 hover:border-rose-500 cursor-pointer ${
              showControls ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
            }`}
            title="Skip forward 10s"
          >
            <RotateCw className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] font-bold absolute bottom-2">10</span>
          </button>
        </div>
      )}

      {/* Video Controls Bar Overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 pt-16 pb-3 px-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          resetControlsTimeout();
        }}
        onTouchStart={resetControlsTimeout}
        onMouseMove={resetControlsTimeout}
      >
        {/* Scrubber / Progress Bar */}
        <div className="relative group/scrub mb-2.5">
          {/* Track background */}
          <div className="w-full h-1.5 bg-neutral-700/60 rounded-full overflow-hidden relative group-hover/scrub:h-2.5 transition-all">
            {/* Buffered progress */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-neutral-500/50 transition-all duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Played progress */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-rose-600 to-rose-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            disabled={!canControl}
            onMouseDown={handleSeekStart}
            onTouchStart={handleSeekStart}
            onChange={handleSeekChange}
            onMouseUp={handleSeekEnd}
            onTouchEnd={handleSeekEnd}
            className={`absolute inset-0 w-full h-full opacity-0 ${
              canControl ? "cursor-pointer" : "cursor-not-allowed pointer-events-none"
            }`}
          />
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-between text-white text-xs gap-2 sm:gap-4">
          {/* Left: Play, Skip, Volume, Time */}
          <div className="flex items-center gap-2 sm:gap-3">
            {canControl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlayPause();
                  resetControlsTimeout();
                }}
                className="p-1.5 sm:p-2 rounded-lg transition hover:bg-white/15 cursor-pointer text-white"
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
            )}

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="p-1.5 rounded-lg hover:bg-white/15 transition text-white"
                title={isMuted ? "Unmute (M)" : "Mute (M)"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  handleVolumeChange(e);
                  resetControlsTimeout();
                }}
                className="w-14 sm:w-20 h-1 bg-neutral-600 accent-rose-500 rounded-lg cursor-pointer hidden sm:block"
              />
            </div>

            {/* Time Display */}
            <div className="text-[11px] sm:text-xs font-mono text-neutral-300 ml-1">
              <span>{formatTime(currentTime)}</span>
              <span className="text-neutral-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Audio Track, Fullscreen */}
          <div className="flex items-center gap-2 relative">
            {/* Audio Track Selector (Available to all users, even if locked) */}
            {availableAudioTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAudioMenu(!showAudioMenu);
                    resetControlsTimeout();
                  }}
                  className={`p-1.5 rounded-lg transition flex items-center gap-1 text-xs ${
                    showAudioMenu ? "bg-rose-600 text-white" : "hover:bg-white/15 text-neutral-300 hover:text-white"
                  }`}
                  title="Select Audio Track"
                >
                  <Headphones className="w-4 h-4" />
                </button>

                {showAudioMenu && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      resetControlsTimeout();
                    }}
                    className="absolute right-0 bottom-full mb-2 bg-neutral-900 border border-neutral-750 rounded-xl p-1.5 shadow-xl w-44 z-30"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 px-2 py-1">
                      Audio Tracks
                    </p>
                    {availableAudioTracks.map((tr) => (
                      <button
                        key={tr.index}
                        onClick={() => handleAudioTrackSelect(tr.index)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                          currentAudioTrack === tr.index ? "bg-rose-600 text-white" : "text-neutral-300 hover:bg-neutral-800"
                        }`}
                      >
                        <span className="truncate">{tr.label}</span>
                        {currentAudioTrack === tr.index && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Subtitle / CC Control */}
            {hasCurrentSubtitle && (
              <button
                type="button"
                onClick={handleToggleSubtitles}
                className={`p-1.5 rounded-lg transition flex items-center justify-center text-xs ${
                  isSubtitlesEnabled
                    ? "bg-rose-600 text-white shadow-sm"
                    : "hover:bg-white/15 text-neutral-400 hover:text-white"
                }`}
                aria-label="Toggle subtitles"
                title={isSubtitlesEnabled ? "Disable Subtitles (CC)" : "Enable Subtitles (CC)"}
              >
                <Subtitles className="w-4 h-4" />
              </button>
            )}

            {/* Display Scale Mode Control */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDisplayMenu(!showDisplayMenu);
                  setShowAudioMenu(false);
                  resetControlsTimeout();
                }}
                className={`p-1.5 rounded-lg transition flex items-center justify-center text-xs ${
                  showDisplayMenu ? "bg-rose-600 text-white" : "hover:bg-white/15 text-neutral-300 hover:text-white"
                }`}
                aria-label={`Change display scale mode (Current: ${displayMode})`}
                title={`Display Scale: ${displayMode}`}
              >
                <Crop className="w-4 h-4" />
              </button>
              {showDisplayMenu && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    resetControlsTimeout();
                  }}
                  className="absolute right-0 bottom-full mb-2 bg-neutral-900 border border-neutral-750 rounded-xl p-1.5 shadow-xl w-32 z-30 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 px-2 py-1">
                    Scale Mode
                  </p>
                  {(["fit", "zoom", "stretch"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setDisplayMode(mode);
                        setShowDisplayMenu(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition capitalize ${
                        displayMode === mode ? "bg-rose-600 text-white font-semibold" : "text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      <span>{mode}</span>
                      {displayMode === mode && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Button (Available to all users, even if locked) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
                resetControlsTimeout();
              }}
              className="p-1.5 rounded-lg hover:bg-white/15 transition text-white"
              title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const VideoPlayer = React.memo(VideoPlayerComponent);
