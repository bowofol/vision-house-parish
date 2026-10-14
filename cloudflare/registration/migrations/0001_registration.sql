-- Additive migration. Never deletes or changes existing Google/D1 registrations.
CREATE TABLE IF NOT EXISTS vh_registrations (
  submission_id TEXT PRIMARY KEY NOT NULL CHECK(length(submission_id) = 36),
  application_id TEXT NOT NULL UNIQUE CHECK(length(application_id) = 36),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  full_name TEXT NOT NULL CHECK(length(full_name) BETWEEN 2 AND 100),
  email TEXT NOT NULL DEFAULT '' CHECK(length(email) <= 254),
  phone TEXT NOT NULL CHECK(length(phone) BETWEEN 7 AND 32),
  selected_class TEXT NOT NULL CHECK(selected_class IN ('Workers-in-Training', 'Believers'' Class', 'Baptismal Class')),
  preferred_contact TEXT NOT NULL CHECK(preferred_contact IN ('Phone', 'WhatsApp', 'Email')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_at TEXT,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  abuse_key TEXT NOT NULL CHECK(length(abuse_key) = 64),
  CHECK(preferred_contact <> 'Email' OR length(email) > 0)
);

CREATE INDEX IF NOT EXISTS vh_registrations_status_created ON vh_registrations(status, created_at);

-- Only pseudonymous IP digests, never raw IP addresses. Fixed 15-minute windows.
CREATE TABLE IF NOT EXISTS vh_registration_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count >= 0)
);
CREATE INDEX IF NOT EXISTS vh_registration_limits_expiry ON vh_registration_limits(window_start);

-- Counters commit or roll back with the registration INSERT. Replays never
-- INSERT and therefore cannot consume another new-submission allowance.
CREATE TRIGGER IF NOT EXISTS vh_registration_count_insert
AFTER INSERT ON vh_registrations
BEGIN
  INSERT INTO vh_registration_limits(bucket, window_start, count)
    VALUES('global', CAST(unixepoch() / 900 AS INTEGER) * 900, 1)
    ON CONFLICT(bucket) DO UPDATE SET
      count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
      window_start = excluded.window_start;
  INSERT INTO vh_registration_limits(bucket, window_start, count)
    VALUES('ip:' || NEW.abuse_key, CAST(unixepoch() / 900 AS INTEGER) * 900, 1)
    ON CONFLICT(bucket) DO UPDATE SET
      count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
      window_start = excluded.window_start;
  DELETE FROM vh_registration_limits
    WHERE window_start < CAST(unixepoch() / 900 AS INTEGER) * 900;
END;
