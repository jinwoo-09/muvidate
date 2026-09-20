import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { 
  auth, 
  ensureAnonymousAuth, 
  getUserProfile, 
  registerWithUsernameAndPassword,
  loginWithUsernameAndPassword,
  setAccountPassword,
  updateUserProfilePhoto 
} from "../lib/firebase";
import { UserProfile } from "../types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  needsUsernameSetup: boolean;
  saveUsername: (username: string, password?: string) => Promise<void>;
  loginUser: (username: string, password: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  updatePhoto: (photoUrl: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [needsUsernameSetup, setNeedsUsernameSetup] = useState<boolean>(false);

  useEffect(() => {
    // onAuthStateChanged waits for Firebase Auth to restore any persisted session from IndexedDB/localStorage
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userProf = await getUserProfile(currentUser.uid);
          if (userProf && userProf.username) {
            setProfile(userProf);
            setNeedsUsernameSetup(false);
          } else {
            setProfile(null);
            setNeedsUsernameSetup(true);
          }
        } catch (err) {
          console.error("Error reading user profile:", err);
          setNeedsUsernameSetup(true);
        }
      } else {
        setProfile(null);
        setNeedsUsernameSetup(true);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const saveUsername = async (username: string, password?: string) => {
    const newProfile = await registerWithUsernameAndPassword(username, password);
    setProfile(newProfile);
    setNeedsUsernameSetup(false);
  };

  const loginUser = async (username: string, password: string) => {
    const loggedProfile = await loginWithUsernameAndPassword(username, password);
    setProfile(loggedProfile);
    setNeedsUsernameSetup(false);
  };

  const setPassword = async (password: string) => {
    await setAccountPassword(password);
  };

  const updatePhoto = async (photoUrl: string) => {
    if (!user) throw new Error("No active user session.");
    await updateUserProfilePhoto(user.uid, photoUrl);
    setProfile(prev => prev ? { ...prev, photoURL: photoUrl } : null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await getUserProfile(user.uid);
    if (p) setProfile(p);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        needsUsernameSetup,
        saveUsername,
        loginUser,
        setPassword,
        updatePhoto,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
