// Cloudflare Pages Function: POST /api/submit
// Handles the INDEX:80 project submission form.
// On successful validation + Turnstile check, writes the submission to the
// D1 `submissions` table for editorial intake — see d1/README.md.
// After the D1 insert succeeds, sends one notification email (Cloudflare
// Email Sending REST API) to the editorial inbox. The email is
// best-effort: its outcome is recorded on the D1 row (notification_*
// columns, migration 0004) but can never turn a stored submission into a
// failed request.
// Requires bindings on the Pages project:
//   - D1 database binding named `DB` (database: index80-submissions)
//   - Environment variable/secret `TURNSTILE_SECRET_KEY`
//   - Secret `EMAIL_SENDING_API_TOKEN` (Cloudflare API token, Email Sending: Edit)
//   - Variable `EMAIL_SENDING_ACCOUNT_ID` (Cloudflare account ID, not a secret)
//   - Variable `SUBMISSION_NOTIFY_TO` (editorial inbox address, not a secret)

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

// The recipient comes only from deployment configuration, never from
// request input, so this endpoint cannot be turned into a relay to
// arbitrary addresses (and stays within free verified-destination sending).
const NOTIFY_FROM = "submissions@index80.com";
const NOTIFY_TIMEOUT_MS = 10000;
const NOTIFY_ERROR_MAX = 500;
const PRODUCTION_HOST = "index80.com";

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

// Must match the `action` the /submit/ page passes to turnstile.render()
// (assets/js/submit.js). A token minted for another action, or for a page
// on another hostname, is refused even though Siteverify calls it valid.
export const TURNSTILE_ACTION = "submit-project";

// The widget and this Function are same-origin, so the hostname the token
// was solved on must be the hostname this request arrived on (index80.com,
// www.index80.com or a Pages preview host — each only ever accepts its own).
export async function verifyTurnstile(token, secret, remoteIp, expectedHostname) {
  if (!token || typeof token !== "string") return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp || "" }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true &&
      data.action === TURNSTILE_ACTION &&
      typeof data.hostname === "string" &&
      data.hostname.toLowerCase() === String(expectedHostname || "").toLowerCase();
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Every field shown in the email, in display order. Values are exactly what
// was stored in D1; absent optional fields are shown as "(not provided)"
// rather than silently dropped.
function notificationFields(record) {
  return [
    ["D1 submission ID", record.id],
    ["Created at (UTC)", record.created_at],
    ["Received via", record.source_host],
    ["Project name", record.project_name],
    ["Primary / Canonical Link", record.canonical_url],
    ["Category (suggested)", record.category],
    ["Description", record.description],
    ["X / Social", record.social_url],
    ["Discord", record.discord_url],
    ["GitHub", record.github_url],
    ["Established / Founded", record.established],
    ["Submitter name", record.submitter_name],
    ["Submitter email", record.submitter_email],
    ["Notes", record.notes],
  ];
}

const UNREVIEWED_NOTICE =
  "UNREVIEWED PUBLIC INPUT. Everything below was typed by an anonymous member of the public " +
  "and has not been checked. It is not editorial fact and has not been added to SUBMISSIONS, " +
  "INBOX or PROJECTS. Do not open submitted links without checking them first.";

export function buildNotificationEmail(record, to) {
  const isProduction = record.source_host === PRODUCTION_HOST;
  // Header-safe: strip control characters (incl. CR/LF) from untrusted input.
  const safeName = record.project_name.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);
  const subject = `${isProduction ? "" : "[TEST " + record.source_host + "] "}` +
    `[INDEX:80] Unreviewed submission: ${safeName}`;

  const fields = notificationFields(record);
  const text = [
    UNREVIEWED_NOTICE,
    "",
    ...fields.map(([label, value]) => `${label}: ${value ? value : "(not provided)"}`),
    "",
    "Status in D1: pending. Review manually; nothing has been written to the Editorial Registry.",
  ].join("\n");

  const rows = fields.map(([label, value]) =>
    `<tr><th align="left" valign="top" style="padding:6px 12px 6px 0;white-space:nowrap;color:#555;font-weight:600">` +
    `${escapeHtml(label)}</th><td style="padding:6px 0;white-space:pre-wrap;word-break:break-word">` +
    (value ? escapeHtml(value) : `<span style="color:#999">(not provided)</span>`) +
    `</td></tr>`
  ).join("");

  // Submitted URLs are rendered as plain text, never as <a href>, so the
  // email does not present untrusted links as clickable.
  const html =
    `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#111">` +
    `<div style="border:2px solid #b45309;background:#fffbeb;padding:12px 14px;margin-bottom:16px">` +
    `<strong style="color:#b45309">UNREVIEWED PUBLIC INPUT</strong><br>${escapeHtml(UNREVIEWED_NOTICE.replace(/^UNREVIEWED PUBLIC INPUT\. /, ""))}</div>` +
    `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse">${rows}</table>` +
    `<p style="color:#555;margin-top:16px">Status in D1: pending. Review manually; nothing has been written to the Editorial Registry.</p>` +
    `</body></html>`;

  return { to, from: NOTIFY_FROM, subject, html, text };
}

