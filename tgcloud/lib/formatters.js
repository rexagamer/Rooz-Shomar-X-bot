import { CONFIG } from './config.js';
import {
  SUPPORTED_YEAR_MIN, SUPPORTED_YEAR_MAX, JALALI_MONTH_NAMES,
  formatJalaliDate, toPersianDigits, describeDayDifference, getDayDifference,
  getCurrentJalaliDate,
} from './jalali.js';
import { MAX_TITLE_LENGTH } from './input-parsers.js';

const P = toPersianDigits;
export const SEPARATOR = '━━━━━━━━━━━━';

export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const EMOJI_RULES = [
  ['تولد', '🎂'], ['دانشگاه', '🎓'], ['رابطه', '💙'], ['سفر', '✈️'],
  ['ازدواج', '💍'], ['عروسی', '💍'], ['آشنایی', '🤝'], ['ملاقات', '🤝'],
];

export function pickEmoji(title) {
  const t = String(title);
  for (const [keyword, emoji] of EMOJI_RULES) if (t.includes(keyword)) return emoji;
  return '📌';
}

export const entryDate = (e) => formatJalaliDate(e.jalaliYear, e.jalaliMonth, e.jalaliDay);

export function statusLine(entry, todayIso) {
  const diff = getDayDifference(entry.gregorianDate, todayIso);
  const icon = diff > 0 ? '⏳' : diff < 0 ? '⏰' : '📍';
  return `${icon} ${describeDayDifference(diff)}`;
}

export function formatEntryBlock(entry, todayIso) {
  return `${pickEmoji(entry.title)} <b>${escapeHtml(entry.title)}</b>\n📆 ${entryDate(entry)}\n${statusLine(entry, todayIso)}`;
}

// ---------- pagination ----------

export function pageSlice(items, page) {
  const pages = Math.max(1, Math.ceil(items.length / CONFIG.pageSize));
  const p = Math.min(Math.max(0, Number.isInteger(page) ? page : 0), pages - 1);
  return { page: p, pages, items: items.slice(p * CONFIG.pageSize, (p + 1) * CONFIG.pageSize) };
}

// ---------- dashboard ----------

export function formatDashboard({ entries, today, page, greeting }) {
  const slice = pageSlice(entries, page);
  const lines = [];
  if (greeting) lines.push(T.welcome, '');
  lines.push(`📅 امروز: ${formatJalaliDate(today.year, today.month, today.day)}`, '');
  if (entries.length === 0) {
    lines.push(T.emptyList);
    return lines.join('\n');
  }
  lines.push('تاریخ‌های تو:', '');
  lines.push(slice.items.map((e) => formatEntryBlock(e, today.gregorianDate)).join('\n\n'));
  lines.push('', SEPARATOR, '');
  if (slice.pages > 1) lines.push(`📄 صفحه ${P(slice.page + 1)} از ${P(slice.pages)}`);
  lines.push(`تعداد تاریخ‌های ثبت‌شده: ${P(entries.length)}`, '', T.addHint);
  return lines.join('\n');
}

// ---------- sharing ----------

export function formatImportPreview(items) {
  const shown = items.slice(0, 20).map(
    (i) => `${pickEmoji(i.title)} ${escapeHtml(i.title)} — ${formatJalaliDate(i.year, i.month, i.day)}`,
  );
  const rest = items.length - shown.length;
  return [
    `این کد شامل ${P(items.length)} تاریخه:`, '',
    ...shown,
    ...(rest > 0 ? [`… و ${P(rest)} مورد دیگه`] : []),
    '', 'این تاریخ‌ها به لیست خودت اضافه بشن؟',
  ].join('\n');
}

export function formatMyShares(shares) {
  const rows = shares.map((s, i) => {
    const d = getCurrentJalaliDate(CONFIG.timeZone, new Date(s.createdAt));
    return `${P(i + 1)}) 📦 ${P(s.dateCount)} تاریخ — ساخته‌شده در ${formatJalaliDate(d.year, d.month, d.day)}`;
  });
  return ['کدهای فعال تو:', '', ...rows, '', T.sharesNote].join('\n');
}

