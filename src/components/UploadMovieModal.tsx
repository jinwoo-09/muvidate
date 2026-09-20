import React, { useState, useRef, useEffect } from "react";
import { uploadFileToWorker } from "../lib/workerApi";
import { addMovieToFirestore } from "../lib/firebase";
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
  Link as LinkIcon
} from "lucide-react";

interface UploadMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMovieAdded?: () => void;
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

export function UploadMovieModal({ isOpen, onClose, onMovieAdded }: UploadMovieModalProps) {
  const [title, setTitle] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [genreSearch, setGenreSearch] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [description, setDescription] = useState("");
  const [posterMode, setPosterMode] = useState<"upload" | "url">("upload");
  const [posterUrl, setPosterUrl] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [movieSourceMode, setMovieSourceMode] = useState<"file" | "url">("file");
  const [movieFile, setMovieFile] = useState<File | null>(null);
  const [movieUrlInput, setMovieUrlInput] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const movieInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const genreDropdownRef = useRef<HTMLDivElement>(null);

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
      // Switching to file clears URL to avoid ambiguity
      setMovieUrlInput("");
    } else {
      // Switching to URL clears file to avoid ambiguity
      setMovieFile(null);
      if (movieInputRef.current) movieInputRef.current.value = "";
    }
  };

  const handleMovieFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate MP4 requirement and 1 GB size limit strictly
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

    // Validate the actual image dimensions after selection: height must be greater than width (portrait)
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
    setError(null);

    // Mandatory field check
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
    if (posterMode === "upload" && !posterFile) {
      setError("Poster image file is mandatory.");
      return;
    }
    if (posterMode === "url" && !posterUrl.trim()) {
      setError("Poster URL is mandatory.");
      return;
    }

    // Validate movie source: Exactly ONE must be supplied
    if (movieSourceMode === "file") {
      if (!movieFile) {
        setError("MP4 Video file is mandatory when 'Upload MP4 File' is selected.");
        return;
      }
      if (movieUrlInput.trim()) {
        setError("Only ONE movie source can be selected. Please clear the URL or choose 'MP4 URL'.");
        return;
      }
      // Double check MP4 and 1 GB file size strictly before starting Worker upload
      if (!movieFile.name.toLowerCase().endsWith(".mp4") || movieFile.size > MAX_MOVIE_SIZE) {
        setError("Movie file must be MP4 and no larger than 1 GB.");
        return;
      }
    } else if (movieSourceMode === "url") {
      const trimmedUrl = movieUrlInput.trim();
      if (!trimmedUrl) {
        setError("MP4 Video URL is mandatory when 'MP4 URL' option is selected.");
        return;
      }
      if (movieFile) {
        setError("Only ONE movie source can be selected. Please clear the uploaded file or choose 'Upload MP4 File'.");
        return;
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmedUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Invalid protocol");
        }
      } catch {
        setError("Please enter a valid HTTP or HTTPS video URL (e.g. https://example.com/movie.mp4).");
        return;
      }

      // Check for expected MP4 usage
      const lowerPath = parsedUrl.pathname.toLowerCase();
      const lowerSearch = parsedUrl.search.toLowerCase();
      const isLikelyMp4 =
        lowerPath.endsWith(".mp4") ||
        lowerPath.includes(".mp4") ||
        lowerSearch.includes(".mp4") ||
        lowerPath.includes("video") ||
        lowerPath.includes("mp4") ||
        lowerPath.includes("stream");

      if (!isLikelyMp4) {
        setError("The provided URL does not appear to reference an MP4 video resource. Please ensure it points directly to an MP4 video.");
        return;
      }
    } else {
      setError("Please select a movie source (Upload MP4 File or MP4 URL).");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload Poster if file provided
      let finalPosterUrl = posterUrl.trim();
      if (posterMode === "upload" && posterFile) {
        setUploadStep("Uploading poster to Worker API...");
        finalPosterUrl = await uploadFileToWorker(posterFile, posterFile.name);
      }

      // 2. Obtain Movie URL (Worker upload for file, or direct URL)
      let finalMovieUrl = "";
      if (movieSourceMode === "file") {
        setUploadStep(`Uploading MP4 movie "${movieFile!.name}" (${(movieFile!.size / (1024 * 1024)).toFixed(1)} MB)...`);
        finalMovieUrl = await uploadFileToWorker(movieFile!, movieFile!.name);
      } else {
        // Option B: MP4 URL - stored directly in existing `url` field without Worker upload
        finalMovieUrl = movieUrlInput.trim();
      }

      // 3. Save into Firestore `movie` collection with comma-separated genres for complete compatibility
      setUploadStep("Saving movie metadata into Firestore...");
      await addMovieToFirestore({
        Title: title.trim(),
        genre: selectedGenres.join(", "),
        year: yearNum,
        description: description.trim(),
        poster: finalPosterUrl,
        url: finalMovieUrl
      });

      setSuccess(true);
      if (onMovieAdded) onMovieAdded();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("Movie upload error:", err);
      setError(err.message || "Failed to upload movie. Please check your network and try again.");
    } finally {
      setIsUploading(false);
      setUploadStep("");
    }
  };

  const filteredGenres = PREDEFINED_GENRES.filter((g) =>
    g.toLowerCase().includes(genreSearch.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative my-8">
        <button
          onClick={onClose}
          disabled={isUploading}
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-heading text-white">Upload New Movie</h3>
            <p className="text-xs text-neutral-400">
              Upload an MP4 film and metadata directly to MuviDate's Firestore library.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2.5 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm mb-5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Movie uploaded and saved to Firestore successfully!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Movie Source Selection: Exactly ONE option (Upload MP4 File OR MP4 URL) */}
          <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <FileVideo className="w-4 h-4" /> Movie Source * (Choose ONE)
                </label>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Provide your movie as an uploaded MP4 file or via a direct MP4 URL
                </p>
              </div>

              {/* Segmented Toggle Control */}
              <div className="inline-flex p-1 bg-neutral-900 border border-neutral-800 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleSelectMovieSourceMode("file")}
                  disabled={isUploading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    movieSourceMode === "file"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload MP4 File</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMovieSourceMode("url")}
                  disabled={isUploading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    movieSourceMode === "url"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>MP4 URL</span>
                </button>
              </div>
            </div>

            {/* OPTION A: Upload MP4 File */}
            {movieSourceMode === "file" && (
              <div className="space-y-2 pt-1">
                <span className="text-[11px] text-neutral-400 block">Worker Upload • .mp4 only • Max 1 GB</span>
                <input
                  ref={movieInputRef}
                  type="file"
                  accept=".mp4,video/mp4"
                  className="hidden"
                  onChange={handleMovieFileSelect}
                  disabled={isUploading}
                />

                {movieFile ? (
                  <div className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-700 rounded-lg">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileVideo className="w-5 h-5 text-rose-400 shrink-0" />
                      <div className="truncate">
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
                      className="text-xs text-neutral-400 hover:text-rose-400 px-2.5 py-1 rounded hover:bg-neutral-800 transition"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => movieInputRef.current?.click()}
                    className="border-2 border-dashed border-neutral-700 hover:border-rose-500/50 rounded-xl p-6 text-center cursor-pointer transition bg-neutral-900/40 hover:bg-neutral-900"
                  >
                    <UploadCloud className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-white">Click to select MP4 movie file</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Required: File must be .mp4 and no larger than 1 GB
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* OPTION B: MP4 URL */}
            {movieSourceMode === "url" && (
              <div className="space-y-2 pt-1">
                <span className="text-[11px] text-neutral-400 block">
                  Direct Video URL • Direct HTTP/HTTPS link to an MP4 video resource
                </span>
                <div className="relative">
                  <input
                    type="url"
                    value={movieUrlInput}
                    onChange={(e) => {
                      setMovieUrlInput(e.target.value);
                      setError(null);
                    }}
                    placeholder="https://example.com/videos/movie.mp4"
                    disabled={isUploading}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                  />
                  {movieUrlInput && (
                    <button
                      type="button"
                      onClick={() => setMovieUrlInput("")}
                      disabled={isUploading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                      title="Clear URL"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">
                  Remote video URL will be streamed directly in the video player without uploading through the Worker.
                </p>
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
                  {/* Search inside predefined genres */}
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

                  {/* Scrollable Predefined Genres List */}
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

                  {/* Footer status in dropdown */}
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
                      <span>Select Portrait Poster (JPG, PNG, WebP)</span>
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
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <div className="flex items-center gap-3 text-rose-400 mb-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">{uploadStep || "Uploading movie via Worker API..."}</span>
              </div>
              <p className="text-xs text-neutral-400">
                Please do not close this window while large video files are processing.
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-5 py-2.5 text-neutral-300 hover:text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-rose-600/25 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Publish to MuviDate</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
