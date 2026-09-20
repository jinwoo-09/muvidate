import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, AlertCircle } from "lucide-react";

interface VoiceNotePlayerProps {
  audioUrl: string;
}

export function VoiceNotePlayer({ audioUrl }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setLoadError(true);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error("Audio playback error:", err);
        setLoadError(true);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !duration) return;
    const newTime = Number(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const format = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-2 p-2 bg-neutral-900/90 border border-neutral-800 rounded-xl text-neutral-400 text-xs">
        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span>Audio note unavailable</span>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 p-2 bg-neutral-900/95 border border-neutral-800 rounded-xl min-w-[200px] max-w-[280px]">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-lg bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shrink-0 shadow transition"
        title={isPlaying ? "Pause" : "Play voice note"}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div className="relative flex items-center">
          {/* Animated decorative waveform bars */}
          <div className="w-full flex items-center justify-between gap-0.5 h-4 opacity-60">
            {[4, 8, 14, 10, 6, 12, 16, 8, 12, 18, 10, 6, 14, 8, 4].map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}px` }}
                className={`w-1 rounded-full transition-colors ${
                  (i / 15) * 100 <= progress ? "bg-rose-500" : "bg-neutral-700"
                } ${isPlaying ? "animate-pulse" : ""}`}
              />
            ))}
          </div>

          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 opacity-0 cursor-pointer w-full"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
          <span>{format(currentTime)}</span>
          <span>{duration > 0 ? format(duration) : "Voice Note"}</span>
        </div>
      </div>
    </div>
  );
}
