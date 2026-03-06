/**
 * Returns today's date in YYYY-MM-DD format using the USER'S local timezone.
 * Never use new Date().toISOString() for log_date — that returns UTC.
 *
 * Examples:
 *   User in PST logs at 11:00pm → returns "2026-03-06" (correct local date)
 *   new Date().toISOString()    → returns "2026-03-07T07:00:00Z" (wrong)
 */
export function getLocalDateString(): string {
  return new Date().toLocaleDateString("en-CA");
  // en-CA locale always formats as YYYY-MM-DD regardless of device locale
}

/**
 * Returns a specific Date object formatted as YYYY-MM-DD in local time.
 */
export function toLocalDateString(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

/**
 * Returns the user's current UTC offset as a string for logging/debugging.
 * Example: "UTC-7" for PDT, "UTC-8" for PST
 */
export function getUserTimezoneLabel(): string {
  const offsetMinutes = new Date().getTimezoneOffset();
  const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
  const offsetMins = Math.abs(offsetMinutes % 60);
  const sign = offsetMinutes <= 0 ? "+" : "-";
  return offsetMins > 0
    ? `UTC${sign}${offsetHours}:${String(offsetMins).padStart(2, "0")}`
    : `UTC${sign}${offsetHours}`;
}

/**
 * Returns the user's IANA timezone string from their browser.
 * Example: "America/Vancouver", "America/Toronto", "Europe/London"
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Vancouver";
  }
}
