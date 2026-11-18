import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  Instagram,
  KeyRound,
  Eye,
  EyeOff,
  LogOut,
  Link2,
  Check
} from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { profile, user, updatePhoto, setPassword, logout } = useAuth();
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Password setting state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Sync photo URL input when modal opens or saved profile photo changes
  useEffect(() => {
    if (isOpen && profile) {
      setPhotoUrlInput(profile.photoURL || "");
      setPreviewLoadError(false);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, profile?.photoURL]);

  const trimmedPhotoInput = photoUrlInput.trim();
  const isCandidateValidUrl = isValidHttpUrl(trimmedPhotoInput);
  const previewUrl = isCandidateValidUrl
    ? trimmedPhotoInput
    : profile?.photoURL || "";

  useEffect(() => {
    setPreviewLoadError(false);
  }, [previewUrl]);

  if (!isOpen || !profile) return null;

  const savedPhotoUrl = profile.photoURL || "";
  const hasPhotoChanges = trimmedPhotoInput !== savedPhotoUrl;

  const handleSavePhotoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isCandidateValidUrl) {
      setError("Please enter a valid HTTP or HTTPS image URL.");
      return;
    }

    setSavingPhoto(true);
    try {
      await updatePhoto(trimmedPhotoInput);
      setSuccess("Profile picture updated successfully!");
    } catch (err: any) {
      console.error("Failed to save profile picture URL:", err);
      setError(err.message || "Failed to update profile picture URL. Please try again.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleCancelPhotoEdit = () => {
    setPhotoUrlInput(savedPhotoUrl);
    setPreviewLoadError(false);
    setError(null);
    setSuccess(null);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setSavingPassword(true);
    try {
      await setPassword(newPassword);
      setSuccess("Password saved successfully! You can now log into this account from any device.");
      setIsChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to save password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const initials = profile.username ? profile.username.slice(0, 2).toUpperCase() : "MD";

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold font-heading text-white mb-6">Your Profile</h3>

        {/* Avatar Preview */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative mb-3">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-rose-500/50 bg-neutral-800 flex items-center justify-center text-white font-bold text-2xl shadow-xl">
              {previewUrl && !previewLoadError ? (
                <img
                  src={previewUrl}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onLoad={() => setPreviewLoadError(false)}
                  onError={() => setPreviewLoadError(true)}
                />
              ) : (
                <span className="text-rose-400">{initials}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => photoInputRef.current?.focus()}
              className="absolute bottom-0 right-0 p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full border-2 border-neutral-900 shadow-md transition"
              title="Edit profile picture URL"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {hasPhotoChanges && isCandidateValidUrl && !previewLoadError && (
            <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-full mb-1">
              Previewing new avatar URL (unsaved)
            </span>
          )}
          {previewLoadError && trimmedPhotoInput && (
            <span className="text-[11px] font-medium text-rose-400">
              Could not load image preview from this URL
            </span>
          )}

          <h4 className="text-xl font-bold text-white mt-1">@{profile.username}</h4>
          <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
            Account Active
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs mb-4">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <div className="space-y-3 mb-4">
          {/* Profile Picture URL Editor */}
          <form
            onSubmit={handleSavePhotoUrl}
            className="bg-neutral-950/80 rounded-xl p-4 border border-neutral-800/80 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="profile-photo-url"
                className="flex items-center gap-2 text-xs font-semibold text-neutral-200"
              >
                <Link2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Profile Picture URL</span>
              </label>
              <span className="text-[10px] text-neutral-500">HTTP / HTTPS</span>
            </div>

            <input
              id="profile-photo-url"
              ref={photoInputRef}
              type="url"
              value={photoUrlInput}
              onChange={(e) => {
                setPhotoUrlInput(e.target.value);
                if (error) setError(null);
                if (success) setSuccess(null);
              }}
              placeholder="https://example.com/avatar.jpg"
              disabled={savingPhoto}
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500 transition"
            />

            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleCancelPhotoEdit}
                disabled={savingPhoto}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPhoto || !trimmedPhotoInput}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingPhoto ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Password Setup / Change Section */}
          <div className="bg-neutral-950/80 rounded-xl p-4 border border-neutral-800/80">
            {!isChangingPassword ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-neutral-300">
                  <KeyRound className="w-4 h-4 text-rose-400" />
                  <span>Account Password</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsChangingPassword(true)}
                  className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-xs text-white rounded-lg transition"
                >
                  Set / Change Password
                </button>
              </div>
            ) : (
              <form onSubmit={handleSavePassword} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Set Account Password</span>
                  <button
                    type="button"
                    onClick={() => setIsChangingPassword(false)}
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className="w-full pl-3 pr-9 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                />

                <button
                  type="submit"
                  disabled={savingPassword || newPassword.length < 6}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {savingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Save Password</span>
                </button>
              </form>
            )}
          </div>

          <div className="bg-neutral-950/80 rounded-xl p-4 border border-neutral-800/80">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-1">
              Your Account UID
            </span>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs text-neutral-300 font-mono truncate">{user?.uid}</code>
              <button
                onClick={copyUid}
                className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded transition shrink-0"
                title="Copy UID"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Developer Attribution */}
          <div className="bg-neutral-950/80 rounded-xl p-4 border border-neutral-800/80">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
              Developer Info
            </span>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
                  <Instagram className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Developer: Ashuuxoo</p>
                  <p className="text-[11px] text-neutral-400">Creator of MuviDate</p>
                </div>
              </div>
              <a
                href="https://www.instagram.com/ashuuxoo"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-lg text-xs font-medium transition shadow-sm shrink-0"
                title="Visit Instagram: @ashuuxoo"
              >
                <Instagram className="w-3.5 h-3.5" />
                <span>@ashuuxoo</span>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={async () => {
              onClose();
              await logout();
            }}
            className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-rose-400 border border-neutral-800 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
