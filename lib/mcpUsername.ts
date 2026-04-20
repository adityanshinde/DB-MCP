/** Public handle: 3–32 chars, start with letter, then letters/digits/_/- — stored lowercase */
export function normalizeMcpUsername(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(s)) {
    return null;
  }

  return s;
}
