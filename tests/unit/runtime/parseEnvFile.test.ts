import { describe, expect, it } from 'vitest';

import {
  isParseableJsonValue,
  parseEnvFile,
  shouldReplaceEnvValue
} from '@/lib/runtime/parseEnvFile';

describe('parseEnvFile', () => {
  it('collects multiline JSON and does not split on search_path=', () => {
    const parsed = parseEnvFile(`
POSTGRES_DEFAULT=PROD.Main.app
GITHUB_PAT=token
POSTGRES_URLS={
  "UAT": {
    "Main": {
      "app": "postgresql://user:pass@127.0.0.1:5432/app?search_path=dbo,master"
    }
  }
}
MSSQL_DEFAULT=main
`);

    expect(parsed.POSTGRES_DEFAULT).toBe('PROD.Main.app');
    expect(parsed.GITHUB_PAT).toBe('token');
    expect(parsed.MSSQL_DEFAULT).toBe('main');
    expect(JSON.parse(parsed.POSTGRES_URLS)).toEqual({
      UAT: {
        Main: {
          app: 'postgresql://user:pass@127.0.0.1:5432/app?search_path=dbo,master'
        }
      }
    });
    expect(Object.keys(parsed)).toEqual([
      'POSTGRES_DEFAULT',
      'GITHUB_PAT',
      'POSTGRES_URLS',
      'MSSQL_DEFAULT'
    ]);
  });

  it('keeps one-line JSON objects intact', () => {
    const parsed = parseEnvFile('POSTGRES_URLS={"main":"postgresql://localhost/app"}\nFOO=bar');
    expect(JSON.parse(parsed.POSTGRES_URLS)).toEqual({ main: 'postgresql://localhost/app' });
    expect(parsed.FOO).toBe('bar');
  });
});

describe('shouldReplaceEnvValue', () => {
  it('fills missing keys and replaces truncated JSON', () => {
    expect(shouldReplaceEnvValue(undefined, '{"a":1}')).toBe(true);
    expect(shouldReplaceEnvValue('{', '{"a":1}')).toBe(true);
    expect(shouldReplaceEnvValue('{"a":1}', '{"b":2}')).toBe(false);
    expect(isParseableJsonValue('{')).toBe(false);
  });
});
