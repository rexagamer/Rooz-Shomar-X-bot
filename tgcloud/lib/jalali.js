// Jalali calendar utilities. Pure JS, no dependencies.
//
// Leap rule: 33-year arithmetic cycle, leap if (25*y + 11) % 33 < 8.
// Conversion: integer UTC day numbers relative to a fixed anchor
// (1404/01/01 === 2025-03-21). No floating-point year-length math.
// Supported range: 1300..1500 (see SUPPORTED_YEAR_*).

export const DEFAULT_TIME_ZONE = 'Asia/Tehran';
export const SUPPORTED_YEAR_MIN = 1300;
export const SUPPORTED_YEAR_MAX = 1500;

export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

const MS_PER_DAY = 86400000;
const ANCHOR_YEAR = 1404;
const ANCHOR_DAY_NUMBER = Date.UTC(2025, 2, 21) / MS_PER_DAY;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

// ---------- digits ----------

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits -> ASCII digits. */
export function normalizeDigits(input) {
  return String(input).replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (c) => {
    const code = c.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function toPersianDigits(input) {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

// ---------- calendar rules ----------

export function isJalaliLeapYear(year) {
  return Number.isInteger(year) && (25 * year + 11) % 33 < 8;
}

export function getDaysInJalaliMonth(year, month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Invalid Jalali month');
  }
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeapYear(year) ? 30 : 29;
}

export function isValidJalaliDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) return false;
  if (year < SUPPORTED_YEAR_MIN || year > SUPPORTED_YEAR_MAX) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= getDaysInJalaliMonth(year, month);
}

const daysInYear = (year) => (isJalaliLeapYear(year) ? 366 : 365);

// Days in the year before the first day of `month`.
const daysBeforeMonth = (month) =>
  month <= 7 ? (month - 1) * 31 : 186 + (month - 7) * 30;

// ---------- day-number conversion (internal) ----------

function jalaliToDayNumber(year, month, day) {
  let n = ANCHOR_DAY_NUMBER;
  if (year >= ANCHOR_YEAR) {
    for (let y = ANCHOR_YEAR; y < year; y += 1) n += daysInYear(y);
  } else {
    for (let y = year; y < ANCHOR_YEAR; y += 1) n -= daysInYear(y);
  }
  return n + daysBeforeMonth(month) + (day - 1);
}

function dayNumberToJalali(dayNumber) {
  let year = ANCHOR_YEAR;
  let yearStart = ANCHOR_DAY_NUMBER;
  while (dayNumber < yearStart) {
    year -= 1;
    yearStart -= daysInYear(year);
    if (year < SUPPORTED_YEAR_MIN - 1) throw new RangeError('Date out of supported range');
  }
  while (dayNumber >= yearStart + daysInYear(year)) {
    yearStart += daysInYear(year);
    year += 1;
    if (year > SUPPORTED_YEAR_MAX + 1) throw new RangeError('Date out of supported range');
  }
  let remaining = dayNumber - yearStart;
  for (let month = 1; month <= 12; month += 1) {
    const length = getDaysInJalaliMonth(year, month);
    if (remaining < length) return { year, month, day: remaining + 1 };
    remaining -= length;
  }
  throw new Error('Unreachable');
}

function gregorianToDayNumber(year, month, day) {
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    !Number.isInteger(year) || year < 1000 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError('Invalid Gregorian date');
  }
  return ms / MS_PER_DAY;
}

