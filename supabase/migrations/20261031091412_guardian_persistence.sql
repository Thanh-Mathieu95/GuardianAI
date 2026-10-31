-- Dedicated, non-exposed schema. Existing application tables are untouched.
CREATE SCHEMA IF NOT EXISTS guardian_ai;
REVOKE ALL ON SCHEMA guardian_ai FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS guardian_ai.incidents (
  id text PRIMARY KEY,
  owner text NOT NULL,
  updated_at text NOT NULL,
  payload text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0)
);
CREATE INDEX IF NOT EXISTS guardian_incidents_owner_updated ON guardian_ai.incidents(owner, updated_at DESC);

CREATE TABLE IF NOT EXISTS guardian_ai.event_snapshots (
  ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES guardian_ai.incidents(id),
  time text NOT NULL,
  payload text NOT NULL
);
CREATE INDEX IF NOT EXISTS guardian_snapshots_incident_time ON guardian_ai.event_snapshots(incident_id,time);

-- Keep the exact serialized UTF-8 payload bytes used by the existing hash chain.
CREATE TABLE IF NOT EXISTS guardian_ai.report_revisions (
  incident_id text NOT NULL REFERENCES guardian_ai.incidents(id),
  seq bigint NOT NULL CHECK (seq > 0),
  time text NOT NULL,
  payload text NOT NULL,
  previous_hash text NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY(incident_id,seq)
);

ALTER TABLE guardian_ai.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_ai.event_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_ai.report_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA guardian_ai FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS guardian_ai.members (
  id text PRIMARY KEY, owner text NOT NULL, role text NOT NULL CHECK(role IN ('CONTACT','PARTNER')),
  name text NOT NULL, token_hash text UNIQUE NOT NULL, token_ciphertext text NOT NULL,
  category text NOT NULL, lat double precision, lng double precision,
  on_duty integer NOT NULL CHECK(on_duty IN (0,1)), joined integer NOT NULL CHECK(joined IN (0,1)),
  created_at text NOT NULL, slot text
);
CREATE INDEX IF NOT EXISTS guardian_members_owner ON guardian_ai.members(owner,created_at);
CREATE TABLE IF NOT EXISTS guardian_ai.settings(owner text PRIMARY KEY,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS guardian_ai.sos_log(ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,owner text NOT NULL,at text NOT NULL);
CREATE INDEX IF NOT EXISTS guardian_sos_owner_at ON guardian_ai.sos_log(owner,at);
CREATE TABLE IF NOT EXISTS guardian_ai.ring_log(ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,member_id text NOT NULL,at text NOT NULL);
CREATE INDEX IF NOT EXISTS guardian_ring_member_at ON guardian_ai.ring_log(member_id,at);
CREATE TABLE IF NOT EXISTS guardian_ai.recording_chunks (
  incident_id text NOT NULL REFERENCES guardian_ai.incidents(id),
  session text NOT NULL, seq integer NOT NULL CHECK(seq>=0), object_key text UNIQUE NOT NULL,
  bytes integer NOT NULL CHECK(bytes>0 AND bytes<=2000000), mime text NOT NULL,
  sha256 text NOT NULL, PRIMARY KEY(incident_id,session,seq)
);
ALTER TABLE guardian_ai.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_ai.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_ai.sos_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_ai.ring_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_ai.recording_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA guardian_ai FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA guardian_ai FROM PUBLIC, anon, authenticated;
