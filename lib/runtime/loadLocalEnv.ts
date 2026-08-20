import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEnvFile, shouldReplaceEnvValue } from './parseEnvFile';

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
      if (shouldReplaceEnvValue(process.env[key], value)) {
        process.env[key] = value;
      }
    }
  }

  return projectRoot;
}
