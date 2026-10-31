import { Capacitor } from '@capacitor/core';

// True inside the iOS/Android Capacitor shell (which loads womanie.info).
// Google blocks OAuth inside embedded web views, and offering Google
// sign-in in an iOS app would also require Sign in with Apple, so the
// native shell offers email + password only.
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
