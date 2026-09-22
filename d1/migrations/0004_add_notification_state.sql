-- INDEX:80 submissions: notification state (v4, additive only)
--
-- Records the outcome of the best-effort notification email that
-- functions/api/submit.js sends after a submission is stored. These are
-- operational columns only — the original submitted fields stay
-- immutable, and nothing here is renamed, dropped or backfilled.
--
--   notification_sent_at   ISO timestamp of the successful send, else NULL
--   notification_attempts  number of send attempts (existing rows: 0)
--   notification_error     last failure reason (no secrets), NULL on success
--
-- Safe to apply before or after deploying the matching code: the insert in
-- submit.js does not reference these columns, and the notification UPDATE
-- failing (columns absent) is logged without failing the submission.

ALTER TABLE submissions ADD COLUMN notification_sent_at TEXT;
ALTER TABLE submissions ADD COLUMN notification_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN notification_error TEXT;
