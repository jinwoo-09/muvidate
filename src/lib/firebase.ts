import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  updatePassword,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  deleteField,
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

// Explicitly ensure browser local persistence so sessions survive page refreshes and tabs
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("Firebase Auth browserLocalPersistence setup notice:", err);
  });
}

export const firestore = getFirestore(app);
export const rtdb = getDatabase(app, firebaseConfig.databaseURL);

// --- Auth & User Profile Functions ---

export function getCurrentAuthUser(): User | null {
  return auth.currentUser;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
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
  if (!snap.empty) {
    if (excludeUid) {
      const isOnlyMe = snap.docs.every(d => d.id === excludeUid);
      return !isOnlyMe;
    }
    return true;
  }

  // Also verify against legacy records where username was stored without usernameLowercase
  const legacyQuery = query(
    collection(firestore, "users"),
    where("username", "==", username.trim())
  );
  const legacySnap = await getDocs(legacyQuery);
  if (!legacySnap.empty) {
    if (excludeUid) {
      const isOnlyMe = legacySnap.docs.every(d => d.id === excludeUid);
      return !isOnlyMe;
    }
    return true;
  }

  return false;
}

// Helper to convert username to internal Firebase Auth email format
export function usernameToAuthEmail(username: string): string {
  const sanitized = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return `${sanitized}@muvidate.auth`;
}

// Safely migrate user documents from temporary anonymous UID to authenticated account UID
export async function migrateUserData(oldUid: string, targetUid: string): Promise<void> {
  if (!oldUid || !targetUid || oldUid === targetUid) return;

  try {
    const oldDocRef = doc(firestore, "users", oldUid);
    const targetDocRef = doc(firestore, "users", targetUid);

    const oldSnap = await getDoc(oldDocRef);
    if (!oldSnap.exists()) {
      return;
    }

    const oldData = oldSnap.data() as UserProfile;
    const targetSnap = await getDoc(targetDocRef);
    const targetData = targetSnap.exists() ? (targetSnap.data() as UserProfile) : null;

    // Merge photoURL or other non-empty fields without overriding newer valid target data
    const mergedData: Partial<UserProfile> = {
      updatedAt: new Date().toISOString()
    };

    if (oldData.photoURL && (!targetData || !targetData.photoURL)) {
      mergedData.photoURL = oldData.photoURL;
    }

    if (targetData) {
      await updateDoc(targetDocRef, mergedData);
    } else {
      await setDoc(targetDocRef, {
        ...oldData,
        uid: targetUid,
        ...mergedData
      });
    }

    // Verify target document exists and has valid username before deleting old temporary document
    const verifySnap = await getDoc(targetDocRef);
    if (verifySnap.exists() && verifySnap.data()?.username) {
      await deleteDoc(oldDocRef);
    }
  } catch (err) {
    // Non-fatal; old data is preserved safely to prevent data loss
    console.error("User data migration error (old data preserved):", err);
  }
}

export async function registerWithUsernameAndPassword(
  username: string, 
  password?: string
): Promise<UserProfile> {
  const trimmed = username.trim();
  const normalized = trimmed.toLowerCase();

  const taken = await isUsernameTaken(trimmed, auth.currentUser?.uid);
  if (taken) {
    throw new Error(`Username "${trimmed}" is already taken. Please choose another.`);
  }

  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  const email = usernameToAuthEmail(trimmed);

  let finalUid: string;

  if (auth.currentUser && auth.currentUser.isAnonymous) {
    try {
      const cred = await linkWithCredential(
        auth.currentUser, 
        EmailAuthProvider.credential(email, password)
      );
      finalUid = cred.user.uid;
    } catch (linkErr: any) {
      if (linkErr.code === "auth/credential-already-in-use" || linkErr.code === "auth/email-already-in-use") {
        throw new Error(`An account with username "${trimmed}" already exists.`);
      }
      // Fallback: create fresh email/password credential
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      finalUid = cred.user.uid;
    }
  } else if (!auth.currentUser) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    finalUid = cred.user.uid;
  } else {
    finalUid = auth.currentUser.uid;
  }

  const profileData: UserProfile = {
    uid: finalUid,
    username: trimmed,
    usernameLowercase: normalized,
    photoURL: auth.currentUser?.photoURL || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = doc(firestore, "users", finalUid);
  await setDoc(docRef, profileData, { merge: true });
  return profileData;
}

