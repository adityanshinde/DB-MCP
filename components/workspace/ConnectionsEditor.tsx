'use client';

import { useEffect, useRef, useState } from 'react';

import type { ConnectionPreflightResult } from '@/lib/credentials/testConnection';
import { parseTokenConnectionInput } from '@/lib/credentials/tokenConnection';
import { ConnectionHints, type ConnectionPreflight } from '@/components/workspace/ConnectionHints';
import {
  buildConnectionPayload,
  createConnectionRow,
  fallbackConnectionName,
  prepareConnectionForPayload,
  type ConnectionDraft,
  type DbType
} from '@/lib/site/connectionDraft';

export type ConnectionsEditorProps = {
  connections: ConnectionDraft[];
  setConnections: React.Dispatch<React.SetStateAction<ConnectionDraft[]>>;
  advancedOpen: boolean;
  defaultBadgeMode: 'first-row' | 'named-default';
  /** When defaultBadgeMode is named-default, which connection alias is the MCP default */
  defaultConnectionName?: string;
};

function isDefaultRow(props: ConnectionsEditorProps, index: number, conn: ConnectionDraft): boolean {
  if (props.defaultBadgeMode === 'first-row') return index === 0;
  const n = conn.name.trim();
  const d = (props.defaultConnectionName || '').trim();
  return Boolean(d && n === d);
}

