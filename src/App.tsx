import React, { useState, useEffect, useMemo } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { subscribeToMovies } from "./lib/firebase";
import { Movie } from "./types";
import { Navbar } from "./components/Navbar";
import { HeroBanner } from "./components/HeroBanner";
import { MovieCard } from "./components/MovieCard";
import { MovieDetailModal } from "./components/MovieDetailModal";
import { CreateRoomModal } from "./components/CreateRoomModal";
import { JoinRoomModal } from "./components/JoinRoomModal";
import { UploadMovieModal } from "./components/UploadMovieModal";
import { ProfileModal } from "./components/ProfileModal";
import { UsernameSetupModal } from "./components/UsernameSetupModal";
import { WatchRoom } from "./components/WatchRoom";
import { 
  Film, 
  Tv, 
  PlusCircle, 
  Sparkles, 
  Clapperboard, 
  Search, 
  SlidersHorizontal,
  Flame,
  Instagram,
  Smartphone,
  Download
} from "lucide-react";

function MainContent() {
  const { loading: authLoading } = useAuth();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");

  // Navigation / Active View
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [activeOfflineFile, setActiveOfflineFile] = useState<File | undefined>(undefined);

  // Modals
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState(false);
  const [isUploadMovieOpen, setIsUploadMovieOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedMovieForDetail, setSelectedMovieForDetail] = useState<Movie | null>(null);
  const [preselectedMovieForRoom, setPreselectedMovieForRoom] = useState<Movie | null>(null);

  // Parse room code from URL if present (e.g. ?room=1234 or #1234)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromQuery = params.get("room");
    if (roomFromQuery && /^\d{4}$/.test(roomFromQuery)) {
      setActiveRoomCode(roomFromQuery);
    }
  }, []);

  // Listen to Firestore movie collection
  useEffect(() => {
    const unsubscribe = subscribeToMovies(
      (loadedMovies) => {
        setMovies(loadedMovies);
        setLoadingMovies(false);
      },
      (err) => {
        console.error("Movie subscription error:", err);
        setLoadingMovies(false);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Extract unique genres dynamically from all loaded movies
  const genresList = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => {
      if (m.genre) {
        m.genre.split(",").forEach((g) => {
          const trimmed = g.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    });
    return ["All", ...Array.from(set)];
  }, [movies]);

  // Filtered movies based on genre and search query
  const filteredMovies = useMemo(() => {
    return movies.filter((m) => {
      // Genre filter
      const matchesGenre =
        selectedGenre === "All" ||
        (m.genre &&
          m.genre
            .toLowerCase()
            .split(",")
            .map((g) => g.trim())
            .includes(selectedGenre.toLowerCase()));

      // Search filter
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        m.Title.toLowerCase().includes(q) ||
        (m.genre && m.genre.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.year && m.year.toString().includes(q));

      return matchesGenre && matchesSearch;
    });
  }, [movies, selectedGenre, searchQuery]);

  // Featured Hero movie (first movie with valid poster or first movie in list)
  const heroMovie = useMemo(() => {
    return movies.find((m) => m.poster) || movies[0] || null;
  }, [movies]);

  const handleStartCreateRoom = (movie?: Movie) => {
    setPreselectedMovieForRoom(movie || null);
    setIsCreateRoomOpen(true);
  };

  const handleRoomCreated = (roomCode: string, offlineFile?: File) => {
    setIsCreateRoomOpen(false);
    setActiveOfflineFile(offlineFile);
    setActiveRoomCode(roomCode);
    window.history.pushState({}, "", `?room=${roomCode}`);
  };

  const handleRoomJoined = (roomCode: string) => {
    setIsJoinRoomOpen(false);
    setActiveRoomCode(roomCode);
    window.history.pushState({}, "", `?room=${roomCode}`);
  };

  const handleLeaveRoom = () => {
    setActiveRoomCode(null);
    setActiveOfflineFile(undefined);
    window.history.pushState({}, "", window.location.pathname);
  };

  // If user is inside an active watch room, show the WatchRoom view
  if (activeRoomCode) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-rose-500 selection:text-white">
        <UsernameSetupModal />
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
        />
        <WatchRoom
          roomCode={activeRoomCode}
          initialOfflineFile={activeOfflineFile}
          onLeaveRoom={handleLeaveRoom}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-rose-500 selection:text-white">
      {/* Mandatory Onboarding Username Modal */}
      <UsernameSetupModal />

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      {/* Upload Movie Modal */}
      <UploadMovieModal
        isOpen={isUploadMovieOpen}
        onClose={() => setIsUploadMovieOpen(false)}
      />

      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={isCreateRoomOpen}
        onClose={() => {
          setIsCreateRoomOpen(false);
          setPreselectedMovieForRoom(null);
        }}
        movies={movies}
        initialMovie={preselectedMovieForRoom}
        onRoomCreated={handleRoomCreated}
      />

      {/* Join Room Modal */}
      <JoinRoomModal
        isOpen={isJoinRoomOpen}
        onClose={() => setIsJoinRoomOpen(false)}
        onRoomJoined={handleRoomJoined}
      />

      {/* Movie Details Modal */}
      <MovieDetailModal
        movie={selectedMovieForDetail}
        onClose={() => setSelectedMovieForDetail(null)}
        onCreateRoom={(m) => handleStartCreateRoom(m)}
      />

      {/* Top Navbar */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateRoomClick={() => handleStartCreateRoom()}
        onJoinRoomClick={() => setIsJoinRoomOpen(true)}
        onUploadMovieClick={() => setIsUploadMovieOpen(true)}
        onProfileClick={() => setIsProfileOpen(true)}
      />

      {/* Main Streaming Catalog Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Hero Section (only when not searching) */}
        {!searchQuery && selectedGenre === "All" && heroMovie && (
          <section>
            <HeroBanner
              movie={heroMovie}
              onWatchAlone={(m) => setSelectedMovieForDetail(m)}
              onCreateRoom={(m) => handleStartCreateRoom(m)}
              onViewDetails={(m) => setSelectedMovieForDetail(m)}
            />
          </section>
        )}

        {/* Quick Watch Party CTA Bar */}
        <section className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-850 border border-neutral-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Have a 4-Digit Room Code?</h3>
              <p className="text-xs text-neutral-400">
                Join friends instantly with synchronized playback, live chat & voice notes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => setIsJoinRoomOpen(true)}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-white rounded-xl text-xs font-semibold border border-neutral-700 transition"
            >
              Enter Code
            </button>
            <button
              onClick={() => handleStartCreateRoom()}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-600/25 transition"
            >
              Create Room
            </button>
          </div>
        </section>

        {/* Genre Pill Filters */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-500" />
              <h2 className="text-base sm:text-lg font-bold font-heading text-white">
                {searchQuery ? `Search Results for "${searchQuery}"` : "Explore Catalog"}
              </h2>
            </div>
            <span className="text-xs text-neutral-400">
              {filteredMovies.length} {filteredMovies.length === 1 ? "movie" : "movies"}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {genresList.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  selectedGenre === genre
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
                    : "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </section>

        {/* Movies Grid / Skeletons / Empty State */}
        <section>
          {loadingMovies ? (
            /* Loading Skeletons */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div
                  key={n}
                  className="rounded-2xl bg-neutral-900 border border-neutral-800 p-2 space-y-2 animate-pulse"
                >
                  <div className="aspect-[2/3] w-full bg-neutral-800 rounded-xl" />
                  <div className="h-4 bg-neutral-800 rounded w-3/4" />
                  <div className="h-3 bg-neutral-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredMovies.length > 0 ? (
            /* Movie Cards Grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
              {filteredMovies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onWatchAlone={(m) => setSelectedMovieForDetail(m)}
                  onCreateRoom={(m) => handleStartCreateRoom(m)}
                  onViewDetails={(m) => setSelectedMovieForDetail(m)}
                />
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center p-12 text-center bg-neutral-900/50 border border-neutral-850 rounded-3xl">
              <Film className="w-12 h-12 text-neutral-600 mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">
                {searchQuery ? "No movies found." : "No movies available yet."}
              </h3>
              <p className="text-xs text-neutral-400 max-w-sm mb-5 leading-relaxed">
                {searchQuery
                  ? `No titles matched "${searchQuery}". Try searching for another genre or keyword.`
                  : "Upload the first MP4 movie to MuviDate or stream via direct URL."}
              </p>
              {searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedGenre("All");
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl transition"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  onClick={() => setIsUploadMovieOpen(true)}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow transition flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Upload Movie Now</span>
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-900 bg-neutral-950 py-7 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <p>© {new Date().getFullYear()} MuviDate • Watch Together In Sync</p>
            <span className="hidden sm:inline text-neutral-750">•</span>
            {/* Developer Instagram Link */}
            <a
              href="https://www.instagram.com/ashuuxoo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 hover:bg-neutral-850 text-neutral-300 hover:text-rose-400 border border-neutral-800 hover:border-rose-500/40 transition shadow-sm group"
              title="Visit Developer's Instagram: Ashuuxoo"
            >
              <Instagram className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
              <span>Developer: <strong className="text-white font-medium group-hover:text-rose-400">Ashuuxoo</strong></span>
            </a>
          </div>

          {/* Android App Download Action */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/jinwoo-09/muvidate/releases/download/1.0/Muvidate_1.0.apk"
              download
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-emerald-950/60 via-neutral-900 to-rose-950/30 hover:from-emerald-900/80 hover:to-neutral-800 text-neutral-200 hover:text-white border border-emerald-500/40 hover:border-emerald-400 transition shadow-sm font-medium group"
              title="Download MuviDate APK for Android"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>Download Android App</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-300 font-semibold border border-emerald-700/50 flex items-center gap-0.5">
                <Download className="w-2.5 h-2.5" />
                APK
              </span>
            </a>
          </div>

          <div className="flex items-center gap-3 text-neutral-400">
            <span>Powered by Firebase RTDB & Firestore</span>
            <span>•</span>
            <span>Worker API Uploads</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
