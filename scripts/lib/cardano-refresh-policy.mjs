export function createSnapshotBase(previous = {}) {
  return {
    schema_version: '0.2',
    generated_at: previous.generated_at || null,
    refresh_interval_hours: 6,
    status: 'stale_snapshot',
    // Never carry old observations into a new refresh attempt. A failed source
    // stays missing; previous values are not silently re-dated as current.
    market: {},
    network: {},
    minswap: { assets: [] },
    sources: [],
  };
}

export function finaliseSnapshot(next, previous = {}, freshObservationCount = 0, refreshedAt = new Date().toISOString()) {
  if (freshObservationCount > 0) {
    next.generated_at = refreshedAt;
    next.status = 'public_snapshot';
  } else {
    next.generated_at = previous.generated_at || null;
    next.status = 'stale_snapshot';
  }
  return next;
}