function describeSendFailure(status, data) {
  const first = data && Array.isArray(data.errors) && data.errors[0];
  if (first) return `HTTP ${status} ${first.code ?? ""} ${first.message ?? ""}`.trim();
  const bounces = data && data.result && data.result.permanent_bounces;
  if (Array.isArray(bounces) && bounces.length) return `Permanent bounce: ${bounces.join(", ")}`;
  return `HTTP ${status}`;
}

async function sendNotificationEmail(env, email) {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.EMAIL_SENDING_ACCOUNT_ID)}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.EMAIL_SENDING_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(email),
        signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
      }
    );
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    const bounced = data && data.result && Array.isArray(data.result.permanent_bounces) && data.result.permanent_bounces.length > 0;
    if (res.ok && data && data.success === true && !bounced) return { ok: true };
    return { ok: false, error: describeSendFailure(res.status, data) };
  } catch (err) {
    return { ok: false, error: `Send request failed: ${err && err.name ? err.name : "Error"}` };
  }
}

// Never throws. Sends the notification, then records the outcome on the D1
// row. If migration 0004 is not applied yet the UPDATE fails and is only
// logged — the submission itself is already safely stored.
export async function notifySubmission(env, record) {
  let outcome;
  const to = typeof env.SUBMISSION_NOTIFY_TO === "string" ? env.SUBMISSION_NOTIFY_TO.trim() : "";
  try {
    if (!env.EMAIL_SENDING_API_TOKEN || !env.EMAIL_SENDING_ACCOUNT_ID || !to) {
      outcome = { ok: false, error: "Email sending not configured (EMAIL_SENDING_API_TOKEN / EMAIL_SENDING_ACCOUNT_ID / SUBMISSION_NOTIFY_TO missing)." };
    } else if (!EMAIL_RE.test(to)) {
      outcome = { ok: false, error: "Email sending misconfigured (SUBMISSION_NOTIFY_TO is not an email address)." };
    } else {
      outcome = await sendNotificationEmail(env, buildNotificationEmail(record, to));
    }
  } catch (err) {
    outcome = { ok: false, error: `Notification build failed: ${err && err.name ? err.name : "Error"}` };
  }
  if (!outcome.ok) console.error(`submission ${record.id}: notification failed: ${outcome.error}`);

  try {
    if (outcome.ok) {
      await env.DB.prepare(
        `UPDATE submissions
            SET notification_sent_at = ?, notification_attempts = COALESCE(notification_attempts, 0) + 1,
                notification_error = NULL
          WHERE id = ?`
      ).bind(new Date().toISOString(), record.id).run();
    } else {
      await env.DB.prepare(
        `UPDATE submissions
            SET notification_attempts = COALESCE(notification_attempts, 0) + 1, notification_error = ?
          WHERE id = ?`
      ).bind(outcome.error.slice(0, NOTIFY_ERROR_MAX), record.id).run();
    }
  } catch (err) {
    console.error(`submission ${record.id}: could not record notification state: ${err && err.message ? err.message : err}`);
  }
  return outcome;
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
  const verified = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp, new URL(request.url).hostname);
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

  // The submission is stored. From here on nothing may fail the request.
  const notification = notifySubmission(env, {
    id, created_at: createdAt, source_host: new URL(request.url).hostname,
    project_name: projectName, canonical_url: canonicalUrl, description, category,
    social_url: socialUrl, discord_url: discordUrl, github_url: githubUrl, established,
    submitter_name: submitterName, submitter_email: submitterEmail, notes,
  });
  if (typeof context.waitUntil === "function") {
    context.waitUntil(notification);
  } else {
    await notification;
  }

  return jsonResponse({
    ok: true,
    message: "Thanks — your submission has been received and will be reviewed by INDEX:80.",
  });
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
}
