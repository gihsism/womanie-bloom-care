// True inside the iOS/Android Capacitor shell (which loads womanie.info).
// Google blocks OAuth inside embedded web views, and offering Google
// sign-in in an iOS app would also require Sign in with Apple, so the
// native shell offers email + password only.
//
// Same check @capacitor/core's Capacitor.isNativePlatform() makes (the
// native shell injects one of these bridges before the page loads), done
// here directly so the first page load doesn't download all of
// @capacitor/core (~24 KB) just to answer "are we in the app?".
type BridgeWindow = Window & {
  androidBridge?: unknown;
  webkit?: { messageHandlers?: { bridge?: unknown } };
};

export const isNativeApp = (): boolean => {
  if (typeof window === "undefined") return false;
  const w = window as BridgeWindow;
  return Boolean(w.androidBridge || w.webkit?.messageHandlers?.bridge);
};
