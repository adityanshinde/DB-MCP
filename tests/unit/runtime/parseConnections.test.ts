import { describe, expect, it } from 'vitest';

import {
  parseConnectionJson,
  resolveNamedDefault,
  splitConnectionAlias
} from '@/lib/runtime/parseConnections';

describe('parseConnectionJson', () => {
  it('accepts a flat name-to-url map', () => {
    const parsed = parseConnectionJson('{"main":"postgresql://localhost/main","reporting":"postgresql://localhost/reporting"}');
    expect(parsed.connections).toEqual({
      main: 'postgresql://localhost/main',
      reporting: 'postgresql://localhost/reporting'
    });
    expect(parsed.servers).toEqual({});
  });

  it('flattens a two-level server map', () => {
    const parsed = parseConnectionJson('{"MainServer":{"TICK_LINK_PROD":"postgresql://localhost/tick"}}');
    expect(parsed.connections).toEqual({
      'MainServer.TICK_LINK_PROD': 'postgresql://localhost/tick'
    });
    expect(parsed.servers).toEqual({
      MainServer: { TICK_LINK_PROD: 'postgresql://localhost/tick' }
    });
  });

  it('flattens a three-level env.server.database map', () => {
    const parsed = parseConnectionJson(`{
      "UAT": {
        "Main Replica": {
          "TICK_FROMKG": "postgresql://localhost/tick"
        }
      },
      "PROD": {
        "Main": {
          "TICK_LINK_PROD": "postgresql://localhost/prod"
        }
      }
    }`);

    expect(parsed.connections).toEqual({
      'UAT.Main Replica.TICK_FROMKG': 'postgresql://localhost/tick',
      'PROD.Main.TICK_LINK_PROD': 'postgresql://localhost/prod'
    });
    expect(parsed.servers['UAT.Main Replica']).toEqual({
      TICK_FROMKG: 'postgresql://localhost/tick'
    });
    expect(parsed.servers['PROD.Main']).toEqual({
      TICK_LINK_PROD: 'postgresql://localhost/prod'
    });
  });

  it('returns empty maps for invalid JSON', () => {
    expect(parseConnectionJson('{')).toEqual({ connections: {}, servers: {} });
  });
});

describe('splitConnectionAlias', () => {
  it('splits on the last dot so env.server stays together', () => {
    expect(splitConnectionAlias('PROD.Main.TICK_LINK_PROD')).toEqual({
      server: 'PROD.Main',
      database: 'TICK_LINK_PROD'
    });
    expect(splitConnectionAlias('main')).toEqual({ database: 'main' });
  });
});

describe('resolveNamedDefault', () => {
  it('uses the explicit default when it exists, otherwise the first alias', () => {
    const connections = {
      'UAT.Main.app': 'postgresql://localhost/uat',
      'PROD.Main.app': 'postgresql://localhost/prod'
    };

    expect(resolveNamedDefault(connections, 'PROD.Main.app')).toBe('PROD.Main.app');
    expect(resolveNamedDefault(connections, 'MainServer.TICK_LINK_PROD')).toBe('UAT.Main.app');
    expect(resolveNamedDefault({}, 'missing')).toBe('default');
  });
});