export function ConnectionsEditor(props: ConnectionsEditorProps) {
  const { connections, setConnections, advancedOpen, defaultBadgeMode, defaultConnectionName } = props;
  const [preflightById, setPreflightById] = useState<Record<string, ConnectionPreflight>>({});
  const preflightGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++preflightGenerationRef.current;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      async function runPreflight(conn: ConnectionDraft, index: number): Promise<void> {
        const prepared = prepareConnectionForPayload(conn);
        const named = { ...prepared, name: fallbackConnectionName(prepared, index) };
        const connection = buildConnectionPayload(named, isDefaultRow(props, index, conn));
        if (!parseTokenConnectionInput(connection)) {
          if (preflightGenerationRef.current !== generation) return;
          setPreflightById((prev) => ({ ...prev, [conn.id]: { kind: 'idle' } }));
          return;
        }
        if (preflightGenerationRef.current !== generation) return;
        setPreflightById((prev) => ({ ...prev, [conn.id]: { kind: 'loading' } }));
        try {
          const response = await fetch('/api/credentials/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection }),
            signal: controller.signal
          });
          const json = (await response.json()) as {
            success: boolean;
            error?: string;
            data?: ConnectionPreflightResult;
          };
          const payload = json.data;
          if (preflightGenerationRef.current !== generation) return;
          if (!response.ok || !json.success || !payload) {
            throw new Error(json.error || 'Preflight request failed.');
          }
          setPreflightById((prev) => ({ ...prev, [conn.id]: { kind: 'done', data: payload } }));
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (preflightGenerationRef.current !== generation) return;
          setPreflightById((prev) => ({
            ...prev,
            [conn.id]: {
              kind: 'error',
              message: error instanceof Error ? error.message : 'Preflight failed.'
            }
          }));
        }
      }
      void Promise.all(connections.map((conn, index) => runPreflight(conn, index)));
    }, 900);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [connections, defaultBadgeMode, defaultConnectionName]);

  return (
    <>
            {connections.map((conn, index) => (
              <div key={conn.id} className="connection-block">
                <div className="connection-block__head">
                  <p className="connection-block__title">
                    Connection {index + 1}
                    {isDefaultRow(props, index, conn) ? <span className="badge-default">default</span> : null}
                  </p>
                  {connections.length > 1 ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setConnections((rows) => rows.filter((row) => row.id !== conn.id))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <label className="field">
                  <span>Connection alias</span>
                  <input
                    value={conn.name}
                    onChange={(event) =>
                      setConnections((rows) =>
                        rows.map((row) => (row.id === conn.id ? { ...row, name: event.target.value } : row))
                      )
                    }
                    placeholder={index === 0 ? 'main_db' : `reporting_${index + 1}`}
                  />
                </label>

                <label className="field">
                  <span>Database type</span>
                  <select
                    value={conn.db}
                    onChange={(event) =>
                      setConnections((rows) =>
                        rows.map((row) =>
                          row.id === conn.id ? { ...row, db: event.target.value as DbType } : row
                        )
                      )
                    }
                  >
                    <option value="postgres">PostgreSQL</option>
                    <option value="mssql">SQL Server</option>
                    <option value="mysql">MySQL</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                </label>

                {conn.db !== 'sqlite' ? (
                  <div className="structured-fields-toggle">
                    <button
                      className="ghost-button ghost-button--sm"
                      type="button"
                      onClick={() =>
                        setConnections((rows) =>
                          rows.map((row) =>
                            row.id === conn.id ? { ...row, manualDbFieldsOpen: !row.manualDbFieldsOpen } : row
                          )
                        )
                      }
                    >
                      {conn.manualDbFieldsOpen ? 'Hide structured fields' : 'Structured fields (host, port, user…)'}
                    </button>
                    <span className="field-hint structured-fields-toggle__hint">
                      Optional when you prefer fields over a single URL or connection string.
                    </span>
                  </div>
                ) : null}

                {conn.db === 'postgres' ? (
                  <label className="field">
                    <span>Postgres connection string</span>
                    <input
                      value={conn.postgres.url}
                      onChange={(event) =>
                        setConnections((rows) =>
                          rows.map((row) =>
                            row.id === conn.id
                              ? {
                                  ...row,
                                  postgres: {
                                    ...row.postgres,
                                    url: event.target.value
                                  }
                                }
                              : row
                          )
                        )
                      }
                      placeholder="postgresql://user:pass@host:5432/dbname?sslmode=require"
                    />
                  </label>
                ) : null}

                {conn.db === 'mssql' ? (
                  <>
                    <label className="field">
                      <span>SQL Server connection string</span>
                      <textarea
                        className="json-input github-textarea github-textarea--compact"
                        rows={4}
                        value={conn.mssql.connectionString}
                        onChange={(event) =>
                          setConnections((rows) =>
                            rows.map((row) =>
                              row.id === conn.id
                                ? {
                                    ...row,
                                    mssql: {
                                      ...row.mssql,
                                      connectionString: event.target.value
                                    }
                                  }
                                : row
                            )
                          )
                        }
                        placeholder="Server=tcp:your.database.windows.net,1433;Initial Catalog=mydb;User ID=…;Password=…;Encrypt=True"
                      />
                      <span className="field-hint">Paste the full ADO.NET / ODBC string from Azure or SSMS.</span>
                    </label>

                    {conn.manualDbFieldsOpen || advancedOpen ? (
                      <div className="manual-grid">
                        <label className="field compact">
                          <span>Server</span>
                          <input
                            value={conn.mssql.server}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mssql: {
                                          ...row.mssql,
                                          server: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact">
                          <span>Port</span>
                          <input
                            value={conn.mssql.port}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mssql: {
                                          ...row.mssql,
                                          port: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact">
                          <span>User</span>
                          <input
                            value={conn.mssql.username}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mssql: {
                                          ...row.mssql,
                                          username: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact">
                          <span>Password</span>
                          <input
                            type="password"
                            value={conn.mssql.password}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mssql: {
                                          ...row.mssql,
                                          password: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact wide">
                          <span>Database</span>
                          <input
                            value={conn.mssql.database}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mssql: {
                                          ...row.mssql,
                                          database: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {conn.db === 'mysql' ? (
                  <>
                    <label className="field">
                      <span>MySQL URL</span>
                      <input
                        value={conn.mysql.url}
                        onChange={(event) =>
                          setConnections((rows) =>
                            rows.map((row) =>
                              row.id === conn.id
                                ? {
                                    ...row,
                                    mysql: {
                                      ...row.mysql,
                                      url: event.target.value
                                    }
                                  }
                                : row
                            )
                          )
                        }
                        placeholder="mysql://user:pass@host:3306/dbname"
                      />
                    </label>
                    {conn.manualDbFieldsOpen || advancedOpen ? (
                      <div className="manual-grid">
                        <label className="field compact">
                          <span>Host</span>
                          <input
                            value={conn.mysql.host}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mysql: {
                                          ...row.mysql,
                                          host: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact">
                          <span>Port</span>
                          <input
                            value={conn.mysql.port}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mysql: {
                                          ...row.mysql,
                                          port: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact">
                          <span>User</span>
                          <input
                            value={conn.mysql.username}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mysql: {
                                          ...row.mysql,
                                          username: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact">
                          <span>Password</span>
                          <input
                            type="password"
                            value={conn.mysql.password}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mysql: {
                                          ...row.mysql,
                                          password: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                        <label className="field compact wide">
                          <span>Database</span>
                          <input
                            value={conn.mysql.database}
                            onChange={(event) =>
                              setConnections((rows) =>
                                rows.map((row) =>
                                  row.id === conn.id
                                    ? {
                                        ...row,
                                        mysql: {
                                          ...row.mysql,
                                          database: event.target.value
                                        }
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {conn.db === 'sqlite' ? (
                  <label className="field">
                    <span>SQLite file path (on the server)</span>
                    <input
                      value={conn.sqlite.filePath}
                      onChange={(event) =>
                        setConnections((rows) =>
                          rows.map((row) =>
                            row.id === conn.id
                              ? {
                                  ...row,
                                  sqlite: {
                                    ...row.sqlite,
                                    filePath: event.target.value
                                  }
                                }
                              : row
                          )
                        )
                      }
                      placeholder="/var/data/app.db"
                    />
                  </label>
                ) : null}

                {(conn.manualDbFieldsOpen || advancedOpen) && conn.db === 'postgres' ? (
                  <div className="manual-grid">
                    <label className="field compact">
                      <span>Host</span>
                      <input
                        value={conn.postgres.host}
                        onChange={(event) =>
                          setConnections((rows) =>
                            rows.map((row) =>
                              row.id === conn.id
                                ? {
                                    ...row,
                                    postgres: {
                                      ...row.postgres,
                                      host: event.target.value
                                    }
                                  }
                                : row
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field compact">
                      <span>Port</span>
                      <input
                        value={conn.postgres.port}
                        onChange={(event) =>
                          setConnections((rows) =>
                            rows.map((row) =>
                              row.id === conn.id
                                ? {
                                    ...row,
                                    postgres: {
                                      ...row.postgres,
                                      port: event.target.value
                                    }
                                  }
                                : row
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field compact">
                      <span>User</span>
                      <input
                        value={conn.postgres.username}
                        onChange={(event) =>
                          setConnections((rows) =>
                            rows.map((row) =>
                              row.id === conn.id
                                ? {
                                    ...row,
                                    postgres: {
                                      ...row.postgres,
                                      username: event.target.value
                                    }
                                  }
                                : row
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field compact">
                      <span>Password</span>
                      <input
                        type="password"
                        value={conn.postgres.password}
                        onChange={(event) =>
                          setConnections((rows) =>
                            rows.map((row) =>
                              row.id === conn.id
                                ? {
                                    ...row,
                                    postgres: {
                                      ...row.postgres,
                                      password: event.target.value
                                    }
                                  }
                                : row
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field compact wide">
                      <span>Database</span>
                      <input
                        value={conn.postgres.database}
                        onChange={(event) =>
                          setConnections((rows) =>
                            rows.map((row) =>
                              row.id === conn.id
                                ? {
                                    ...row,
                                    postgres: {
                                      ...row.postgres,
                                      database: event.target.value
                                    }
                                  }
                                : row
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                ) : null}

                <ConnectionHints conn={conn} preflight={preflightById[conn.id] ?? { kind: 'idle' }} />
              </div>
            ))}

            <button
              className="ghost-button add-db-button"
              type="button"
              onClick={() =>
                setConnections((rows) => [
                  ...rows,
                  createConnectionRow({
                    name: `db_${rows.length + 1}`,
                    db: 'postgres'
                  })
                ])
              }
            >
              + Add database
            </button>
    </>
  );
}
