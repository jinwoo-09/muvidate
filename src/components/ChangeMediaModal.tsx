import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { rtdb, subscribeToMovies } from "../lib/firebase";
import { ref, update } from "firebase/database";
import { Movie } from "../types";
import { getVideoDuration, formatVideoTime } from "../lib/videoUtils";
import { extractSeriesStructure } from "../lib/seriesUtils";
import { isAndroidNative, pickOfflineNativeVideo, OfflineNativeVideoResult } from "../lib/nativeBridge";
import { 
  X, 
  Film, 
  Link as LinkIcon, 
  HardDrive, 
  Search, 
  AlertCircle, 
  Loader2, 
  Check, 
  Sparkles,
  RefreshCw,
  Video,
  Smartphone,
  FolderOpen
} from "lucide-react";

interface ChangeMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  currentMovieTitle?: string;
  isHost: boolean;
  controlsLocked: boolean;
  onOfflineFileSelected?: (file: File | OfflineNativeVideoResult) => void;
}

export function ChangeMediaModal({
  isOpen,
  onClose,
  roomCode,
  currentMovieTitle,
  isHost,
  controlsLocked,
  onOfflineFileSelected
}: ChangeMediaModalProps) {
  const { user, profile } = useAuth();

  // Tab state: "search" | "direct" | "offline"
  const [activeSourceTab, setActiveSourceTab] = useState<"search" | "direct" | "offline">("search");

  // Firestore movies state
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMovieId, setSelectedMovieId] = useState<string>("");

  // Direct URL state
  const [directTitle, setDirectTitle] = useState("");
  const [directUrl, setDirectUrl] = useState("");

  // Offline video state
  const [offlineFile, setOfflineFile] = useState<File | null>(null);
  const [offlineNativeData, setOfflineNativeData] = useState<OfflineNativeVideoResult | null>(null);
  const [isPickingNative, setIsPickingNative] = useState(false);

  // Submitting state & Error
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to Firestore movies when modal is mounted/open
  useEffect(() => {
    if (!isOpen) return;

    setLoadingMovies(true);
    const unsubscribe = subscribeToMovies(
      (loadedMovies) => {
        setMovies(loadedMovies);
        setLoadingMovies(false);
        if (loadedMovies.length > 0 && !selectedMovieId) {
          setSelectedMovieId(loadedMovies[0].id);
        }
      },
      (err) => {
        console.error("Error loading movies for ChangeMediaModal:", err);
        setLoadingMovies(false);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isOpen]);

  // Reset form errors when switching tabs or reopening
  useEffect(() => {
    setError(null);
  }, [activeSourceTab, isOpen]);

  // Filter movies for Search tab
  const filteredMovies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return movies;
    return movies.filter((m) => {
      return (
        m.Title.toLowerCase().includes(q) ||
        (m.genre && m.genre.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.year && m.year.toString().includes(q))
      );
    });
  }, [movies, searchQuery]);

  if (!isOpen) return null;

  const canChangeMedia = isHost || !controlsLocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !profile) {
      setError("User authentication not ready. Please try again.");
      return;
    }

    if (!canChangeMedia) {
      setError("Controls are locked by the host. Only the room host can change media.");
      return;
    }

    setError(null);
    setIsUpdating(true);

    try {
      let movieTitle = "Shared Video";
      let moviePoster = "";
      let movieUrl = "";
      let movieId = "";
      let movieSource: "firestore" | "direct" | "offline" = activeSourceTab === "search" ? "firestore" : activeSourceTab;
      let offlineFileName = "";
      let offlineDuration: number | undefined = undefined;

      if (activeSourceTab === "search") {
        const found = movies.find((m) => m.id === selectedMovieId);
        if (!found) {
          setError("Please select a movie from the search results.");
          setIsUpdating(false);
          return;
        }
        movieId = found.id;
        movieTitle = found.Title;
        moviePoster = (found.cover && found.cover.trim() !== "") ? found.cover : (found.poster || "");
        movieUrl = found.url;
        movieSource = "firestore";
      } else if (activeSourceTab === "direct") {
        const trimmedUrl = directUrl.trim();
        if (!trimmedUrl) {
          setError("Please enter a direct video URL.");
          setIsUpdating(false);
          return;
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(trimmedUrl);
          if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            throw new Error("Invalid protocol");
          }
        } catch {
          setError("Please enter a valid HTTP or HTTPS video URL.");
          setIsUpdating(false);
          return;
        }

        movieTitle = directTitle.trim() || "Direct Video Stream";
        movieUrl = trimmedUrl;
        movieSource = "direct";
      } else if (activeSourceTab === "offline") {
        if (isAndroidNative()) {
          if (!offlineNativeData) {
            setError("Please choose a local video file from your Android storage.");
            setIsUpdating(false);
            return;
          }
          offlineDuration = offlineNativeData.duration;
          movieTitle = offlineNativeData.name.replace(/\.[^/.]+$/, "");
          offlineFileName = offlineNativeData.name;
          movieUrl = offlineNativeData.uri;
          movieSource = "offline";
        } else {
          if (!offlineFile) {
            setError("Please choose a local video file from your device.");
            setIsUpdating(false);
            return;
          }

          try {
            offlineDuration = await getVideoDuration(offlineFile);
          } catch (durErr: any) {
            setError(durErr.message || "This device/browser cannot play or decode this video format.");
            setIsUpdating(false);
            return;
          }

          movieTitle = offlineFile.name.replace(/\.[^/.]+$/, "");
          offlineFileName = offlineFile.name;
          movieUrl = `offline://${offlineFile.name}`;
          movieSource = "offline";
        }
      }

      const now = Date.now();

      // Update room media in RTDB safely without any undefined parameters
      const roomRef = ref(rtdb, `rooms/${roomCode}`);
      const updateData: any = {
        movieSource,
        movieTitle,
        movieUrl,
        movieCompleted: false,
        playbackState: {
          isPlaying: false,
          currentTime: 0,
          lastUpdated: now,
          updatedBy: user.uid,
          updatedByUsername: profile.username,
          audioTrackIndex: 0
        }
      };

      if (movieId) {
        updateData.movieId = movieId;
      } else {
        updateData.movieId = null;
      }

      if (moviePoster) {
        updateData.moviePoster = moviePoster;
      } else {
        updateData.moviePoster = null;
      }

      if (activeSourceTab === "search") {
        const found = movies.find((m) => m.id === selectedMovieId);
        if (found && found.subtitle && found.subtitle.trim()) {
          updateData.subtitle = found.subtitle.trim();
        } else {
          updateData.subtitle = null;
        }
      } else {
        updateData.subtitle = null;
      }

      if (movieSource === "offline") {
        if (offlineFileName) {
          updateData.offlineFileName = offlineFileName;
        } else {
          updateData.offlineFileName = null;
        }
        if (typeof offlineDuration === "number" && Number.isFinite(offlineDuration) && offlineDuration > 0) {
          updateData.offlineDuration = offlineDuration;
        } else {
          updateData.offlineDuration = null;
        }
      } else {
        updateData.offlineFileName = null;
        updateData.offlineDuration = null;
      }

      // Check if media is a TV series
      let seriesStructure = null;
      if (activeSourceTab === "search") {
        const found = movies.find((m) => m.id === selectedMovieId);
        if (found) {
          seriesStructure = extractSeriesStructure(found);
          if (seriesStructure.isSeries) {
            for (const k of Object.keys(found)) {
              if (/^url\d*$/i.test(k) && typeof (found as any)[k] === "string" && (found as any)[k].trim()) {
                updateData[k] = (found as any)[k].trim();
              }
              if (/^subtitle\d*$/i.test(k) && typeof (found as any)[k] === "string" && (found as any)[k].trim()) {
                updateData[k] = (found as any)[k].trim();
              }
            }
          }
        }
      } else if (activeSourceTab === "direct") {
        seriesStructure = extractSeriesStructure(directUrl.trim());
      }

      if (seriesStructure && seriesStructure.isSeries) {
        updateData.season = 1;
        updateData.episode = 1;
        updateData.currentEpisodeUrl = seriesStructure.seasons[0]?.episodes[0]?.url || movieUrl;
        updateData.seriesUrls = activeSourceTab === "direct" ? directUrl.trim() : movieUrl;
      } else {
        updateData.season = null;
        updateData.episode = null;
        updateData.currentEpisodeUrl = null;
        updateData.seriesUrls = null;
      }

      await update(roomRef, updateData);

      // If offline video selected, update local state & participant record
      if (activeSourceTab === "offline") {
        const passOffline = isAndroidNative() ? (offlineNativeData || undefined) : (offlineFile || undefined);
        if (passOffline && onOfflineFileSelected) {
          onOfflineFileSelected(passOffline);
        }
        const participantRef = ref(rtdb, `rooms/${roomCode}/participants/${user.uid}`);
        await update(participantRef, { hasOfflineFile: true }).catch(() => {});
      }

      onClose();
    } catch (err: any) {
      console.error("Error changing room media:", err);
      setError(err.message || "Failed to update room media. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-7 shadow-2xl relative my-8 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          disabled={isUpdating}
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/20">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-white">Change Room Media</h3>
            <p className="text-xs text-neutral-400">
              Select a new video source to synchronize with everyone in room #{roomCode}
            </p>
          </div>
        </div>

        {/* Permission warning if locked and not host */}
        {!canChangeMedia && (
          <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Controls are currently locked by the host. Only the room host can change media.</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 3 Tab Options: 1. Search | 2. MP4 URL | 3. Offline Video */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Select Media Source Option
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-neutral-950 rounded-xl border border-neutral-800">
              {/* Option 1: Search */}
              <button
                type="button"
                onClick={() => setActiveSourceTab("search")}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  activeSourceTab === "search"
                    ? "bg-rose-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </button>

              {/* Option 2: MP4 URL */}
              <button
                type="button"
                onClick={() => setActiveSourceTab("direct")}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  activeSourceTab === "direct"
                    ? "bg-rose-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>MP4 URL</span>
              </button>

              {/* Option 3: Offline Video */}
              <button
                type="button"
                onClick={() => setActiveSourceTab("offline")}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  activeSourceTab === "offline"
                    ? "bg-rose-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Offline Video</span>
              </button>
            </div>
          </div>

          {/* TAB 1: Search (Firestore Movie Library) */}
          {activeSourceTab === "search" && (
            <div className="space-y-3 pt-1">
              {/* Search Field inside Modal */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search movie title, genre, year..."
                  className="w-full pl-9 pr-9 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Movie Search Results List */}
              {loadingMovies ? (
                <div className="flex items-center justify-center py-8 text-neutral-400 text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  <span>Loading movies from library...</span>
                </div>
              ) : filteredMovies.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
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
                            <p className="text-xs font-semibold text-white truncate">{m.Title}</p>
                            {isSelected && (
                              <span className="shrink-0 p-1 bg-rose-600 rounded-full text-white">
                                <Check className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {m.genre} • {m.year}
                          </p>
                          {m.description && (
                            <p className="text-[10px] text-neutral-500 line-clamp-1 mt-0.5">
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
                    {searchQuery ? `No matches found for "${searchQuery}".` : "No movies in library."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MP4 URL */}
          {activeSourceTab === "direct" && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                  Video Title (Optional)
                </label>
                <input
                  type="text"
                  value={directTitle}
                  onChange={(e) => setDirectTitle(e.target.value)}
                  placeholder="e.g. Action Trailer"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                  Direct MP4 Video URL *
                </label>
                <input
                  type="url"
                  required
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="https://example.com/movie.mp4"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
                <p className="text-[10px] text-neutral-500 mt-1">
                  Provide an HTTP or HTTPS link to a direct MP4 video stream.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Offline Video */}
          {activeSourceTab === "offline" && (
            <div className="space-y-3 pt-1">
              <div className="p-3 bg-neutral-950/90 border border-amber-500/30 rounded-xl text-[11px] text-amber-300/90">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-amber-400" /> Offline Synchronization:
                </p>
                <p className="text-neutral-400 leading-relaxed">
                  Your local video file plays directly on your device. Other participants in the room will be prompted to select their matching local copy of this file to stay in sync.
                </p>
              </div>

              {isAndroidNative() ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Select Local Video File (Android Media3) *
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      setError(null);
                      setIsPickingNative(true);
                      try {
                        const res = await pickOfflineNativeVideo();
                        setOfflineNativeData(res);
                      } catch (err: any) {
                        if (err.message !== "USER_CANCELLED" && !err.message?.includes("CANCELLED")) {
                          setError(err.message || "Failed to select video file from Android storage.");
                        }
                      } finally {
                        setIsPickingNative(false);
                      }
                    }}
                    disabled={isPickingNative}
                    className="w-full py-3 px-4 rounded-xl bg-neutral-950 hover:bg-neutral-850 border border-neutral-700 hover:border-rose-500/50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm"
                  >
                    {isPickingNative ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                        <span>Opening Android Storage...</span>
                      </>
                    ) : (
                      <>
                        <FolderOpen className="w-4 h-4 text-rose-400" />
                        <span>{offlineNativeData ? "Change Selected Video" : "Choose Video from Device (SAF)"}</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Select Local Video File *
                  </label>
                  <input
                    type="file"
                    accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.m4v,.flv,.wmv,.3gp,.ts,.m2ts"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setError(null);
                      setOfflineFile(file);
                    }}
                    className="w-full text-xs text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-800 file:text-white hover:file:bg-neutral-700 cursor-pointer"
                  />
                </div>
              )}

              {!isAndroidNative() && (
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
              )}

              {offlineNativeData && (
                <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between">
                  <div className="truncate">
                    <p className="text-xs font-semibold text-white truncate">{offlineNativeData.name}</p>
                    <p className="text-[10px] text-neutral-400">
                      {(offlineNativeData.size / (1024 * 1024)).toFixed(1)} MB
                      {offlineNativeData.duration > 0 && ` • ${formatVideoTime(offlineNativeData.duration)}`}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md font-medium">
                    Media3 Ready
                  </span>
                </div>
              )}

              {offlineFile && !isAndroidNative() && (
                <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between">
                  <div className="truncate">
                    <p className="text-xs font-semibold text-white truncate">{offlineFile.name}</p>
                    <p className="text-[10px] text-neutral-400">
                      {(offlineFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md font-medium">
                    Ready
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isUpdating}
              className="px-4 py-2 text-neutral-300 hover:text-white text-xs font-medium rounded-xl hover:bg-neutral-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating || !canChangeMedia}
              className="px-5 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/20 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating Media...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Switch Media</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
