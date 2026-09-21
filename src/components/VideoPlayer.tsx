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
  Headphones
} from "lucide-react";
import { rtdb } from "../lib/firebase";
import { ref, onChildAdded, off, get } from "firebase/database";

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
  isVoiceRecording = false
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

  const onVideoEndedRef = useRef(onVideoEnded);
  onVideoEndedRef.current = onVideoEnded;

  const canControl = isHost || !controlsLocked;

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

  // Auto-hide controls after 2 seconds of inactivity
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    // Auto-hide after 2 seconds:
    // - For locked non-admin users: always auto-hide after 2s of no interaction
    // - For fullscreen playback: always auto-hide after 2s of no interaction
    // - For active playback: auto-hide after 2s of no interaction
    if (!canControl || isFullscreen || isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
        setShowAudioMenu(false);
        controlsTimeoutRef.current = null;
      }, 2000);
    }
  }, [canControl, isFullscreen, isPlaying]);

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

    // Skip if this exact sync update has already been processed
    if (
      lastSyncProcessedRef.current &&
      lastSyncProcessedRef.current.lastUpdated === syncState.lastUpdated
    ) {
      return;
    }

    // If local user initiated this action, record it without resetting or interrupting local playback
    if (syncState.updatedBy === currentUserId) {
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

    // Check drift tolerance (1.5 seconds) against expected current playback time
    let hasMeaningfulSync = false;
    const timeDiff = Math.abs(video.currentTime - expectedTime);
    if (timeDiff > 1.5) {
      video.currentTime = expectedTime;
      setCurrentTime(expectedTime);
      hasMeaningfulSync = true;
    }

    // Match play/pause state
    if (syncState.isPlaying && video.paused) {
      isApplyingRemoteSyncRef.current = true;
      video.play().catch(() => {
        // Autoplay policy fallback: muted play or wait for interaction
        console.warn("Autoplay blocked by browser until user gesture");
      }).finally(() => {
        isApplyingRemoteSyncRef.current = false;
      });
      hasMeaningfulSync = true;
    } else if (!syncState.isPlaying && !video.paused) {
      isApplyingRemoteSyncRef.current = true;
      video.pause();
      isApplyingRemoteSyncRef.current = false;
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
      setShowControls(true);

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
    };

    const onWaiting = () => {
      // Only show buffering indicator if video is not paused, not ended, and actively lacking media data
      if (video && !video.paused && !video.ended && video.readyState < 3) {
        setIsBuffering(true);
      }
    };

    const onStalled = () => {
      if (video && !video.paused && !video.ended && video.readyState < 3) {
        setIsBuffering(true);
      }
    };

    const onPlaying = () => {
      setIsBuffering(false);
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

    const onError = () => {
      setIsBuffering(false);
      const err = video.error;
      let msg = "Playback failed: Unable to load or play video stream.";
      if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        msg = "This device/browser cannot play this video format or codec.";
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
        preload="auto"
        className="w-full h-full object-contain cursor-pointer"
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

      {/* Top-Left Overlays Container (Lock Notice & Fullscreen Chat Overlay) */}
      <div className="absolute top-4 left-4 z-40 flex flex-col items-start gap-2 pointer-events-none max-w-[85vw] sm:max-w-sm">
        {/* Control Lock Notice for non-admin */}
        {!canControl && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/85 backdrop-blur-md border border-amber-500/30 text-amber-400 text-xs font-medium shadow-lg">
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

      {/* Centered Large Play/Pause Animation Overlay (only visible to controllers when paused) */}
      <div
        className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
          showControls && !isPlaying && canControl ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl backdrop-blur-md transform scale-100 transition-transform">
          <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white ml-1" />
        </div>
      </div>

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
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!canControl) return;
                togglePlayPause();
                resetControlsTimeout();
              }}
              disabled={!canControl}
              className={`p-1.5 sm:p-2 rounded-lg transition ${
                canControl ? "hover:bg-white/15 cursor-pointer text-white" : "opacity-40 cursor-not-allowed text-neutral-400"
              }`}
              title={!canControl ? "Playback controls locked by host" : (isPlaying ? "Pause (Space)" : "Play (Space)")}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!canControl) return;
                seekRelative(-10);
                resetControlsTimeout();
              }}
              disabled={!canControl}
              className={`p-1.5 rounded-lg transition ${
                canControl ? "hover:bg-white/15 cursor-pointer text-white" : "opacity-40 cursor-not-allowed text-neutral-400"
              }`}
              title={!canControl ? "Playback controls locked by host" : "Skip backward 10s (Left Arrow)"}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!canControl) return;
                seekRelative(10);
                resetControlsTimeout();
              }}
              disabled={!canControl}
              className={`p-1.5 rounded-lg transition ${
                canControl ? "hover:bg-white/15 cursor-pointer text-white" : "opacity-40 cursor-not-allowed text-neutral-400"
              }`}
              title={!canControl ? "Playback controls locked by host" : "Skip forward 10s (Right Arrow)"}
            >
              <RotateCw className="w-4 h-4" />
            </button>

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
