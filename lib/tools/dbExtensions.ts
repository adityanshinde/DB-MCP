import { CONFIG } from '@/lib/config';
import { METADATA_CACHE_TTLS, readThroughMetadataCache } from '@/lib/cache/metadataCache';
import { compareSchema } from '@/lib/tools/compareSchema';
import { getColumnStats } from '@/lib/tools/getColumnStats';
import { getConstraints } from '@/lib/tools/getConstraints';
import { getDependencyGraph } from '@/lib/tools/getDependencyGraph';
import { explainQuery } from '@/lib/tools/explainQuery';
import { getProcedureSummary } from '@/lib/tools/getProcedureSummary';
import { normalizeSchemaFilter, quoteIdentifier } from '@/lib/tools/toolUtils';
import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import type { DBType, DatabaseCredentials, ToolResponse } from '@/lib/types';

type FilterValue = string | number | boolean | null;

type IndexUsageRow = Record<string, unknown> & {
  schema_name?: string;
  table_name?: string;
  index_name?: string;
  usage_count?: number;
  read_count?: number;
  write_count?: number;
  is_unique?: boolean;
  is_primary_key?: boolean;
};

function resolveSchema(db: DBType, schema?: string): string {
  const fallback = db === 'postgres' ? 'public' : 'dbo';
  const resolved = (schema || fallback).trim();

  if (!CONFIG.app.allowedSchemas.includes(resolved)) {
    throw new Error(`Schema ${resolved} is not allowed. Allowed schemas: ${CONFIG.app.allowedSchemas.join(', ')}.`);
  }

  return resolved;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const resolved = Number.isFinite(value ?? NaN) ? Number(value) : fallback;
  return Math.max(min, Math.min(max, resolved));
}

function buildFilterEntries(filters?: Record<string, FilterValue>): Array<[string, FilterValue]> {
  return Object.entries(filters ?? {})
    .map(([key, value]) => [key.trim(), value] as [string, FilterValue])
    .filter(([key]) => Boolean(key))
    .slice(0, 10);
}

function buildEqualityFilterClause(
  db: DBType,
  filters?: Record<string, FilterValue>
): {
  clause: string;
  params: unknown[] | Record<string, unknown>;
  appliedFilters: string[];
  truncated: boolean;
} {
  const entries = buildFilterEntries(filters);
  const appliedFilters: string[] = [];
  const truncated = Object.keys(filters ?? {}).length > entries.length;

  if (db === 'mssql') {
    const params: Record<string, unknown> = {};
    const clauses: string[] = [];

    entries.forEach(([key, value], index) => {
      if (value === null) {
        clauses.push(`${quoteIdentifier(db, key)} IS NULL`);
        appliedFilters.push(`${key}:null`);
        return;
      }

      const paramName = `filter_${index + 1}`;
      params[paramName] = value;
      clauses.push(`${quoteIdentifier(db, key)} = @${paramName}`);
      appliedFilters.push(key);
    });

    return {
      clause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
      params,
      appliedFilters,
      truncated
    };
  }

  const params: unknown[] = [];
  const clauses: string[] = [];

  entries.forEach(([key, value]) => {
    if (value === null) {
      clauses.push(`${quoteIdentifier(db, key)} IS NULL`);
      appliedFilters.push(`${key}:null`);
      return;
    }

    params.push(value);
    clauses.push(`${quoteIdentifier(db, key)} = ?`);
    appliedFilters.push(key);
  });

  return {
    clause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
    appliedFilters,
    truncated
  };
}

function buildOrderingClause(db: DBType, orderBy?: string, direction?: 'asc' | 'desc'): string {
  const column = orderBy?.trim();
  if (!column) {
    return '';
  }

  const resolvedDirection = direction === 'desc' ? 'DESC' : 'ASC';
  return ` ORDER BY ${quoteIdentifier(db, column)} ${resolvedDirection}`;
}

