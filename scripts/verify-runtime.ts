import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { durableRuntime } from "../lib/runtime-persistence";
import { addDurableRecording, deleteDurableRecordings, readDurableRecording } from "../lib/remote-recordings";
import { PersistentStore } from "../lib/persistent-store";

async function main() {
  const runtime = await durableRuntime();
  assert.ok(runtime, "PostgreSQL runtime is required");
  const { engine, database } = runtime;
  const metadataPath = process.argv[3];
  assert.ok(metadataPath, "Use write/read and a scratch metadata path");
  try {
    if (process.argv[2] === "write") {
      const owner = "runtime-qa-" + randomUUID(), incident = engine.create(owner);
      const member = engine.network.create(owner,"CONTACT","Synthetic QA contact");
      engine.network.update(member.id,{ joined: true });
      engine.network.saveSettings(owner,{ userName: "Synthetic QA user" });
      await runtime.flush();
      const bytes = Buffer.from("synthetic-audio-chunk");
      await addDurableRecording(engine,incident,"session-qa01",0,"audio/webm",bytes);
      await runtime.flush();
      assert.equal((await readDurableRecording(incident,"session-qa01"))?.data.toString(),bytes.toString());
      await addDurableRecording(engine,incident,"session-qa01",0,"audio/webm",bytes);
      await assert.rejects(addDurableRecording(engine,incident,"session-qa01",0,"audio/webm",Buffer.from("different")));
      const [row] = await database.query("SELECT token_hash,token_ciphertext FROM members WHERE id=?",[member.id]);
      assert.notEqual(row.token_ciphertext,member.token);
      assert.equal(row.token_hash,createHash("sha256").update(member.token).digest("hex"));
      engine.close(incident,true);
      await runtime.flush();
      writeFileSync(metadataPath,JSON.stringify({ owner, id: incident.id, memberId: member.id, tokenHash: row.token_hash }));
      console.log("PASS: runtime committed incident, encrypted recipient token, network settings and private recording chunks.");
    } else if (process.argv[2] === "read") {
      const meta = JSON.parse(readFileSync(metadataPath,"utf8"));
      const incident = engine.get(meta.id,meta.owner);
      assert.equal(incident.status,"USER_CANCELLED");
      const member = engine.network.byId(meta.memberId);
      assert.ok(member?.joined);
      assert.equal(createHash("sha256").update(member.token).digest("hex"),meta.tokenHash);
      assert.equal(engine.network.settings(meta.owner).userName,"Synthetic QA user");
      assert.equal((await readDurableRecording(incident,"session-qa01"))?.data.toString(),"synthetic-audio-chunk");
      const repo = new PersistentStore(database);
      assert.equal((await repo.integrity(incident.id,meta.owner)).valid,true);
      await deleteDurableRecordings(incident);
      engine.cache.delete(incident.id);
      engine.network.remove(meta.owner,meta.memberId);
      await runtime.flush();
      await database.query("DELETE FROM settings WHERE owner=?",[meta.owner]);
      await database.query("DELETE FROM event_snapshots WHERE incident_id=?",[incident.id]);
      await database.query("DELETE FROM report_revisions WHERE incident_id=?",[incident.id]);
      await database.query("DELETE FROM incidents WHERE id=? AND owner=?",[incident.id,meta.owner]);
      console.log("PASS: a new process recovered incident, network, token, settings and private audio; hash chain valid; only this QA fixture removed.");
    } else throw new Error("Use write or read");
  } finally {
    engine.cache.clear();
    await database.close();
    engine.store.db.close();
  }
}
void main().catch(error => {
  console.error("FAIL: durable runtime verification.",error instanceof Error && error.name === "AssertionError" ? "Assertion failed." : "Credentials and provider errors hidden.");
  process.exitCode = 1;
});
