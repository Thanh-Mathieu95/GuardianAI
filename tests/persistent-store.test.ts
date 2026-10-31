import { test } from "node:test";
import assert from "node:assert/strict";
import { Database } from "../lib/database";
import { PersistentStore } from "../lib/persistent-store";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";

function setup() {
  const database = new Database(":memory:");
  database.sqlite!.exec(`CREATE TABLE incidents(id TEXT PRIMARY KEY,owner TEXT NOT NULL,updated_at TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE event_snapshots(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,time TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE report_revisions(incident_id TEXT NOT NULL,seq INTEGER NOT NULL,time TEXT NOT NULL,payload TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(incident_id,seq));`);
  const engine = new GuardianEngine(new Store(":memory:"));
  return { database, repository: new PersistentStore(database), engine };
}

test("Async repository commits incident/event/report together, scopes owners, and rejects stale revisions", async () => {
  const { database, repository, engine } = setup();
  try {
    const incident = engine.create("test-owner");
    assert.equal(await repository.save(incident, 0), 1);
    assert.equal((await repository.load(incident.id, "test-owner"))?.revision, 1);
    assert.equal(await repository.load(incident.id, "other-owner"), undefined);
    await assert.rejects(repository.save(incident, 0), /REVISION_CONFLICT/);
    await assert.rejects(repository.reportHistory(incident.id, "other-owner"), /NOT_FOUND/);
    assert.equal((await repository.integrity(incident.id, "test-owner")).valid, true);
    assert.ok(database.sqlite!.prepare("SELECT id FROM event_snapshots WHERE incident_id=?").all(incident.id).length);
    incident.message = "Changed after first durable commit";
    const results = await Promise.allSettled([repository.save(incident, 1), repository.save(incident, 1)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await repository.load(incident.id, "test-owner"))?.revision, 2);
    database.sqlite!.prepare("UPDATE report_revisions SET payload='{}' WHERE incident_id=? AND seq=1").run(incident.id);
    assert.equal((await repository.integrity(incident.id, "test-owner")).valid, false);
  } finally { engine.store.db.close(); await database.close(); }
});

test("A report-write failure rolls back the incident and does not acknowledge a durable save", async () => {
  const { database, repository, engine } = setup();
  try {
    const incident = engine.create("rollback-owner");
    database.sqlite!.exec("CREATE TRIGGER deny_report BEFORE INSERT ON report_revisions BEGIN SELECT RAISE(ABORT,'test failure'); END;");
    await assert.rejects(repository.save(incident, 0));
    assert.equal(await repository.load(incident.id, "rollback-owner"), undefined);
    assert.equal(database.sqlite!.prepare("SELECT COUNT(*) n FROM event_snapshots").get()!.n, 0);
  } finally { engine.store.db.close(); await database.close(); }
});
