import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { 
  generateUniqueRoomCode, 
  checkAndIncrementDailyRoomLimit, 
  rtdb 
} from "../lib/firebase";
import { ref, set } from "firebase/database";
import { Movie, Room } from "../types";
import { getVideoDuration, formatVideoTime } from "../lib/videoUtils";
import { 
  X, 
  Tv, 
  Link as LinkIcon, 
  HardDrive, 
  Film, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  Lock,
  Search,
  Check,
  Smartphone
} from "lucide-react";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  movies: Movie[];
  initialMovie?: Movie | null;
  onRoomCreated: (roomCode: string, offlineFile?: File) => void;
}

export function CreateRoomModal({
  isOpen,
  onClose,
  movies,
  initialMovie,
  onRoomCreated
}: CreateRoomModalProps) {
  const { user, profile } = useAuth();
  const [sourceType, setSourceType] = useState<"firestore" | "direct" | "offline">(
    initialMovie ? "firestore" : "firestore"
  );

  // Source selection states
  const [selectedMovieId, setSelectedMovieId] = useState<string>(
    initialMovie ? initialMovie.id : (movies[0]?.id || "")
  );
  const [movieSearchQuery, setMovieSearchQuery] = useState("");
  const [directTitle, setDirectTitle] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [offlineFile, setOfflineFile] = useState<File | null>(null);

  const [controlsLocked, setControlsLocked] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update selected movie if initialMovie or movies list changes
  useEffect(() => {
    if (initialMovie) {
      setSelectedMovieId(initialMovie.id);
      setSourceType("firestore");
    } else if (!selectedMovieId && movies.length > 0) {
      setSelectedMovieId(movies[0].id);
    }
  }, [initialMovie, movies, selectedMovieId]);

  // Filter movies based on search query in the popup
  const filteredMovies = useMemo(() => {
    const q = movieSearchQuery.trim().toLowerCase();
    if (!q) return movies;
    return movies.filter((m) => {
      return (
        m.Title.toLowerCase().includes(q) ||
        (m.genre && m.genre.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.year && m.year.toString().includes(q))
      );
    });
  }, [movies, movieSearchQuery]);

  // Auto-select first matching movie if current selection is filtered out
  useEffect(() => {
    if (sourceType === "firestore" && filteredMovies.length > 0) {
      const isSelectedInList = filteredMovies.some((m) => m.id === selectedMovieId);
      if (!isSelectedInList) {
        setSelectedMovieId(filteredMovies[0].id);
      }
    }
  }, [filteredMovies, selectedMovieId, sourceType]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) {
      setError("Please wait for user authentication to complete.");
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      // 1. Enforce 4-room daily creation limit
      const limitCheck = await checkAndIncrementDailyRoomLimit(user.uid);
      if (!limitCheck.allowed) {
        setError(
          "Daily limit reached: You can create a maximum of 4 watch rooms per calendar day. You have already created 4 rooms today."
        );
        setIsCreating(false);
        return;
      }

      // 2. Generate unique 4-digit code
      const roomCode = await generateUniqueRoomCode();

      // 3. Prepare room payload
      let movieTitle = "Shared Video";
      let moviePoster = "";
      let movieUrl = "";
      let movieId = "";
      let offlineFileName = "";
      let offlineDuration: number | undefined = undefined;

      if (sourceType === "firestore") {
        const found = movies.find((m) => m.id === selectedMovieId);
        if (!found) {
          setError("Please select a movie from the list.");
          setIsCreating(false);
          return;
        }
        movieId = found.id;
        movieTitle = found.Title;
        moviePoster = (found.cover && found.cover.trim() !== "") ? found.cover : (found.poster || "");
        movieUrl = found.url;
      } else if (sourceType === "direct") {
        if (!directUrl.trim()) {
          setError("Please enter a valid video URL.");
          setIsCreating(false);
          return;
        }
        movieTitle = directTitle.trim() || "Direct Video Stream";
        movieUrl = directUrl.trim();
      } else if (sourceType === "offline") {
        if (!offlineFile) {
          setError("Please choose a local video file from your device.");
          setIsCreating(false);
          return;
        }
        try {
          offlineDuration = await getVideoDuration(offlineFile);
        } catch (durErr: any) {
          setError(durErr.message || "This device/browser cannot play or decode this video format.");
          setIsCreating(false);
          return;
        }
        movieTitle = offlineFile.name.replace(/\.[^/.]+$/, "");
        offlineFileName = offlineFile.name;
        movieUrl = `offline://${offlineFile.name}`;
      }

      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours lifecycle

      const roomData: any = {
        roomCode,
        adminUid: user.uid,
        adminUsername: profile.username,
        movieSource: sourceType,
        movieTitle,
        movieUrl,
        playbackState: {
          isPlaying: false,
          currentTime: 0,
          lastUpdated: now,
          updatedBy: user.uid,
          updatedByUsername: profile.username
        },
        controlsLocked,
        movieCompleted: false,
        createdAt: now,
        expiresAt,
        participants: {
          [user.uid]: {
            uid: user.uid,
            username: profile.username,
            photoURL: profile.photoURL || "",
            joinedAt: now,
            isOnline: true,
            hasOfflineFile: sourceType === "offline"
          }
        }
      };

      if (movieId) {
        roomData.movieId = movieId;
      }
      if (moviePoster) {
        roomData.moviePoster = moviePoster;
      }
      if (sourceType === "offline") {
        if (offlineFileName) {
          roomData.offlineFileName = offlineFileName;
        }
        if (typeof offlineDuration === "number" && Number.isFinite(offlineDuration) && offlineDuration > 0) {
          roomData.offlineDuration = offlineDuration;
        }
      }

      // Save room to Realtime Database
      const roomRef = ref(rtdb, `rooms/${roomCode}`);
      await set(roomRef, roomData);

      onRoomCreated(roomCode, offlineFile || undefined);
    } catch (err: any) {
      console.error("Room creation error:", err);
      setError(err.message || "Failed to create watch room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative my-8">
        <button
          onClick={onClose}
          disabled={isCreating}
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/20">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-heading text-white">Create Watch Room</h3>
            <p className="text-xs text-neutral-400">
              Watch together in real-time with synchronized playback, live chat & voice notes.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-5">
          {/* Source Type Tabs */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
              Select Video Source
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-neutral-950 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setSourceType("firestore")}
                className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  sourceType === "firestore"
                    ? "bg-rose-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Library</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceType("direct")}
                className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  sourceType === "direct"
                    ? "bg-rose-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Direct URL</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceType("offline")}
                className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  sourceType === "offline"
                    ? "bg-rose-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Local File</span>
              </button>
            </div>
          </div>

          {/* Source A: Firestore Movie with in-modal Search */}
          {sourceType === "firestore" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Search & Choose Movie from Library
                </label>
                <span className="text-[11px] text-neutral-400">
                  {filteredMovies.length} {filteredMovies.length === 1 ? "movie" : "movies"} available
                </span>
              </div>

              {/* In-Modal Movie Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  value={movieSearchQuery}
                  onChange={(e) => setMovieSearchQuery(e.target.value)}
                  placeholder="Type to search movies by title, genre, year..."
                  className="w-full pl-9 pr-9 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
                {movieSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMovieSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white rounded"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Movie Search Results */}
              {filteredMovies.length > 0 ? (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {filteredMovies.map((m) => {
                    const isSelected = selectedMovieId === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMovieId(m.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                          isSelected
                            ? "bg-rose-500/15 border-rose-500 text-white shadow-sm"
                            : "bg-neutral-950/60 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-950"
                        }`}
                      >
                        {m.poster ? (
                          <img
                            src={m.poster}
                            alt={m.Title}
                            className="w-10 h-14 object-cover rounded-md shrink-0 bg-neutral-800"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-neutral-800 rounded-md flex items-center justify-center shrink-0">
                            <Film className="w-4 h-4 text-neutral-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate">{m.Title}</p>
                            {isSelected && (
                              <span className="shrink-0 p-1 bg-rose-600 rounded-full text-white">
                                <Check className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400">{m.genre} • {m.year}</p>
                          {m.description && (
                            <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">
                              {m.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 px-4 bg-neutral-950 rounded-xl border border-neutral-800">
                  <Film className="w-6 h-6 text-neutral-600 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-neutral-300">No movies found</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {movieSearchQuery
                      ? `No movies match "${movieSearchQuery}". Try another keyword or add a direct URL.`
                      : "No movies in library yet. You can upload one or use a Direct URL / Local file!"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Source B: Direct URL */}
          {sourceType === "direct" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1">
                  Video Title (Optional)
                </label>
                <input
                  type="text"
                  value={directTitle}
                  onChange={(e) => setDirectTitle(e.target.value)}
                  placeholder="e.g. Big Buck Bunny"
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1">
                  Direct Video URL (MP4 / WebM) *
                </label>
                <input
                  type="url"
                  required
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Ensure the direct video link is publicly accessible via HTTPS.
                </p>
              </div>
            </div>
          )}

          {/* Source C: Local / Offline Video */}
          {sourceType === "offline" && (
            <div className="space-y-3">
              <div className="p-3.5 bg-neutral-950/90 border border-amber-500/30 rounded-xl text-xs text-amber-300/90">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-amber-400" /> Offline Synchronization Note:
                </p>
                <p className="text-neutral-400 leading-relaxed">
                  Your offline video is played locally on your device and will NOT be uploaded to any server. Other participants will be prompted to select the same local file on their devices to watch synchronously.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  Select Local Video File *
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setOfflineFile(file);
                  }}
                  className="w-full text-xs text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-neutral-800 file:text-white hover:file:bg-neutral-700 cursor-pointer"
                />
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[11px] flex flex-col gap-1.5 mt-2">
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

              {offlineFile && (
                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between">
                  <div className="truncate">
                    <p className="text-sm font-medium text-white truncate">{offlineFile.name}</p>
                    <p className="text-xs text-neutral-400">
                      {(offlineFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Room Settings: Control Lock */}
          <div className="pt-2 border-t border-neutral-800/80">
            <div className="flex items-center justify-between p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-2.5">
                <Lock className={`w-4 h-4 ${controlsLocked ? "text-rose-400" : "text-neutral-500"}`} />
                <div>
                  <p className="text-sm font-semibold text-white">Lock Playback Controls</p>
                  <p className="text-xs text-neutral-400">
                    {controlsLocked
                      ? "Only you (the host) can play, pause, and seek."
                      : "Any participant can control playback."}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={controlsLocked}
                  onChange={(e) => setControlsLocked(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
              </label>
            </div>
          </div>

          <div className="text-[11px] text-neutral-500 flex items-center justify-between">
            <span>• 4-digit unique code will be assigned</span>
            <span>• Active for 24 hours</span>
            <span>• Max 4 rooms per user / day</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-5 py-2.5 text-neutral-300 hover:text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-rose-600/25 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Room...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Launch Watch Room</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
