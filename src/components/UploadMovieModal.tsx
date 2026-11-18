import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { addMovieToFirestore, updateMovieInFirestore } from "../lib/firebase";
import { parseEpisodeUrls } from "../lib/seriesUtils";
import { Movie } from "../types";
import {
  X,
  Film,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
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

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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
  const [posterUrl, setPosterUrl] = useState("");
  const [posterPreviewError, setPosterPreviewError] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [trailer, setTrailer] = useState("");
  const [movieUrlInput, setMovieUrlInput] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      setPosterUrl(movieToEdit.poster || "");
      setPosterPreviewError(false);
      setCoverUrl(movieToEdit.cover || "");
      setSubtitle(movieToEdit.subtitle || "");
      setTrailer(movieToEdit.trailer || "");
      setMovieUrlInput(movieToEdit.url || "");
      setSeasonNumber(movieToEdit.seasonNumber ? movieToEdit.seasonNumber.toString() : "");
      setError(null);
      setSuccess(false);
    } else {
      setTitle("");
      setSelectedGenres([]);
      setYear(new Date().getFullYear().toString());
      setDescription("");
      setPosterUrl("");
      setPosterPreviewError(false);
      setCoverUrl("");
      setSubtitle("");
      setTrailer("");
      setMovieUrlInput("");
      setSeasonNumber("");
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, movieToEdit]);

  // Reset poster preview error whenever URL changes
  useEffect(() => {
    setPosterPreviewError(false);
  }, [posterUrl]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
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

    const finalPosterUrl = posterUrl.trim() || (isEditMode && movieToEdit?.poster ? movieToEdit.poster : "");
    if (!finalPosterUrl) {
      setError("Poster Image URL is mandatory.");
      return;
    }
    if (!isValidHttpUrl(finalPosterUrl)) {
      setError("Poster Image URL must be a valid HTTP or HTTPS URL.");
      return;
    }

    const trimmedUrl = movieUrlInput.trim();
    if (!trimmedUrl) {
      setError("Video URL is mandatory.");
      return;
    }

    const parsedEpisodes = parseEpisodeUrls(trimmedUrl);
    if (parsedEpisodes.length === 0 || !parsedEpisodes.every((ep) => isValidHttpUrl(ep))) {
      setError("Please enter valid HTTP or HTTPS video URL(s) (MP4 or M3U8).");
      return;
    }

    let finalSeasonNum = 1;
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
    }

    setIsSaving(true);

    try {
      if (isEditMode && movieToEdit) {
        await updateMovieInFirestore(movieToEdit.id, {
          Title: title.trim(),
          genre: selectedGenres.join(", "),
          year: yearNum,
          description: description.trim(),
          poster: finalPosterUrl,
          cover: coverUrl.trim() || "",
          subtitle: subtitle.trim() || "",
          trailer: trailer.trim() || "",
          url: trimmedUrl,
          seasonNumber: finalSeasonNum
        });
      } else {
        await addMovieToFirestore({
          Title: title.trim(),
          genre: selectedGenres.join(", "),
          year: yearNum,
          description: description.trim(),
          poster: finalPosterUrl,
          cover: coverUrl.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          trailer: trailer.trim() || undefined,
          url: trimmedUrl,
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
      setIsSaving(false);
    }
  };

  const filteredGenres = PREDEFINED_GENRES.filter((g) =>
    g.toLowerCase().includes(genreSearch.toLowerCase().trim())
  );

  const validPosterPreview = isValidHttpUrl(posterUrl.trim()) ? posterUrl.trim() : null;

  return (
    <div
      ref={modalScrollRef}
      className="fixed inset-0 z-[20000] overflow-y-auto bg-black/85 backdrop-blur-md p-3 sm:p-6 flex items-start justify-center"
    >
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-8 shadow-2xl relative my-4 sm:my-8 shrink-0">
        <button
          onClick={onClose}
          disabled={isSaving}
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
              {isEditMode ? "Edit Movie / Series" : "Add New Movie / Series"}
            </h3>
            <p className="text-xs text-neutral-400">
              {isEditMode
                ? "Update movie details, media URLs, subtitles, or trailer in Firestore."
                : "Add a movie or series by URL (MP4 or M3U8/HLS) with metadata and subtitles."}
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
          {/* Movie / Series Video URL Source */}
          <div className="p-3.5 sm:p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4" /> Movie / Series Video URL(s) *
              </label>
              <span className="text-[11px] text-rose-400/90 font-medium">
                Supports MP4 &amp; M3U8/HLS Streams
              </span>
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
                  disabled={isSaving}
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
                    required
                    value={movieUrlInput}
                    onChange={(e) => {
                      setMovieUrlInput(e.target.value);
                      setError(null);
                    }}
                    placeholder="Single Movie: https://example.com/movie.mp4 or stream.m3u8&#10;Series: ep1.mp4, ep2.mp4 or ep1.m3u8, ep2.m3u8"
                    disabled={isSaving}
                    className="w-full pl-3.5 pr-10 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none"
                  />
                  {movieUrlInput && (
                    <button
                      type="button"
                      onClick={() => setMovieUrlInput("")}
                      disabled={isSaving}
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
                <strong className="text-neutral-300">Single Movie:</strong> Enter a direct video URL (.mp4, .m3u8, or .webm).
              </p>
              <p>
                <strong className="text-neutral-300">TV Series:</strong> Separate episode URLs with commas (e.g. <code className="text-rose-300">ep1.mp4, ep2.mp4</code> or <code className="text-rose-300">ep1.m3u8, ep2.m3u8</code>).
              </p>
              <p>
                <strong className="text-neutral-300">Season Number:</strong> If left empty or set to 1, URLs save to Season 1 (<code className="text-neutral-300">url</code>). Season 2 saves to <code className="text-neutral-300">url2</code>, Season 3 to <code className="text-neutral-300">url3</code>, etc.
              </p>
            </div>
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
                disabled={isSaving}
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
              />
            </div>

            {/* Multi-Select Genre Dropdown */}
            <div ref={genreDropdownRef} className="relative">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                Genre(s) *
              </label>

              <div
                onClick={() => !isSaving && setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                className={`w-full min-h-[42px] px-3 py-2 bg-neutral-950 border rounded-xl flex items-center justify-between gap-2 cursor-pointer transition ${
                  isGenreDropdownOpen
                    ? "border-rose-500 ring-2 ring-rose-500/40"
                    : "border-neutral-700 hover:border-neutral-600"
                } ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
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

          {/* Year & Poster Image URL */}
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
                disabled={isSaving}
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
                  <span>Poster Image URL *</span>
                </label>
                <span className="text-[10px] text-neutral-400">Portrait recommended</span>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  type="url"
                  required
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder="https://example.com/portrait-poster.jpg"
                  disabled={isSaving}
                  className="flex-1 px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                />
                {validPosterPreview && !posterPreviewError && (
                  <div className="w-9 h-12 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-950 shrink-0">
                    <img
                      src={validPosterPreview}
                      alt="Poster preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={() => setPosterPreviewError(true)}
                    />
                  </div>
                )}
              </div>
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
              disabled={isSaving}
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
              disabled={isSaving}
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
              <span className="text-[10px] text-neutral-400">YouTube / MP4 / Stream URL</span>
            </div>
            <input
              type="url"
              value={trailer}
              onChange={(e) => setTrailer(e.target.value)}
              placeholder="https://example.com/official-trailer.mp4"
              disabled={isSaving}
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
              disabled={isSaving}
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 text-neutral-300 hover:text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-rose-600/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
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
