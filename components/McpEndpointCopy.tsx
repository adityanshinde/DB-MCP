'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function McpEndpointCopy() {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const url = origin ? `${origin}/api/mcp` : '/api/mcp';

  const onCopy = useCallback(async () => {
    if (!origin) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [origin, url]);

  return (
    <div className="mcp-endpoint-pill" title="Model Context Protocol JSON-RPC endpoint">
      <span className="mcp-endpoint-pill__label">MCP</span>
      <code className="mcp-endpoint-pill__url">{url}</code>
      <button type="button" className="mcp-endpoint-pill__copy" onClick={onCopy} disabled={!origin}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
