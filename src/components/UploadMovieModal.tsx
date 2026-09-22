import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { uploadFileToWorker } from "../lib/workerApi";
import { addMovieToFirestore, updateMovieInFirestore } from "../lib/firebase";
import { parseEpisodeUrls } from "../lib/seriesUtils";
import { Movie } from "../types";
import { 
  X, 
  UploadCloud, 
  Film, 
  Image as ImageIcon, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  FileVideo,
  ChevronDown,
  Check,
  Search,
  Link as LinkIcon,
  Layers,
  Subtitles,
  Pencil,
  Clapperboard
} from "lucide-react";

interface UploadMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMovieAdded?: () => void;
  movieToEdit?: Movie | null;
}

const PREDEFINED_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Biography",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Musical",
  "Mystery",
  "Reality",
  "Romance",
  "Science Fiction",
  "Short",
  "Sport",
  "Superhero",
  "Thriller",
  "TV Movie",
  "War",
  "Western"
];

const MAX_MOVIE_SIZE = 1024 * 1024 * 1024; // 1 GB in bytes

export function UploadMovieModal({
  isOpen,
  onClose,
  onMovieAdded,
  movieToEdit
}: UploadMovieModalProps) {
  const { profile } = useAuth();
  const isEditMode = !!movieToEdit;

  const [title, setTitle] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [genreSearch, setGenreSearch] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [description, setDescription] = useState("");
  const [posterMode, setPosterMode] = useState<"upload" | "url">("upload");
  const [posterUrl, setPosterUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [trailer, setTrailer] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [movieSourceMode, setMovieSourceMode] = useState<"file" | "url">("file");
  const [movieFile, setMovieFile] = useState<File | null>(null);
  const [movieUrlInput, setMovieUrlInput] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const movieInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);

  // Sync state when modal opens or movieToEdit changes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(false);
      return;
    }

    if (modalScrollRef.current) {
      modalScrollRef.current.scrollTop = 0;
    }

    if (movieToEdit) {
      setTitle(movieToEdit.Title || movieToEdit.title || "");
      const genres = movieToEdit.genre
        ? movieToEdit.genre.split(",").map((g) => g.trim()).filter(Boolean)
        : [];
      setSelectedGenres(genres);
      setYear(movieToEdit.year ? movieToEdit.year.toString() : new Date().getFullYear().toString());
      setDescription(movieToEdit.description || "");
      setPosterMode("url");
      setPosterUrl(movieToEdit.poster || "");
      setPosterFile(null);
      setCoverUrl(movieToEdit.cover || "");
      setSubtitle(movieToEdit.subtitle || "");
      setTrailer(movieToEdit.trailer || "");
      setMovieSourceMode("url");
      setMovieFile(null);
      setMovieUrlInput(movieToEdit.url || "");
      setSeasonNumber(movieToEdit.seasonNumber ? movieToEdit.seasonNumber.toString() : "");
      setError(null);
      setSuccess(false);
    } else {
      setTitle("");
      setSelectedGenres([]);
      setYear(new Date().getFullYear().toString());
      setDescription("");
      setPosterMode("upload");
      setPosterUrl("");
      setPosterFile(null);
      setCoverUrl("");
      setSubtitle("");
      setTrailer("");
      setMovieSourceMode("file");
      setMovieFile(null);
      setMovieUrlInput("");
      setSeasonNumber("");
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, movieToEdit]);

  // Close genre dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(e.target as Node)) {
        setIsGenreDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (!isOpen) return null;
  if (profile?.subscription !== "premium") return null;

  const handleToggleGenre = (g: string) => {
    if (selectedGenres.includes(g)) {
      setSelectedGenres(selectedGenres.filter((item) => item !== g));
    } else {
      setSelectedGenres([...selectedGenres, g]);
    }
  };

  const handleRemoveGenre = (g: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedGenres(selectedGenres.filter((item) => item !== g));
  };

  const handleSelectMovieSourceMode = (mode: "file" | "url") => {
    if (isUploading) return;
    setMovieSourceMode(mode);
    setError(null);
    if (mode === "file") {
      if (!isEditMode) {
        setMovieUrlInput("");
        setSeasonNumber("");
      }
    } else {
      setMovieFile(null);
      if (movieInputRef.current) movieInputRef.current.value = "";
    }
  };

  const handleMovieFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isMp4Name = file.name.toLowerCase().endsWith(".mp4");
    const isMp4Type = file.type === "video/mp4" || file.type === "";

    if (!isMp4Name || !isMp4Type || file.size > MAX_MOVIE_SIZE) {
      setError("Movie file must be MP4 and no larger than 1 GB.");
      setMovieFile(null);
      if (movieInputRef.current) movieInputRef.current.value = "";
      return;
    }

    setError(null);
    setMovieFile(file);
  };

  const handlePosterFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    const lower = file.name.toLowerCase();
    const validExts = [".jpg", ".jpeg", ".png", ".webp"];
    const isAllowedImage = validTypes.includes(file.type) || validExts.some((ext) => lower.endsWith(ext));

    if (!isAllowedImage) {
      setError("Poster file must be a JPG, JPEG, PNG, or WebP image.");
      setPosterFile(null);
      if (posterInputRef.current) posterInputRef.current.value = "";
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.naturalHeight <= img.naturalWidth) {
        setError("Poster must be portrait-oriented (height greater than width).");
        setPosterFile(null);
        if (posterInputRef.current) posterInputRef.current.value = "";
        return;
      }
      setError(null);
      setPosterFile(file);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("Unable to read poster image. Please select a valid JPG, JPEG, PNG, or WebP file.");
      setPosterFile(null);
      if (posterInputRef.current) posterInputRef.current.value = "";
    };
    img.src = objectUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;
    setError(null);

    // Verify subscription
    if (profile?.subscription !== "premium") {
      setError("Only verified Premium subscribers have permission to save titles.");
      return;
    }

    // Validation
    if (!title.trim()) {
      setError("Movie Title is mandatory.");
      return;
    }
    if (selectedGenres.length === 0) {
      setError("At least one Genre is mandatory. Please select from the dropdown.");
      return;
    }
    const yearNum = Number(year);
    if (!year || isNaN(yearNum) || yearNum < 1888 || yearNum > 2100) {
      setError("Please enter a valid release year (e.g. 2025).");
      return;
    }
    if (!description.trim()) {
      setError("Description is mandatory.");
      return;
    }
    if (posterMode === "upload" && !posterFile && !isEditMode) {
      setError("Poster image file is mandatory.");
      return;
    }
    if (posterMode === "url" && !posterUrl.trim() && !isEditMode) {
      setError("Poster URL is mandatory.");
      return;
    }

    // Source validation
    let finalSeasonNum = 1;
    if (movieSourceMode === "file") {
      finalSeasonNum = 1;
      if (!movieFile && !isEditMode) {
        setError("MP4 Video file is mandatory when 'Upload MP4 File' is selected.");
        return;
      }
      if (movieFile) {
        if (!movieFile.name.toLowerCase().endsWith(".mp4") || movieFile.size > MAX_MOVIE_SIZE) {
          setError("Movie file must be MP4 and no larger than 1 GB.");
          return;
        }
      }
    } else if (movieSourceMode === "url") {
      const trimmedUrl = movieUrlInput.trim();
      if (!trimmedUrl) {
        setError("Video URL is mandatory when 'Video URL' option is selected.");
        return;
      }

      const trimmedSeason = seasonNumber.trim();
      if (trimmedSeason) {
        if (!/^\d+$/.test(trimmedSeason)) {
          setError("Season Number must be a positive integer (e.g. 1, 2, 3).");
          return;
        }
        const parsedSeason = parseInt(trimmedSeason, 10);
        if (isNaN(parsedSeason) || parsedSeason < 1) {
          setError("Season Number must be a positive integer (e.g. 1, 2, 3).");
          return;
        }
        finalSeasonNum = parsedSeason;
      } else {
        finalSeasonNum = 1;
      }

      const parsedEpisodes = parseEpisodeUrls(trimmedUrl);
      if (parsedEpisodes.length === 0) {
        setError("Please enter at least one valid video URL.");
        return;
      }
    } else {
      setError("Please select a movie source.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(null);
    setUploadStatusText("");

    try {
      // 1. Upload Poster if new file provided
      let finalPosterUrl = posterUrl.trim();
      if (posterMode === "upload" && posterFile) {
        setUploadStatusText("Uploading portrait poster...");
        finalPosterUrl = await uploadFileToWorker(posterFile, posterFile.name);
      } else if (!finalPosterUrl && isEditMode && movieToEdit.poster) {
        finalPosterUrl = movieToEdit.poster;
      }

      // 2. Video source resolution
      let finalMovieUrl = "";
      if (movieSourceMode === "file") {
        if (movieFile) {
          setUploadProgress(0);
          setUploadStatusText("Uploading… 0%");
          finalMovieUrl = await uploadFileToWorker(movieFile, movieFile.name, (percent) => {
            setUploadProgress(percent);
            if (percent < 100) {
              setUploadStatusText(`Uploading… ${percent}%`);
            } else {
              setUploadStatusText("Processing/Publishing…");
            }
          });
          setUploadStatusText("Processing/Publishing…");
        } else if (isEditMode && movieToEdit.url) {
          finalMovieUrl = movieToEdit.url;
        }
      } else {
        setUploadProgress(null);
        setUploadStatusText("Processing/Publishing…");
        finalMovieUrl = movieUrlInput.trim();
      }

      if (isEditMode && movieToEdit) {
        setUploadStatusText("Saving movie updates to Firestore...");
        await updateMovieInFirestore(movieToEdit.id, {
          Title: title.trim(),
          genre: selectedGenres.join(", "),
          year: yearNum,
          description: description.trim(),
          poster: finalPosterUrl,
          cover: coverUrl.trim() || "",
          subtitle: subtitle.trim() || "",
          trailer: trailer.trim() || "",
          url: finalMovieUrl,
          seasonNumber: finalSeasonNum
        });
      } else {
        setUploadStatusText("Saving movie metadata to Firestore...");
        await addMovieToFirestore({
          Title: title.trim(),
          genre: selectedGenres.join(", "),
          year: yearNum,
          description: description.trim(),
          poster: finalPosterUrl,
          cover: coverUrl.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          trailer: trailer.trim() || undefined,
          url: finalMovieUrl,
          seasonNumber: finalSeasonNum
        });
      }

      setSuccess(true);
      if (onMovieAdded) onMovieAdded();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error("Movie save error:", err);
      setError(err.message || "Failed to save movie. Please check your network and try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      setUploadStatusText("");
    }
  };

  const filteredGenres = PREDEFINED_GENRES.filter((g) =>
    g.toLowerCase().includes(genreSearch.toLowerCase().trim())
  );

  return (
    <div
      ref={modalScrollRef}
      className="fixed inset-0 z-[20000] overflow-y-auto bg-black/85 backdrop-blur-md p-3 sm:p-6 flex items-start justify-center"
    >
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-8 shadow-2xl relative my-4 sm:my-8 shrink-0">
        <button
          onClick={onClose}
          disabled={isUploading}
          className="absolute top-4 sm:top-5 right-4 sm:right-5 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5 sm:mb-6 pr-8">
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 shrink-0">
            {isEditMode ? <Pencil className="w-5 h-5 sm:w-6 sm:h-6" /> : <Film className="w-5 h-5 sm:w-6 sm:h-6" />}
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold font-heading text-white">
              {isEditMode ? "Edit Movie / Series" : "Upload New Movie"}
            </h3>
            <p className="text-xs text-neutral-400">
              {isEditMode
                ? "Update movie details, media sources, subtitles, or trailer in Firestore."
                : "Add an MP4 film or series with metadata and subtitles to MuviDate."}
            </p>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success notification */}
        {success && (
          <div className="flex items-center gap-2.5 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm mb-5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>
              {isEditMode
                ? "Movie updated successfully in Firestore!"
                : "Movie published successfully to MuviDate!"}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Movie Source Selection */}
          <div className="p-3.5 sm:p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <FileVideo className="w-4 h-4" /> Movie / Series Source *
                </label>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Upload an MP4 file for a Movie, or enter Video URLs for Movies & TV Series
                </p>
              </div>

              {/* Segmented Toggle Control */}
              <div className="inline-flex p-1 bg-neutral-900 border border-neutral-800 rounded-xl self-stretch sm:self-auto flex-col sm:flex-row gap-1 sm:gap-0">
                <button
                  type="button"
                  onClick={() => handleSelectMovieSourceMode("file")}
                  disabled={isUploading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center sm:justify-start gap-1.5 ${
                    movieSourceMode === "file"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload MP4 (Movie Only)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMovieSourceMode("url")}
                  disabled={isUploading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center sm:justify-start gap-1.5 ${
                    movieSourceMode === "url"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Video URL (Movie / Series)</span>
                </button>
              </div>
            </div>

            {/* OPTION A: Upload MP4 File (Single Movie only) */}
            {movieSourceMode === "file" && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-neutral-400 gap-1">
                  <span>Worker Upload • .mp4 only • Max 1 GB</span>
                  <span className="text-amber-400/90 font-medium">Single Movie only (Season 1)</span>
                </div>
                <input
                  ref={movieInputRef}
                  type="file"
                  accept=".mp4,video/mp4"
                  className="hidden"
                  onChange={handleMovieFileSelect}
                  disabled={isUploading}
                />

                {movieFile ? (
                  <div className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-700 rounded-lg gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 overflow-hidden min-w-0">
                      <FileVideo className="w-5 h-5 text-rose-400 shrink-0" />
                      <div className="truncate min-w-0">
                        <p className="text-sm font-medium text-white truncate">{movieFile.name}</p>
                        <p className="text-xs text-neutral-400">
                          {(movieFile.size / (1024 * 1024)).toFixed(2)} MB • MP4
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMovieFile(null);
                        if (movieInputRef.current) movieInputRef.current.value = "";
                      }}
                      disabled={isUploading}
                      className="text-xs text-neutral-400 hover:text-rose-400 px-2.5 py-1 rounded hover:bg-neutral-800 transition shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => movieInputRef.current?.click()}
                    className="border-2 border-dashed border-neutral-700 hover:border-rose-500/50 rounded-xl p-5 sm:p-6 text-center cursor-pointer transition bg-neutral-900/40 hover:bg-neutral-900"
                  >
                    <UploadCloud className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-white">
                      {isEditMode ? "Click to select a new MP4 video file (or keep current URL)" : "Click to select MP4 movie file"}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Required: File must be .mp4 and no larger than 1 GB • For TV Series, switch to Video URL
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* OPTION B: Video URL (Movie or Series) */}
            {movieSourceMode === "url" && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-neutral-400">
                  <span>Direct HTTP/HTTPS link to video resource or comma-separated episode URLs</span>
                  <span className="text-rose-400/90 font-medium">Supports Single Movies & Multi-Episode Series</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {/* Season Number */}
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-rose-400" />
                      <span>Season #</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={seasonNumber}
                      onChange={(e) => {
                        setSeasonNumber(e.target.value);
                        setError(null);
                      }}
                      placeholder="1"
                      disabled={isUploading}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                      title="Optional: Season number (1 for Season 1, 2 for Season 2, etc.). Empty defaults to 1."
                    />
                    <span className="text-[10px] text-neutral-500 block mt-1">Empty = Season 1</span>
                  </div>

                  {/* Video URL(s) */}
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1">
                      Video URL(s) *
                    </label>
                    <div className="relative">
                      <textarea
                        rows={2}
                        value={movieUrlInput}
                        onChange={(e) => {
                          setMovieUrlInput(e.target.value);
                          setError(null);
                        }}
                        placeholder="Single Movie: https://example.com/movie.mp4&#10;Series: ep1.mp4, ep2.mp4, ep3.mp4"
                        disabled={isUploading}
                        className="w-full pl-3.5 pr-10 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none"
                      />
                      {movieUrlInput && (
                        <button
                          type="button"
                          onClick={() => setMovieUrlInput("")}
                          disabled={isUploading}
                          className="absolute right-3 top-3 text-neutral-400 hover:text-white"
                          title="Clear URLs"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-400 space-y-1 bg-neutral-950/60 p-3 rounded-xl border border-neutral-800">
                  <p>
                    <strong className="text-neutral-300">Single Movie:</strong> Enter a single video URL.
                  </p>
                  <p>
                    <strong className="text-neutral-300">TV Series:</strong> Separate episode URLs with commas (e.g. <code className="text-rose-300">ep1.mp4, ep2.mp4, ep3.mp4</code>).
                  </p>
                  <p>
                    <strong className="text-neutral-300">Season Number:</strong> If left empty or set to 1, URLs save to Season 1 (<code className="text-neutral-300">url</code>). Season 2 saves to <code className="text-neutral-300">url2</code>, Season 3 to <code className="text-neutral-300">url3</code>, etc.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Title & Multi-Select Genre Dropdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                Movie Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Inception"
                disabled={isUploading}
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
              />
            </div>

            {/* Multi-Select Genre Dropdown */}
            <div ref={genreDropdownRef} className="relative">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                Genre(s) *
              </label>
              
              <div
                onClick={() => !isUploading && setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                className={`w-full min-h-[42px] px-3 py-2 bg-neutral-950 border rounded-xl flex items-center justify-between gap-2 cursor-pointer transition ${
                  isGenreDropdownOpen
                    ? "border-rose-500 ring-2 ring-rose-500/40"
                    : "border-neutral-700 hover:border-neutral-600"
                } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-1.5 flex-1 overflow-hidden">
                  {selectedGenres.length > 0 ? (
                    selectedGenres.map((g) => (
                      <span
                        key={g}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium"
                      >
                        <span>{g}</span>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveGenre(g, e)}
                          className="hover:text-white p-0.5"
                          title={`Remove ${g}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-500">
                      Select genre(s) from list...
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform duration-200 ${
                    isGenreDropdownOpen ? "rotate-180 text-rose-400" : ""
                  }`}
                />
              </div>

              {/* Dropdown Popover Menu */}
              {isGenreDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-2 border-b border-neutral-800 bg-neutral-950">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={genreSearch}
                        onChange={(e) => setGenreSearch(e.target.value)}
                        placeholder="Filter genres..."
                        className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                    {filteredGenres.length > 0 ? (
                      filteredGenres.map((g) => {
                        const isSelected = selectedGenres.includes(g);
                        return (
                          <div
                            key={g}
                            onClick={() => handleToggleGenre(g)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition select-none ${
                              isSelected
                                ? "bg-rose-500/20 text-rose-300 font-semibold"
                                : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                            }`}
                          >
                            <span>{g}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-rose-400" />}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-neutral-500">
                        No matching genres found.
                      </div>
                    )}
                  </div>

                  <div className="p-2 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400 px-3">
                    <span>{selectedGenres.length} selected</span>
                    {selectedGenres.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGenres([]);
                        }}
                        className="text-rose-400 hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Year & Poster */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                Release Year *
              </label>
              <input
                type="number"
                required
                min={1888}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={isUploading}
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Poster Image * (Portrait only)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPosterMode("upload")}
                    className={`px-2 py-0.5 rounded transition ${posterMode === "upload" ? "bg-rose-600 text-white" : "text-neutral-400 hover:text-white"}`}
                  >
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosterMode("url")}
                    className={`px-2 py-0.5 rounded transition ${posterMode === "url" ? "bg-rose-600 text-white" : "text-neutral-400 hover:text-white"}`}
                  >
                    Image URL
                  </button>
                </div>
              </div>

              {posterMode === "upload" ? (
                <div>
                  <input
                    ref={posterInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePosterFileSelect}
                    disabled={isUploading}
                  />
                  {posterFile ? (
                    <div className="flex items-center justify-between p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl">
                      <span className="text-xs text-neutral-200 truncate">{posterFile.name} (Portrait)</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPosterFile(null);
                          if (posterInputRef.current) posterInputRef.current.value = "";
                        }}
                        className="text-xs text-rose-400 hover:underline shrink-0 ml-2"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => posterInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full py-2.5 px-3 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-400 hover:text-white hover:border-neutral-600 flex items-center justify-center gap-2 transition"
                    >
                      <ImageIcon className="w-4 h-4 text-neutral-400" />
                      <span>
                        {isEditMode ? "Choose New Poster File (Or keep current)" : "Select Portrait Poster (JPG, PNG, WebP)"}
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <input
                  type="url"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder="https://example.com/portrait-poster.jpg"
                  disabled={isUploading}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                />
              )}
            </div>
          </div>

          {/* Cover URL (Optional Landscape Banner) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
              Cover URL (Optional Landscape Banner)
            </label>
            <input
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://example.com/landscape-cover.jpg"
              disabled={isUploading}
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
            />
          </div>

          {/* Subtitle URL(s) (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                <Subtitles className="w-3.5 h-3.5 text-rose-400" />
                <span>Subtitle URL(s) (Optional)</span>
              </label>
              <span className="text-[10px] text-neutral-400">SRT or VTT</span>
            </div>
            <textarea
              rows={2}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Single movie: https://example.com/movie.srt&#10;Series: ep1.srt, ep2.srt, ep3.srt"
              disabled={isUploading}
              className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              For a series, separate subtitle URLs with commas corresponding to each episode.
            </p>
          </div>

          {/* Trailer Video URL (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                <Clapperboard className="w-3.5 h-3.5 text-rose-400" />
                <span>Trailer Video URL (Optional)</span>
              </label>
              <span className="text-[10px] text-neutral-400">MP4 / Stream URL</span>
            </div>
            <input
              type="url"
              value={trailer}
              onChange={(e) => setTrailer(e.target.value)}
              placeholder="https://example.com/official-trailer.mp4"
              disabled={isUploading}
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Trailer video will be playable inside the Movie Overview modal.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
              Synopsis / Description *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide a captivating description of the plot, characters, and theme..."
              disabled={isUploading}
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none"
            />
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-rose-400 font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {uploadStatusText ||
                      (uploadProgress !== null
                        ? uploadProgress < 100
                          ? `Uploading… ${uploadProgress}%`
                          : "Processing/Publishing…"
                        : "Processing movie...")}
                  </span>
                </div>
                {uploadProgress !== null && (
                  <span className="font-mono text-rose-300 font-bold">{uploadProgress}%</span>
                )}
              </div>

              {uploadProgress !== null && (
                <div className="w-full h-2.5 bg-neutral-950 border border-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(3, uploadProgress)}%` }}
                  />
                </div>
              )}

              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {movieSourceMode === "file" && movieFile
                  ? `Uploading MP4 "${movieFile.name}" (${(movieFile.size / (1024 * 1024)).toFixed(1)} MB) via Worker API. Please keep this tab open.`
                  : "Please do not close this window while the movie is saving to MuviDate."}
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-5 py-2.5 text-neutral-300 hover:text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-rose-600/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {uploadProgress !== null && uploadProgress < 100
                      ? `Uploading… ${uploadProgress}%`
                      : "Processing/Publishing…"}
                  </span>
                </>
              ) : (
                <span>{isEditMode ? "Save Changes" : "Publish to MuviDate"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
