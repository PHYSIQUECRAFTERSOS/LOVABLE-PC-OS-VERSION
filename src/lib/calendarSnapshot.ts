import type { CalendarEvent } from "@/components/calendar/CalendarGrid";

const VERSION = 1;
const KEY_PREFIX = "pc_calendar_snapshot";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_EVENTS = 250;

interface CalendarSnapshot {
  version: number;
  userId: string;
  startDate: string;
  endDate: string;
  writtenAt: number;
  events: CalendarEvent[];
}

const keyFor = (userId: string, startDate: string, endDate: string) =>
  `${KEY_PREFIX}:v${VERSION}:${userId}:${startDate}:${endDate}`;

const isCalendarEvent = (value: unknown): value is CalendarEvent => {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CalendarEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.event_type === "string" &&
    typeof event.event_date === "string" &&
    typeof event.is_completed === "boolean"
  );
};

export function readCalendarSnapshot(
  userId: string | null | undefined,
  startDate: string,
  endDate: string,
): CalendarEvent[] | null {
  if (!userId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyFor(userId, startDate, endDate));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CalendarSnapshot;
    if (
      parsed.version !== VERSION ||
      parsed.userId !== userId ||
      parsed.startDate !== startDate ||
      parsed.endDate !== endDate ||
      !Number.isFinite(parsed.writtenAt) ||
      Date.now() - parsed.writtenAt > MAX_AGE_MS ||
      !Array.isArray(parsed.events) ||
      !parsed.events.every(isCalendarEvent)
    ) {
      return null;
    }
    return parsed.events;
  } catch {
    return null;
  }
}

export function writeCalendarSnapshot(
  userId: string | null | undefined,
  startDate: string,
  endDate: string,
  events: CalendarEvent[],
) {
  if (!userId || typeof localStorage === "undefined" || events.length > MAX_EVENTS) return;
  const snapshot: CalendarSnapshot = {
    version: VERSION,
    userId,
    startDate,
    endDate,
    writtenAt: Date.now(),
    events,
  };
  try {
    localStorage.setItem(keyFor(userId, startDate, endDate), JSON.stringify(snapshot));
  } catch {
    // Display cache only; quota/private-mode failures must never block the calendar.
  }
}