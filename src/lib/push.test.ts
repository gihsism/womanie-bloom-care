import { describe, it, expect } from 'vitest';
import { pushSupport, urlBase64ToUint8Array, type PushEnv } from './push';

const env = (o: Partial<PushEnv> = {}): PushEnv => ({
  isNative: false, isIOS: false, standalone: false, hasPushApi: true, permission: 'default', ...o,
});

describe('pushSupport', () => {
  it('desktop/Android browser with Push API can opt in', () => {
    expect(pushSupport(env())).toBe('ok');
  });
  it('iPhone in a Safari tab must install to the Home Screen first', () => {
    expect(pushSupport(env({ isIOS: true }))).toBe('ios-install');
    expect(pushSupport(env({ isIOS: true, hasPushApi: false }))).toBe('ios-install');
  });
  it('installed iPhone app (16.4+) can opt in; older iOS without Push API gets the install hint', () => {
    expect(pushSupport(env({ isIOS: true, standalone: true }))).toBe('ok');
    expect(pushSupport(env({ isIOS: true, standalone: true, hasPushApi: false }))).toBe('ios-install');
  });
  it('native shell, unsupported browser and blocked permission', () => {
    expect(pushSupport(env({ isNative: true }))).toBe('native-app');
    expect(pushSupport(env({ hasPushApi: false }))).toBe('unsupported');
    expect(pushSupport(env({ permission: 'denied' }))).toBe('denied');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
  });
});
