/**
 * Stale-While-Revalidate briefing cache.
 *
 * Lives at module scope → survives client-side navigation (tab switches,
 * route changes) but is cleared on full page reload.
 *
 * Usage:
 *   import { briefingCache } from '@/lib/briefingCache';
 *
 *   if (!briefingCache.isEmpty())        → show data instantly
 *   if (briefingCache.isStale())         → also kick off a background refresh
 *   briefingCache.set(data)              → store after a successful fetch
 *   briefingCache.clear()                → force a full re-fetch (Refresh button)
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const briefingCache = {
  /** Full briefing response from /api/briefing, or null. */
  data: null,

  /** Timestamp (Date.now()) of the last successful fetch, or null. */
  fetchedAt: null,

  /** True once data has been stored at least once this session. */
  get fetched() {
    return this.data !== null;
  },

  /** True if no data has been stored yet. */
  isEmpty() {
    return this.data === null;
  },

  /**
   * True if the cached data is older than CACHE_TTL_MS (default 5 min).
   * Also returns true if there is no cached data at all.
   */
  isStale(maxAgeMs = CACHE_TTL_MS) {
    if (!this.fetchedAt) return true;
    return Date.now() - this.fetchedAt > maxAgeMs;
  },

  /** Store a successful fetch result and record the timestamp. */
  set(data) {
    this.data     = data;
    this.fetchedAt = Date.now();
  },

  /** Force the next page visit to re-fetch from scratch. */
  clear() {
    this.data      = null;
    this.fetchedAt = null;
  },
};
