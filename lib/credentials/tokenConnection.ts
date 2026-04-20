import type { DatabaseCredentials } from '@/lib/types';

export type TokenConnectionInput =
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'postgres';
      credentials: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
      };
    }
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'mssql';
      credentials: {
        server: string;
        username: string;
        password: string;
        database: string;
        port?: number;
      };
    }
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'mysql';
      credentials: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
      };
    }
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'sqlite';
      credentials: {
        filePath: string;
      };
    };

export function tokenInputToDatabaseCredentials(input: TokenConnectionInput): DatabaseCredentials {
  if (input.db === 'postgres') {
    return {
      type: 'postgres',
      postgres: input.credentials
    };
  }

  if (input.db === 'mssql') {
    return {
      type: 'mssql',
      mssql: input.credentials
    };
  }

  if (input.db === 'mysql') {
    return {
      type: 'mysql',
      mysql: input.credentials
    };
  }

  return {
    type: 'sqlite',
    sqlite: input.credentials
  };
}

export function parseTokenConnectionInput(entry: unknown): TokenConnectionInput | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidate = entry as { name?: unknown; db?: unknown; credentials?: unknown };
  if (typeof candidate.name !== 'string' || typeof candidate.db !== 'string' || !candidate.credentials || typeof candidate.credentials !== 'object') {
    return null;
  }

  if (candidate.db === 'postgres') {
    const credentials = candidate.credentials as Record<string, unknown>;
    if (
      typeof credentials.host === 'string' &&
      typeof credentials.port === 'number' &&
      typeof credentials.username === 'string' &&
      typeof credentials.password === 'string' &&
      typeof credentials.database === 'string'
    ) {
      return {
        name: candidate.name,
        label: typeof (candidate as { label?: unknown }).label === 'string' ? (candidate as { label: string }).label : undefined,
        isDefault: typeof (candidate as { isDefault?: unknown }).isDefault === 'boolean' ? (candidate as { isDefault: boolean }).isDefault : undefined,
        db: 'postgres',
        credentials: {
          host: credentials.host,
          port: credentials.port,
          username: credentials.username,
          password: credentials.password,
          database: credentials.database
        }
      };
    }
  }

  if (candidate.db === 'mssql') {
    const credentials = candidate.credentials as Record<string, unknown>;
    if (
      typeof credentials.server === 'string' &&
      typeof credentials.username === 'string' &&
      typeof credentials.password === 'string' &&
      typeof credentials.database === 'string' &&
      (credentials.port === undefined || typeof credentials.port === 'number')
    ) {
      return {
        name: candidate.name,
        label: typeof (candidate as { label?: unknown }).label === 'string' ? (candidate as { label: string }).label : undefined,
        isDefault: typeof (candidate as { isDefault?: unknown }).isDefault === 'boolean' ? (candidate as { isDefault: boolean }).isDefault : undefined,
        db: 'mssql',
        credentials: {
          server: credentials.server,
          username: credentials.username,
          password: credentials.password,
          database: credentials.database,
          ...(typeof credentials.port === 'number' ? { port: credentials.port } : {})
        }
      };
    }
  }

  if (candidate.db === 'mysql') {
    const credentials = candidate.credentials as Record<string, unknown>;
    if (
      typeof credentials.host === 'string' &&
      typeof credentials.port === 'number' &&
      typeof credentials.username === 'string' &&
      typeof credentials.password === 'string' &&
      typeof credentials.database === 'string'
    ) {
      return {
        name: candidate.name,
        label: typeof (candidate as { label?: unknown }).label === 'string' ? (candidate as { label: string }).label : undefined,
        isDefault: typeof (candidate as { isDefault?: unknown }).isDefault === 'boolean' ? (candidate as { isDefault: boolean }).isDefault : undefined,
        db: 'mysql',
        credentials: {
          host: credentials.host,
          port: credentials.port,
          username: credentials.username,
          password: credentials.password,
          database: credentials.database
        }
      };
    }
  }

  if (candidate.db === 'sqlite') {
    const credentials = candidate.credentials as Record<string, unknown>;
    if (typeof credentials.filePath === 'string') {
      return {
        name: candidate.name,
        label: typeof (candidate as { label?: unknown }).label === 'string' ? (candidate as { label: string }).label : undefined,
        isDefault: typeof (candidate as { isDefault?: unknown }).isDefault === 'boolean' ? (candidate as { isDefault: boolean }).isDefault : undefined,
        db: 'sqlite',
        credentials: {
          filePath: credentials.filePath
        }
      };
    }
  }

  return null;
}
