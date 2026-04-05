import sqlite3 from 'sqlite3';
import type { DatabaseCredentials } from '@/lib/types';

let defaultDb: sqlite3.Database | null = null;

function getDefaultDatabase(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    if (defaultDb) {
      resolve(defaultDb);
      return;
    }

    const filePath = process.env.SQLITE_PATH || ':memory:';
    const db = new sqlite3.Database(filePath, (err) => {
      if (err) reject(err);
      else {
        defaultDb = db;
        resolve(db);
      }
    });
  });
}

function getDynamicDatabase(credentials: DatabaseCredentials): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    if (!credentials.sqlite) {
      reject(new Error('SQLite credentials not provided'));
      return;
    }

    const db = new sqlite3.Database(credentials.sqlite.filePath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

export async function querySQLite(
  query: string,
  credentials?: DatabaseCredentials
): Promise<unknown> {
  const db = await (credentials ? getDynamicDatabase(credentials) : getDefaultDatabase());

  return new Promise((resolve, reject) => {
    db.all(query, (err: Error | null, rows: unknown[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export async function getTablesSQLite(
  credentials?: DatabaseCredentials
): Promise<string[]> {
  const db = await (credentials ? getDynamicDatabase(credentials) : getDefaultDatabase());

  return new Promise((resolve, reject) => {
    db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      (err: Error | null, rows: Array<{ name: string }>) => {
        if (err) reject(err);
        else resolve((rows || []).map((row) => row.name));
      }
    );
  });
}

export async function getSchemaSQLite(
  table: string,
  credentials?: DatabaseCredentials
): Promise<Array<{ name: string; type: string; nullable: boolean }>> {
  const db = await (credentials ? getDynamicDatabase(credentials) : getDefaultDatabase());

  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err: Error | null, rows: Array<{ name: string; type: string; notnull: number }>) => {
      if (err) reject(err);
      else {
        resolve(
          (rows || []).map((row) => ({
            name: row.name,
            type: row.type,
            nullable: row.notnull === 0
          }))
        );
      }
    });
  });
}

export async function getRelationshipsSQLite(
  table?: string,
  credentials?: DatabaseCredentials
): Promise<
  Array<{
    constraint: string;
    table: string;
    column: string;
    referenced_table: string;
    referenced_column: string;
  }>
> {
  const db = await (credentials ? getDynamicDatabase(credentials) : getDefaultDatabase());

  return new Promise(async (resolve, reject) => {
    const relationships: Array<{
      constraint: string;
      table: string;
      column: string;
      referenced_table: string;
      referenced_column: string;
    }> = [];

    try {
      let tables: string[];

      if (table) {
        tables = [table];
      } else {
        tables = await new Promise((res, rej) => {
          db.all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            (err: Error | null, rows: Array<{ name: string }>) => {
              if (err) rej(err);
              else res((rows || []).map((t) => t.name));
            }
          );
        });
      }

      for (const tbl of tables) {
        const fks = await new Promise<Array<{ id: number; table: string; from: string; to: string }>>((res, rej) => {
          db.all(`PRAGMA foreign_key_list(${tbl})`, (err: Error | null, rows: unknown[]) => {
            if (err) rej(err);
            else res((rows || []) as Array<{ id: number; table: string; from: string; to: string }>);
          });
        });

        for (const fk of fks) {
          relationships.push({
            constraint: `fk_${tbl}_${fk.id}`,
            table: tbl,
            column: fk.from,
            referenced_table: fk.table,
            referenced_column: fk.to
          });
        }
      }

      resolve(relationships);
    } catch (error) {
      reject(error);
    }
  });
}
