/**
 * `YYYY-MM-DD HH:mm` in UTC for a version row.
 *
 * Deliberately not Intl.DateTimeFormat: a month name depends on the CLDR data
 * baked into the runtime ("Sep" vs "Sept" across Node versions), and the local
 * timezone would make a snapshot look like it was written on another day than
 * the one the server recorded.
 */
export function formatVersionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace("T", " ");
}
