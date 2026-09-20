import React, { useState, useRef } from "react";
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
  FileVideo 
} from "lucide-react";

interface UploadMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMovieAdded?: () => void;
}

export function UploadMovieModal({ isOpen, onClose, onMovieAdded }: UploadMovieModalProps) {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [description, setDescription] = useState("");
  const [posterMode, setPosterMode] = useState<"upload" | "url">("upload");
  const [posterUrl, setPosterUrl] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [movieFile, setMovieFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const movieInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleMovieFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate MP4 requirement strictly
    const isMp4Name = file.name.toLowerCase().endsWith(".mp4");
    const isMp4Type = file.type === "video/mp4" || file.type === "";

    if (!isMp4Name) {
      setError("Only MP4 video files are accepted. Please select a valid .mp4 file.");
      setMovieFile(null);
      return;
    }

    setError(null);
    setMovieFile(file);
  };

  const handlePosterFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Poster file must be an image (JPEG, PNG, WebP, etc.).");
      setPosterFile(null);
      return;
    }

    setError(null);
    setPosterFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Mandatory field check
    if (!title.trim()) {
      setError("Movie Title is mandatory.");
      return;
    }
    if (!genre.trim()) {
      setError("Genre is mandatory (e.g. Action, Sci-Fi).");
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
    if (!movieFile) {
      setError("MP4 Video file is mandatory.");
      return;
    }

    // Double check MP4
    if (!movieFile.name.toLowerCase().endsWith(".mp4")) {
      setError("Video file must be an MP4 (.mp4).");
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

      // 2. Upload MP4 Movie File
      setUploadStep(`Uploading MP4 movie "${movieFile.name}" (${(movieFile.size / (1024 * 1024)).toFixed(1)} MB)...`);
      const finalMovieUrl = await uploadFileToWorker(movieFile, movieFile.name);

      // 3. Save into Firestore `movie` collection
      setUploadStep("Saving movie metadata into Firestore...");
      await addMovieToFirestore({
        Title: title.trim(),
        genre: genre.trim(),
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
          {/* MP4 Movie Upload Field */}
          <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <FileVideo className="w-4 h-4" /> MP4 Video File (Mandatory)
              </label>
              <span className="text-[11px] text-neutral-400">Worker Upload • .mp4 only</span>
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
                  onClick={() => setMovieFile(null)}
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
                <p className="text-sm font-medium text-white">Click or drag MP4 video here</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Required: File must end with .mp4
                </p>
              </div>
            )}
          </div>

          {/* Title & Genre */}
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

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                Genre(s) *
              </label>
              <input
                type="text"
                required
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g. Sci-Fi, Thriller"
                disabled={isUploading}
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
              />
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
                  Poster Image *
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
                    accept="image/*"
                    className="hidden"
                    onChange={handlePosterFileSelect}
                    disabled={isUploading}
                  />
                  {posterFile ? (
                    <div className="flex items-center justify-between p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl">
                      <span className="text-xs text-neutral-200 truncate">{posterFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setPosterFile(null)}
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
                      <span>Select Poster Image File</span>
                    </button>
                  )}
                </div>
              ) : (
                <input
                  type="url"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder="https://example.com/poster.jpg"
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
