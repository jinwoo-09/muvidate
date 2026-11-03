/**
 * Client-side AnonDrop upload utilities for MuviDate.
 * Uploads profile pictures and recorded voice notes through the secure server-side endpoint /api/anondrop-upload.
 */

/**
 * Determine a clean, valid file extension matching the recorded voice MIME type.
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
 * Uploads a profile picture to AnonDrop via the secure server-side endpoint.
 * Returns the direct AnonDrop link (e.g. https://api2.anondrop.net/1566410106416136275/avatar.png)
 */
export async function uploadProfilePictureToAnonDrop(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("category", "avatar");

  const response = await fetch("/api/anondrop-upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.directUrl) {
    throw new Error(data.error || `Profile picture upload failed with status ${response.status}`);
  }

  return data.directUrl;
}

/**
 * Uploads a voice note to AnonDrop via the secure server-side endpoint with progress tracking.
 * Returns the direct AnonDrop link (e.g. https://api2.anondrop.net/1566410106416136275/voice_note.mp3)
 */
export async function uploadVoiceNoteToAnonDrop(
  audioBlob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  const ext = getExtensionForVoiceMime(audioBlob.type);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const fileName = `voice_${Date.now()}_${randomSuffix}.${ext}`;

  const formData = new FormData();
  formData.append("file", audioBlob, fileName);
  formData.append("category", "voice");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/anondrop-upload");

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.directUrl) {
          resolve(data.directUrl);
        } else {
          reject(new Error(data.error || `Voice note upload failed with status ${xhr.status}`));
        }
      } catch (err) {
        reject(new Error("Invalid response received from upload server."));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network connection error during voice note upload. Please try again."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Voice note upload timed out. Please try again."));
    };

    xhr.send(formData);
  });
}
