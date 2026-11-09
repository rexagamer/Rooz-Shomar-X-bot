import { CONFIG } from './config.js';
import {
  SUPPORTED_YEAR_MIN, SUPPORTED_YEAR_MAX, JALALI_MONTH_NAMES,
  formatJalaliDate, toPersianDigits, describeDayDifference, getDayDifference,
  getCurrentJalaliDate, getJalaliDuration, formatJalaliDuration,
  gregorianToJalali, parseIsoDate,
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

// ---------- duration helpers ----------

function entryJalali(entry) {
  return { year: entry.jalaliYear, month: entry.jalaliMonth, day: entry.jalaliDay };
}

function todayJalali(todayIso) {
  const g = parseIsoDate(todayIso);
  return gregorianToJalali(g.year, g.month, g.day);
}

export function getEntryDuration(entry, todayIso) {
  return getJalaliDuration(entryJalali(entry), todayJalali(todayIso));
}

export function statusLine(entry, todayIso, displayMode = 'detailed') {
  const diff = getDayDifference(entry.gregorianDate, todayIso);
  const icon = diff > 0 ? '⏳' : diff < 0 ? '⏰' : '📍';

  if (displayMode === 'detailed') {
    const duration = getEntryDuration(entry, todayIso);
    const formatted = formatJalaliDuration(duration, 'auto', { showTotal: true });
    return `${icon} ${formatted}`;
  }
  // short mode: just total days
  return `${icon} ${describeDayDifference(diff)}`;
}

export function formatEntryBlock(entry, todayIso, displayMode = 'detailed') {
  return `${pickEmoji(entry.title)} <b>${escapeHtml(entry.title)}</b>\n📆 ${entryDate(entry)}\n${statusLine(entry, todayIso, displayMode)}`;
}

// ---------- pagination ----------

export function pageSlice(items, page, size = CONFIG.pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, Number.isInteger(page) ? page : 0), pages - 1);
  return { page: p, pages, items: items.slice(p * size, (p + 1) * size) };
}

// ---------- dashboard (home screen) ----------

export function formatDashboard({ entries, today, page, greeting, displayMode }) {
  const slice = pageSlice(entries, page);
  const lines = [];

  if (greeting) {
    lines.push('سلام! 🌱', '');
    lines.push('به <b>روزشمار</b> خوش اومدی.', '');
    lines.push('اینجا می‌تونی اتفاق‌های مهم زندگیت رو ثبت کنی و همیشه بدونی چقدر ازشون گذشته یا چقدر تا رسیدنشون مونده.', '');
    lines.push(SEPARATOR, '');
  }

  lines.push(`📅 امروز: ${formatJalaliDate(today.year, today.month, today.day)}`);

  if (entries.length === 0) {
    lines.push('', T.emptyList);
    lines.push('', 'از منوی پایین هر کاری دوست داری انجام بده. 👇');
    return lines.join('\n');
  }

  lines.push(`💙 تاریخ‌های تو: ${P(entries.length)} مورد`);

  // Show a small preview of the first few upcoming/recent
  const preview = slice.items.slice(0, 3);
  if (preview.length > 0) {
    lines.push('');
    for (const e of preview) {
      const dur = getEntryDuration(e, today.gregorianDate);
      const formatted = formatJalaliDuration(dur, 'auto');
      lines.push(`${pickEmoji(e.title)} ${escapeHtml(e.title)} — ${formatted}`);
    }
  }

  lines.push('', 'از منوی پایین هر کاری دوست داری انجام بده. 👇');
  return lines.join('\n');
}

// ---------- detailed date list ----------

export function formatDateList({ entries, today, page, displayMode }) {
  const size = CONFIG.dateListPageSize;
  const slice = pageSlice(entries, page, size);
  const lines = [];
  lines.push('📅 <b>تاریخ‌های تو</b>', '');

  if (entries.length === 0) {
    lines.push(T.emptyList);
    return { text: lines.join('\n'), items: [] };
  }

  for (let i = 0; i < slice.items.length; i += 1) {
    const e = slice.items[i];
    lines.push(SEPARATOR, '');
    lines.push(formatEntryBlock(e, today.gregorianDate, displayMode));
    lines.push('');
  }
  lines.push(SEPARATOR);

  if (slice.pages > 1) {
    lines.push('', `📄 صفحه ${P(slice.page + 1)} از ${P(slice.pages)}`);
  }
  lines.push(`تعداد: ${P(entries.length)}`);

  return { text: lines.join('\n'), items: slice.items };
}

