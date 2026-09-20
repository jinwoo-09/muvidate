import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { 
  Film, 
  Search, 
  PlusCircle, 
  Tv, 
  Upload, 
  User, 
  X, 
  Menu,
  Smartphone
} from "lucide-react";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCreateRoomClick: () => void;
  onJoinRoomClick: () => void;
  onUploadMovieClick: () => void;
  onProfileClick: () => void;
}

export function Navbar({
  searchQuery,
  onSearchChange,
  onCreateRoomClick,
  onJoinRoomClick,
  onUploadMovieClick,
  onProfileClick
}: NavbarProps) {
  const { profile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const initials = profile?.username ? profile.username.slice(0, 2).toUpperCase() : "MD";

  return (
    <header className="sticky top-0 z-40 w-full bg-neutral-950/85 backdrop-blur-xl border-b border-neutral-800/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 cursor-pointer select-none">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-rose-600/25">
              <Film className="w-5 h-5" />
            </div>
            <span className="text-xl font-extrabold font-heading tracking-tight text-white flex items-center">
              MUVI<span className="text-rose-500">DATE</span>
            </span>
          </div>
        </div>

        {/* Search Input (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search movies by title, genre, year..."
              className="w-full pl-9 pr-8 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Desktop Actions */}
        <div className="hidden sm:flex items-center gap-2.5">
          {/* Download Android App Button */}
          <a
            href="https://github.com/jinwoo-09/muvidate/releases/download/1.0/Muvidate_1.0.apk"
            download
            className="px-3 py-2 bg-gradient-to-r from-emerald-950/40 to-neutral-900 hover:from-emerald-900/50 hover:to-neutral-850 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm group"
            title="Download MuviDate Android App (APK)"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="hidden lg:inline">Android App</span>
            <span className="lg:hidden">App</span>
          </a>

          <button
            onClick={onJoinRoomClick}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-750 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
          >
            <Tv className="w-3.5 h-3.5 text-neutral-400" />
            <span>Join Room</span>
          </button>

          <button
            onClick={onCreateRoomClick}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-rose-600/25"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Create Room</span>
          </button>

          <button
            onClick={onUploadMovieClick}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-750 text-neutral-300 hover:text-white rounded-xl transition"
            title="Upload Movie to Firestore"
          >
            <Upload className="w-4 h-4" />
          </button>

          {/* Profile Button */}
          <button
            onClick={onProfileClick}
            className="flex items-center gap-2 p-1 pl-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-750 rounded-xl transition"
            title="Profile & Settings"
          >
            <span className="text-xs font-semibold text-neutral-200 max-w-[100px] truncate hidden md:inline">
              @{profile?.username || "Guest"}
            </span>
            <div className="w-7 h-7 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-rose-400">
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>
          </button>
        </div>

        {/* Mobile Menu Toggle Button */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={onProfileClick}
            className="w-8 h-8 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-rose-400"
          >
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.username}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{initials}</span>
            )}
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer/Expand */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-neutral-800 bg-neutral-950 p-4 space-y-3 animate-in slide-in-from-top duration-200">
          {/* Mobile Search */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search movies..."
              className="w-full pl-9 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onCreateRoomClick();
              }}
              className="py-2.5 px-3 bg-rose-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Room</span>
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onJoinRoomClick();
              }}
              className="py-2.5 px-3 bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Tv className="w-4 h-4 text-rose-500" />
              <span>Join Room</span>
            </button>
          </div>

          <div className="pt-2 border-t border-neutral-900 space-y-2">
            <a
              href="https://github.com/jinwoo-09/muvidate/releases/download/1.0/Muvidate_1.0.apk"
              download
              className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-950/60 to-neutral-900 hover:from-emerald-900/70 hover:to-neutral-850 border border-emerald-500/40 text-emerald-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow transition"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Download Android App (.apk)</span>
            </a>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onUploadMovieClick();
                }}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-2 py-1.5"
              >
                <Upload className="w-4 h-4 text-neutral-500" />
                <span>Upload Movie (MP4)</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onProfileClick();
                }}
                className="text-xs text-rose-400 font-medium py-1.5"
              >
                Profile Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
