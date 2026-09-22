/**
 * Series, Season, and Episode utility functions for MuviDate
 */

export interface SeriesEpisode {
  episodeNumber: number;
  label: string;
  url: string;
}

export interface SeriesSeason {
  seasonNumber: number;
  label: string;
  episodes: SeriesEpisode[];
}

export interface SeriesStructure {
  isSeries: boolean;
  seasons: SeriesSeason[];
  totalEpisodes: number;
}

/**
 * Splits comma-separated URLs into individual episode URLs.
 * - Splits only on commas
 * - Trims whitespace around every URL
 * - Ignores empty entries
 * - Preserves commas inside URL query parameters (e.g. ?tag=a,b) when followed by query content
 * - Supports filenames and full URLs (e.g. ep1.mp4, episode1.mp4, https://.../ep1.mp4)
 */
export function parseEpisodeUrls(rawUrls: string): string[] {
  if (!rawUrls || typeof rawUrls !== "string") return [];
  const trimmed = rawUrls.trim();
  if (!trimmed) return [];

  const result: string[] = [];
  let current = "";
  let inQuery = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (char === "?") {
      inQuery = true;
      current += char;
    } else if (char === "#" || char === " " || char === "\n") {
      inQuery = false;
      current += char;
    } else if (char === ",") {
      // Lookahead: does the next segment look like a new URL or episode filename?
      const remaining = trimmed.slice(i + 1).trim();
      const isNextUrl =
        remaining.startsWith("http://") ||
        remaining.startsWith("https://") ||
        remaining.startsWith("//") ||
        remaining.startsWith("/") ||
        remaining.includes(".mp4") ||
        remaining.includes(".mkv") ||
        remaining.includes(".webm") ||
        /^[a-zA-Z0-9_\-./]+/.test(remaining);

      if (!inQuery || isNextUrl) {
        if (current.trim()) {
          result.push(current.trim());
        }
        current = "";
        inQuery = false;
      } else {
        // Preserves comma inside query parameters
        current += char;
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result.filter((u) => u.length > 0);
}

/**
 * Extracts series, seasons, and episodes structure from a movie document,
 * series URLs record, or direct URL string.
 *
 * Rules:
 * - Season 1: `url` field
 * - Season 2: `url2` field
 * - Season 3: `url3` field
 * - Season N: `urlN` field
 * - Each season field can contain comma-separated episode URLs.
 * - If only 1 season with 1 episode: isSeries = false.
 * - If 1 season with multiple episodes OR multiple seasons: isSeries = true.
 */
export function extractSeriesStructure(
  source: any
): SeriesStructure {
  if (!source) {
    return { isSeries: false, seasons: [], totalEpisodes: 0 };
  }

  // If source is a plain string (e.g. direct URL with commas)
  if (typeof source === "string") {
    const episodes = parseEpisodeUrls(source);
    if (episodes.length > 1) {
      return {
        isSeries: true,
        seasons: [
          {
            seasonNumber: 1,
            label: "Season 1",
            episodes: episodes.map((epUrl, idx) => ({
              episodeNumber: idx + 1,
              label: `Episode ${idx + 1}`,
              url: epUrl
            }))
          }
        ],
        totalEpisodes: episodes.length
      };
    }
    return {
      isSeries: false,
      seasons: episodes.length === 1
        ? [
            {
              seasonNumber: 1,
              label: "Season 1",
              episodes: [{ episodeNumber: 1, label: "Episode 1", url: episodes[0] }]
            }
          ]
        : [],
      totalEpisodes: episodes.length
    };
  }

  // If source is an object (Movie doc, room.seriesUrls, or room with URLs)
  const seasonsMap = new Map<number, string>();

  // Check Season 1: "url"
  if (typeof source.url === "string" && source.url.trim()) {
    seasonsMap.set(1, source.url.trim());
  }

  // Check additional seasons: url2, url3, url4, ... up to dynamic keys
  for (const key of Object.keys(source)) {
    const match = /^url(\d+)$/i.exec(key);
    if (match) {
      const seasonNum = parseInt(match[1], 10);
      if (seasonNum > 0 && typeof source[key] === "string" && source[key].trim()) {
        seasonsMap.set(seasonNum, source[key].trim());
      }
    }
  }

  const seasons: SeriesSeason[] = [];
  let totalEpisodes = 0;

  // Sort season numbers in ascending order
  const sortedSeasonNums = Array.from(seasonsMap.keys()).sort((a, b) => a - b);

  for (const sNum of sortedSeasonNums) {
    const rawVal = seasonsMap.get(sNum) || "";
    const parsedEps = parseEpisodeUrls(rawVal);
    if (parsedEps.length > 0) {
      seasons.push({
        seasonNumber: sNum,
        label: `Season ${sNum}`,
        episodes: parsedEps.map((epUrl, idx) => ({
          episodeNumber: idx + 1,
          label: `Episode ${idx + 1}`,
          url: epUrl
        }))
      });
      totalEpisodes += parsedEps.length;
    }
  }

  const isSeries =
    seasons.length > 1 || (seasons.length === 1 && seasons[0].episodes.length > 1);

  return {
    isSeries,
    seasons,
    totalEpisodes
  };
}

/**
 * Retrieves the specific URL for a given season and episode number.
 * Falls back to the first available episode if the requested one is out of range.
 */
export function getEpisodeUrl(
  structure: SeriesStructure,
  seasonNumber: number,
  episodeNumber: number
): string | null {
  if (!structure.seasons || structure.seasons.length === 0) return null;

  const targetSeason =
    structure.seasons.find((s) => s.seasonNumber === seasonNumber) ||
    structure.seasons[0];

  if (!targetSeason || !targetSeason.episodes || targetSeason.episodes.length === 0) {
    return null;
  }

  const targetEpisode =
    targetSeason.episodes.find((ep) => ep.episodeNumber === episodeNumber) ||
    targetSeason.episodes[0];

  return targetEpisode ? targetEpisode.url : null;
}

/**
 * Parses comma-separated subtitle URLs into individual subtitle URLs.
 */
export function parseSubtitleUrls(rawSubtitle?: string): string[] {
  if (!rawSubtitle || typeof rawSubtitle !== "string") return [];
  return parseEpisodeUrls(rawSubtitle);
}

/**
 * Returns the subtitle URL corresponding to a specific episode number (1-indexed).
 * For single movies (or single subtitle URL), returns the single subtitle URL.
 * For multi-episode series with comma-separated URLs:
 * Episode 1 -> ep1.srt, Episode 2 -> ep2.srt, etc.
 */
export function getSubtitleForEpisode(
  rawSubtitle?: string,
  episodeNumber: number = 1
): string | null {
  if (!rawSubtitle || typeof rawSubtitle !== "string") return null;
  const list = parseSubtitleUrls(rawSubtitle);
  if (list.length === 0) return null;

  const idx = Math.max(0, episodeNumber - 1);
  if (idx < list.length) {
    return list[idx];
  }

  // If there are fewer subtitles than episodes, return the first one if only 1 exists, or null
  return list.length === 1 ? list[0] : null;
}

/**
 * Converts SubRip (.srt) or plaintext captions to standard WebVTT format.
 * If already valid WebVTT, returns as-is.
 */
export function convertSrtToVtt(content: string): string {
  if (!content || typeof content !== "string") return "WEBVTT\n\n";
  const trimmed = content.trim();
  if (trimmed.startsWith("WEBVTT")) {
    return trimmed + "\n";
  }

  // Normalize line endings
  let normalized = trimmed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Replace comma decimal separators in timestamps: 00:00:20,000 --> 00:00:20.000
  normalized = normalized.replace(
    /(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g,
    "$1.$2"
  );
  normalized = normalized.replace(
    /(\d{2}:\d{2}),(\d{1,3})/g,
    "00:$1.$2"
  );

  return `WEBVTT\n\n${normalized}\n`;
}
