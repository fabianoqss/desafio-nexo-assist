import { TZDate } from '@date-fns/tz';
import { addDays, isWeekend } from 'date-fns';

import { DOMAIN_TIMEZONE } from './timezone.ts';

export const BUSINESS_OPENING_HOUR = 8;
export const BUSINESS_CLOSING_HOUR = 18;

const MILLISECONDS_PER_HOUR = 3_600_000;

function atHour(date: TZDate, hour: number): TZDate {
  const result = new TZDate(date, DOMAIN_TIMEZONE);
  result.setHours(hour, 0, 0, 0);
  return result;
}

function nextBusinessDayOpening(date: TZDate): TZDate {
  let next = addDays(atHour(date, BUSINESS_OPENING_HOUR), 1);
  while (isWeekend(next)) {
    next = addDays(next, 1);
  }
  return next;
}

function moveIntoBusinessHours(date: TZDate): TZDate {
  if (isWeekend(date)) {
    return nextBusinessDayOpening(date);
  }
  const opening = atHour(date, BUSINESS_OPENING_HOUR);
  if (date < opening) {
    return opening;
  }
  if (date >= atHour(date, BUSINESS_CLOSING_HOUR)) {
    return nextBusinessDayOpening(date);
  }
  return date;
}

function millisecondsUntilClosing(date: TZDate): number {
  return atHour(date, BUSINESS_CLOSING_HOUR).getTime() - date.getTime();
}

export function addBusinessHours(from: Date, hours: number): Date {
  if (!Number.isFinite(hours) || hours < 0) {
    throw new RangeError(`hours must be a finite, non-negative number, got ${String(hours)}`);
  }

  let cursor = moveIntoBusinessHours(new TZDate(from, DOMAIN_TIMEZONE));
  let remaining = hours * MILLISECONDS_PER_HOUR;
  let availableToday = millisecondsUntilClosing(cursor);

  while (remaining > availableToday) {
    remaining -= availableToday;
    cursor = nextBusinessDayOpening(cursor);
    availableToday = millisecondsUntilClosing(cursor);
  }

  return new Date(cursor.getTime() + remaining);
}
