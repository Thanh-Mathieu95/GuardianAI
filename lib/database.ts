import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export class Database {
  sqlite?: DatabaseSync;
  pool?: Pool;
  ready: Promise<void>;
  private lease?: PoolClient;
  private unavailable = false;

  constructor(filename: string, url?: string) {
    if (url) {
      this.pool = new Pool({ connectionString: url, max: 4,
        options: "-c search_path=guardian_ai", ssl: {
          rejectUnauthorized: true,
          ca: readFileSync(path.join(process.cwd(), "supabase", "prod-ca-2021.crt"), "utf8"),
        },
        connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
      this.pool.on("error", () => { this.unavailable = true; });
      this.ready = this.initializePostgres();
    } else {
      if (filename !== ":memory:") mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
      this.sqlite = new DatabaseSync(filename);
      this.ready = Promise.resolve();
    }
    // Requests still await ready and see a redacted error; avoid an unhandled
    // rejection if a connection fails before the first HTTP request arrives.
    void this.ready.catch(() => {});
  }

  private async initializePostgres() {
    try {
      this.lease = await this.pool!.connect();
      this.lease.on("error", () => { this.unavailable = true; });
      const lock = await this.lease.query("select pg_try_advisory_lock(742918603) as acquired");
      if (!lock.rows[0].acquired) throw new Error("Another backend holds the runtime lease");
      await this.lease.query("select id from guardian_ai.incidents limit 0");
    } catch {
      this.unavailable = true;
      this.lease?.release(true);
      this.lease = undefined;
      throw new Error("Kho PostgreSQL chưa sẵn sàng; kiểm tra kết nối, migration và instance backend.");
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, args: unknown[] = [], client?: PoolClient): Promise<T[]> {
    await this.ready;
    if (this.unavailable) throw new Error("Kho PostgreSQL bị gián đoạn. Yêu cầu chưa được xác nhận lưu.");
    try {
      if (this.pool) {
        let index = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++index}`);
        return (await (client ?? this.pool).query<T>(pgSql, args)).rows;
      }
      const statement = this.sqlite!.prepare(sql);
      if (statement.columns().length > 0) return statement.all(...args as never[]) as T[];
      statement.run(...args as never[]);
      return [];
    } catch {
      throw new Error("Không thể truy cập kho dữ liệu. Thao tác chưa được xác nhận lưu.");
    }
  }

  private sqliteTransaction: Promise<unknown> = Promise.resolve();
  async transaction<T>(work: (query: <R extends QueryResultRow = QueryResultRow>(sql: string, args?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
    await this.ready;
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work((sql, args) => this.query(sql, args, client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally { client.release(); }
    }
    const run = this.sqliteTransaction.then(async () => {
      this.sqlite!.exec("BEGIN");
      try {
        const result = await work((sql, args) => this.query(sql, args));
        this.sqlite!.exec("COMMIT");
        return result;
      } catch (error) { this.sqlite!.exec("ROLLBACK"); throw error; }
    });
    this.sqliteTransaction = run.catch(() => {});
    return run;
  }

  async close() {
    await this.ready.catch(() => {});
    this.lease?.release(true);
    this.lease = undefined;
    if (this.pool) await this.pool.end();
    else this.sqlite?.close();
  }
}
