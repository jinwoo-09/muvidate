import { registerPlugin, Capacitor } from "@capacitor/core";

export interface AndroidFullScreenPlugin {
  enterVideoFullscreen(): Promise<void>;
  exitVideoFullscreen(): Promise<void>;
  isNative(): Promise<{ isNative: boolean }>;
}

export const AndroidFullScreen = registerPlugin<AndroidFullScreenPlugin>("AndroidFullScreen");

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