function dayNumberToGregorian(dayNumber) {
  const d = new Date(dayNumber * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// ---------- public conversions ----------

/** @returns {{year:number, month:number, day:number}} Gregorian date */
export function jalaliToGregorian(year, month, day) {
  if (!isValidJalaliDate(year, month, day)) throw new RangeError('Invalid Jalali date');
  return dayNumberToGregorian(jalaliToDayNumber(year, month, day));
}

/** @returns {{year:number, month:number, day:number}} Jalali date */
export function gregorianToJalali(year, month, day) {
  const result = dayNumberToJalali(gregorianToDayNumber(year, month, day));
  if (result.year < SUPPORTED_YEAR_MIN || result.year > SUPPORTED_YEAR_MAX) {
    throw new RangeError('Date out of supported range');
  }
  return result;
}

// ---------- ISO helpers ----------

const pad = (n, width) => String(n).padStart(width, '0');

export function toIsoDate({ year, month, day }) {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function parseIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) throw new RangeError('Invalid ISO date');
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Canonical Gregorian ISO string ("2025-06-05") for a Jalali date. */
export function jalaliToIsoGregorian(year, month, day) {
  return toIsoDate(jalaliToGregorian(year, month, day));
}

// ---------- today / differences ----------

/** Gregorian calendar date "now" in the given IANA time zone. */
export function getGregorianDateInTimeZone(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const pick = (type) => Number(parts.find((p) => p.type === type).value);
    return { year: pick('year'), month: pick('month'), day: pick('day') };
  } catch (error) {
    // Iran has had a fixed UTC+03:30 offset since 2022.
    if (timeZone !== DEFAULT_TIME_ZONE) throw error;
    return dayNumberToGregorian(Math.floor((now.getTime() + 210 * 60000) / MS_PER_DAY));
  }
}

export function getCurrentJalaliDate(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
  const g = getGregorianDateInTimeZone(timeZone, now);
  return { ...gregorianToJalali(g.year, g.month, g.day), gregorianDate: toIsoDate(g) };
}

/**
 * Whole calendar days from dateA to dateB (dateB - dateA).
 * Both are Gregorian "YYYY-MM-DD" strings.
 * getDayDifference(entryIso, todayIso) > 0 means the entry is in the past.
 */
export function getDayDifference(dateA, dateB) {
  const a = parseIsoDate(dateA);
  const b = parseIsoDate(dateB);
  return gregorianToDayNumber(b.year, b.month, b.day) - gregorianToDayNumber(a.year, a.month, a.day);
}

// ---------- calendar-aware duration ----------

/**
 * Clamp a day to the valid range for the given Jalali year/month.
 * E.g. day 31 in month 7 (which has 30 days) -> 30.
 */
function clampDay(year, month, day) {
  const max = getDaysInJalaliMonth(year, month);
  return day > max ? max : day;
}

/**
 * Calendar-aware Jalali duration between two Jalali dates.
 * Always returns non-negative years, months, days.
 *
 * Rule: we advance from the earlier date toward the later date by
 * whole years, then whole months, then remaining days.
 * When adding a year or month would produce an invalid day (e.g. 31st
 * in a 30-day month), we clamp to the last valid day of the target month.
 *
 * @param {{year,month,day}} fromJ  Jalali date (the earlier or later)
 * @param {{year,month,day}} toJ    Jalali date
 * @returns {{ years:number, months:number, days:number, totalDays:number, past:boolean }}
 *   `past` is true when `from` is chronologically before `to` (the event is in the past).
 */
export function getJalaliDuration(fromJ, toJ) {
  const fromDN = jalaliToDayNumber(fromJ.year, fromJ.month, fromJ.day);
  const toDN = jalaliToDayNumber(toJ.year, toJ.month, toJ.day);
  const totalDays = Math.abs(toDN - fromDN);

  if (totalDays === 0) {
    return { years: 0, months: 0, days: 0, totalDays: 0, past: false };
  }

  // Ensure start <= end for the calculation
  let start, end;
  let past;
  if (fromDN <= toDN) {
    start = { ...fromJ };
    end = { ...toJ };
    past = true; // from is before to, i.e. the event date is in the past relative to "to"
  } else {
    start = { ...toJ };
    end = { ...fromJ };
    past = false; // from is after to, i.e. the event is in the future
  }

  // Step 1: count full years
  let years = 0;
  {
    let testYear = start.year + 1;
    let testMonth = start.month;
    let testDay = clampDay(testYear, testMonth, start.day);
    while (true) {
      const dn = jalaliToDayNumber(testYear, testMonth, testDay);
      if (dn > jalaliToDayNumber(end.year, end.month, end.day)) break;
      years += 1;
      testYear += 1;
      testDay = clampDay(testYear, testMonth, start.day);
    }
  }

  // Advance the cursor by `years` years from start
  let curYear = start.year + years;
  let curMonth = start.month;
  let curDay = clampDay(curYear, curMonth, start.day);

  // Step 2: count full months
  let months = 0;
  {
    while (true) {
      let nextMonth = curMonth + 1;
      let nextYear = curYear;
      if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
      const nextDay = clampDay(nextYear, nextMonth, start.day);
      const dn = jalaliToDayNumber(nextYear, nextMonth, nextDay);
      if (dn > jalaliToDayNumber(end.year, end.month, end.day)) break;
      months += 1;
      curYear = nextYear;
      curMonth = nextMonth;
      curDay = nextDay;
    }
  }

  // Step 3: remaining days
  const curDN = jalaliToDayNumber(curYear, curMonth, curDay);
  const endDN = jalaliToDayNumber(end.year, end.month, end.day);
  const days = endDN - curDN;

  return { years, months, days, totalDays, past };
}

/**
 * Format a Jalali duration as a human-readable Persian string.
 * @param {{ years:number, months:number, days:number, totalDays:number, past:boolean }} duration
 * @param {'past'|'future'|'auto'} direction — 'auto' uses duration.past
 * @param {{ showTotal?: boolean }} options
 * @returns {string}
 */
export function formatJalaliDuration(duration, direction = 'auto', { showTotal = false } = {}) {
  const { years, months, days, totalDays, past } = duration;

  if (totalDays === 0) return 'امروز این تاریخه! 🎉';

  const dir = direction === 'auto' ? (past ? 'past' : 'future') : direction;
  const suffix = dir === 'past' ? 'گذشته' : 'باقی‌مونده';

  const parts = [];
  if (years > 0) parts.push(`${toPersianDigits(years)} سال`);
  if (months > 0) parts.push(`${toPersianDigits(months)} ماه`);
  if (days > 0) parts.push(`${toPersianDigits(days)} روز`);

  // Edge case: if parts is empty but totalDays > 0, use totalDays
  if (parts.length === 0) parts.push(`${toPersianDigits(totalDays)} روز`);

  let result = parts.join(' و ') + ' ' + suffix;

  if (showTotal && totalDays > 0 && (years > 0 || months > 0)) {
    result += ` (${toPersianDigits(totalDays)} روز)`;
  }

  return result;
}

// ---------- formatting ----------

export function formatJalaliDate(year, month, day) {
  return `${toPersianDigits(day)} ${JALALI_MONTH_NAMES[month - 1]} ${toPersianDigits(year)}`;
}

/** @param {number} diff days elapsed since the date (negative = future) */
export function describeDayDifference(diff) {
  if (diff > 0) return `${toPersianDigits(diff)} روز گذشته`;
  if (diff === 0) return 'امروز این تاریخه! 🎉';
  return `${toPersianDigits(-diff)} روز باقی‌مونده`;
}