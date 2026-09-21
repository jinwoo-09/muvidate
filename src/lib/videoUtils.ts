/**
 * Video utility functions for MuviDate Offline Video handling.
 */

/**
 * Reads the actual duration (in seconds) of a local File object using an offscreen HTML5 video element.
 * Automatically cleans up the temporary object URL.
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.muted = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    let timeoutId: number | null = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out reading video duration. Android Chrome cannot decode this video's codec."));
    }, 10000);

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (isNaN(duration) || !isFinite(duration) || duration <= 0) {
        reject(new Error("Android Chrome cannot decode this video's codec. Please select a video encoded with a codec supported by your device."));
      } else {
        resolve(duration);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Android Chrome cannot decode this video's codec. Please select a video encoded with a codec supported by your device."));
    };
  });
}

/**
 * Format duration in seconds into hh:mm:ss or mm:ss
 */
export function formatVideoTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