// ---------- texts ----------

export const T = {
  welcome: 'سلام! 👋 به روزشمار خوش اومدی.',
  emptyList:
    'هنوز تاریخی ثبت نکردی.\n\nبرای شروع /add رو بزن و اولین تاریخ مهمت رو اضافه کن؛ مثلاً «شروع رابطه» یا «تولد».',
  addHint: 'برای اضافه کردن تاریخ جدید /add رو بزن.',
  help: [
    '📖 راهنمای روزشمار', '',
    'تاریخ‌های مهمت رو به تقویم شمسی ثبت کن و ببین چند روز از هرکدوم گذشته یا چند روز مونده.', '',
    '/add — ثبت تاریخ جدید',
    '/list — نمایش تاریخ‌های من',
    '/today — تاریخ امروز و تاریخ‌های من',
    '/edit — ویرایش یک تاریخ',
    '/delete — حذف یک تاریخ',
    '/share — ساخت کد اشتراک‌گذاری',
    '/import CODE — دریافت تاریخ‌ها با کد',
    '/myshares — مدیریت کدهای اشتراک',
    '/cancel — لغو عملیات فعلی',
    '/help — همین راهنما',
  ].join('\n'),
  privateOnly: 'روزشمار فقط تو چت خصوصی کار می‌کنه. 🔒\nبرای ثبت و مدیریت تاریخ‌هات مستقیم به خودم پیام بده.',
  unknownMessage: 'متوجه نشدم چی می‌خوای 🤔\nاز دستورها استفاده کن؛ /help رو بزن تا همه‌شون رو ببینی.',
  unknownCommand: 'این دستور رو نمی‌شناسم. /help رو بزن تا دستورها رو ببینی.',
  genericError: 'یه مشکلی پیش اومد. لطفاً چند لحظه دیگه دوباره امتحان کن.',
  invalidButton: 'این دکمه معتبر نیست.',
  expired: 'این دکمه منقضی شده. دوباره از اول شروع کن.',
  notFound: 'این مورد پیدا نشد.',
  useButtons: 'برای ادامه از دکمه‌های پیام قبلی استفاده کن یا /cancel رو بزن.',
  cancelled: 'عملیات لغو شد. ✅',
  nothingToCancel: 'عملیاتی در جریان نیست.',

  prompts: {
    year: 'سال رو وارد کن:\nمثلاً ۱۴۰۴',
    month: 'حالا شماره ماه رو وارد کن:\n۱ تا ۱۲',
    day: 'روز ماه رو وارد کن:',
    title: 'یه عنوان برای این تاریخ بنویس:\nمثلاً شروع رابطه',
  },
  badYear: `سال معتبر نیست. یه عدد بین ${P(SUPPORTED_YEAR_MIN)} و ${P(SUPPORTED_YEAR_MAX)} بنویس؛ مثلاً ۱۴۰۴.`,
  badMonth: 'ماه معتبر نیست. یه عدد از ۱ تا ۱۲ یا اسم ماه (مثلاً خرداد) بنویس.',
  badDay: (year, month, max) =>
    `روز معتبر نیست. ${JALALI_MONTH_NAMES[month - 1]} ${P(year)} ${P(max)} روزه؛ عددی بین ۱ تا ${P(max)} بنویس.`,
  badTitle: `عنوان نباید خالی باشه و حداکثر ${P(MAX_TITLE_LENGTH)} حرف می‌تونه باشه.`,

  confirmDraft: (kind, p) =>
    [
      kind === 'add' ? 'تاریخ جدید:' : 'ویرایش تاریخ:', '',
      `📌 ${escapeHtml(p.title)}`,
      `📅 ${formatJalaliDate(p.year, p.month, p.day)}`, '',
      kind === 'add' ? 'ثبتش کنم؟' : 'تغییرات ذخیره بشه؟',
    ].join('\n'),
  saved: (e, todayIso) =>
    `✅ ثبت شد!\n\n📌 ${escapeHtml(e.title)}\n📅 ${entryDate(e)}\n${statusLine(e, todayIso)}`,
  updated: (e, todayIso) =>
    `✅ تغییرات ذخیره شد!\n\n📌 ${escapeHtml(e.title)}\n📅 ${entryDate(e)}\n${statusLine(e, todayIso)}`,
  saveFailed: (reason) => {
    if (reason === 'duplicate') return 'این تاریخ با همین عنوان قبلاً ثبت شده؛ دوباره ثبتش نکردم.';
    if (reason === 'limit') return `به سقف ${P(CONFIG.maxDatesPerUser)} تاریخ رسیدی. اول چندتا رو حذف کن.`;
    if (reason === 'not_found') return 'این تاریخ دیگه وجود نداره.';
    return 'اطلاعات تاریخ معتبر نبود. دوباره با /add شروع کن.';
  },

  pickEdit: '✏️ کدوم تاریخ رو ویرایش کنم؟',
  pickDelete: '🗑 کدوم تاریخ رو حذف کنم؟',
  editWhat: 'چی رو ویرایش کنم؟',
  editing: (e) => `✏️ در حال ویرایش «${escapeHtml(e.title)}»`,
  confirmDelete: 'این تاریخ حذف بشه؟',
  deleted: (e) => `🗑 «${escapeHtml(e.title)}» حذف شد.`,

  noDatesToShare: 'برای اشتراک‌گذاری اول باید حداقل یک تاریخ ثبت کنی. /add رو بزن.',
  shareMenu: (n) => `می‌خوای کدوم تاریخ‌ها رو به اشتراک بذاری؟\nتعداد تاریخ‌های تو: ${P(n)}`,
  shareSelect: (n) => `تاریخ‌هایی که می‌خوای به اشتراک بذاری رو انتخاب کن.\nانتخاب‌شده: ${P(n)}`,
  selectAtLeastOne: 'حداقل یک تاریخ رو انتخاب کن.',
  shareLimit: (n) => `حداکثر ${P(n)} کد فعال می‌تونی داشته باشی. با /myshares یکی رو باطل کن.`,
  shareCreated: (code, count) =>
    [
      'کد اشتراک تاریخ‌هات آماده شد! 🎉', '',
      `<code>${code}</code>`, '',
      'این کد رو برای دوستت بفرست.', '',
      'برای وارد کردنش، دوستت باید دستور زیر رو ارسال کنه:', '',
      `<code>/import ${code}</code>`, '',
      `📦 تعداد تاریخ‌ها: ${P(count)}`,
      '⚠️ هر کسی این کد رو داشته باشه می‌تونه این تاریخ‌ها رو ببینه و اضافه کنه. با /myshares می‌تونی کد رو باطل کنی.',
    ].join('\n'),

  importUsage: 'کد رو بعد از دستور بنویس؛ مثلاً:\n/import ABCD-EFGH-JKLM-NPQR',
  importMalformed: 'فرمت کد درست نیست. کد شبیه ABCD-EFGH-JKLM-NPQR هست.',
  importNotFound: 'این کد پیدا نشد یا دیگه فعال نیست.',
  importRateLimited: (ms) =>
    `تعداد تلاش‌های ناموفق زیاد بود. ${P(Math.max(1, Math.ceil(ms / 60000)))} دقیقه دیگه دوباره امتحان کن.`,
  importDone: (r) =>
    [
      `✅ ${P(r.added.length)} تاریخ به لیستت اضافه شد.`,
      ...(r.duplicates ? [`↩️ ${P(r.duplicates)} مورد تکراری بود و اضافه نشد.`] : []),
      ...(r.overLimit ? [`⚠️ ${P(r.overLimit)} مورد به خاطر سقف تعداد اضافه نشد.`] : []),
    ].join('\n'),

  noShares: 'کد فعالی نداری. با /share یکی بساز.',
  sharesNote: 'برای امنیت، متن کد ذخیره نمی‌شه و فقط موقع ساخت نشون داده می‌شه.',
  confirmRevoke: 'این کد باطل بشه؟ بعدش هیچ‌کس نمی‌تونه با اون وارد کنه (تاریخ‌هایی که قبلاً وارد شدن حذف نمی‌شن).',
  revoked: 'کد باطل شد ✅',
};
