import type { ToolResponse } from '@/lib/types';

export function ok<T>(data: T): ToolResponse<T> {
  return { success: true, data, error: null };
}

export function fail(message: string): ToolResponse<never> {
  return { success: false, data: null, error: message };
}

export const DB_TYPES = ['postgres', 'mssql', 'mysql', 'sqlite'] as const;

export type MockDbType = (typeof DB_TYPES)[number];

export function postgresResult<T>(rows: T[], fields: string[] = Object.keys((rows[0] as object) ?? {})) {
  return {
    rows,
    rowCount: rows.length,
    fields
  };
}

export function mssqlResult<T>(rows: T[], columns: string[] = Object.keys((rows[0] as object) ?? {})) {
  return {
    rows,
    rowCount: rows.length,
    columns
  };
}
