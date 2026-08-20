import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const cleaned = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = cleaned.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = cleaned.slice(0, separator).trim();
    let value = cleaned.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

function resolveProjectRoot(fromDir: string): string {
  const candidates = [
    fromDir,
    path.resolve(fromDir, '..'),
    path.resolve(fromDir, '..', '..'),
    process.cwd()
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  return process.cwd();
}

export function loadLocalEnv(fromUrl = import.meta.url): string {
  const here = path.dirname(fileURLToPath(fromUrl));
  const projectRoot = resolveProjectRoot(here);

  for (const name of ['.env', '.env.local']) {
    const filePath = path.join(projectRoot, name);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  return projectRoot;
}
