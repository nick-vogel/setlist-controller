// The set's date when the command is given none: today when today is Sunday, otherwise the coming Sunday, as
// YYYY-MM-DD on the local calendar. The Sunday is built from the date's parts, never by adding milliseconds, so a
// daylight-saving change cannot move it to another day.
export function defaultSetDate(today: Date): string {
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((7 - today.getDay()) % 7));
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
}