export async function loginWithUsernameAndPassword(
  username: string, 
  password: string
): Promise<UserProfile> {
  const previousUid = auth.currentUser?.uid;
  const trimmed = username.trim();
  const email = usernameToAuthEmail(trimmed);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const targetUid = cred.user.uid;

    // Migrate any data from previous temporary anonymous session if different
    if (previousUid && previousUid !== targetUid) {
      await migrateUserData(previousUid, targetUid);
    }

    let profile = await getUserProfile(targetUid);
    if (!profile) {
      // Look up by username in firestore if legacy account existed under different ID
      const normalized = trimmed.toLowerCase();
      const q = query(
        collection(firestore, "users"),
        where("usernameLowercase", "==", normalized)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existingDoc = snap.docs[0];
        const existingData = existingDoc.data() as UserProfile;
        profile = {
          ...existingData,
          uid: targetUid,
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(firestore, "users", targetUid), profile);
        if (existingDoc.id !== targetUid) {
          await deleteDoc(existingDoc.ref);
        }
      } else {
        profile = {
          uid: targetUid,
          username: trimmed,
          usernameLowercase: normalized,
          photoURL: auth.currentUser?.photoURL || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(firestore, "users", targetUid), profile);
      }
    }

    if (!profile) {
      profile = {
        uid: targetUid,
        username: trimmed,
        usernameLowercase: trimmed.toLowerCase(),
        photoURL: auth.currentUser?.photoURL || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(firestore, "users", targetUid), profile);
    }

    return profile;
  } catch (err: any) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
      throw new Error("Invalid username or password. Please verify and try again.");
    }
    throw new Error(err.message || "Failed to log in. Please try again.");
  }
}

export async function setAccountPassword(password: string): Promise<void> {
  const current = auth.currentUser;
  if (!current) throw new Error("No active user session.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");

  const profile = await getUserProfile(current.uid);
  if (!profile || !profile.username) {
    throw new Error("Cannot set password: User profile does not exist yet.");
  }

  const email = usernameToAuthEmail(profile.username);
  if (current.isAnonymous) {
    await linkWithCredential(current, EmailAuthProvider.credential(email, password));
  } else {
    await updatePassword(current, password);
  }
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
      const movieObj: any = {
        ...data,
        id: doc.id,
        Title: data.Title || data.title || "Untitled Movie",
        title: data.Title || data.title || "Untitled Movie",
        genre: data.genre || "Uncategorized",
        year: Number(data.year) || new Date().getFullYear(),
        description: data.description || "",
        poster: data.poster || "",
        cover: data.cover || undefined,
        subtitle: data.subtitle || undefined,
        trailer: data.trailer || undefined,
        url: data.url || "",
        createdAt: data.createdAt
      };
      list.push(movieObj);
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
  cover?: string;
  subtitle?: string;
  trailer?: string;
  url: string;
  seasonNumber?: number;
  [key: string]: any;
}): Promise<string> {
  const collRef = collection(firestore, "movie");
  const payload: any = {
    Title: movieData.Title.trim(),
    genre: movieData.genre.trim(),
    year: Number(movieData.year) || new Date().getFullYear(),
    description: movieData.description.trim(),
    poster: movieData.poster.trim(),
    createdAt: serverTimestamp()
  };

  const seasonNum =
    movieData.seasonNumber && movieData.seasonNumber > 0
      ? Math.floor(movieData.seasonNumber)
      : 1;
  const rawUrl = (movieData.url || "").trim();

  if (seasonNum === 1) {
    payload.url = rawUrl;
  } else {
    payload[`url${seasonNum}`] = rawUrl;
    // Keep standard url field present as provided default or empty
    if (movieData.defaultUrl && typeof movieData.defaultUrl === "string") {
      payload.url = movieData.defaultUrl.trim();
    }
  }

  // Also include any explicit url2, url3 passed in movieData if present and non-empty
  for (const key of Object.keys(movieData)) {
    if (/^url\d+$/i.test(key) && key.toLowerCase() !== "url1") {
      const val = movieData[key];
      if (typeof val === "string" && val.trim() !== "") {
        payload[key] = val.trim();
      }
    }
  }

  if (movieData.cover && movieData.cover.trim() !== "") {
    payload.cover = movieData.cover.trim();
  }

  if (movieData.subtitle && movieData.subtitle.trim() !== "") {
    payload.subtitle = movieData.subtitle.trim();
  }

  if (movieData.trailer && movieData.trailer.trim() !== "") {
    payload.trailer = movieData.trailer.trim();
  }

  // Prevent sending undefined or empty optional fields
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) {
      delete payload[k];
    }
  }

  const docRef = await addDoc(collRef, payload);
  return docRef.id;
}

