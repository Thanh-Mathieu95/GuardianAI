import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../lib/database";
import { PersistentStore } from "../lib/persistent-store";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";

async function main() {
  assert.ok(process.env.GUARDIAN_POSTGRES_URL, "GUARDIAN_POSTGRES_URL is required");
  let database = new Database(":memory:", process.env.GUARDIAN_POSTGRES_URL);
  const engine = new GuardianEngine(new Store(":memory:"));
  const owner = "persistence-qa-" + randomUUID();
  const incident = engine.create(owner);
  try {
    await database.ready;
    let repository = new PersistentStore(database);
    assert.equal(await repository.save(incident, 0), 1);
    assert.equal(await repository.load(incident.id, "different-owner"), undefined);
    incident.message = "Synthetic persistence verification";
    assert.equal(await repository.save(incident, 1), 2);
    await assert.rejects(repository.save(incident, 1), /REVISION_CONFLICT/);
    assert.equal((await repository.integrity(incident.id, owner)).valid, true);
    await database.close();
    database = new Database(":memory:", process.env.GUARDIAN_POSTGRES_URL);
    await database.ready;
    repository = new PersistentStore(database);
    const recovered = await repository.load(incident.id, owner);
    assert.equal(recovered?.revision, 2);
    assert.equal(recovered?.incident.message, incident.message);
    assert.equal((await repository.integrity(incident.id, owner)).valid, true);
    console.log("PASS: real PostgreSQL commit, owner isolation, revision conflict, hash chain and reconnect recovery.");
  } finally {
    // Only synthetic data created by this invocation is removed.
    await database.query("DELETE FROM event_snapshots WHERE incident_id=?", [incident.id]);
    await database.query("DELETE FROM report_revisions WHERE incident_id=?", [incident.id]);
    await database.query("DELETE FROM incidents WHERE id=? AND owner=?", [incident.id, owner]);
    await database.close();
    engine.store.db.close();
  }
}
void main().catch(() => { console.error("FAIL: PostgreSQL verification did not complete. Credentials and raw provider errors are hidden."); process.exitCode = 1; });