function normalizeUsageRow(db: DBType, row: Record<string, unknown>): IndexUsageRow {
  if (db === 'postgres') {
    const readCount = Number(row.idx_tup_read ?? 0);
    const scanCount = Number(row.idx_scan ?? 0);
    const fetchCount = Number(row.idx_tup_fetch ?? 0);

    return {
      ...row,
      idx_scan: scanCount,
      idx_tup_read: readCount,
      idx_tup_fetch: fetchCount,
      usage_count: scanCount,
      read_count: readCount,
      write_count: 0,
      is_unique: Boolean(row.is_unique),
      is_primary_key: Boolean(row.is_primary_key)
    };
  }

  if (db === 'mssql') {
    const seeks = Number(row.user_seeks ?? 0);
    const scans = Number(row.user_scans ?? 0);
    const lookups = Number(row.user_lookups ?? 0);
    const updates = Number(row.user_updates ?? 0);

    return {
      ...row,
      user_seeks: seeks,
      user_scans: scans,
      user_lookups: lookups,
      user_updates: updates,
      usage_count: seeks + scans + lookups,
      read_count: seeks + scans + lookups,
      write_count: updates,
      is_unique: Boolean(row.is_unique),
      is_primary_key: Boolean(row.is_primary_key)
    };
  }

  const readCount = Number(row.count_read ?? 0);
  const writeCount = Number(row.count_write ?? 0);
  const fetchCount = Number(row.count_fetch ?? 0);
  const insertCount = Number(row.count_insert ?? 0);
  const updateCount = Number(row.count_update ?? 0);
  const deleteCount = Number(row.count_delete ?? 0);
  const totalOperations = Number(row.total_operations ?? 0);

  return {
    ...row,
    total_operations: totalOperations,
    usage_count: totalOperations || readCount + writeCount + fetchCount + insertCount + updateCount + deleteCount,
    read_count: readCount + fetchCount,
    write_count: writeCount + insertCount + updateCount + deleteCount,
    is_unique: Boolean(row.is_unique),
    is_primary_key: Boolean(row.is_primary_key) || String(row.index_name ?? '').toUpperCase() === 'PRIMARY'
  };
}

function buildColumnCardinalitySummary(stats: Awaited<ReturnType<typeof getColumnStats>>['data']): Array<Record<string, unknown>> {
  const totalRows = Number(stats?.total_rows ?? 0);
  return (stats?.columns ?? []).map((column) => {
    const distinctRows = Number(column.distinct_rows ?? 0);
    const nullRows = Number(column.null_rows ?? 0);
    const nonNullRows = Number(column.non_null_rows ?? 0);
    const distinctRatio = totalRows > 0 ? distinctRows / totalRows : 0;
    const nullRatio = totalRows > 0 ? nullRows / totalRows : 0;

    return {
      column: column.column,
      data_type: column.data_type,
      nullable: Boolean(column.nullable),
      total_rows: totalRows,
      non_null_rows: nonNullRows,
      null_rows: nullRows,
      distinct_rows: distinctRows,
      distinct_ratio: Number(distinctRatio.toFixed(4)),
      null_ratio: Number(nullRatio.toFixed(4))
    };
  });
}

export async function getProcedureParams(
  db: DBType,
  procedure: string,
  schema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ supported: boolean; procedure: string; schema?: string; parameters: Array<Record<string, unknown>> }>> {
  const summary = await getProcedureSummary(db, procedure, schema, credentials, connection);

  if (!summary.success || !summary.data) {
    return {
      success: false,
      data: null,
      error: summary.error ?? 'Failed to summarize routine parameters.'
    };
  }

  return {
    success: true,
    data: {
      supported: summary.data.supported,
      procedure,
      schema,
      parameters: summary.data.parameters
    },
    error: null
  };
}

export async function getTableConstraints(
  db: DBType,
  table?: string,
  schema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ constraints: Array<Record<string, unknown>> }>> {
  return getConstraints(db, table, schema, credentials, connection);
}

export async function getTableDependencies(
  db: DBType,
  table?: string,
  schema?: string,
  limit?: number,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ root?: string; node_count: number; edge_count: number; nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>; truncated: boolean }>> {
  return getDependencyGraph(db, table, schema, limit, credentials, connection);
}

