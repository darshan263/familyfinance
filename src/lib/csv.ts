/**
 * CSV for the export. Excel, Sheets and Numbers all read it; the workbook export is the
 * better file, and this is for anything else that wants plain rows.
 */

/**
 * One field. Quoted when it holds a comma, quote or line break. Text that starts like a
 * formula gets a leading apostrophe: spreadsheets execute cells starting `=`, `+`, `-` or
 * `@`, and some also treat a leading tab or carriage return as the start of one. A description
 * is something anyone could have typed. Numbers are written as numbers, so a negative amount
 * stays a negative amount.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
