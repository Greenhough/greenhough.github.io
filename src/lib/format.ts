/**
 * Dates are stored as plain YYYY-MM-DD in frontmatter and always displayed as
 * "Mon YYYY" (e.g. "Jun 2026"). UTC is forced so the month never shifts by a day
 * depending on where the build runs.
 */
export function monthYear(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
