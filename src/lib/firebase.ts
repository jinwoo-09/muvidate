import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  onSnapshot 
} from "firebase/firestore";
import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  update, 
  remove, 
  onValue, 
  off, 
  push, 
  runTransaction 
} from "firebase/database";
import { UserProfile, Movie, Room, ChatMessage } from "../types";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBj7T4k6CjVleM-bWqRyStCwADBgoBFaJE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "movie-date-1.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "movie-date-1",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "movie-date-1.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "253439063883",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:253439063883:web:e888d7782448f290961ace",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://movie-date-1-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase once
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const rtdb = getDatabase(app, firebaseConfig.databaseURL);

// --- Auth & User Profile Functions ---

export async function ensureAnonymousAuth(): Promise<User> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const docRef = doc(firestore, "users", uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return null;
  }
}

export async function isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  const q = query(
    collection(firestore, "users"),
    where("usernameLowercase", "==", normalized)
  );
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (excludeUid) {
    const isOnlyMe = snap.docs.every(d => d.id === excludeUid);
    return !isOnlyMe;
  }
  return true;
}

export async function createUserProfile(uid: string, username: string): Promise<UserProfile> {
  const trimmed = username.trim();
  const normalized = trimmed.toLowerCase();

  const taken = await isUsernameTaken(trimmed, uid);
  if (taken) {
    throw new Error(`Username "${trimmed}" is already taken. Please choose another.`);
  }

  const profileData: UserProfile = {
    uid,
    username: trimmed,
    usernameLowercase: normalized,
    photoURL: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = doc(firestore, "users", uid);
  await setDoc(docRef, profileData);
  return profileData;
}

export async function updateUserProfilePhoto(uid: string, photoURL: string): Promise<void> {
  const docRef = doc(firestore, "users", uid);
  await updateDoc(docRef, {
    photoURL,
    updatedAt: new Date().toISOString()
  });
}

// --- Daily Room Limit (4 rooms / day) ---

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function checkAndIncrementDailyRoomLimit(uid: string): Promise<{ allowed: boolean; currentCount: number }> {
  const dateKey = getTodayDateKey();
  const limitRef = ref(rtdb, `dailyRoomLimits/${uid}/${dateKey}`);

  const snap = await get(limitRef);
  const currentCount = snap.exists() ? (snap.val().count || 0) : 0;

  if (currentCount >= 4) {
    return { allowed: false, currentCount };
  }

  await set(limitRef, {
    count: currentCount + 1,
    lastCreated: Date.now()
  });

  return { allowed: true, currentCount: currentCount + 1 };
}

export async function getDailyRoomCount(uid: string): Promise<number> {
  const dateKey = getTodayDateKey();
  const limitRef = ref(rtdb, `dailyRoomLimits/${uid}/${dateKey}`);
  const snap = await get(limitRef);
  return snap.exists() ? (snap.val().count || 0) : 0;
}

// --- 4-Digit Room Code Generator ---

export async function generateUniqueRoomCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    attempts++;
    // Generate 4-digit number between 1000 and 9999
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const roomRef = ref(rtdb, `rooms/${code}`);
    const snap = await get(roomRef);

    if (!snap.exists()) {
      return code;
    }

    const roomData = snap.val();
    // Check if existing room has expired (older than 24 hours)
    if (roomData.expiresAt && Date.now() > roomData.expiresAt) {
      // Clean up stale expired room
      await remove(roomRef);
      return code;
    }
  }

  throw new Error("Unable to generate unique room code. Please try again.");
}

// --- Movie Collection Management ---

export function subscribeToMovies(callback: (movies: Movie[]) => void, onError?: (err: any) => void) {
  // Collection is named "movie" based on user Firestore
  const collRef = collection(firestore, "movie");
  return onSnapshot(collRef, (snap) => {
    const list: Movie[] = [];
    snap.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        Title: data.Title || data.title || "Untitled Movie",
        title: data.Title || data.title || "Untitled Movie",
        genre: data.genre || "Uncategorized",
        year: Number(data.year) || new Date().getFullYear(),
        description: data.description || "",
        poster: data.poster || "",
        url: data.url || "",
        createdAt: data.createdAt
      });
    });
    callback(list);
  }, (err) => {
    console.error("Error subscribing to movies:", err);
    if (onError) onError(err);
  });
}

export async function addMovieToFirestore(movieData: {
  Title: string;
  genre: string;
  year: number;
  description: string;
  poster: string;
  url: string;
}): Promise<string> {
  const collRef = collection(firestore, "movie");
  const docRef = await addDoc(collRef, {
    Title: movieData.Title.trim(),
    genre: movieData.genre.trim(),
    year: Number(movieData.year),
    description: movieData.description.trim(),
    poster: movieData.poster.trim(),
    url: movieData.url.trim(),
    createdAt: serverTimestamp()
  });
  return docRef.id;
}
