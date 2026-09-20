import React, { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { uploadFileToWorker } from "../lib/workerApi";
import { X, Camera, Loader2, AlertCircle, CheckCircle, Copy, User, Instagram, KeyRound, Eye, EyeOff } from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { profile, user, updatePhoto, setPassword } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password setting state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  if (!isOpen || !profile) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image format
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, WebP, GIF).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size exceeds 10MB limit.");
      return;
    }

    setError(null);
    setSuccess(null);
    setUploading(true);

    try {
      const photoUrl = await uploadFileToWorker(file, file.name);
      await updatePhoto(photoUrl);
      setSuccess("Profile picture updated successfully!");
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      setError(err.message || "Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold font-heading text-white mb-6">Your Profile</h3>

        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative group mb-3">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-rose-500/50 bg-neutral-800 flex items-center justify-center text-white font-bold text-2xl shadow-xl">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-rose-400">{initials}</span>
              )}
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full border-2 border-neutral-900 shadow-md transition disabled:opacity-50"
              title="Change profile picture"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <p className="text-xs text-neutral-400">Click the camera icon to upload a new avatar</p>
          <h4 className="text-xl font-bold text-white mt-3">@{profile.username}</h4>
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

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-xl transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
