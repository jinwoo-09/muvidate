import { upload } from '@vercel/blob/client';
import { auth } from './firebase';

/**
 * Determine a clean, valid file extension matching the recorded MIME type.
 * Accurately maps WebM, MP4, OGG, WAV, MP3, and AAC/M4A formats.
 */
export function getExtensionForVoiceMime(mimeType: string): string {
  const normalized = (mimeType || "").trim().toLowerCase();
  const base = normalized.split(";")[0].trim();

  if (base.includes("webm")) {
    return "webm";
  }
  if (base.includes("ogg")) {
    return "ogg";
  }
  if (base.includes("mp4") || base === "video/mp4" || base === "audio/mp4") {
    return "mp4";
  }
  if (base.includes("wav")) {
    return "wav";
  }
  if (base.includes("mpeg") || base.includes("mp3")) {
    return "mp3";
  }
  if (base.includes("aac") || base.includes("m4a")) {
    return "m4a";
  }
  return "webm";
}

/**
 * Validates that an audio blob is an allowed voice-note format before initiating upload.
 */
export function validateVoiceBlob(blob: Blob): string {
  const rawType = (blob.type || "").trim();
  const baseType = rawType.split(";")[0].trim().toLowerCase();

  // Allow standard audio MIME types and browser WebM / MP4 MediaRecorder outputs
  const isAllowed =
    baseType.startsWith("audio/") ||
    baseType === "video/webm" ||
    baseType === "video/mp4" ||
    baseType === "";

  if (!isAllowed) {
    throw new Error(
      `Invalid voice note format: "${blob.type}". Only voice/audio recordings are allowed.`
    );
  }

  // If MIME type is unspecified, default to audio/webm
  return rawType || "audio/webm";
}

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

  // Validate the audio blob format and resolve its MIME type
  const resolvedContentType = validateVoiceBlob(audioBlob);

  // Get fresh Firebase ID token to verify user identity on the serverless authorization endpoint
  const idToken = await currentUser.getIdToken(true);

  // Determine file extension matching the actual recording format
  const ext = getExtensionForVoiceMime(resolvedContentType);

  // Generate a distinct pathname under voice-notes/
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const pathname = `voice-notes/voice_${Date.now()}_${randomSuffix}.${ext}`;

  if (onProgress) {
    onProgress(0);
  }

  const blobResult = await upload(pathname, audioBlob, {
    access: "public",
    contentType: resolvedContentType,
    handleUploadUrl: "/api/upload",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    clientPayload: JSON.stringify({
      uid: currentUser.uid,
      mimeType: resolvedContentType,
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
