/**
 * Runtimes are typed by hand ("6m", "1hr 47m", "2hr"), so parsing them is a
 * boundary that has to cope with whatever a person wrote. Everything here is
 * pure and unit-tested.
 */

const HOURS = /(\d+)\s*(?:hr|hour|h)\b/i;
const MINUTES = /(\d+)\s*(?:min|mins|m)\b/i;

/** Minutes in a written runtime. Returns 0 when nothing can be read out of it. */
export function toMinutes(runtime: string): number {
  const hours = HOURS.exec(runtime);
  const minutes = MINUTES.exec(runtime);
  if (!hours && !minutes) return 0;
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
}

/** "8h 12m" · "47m" · "3h". The inverse shape of what people type. */
export function formatMinutes(total: number): string {
  const safe = Math.max(0, Math.round(total));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function totalMinutes(runtimes: readonly string[]): number {
  return runtimes.reduce((sum, runtime) => sum + toMinutes(runtime), 0);
}
