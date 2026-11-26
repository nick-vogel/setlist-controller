// The hour and minute of a time on the server's wall clock, in the page's time zone and locale, as the
// Devices panel's last-seen time and the producer's active messages show it.
export function clockTime(time: number): string {
  return new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
