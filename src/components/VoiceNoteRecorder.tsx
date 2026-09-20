import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, Send, Loader2, AlertCircle } from "lucide-react";
import { uploadFileToWorker } from "../lib/workerApi";

interface VoiceNoteRecorderProps {
  onVoiceNoteUploaded: (audioUrl: string) => Promise<void>;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ onVoiceNoteUploaded, disabled }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      cleanupStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Check supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // 100ms time slice
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = window.setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Mic access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Microphone permission was denied. Please allow microphone access in your browser.");
      } else {
        setError("Could not access microphone: " + (err.message || "Unknown error"));
      }
      cleanupStream();
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    cleanupStream();
    setIsRecording(false);
    setRecordDuration(0);
    audioChunksRef.current = [];
  };

  const sendRecording = async () => {
    if (!mediaRecorderRef.current || audioChunksRef.current.length === 0 && !isRecording) {
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setIsUploading(true);

    try {
      // Create promise for when data is ready
      const blobPromise = new Promise<Blob>((resolve) => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.onstop = () => {
            const blobType = mediaRecorderRef.current?.mimeType || "audio/webm";
            const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
            resolve(audioBlob);
          };
          mediaRecorderRef.current.stop();
        } else {
          const blobType = mediaRecorderRef.current?.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
          resolve(audioBlob);
        }
      });

      const audioBlob = await blobPromise;
      cleanupStream();

      // Check min duration
      if (audioBlob.size < 500) {
        setError("Voice note was too short.");
        setIsUploading(false);
        return;
      }

      // Upload via Worker API
      const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";
      const filename = `voice_${Date.now()}.${ext}`;
      const directAudioUrl = await uploadFileToWorker(audioBlob, filename);

      await onVoiceNoteUploaded(directAudioUrl);
    } catch (err: any) {
      console.error("Voice note upload error:", err);
      setError(err.message || "Failed to upload voice note.");
    } finally {
      setIsUploading(false);
      setRecordDuration(0);
      audioChunksRef.current = [];
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative">
      {error && (
        <div className="absolute -top-12 left-0 right-0 bg-rose-950/90 border border-rose-500/50 text-rose-300 text-[11px] p-2 rounded-lg flex items-center justify-between shadow-lg z-20">
          <div className="flex items-center gap-1.5 truncate">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="ml-2 hover:text-white shrink-0">
            ×
          </button>
        </div>
      )}

      {isRecording ? (
        <div className="flex items-center gap-2 p-1.5 bg-neutral-900 border border-rose-500/50 rounded-xl animate-pulse">
          {/* Pulsing indicator */}
          <div className="flex items-center gap-2 px-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-mono font-semibold text-rose-400">
              {formatTime(recordDuration)}
            </span>
          </div>

          <div className="flex-1 flex items-center gap-1">
            <div className="h-1.5 w-1.5 bg-rose-400 rounded-full animate-bounce" />
            <div className="h-2.5 w-1.5 bg-rose-400 rounded-full animate-bounce delay-75" />
            <div className="h-3.5 w-1.5 bg-rose-400 rounded-full animate-bounce delay-150" />
            <div className="h-2 w-1.5 bg-rose-400 rounded-full animate-bounce delay-100" />
          </div>

          <button
            type="button"
            onClick={cancelRecording}
            className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 rounded-lg transition"
            title="Cancel recording"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={sendRecording}
            className="p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition shadow flex items-center gap-1 text-xs font-medium px-2.5"
            title="Send voice note"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </div>
      ) : isUploading ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
          <span>Uploading voice note...</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className="p-2.5 bg-neutral-800 hover:bg-rose-600 text-neutral-300 hover:text-white rounded-xl transition disabled:opacity-40 shadow-sm"
          title="Hold/Click to record voice note"
        >
          <Mic className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
