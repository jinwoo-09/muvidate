import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { rtdb, deleteExpiredRoomIfExpired } from "../lib/firebase";
import { ref, onValue, off, update, set, push, onDisconnect } from "firebase/database";
import { Room, RoomParticipant } from "../types";
import { getVideoDuration, formatVideoTime } from "../lib/videoUtils";
import { VideoPlayer } from "./VideoPlayer";
import { RoomChat } from "./RoomChat";
import { ChangeMediaModal } from "./ChangeMediaModal";
import { SeriesStructure, extractSeriesStructure, getEpisodeUrl } from "../lib/seriesUtils";
import { 
  Copy, 
  Check, 
  Share2, 
  Users, 
  Shield, 
  Lock, 
  Unlock, 
  LogOut, 
  AlertCircle, 
  HardDrive, 
  Film, 
  CheckCircle2, 
  Clock, 
  ArrowLeft,
  RefreshCw,
  Loader2,
  Smartphone 
} from "lucide-react";

interface WatchRoomProps {
  roomCode: string;
  initialOfflineFile?: File;
  onLeaveRoom: () => void;
}

export function WatchRoom({ roomCode, initialOfflineFile, onLeaveRoom }: WatchRoomProps) {
  const { user, profile } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local video state for offline video file
  const [localVideoUrl, setLocalVideoUrl] = useState<string>("");
  const [localFileName, setLocalFileName] = useState<string>("");
  const [offlineDurationError, setOfflineDurationError] = useState<string | null>(null);
  const [isExtractingDuration, setIsExtractingDuration] = useState(false);

  const activeObjectUrlRef = useRef<string>("");
  useEffect(() => {
    activeObjectUrlRef.current = localVideoUrl;
  }, [localVideoUrl]);

  useEffect(() => {
    return () => {
      if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      }
    };
  }, []);

  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "participants">("chat");
  const [showParticipantsMobile, setShowParticipantsMobile] = useState(false);
  const [isChangeMediaOpen, setIsChangeMediaOpen] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  // Throttled sync updates
  const lastSyncWriteTime = useRef<number>(0);

  // Determine series structure for current room media
  const roomSeriesStructure = useMemo<SeriesStructure | undefined>(() => {
    if (!room || room.movieSource === "offline") return undefined;
    const structure = extractSeriesStructure(room.seriesUrls || room.movieUrl || "");
    return structure.isSeries ? structure : undefined;
  }, [room?.movieSource, room?.seriesUrls, room?.movieUrl]);

  // Determine video playback source with memoization at top level (unconditional hook execution)
  const effectiveVideoSrc = useMemo(() => {
    if (!room) return "";
    if (room.movieSource === "offline") {
      return localVideoUrl || "";
    }
    // If room has currentEpisodeUrl, use it; otherwise fallback to movieUrl
    if (room.currentEpisodeUrl && room.currentEpisodeUrl.trim()) {
      return room.currentEpisodeUrl;
    }
    // If room is detected as series, default to current season and episode
    if (roomSeriesStructure && roomSeriesStructure.isSeries) {
      const epUrl = getEpisodeUrl(roomSeriesStructure, room.season || 1, room.episode || 1);
      if (epUrl) return epUrl;
    }
    return room.movieUrl || "";
  }, [room?.movieSource, room?.movieUrl, room?.currentEpisodeUrl, room?.season, room?.episode, roomSeriesStructure, localVideoUrl]);

  // Determine effective subtitle for current season (supports subtitle, subtitle2, subtitle3, etc.)
  const effectiveSubtitle = useMemo(() => {
    if (!room || room.movieSource === "offline") return undefined;
    const currentSeason = room.season || 1;
    const seasonSubtitleKey = currentSeason === 1 ? "subtitle" : `subtitle${currentSeason}`;
    return (room as any)[seasonSubtitleKey] || room.subtitle;
  }, [room?.movieSource, room?.season, room?.subtitle, (room as any)?.subtitle2, (room as any)?.subtitle3]);

  const handleOfflineFileSelected = useCallback((file: File) => {
    if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    setLocalVideoUrl(url);
    setLocalFileName(file.name);
    setOfflineDurationError(null);
  }, []);

  // Handle initial offline file if host passed it during creation
  useEffect(() => {
    if (initialOfflineFile) {
      if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      }
      const url = URL.createObjectURL(initialOfflineFile);
      setLocalVideoUrl(url);
      setLocalFileName(initialOfflineFile.name);
    }
  }, [initialOfflineFile]);

  const isHost = user?.uid === room?.adminUid;
  const lastProcessedMediaKeyRef = useRef<string>("");

  const hasPostedJoinRef = useRef(false);
  const isInitialSnapshotRef = useRef(false);
  const prevParticipantsRef = useRef<Record<string, boolean>>({});
  const lastPresenceMessageTimestampRef = useRef<Record<string, { status: boolean; time: number }>>({});
  const latestPlaybackStateRef = useRef<{
    isPlaying: boolean;
    currentTime: number;
    lastUpdated: number;
  } | null>(null);

  const postSystemMessage = useCallback((text: string) => {
    const chatRef = ref(rtdb, `rooms/${roomCode}/chat`);
    const newMsgRef = push(chatRef);
    set(newMsgRef, {
      id: newMsgRef.key || Date.now().toString(),
      uid: "system",
      username: "System",
      type: "system",
      text,
      createdAt: Date.now()
    }).catch(console.error);
  }, [roomCode]);

  // Handle user explicitly leaving the room (click Leave Room, Back to Home, etc.)
  const handleExplicitLeaveRoom = useCallback(() => {
    if (user && profile && roomCode) {
      // Save latest valid video playback timeline
      if (latestPlaybackStateRef.current && (isHost || !room?.controlsLocked)) {
        const lastPlayback = latestPlaybackStateRef.current;
        if (lastPlayback.currentTime > 0) {
          const playbackRef = ref(rtdb, `rooms/${roomCode}/playbackState`);
          update(playbackRef, {
            isPlaying: lastPlayback.isPlaying,
            currentTime: lastPlayback.currentTime,
            lastUpdated: Date.now(),
            updatedBy: user.uid,
            updatedByUsername: profile.username
          }).catch(() => {});
        }
      }

      // Mark participant as offline and cancel onDisconnect
      const participantRef = ref(rtdb, `rooms/${roomCode}/participants/${user.uid}`);
      onDisconnect(participantRef).cancel().catch(() => {});
      update(participantRef, {
        isOnline: false,
        lastActive: Date.now()
      }).catch(() => {});

      // Post system leave message
      postSystemMessage(`@${profile.username} has left the room.`);
    }
    onLeaveRoom();
  }, [user, profile, roomCode, isHost, room?.controlsLocked, postSystemMessage, onLeaveRoom]);

  useEffect(() => {
    if (!room) return;

    if (room.movieSource !== "offline") {
      if (localVideoUrl) {
        if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith("blob:")) {
          URL.revokeObjectURL(activeObjectUrlRef.current);
        }
        setLocalVideoUrl("");
        setLocalFileName("");
        setOfflineDurationError(null);
      }
      lastProcessedMediaKeyRef.current = `${room.movieSource}:${room.movieUrl}`;
    } else {
      const currentKey = `offline:${room.offlineFileName}:${room.offlineDuration}`;
      // Only reset localVideoUrl on actual media switches after room has already initialized
      if (lastProcessedMediaKeyRef.current !== "" && lastProcessedMediaKeyRef.current !== currentKey) {
        if (localVideoUrl && !isHost) {
          if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith("blob:")) {
            URL.revokeObjectURL(activeObjectUrlRef.current);
          }
          setLocalVideoUrl("");
          setLocalFileName("");
          setOfflineDurationError(null);
        }
      }
      lastProcessedMediaKeyRef.current = currentKey;
    }
  }, [room?.movieSource, room?.offlineFileName, room?.offlineDuration, room?.movieUrl, isHost, localVideoUrl]);

  // Subscribe to RTDB room changes
  useEffect(() => {
    const roomRef = ref(rtdb, `rooms/${roomCode}`);

    const handleRoomData = (snapshot: any) => {
      setLoading(false);
      const data = snapshot.val();
      if (!data) {
        setError(`Room #${roomCode} does not exist or has been removed.`);
        return;
      }

      // Check 24 hour expiration
      if (data.expiresAt && Date.now() > data.expiresAt) {
        deleteExpiredRoomIfExpired(roomCode, data.expiresAt).catch(() => {});
        setError(`Room #${roomCode} has expired (24-hour limit reached).`);
        return;
      }

      setRoom((prev) => {
        if (!prev) return data;

        // Isolate chat changes: WatchRoom does not render data.chat directly
        // Chat is handled independently in RoomChat.tsx and VideoPlayer's fullscreen overlay
        const isPlaybackIdentical =
          prev.playbackState?.lastUpdated === data.playbackState?.lastUpdated &&
          prev.playbackState?.isPlaying === data.playbackState?.isPlaying &&
          prev.playbackState?.currentTime === data.playbackState?.currentTime &&
          prev.playbackState?.audioTrackIndex === data.playbackState?.audioTrackIndex &&
          prev.playbackState?.updatedBy === data.playbackState?.updatedBy;

        const isMetadataIdentical =
          prev.adminUid === data.adminUid &&
          prev.movieTitle === data.movieTitle &&
          prev.moviePoster === data.moviePoster &&
          prev.movieUrl === data.movieUrl &&
          prev.movieSource === data.movieSource &&
          prev.offlineFileName === data.offlineFileName &&
          prev.movieCompleted === data.movieCompleted &&
          prev.controlsLocked === data.controlsLocked &&
          prev.expiresAt === data.expiresAt &&
          prev.season === data.season &&
          prev.episode === data.episode &&
          prev.currentEpisodeUrl === data.currentEpisodeUrl &&
          prev.subtitle === data.subtitle &&
          (prev as any).subtitle2 === (data as any).subtitle2 &&
          (prev as any).subtitle3 === (data as any).subtitle3 &&
          prev.seriesUrls === data.seriesUrls;

        // Compare participants active count
        const prevParticipants = prev.participants || {};
        const newParticipants = data.participants || {};
        const prevKeys = Object.keys(prevParticipants);
        const newKeys = Object.keys(newParticipants);
        const isParticipantsIdentical =
          prevKeys.length === newKeys.length &&
          prevKeys.every((k) => prevParticipants[k]?.isOnline === newParticipants[k]?.isOnline);

        // If only chat or internal noise changed, keep previous reference to prevent re-renders
        if (isPlaybackIdentical && isMetadataIdentical && isParticipantsIdentical) {
          return prev;
        }

        // Preserve playbackState object reference if playback did not change
        if (isPlaybackIdentical) {
          return {
            ...data,
            playbackState: prev.playbackState
          };
        }

        return data;
      });
    };

    onValue(roomRef, handleRoomData);

    return () => {
      off(roomRef, "value", handleRoomData);
    };
  }, [roomCode]);

  // Robust Network Restore & User Presence Management with Firebase RTDB .info/connected
  useEffect(() => {
    if (!roomCode || !user || !profile) return;

    const connectedRef = ref(rtdb, ".info/connected");
    const participantRef = ref(rtdb, `rooms/${roomCode}/participants/${user.uid}`);

    // Mark online immediately upon component mount/join
    update(participantRef, {
      isOnline: true,
      username: profile.username,
      photoURL: profile.photoURL || "",
      lastActive: Date.now()
    }).catch(() => {});

    // Register onDisconnect handler
    onDisconnect(participantRef).update({
      isOnline: false,
      lastActive: Date.now()
    }).catch(() => {});

    const handleConnectionChange = (snap: any) => {
      const isConnected = snap.val() === true;
      if (isConnected) {
        // Immediately write/update presence as online/active upon successful connection/reconnect
        update(participantRef, {
          isOnline: true,
          username: profile.username,
          photoURL: profile.photoURL || "",
          lastActive: Date.now()
        }).catch(() => {});

        // Re-register onDisconnect handler because Firebase disconnect triggers are connection-specific
        onDisconnect(participantRef).update({
          isOnline: false,
          lastActive: Date.now()
        }).catch(() => {});
      }
    };

    onValue(connectedRef, handleConnectionChange);

    // Also touch presence on browser online event and window focus to guarantee immediate recovery
    const handleBrowserOnlineOrFocus = () => {
      if (navigator.onLine) {
        update(participantRef, {
          isOnline: true,
          lastActive: Date.now()
        }).catch(() => {});
      }
    };

    window.addEventListener("online", handleBrowserOnlineOrFocus);
    window.addEventListener("focus", handleBrowserOnlineOrFocus);
    document.addEventListener("visibilitychange", handleBrowserOnlineOrFocus);

    return () => {
      off(connectedRef, "value", handleConnectionChange);
      window.removeEventListener("online", handleBrowserOnlineOrFocus);
      window.removeEventListener("focus", handleBrowserOnlineOrFocus);
      document.removeEventListener("visibilitychange", handleBrowserOnlineOrFocus);

      // Cancel onDisconnect on clean component teardown
      onDisconnect(participantRef).cancel().catch(() => {});
    };
  }, [roomCode, user?.uid, profile?.username, profile?.photoURL]);

  // Post system message when current user joins
  useEffect(() => {
    if (user && profile && roomCode && !hasPostedJoinRef.current) {
      hasPostedJoinRef.current = true;
      postSystemMessage(`@${profile.username} has joined the room.`);
    }
  }, [user, profile, roomCode, postSystemMessage]);

  // Persist final room playback timeline on unmount
  useEffect(() => {
    return () => {
      if (user && profile && roomCode) {
        // Save latest valid video playback timeline so rejoining resumes at last valid position
        if (latestPlaybackStateRef.current && (isHost || !room?.controlsLocked)) {
          const lastPlayback = latestPlaybackStateRef.current;
          if (lastPlayback.currentTime > 0) {
            const playbackRef = ref(rtdb, `rooms/${roomCode}/playbackState`);
            update(playbackRef, {
              isPlaying: lastPlayback.isPlaying,
              currentTime: lastPlayback.currentTime,
              lastUpdated: Date.now(),
              updatedBy: user.uid,
              updatedByUsername: profile.username
            }).catch(() => {});
          }
        }
      }
    };
  }, [user, profile, roomCode, isHost, room?.controlsLocked]);

  // Track other participants' online status changes for abrupt disconnects
  useEffect(() => {
    if (!room || !room.participants || !user) return;

    const currentParticipants = room.participants;
    const prevParticipants = prevParticipantsRef.current;

    // On the first snapshot, simply record initial participant states without emitting any messages
    if (!isInitialSnapshotRef.current) {
      isInitialSnapshotRef.current = true;
      const initialStatuses: Record<string, boolean> = {};
      Object.entries(currentParticipants).forEach(([uid, p]) => {
        initialStatuses[uid] = !!p.isOnline;
      });
      prevParticipantsRef.current = initialStatuses;
      return;
    }

    const isHostOnline = room.participants[room.adminUid]?.isOnline;
    const isCurrentUserHost = user.uid === room.adminUid;

    const activeParticipants = Object.values(room.participants)
      .filter((p) => p.isOnline)
      .sort((a, b) => a.uid.localeCompare(b.uid));

    const isResponsibleForOthers = isCurrentUserHost || (!isHostOnline && activeParticipants[0]?.uid === user.uid);
    const now = Date.now();

    Object.entries(currentParticipants).forEach(([uid, p]) => {
      if (uid === user.uid) return;

      const wasOnline = prevParticipants[uid] === true;
      const isOnline = p.isOnline === true;

      if (wasOnline && !isOnline) {
        const lastRecord = lastPresenceMessageTimestampRef.current[uid];
        // Ensure at least 3 seconds between repeated presence messages for the same user
        if (!lastRecord || lastRecord.status !== false || now - lastRecord.time > 3000) {
          lastPresenceMessageTimestampRef.current[uid] = { status: false, time: now };
          if (isResponsibleForOthers) {
            postSystemMessage(`@${p.username} has left the room.`);
          }
        }
      }
    });

    const nextStatuses: Record<string, boolean> = {};
    Object.entries(currentParticipants).forEach(([uid, p]) => {
      nextStatuses[uid] = !!p.isOnline;
    });
    prevParticipantsRef.current = nextStatuses;
  }, [room?.participants, user?.uid, roomCode, postSystemMessage]);

