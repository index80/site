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

const MAX_ROWS = 1000;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.INDEX80_SUBMISSION_SYNC_SECRET) {
    return jsonResponse({ ok: false, error: "Server misconfiguration: sync secret is not set up yet." }, 500);
  }

  const suppliedSecret = request.headers.get("X-Sync-Secret") || "";
  if (suppliedSecret !== env.INDEX80_SUBMISSION_SYNC_SECRET) {
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  if (!env.DB) {
    return jsonResponse({ ok: false, error: "Server misconfiguration: database is not bound yet." }, 500);
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, created_at, project_name, canonical_url, description, category,
              submitter_name, submitter_email, notes,
              social_url, discord_url, github_url, established
         FROM submissions
        ORDER BY created_at ASC
        LIMIT ?`
    )
      .bind(MAX_ROWS)
      .all();

    return jsonResponse({ ok: true, count: results.length, submissions: results });
  } catch {
    return jsonResponse({ ok: false, error: "Could not read submissions." }, 500);
  }
}

export async function onRequestPost() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
