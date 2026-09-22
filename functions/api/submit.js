// Cloudflare Pages Function: POST /api/submit
// Handles the INDEX:80 project submission form.
// On successful validation + Turnstile check, writes the submission to the
// D1 `submissions` table for editorial intake — see d1/README.md.
// Requires bindings on the Pages project:
//   - D1 database binding named `DB` (database: index80-submissions)
//   - Environment variable/secret `TURNSTILE_SECRET_KEY`

const REQUIRED_FIELDS = ["name", "url", "description", "category"];

const ALLOWED_CATEGORIES = new Set([
  "wallet", "dex", "defi", "lending", "derivatives", "nft",
  "infrastructure", "explorer", "analytics", "developer-tool",
  "governance", "education", "ai", "token-project", "utility", "other",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same precision rule as the PROJECTS "Established" column: YYYY, YYYY-MM
// or YYYY-MM-DD, with a plausible month/day range.
const ESTABLISHED_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Trims an optional string field to a max length, or returns "" when absent.
function optionalString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function verifyTurnstile(token, secret, remoteIp) {
  if (!token || typeof token !== "string") return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp || "" }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request body." }, 400);
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof body[field] !== "string" || body[field].trim() === "") {
      return jsonResponse({ ok: false, error: `Missing required field: ${field}.` }, 400);
    }
  }

  const projectName = body.name.trim().slice(0, 200);
  const canonicalUrl = body.url.trim().slice(0, 500);
  const description = body.description.trim().slice(0, 2000);
  const category = body.category.trim();
  const submitterEmail = optionalString(body.submitter_email, 320);
  const notes = optionalString(body.notes, 2000);
  const submitterName = optionalString(body.submitter_name, 200);
  const socialUrl = optionalString(body.social_url, 500);
  const discordUrl = optionalString(body.discord_url, 500);
  const githubUrl = optionalString(body.github_url, 500);
  const established = optionalString(body.established, 10);

  if (!isValidHttpUrl(canonicalUrl)) {
    return jsonResponse({ ok: false, error: "Primary / Canonical Link must be a valid http(s) URL." }, 400);
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return jsonResponse({ ok: false, error: "Unrecognised category." }, 400);
  }

  if (submitterEmail && !EMAIL_RE.test(submitterEmail)) {
    return jsonResponse({ ok: false, error: "Submitter email looks invalid." }, 400);
  }

  if (socialUrl && !isValidHttpUrl(socialUrl)) {
    return jsonResponse({ ok: false, error: "X / Social must be a valid http(s) URL." }, 400);
  }

  if (discordUrl && !isValidHttpUrl(discordUrl)) {
    return jsonResponse({ ok: false, error: "Discord must be a valid http(s) URL." }, 400);
  }

  if (githubUrl && !isValidHttpUrl(githubUrl)) {
    return jsonResponse({ ok: false, error: "GitHub must be a valid http(s) URL." }, 400);
  }

  if (established && !ESTABLISHED_RE.test(established)) {
    return jsonResponse({ ok: false, error: "Established / Founded must be YYYY, YYYY-MM or YYYY-MM-DD." }, 400);
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    return jsonResponse({ ok: false, error: "Server misconfiguration: Turnstile is not set up yet." }, 500);
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "";
  const verified = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
  if (!verified) {
    return jsonResponse({ ok: false, error: "Bot check failed. Please try again." }, 403);
  }

  if (!env.DB) {
    return jsonResponse({ ok: false, error: "Server misconfiguration: database is not bound yet." }, 500);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO submissions
         (id, project_name, canonical_url, description, category, submitter_email, notes,
          submitter_name, social_url, discord_url, github_url, established, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
      .bind(
        id, projectName, canonicalUrl, description, category, submitterEmail || null, notes || null,
        submitterName || null, socialUrl || null, discordUrl || null, githubUrl || null, established || null,
        createdAt
      )
      .run();
  } catch {
    return jsonResponse({ ok: false, error: "Could not save your submission. Please try again later." }, 500);
  }

  return jsonResponse({
    ok: true,
    message: "Thanks — your submission has been received and will be reviewed by INDEX:80.",
  });
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