// ---------- sharing ----------

export function formatImportPreview(items) {
  const shown = items.slice(0, 20).map(
    (i) => `${pickEmoji(i.title)} ${escapeHtml(i.title)} — ${formatJalaliDate(i.year, i.month, i.day)}`,
  );
  const rest = items.length - shown.length;
  return [
    `📥 <b>تاریخ‌های آماده دریافت</b>`, '',
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
  return ['<b>کدهای فعال تو:</b>', '', ...rows, '', T.sharesNote].join('\n');
}

// ---------- settings ----------

export function formatSettings(settings) {
  const mode = settings.displayMode === 'detailed' ? 'نمایش کامل (سال/ماه/روز)' : 'نمایش خلاصه (فقط روز)';
  return [
    '⚙️ <b>تنظیمات</b>', '',
    `📐 حالت نمایش: ${mode}`,
    `🕐 منطقه زمانی: تهران (ثابت)`,
    `🔢 اعداد: فارسی (ثابت)`, '',
    'حالت نمایش مدت‌زمان رو انتخاب کن:',
  ].join('\n');
}

// ---------- texts ----------

export const T = {
  welcome: 'سلام! 🌱 به روزشمار خوش اومدی.',
  emptyList:
    'هنوز تاریخی ثبت نکردی.\n\nبرای شروع از دکمه «➕ ثبت تاریخ جدید» استفاده کن و اولین تاریخ مهمت رو اضافه کن؛ مثلاً «شروع رابطه» یا «تولد».',
  addHint: 'برای اضافه کردن تاریخ جدید دکمه «➕ ثبت تاریخ جدید» رو بزن.',
  help: [
    '📖 <b>راهنمای روزشمار</b>', '',
    'تاریخ‌های مهمت رو به تقویم شمسی ثبت کن و ببین چقدر از هرکدوم گذشته یا چقدر تا رسیدنشون مونده.', '',
    '<b>دکمه‌های اصلی:</b>',
    '➕ ثبت تاریخ جدید — ثبت تاریخ',
    '📅 تاریخ‌های من — نمایش تاریخ‌ها',
    '🗓 امروز — داشبورد امروز',
    '📤 اشتراک‌گذاری — ساخت کد اشتراک',
    '📥 دریافت تاریخ — وارد کردن تاریخ با کد',
    '⚙️ تنظیمات — تنظیمات نمایش', '',
    '<b>دستورها (میان‌بر):</b>',
    '/add — ثبت تاریخ جدید',
    '/list — نمایش تاریخ‌های من',
    '/today — تاریخ امروز و داشبورد',
    '/edit — ویرایش یک تاریخ',
    '/delete — حذف یک تاریخ',
    '/share — ساخت کد اشتراک‌گذاری',
    '/import CODE — دریافت تاریخ‌ها با کد',
    '/myshares — مدیریت کدهای اشتراک',
    '/settings — تنظیمات',
    '/cancel — لغو عملیات فعلی',
    '/help — همین راهنما',
  ].join('\n'),
  privateOnly: 'روزشمار فقط تو چت خصوصی کار می‌کنه. 🔒\nبرای ثبت و مدیریت تاریخ‌هات مستقیم به خودم پیام بده.',
  unknownMessage: 'متوجه نشدم چی می‌خوای 🤔\nاز دکمه‌های منوی پایین استفاده کن یا /help رو بزن.',
  unknownCommand: 'این دستور رو نمی‌شناسم. /help رو بزن تا دستورها رو ببینی.',
  genericError: 'یه مشکلی پیش اومد. لطفاً چند لحظه دیگه دوباره امتحان کن.',
  invalidButton: 'این دکمه معتبر نیست.',
  expired: 'این دکمه منقضی شده. دوباره از اول شروع کن.',
  notFound: 'این مورد پیدا نشد.',
  useButtons: 'برای ادامه از دکمه‌های پیام قبلی استفاده کن یا /cancel رو بزن.',
  cancelled: 'عملیات لغو شد. ✅',
  nothingToCancel: 'عملیاتی در جریان نیست.',

  prompts: {
    year: 'اول سال رو وارد کن 🌱\nمی‌تونی از دکمه‌ها استفاده کنی یا خودت بنویسی:',
    month: 'حالا ماه رو انتخاب کن:',
    day: 'روز ماه رو وارد کن:',
    title: 'یه عنوان برای این تاریخ بنویس:\nمی‌تونی از پیشنهادها انتخاب کنی یا خودت بنویسی:',
  },
  badYear: `سال معتبر نیست. یه عدد بین ${P(SUPPORTED_YEAR_MIN)} و ${P(SUPPORTED_YEAR_MAX)} بنویس؛ مثلاً ۱۴۰۴.`,
  badMonth: 'ماه معتبر نیست. یکی از دکمه‌ها رو بزن یا عددی از ۱ تا ۱۲ بنویس.',
  badDay: (year, month, max) =>
    `روز معتبر نیست. ${JALALI_MONTH_NAMES[month - 1]} ${P(year)} ${P(max)} روزه؛ عددی بین ۱ تا ${P(max)} بنویس.`,
  badTitle: `عنوان نباید خالی باشه و حداکثر ${P(MAX_TITLE_LENGTH)} حرف می‌تونه باشه.`,

  confirmDraft: (kind, p) =>
    [
      kind === 'add' ? '📌 <b>تاریخ جدید:</b>' : '✏️ <b>ویرایش تاریخ:</b>', '',
      `${pickEmoji(p.title)} ${escapeHtml(p.title)}`,
      `📅 ${formatJalaliDate(p.year, p.month, p.day)}`, '',
      kind === 'add' ? 'ثبتش کنم؟' : 'تغییرات ذخیره بشه؟',
    ].join('\n'),
  saved: (e, todayIso, displayMode) =>
    `✅ ثبت شد!\n\n${formatEntryBlock(e, todayIso, displayMode)}`,
  updated: (e, todayIso, displayMode) =>
    `✅ تغییرات ذخیره شد!\n\n${formatEntryBlock(e, todayIso, displayMode)}`,
  saveFailed: (reason) => {
    if (reason === 'duplicate') return 'این تاریخ با همین عنوان قبلاً ثبت شده؛ دوباره ثبتش نکردم.';
    if (reason === 'limit') return `به سقف ${P(CONFIG.maxDatesPerUser)} تاریخ رسیدی. اول چندتا رو حذف کن.`;
    if (reason === 'not_found') return 'این تاریخ دیگه وجود نداره.';
    return 'اطلاعات تاریخ معتبر نبود. دوباره امتحان کن.';
  },

  pickEdit: '✏️ کدوم تاریخ رو ویرایش کنم؟',
  pickDelete: '🗑 کدوم تاریخ رو حذف کنم؟',
  editWhat: 'کدوم بخش رو می‌خوای تغییر بدی؟',
  editing: (e) => `✏️ در حال ویرایش «${escapeHtml(e.title)}»`,
  confirmDelete: 'مطمئنی می‌خوای این تاریخ رو حذف کنی؟',
  deleted: (e) => `🗑 «${escapeHtml(e.title)}» حذف شد.`,

  noDatesToShare: 'برای اشتراک‌گذاری اول باید حداقل یک تاریخ ثبت کنی. از دکمه «➕ ثبت تاریخ جدید» استفاده کن.',
  shareMenu: (n) => `دوست داری کدوم تاریخ‌ها رو به اشتراک بذاری؟\nتعداد تاریخ‌های تو: ${P(n)}`,
  shareSelect: (n) => `تاریخ‌هایی که می‌خوای به اشتراک بذاری رو انتخاب کن.\nانتخاب‌شده: ${P(n)}`,
  selectAtLeastOne: 'حداقل یک تاریخ رو انتخاب کن.',
  shareLimit: (n) => `حداکثر ${P(n)} کد فعال می‌تونی داشته باشی. از /myshares یکی رو باطل کن.`,
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

  importUsage: 'کد اشتراک رو وارد کن:\nمثلاً ABCD-EFGH-JKLM-NPQR\n\nیا با دستور:\n/import ABCD-EFGH-JKLM-NPQR',
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
  confirmRevoke: 'این کد باطل بشه؟ بعدش هیچ‌کس نمی‌تونه باهاش وارد کنه (تاریخ‌هایی که قبلاً وارد شدن حذف نمی‌شن).',
  revoked: 'کد باطل شد ✅',

  settingsSaved: 'تنظیمات ذخیره شد ✅',
  importPrompt: 'کد اشتراکی که دریافت کردی رو بنویس:',
};