export async function getSchemaDiff(
  db: DBType,
  leftTable: string,
  rightTable: string,
  leftSchema?: string,
  rightSchema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ left: { table: string; schema?: string }; right: { table: string; schema?: string }; added_columns: string[]; removed_columns: string[]; changed_columns: Array<Record<string, unknown>>; shared_columns: string[] }>> {
  return compareSchema(db, leftTable, rightTable, leftSchema, rightSchema, credentials, connection);
}

export async function explainQueryVerbose(
  db: DBType,
  query: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ db: DBType; query: string; plan: string[]; plan_preview: string; plan_line_count: number; analysis_mode: string; notes: string[] }>> {
  const result = await explainQuery(db, query, credentials, connection);

  if (!result.success || !result.data) {
    return {
      success: false,
      data: null,
      error: result.error ?? 'Failed to explain query.'
    };
  }

  return {
    success: true,
    data: {
      ...result.data,
      plan_line_count: result.data.plan.length,
      analysis_mode: 'plan_only',
      notes: ['This tool returns the query plan only and does not execute the query.']
    },
    error: null
  };
}

export async function getColumnCardinality(
  db: DBType,
  table: string,
  schema?: string,
  limit?: number,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ table: string; schema: string; total_rows: number; columns_checked: number; cardinality: Array<Record<string, unknown>>; truncated: boolean }>> {
  const result = await getColumnStats(db, table, schema, limit, credentials, connection);

  if (!result.success || !result.data) {
    return {
      success: false,
      data: null,
      error: result.error ?? 'Failed to compute column cardinality.'
    };
  }

  const cardinality = buildColumnCardinalitySummary(result.data);

  return {
    success: true,
    data: {
      table: result.data.table,
      schema: result.data.schema,
      total_rows: result.data.total_rows,
      columns_checked: cardinality.length,
      cardinality,
      truncated: result.data.truncated
    },
    error: null
  };
}