export async function updateMovieInFirestore(
  movieId: string,
  movieData: {
    Title?: string;
    genre?: string;
    year?: number;
    description?: string;
    poster?: string;
    cover?: string | null;
    subtitle?: string | null;
    trailer?: string | null;
    url?: string;
    seasonNumber?: number;
    [key: string]: any;
  }
): Promise<void> {
  if (!movieId) throw new Error("Movie ID is required for update.");
  const docRef = doc(firestore, "movie", movieId);
  const payload: any = {
    updatedAt: serverTimestamp()
  };

  if (movieData.Title !== undefined) {
    payload.Title = movieData.Title.trim();
  }
  if (movieData.genre !== undefined) {
    payload.genre = movieData.genre.trim();
  }
  if (movieData.year !== undefined) {
    const y = Number(movieData.year);
    if (!isNaN(y) && y > 0) {
      payload.year = y;
    }
  }
  if (movieData.description !== undefined) {
    payload.description = movieData.description.trim();
  }
  if (movieData.poster !== undefined && movieData.poster.trim() !== "") {
    payload.poster = movieData.poster.trim();
  }

  // Cover URL
  if (movieData.cover !== undefined) {
    if (movieData.cover && movieData.cover.trim() !== "") {
      payload.cover = movieData.cover.trim();
    } else {
      payload.cover = deleteField();
    }
  }

  // Subtitle URL(s)
  if (movieData.subtitle !== undefined) {
    if (movieData.subtitle && movieData.subtitle.trim() !== "") {
      payload.subtitle = movieData.subtitle.trim();
    } else {
      payload.subtitle = deleteField();
    }
  }

  // Trailer URL
  if (movieData.trailer !== undefined) {
    if (movieData.trailer && movieData.trailer.trim() !== "") {
      payload.trailer = movieData.trailer.trim();
    } else {
      payload.trailer = deleteField();
    }
  }

  // Media URLs & Seasons
  if (movieData.url !== undefined) {
    const rawUrl = movieData.url.trim();
    const seasonNum =
      movieData.seasonNumber && movieData.seasonNumber > 0
        ? Math.floor(movieData.seasonNumber)
        : 1;

    if (seasonNum === 1) {
      payload.url = rawUrl;
    } else {
      payload[`url${seasonNum}`] = rawUrl;
    }
  }

  // Extra season URLs (url2, url3, etc.)
  for (const key of Object.keys(movieData)) {
    if (/^url\d+$/i.test(key) && key.toLowerCase() !== "url1") {
      const val = movieData[key];
      if (typeof val === "string") {
        if (val.trim() !== "") {
          payload[key] = val.trim();
        } else {
          payload[key] = deleteField();
        }
      }
    }
  }

  // Sanitize: ensure no undefined fields
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) {
      delete payload[k];
    }
  }

  await updateDoc(docRef, payload);
}
