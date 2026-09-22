// Tests the /api/submit notification email path (functions/api/submit.js)
// with mocked fetch (Turnstile + Email Sending) and a mocked D1 binding.
// Proves: D1 behaviour and the response contract are unchanged; the email
// carries every stored field, the D1 id and created_at, the unreviewed
// label and escaped HTML; and no email failure mode fails a stored
// submission. No network calls are made.

import assert from "node:assert/strict";
import { onRequestPost, buildNotificationEmail } from "../functions/api/submit.js";

const TOKEN = "test-token-DO-NOT-LEAK";
const ACCOUNT = "acct123";
const NOTIFY_TO = "review-inbox@example.com";

const fullBody = {
  name: "Evil <script>alert(1)</script> Project\r\nBcc: x@y.z",
  url: "https://example.org/?a=1&b=2",
  description: "A \"quoted\" description & more",
  category: "defi",
  submitter_email: "someone@example.org",
  submitter_name: "Some One",
  notes: "note text",
  social_url: "https://x.com/example",
  discord_url: "https://discord.gg/example",
  github_url: "https://github.com/example",
  established: "2021-05",
  turnstileToken: "tok",
};

function makeDb({ insertThrows = false, updateThrows = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              calls.push({ sql, args });
              if (insertThrows && /INSERT INTO submissions/.test(sql)) throw new Error("insert failed");
              if (updateThrows && /UPDATE submissions/.test(sql)) throw new Error("no such column: notification_attempts");
              return { success: true };
            },
          };
        },
      };
    },
  };
}

// emailMode: "ok" | "http500" | "throw" | "bounce"
function installFetch(emailMode) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("turnstile")) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    sent.push({ url: String(url), init, payload: JSON.parse(init.body) });
    if (emailMode === "throw") throw new TypeError("network down");
    if (emailMode === "http500") {
      return new Response(JSON.stringify({ success: false, errors: [{ code: 10002, message: "email.sending.error.internal_server" }] }), { status: 500 });
    }
    if (emailMode === "bounce") {
      return new Response(JSON.stringify({ success: true, errors: [], result: { delivered: [], permanent_bounces: [NOTIFY_TO], queued: [] } }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true, errors: [], result: { delivered: [NOTIFY_TO], permanent_bounces: [], queued: [] } }), { status: 200 });
  };
  return sent;
}

async function submit({ body = fullBody, env = {}, host = "index80.com", useWaitUntil = true } = {}) {
  const pending = [];
  const context = {
    request: new Request(`https://${host}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: { TURNSTILE_SECRET_KEY: "ts", EMAIL_SENDING_API_TOKEN: TOKEN, EMAIL_SENDING_ACCOUNT_ID: ACCOUNT, SUBMISSION_NOTIFY_TO: NOTIFY_TO, ...env },
  };
  if (useWaitUntil) context.waitUntil = (p) => pending.push(p);
  const res = await onRequestPost(context);
  await Promise.all(pending);
  return { res, json: await res.json() };
}

const SUCCESS = { ok: true, message: "Thanks — your submission has been received and will be reviewed by INDEX:80." };
let passed = 0;
async function test(name, fn) {
  const origError = console.error;
  console.error = () => {};
  try { await fn(); } finally { console.error = origError; }
  passed++;
  console.log(`ok - ${name}`);
}

await test("successful send: response unchanged, email complete, D1 marked sent", async () => {
  const DB = makeDb();
  const sent = installFetch("ok");
  const { res, json } = await submit({ env: { DB } });
  assert.equal(res.status, 200);
  assert.deepEqual(json, SUCCESS);

  const insert = DB.calls.find((c) => /INSERT INTO submissions/.test(c.sql));
  assert.ok(insert, "D1 insert happened");
  assert.ok(!/notification/.test(insert.sql), "insert statement does not reference notification columns");
  const [id] = insert.args;
  const createdAt = insert.args[insert.args.length - 1];

  assert.equal(sent.length, 1);
  const { url, init, payload } = sent[0];
  assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/email/sending/send`);
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(payload.to, NOTIFY_TO);
  assert.equal(payload.from, "submissions@index80.com");
  assert.ok(!/[\r\n]/.test(payload.subject), "subject has no CR/LF");
  assert.ok(payload.subject.startsWith("[INDEX:80] Unreviewed submission:"));

  for (const part of [payload.text, payload.html]) {
    assert.ok(part.includes("UNREVIEWED PUBLIC INPUT"));
    assert.ok(part.includes(id));
    assert.ok(part.includes(createdAt));
  }
  for (const v of ["someone@example.org", "Some One", "note text", "https://x.com/example",
    "https://discord.gg/example", "https://github.com/example", "2021-05", "defi", "https://example.org/?a=1&b=2"]) {
    assert.ok(payload.text.includes(v), `text contains ${v}`);
  }
  assert.ok(!payload.html.includes("<script>"), "HTML is escaped");
  assert.ok(payload.html.includes("&lt;script&gt;"));
  assert.ok(payload.html.includes("https://example.org/?a=1&amp;b=2"));
  assert.ok(!/<a\s/i.test(payload.html), "no clickable links in HTML");

  const update = DB.calls.find((c) => /UPDATE submissions/.test(c.sql));
  assert.ok(/notification_sent_at = \?/.test(update.sql));
  assert.equal(update.args[1], id);
});