export async function getTableIndexesUsage(
  db: DBType,
  table?: string,
  schema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ supported: boolean; schema: string; table?: string; indexes: IndexUsageRow[]; warnings: string[] }>> {
  try {
    const resolvedSchema = resolveSchema(db, schema);
    const data = await readThroughMetadataCache({
      db,
      tool: 'getTableIndexesUsage',
      schema: resolvedSchema,
      connection,
      params: { table: table ?? 'all' },
      credentials,
      ttlSeconds: METADATA_CACHE_TTLS.analytics,
      fetcher: async () => {
        if (db === 'postgres') {
          const result = await queryPostgres<Record<string, unknown>>(
            `SELECT p.schemaname AS schema_name,
                    p.tablename AS table_name,
                    p.indexname AS index_name,
                    p.indexdef AS definition,
                    COALESCE(s.idx_scan, 0) AS idx_scan,
                    COALESCE(s.idx_tup_read, 0) AS idx_tup_read,
                    COALESCE(s.idx_tup_fetch, 0) AS idx_tup_fetch,
                    COALESCE(i.indisunique, false) AS is_unique,
                    COALESCE(pc.contype = 'p', false) AS is_primary_key
             FROM pg_indexes p
             LEFT JOIN pg_stat_user_indexes s
               ON s.schemaname = p.schemaname
              AND s.relname = p.tablename
              AND s.indexrelname = p.indexname
             LEFT JOIN pg_class t
               ON t.relname = p.tablename
             LEFT JOIN pg_namespace n
               ON n.nspname = p.schemaname
              AND n.oid = t.relnamespace
             LEFT JOIN pg_class idxc
               ON idxc.relname = p.indexname
              AND idxc.relnamespace = n.oid
             LEFT JOIN pg_index i
               ON i.indexrelid = idxc.oid
             LEFT JOIN pg_constraint pc
               ON pc.conindid = idxc.oid
             WHERE p.schemaname = $1
               AND ($2::text IS NULL OR p.tablename = $2)
             ORDER BY p.tablename, p.indexname`,
            [resolvedSchema, table ?? null],
            credentials?.postgres,
            connection
          );

          return {
            supported: true,
            schema: resolvedSchema,
            table,
            indexes: result.rows.map((row) => normalizeUsageRow(db, row)),
            warnings: []
          };
        }

        if (db === 'mssql') {
          const result = await queryMSSQL(
            `SELECT sch.name AS schema_name,
                    tbl.name AS table_name,
                    idx.name AS index_name,
                    idx.type_desc AS index_type,
                    idx.is_unique,
                    idx.is_primary_key,
                    COALESCE(us.user_seeks, 0) AS user_seeks,
                    COALESCE(us.user_scans, 0) AS user_scans,
                    COALESCE(us.user_lookups, 0) AS user_lookups,
                    COALESCE(us.user_updates, 0) AS user_updates,
                    us.last_user_seek,
                    us.last_user_scan,
                    us.last_user_lookup,
                    us.last_user_update
             FROM sys.indexes idx
             INNER JOIN sys.tables tbl ON idx.object_id = tbl.object_id
             INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
             LEFT JOIN sys.dm_db_index_usage_stats us
               ON us.database_id = DB_ID()
              AND us.object_id = idx.object_id
              AND us.index_id = idx.index_id
             WHERE sch.name = @schemaName
               AND (@tableName IS NULL OR tbl.name = @tableName)
               AND idx.is_hypothetical = 0
               AND idx.name IS NOT NULL
             ORDER BY tbl.name, idx.name`,
            {
              schemaName: resolvedSchema,
              tableName: table ?? null
            },
            credentials?.mssql,
            connection
          );

          return {
            supported: true,
            schema: resolvedSchema,
            table,
            indexes: result.rows.map((row) => normalizeUsageRow(db, row)),
            warnings: []
          };
        }

        if (db === 'mysql') {
          const rows = (await queryMySQL(
            `SELECT OBJECT_SCHEMA AS schema_name,
                    OBJECT_NAME AS table_name,
                    INDEX_NAME AS index_name,
                    COUNT_STAR AS total_operations,
                    COUNT_READ AS count_read,
                    COUNT_WRITE AS count_write,
                    COUNT_FETCH AS count_fetch,
                    COUNT_INSERT AS count_insert,
                    COUNT_UPDATE AS count_update,
                    COUNT_DELETE AS count_delete
             FROM performance_schema.table_io_waits_summary_by_index_usage
             WHERE OBJECT_SCHEMA = DATABASE()
               AND INDEX_NAME IS NOT NULL
               AND (? IS NULL OR OBJECT_NAME = ?)
             ORDER BY OBJECT_NAME, INDEX_NAME`,
            credentials,
            [table ?? null, table ?? null],
            connection
          )) as Array<Record<string, unknown>>;

          return {
            supported: true,
            schema: resolvedSchema,
            table,
            indexes: rows.map((row) => normalizeUsageRow(db, row)),
            warnings: []
          };
        }

        return {
          supported: false,
          schema: resolvedSchema,
          table,
          indexes: [],
          warnings: ['SQLite does not expose portable index usage statistics.']
        };
      }
    });

    return {
      success: true,
      data,
      error: null
    };
  } catch (error) {
    const fallbackSchema = (schema || (db === 'postgres' ? 'public' : 'dbo')).trim() || (db === 'postgres' ? 'public' : 'dbo');

    return {
      success: true,
      data: {
        supported: false,
        schema: fallbackSchema,
        table,
        indexes: [],
        warnings: [error instanceof Error ? error.message : 'Failed to read index usage statistics.']
      },
      error: null
    };
  }
}

