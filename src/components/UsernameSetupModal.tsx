import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { isUsernameTaken } from "../lib/firebase";
import { Film, User, CheckCircle, AlertCircle, Loader2, KeyRound, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

export function UsernameSetupModal() {
  const { needsUsernameSetup, saveUsername, loginUser, user, loading } = useAuth();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !needsUsernameSetup) return null;

  const validateUsername = (val: string): string | null => {
    const trimmed = val.trim();
    if (trimmed.length < 3) return "Username must be at least 3 characters.";
    if (trimmed.length > 20) return "Username cannot exceed 20 characters.";
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return "Username can only contain letters, numbers, and underscores (_).";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const userErr = validateUsername(username);
    if (userErr) {
      setError(userErr);
      return;
    }

    if (mode === "register") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please verify.");
        return;
      }
    } else {
      if (!password) {
        setError("Please enter your account password.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === "register") {
        const taken = await isUsernameTaken(username, user?.uid);
        if (taken) {
          setError(`"${username.trim()}" is already taken. Please try a different handle.`);
          setIsSubmitting(false);
          return;
        }
        await saveUsername(username.trim(), password);
      } else {
        await loginUser(username.trim(), password);
      }
    } catch (err: any) {
      setError(err.message || "Failed to process request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const initials = username.trim() ? username.trim().slice(0, 2).toUpperCase() : "MD";

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6 sm:p-8 relative overflow-hidden my-auto">
        {/* Ambient glow accent */}
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-500/20 mb-3">
            <Film className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold font-heading text-white tracking-tight">
            {mode === "register" ? "Welcome to MuviDate" : "Welcome Back"}
          </h2>
          <p className="text-neutral-400 text-sm mt-1">
            {mode === "register"
              ? "Create your username and password to sync with friends anywhere."
              : "Log in with your existing username and password."}
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex p-1 bg-neutral-950 border border-neutral-800 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
              mode === "register"
                ? "bg-rose-600 text-white shadow"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>New Account</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
              mode === "login"
                ? "bg-rose-600 text-white shadow"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Log In</span>
          </button>
        </div>

        {/* Avatar Preview */}
        {mode === "register" && (
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-700 border-2 border-neutral-600 flex items-center justify-center text-rose-400 font-bold text-lg shadow-inner">
                {initials}
              </div>
              <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center border-2 border-neutral-900 shadow">
                <User className="w-3 h-3" />
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. cinema_lover"
                autoFocus
                maxLength={20}
                className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition text-sm"
              />
              {username.trim().length >= 3 && !error && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={mode === "register" ? "At least 6 characters" : "Enter your password"}
                className="w-full pl-4 pr-10 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div>
              <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Repeat your password"
                  className="w-full pl-4 pr-10 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition text-sm"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || username.trim().length < 3 || password.length < 6}
            className="w-full py-3 px-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-semibold rounded-xl transition shadow-lg shadow-rose-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{mode === "register" ? "Creating Account..." : "Logging In..."}</span>
              </>
            ) : mode === "register" ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Create Account & Start</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Log In</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
