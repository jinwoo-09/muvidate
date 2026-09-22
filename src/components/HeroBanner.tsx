import React from "react";
import { Movie } from "../types";
import { Play, Users, Calendar, Sparkles } from "lucide-react";

interface HeroBannerProps {
  movie: Movie | null;
  onWatchAlone: (movie: Movie) => void;
  onCreateRoom: (movie: Movie) => void;
  onViewDetails: (movie: Movie) => void;
}

export function HeroBanner({
  movie,
  onWatchAlone,
  onCreateRoom,
  onViewDetails
}: HeroBannerProps) {
  if (!movie) return null;

  const genres = movie.genre
    ? movie.genre.split(",").map((g) => g.trim())
    : ["Featured"];

  const bannerUrl = movie.cover && movie.cover.trim() !== "" ? movie.cover : movie.poster;

  return (
    <div className="relative w-full rounded-3xl overflow-hidden bg-neutral-950 border border-neutral-800/80 shadow-2xl min-h-[360px] sm:min-h-[440px] md:min-h-[500px] lg:min-h-[540px] flex items-end select-none group">
      {/* Background Banner Image with cinematic clarity */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {bannerUrl ? (
          <img
            key={bannerUrl}
            src={bannerUrl}
            alt={movie.Title}
            className="w-full h-full object-cover object-[center_25%] sm:object-center filter brightness-90 sm:brightness-95 contrast-[1.05] transition-all duration-1000 ease-out animate-in fade-in zoom-in-[0.98]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-neutral-950 via-neutral-900 to-neutral-800" />
        )}

        {/* Netflix-style cinematic layered overlays: heavy at bottom/left, clear in center/right */}
        {/* Top subtle vignette for header contrast */}
        <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-neutral-950/70 via-neutral-950/20 to-transparent" />

        {/* Bottom vertical fade */}
        <div className="absolute inset-x-0 bottom-0 h-4/5 bg-gradient-to-t from-neutral-950 via-neutral-950/75 via-45% to-transparent" />

        {/* Left horizontal fade focused on text area */}
        <div className="absolute inset-y-0 left-0 w-full sm:w-3/4 md:w-3/5 bg-gradient-to-r from-neutral-950/90 via-neutral-950/60 via-50% to-transparent" />
      </div>

      {/* Dedicated Lower-Left Content Area */}
      <div className="relative z-10 p-5 sm:p-8 md:p-10 lg:p-12 w-full max-w-xl sm:max-w-xl md:max-w-2xl space-y-3 sm:space-y-4 pointer-events-auto">
        {/* Genre Badges & Year */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-rose-600/90 text-white shadow-md backdrop-blur-sm">
            <Sparkles className="w-3 h-3" />
            Featured
          </span>
          {movie.year ? (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-neutral-900/80 backdrop-blur-md text-neutral-300 border border-neutral-700/60">
              <Calendar className="w-3 h-3 text-neutral-400" />
              {movie.year}
            </span>
          ) : null}
          {genres.slice(0, 2).map((g) => (
            <span
              key={g}
              className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-neutral-900/80 backdrop-blur-md text-neutral-300 border border-neutral-700/60"
            >
              {g}
            </span>
          ))}
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black font-heading text-white tracking-tight leading-[1.1] drop-shadow-md">
          {movie.Title}
        </h1>

        {/* Description */}
        <p className="text-xs sm:text-sm text-neutral-300 line-clamp-2 sm:line-clamp-3 leading-relaxed max-w-lg drop-shadow">
          {movie.description || "Stream this title synchronously with friends on MuviDate."}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1 sm:pt-2">
          <button
            onClick={() => onCreateRoom(movie)}
            className="px-4 py-2.5 sm:px-5 sm:py-3 bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center gap-2 active:scale-95"
          >
            <Users className="w-4 h-4" />
            <span>Watch Together</span>
          </button>

          <button
            onClick={() => onWatchAlone(movie)}
            className="px-4 py-2.5 sm:px-5 sm:py-3 bg-neutral-900/80 hover:bg-neutral-800 text-white border border-neutral-700/80 text-xs sm:text-sm font-semibold rounded-xl backdrop-blur-md transition flex items-center gap-2 active:scale-95"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Play Solo</span>
          </button>

          <button
            onClick={() => onViewDetails(movie)}
            className="px-3 py-2 sm:px-4 sm:py-2.5 text-neutral-400 hover:text-white text-xs sm:text-sm font-medium rounded-xl hover:bg-white/5 transition"
          >
            More Details
          </button>
        </div>
      </div>
    </div>
  );
}