export async function findUnusedIndexes(
  db: DBType,
  table?: string,
  schema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ supported: boolean; schema: string; table?: string; inspected_indexes: number; unused_indexes: IndexUsageRow[]; warnings: string[] }>> {
  const usage = await getTableIndexesUsage(db, table, schema, credentials, connection);

  if (!usage.success || !usage.data) {
    return {
      success: false,
      data: null,
      error: usage.error ?? 'Failed to inspect index usage.'
    };
  }

  if (!usage.data.supported) {
    return {
      success: true,
      data: {
        supported: false,
        schema: usage.data.schema,
        table: usage.data.table,
        inspected_indexes: 0,
        unused_indexes: [],
        warnings: usage.data.warnings
      },
      error: null
    };
  }

  const unusedIndexes = usage.data.indexes.filter((index) => {
    const usageCount = Number(index.usage_count ?? 0);
    const indexName = String(index.index_name ?? '');
    const isPrimaryKey = Boolean(index.is_primary_key);

    if (!indexName || isPrimaryKey || indexName.toUpperCase() === 'PRIMARY' || indexName.toLowerCase().endsWith('_pkey')) {
      return false;
    }

    return usageCount === 0;
  });

  return {
    success: true,
    data: {
      supported: true,
      schema: usage.data.schema,
      table: usage.data.table,
      inspected_indexes: usage.data.indexes.length,
      unused_indexes: unusedIndexes,
      warnings: usage.data.warnings.length > 0
        ? usage.data.warnings
        : ['Unused indexes should be reviewed manually before removal. A zero-usage stat does not guarantee the index is safe to drop.']
    },
    error: null
  };
}

export async function sampleRowsByFilter(
  db: DBType,
  table: string,
  schema?: string,
  filters?: Record<string, FilterValue>,
  limit?: number,
  order_by?: string,
  order_direction?: 'asc' | 'desc',
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ table: string; schema: string; limit: number; applied_filters: string[]; filters_truncated: boolean; order_by?: string; order_direction?: 'asc' | 'desc'; rows: unknown[] }>> {
  try {
    const rowLimit = clampInt(limit, 5, 1, 10);
    const resolvedSchema = normalizeSchemaFilter(db, schema);
    const { clause, params, appliedFilters, truncated } = buildEqualityFilterClause(db, filters);
    const orderingClause = buildOrderingClause(db, order_by, order_direction);

    if (db === 'postgres') {
      const query = `SELECT *
                     FROM ${quoteIdentifier(db, resolvedSchema)}.${quoteIdentifier(db, table)}${clause}${orderingClause}
                     LIMIT $${(params as unknown[]).length + 1}`;
      const rows = (await queryPostgres(query, [...(params as unknown[]), rowLimit], credentials?.postgres, connection)).rows;

      return {
        success: true,
        data: {
          table,
          schema: resolvedSchema,
          limit: rowLimit,
          applied_filters: appliedFilters,
          filters_truncated: truncated,
          order_by,
          order_direction,
          rows
        },
        error: null
      };
    }

    if (db === 'mssql') {
      const namedParams = params as Record<string, unknown>;
      namedParams.rowLimit = rowLimit;
      const query = `SELECT TOP (@rowLimit) *
                     FROM ${quoteIdentifier(db, resolvedSchema)}.${quoteIdentifier(db, table)}${clause}${orderingClause}`;
      const result = await queryMSSQL(query, namedParams, credentials?.mssql, connection);

      return {
        success: true,
        data: {
          table,
          schema: resolvedSchema,
          limit: rowLimit,
          applied_filters: appliedFilters,
          filters_truncated: truncated,
          order_by,
          order_direction,
          rows: result.rows
        },
        error: null
      };
    }

    if (db === 'mysql') {
      const query = `SELECT *
                     FROM ${quoteIdentifier(db, table)}${clause}${orderingClause}
                     LIMIT ?`;
      const rows = (await queryMySQL(query, credentials, [...(params as unknown[]), rowLimit], connection)) as unknown[];

      return {
        success: true,
        data: {
          table,
          schema: resolvedSchema,
          limit: rowLimit,
          applied_filters: appliedFilters,
          filters_truncated: truncated,
          order_by,
          order_direction,
          rows
        },
        error: null
      };
    }

    if (db === 'sqlite') {
      const query = `SELECT *
                     FROM ${quoteIdentifier(db, table)}${clause}${orderingClause}
                     LIMIT ?`;
      const rows = (await querySQLite(query, credentials, [...(params as unknown[]), rowLimit], connection)) as unknown[];

      return {
        success: true,
        data: {
          table,
          schema: resolvedSchema,
          limit: rowLimit,
          applied_filters: appliedFilters,
          filters_truncated: truncated,
          order_by,
          order_direction,
          rows
        },
        error: null
      };
    }

    return {
      success: false,
      data: null,
      error: 'Unsupported database type'
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to sample filtered rows.'
    };
  }
}

