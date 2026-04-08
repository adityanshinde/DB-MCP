import { CONFIG } from '@/lib/config';
import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import { validateSelectOnlyQuery } from '@/lib/validators/queryValidator';
import type { DBType, DatabaseCredentials, QueryMetadata, ToolResponse } from '@/lib/types';

function applyResultLimit(db: DBType, query: string): string {
  const rowLimit = CONFIG.app.maxRows;

  if (db === 'mssql') {
    const selectWithTop = /^select\s+(distinct\s+)?top\s*\(\s*\d+\s*\)/i;
    if (selectWithTop.test(query)) {
      return query.replace(selectWithTop, (_match, distinctPart = '') => `SELECT ${distinctPart || ''}TOP (${rowLimit})`);
    }

    const selectDistinct = /^select\s+distinct\b/i;
    if (selectDistinct.test(query)) {
      return query.replace(selectDistinct, `SELECT DISTINCT TOP (${rowLimit})`);
    }

    return query.replace(/^select\b/i, `SELECT TOP (${rowLimit})`);
  }

  return `SELECT * FROM (${query}) AS mcp_read_query LIMIT ${rowLimit}`;
}

export async function executeReadQuery(
  db: DBType,
  query: string,
  credentials?: DatabaseCredentials
): Promise<ToolResponse<{ metadata: QueryMetadata; rows: unknown[] }>> {
  try {
    const validated = validateSelectOnlyQuery(query);
    const executedQuery = applyResultLimit(db, validated);

    if (db === 'postgres') {
      const result = await queryPostgres(executedQuery, [], credentials?.postgres);
      return {
        success: true,
        data: {
          metadata: {
            db,
            rows: result.rowCount,
            columns: result.fields,
            query: executedQuery
          },
          rows: result.rows
        },
        error: null
      };
    }

    if (db === 'mssql') {
      const result = await queryMSSQL(executedQuery, {}, credentials?.mssql);
      return {
        success: true,
        data: {
          metadata: {
            db,
            rows: result.rowCount,
            columns: result.columns,
            query: executedQuery
          },
          rows: result.rows
        },
        error: null
      };
    }

    if (db === 'mysql') {
      const rows = (await queryMySQL(executedQuery, credentials)) as unknown[];
      return {
        success: true,
        data: {
          metadata: {
            db,
            rows: rows.length,
            columns: Object.keys(rows[0] || {}),
            query: executedQuery
          },
          rows
        },
        error: null
      };
    }

    if (db === 'sqlite') {
      const rows = (await querySQLite(executedQuery, credentials)) as unknown[];
      return {
        success: true,
        data: {
          metadata: {
            db,
            rows: rows.length,
            columns: Object.keys(rows[0] || {}),
            query: executedQuery
          },
          rows
        },
        error: null
      };
    }

    return {
      success: false,
      error: 'Unsupported database type',
      data: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to execute read-only query.'
    };
  }
}