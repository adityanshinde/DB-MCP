import type { CredentialConnectionRecord } from '@/lib/auth/credentials';

import { tokenInputToDatabaseCredentials, type TokenConnectionInput } from '@/lib/credentials/tokenConnection';

export function normalizeDefaultConnectionForInputs(connections: TokenConnectionInput[], requestedDefault?: string): string {
  if (requestedDefault?.trim()) {
    return requestedDefault.trim();
  }

  const explicitDefault = connections.find((connection) => connection.isDefault)?.name;
  if (explicitDefault) {
    return explicitDefault.trim();
  }

  return connections[0].name.trim();
}

export function mapTokenInputsToCredentialRecords(
  inputs: TokenConnectionInput[],
  normalizedDefaultConnection: string
): CredentialConnectionRecord[] {
  return inputs.map((connection) => ({
    name: connection.name.trim(),
    label: connection.label?.trim() || undefined,
    type: connection.db,
    credentials: tokenInputToDatabaseCredentials(connection),
    isDefault: connection.name.trim() === normalizedDefaultConnection
  }));
}
