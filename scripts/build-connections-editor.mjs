import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const generatePath = path.join(root, 'app/(site)/generate/page.tsx');
const lines = fs.readFileSync(generatePath, 'utf8').split(/\r?\n/);
const inner = lines.slice(895, 1424).join('\n');

const header = `'use client';

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
`;

const replaced = inner.replace(
  /\{index === 0 \? <span className="badge-default">default<\/span> : null\}/g,
  '{isDefaultRow(props, index, conn) ? <span className="badge-default">default</span> : null}'
);

const footer = `
    </>
  );
}
`;

const out = `${header}${replaced}${footer}`;
const outPath = path.join(root, 'components/workspace/ConnectionsEditor.tsx');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', outPath, out.length);
