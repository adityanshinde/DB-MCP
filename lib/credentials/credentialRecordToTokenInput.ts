import type { CredentialConnectionRecord } from '@/lib/auth/credentials';

import type { TokenConnectionInput } from '@/lib/credentials/tokenConnection';

export function credentialRecordToTokenInput(record: CredentialConnectionRecord): TokenConnectionInput {
  switch (record.type) {
    case 'postgres': {
      const c = record.credentials.postgres;
      if (!c) {
        throw new Error('Missing Postgres credentials.');
      }

      return {
        name: record.name,
        label: record.label,
        isDefault: record.isDefault,
        db: 'postgres',
        credentials: {
          host: c.host,
          port: c.port,
          username: c.username,
          password: c.password,
          database: c.database
        }
      };
    }
    case 'mysql': {
      const c = record.credentials.mysql;
      if (!c) {
        throw new Error('Missing MySQL credentials.');
      }

      return {
        name: record.name,
        label: record.label,
        isDefault: record.isDefault,
        db: 'mysql',
        credentials: {
          host: c.host,
          port: c.port,
          username: c.username,
          password: c.password,
          database: c.database
        }
      };
    }
    case 'mssql': {
      const c = record.credentials.mssql;
      if (!c) {
        throw new Error('Missing SQL Server credentials.');
      }

      return {
        name: record.name,
        label: record.label,
        isDefault: record.isDefault,
        db: 'mssql',
        credentials: {
          server: c.server,
          username: c.username,
          password: c.password,
          database: c.database,
          ...(typeof c.port === 'number' ? { port: c.port } : {})
        }
      };
    }
    case 'sqlite': {
      const c = record.credentials.sqlite;
      if (!c) {
        throw new Error('Missing SQLite credentials.');
      }

      return {
        name: record.name,
        label: record.label,
        isDefault: record.isDefault,
        db: 'sqlite',
        credentials: {
          filePath: c.filePath
        }
      };
    }
    default: {
      const exhaustive: never = record.type;
      throw new Error(`Unsupported database type: ${String(exhaustive)}`);
    }
  }
}
