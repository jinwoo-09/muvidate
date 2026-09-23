import { registerPlugin, Capacitor, PluginListenerHandle } from "@capacitor/core";

export interface AndroidFullScreenPlugin {
  enterVideoFullscreen(): Promise<void>;
  exitVideoFullscreen(): Promise<void>;
  isNative(): Promise<{ isNative: boolean }>;
  openInstagram(options?: { username?: string }): Promise<void>;
}

export interface OfflineNativeVideoResult {
  uri: string;
  name: string;
  size: number;
  duration: number;
}

export interface AndroidNativeMediaPlugin {
  pickOfflineVideo(): Promise<OfflineNativeVideoResult>;
  getVideoDuration(options: { uri: string }): Promise<{ duration: number }>;
  setupPlayer(options: { uri: string; position?: number; autoPlay?: boolean }): Promise<{ success: boolean }>;
  updatePlayerBounds(options: {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    width: number;
    height: number;
    borderRadius?: number;
    visible?: boolean;
    isFullscreen?: boolean;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(options: { position: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setDisplayMode(options: { mode: "fit" | "zoom" | "stretch" }): Promise<void>;
  getCurrentPosition(): Promise<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    isBuffering: boolean;
    isReady: boolean;
    error?: string;
  }>;
  release(): Promise<void>;
  addListener(
    eventName: "nativeVideoEnded" | "nativeVideoError" | "nativePlayerStateChange",
    listenerFunc: (data: any) => void
  ): Promise<PluginListenerHandle>;
}

export const AndroidFullScreen = registerPlugin<AndroidFullScreenPlugin>("AndroidFullScreen");
export const AndroidNativeMedia = registerPlugin<AndroidNativeMediaPlugin>("AndroidNativeMedia");

export const isAndroidNative = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
};

let isNativeFullscreenActive = false;

/**
 * Enter Android landscape immersive fullscreen.
 * Uses device orientation sensor to support both landscape orientations dynamically.
 * Hides status bar and navigation bar.
 * Idempotent - avoids repeated calls or UI disruptions.
 */
export const enterNativeFullscreen = async (): Promise<void> => {
  if (!isAndroidNative()) return;
  if (isNativeFullscreenActive) return;

  try {
    isNativeFullscreenActive = true;
    await AndroidFullScreen.enterVideoFullscreen();
  } catch (err) {
    console.warn("enterNativeFullscreen failed:", err);
  }
};

/**
 * Exit Android landscape fullscreen and restore portrait orientation and system bars.
 * Idempotent - avoids unnecessary calls.
 */
export const exitNativeFullscreen = async (): Promise<void> => {
  if (!isAndroidNative()) return;
  if (!isNativeFullscreenActive) return;

  try {
    isNativeFullscreenActive = false;
    await AndroidFullScreen.exitVideoFullscreen();
  } catch (err) {
    console.warn("exitNativeFullscreen failed:", err);
  }
};

/**
 * Open developer Instagram profile outside the WebView.
 * Tries native Instagram application first; falls back to system browser.
 */
export const openDeveloperInstagram = async (username: string = "ashuuxoo"): Promise<void> => {
  if (isAndroidNative()) {
    try {
      await AndroidFullScreen.openInstagram({ username });
      return;
    } catch (err) {
      console.warn("openInstagram native bridge notice:", err);
    }
  }
  // Standard fallback
  window.open(`https://www.instagram.com/${username}`, "_blank", "noopener,noreferrer");
};

/**
 * Pick an offline video file on Android using native Storage Access Framework (SAF).
 * Directly decodes duration & metadata without WebView HTML5 video limits.
 */
export const pickOfflineNativeVideo = async (): Promise<OfflineNativeVideoResult> => {
  return await AndroidNativeMedia.pickOfflineVideo();
};
