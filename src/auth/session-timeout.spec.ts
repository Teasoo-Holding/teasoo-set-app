import {
  DEFAULT_SESSION_TIMEOUT,
  isSessionExpired,
  sessionExpiry,
  sessionStart,
} from './session-timeout';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const hoursAgo = (h: number) => Math.floor(NOW.getTime() / 1000) - h * 3600;

describe('sessionStart', () => {
  it('uses iat by default', () => {
    expect(sessionStart({ iat: 1000 })).toBe(1000);
  });

  it('prefers a configured auth-time claim over iat', () => {
    expect(sessionStart({ iat: 1000, auth_time: 500 }, 'auth_time')).toBe(500);
  });

  it('returns undefined when no start time is available', () => {
    expect(sessionStart({}, 'auth_time')).toBeUndefined();
  });
});

describe('session timeout (defaults 12h mobile / 8h desktop)', () => {
  it('has the PRD defaults', () => {
    expect(DEFAULT_SESSION_TIMEOUT).toEqual({ mobileMinutes: 720, desktopMinutes: 480 });
  });

  it('desktop expires after 8h', () => {
    expect(isSessionExpired(hoursAgo(7), 'desktop', DEFAULT_SESSION_TIMEOUT, NOW)).toBe(false);
    expect(isSessionExpired(hoursAgo(9), 'desktop', DEFAULT_SESSION_TIMEOUT, NOW)).toBe(true);
  });

  it('mobile expires after 12h', () => {
    // 9h is expired on desktop but still valid on mobile
    expect(isSessionExpired(hoursAgo(9), 'mobile', DEFAULT_SESSION_TIMEOUT, NOW)).toBe(false);
    expect(isSessionExpired(hoursAgo(13), 'mobile', DEFAULT_SESSION_TIMEOUT, NOW)).toBe(true);
  });

  it('computes the expiry instant', () => {
    const start = Math.floor(NOW.getTime() / 1000);
    expect(sessionExpiry(start, 'desktop', DEFAULT_SESSION_TIMEOUT).getTime()).toBe(
      (start + 480 * 60) * 1000,
    );
  });

  it('honours custom per-tenant minutes', () => {
    const policy = { mobileMinutes: 60, desktopMinutes: 30 };
    expect(isSessionExpired(hoursAgo(1), 'desktop', policy, NOW)).toBe(true);
    expect(isSessionExpired(hoursAgo(1), 'mobile', policy, NOW)).toBe(true);
  });
});
