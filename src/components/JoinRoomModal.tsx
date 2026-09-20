import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { rtdb } from "../lib/firebase";
import { ref, get, update } from "firebase/database";
import { X, Users, AlertCircle, Loader2, ArrowRight } from "lucide-react";

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomJoined: (roomCode: string) => void;
}

export function JoinRoomModal({ isOpen, onClose, onRoomJoined }: JoinRoomModalProps) {
  const { user, profile } = useAuth();
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = roomCode.trim();

    // Validate 4 digits strictly
    if (!/^\d{4}$/.test(cleanCode)) {
      setError("Please enter a valid 4-digit numeric room code (e.g. 4821).");
      return;
    }

    if (!user || !profile) {
      setError("Please wait for your profile to finish loading.");
      return;
    }

    setIsJoining(true);
    try {
      const roomRef = ref(rtdb, `rooms/${cleanCode}`);
      const snap = await get(roomRef);

      if (!snap.exists()) {
        setError(`Room #${cleanCode} was not found. Please verify the 4-digit code.`);
        setIsJoining(false);
        return;
      }

      const roomData = snap.val();

      // Check 24-hour expiration
      if (roomData.expiresAt && Date.now() > roomData.expiresAt) {
        setError(`Room #${cleanCode} has expired. Rooms are only valid for 24 hours.`);
        setIsJoining(false);
        return;
      }

      // Add user to participants
      await update(ref(rtdb, `rooms/${cleanCode}/participants/${user.uid}`), {
        uid: user.uid,
        username: profile.username,
        photoURL: profile.photoURL || "",
        joinedAt: Date.now(),
        isOnline: true
      });

      onRoomJoined(cleanCode);
    } catch (err: any) {
      console.error("Join room error:", err);
      setError(err.message || "Failed to join room. Please check your connection and try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
        <button
          onClick={onClose}
          disabled={isJoining}
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold font-heading text-white">Join Watch Room</h3>
          <p className="text-xs text-neutral-400 mt-1">
            Enter the 4-digit room code shared by your friend or host.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 text-center mb-2">
              4-Digit Room Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={roomCode}
              onChange={(e) => {
                const numericOnly = e.target.value.replace(/\D/g, "");
                setRoomCode(numericOnly);
                if (error) setError(null);
              }}
              placeholder="••••"
              autoFocus
              className="w-full text-center tracking-[0.6em] text-3xl font-mono font-bold py-3.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition"
            />
            <p className="text-[11px] text-neutral-500 text-center mt-2">
              Example: 7824
            </p>
          </div>

          <button
            type="submit"
            disabled={isJoining || roomCode.length !== 4}
            className="w-full py-3 px-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium rounded-xl transition shadow-lg shadow-rose-600/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
          >
            {isJoining ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting to Room...</span>
              </>
            ) : (
              <>
                <span>Enter Room</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
