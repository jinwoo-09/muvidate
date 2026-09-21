import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { rtdb } from "../lib/firebase";
import { ref, onValue, off, push, set } from "firebase/database";
import { ChatMessage } from "../types";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { Send, MessageSquare, Shield, Smile, X } from "lucide-react";

interface RoomChatProps {
  roomCode: string;
  adminUid: string;
  isMovieCompleted: boolean;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

export function RoomChat({ 
  roomCode, 
  adminUid, 
  isMovieCompleted,
  onRecordingStateChange 
}: RoomChatProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<{ username: string; photoURL: string; initials: string } | null>(null);

  useEffect(() => {
    const chatRef = ref(rtdb, `rooms/${roomCode}/chat`);

    const handleData = (snapshot: any) => {
      const val = snapshot.val();
      if (!val) {
        setMessages([]);
        return;
      }

      const list: ChatMessage[] = Object.keys(val).map((k) => ({
        id: k,
        ...val[k]
      }));

      // Sort chronologically by createdAt
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(list);
    };

    onValue(chatRef, handleData);

    return () => {
      off(chatRef, "value", handleData);
    };
  }, [roomCode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !user || !profile || isSending || isMovieCompleted) return;

    setIsSending(true);
    try {
      const chatRef = ref(rtdb, `rooms/${roomCode}/chat`);
      const newMsgRef = push(chatRef);
      const msg: ChatMessage = {
        id: newMsgRef.key || Date.now().toString(),
        uid: user.uid,
        username: profile.username,
        photoURL: profile.photoURL || "",
        type: "text",
        text,
        createdAt: Date.now()
      };
      await set(newMsgRef, msg);
      setInputText("");
    } catch (err) {
      console.error("Send message error:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleVoiceNoteUploaded = async (audioUrl: string) => {
    if (!user || !profile || isMovieCompleted) return;
    const chatRef = ref(rtdb, `rooms/${roomCode}/chat`);
    const newMsgRef = push(chatRef);
    const msg: ChatMessage = {
      id: newMsgRef.key || Date.now().toString(),
      uid: user.uid,
      username: profile.username,
      photoURL: profile.photoURL || "",
      type: "voice",
      audioUrl,
      createdAt: Date.now()
    };
    await set(newMsgRef, msg);
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900/90 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/90 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-rose-500" />
          <h4 className="text-sm font-bold text-white tracking-wide">Live Room Chat</h4>
        </div>
        <span className="text-[11px] text-neutral-400 bg-neutral-800/80 px-2 py-0.5 rounded-full">
          {messages.length} messages
        </span>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 min-h-[220px]">
        {isMovieCompleted ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-neutral-500">
            <p className="text-sm font-semibold text-neutral-300">Session Ended</p>
            <p className="text-xs mt-1">Chat and voice notes are closed because the movie has finished.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-neutral-500">
            <MessageSquare className="w-8 h-8 stroke-1 text-neutral-600 mb-2" />
            <p className="text-sm font-medium text-neutral-300">Be the first to say something.</p>
            <p className="text-xs text-neutral-500 mt-1">Send a message or voice note to your watch party.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSystem = msg.type === "system";
            if (isSystem) {
              return (
                <div
                  key={msg.id}
                  className="flex justify-center w-full my-2 animate-in fade-in zoom-in-95 duration-200"
                >
                  <div className="px-4 py-1.5 rounded-full text-[11px] font-medium bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center gap-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span>{msg.text}</span>
                  </div>
                </div>
              );
            }

            const isMe = msg.uid === user?.uid;
            const isHost = msg.uid === adminUid;
            const initials = msg.username ? msg.username.slice(0, 2).toUpperCase() : "U";

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 items-start ${isMe ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div 
                  onClick={() => setSelectedAvatar({
                    username: msg.username,
                    photoURL: msg.photoURL || "",
                    initials
                  })}
                  className="w-7 h-7 rounded-full overflow-hidden bg-neutral-800 shrink-0 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-300 shadow-sm mt-0.5 cursor-pointer hover:scale-105 active:scale-95 transition"
                >
                  {msg.photoURL ? (
                    <img
                      src={msg.photoURL}
                      alt={msg.username}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                {/* Message Body */}
                <div className={`max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-neutral-300">
                      {isMe ? "You" : `@${msg.username}`}
                    </span>
                    {isHost && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.2 rounded">
                        <Shield className="w-2.5 h-2.5" /> Host
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-500">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>

                  {msg.type === "voice" && msg.audioUrl ? (
                    <VoiceNotePlayer audioUrl={msg.audioUrl} />
                  ) : (
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-sm ${
                        isMe
                          ? "bg-rose-600 text-white rounded-tr-sm"
                          : "bg-neutral-800 text-neutral-100 rounded-tl-sm border border-neutral-750"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input & Voice Note */}
      <div className="p-2.5 sm:p-3 border-t border-neutral-800 bg-neutral-950/80">
        {isMovieCompleted ? (
          <p className="text-center text-xs text-neutral-500 py-1">
            Chat is disabled (movie session ended).
          </p>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <VoiceNoteRecorder
              onVoiceNoteUploaded={handleVoiceNoteUploaded}
              onRecordingStateChange={onRecordingStateChange}
              disabled={isMovieCompleted}
            />

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              disabled={isMovieCompleted}
              className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-750 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition"
            />

            <button
              type="submit"
              disabled={!inputText.trim() || isSending || isMovieCompleted}
              className="p-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition disabled:opacity-40 shadow-sm"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Avatar Image Popup Overlay */}
      {selectedAvatar && (
        <div
          onClick={() => setSelectedAvatar(null)}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col items-center max-w-xs w-full animate-in zoom-in-95 duration-200"
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedAvatar(null)}
              className="absolute -top-12 right-0 p-2 rounded-full bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:text-white transition"
              aria-label="Close profile picture"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Avatar Circle */}
            <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-rose-600 bg-neutral-900 shadow-2xl flex items-center justify-center text-4xl font-bold text-neutral-200">
              {selectedAvatar.photoURL ? (
                <img
                  src={selectedAvatar.photoURL}
                  alt={selectedAvatar.username}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                ></img>
              ) : (
                <span>{selectedAvatar.initials}</span>
              )}
            </div>

            {/* Username underneath */}
            <p className="mt-4 text-sm font-bold text-white tracking-wide bg-neutral-900/80 border border-neutral-800 px-3 py-1.5 rounded-full shadow">
              @{selectedAvatar.username}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
