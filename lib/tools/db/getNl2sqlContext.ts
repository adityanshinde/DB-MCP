import { getRelationships } from '@/lib/tools/db/getRelationships';
import { getTableSchema } from '@/lib/tools/db/getSchema';
import { listTables } from '@/lib/tools/db/listTables';
import { normalizeSchemaFilter, quoteIdentifier } from '@/lib/tools/db/toolUtils';
import type { DBType, DatabaseCredentials, ToolResponse } from '@/lib/types';

export type Nl2SqlColumn = {
  name: string;
  type: string;
  nullable: boolean;
};

export type Nl2SqlTable = {
  name: string;
  score: number;
  columns: Nl2SqlColumn[];
};

export type Nl2SqlDialect = {
  db: DBType;
  identifier_quote: string;
  limit_syntax: string;
  qualify_example: string;
  notes: string[];
};

export type Nl2SqlContext = {
  db: DBType;
  schema: string;
  question: string;
  keywords: string[];
  dialect: Nl2SqlDialect;
  tables: Nl2SqlTable[];
  relationships: Array<Record<string, unknown>>;
  total_tables_in_schema: number;
  selected_table_count: number;
  guidance: string[];
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'by', 'with', 'from', 'into',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'at', 'that', 'this', 'these', 'those',
  'how', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'many', 'much', 'me', 'my', 'i',
  'we', 'our', 'you', 'your', 'it', 'its', 'all', 'any', 'each', 'per', 'get', 'show', 'list',
  'find', 'give', 'total', 'count', 'number', 'between', 'over', 'under', 'about', 'do', 'does',
  'did', 'have', 'has', 'had', 'can', 'could', 'should', 'would', 'will', 'top', 'last', 'first'
]);

const MAX_TABLES_DEFAULT = 5;
const MAX_TABLES_HARD_CAP = 10;

export function clampMaxTables(value: number | undefined): number {
  const requested = Number.isFinite(value ?? NaN) ? Number(value) : MAX_TABLES_DEFAULT;
  return Math.max(1, Math.min(MAX_TABLES_HARD_CAP, Math.trunc(requested)));
}

/**
 * Break a natural-language question into meaningful lowercase keyword stems.
 * Strips stop words and short tokens, and adds singular/plural variants so a
 * question about "customers" can still match a "customer" table.
 */
