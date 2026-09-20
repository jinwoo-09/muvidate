import React, { useState } from "react";
import { Movie } from "../types";
import { VideoPlayer } from "./VideoPlayer";
import { 
  X, 
  Play, 
  Users, 
  Calendar, 
  Tag, 
  Share2, 
  Check, 
  ArrowLeft, 
  Film 
} from "lucide-react";

interface MovieDetailModalProps {
  movie: Movie | null;
  onClose: () => void;
  onCreateRoom: (movie: Movie) => void;
}

export function MovieDetailModal({
  movie,
  onClose,
  onCreateRoom
}: MovieDetailModalProps) {
  const [isPlayingSolo, setIsPlayingSolo] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!movie) return null;

  const genres = movie.genre
    ? movie.genre.split(",").map((g) => g.trim())
    : [];

  const copyUrl = () => {
    navigator.clipboard.writeText(movie.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2.5 bg-black/60 hover:bg-black/90 text-neutral-300 hover:text-white rounded-full backdrop-blur-md transition shadow-md"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {isPlayingSolo ? (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsPlayingSolo(false)}
                className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 hover:text-white px-3 py-1.5 rounded-xl bg-neutral-800 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Overview</span>
              </button>
              <h4 className="text-sm font-bold text-white truncate max-w-md">
                {movie.Title} (Solo Play)
              </h4>
            </div>

            <VideoPlayer
              src={movie.url}
              poster={movie.poster}
              isHost={true}
              controlsLocked={false}
            />
          </div>
        ) : (
          <div>
            {/* Header Backdrop / Banner */}
            <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-neutral-950">
              {movie.poster ? (
                <img
                  src={movie.poster}
                  alt={movie.Title}
                  className="w-full h-full object-cover object-center filter brightness-50"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
                  <Film className="w-16 h-16" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/60 to-transparent" />

              {/* Title & Badges positioned at bottom of backdrop */}
              <div className="absolute bottom-6 left-6 right-6 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-950/80 backdrop-blur-md text-neutral-200 border border-neutral-700">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    {movie.year}
                  </span>
                  {genres.map((g) => (
                    <span
                      key={g}
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/20 backdrop-blur-md text-rose-300 border border-rose-500/30"
                    >
                      {g}
                    </span>
                  ))}
                </div>

                <h2 className="text-2xl sm:text-4xl font-extrabold font-heading text-white tracking-tight">
                  {movie.Title}
                </h2>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Synopsis */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  Synopsis
                </h4>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  {movie.description || "No description provided for this title."}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    onClose();
                    onCreateRoom(movie);
                  }}
                  className="flex-1 sm:flex-initial px-6 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xl shadow-rose-600/30 transition flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  <span>Create Watch Room</span>
                </button>

                <button
                  onClick={() => setIsPlayingSolo(true)}
                  className="px-6 py-3 bg-neutral-800 hover:bg-neutral-750 text-white text-xs sm:text-sm font-semibold rounded-xl border border-neutral-700 transition flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Watch Alone</span>
                </button>

                <button
                  onClick={copyUrl}
                  className="p-3 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-xl border border-neutral-800 transition"
                  title="Copy video URL"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
