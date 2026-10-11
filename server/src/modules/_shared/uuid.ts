const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical uuid string; anything else cannot name a row. */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}