await test("email API 500: submission still succeeds, error + attempt recorded", async () => {
  const DB = makeDb();
  installFetch("http500");
  const { res, json } = await submit({ env: { DB } });
  assert.equal(res.status, 200);
  assert.deepEqual(json, SUCCESS);
  const update = DB.calls.find((c) => /UPDATE submissions/.test(c.sql));
  assert.ok(!/notification_sent_at/.test(update.sql));
  assert.match(update.args[0], /HTTP 500 10002/);
  assert.ok(!update.args[0].includes(TOKEN), "error text never contains the token");
});

await test("email network error: submission still succeeds", async () => {
  const DB = makeDb();
  installFetch("throw");
  const { res, json } = await submit({ env: { DB } });
  assert.equal(res.status, 200);
  assert.deepEqual(json, SUCCESS);
  assert.match(DB.calls.find((c) => /UPDATE/.test(c.sql)).args[0], /Send request failed/);
});

await test("permanent bounce is recorded as a failure", async () => {
  const DB = makeDb();
  installFetch("bounce");
  const { res } = await submit({ env: { DB } });
  assert.equal(res.status, 200);
  assert.match(DB.calls.find((c) => /UPDATE/.test(c.sql)).args[0], /Permanent bounce/);
});

await test("email not configured: no send, submission succeeds, error recorded", async () => {
  const DB = makeDb();
  const sent = installFetch("ok");
  const { res } = await submit({ env: { DB, EMAIL_SENDING_API_TOKEN: undefined } });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
  assert.match(DB.calls.find((c) => /UPDATE/.test(c.sql)).args[0], /not configured/);
});

await test("recipient not configured: no send, submission succeeds", async () => {
  const DB = makeDb();
  const sent = installFetch("ok");
  const { res } = await submit({ env: { DB, SUBMISSION_NOTIFY_TO: undefined } });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
  assert.match(DB.calls.find((c) => /UPDATE/.test(c.sql)).args[0], /SUBMISSION_NOTIFY_TO missing/);
});

await test("recipient malformed: no send, submission succeeds", async () => {
  const DB = makeDb();
  const sent = installFetch("ok");
  const { res } = await submit({ env: { DB, SUBMISSION_NOTIFY_TO: "not-an-address" } });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
  assert.match(DB.calls.find((c) => /UPDATE/.test(c.sql)).args[0], /misconfigured/);
});

await test("migration 0004 not applied (UPDATE throws): submission still succeeds", async () => {
  const DB = makeDb({ updateThrows: true });
  installFetch("ok");
  const { res, json } = await submit({ env: { DB } });
  assert.equal(res.status, 200);
  assert.deepEqual(json, SUCCESS);
});

await test("no waitUntil available: still succeeds (awaited inline)", async () => {
  const DB = makeDb();
  const sent = installFetch("http500");
  const { res } = await submit({ env: { DB }, useWaitUntil: false });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
});

await test("D1 insert failure: unchanged 500, no email sent", async () => {
  const DB = makeDb({ insertThrows: true });
  const sent = installFetch("ok");
  const { res, json } = await submit({ env: { DB } });
  assert.equal(res.status, 500);
  assert.equal(json.error, "Could not save your submission. Please try again later.");
  assert.equal(sent.length, 0);
});

await test("validation failure: unchanged 400, no D1 write, no email", async () => {
  const DB = makeDb();
  const sent = installFetch("ok");
  const { res } = await submit({ env: { DB }, body: { ...fullBody, category: "nope" } });
  assert.equal(res.status, 400);
  assert.equal(DB.calls.length, 0);
  assert.equal(sent.length, 0);
});

await test("non-production host is flagged as TEST in the subject", async () => {
  const email = buildNotificationEmail({
    id: "x", created_at: "2026-01-01T00:00:00.000Z", source_host: "dev.index80.pages.dev",
    project_name: "P", canonical_url: "https://p.example", description: "d", category: "other",
  }, NOTIFY_TO);
  assert.equal(email.to, NOTIFY_TO);
  assert.ok(email.subject.startsWith("[TEST dev.index80.pages.dev] [INDEX:80]"));
  assert.ok(email.text.includes("Submitter email: (not provided)"));
});

console.log(`\n${passed} submission-notification tests passed`);
