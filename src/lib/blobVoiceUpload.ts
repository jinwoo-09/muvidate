import { upload } from '@vercel/blob/client';
import { auth } from './firebase';

/**
 * Upload voice note directly to Vercel Blob from the client browser.
 * Uses official @vercel/blob/client upload() API authorized by /api/upload.
 */
export async function uploadVoiceNoteToBlob(
  audioBlob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to send a voice note.");
  }

  // Get fresh Firebase ID token to verify user identity on the serverless authorization endpoint
  const idToken = await currentUser.getIdToken(true);

  // Determine file extension from audio MIME type
  let ext = "webm";
  if (audioBlob.type.includes("mp4")) {
    ext = "mp4";
  } else if (audioBlob.type.includes("ogg")) {
    ext = "ogg";
  } else if (audioBlob.type.includes("wav")) {
    ext = "wav";
  } else if (audioBlob.type.includes("mpeg") || audioBlob.type.includes("mp3")) {
    ext = "mp3";
  } else if (audioBlob.type.includes("aac") || audioBlob.type.includes("m4a")) {
    ext = "m4a";
  }

  // Generate a distinct pathname under voice-notes/
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const pathname = `voice-notes/voice_${Date.now()}_${randomSuffix}.${ext}`;

  if (onProgress) {
    onProgress(0);
  }

  const blobResult = await upload(pathname, audioBlob, {
    access: "public",
    handleUploadUrl: "/api/upload",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    clientPayload: JSON.stringify({
      uid: currentUser.uid,
      mimeType: audioBlob.type,
      size: audioBlob.size,
      timestamp: Date.now(),
    }),
    onUploadProgress: (progress) => {
      if (onProgress && typeof progress.percentage === "number") {
        onProgress(Math.min(99, Math.round(progress.percentage)));
      }
    },
  });

  if (onProgress) {
    onProgress(100);
  }

  if (!blobResult || !blobResult.url) {
    throw new Error("Upload failed: No public URL returned from Vercel Blob storage.");
  }

  return blobResult.url;
}