export function extractKeywords(question: string): string[] {
  const tokens = (question || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    if (token.endsWith('ies') && token.length > 4) {
      expanded.add(`${token.slice(0, -3)}y`);
    } else if (token.endsWith('es') && token.length > 4) {
      expanded.add(token.slice(0, -2));
    }
    if (token.endsWith('s') && token.length > 3) {
      expanded.add(token.slice(0, -1));
    } else {
      expanded.add(`${token}s`);
    }
  }

  return Array.from(expanded);
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Score each table by how strongly its name overlaps with the question
 * keywords. Exact/substring matches score higher than fuzzy token overlap.
 * Returns tables sorted by score (desc) then name (asc) for stable output.
 */
export function rankTables(tables: string[], keywords: string[]): Array<{ table: string; score: number }> {
  const normalizedKeywords = keywords.map((keyword) => ({ raw: keyword, norm: normalizeForMatch(keyword) })).filter((k) => k.norm);

  const scored = tables.map((table) => {
    const normTable = normalizeForMatch(table);
    let score = 0;

    for (const keyword of normalizedKeywords) {
      if (!keyword.norm) {
        continue;
      }

      if (normTable === keyword.norm) {
        score += 10;
      } else if (normTable.includes(keyword.norm)) {
        score += 5;
      } else if (keyword.norm.length >= 4 && keyword.norm.includes(normTable)) {
        score += 3;
      }
    }

    return { table, score };
  });

  return scored.sort((a, b) => (b.score - a.score) || a.table.localeCompare(b.table));
}

export function buildDialectHints(db: DBType): Nl2SqlDialect {
  const quote = quoteIdentifier(db, 'name').replace('name', '');

  const base: Omit<Nl2SqlDialect, 'db' | 'identifier_quote'> = (() => {
    if (db === 'mssql') {
      return {
        limit_syntax: 'SELECT TOP (n) ... (no LIMIT clause)',
        qualify_example: '[schema].[table]',
        notes: [
          'Row limiting uses TOP (n), placed right after SELECT.',
          'Identifiers are quoted with square brackets.',
          'Use OFFSET ... FETCH NEXT for pagination with ORDER BY.'
        ]
      };
    }

    if (db === 'mysql') {
      return {
        limit_syntax: 'SELECT ... LIMIT n',
        qualify_example: '`table`',
        notes: [
          'Row limiting uses a trailing LIMIT n clause.',
          'Identifiers are quoted with backticks.',
          'Schema qualification maps to the active database.'
        ]
      };
    }

    if (db === 'sqlite') {
      return {
        limit_syntax: 'SELECT ... LIMIT n',
        qualify_example: '"table"',
        notes: [
          'Row limiting uses a trailing LIMIT n clause.',
          'Identifiers are quoted with double quotes.',
          'There are no schemas; attach databases act as namespaces.'
        ]
      };
    }

    return {
      limit_syntax: 'SELECT ... LIMIT n',
      qualify_example: '"schema"."table"',
      notes: [
        'Row limiting uses a trailing LIMIT n clause.',
        'Identifiers are quoted with double quotes.',
        'Always qualify tables with their schema.'
      ]
    };
  })();

  return {
    db,
    identifier_quote: quote,
    ...base
  };
}

function normalizeColumns(rawColumns: Array<Record<string, unknown>>): Nl2SqlColumn[] {
  return rawColumns.map((column) => ({
    name: String(column.name ?? column.column_name ?? ''),
    type: String(column.type ?? column.data_type ?? ''),
    nullable: Boolean(column.nullable ?? String(column.is_nullable ?? '').toUpperCase() === 'YES')
  }));
}

function filterRelationships(
  rows: Array<Record<string, unknown>>,
  selectedTables: Set<string>
): Array<Record<string, unknown>> {
  if (selectedTables.size === 0) {
    return rows;
  }

  const normalizedSelected = new Set(Array.from(selectedTables).map((name) => name.toLowerCase()));

  const matched = rows.filter((row) => {
    const local = String(row.table_name ?? row.TABLE_NAME ?? '').toLowerCase();
    const foreign = String(row.foreign_table_name ?? row.referenced_table_name ?? '').toLowerCase();
    if (!local && !foreign) {
      return true;
    }
    return normalizedSelected.has(local) || normalizedSelected.has(foreign);
  });

  return matched.length > 0 ? matched : rows;
}

/**
 * Assemble everything an agent needs to write SQL for a natural-language
 * question in a single call: the ranked relevant tables, their columns, the
 * foreign-key relationships between them, and dialect-specific SQL hints.
 * No LLM is used here — the caller's own agent generates the SQL.
 */
export async function getNl2sqlContext(
  db: DBType,
  question: string,
  schema?: string,
  maxTables?: number,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<Nl2SqlContext>> {
  try {
    if (!question || !question.trim()) {
      throw new Error('A natural-language question is required.');
    }

    const resolvedSchema = normalizeSchemaFilter(db, schema);
    const limit = clampMaxTables(maxTables);
    const keywords = extractKeywords(question);

    const tablesResult = await listTables(db, schema, credentials, connection);
    if (!tablesResult.success || !tablesResult.data) {
      throw new Error(tablesResult.error || 'Failed to list tables.');
    }

    const allTables = tablesResult.data.tables;
    const ranked = rankTables(allTables, keywords);
    const relevant = ranked.filter((entry) => entry.score > 0);
    const selection = (relevant.length > 0 ? relevant : ranked).slice(0, limit);
    const selectedNames = selection.map((entry) => entry.table);
    const selectedSet = new Set(selectedNames);

    const tables: Nl2SqlTable[] = [];
    for (const entry of selection) {
      const schemaResult = await getTableSchema(db, entry.table, schema, credentials, connection);
      const rawColumns = schemaResult.success && schemaResult.data
        ? (schemaResult.data.columns as Array<Record<string, unknown>>)
        : [];

      tables.push({
        name: entry.table,
        score: entry.score,
        columns: normalizeColumns(rawColumns)
      });
    }

    let relationships: Array<Record<string, unknown>> = [];
    const relationshipsResult = await getRelationships(db, undefined, schema, credentials, connection);
    if (relationshipsResult.success && relationshipsResult.data) {
      relationships = filterRelationships(relationshipsResult.data.relationships, selectedSet);
    }

    const dialect = buildDialectHints(db);

    const guidance = [
      'Generate a single read-only SELECT statement; never modify data.',
      `Qualify tables as ${dialect.qualify_example} and quote identifiers with ${dialect.identifier_quote || 'the dialect quote'}.`,
      `Row limiting: ${dialect.limit_syntax}.`,
      'Only reference the tables and columns listed here; call get_table_schema if you need more.',
      'After generating SQL, run it through run_query so it is validated as read-only.'
    ];

    return {
      success: true,
      data: {
        db,
        schema: resolvedSchema,
        question: question.trim(),
        keywords,
        dialect,
        tables,
        relationships,
        total_tables_in_schema: allTables.length,
        selected_table_count: tables.length,
        guidance
      },
      error: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to build NL2SQL context.'
    };
  }
}
