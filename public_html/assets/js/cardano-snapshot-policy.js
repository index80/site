/* INDEX:80 public Cardano snapshot display policy.
   Shared by the browser client and Node trust tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.INDEX80SnapshotPolicy = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const MAX_DISPLAY_AGE_MS = 2 * 60 * 60 * 1000;
  const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

  const timestampMs = (value) => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  function validateTimestamp(value, nowMs = Date.now()) {
    const observedMs = timestampMs(value);
    if (observedMs === null) return { ok: false, reason: 'timestamp' };

    const signedAgeMs = nowMs - observedMs;
    if (signedAgeMs < -FUTURE_TOLERANCE_MS) return { ok: false, reason: 'future' };
    if (signedAgeMs > MAX_DISPLAY_AGE_MS) return { ok: false, reason: 'expired' };

    return { ok: true, ageMs: Math.max(0, signedAgeMs) };
  }

  function validateObservation(record, nowMs = Date.now()) {
    if (!record || typeof record !== 'object') return { ok: false, reason: 'missing-observation' };
    const verdict = validateTimestamp(record.observed_at || record.last_success_at, nowMs);
    return verdict.ok ? { ...verdict, stale: record.stale === true } : verdict;
  }

  function validateSnapshot(snapshot, nowMs = Date.now()) {
    if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'missing' };
    if (!snapshot.market || typeof snapshot.market !== 'object') return { ok: false, reason: 'market-shape' };
    if (!snapshot.network || typeof snapshot.network !== 'object') return { ok: false, reason: 'network-shape' };

    return validateTimestamp(snapshot.generated_at, nowMs);
  }

  return {
    MAX_DISPLAY_AGE_MS,
    FUTURE_TOLERANCE_MS,
    timestampMs,
    validateTimestamp,
    validateObservation,
    validateSnapshot,
  };
}));
