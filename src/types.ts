export interface UserProfile {
  uid: string;
  username: string;
  usernameLowercase: string;
  photoURL: string;
  createdAt: any;
  updatedAt: any;
}

export interface Movie {
  id: string;
  Title: string;
  title?: string; // fallback if schema varies
  genre: string;
  year: number;
  description: string;
  poster: string;
  url: string;
  createdAt?: any;
}

export interface RoomPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  lastUpdated: number;
  updatedBy: string;
  updatedByUsername: string;
  audioTrackIndex?: number;
}

export interface RoomParticipant {
  uid: string;
  username: string;
  photoURL?: string;
  joinedAt: number;
  isOnline: boolean;
  hasOfflineFile?: boolean;
}

export interface ChatMessage {
  id: string;
  uid: string;
  username: string;
  photoURL?: string;
  type: 'text' | 'voice';
  text?: string;
  audioUrl?: string;
  createdAt: number;
}

export interface Room {
  roomCode: string;
  adminUid: string;
  adminUsername: string;
  movieSource: 'firestore' | 'direct' | 'offline';
  movieId?: string;
  movieTitle: string;
  moviePoster?: string;
  movieUrl: string;
  offlineFileName?: string;
  offlineDuration?: number;
  playbackState: RoomPlaybackState;
  controlsLocked: boolean;
  movieCompleted: boolean;
  createdAt: number;
  expiresAt: number;
  participants?: Record<string, RoomParticipant>;
  chat?: Record<string, ChatMessage>;
}
