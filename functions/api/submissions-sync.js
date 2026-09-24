// Cloudflare Pages Function: GET /api/submissions-sync
// Protected, read-only intake endpoint for the Editorial Registry Apps
// Script (apps-script/editorial-registry/Submissions.gs) to pull D1
// submissions into the SUBMISSIONS/INBOX review workspace. Not linked
// from the public site; returns nothing without the shared secret.
// Returns only the raw submitted fields SUBMISSIONS/INBOX actually map —
// no D1 review/promotion metadata (status, reviewed_at, canonical_slug,
// canonical_category, canonical_public_family, promoted_at,
// promoted_sheet_row). Every response is Cache-Control: private, no-store.
// Requires bindings on the Pages project:
//   - D1 database binding named `DB` (same database as /api/submit)
//   - Environment variable/secret `INDEX80_SUBMISSION_SYNC_SECRET`
//
// Pagination (keyset, oldest first, ordered by created_at then id):
//   ?since=<ISO timestamp>  only rows created strictly after this instant
//   ?cursor=<next_cursor>   continue after the last row of the previous page
// Both are optional and combine. Every response carries `has_more` and
// `next_cursor` (null on the last page), so a caller can always reach the
// newest rows however many exist. A caller that ignores them gets exactly
// the previous behaviour: the oldest MAX_ROWS rows.

const MAX_ROWS = 1000;
const MAX_PARAM_LENGTH = 200;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

// Constant-time secret check: both values are hashed to fixed-length
// digests first, so neither the comparison time nor an early exit reveals
// how much of the supplied secret (or its length) was correct.
export async function secretsMatch(supplied, expected) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(supplied))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(expected))),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeCursor(row) {
  return base64UrlEncode(JSON.stringify([row.created_at, row.id]));
}

// Returns { createdAt, id } or null when the cursor is not one we issued.
export function decodeCursor(value) {
  if (typeof value !== "string" || !value || value.length > MAX_PARAM_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(value));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed;
    if (typeof createdAt !== "string" || typeof id !== "string" || !createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// Normalises to the same toISOString() form submit.js stores, so string
// comparison in SQL matches chronological order. Returns null if invalid.
export function normaliseSince(value) {
  if (typeof value !== "string" || value.length > MAX_PARAM_LENGTH || !ISO_TIMESTAMP_RE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.INDEX80_SUBMISSION_SYNC_SECRET) {
    return jsonResponse({ ok: false, error: "Server misconfiguration: sync secret is not set up yet." }, 500);
  }

  const suppliedSecret = request.headers.get("X-Sync-Secret") || "";
  if (!(await secretsMatch(suppliedSecret, env.INDEX80_SUBMISSION_SYNC_SECRET))) {
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  if (!env.DB) {
    return jsonResponse({ ok: false, error: "Server misconfiguration: database is not bound yet." }, 500);
  }

  const params = new URL(request.url).searchParams;
  const conditions = [];
  const bindings = [];

  const sinceParam = params.get("since");
  if (sinceParam !== null) {
    const since = normaliseSince(sinceParam);
    if (!since) return jsonResponse({ ok: false, error: "Invalid since: expected an ISO 8601 timestamp." }, 400);
    conditions.push("created_at > ?");
    bindings.push(since);
  }

  const cursorParam = params.get("cursor");
  if (cursorParam !== null) {
    const cursor = decodeCursor(cursorParam);
    if (!cursor) return jsonResponse({ ok: false, error: "Invalid cursor." }, 400);
    conditions.push("(created_at > ? OR (created_at = ? AND id > ?))");
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    // One extra row tells us whether another page exists.
    const { results } = await env.DB.prepare(
      `SELECT id, created_at, project_name, canonical_url, description, category,
              submitter_name, submitter_email, notes,
              social_url, discord_url, github_url, established
         FROM submissions
        ${where}
        ORDER BY created_at ASC, id ASC
        LIMIT ?`
    )
      .bind(...bindings, MAX_ROWS + 1)
      .all();

    const hasMore = results.length > MAX_ROWS;
    const submissions = hasMore ? results.slice(0, MAX_ROWS) : results;
    const nextCursor = hasMore ? encodeCursor(submissions[submissions.length - 1]) : null;

    return jsonResponse({ ok: true, count: submissions.length, submissions, has_more: hasMore, next_cursor: nextCursor });
  } catch {
    return jsonResponse({ ok: false, error: "Could not read submissions." }, 500);
  }
}

export async function onRequestPost() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
