import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import type { Account, Incident } from "./types";
export const digest=(value:unknown)=>createHash("sha256").update(typeof value==='string'?value:JSON.stringify(value)).digest("hex");
const schema=`CREATE TABLE IF NOT EXISTS guardian_accounts(id TEXT PRIMARY KEY,version INTEGER NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS guardian_records(incident TEXT NOT NULL,seq INTEGER NOT NULL,payload TEXT NOT NULL,previous TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(incident,seq)); CREATE TABLE IF NOT EXISTS guardian_tokens(hash TEXT PRIMARY KEY,owner TEXT NOT NULL); CREATE TABLE IF NOT EXISTS guardian_audio(incident TEXT NOT NULL,id TEXT NOT NULL,seq INTEGER NOT NULL,mime TEXT NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(incident,id,seq));`;
export class Repository {
  db?:DatabaseSync; pool?:Pool; ready:Promise<unknown>;
  constructor(filename=process.env.DATABASE_PATH||"./data/guardian.sqlite",url=process.env.DATABASE_URL) {
    if(url){this.pool=new Pool({connectionString:url,max:4,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});this.ready=this.pool.query(schema);}
    else {if(filename!==":memory:")mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});this.db=new DatabaseSync(filename);this.db.exec("PRAGMA journal_mode=WAL;"+schema);this.ready=Promise.resolve();}
  }
  async query(sql:string,args:unknown[]=[],client?:PoolClient):Promise<Record<string,unknown>[]> {
    await this.ready;
    if(client||this.pool) return (await (client||this.pool!).query(sql,args)).rows;
    const st=this.db!.prepare(sql.replace(/\$\d+/g,"?"));
    if(/^\s*(SELECT|WITH)/i.test(sql))return st.all(...args as (string|number|null)[]) as Record<string,unknown>[];
    st.run(...args as (string|number|null)[]);return [];
  }
  async load(owner:string){const [row]=await this.query("SELECT payload FROM guardian_accounts WHERE id=$1",[owner]);return row?JSON.parse(String(row.payload)) as Account:null;}
  async all(){return (await this.query("SELECT payload FROM guardian_accounts")).map(r=>JSON.parse(String(r.payload)) as Account);}
  async save(account:Account,initial=false){
    await this.ready; const client=await this.pool?.connect();
    try {
      if(client)await client.query("BEGIN");else this.db!.exec("BEGIN IMMEDIATE");
      const [existing]=await this.query("SELECT version FROM guardian_accounts WHERE id=$1"+(client?" FOR UPDATE":""),[account.id],client);
      if(existing&&Number(existing.version)!==account.version)throw new Error("STATE_CONFLICT");
      if(!existing&&!initial)throw new Error("SESSION_NOT_FOUND");
      const next={...account,version:account.version+1};
      await this.query("INSERT INTO guardian_accounts(id,version,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET version=excluded.version,payload=excluded.payload",[account.id,next.version,JSON.stringify(next)],client);
      const i=account.incident,payload=JSON.stringify(i);
      const [last]=await this.query("SELECT seq,hash,payload FROM guardian_records WHERE incident=$1 ORDER BY seq DESC LIMIT 1",[i.id],client);
      if(last?.payload!==payload){const previous=String(last?.hash||"");await this.query("INSERT INTO guardian_records VALUES($1,$2,$3,$4,$5)",[i.id,Number(last?.seq||0)+1,payload,previous,digest(previous+'\n'+payload)],client);}
      for(const member of account.members)await this.query("INSERT INTO guardian_tokens(hash,owner) VALUES($1,$2) ON CONFLICT(hash) DO NOTHING",[member.tokenHash,account.id],client);
      if(client)await client.query("COMMIT");else this.db!.exec("COMMIT");account.version=next.version;
    }catch(e){if(client)await client.query("ROLLBACK");else this.db!.exec("ROLLBACK");throw e;}finally{client?.release();}
  }
  async ownerByToken(token:string){const [row]=await this.query("SELECT owner FROM guardian_tokens WHERE hash=$1",[digest(token)]);return row?String(row.owner):null;}
  async integrity(id:string){const rows=await this.query("SELECT * FROM guardian_records WHERE incident=$1 ORDER BY seq",[id]);let previous="",n=0;for(const row of rows){n++;if(Number(row.seq)!==n||row.previous!==previous||row.hash!==digest(previous+'\n'+row.payload))return {valid:false,count:rows.length,head:previous};previous=String(row.hash);}return {valid:true,count:rows.length,head:previous};}
  async close(){this.db?.close();await this.pool?.end();}
}
