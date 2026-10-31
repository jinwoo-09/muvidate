import Hls from "hls.js";

/**
 * Checks whether a given URL is an HLS playlist (.m3u8), ignoring query parameters or hashes.
 */
export function isHlsUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    // If it's a full URL, inspect the pathname
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//")) {
      const fullUrl = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
      const parsed = new URL(fullUrl);
      const cleanPath = parsed.pathname.toLowerCase().replace(/\/+$/, "");
      return cleanPath.endsWith(".m3u8");
    }
  } catch {}
  const cleanUrl = trimmed.split("?")[0].split("#")[0].toLowerCase().replace(/\/+$/, "");
  return cleanUrl.endsWith(".m3u8");
}

/**
 * Checks if HLS.js (MSE based) is supported in the current browser environment.
 */
export function isHlsJsSupported(): boolean {
  return typeof Hls !== "undefined" && Hls.isSupported();
}

/**
 * Checks if native HLS playback (e.g. Safari on iOS/macOS) is supported by the video element.
 */
export function isNativeHlsSupported(videoElement?: HTMLVideoElement | null): boolean {
  try {
    const video = videoElement || (typeof document !== "undefined" ? document.createElement("video") : null);
    if (!video || typeof video.canPlayType !== "function") return false;
    const appleCheck = video.canPlayType("application/vnd.apple.mpegurl");
    const mpegUrlCheck = video.canPlayType("application/x-mpegURL");
    return appleCheck === "probably" || appleCheck === "maybe" || mpegUrlCheck === "probably" || mpegUrlCheck === "maybe";
  } catch {
    return false;
  }
}

export interface HlsQualityOption {
  id: number; // -1 for Auto, or 0..N for specific level index
  label: string; // "Auto", "1080p", "720p", etc.
  height: number;
  bitrate: number;
}

/**
 * Formats HLS.js levels into clean, user-friendly resolution options (Auto, 1080p, 720p, 480p, 360p, etc.).
 */
export function formatQualityLevels(levels: any[]): HlsQualityOption[] {
  if (!levels || levels.length === 0) return [];

  // Track height counts to disambiguate identical resolutions with bitrate if necessary
  const heightCount = new Map<number, number>();
  levels.forEach((l) => {
    const h = l.height || 0;
    heightCount.set(h, (heightCount.get(h) || 0) + 1);
  });

  const options: HlsQualityOption[] = [
    {
      id: -1,
      label: "Auto",
      height: 0,
      bitrate: 0,
    },
  ];

  levels.forEach((level, index) => {
    const height = level.height || 0;
    let label = height ? `${height}p` : level.name || `Quality ${index + 1}`;

    // If multiple tracks have the same height, append bitrate (e.g. 1080p (4.5 Mbps))
    if (height && (heightCount.get(height) || 0) > 1 && level.bitrate) {
      const mbps = (level.bitrate / 1_000_000).toFixed(1);
      label = `${height}p (${mbps} Mbps)`;
    }

    options.push({
      id: index,
      label,
      height,
      bitrate: level.bitrate || 0,
    });
  });

  return options;
}

/**
 * Sanitizes media URLs for development console diagnostics so sensitive tokens or credentials are not exposed.
 */
export function sanitizeMediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url.split("?")[0].split("#")[0];
  }
}
