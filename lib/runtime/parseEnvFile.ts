export function isParseableJson(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isParseableJsonValue(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

export function shouldReplaceEnvValue(existing: string | undefined, next: string): boolean {
  if (existing === undefined) {
    return true;
  }

  if (existing === next) {
    return false;
  }

  return isParseableJsonValue(next) && !isParseableJsonValue(existing);
}

function isBalancedJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (const character of text) {
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (character === '\\') {
        escaping = true;
        continue;
      }
      if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{' || character === '[') {
      depth += 1;
    } else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }

  return depth === 0 && !inString;
}

function isCompleteJsonValue(text: string): boolean {
  return isBalancedJson(text) && isParseableJson(text);
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const cleaned = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separator = cleaned.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = cleaned.slice(0, separator).trim();
    if (!key) {
      continue;
    }

    let value = cleaned.slice(separator + 1).trim();
    if (value.startsWith('{') || value.startsWith('[')) {
      const collected = [value];
      while (!isCompleteJsonValue(collected.join('\n')) && index + 1 < lines.length) {
        index += 1;
        collected.push(lines[index]);
      }
      value = collected.join('\n').trim();
    } else {
      value = stripWrappingQuotes(value);
    }

    result[key] = value;
  }

  return result;
}
