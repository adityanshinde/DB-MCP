import type { DBType, DatabaseCredentials, ToolResponse } from '@/lib/types';
import { getRoutineSummary } from '@/lib/tools/getRoutineSummary';

export async function getFunctionSummary(
  db: DBType,
  func: string,
  schema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ supported: boolean; routine: Record<string, unknown> | null; parameters: Array<Record<string, unknown>> }>> {
  return getRoutineSummary(db, 'FUNCTION', func, schema, credentials, connection);
}