// Sync state emitter from VideoPlayer
  const handlePlaybackChange = useCallback((state: { isPlaying: boolean; currentTime: number }) => {
    if (!room || !user || !profile) return;
    const now = Date.now();
    latestPlaybackStateRef.current = {
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      lastUpdated: now
    };
    if (room.controlsLocked && !isHost) return;

    // Throttle frequent updates to avoid spamming RTDB
    lastSyncWriteTime.current = now;

    const playbackRef = ref(rtdb, `rooms/${roomCode}/playbackState`);
    update(playbackRef, {
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      lastUpdated: now,
      updatedBy: user.uid,
      updatedByUsername: profile.username
    }).catch(console.error);
  }, [room?.controlsLocked, isHost, roomCode, user, profile]);

  // Audio track sync
  const handleAudioTrackChange = useCallback((index: number) => {
    if (!room || !user || !profile) return;
    if (room.controlsLocked && !isHost) return;

    const playbackRef = ref(rtdb, `rooms/${roomCode}/playbackState`);
    update(playbackRef, {
      audioTrackIndex: index,
      lastUpdated: Date.now(),
      updatedBy: user.uid,
      updatedByUsername: profile.username
    }).catch(console.error);
  }, [room?.controlsLocked, isHost, roomCode, user, profile]);

  // Admin toggling control lock
  const handleToggleControlLock = async () => {
    if (!isHost || !room) return;
    const roomRef = ref(rtdb, `rooms/${roomCode}`);
    await update(roomRef, {
      controlsLocked: !room.controlsLocked
    });
  };

  // Series Episode / Season Selection handler with RTDB synchronization
  const handleSelectEpisode = useCallback((seasonNum: number, episodeNum: number, episodeUrl: string) => {
    if (!room) return;
    const canControl = isHost || !room.controlsLocked;
    if (!canControl) return;

    const roomRef = ref(rtdb, `rooms/${roomCode}`);
    const now = Date.now();
    update(roomRef, {
      season: seasonNum,
      episode: episodeNum,
      currentEpisodeUrl: episodeUrl,
      playbackState: {
        isPlaying: true,
        currentTime: 0,
        lastUpdated: now,
        updatedBy: user?.uid || "unknown",
        audioTrackIndex: 0
      }
    }).catch(console.error);

    postSystemMessage(`Switched to Season ${seasonNum}, Episode ${episodeNum}`);
  }, [room, isHost, roomCode, user?.uid, postSystemMessage]);

  // Handle movie natural completion
  const handleVideoEnded = useCallback(async () => {
    if (!roomCode) return;
    try {
      // Auto-advance if this is a series and there is a next episode in this season
      if (roomSeriesStructure && roomSeriesStructure.isSeries && room) {
        const currentSeasonNum = room.season || 1;
        const currentEpNum = room.episode || 1;
        const currentSeasonData = roomSeriesStructure.seasons.find((s) => s.seasonNumber === currentSeasonNum);
        const nextEp = currentSeasonData?.episodes.find((ep) => ep.episodeNumber === currentEpNum + 1);

        if (nextEp && isHost) {
          handleSelectEpisode(currentSeasonNum, nextEp.episodeNumber, nextEp.url);
          return;
        }
      }

      // 1. Mark movie as completed
      const roomRef = ref(rtdb, `rooms/${roomCode}`);
      await update(roomRef, {
        movieCompleted: true,
        "playbackState/isPlaying": false
      });

      // 2. Clear room chat/voice notes as required in Section 16 & 17
      const chatRef = ref(rtdb, `rooms/${roomCode}/chat`);
      await set(chatRef, null);
    } catch (err) {
      console.error("Error finalizing completed movie:", err);
    }
  }, [roomCode, roomSeriesStructure, room, isHost, handleSelectEpisode]);

  // Replay movie option for host
  const handleReplayMovie = async () => {
    if (!isHost || !room) return;
    const roomRef = ref(rtdb, `rooms/${roomCode}`);
    await update(roomRef, {
      movieCompleted: false,
      "playbackState/isPlaying": false,
      "playbackState/currentTime": 0
    });
  };

  // Copy room code
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Share using Web Share API or copy
  const shareRoom = async () => {
    const shareText = `Join my watch party on MuviDate! Room Code: ${roomCode}`;
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "MuviDate Watch Room",
          text: shareText,
          url: shareUrl
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch (err) {
        // Fallback to clipboard
      }
    }
    copyRoomCode();
  };

  // Handle participant selecting their offline file
  const handleOfflineFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOfflineDurationError(null);
    setIsExtractingDuration(true);

    try {
      const localDuration = await getVideoDuration(file);

      // Verify duration against room's expected offlineDuration
      if (room && room.offlineDuration && room.offlineDuration > 0) {
        const durationDiff = Math.abs(localDuration - room.offlineDuration);
        if (durationDiff > 1.5) { // 1.5s tolerance
          setOfflineDurationError(
            `This video duration does not match the room video. Please select the same video. (Expected ~${formatVideoTime(room.offlineDuration)}, selected file is ${formatVideoTime(localDuration)})`
          );
          setIsExtractingDuration(false);
          e.target.value = "";
          return;
        }
      }

      if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      }

      const url = URL.createObjectURL(file);
      setLocalVideoUrl(url);
      setLocalFileName(file.name);

      if (user) {
        const participantRef = ref(rtdb, `rooms/${roomCode}/participants/${user.uid}`);
        update(participantRef, { hasOfflineFile: true }).catch(() => {});
      }
    } catch (err: any) {
      setOfflineDurationError(
        err.message || "This device/browser cannot play or decode this video format."
      );
    } finally {
      setIsExtractingDuration(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
        <div className="w-12 h-12 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin mb-4" />
        <h3 className="text-lg font-bold text-white">Connecting to Watch Room #{roomCode}...</h3>
        <p className="text-xs text-neutral-400 mt-1">Synchronizing room state and media stream</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6 max-w-md mx-auto">
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold font-heading text-white mb-2">Room Inactive</h3>
        <p className="text-sm text-neutral-400 mb-6">{error || "This watch room is no longer accessible."}</p>
        <button
          onClick={handleExplicitLeaveRoom}
          className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>
    );
  }

  const isOfflineSource = room.movieSource === "offline";
  const participantsList = room.participants ? Object.values(room.participants) : [];
  const activeParticipantsCount = participantsList.filter((p) => p.isOnline).length;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Top Navigation & Status Bar - Normal scrolling element */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900/90 border border-neutral-800 rounded-2xl backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExplicitLeaveRoom}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition flex items-center gap-1.5 text-xs font-semibold"
            title="Leave Room"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Leave Room</span>
          </button>

          <div className="h-4 w-px bg-neutral-800" />

          {/* Room Code Badge */}
          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
              Code:
            </span>
            <span className="font-mono text-base font-extrabold tracking-widest text-white">
              {room.roomCode}
            </span>
            <button
              onClick={copyRoomCode}
              className="p-1 text-neutral-400 hover:text-white rounded transition"
              title="Copy 4-digit code"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={shareRoom}
              className="p-1 text-neutral-400 hover:text-white rounded transition"
              title="Share Room"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center/Right: Movie Title & Host Controls */}
        <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white truncate max-w-[160px] sm:max-w-xs">
              {room.movieTitle}
            </span>
            {isOfflineSource && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Offline Video
              </span>
            )}
          </div>

          {/* Change Media Option */}
          <button
            onClick={() => setIsChangeMediaOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white border border-neutral-700 transition shadow-sm hover:border-rose-500/50"
            title="Change Media Source (Search, MP4 URL, Offline Video)"
          >
            <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
            <span>Change Media</span>
          </button>

          {/* Host Admin Controls Lock Toggle */}
          {isHost ? (
            <button
              onClick={handleToggleControlLock}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                room.controlsLocked
                  ? "bg-rose-500/15 border-rose-500 text-rose-300"
                  : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white"
              }`}
              title="Toggle whether participants can play/pause/seek"
            >
              {room.controlsLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span>Controls: Host Only</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Controls: Open</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 px-2 py-1 rounded-lg bg-neutral-950">
              {room.controlsLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px]">Host Controls Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px]">Controls Open</span>
                </>
              )}
            </div>
          )}

          {/* Online count */}
          <div className="flex items-center gap-1.5 text-xs text-neutral-300 bg-neutral-950 px-2.5 py-1.5 rounded-xl border border-neutral-800">
            <Users className="w-3.5 h-3.5 text-rose-500" />
            <span>{activeParticipantsCount} online</span>
          </div>
        </div>
      </div>

      {/* Offline Video Prompt for Participants */}
      {isOfflineSource && !localVideoUrl && (
        <div className="p-4 sm:p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl animate-in fade-in space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl shrink-0 mt-0.5">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  This room is using an offline video file
                </h4>
                <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                  Expected file: <strong className="text-amber-300">"{room.offlineFileName || room.movieTitle}"</strong>
                  {room.offlineDuration ? (
                    <span> (Duration: <strong className="text-amber-300">{formatVideoTime(room.offlineDuration)}</strong>)</span>
                  ) : null}.
                  Select your local copy of this video from your device to watch together with synchronized playback.
                </p>
              </div>
            </div>

            <label className={`px-4 py-2.5 ${isExtractingDuration ? "bg-amber-800 cursor-wait" : "bg-amber-600 hover:bg-amber-500 cursor-pointer"} text-white text-xs font-semibold rounded-xl shadow-lg transition shrink-0 flex items-center gap-2`}>
              {isExtractingDuration ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking file...</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  <span>Select File on Your Device</span>
                </>
              )}
              <input
                type="file"
                accept="video/*"
                disabled={isExtractingDuration}
                className="hidden"
                onChange={handleOfflineFileSelect}
              />
            </label>
          </div>

          {offlineDurationError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{offlineDurationError}</span>
            </div>
          )}

          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[11px] flex flex-col gap-1 sm:gap-1.5 mt-2">
            <p className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 shrink-0 text-emerald-400" />
              Using Android?
            </p>
            <p className="text-neutral-300 leading-relaxed">
              Android Chrome has limited video codec support. For the best playback experience and codec compatibility, we highly recommend downloading and installing our native Android app:
            </p>
            <a
              href="https://github.com/jinwoo-09/muvidate/releases/download/1.0/Muvidate_1.0.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 font-semibold underline break-all"
            >
              https://github.com/jinwoo-09/muvidate/releases/download/1.0/Muvidate_1.0.apk
            </a>
          </div>
        </div>
      )}

      {/* Movie Completed Banner */}
      {room.movieCompleted && (
        <div className="p-5 bg-gradient-to-r from-neutral-900 to-neutral-850 border border-neutral-750 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-xl shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">The movie has finished!</h4>
              <p className="text-xs text-neutral-400 mt-0.5">
                Watch session ended. Real-time chat & voice notes have been cleared.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsChangeMediaOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Change Media</span>
            </button>
            {isHost && (
              <button
                onClick={handleReplayMovie}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-750 text-white text-xs font-semibold rounded-xl transition"
              >
                Replay Movie
              </button>
            )}
            <button
              onClick={handleExplicitLeaveRoom}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition"
            >
              Browse Movies
            </button>
          </div>
        </div>
      )}

      {/* Main Watch Room Grid: Video Player (Left) + Chat / Participants (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Video Player Column */}
        <div className="contents lg:block lg:col-span-8 lg:space-y-4">
          {/* Sticky Video Player Container - Pinned at top-0 with z-9999 only once scrolled to top */}
          <div
            className="sticky top-0 z-[9999] bg-neutral-950/95 py-2 -mx-1 px-1 rounded-2xl"
            style={{
              zIndex: 9999,
              top: 0
            }}
          >
            {effectiveVideoSrc ? (
              <VideoPlayer
                src={effectiveVideoSrc}
                poster={room.moviePoster}
                isHost={isHost}
                controlsLocked={room.controlsLocked}
                syncState={room.playbackState}
                onPlaybackChange={handlePlaybackChange}
                onAudioTrackChange={handleAudioTrackChange}
                onVideoEnded={handleVideoEnded}
                roomCode={roomCode}
                currentUserId={user?.uid}
                isVoiceRecording={isVoiceRecording}
                seriesStructure={roomSeriesStructure}
                currentSeason={room.season || 1}
                currentEpisode={room.episode || 1}
                onSelectEpisode={handleSelectEpisode}
                subtitle={effectiveSubtitle}
              />
            ) : (
              <div className="w-full aspect-video bg-neutral-900/90 border border-neutral-800 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
                <HardDrive className="w-12 h-12 text-neutral-600 mb-3" />
                <h4 className="text-base font-bold text-white">Offline Video Needed</h4>
                <p className="text-xs text-neutral-400 max-w-md mt-1 mb-4">
                  Please select your local copy of "{room.offlineFileName || room.movieTitle}" using the button above to begin playback.
                </p>
                <button
                  onClick={() => setIsChangeMediaOpen(true)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-rose-400 text-xs font-semibold rounded-xl border border-neutral-700 transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Or Switch to Another Media</span>
                </button>
              </div>
            )}
          </div>

          {/* Room Details Accordion / Info Card */}
          <div className="p-4 bg-neutral-900/80 border border-neutral-800 rounded-2xl backdrop-blur-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-800 flex items-center justify-center text-rose-500 font-bold">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white">{room.movieTitle}</p>
                  {roomSeriesStructure?.isSeries && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-semibold border border-rose-500/30">
                      S{room.season || 1} : EP{room.episode || 1}
                    </span>
                  )}
                </div>
                <p className="text-neutral-400 text-[11px]">
                  Hosted by <span className="text-neutral-200">@{room.adminUsername}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsChangeMediaOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600/15 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white transition shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Change Media</span>
              </button>
              <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] bg-neutral-950 px-2.5 py-1.5 rounded-xl border border-neutral-800">
                <Clock className="w-3.5 h-3.5" />
                <span>24h Expiry</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat & Participants Column */}
        <div className="lg:col-span-4 flex flex-col h-[520px] lg:h-[550px] lg:max-h-[70vh] min-h-[480px]">
          {/* Tabs for Mobile/Desktop */}
          <div className="flex items-center gap-1 p-1 bg-neutral-950 rounded-xl border border-neutral-800 mb-2">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === "chat"
                  ? "bg-rose-600 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Live Chat
            </button>
            <button
              onClick={() => setActiveTab("participants")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === "participants"
                  ? "bg-rose-600 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <span>Participants</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-neutral-800 rounded-full">
                {participantsList.length}
              </span>
            </button>
          </div>

          {/* Active Tab View */}
          <div className="flex-1 min-h-0">
            {activeTab === "chat" ? (
              <RoomChat
                roomCode={roomCode}
                adminUid={room.adminUid}
                isMovieCompleted={room.movieCompleted}
                onRecordingStateChange={setIsVoiceRecording}
              />
            ) : (
              <div className="h-full bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 overflow-y-auto">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
                  In Watch Room ({participantsList.length})
                </h4>
                <div className="space-y-2.5">
                  {participantsList.map((p) => {
                    const isUserHost = p.uid === room.adminUid;
                    const isMe = p.uid === user?.uid;
                    const initials = p.username ? p.username.slice(0, 2).toUpperCase() : "U";

                    return (
                      <div
                        key={p.uid}
                        className="flex items-center justify-between p-2.5 bg-neutral-950/80 rounded-xl border border-neutral-800"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-300">
                              {p.photoURL ? (
                                <img
                                  src={p.photoURL}
                                  alt={p.username}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span>{initials}</span>
                              )}
                            </div>
                            <span
                              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-neutral-900 ${
                                p.isOnline ? "bg-emerald-500" : "bg-neutral-600"
                              }`}
                            />
                          </div>

                          <div className="truncate">
                            <p className="text-xs font-semibold text-white truncate">
                              @{p.username} {isMe && <span className="text-neutral-400 font-normal">(You)</span>}
                            </p>
                            <p className="text-[10px] text-neutral-500">
                              {p.isOnline ? "Active" : "Away"}
                            </p>
                          </div>
                        </div>

                        {isUserHost && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md">
                            <Shield className="w-3 h-3" /> Host
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Change Media Modal */}
      <ChangeMediaModal
        isOpen={isChangeMediaOpen}
        onClose={() => setIsChangeMediaOpen(false)}
        roomCode={roomCode}
        currentMovieTitle={room.movieTitle}
        isHost={isHost}
        controlsLocked={room.controlsLocked}
        onOfflineFileSelected={handleOfflineFileSelected}
      />
    </div>
  );
}
