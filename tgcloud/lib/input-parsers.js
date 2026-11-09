import { normalizeDigits, JALALI_MONTH_NAMES } from './jalali.js';

/** "۱۴۰۴" / "١٤٠٤" / "1404" -> 1404; anything else -> null. */
export function parseIntegerInput(text) {
  const normalized = normalizeDigits(String(text ?? '')).trim();
  if (!/^\d{1,6}$/.test(normalized)) return null;
  return Number(normalized);
}

const canonical = (s) =>
  s.replace(/\u064A/g, '\u06CC') // Arabic yeh -> Persian yeh
    .replace(/\u0643/g, '\u06A9') // Arabic kaf -> Persian kaf
    .replace(/[\s\u200c]/g, '');

const MONTH_BY_NAME = new Map(JALALI_MONTH_NAMES.map((n, i) => [canonical(n), i + 1]));

/** Month number (1-12) from digits or a Persian month name; otherwise null. */
export function parseMonthInput(text) {
  const n = parseIntegerInput(text);
  if (n !== null) return n >= 1 && n <= 12 ? n : null;
  return MONTH_BY_NAME.get(canonical(String(text ?? '').trim())) ?? null;
}

export const MAX_TITLE_LENGTH = 80;

/** Trimmed, whitespace-collapsed title; null if empty or too long. */
export function parseTitleInput(text) {
  const title = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (title.length === 0 || [...title].length > MAX_TITLE_LENGTH) return null;
  return title;
}

/** Key used for duplicate detection (same title + same date). */
export function normalizeTitleKey(title) {
  return canonical(normalizeDigits(String(title))).toLowerCase();
}
