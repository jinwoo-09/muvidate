import React from "react";
import { Movie } from "../types";
import { Play, Users, Film, Info } from "lucide-react";

interface MovieCardProps {
  movie: Movie;
  onWatchAlone: (movie: Movie) => void;
  onCreateRoom: (movie: Movie) => void;
  onViewDetails: (movie: Movie) => void;
}

export function MovieCard({
  movie,
  onWatchAlone,
  onCreateRoom,
  onViewDetails
}: MovieCardProps) {
  const genres = movie.genre
    ? movie.genre.split(",").map((g) => g.trim())
    : [];

  return (
    <div className="group relative rounded-2xl bg-neutral-900 border border-neutral-800/80 overflow-hidden shadow-lg transition-all duration-300 hover:shadow-2xl hover:border-neutral-700 hover:-translate-y-1 flex flex-col">
      {/* Poster Media Area */}
      <div
        onClick={() => onViewDetails(movie)}
        className="relative aspect-[2/3] w-full bg-neutral-950 overflow-hidden cursor-pointer"
      >
        {movie.poster ? (
          <img
            src={movie.poster}
            alt={movie.Title}
            className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-neutral-600 bg-neutral-900">
            <Film className="w-10 h-10 mb-2" />
            <span className="text-xs font-semibold">No Poster</span>
          </div>
        )}

        {/* Year badge */}
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-neutral-950/80 backdrop-blur-md text-[10px] font-mono text-neutral-300 border border-neutral-800">
          {movie.year}
        </div>

        {/* Hover overlay with action buttons */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto flex flex-col justify-end p-3.5 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateRoom(movie);
            }}
            className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Watch Together</span>
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onWatchAlone(movie);
              }}
              className="py-1.5 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700 text-white rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Solo</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(movie);
              }}
              className="py-1.5 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1"
            >
              <Info className="w-3 h-3" />
              <span>Info</span>
            </button>
          </div>
        </div>
      </div>

      {/* Card Info Area */}
      <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <h3
            onClick={() => onViewDetails(movie)}
            className="text-sm font-bold text-white truncate cursor-pointer hover:text-rose-400 transition"
            title={movie.Title}
          >
            {movie.Title}
          </h3>
          <p className="text-[11px] text-neutral-400 truncate mt-0.5">
            {genres.slice(0, 2).join(" • ") || "Movie"}
          </p>
        </div>
      </div>
    </div>
  );
}
