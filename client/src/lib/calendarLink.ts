/**
 * calendarLink — generate Google Calendar, Outlook web, and RFC 5545 .ics
 * download URLs from a single normalized event input.
 *
 * All times are emitted in UTC ("Z" suffix) so calendar clients can localize
 * them correctly. Default duration is 120 minutes when not specified.
 */

export type CalendarEventInput = {
  title: string;
  description?: string;
  /** Unix epoch milliseconds */
  eventDate: number;
  /** Defaults to 120 if omitted */
  durationMinutes?: number;
  location?: string;
};

const DEFAULT_DURATION_MIN = 120;

/** YYYYMMDDTHHMMSSZ — the basic-format UTC timestamp used by Google + .ics */
function toBasicUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** YYYY-MM-DDTHH:mm:ssZ — Outlook web wants ISO-extended */
function toIsoExtendedUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function endDate(e: CalendarEventInput): Date {
  const start = new Date(e.eventDate);
  const mins = e.durationMinutes && e.durationMinutes > 0 ? e.durationMinutes : DEFAULT_DURATION_MIN;
  return new Date(start.getTime() + mins * 60_000);
}

export function googleCalendarUrl(e: CalendarEventInput): string {
  const start = toBasicUtc(new Date(e.eventDate));
  const end = toBasicUtc(endDate(e));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${start}/${end}`,
  });
  if (e.description) params.set("details", e.description);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(e: CalendarEventInput): string {
  const start = toIsoExtendedUtc(new Date(e.eventDate));
  const end = toIsoExtendedUtc(endDate(e));
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: start,
    enddt: end,
  });
  if (e.description) params.set("body", e.description);
  if (e.location) params.set("location", e.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** RFC 5545 line-folding: hard-wrap >75-octet lines, continuation = CRLF + space */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + 75);
    out.push(chunk);
    i += 75;
  }
  return out.join("\r\n ");
}

/** Escape per RFC 5545 §3.3.11 */
function escIcs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildIcs(e: CalendarEventInput): string {
  const start = toBasicUtc(new Date(e.eventDate));
  const end = toBasicUtc(endDate(e));
  const dtStamp = toBasicUtc(new Date());
  const uid = `${e.eventDate}-${Math.random().toString(36).slice(2, 10)}@ivari`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IVARI//Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escIcs(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escIcs(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escIcs(e.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n");
}

export function icsDataUrl(e: CalendarEventInput): string {
  const ics = buildIcs(e);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
