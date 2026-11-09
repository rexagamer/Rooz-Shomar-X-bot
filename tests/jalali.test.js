// tests/jalali.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidJalaliDate, jalaliToGregorian, gregorianToJalali, isJalaliLeapYear,
  getDaysInJalaliMonth, getCurrentJalaliDate, getDayDifference, formatJalaliDate,
  normalizeDigits, toPersianDigits, describeDayDifference, jalaliToIsoGregorian,
  SUPPORTED_YEAR_MIN, SUPPORTED_YEAR_MAX,
} from '../tgcloud/lib/jalali.js';

const iso = (y, m, d) => jalaliToIsoGregorian(y, m, d);

test('known Nowruz / conversion vectors', () => {
  assert.equal(iso(1403, 1, 1), '2024-03-20');
  assert.equal(iso(1404, 1, 1), '2025-03-21');
  assert.equal(iso(1403, 12, 30), '2025-03-20');
  assert.equal(iso(1404, 3, 15), '2025-06-05');
  assert.equal(iso(1395, 1, 1), '2016-03-20');
  assert.equal(iso(1396, 1, 1), '2017-03-21');
  assert.equal(iso(1397, 1, 1), '2018-03-21');
  assert.equal(iso(1398, 1, 1), '2019-03-21');
  assert.equal(iso(1399, 1, 1), '2020-03-20');
  assert.equal(iso(1400, 1, 1), '2021-03-21');
});

test('gregorianToJalali inverse vectors', () => {
  assert.deepEqual(gregorianToJalali(2024, 3, 20), { year: 1403, month: 1, day: 1 });
  assert.deepEqual(gregorianToJalali(2025, 3, 20), { year: 1403, month: 12, day: 30 });
  assert.deepEqual(gregorianToJalali(2025, 3, 21), { year: 1404, month: 1, day: 1 });
});

test('leap years', () => {
  for (const y of [1395, 1399, 1403, 1408]) assert.equal(isJalaliLeapYear(y), true, String(y));
  for (const y of [1396, 1397, 1398, 1400, 1401, 1402, 1404, 1405, 1406, 1407]) {
    assert.equal(isJalaliLeapYear(y), false, String(y));
  }
});

test('Esfand validity', () => {
  assert.equal(isValidJalaliDate(1403, 12, 30), true);
  assert.equal(isValidJalaliDate(1404, 12, 30), false);
  assert.equal(isValidJalaliDate(1404, 12, 29), true);
});

test('month lengths', () => {
  for (let m = 1; m <= 6; m += 1) assert.equal(getDaysInJalaliMonth(1404, m), 31);
  for (let m = 7; m <= 11; m += 1) assert.equal(getDaysInJalaliMonth(1404, m), 30);
  assert.equal(getDaysInJalaliMonth(1404, 12), 29);
  assert.equal(getDaysInJalaliMonth(1403, 12), 30);
  assert.throws(() => getDaysInJalaliMonth(1404, 13), RangeError);
});

test('invalid input is rejected', () => {
  assert.equal(isValidJalaliDate(1404, 13, 1), false);
  assert.equal(isValidJalaliDate(1404, 0, 1), false);
  assert.equal(isValidJalaliDate(1404, 1, 0), false);
  assert.equal(isValidJalaliDate(1404, 7, 31), false);
  assert.equal(isValidJalaliDate(1404.5, 1, 1), false);
  assert.equal(isValidJalaliDate('1404', 1, 1), false);
  assert.equal(isValidJalaliDate(SUPPORTED_YEAR_MIN - 1, 1, 1), false);
  assert.equal(isValidJalaliDate(SUPPORTED_YEAR_MAX + 1, 1, 1), false);
  assert.throws(() => jalaliToGregorian(1404, 12, 30), RangeError);
  assert.throws(() => gregorianToJalali(2025, 2, 30), RangeError);
});

test('every day in the supported range round-trips and is strictly consecutive', () => {
  let prev = null;
  for (let y = SUPPORTED_YEAR_MIN; y <= SUPPORTED_YEAR_MAX; y += 1) {
    let total = 0;
    for (let m = 1; m <= 12; m += 1) {
      const len = getDaysInJalaliMonth(y, m);
      total += len;
      for (let d = 1; d <= len; d += 1) { // includes first and last day of every month
        const g = jalaliToGregorian(y, m, d);
        assert.deepEqual(gregorianToJalali(g.year, g.month, g.day), { year: y, month: m, day: d });
        const n = Date.UTC(g.year, g.month - 1, g.day) / 86400000;
        if (prev !== null) assert.equal(n, prev + 1, `${y}/${m}/${d}`);
        prev = n;
      }
    }
    assert.equal(total, isJalaliLeapYear(y) ? 366 : 365);
  }
});

test('year boundaries', () => {
  assert.equal(iso(1403, 12, 30), '2025-03-20');
  assert.equal(iso(1404, 12, 29), '2026-03-20');
  assert.equal(iso(1405, 1, 1), '2026-03-21');
});

test('current Jalali date uses the configured time zone', () => {
  // 21:00Z = 00:30 in Tehran (UTC+3:30) -> already 1404/01/01
  const a = getCurrentJalaliDate('Asia/Tehran', new Date('2025-03-20T21:00:00Z'));
  assert.deepEqual([a.year, a.month, a.day], [1404, 1, 1]);
  assert.equal(a.gregorianDate, '2025-03-21');
  // 20:00Z = 23:30 in Tehran -> still 1403/12/30
  const b = getCurrentJalaliDate('Asia/Tehran', new Date('2025-03-20T20:00:00Z'));
  assert.deepEqual([b.year, b.month, b.day], [1403, 12, 30]);
});

test('day differences', () => {
  assert.equal(getDayDifference('2025-06-05', '2025-06-05'), 0);
  assert.equal(getDayDifference('2025-06-05', '2025-06-10'), 5);
  assert.equal(getDayDifference('2025-06-10', '2025-06-05'), -5);
  assert.equal(getDayDifference('2024-02-28', '2024-03-01'), 2); // leap Feb
  assert.equal(getDayDifference('2025-02-28', '2025-03-01'), 1);
  assert.equal(getDayDifference('2024-03-20', '2025-03-20'), 365);
  assert.equal(getDayDifference('2024-03-20', '2025-03-21'), 366);
});

test('difference descriptions', () => {
  assert.equal(describeDayDifference(156), '۱۵۶ روز گذشته');
  assert.equal(describeDayDifference(0), 'امروز این تاریخه! 🎉');
  assert.equal(describeDayDifference(-2), '۲ روز باقی‌مونده');
});

test('digit normalization and formatting', () => {
  assert.equal(normalizeDigits('۱۴۰۴'), '1404');
  assert.equal(normalizeDigits('١٤٠٤'), '1404');
  assert.equal(normalizeDigits('1404'), '1404');
  assert.equal(normalizeDigits('۱۴a٠4'), '14a04');
  assert.equal(toPersianDigits(1405), '۱۴۰۵');
  assert.equal(formatJalaliDate(1404, 3, 15), '۱۵ خرداد ۱۴۰۴');
});
test('later Nowruz vectors (derived from equinox times, unverified by execution)', () => {
  assert.equal(iso(1407, 1, 1), '2028-03-20');
  assert.equal(iso(1408, 1, 1), '2029-03-20');
  assert.equal(iso(1409, 1, 1), '2030-03-21');
});