export async function checkDataQuality(
  db: DBType,
  table: string,
  schema?: string,
  limit?: number,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ table: string; schema: string; total_rows: number; columns_checked: number; issues: Array<Record<string, unknown>>; summary: Record<string, unknown> }>> {
  const stats = await getColumnStats(db, table, schema, limit, credentials, connection);

  if (!stats.success || !stats.data) {
    return {
      success: false,
      data: null,
      error: stats.error ?? 'Failed to check data quality.'
    };
  }

  const totalRows = Number(stats.data.total_rows ?? 0);
  const issues: Array<Record<string, unknown>> = [];
  const columnsWithNulls: string[] = [];
  const lowCardinalityColumns: string[] = [];
  const uniqueCandidateColumns: string[] = [];

  for (const column of stats.data.columns) {
    const columnName = String(column.column ?? '');
    const nullRows = Number(column.null_rows ?? 0);
    const distinctRows = Number(column.distinct_rows ?? 0);
    const nullRatio = totalRows > 0 ? nullRows / totalRows : 0;
    const distinctRatio = totalRows > 0 ? distinctRows / totalRows : 0;

    if (totalRows === 0) {
      issues.push({
        column: columnName,
        severity: 'info',
        kind: 'empty_table',
        message: 'Table has no rows.'
      });
      continue;
    }

    if (nullRows > 0) {
      columnsWithNulls.push(columnName);
      issues.push({
        column: columnName,
        severity: nullRatio >= 0.5 ? 'warning' : 'info',
        kind: 'null_values',
        message: `Column contains ${nullRows} null row(s).`,
        null_rows: nullRows,
        null_ratio: Number(nullRatio.toFixed(4))
      });
    }

    if (distinctRows > 0 && distinctRatio <= 0.2) {
      lowCardinalityColumns.push(columnName);
      issues.push({
        column: columnName,
        severity: 'info',
        kind: 'low_cardinality',
        message: 'Column has low cardinality compared with total row count.',
        distinct_rows: distinctRows,
        distinct_ratio: Number(distinctRatio.toFixed(4))
      });
    }

    if (distinctRows === totalRows && nullRows === 0) {
      uniqueCandidateColumns.push(columnName);
      issues.push({
        column: columnName,
        severity: 'info',
        kind: 'unique_candidate',
        message: 'Column appears to be unique across the sampled row set.',
        distinct_rows: distinctRows
      });
    }
  }

  return {
    success: true,
    data: {
      table,
      schema: stats.data.schema,
      total_rows: totalRows,
      columns_checked: stats.data.columns.length,
      issues,
      summary: {
        columns_with_nulls: columnsWithNulls,
        low_cardinality_columns: lowCardinalityColumns,
        unique_candidate_columns: uniqueCandidateColumns,
        empty_table: totalRows === 0,
        truncated: stats.data.truncated
      }
    },
    error: null
  };
}

export async function getTableCardinality(
  db: DBType,
  table: string,
  schema?: string,
  limit?: number,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ table: string; schema: string; total_rows: number; columns_checked: number; cardinality: Array<Record<string, unknown>>; truncated: boolean }>> {
  return getColumnCardinality(db, table, schema, limit, credentials, connection);
}

export async function getTableStats(
  db: DBType,
  table: string,
  schema?: string,
  limit?: number,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ table: string; schema: string; total_rows: number; columns_checked: number; issues: Array<Record<string, unknown>>; summary: Record<string, unknown> }>> {
  return checkDataQuality(db, table, schema, limit, credentials, connection);
}

export async function getTableIndexUsageSummary(
  db: DBType,
  table?: string,
  schema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ supported: boolean; schema: string; table?: string; indexes: IndexUsageRow[]; warnings: string[] }>> {
  return getTableIndexesUsage(db, table, schema, credentials, connection);
}
