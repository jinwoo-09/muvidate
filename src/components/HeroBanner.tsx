import React from "react";
import { Movie } from "../types";
import { Play, Users, Calendar, Film } from "lucide-react";

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

  return (
    <div className="relative w-full rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl min-h-[380px] sm:min-h-[440px] flex items-end">
      {/* Background Poster with heavy cinematic gradient overlays */}
      <div className="absolute inset-0 z-0">
        {movie.poster ? (
          <img
            src={movie.poster}
            alt={movie.Title}
            className="w-full h-full object-cover object-center filter brightness-60 scale-105 transition duration-700 hover:scale-100"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-neutral-950 via-neutral-900 to-neutral-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/80 to-transparent w-full sm:w-2/3" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 sm:p-10 max-w-2xl space-y-4">
        {/* Genre Badges & Year */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-600 text-white shadow-md">
            Featured
          </span>
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900/80 backdrop-blur-md text-neutral-300 border border-neutral-750">
            <Calendar className="w-3 h-3 text-neutral-400" />
            {movie.year}
          </span>
          {genres.slice(0, 3).map((g) => (
            <span
              key={g}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900/80 backdrop-blur-md text-neutral-300 border border-neutral-750"
            >
              {g}
            </span>
          ))}
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-5xl font-black font-heading text-white tracking-tight leading-tight">
          {movie.Title}
        </h1>

        {/* Description */}
        <p className="text-sm text-neutral-300 line-clamp-2 sm:line-clamp-3 leading-relaxed max-w-xl">
          {movie.description || "Stream this title together with friends on MuviDate."}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => onCreateRoom(movie)}
            className="px-5 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xl shadow-rose-600/30 transition flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            <span>Watch Together</span>
          </button>

          <button
            onClick={() => onWatchAlone(movie)}
            className="px-5 py-3 bg-neutral-900/90 hover:bg-neutral-800 text-white border border-neutral-700 text-xs sm:text-sm font-semibold rounded-xl backdrop-blur-md transition flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Play Solo</span>
          </button>

          <button
            onClick={() => onViewDetails(movie)}
            className="px-4 py-3 text-neutral-400 hover:text-white text-xs sm:text-sm font-medium transition"
          >
            More Details
          </button>
        </div>
      </div>
    </div>
  );
}
