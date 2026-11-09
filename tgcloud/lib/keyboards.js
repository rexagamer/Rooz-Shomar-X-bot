import { entryDate, pageSlice } from './formatters.js';
import { toPersianDigits, JALALI_MONTH_NAMES } from './jalali.js';
import { isValidId } from './ids.js';
import { CONFIG } from './config.js';

const btn = (text, data) => ({ text, callback_data: data });
export const cb = (action, arg) => (arg === undefined ? action : `${action}:${arg}`);

const ID_ACTIONS = new Set(['e', 'et', 'ed', 'd', 'dy', 'st', 'mr', 'mrc', 'es']);
const PAGE_ACTIONS = new Set(['lp', 'ep', 'dp', 'sp', 'dlp']);
const BARE_ACTIONS = new Set([
  'wc', 'wx', 'sa', 'ss', 'sg', 'sx', 'mrx', 'ic', 'ix',
  'nav_add', 'nav_list', 'nav_share', 'nav_import', 'nav_settings', 'nav_help', 'nav_home',
  'nav_myshares',
  'wm1', 'wm2', 'wm3', 'wm4', 'wm5', 'wm6', 'wm7', 'wm8', 'wm9', 'wm10', 'wm11', 'wm12',
  'wts1', 'wts2', 'wts3', 'wts4', 'wts5',
  'set_detailed', 'set_short',
]);
const YEAR_ACTION = new Set(['wy']);

/** Strict validation of callback data. Returns {action, arg?} or null. */
export function parseCallback(data) {
  if (typeof data !== 'string' || data.length === 0 || data.length > 64) return null;
  const [action, arg, ...extra] = data.split(':');
  if (extra.length > 0) return null;
  if (BARE_ACTIONS.has(action)) return arg === undefined ? { action } : null;
  if (PAGE_ACTIONS.has(action)) return /^\d{1,3}$/.test(arg ?? '') ? { action, arg } : null;
  if (ID_ACTIONS.has(action)) return isValidId(arg) ? { action, arg } : null;
  if (YEAR_ACTION.has(action)) return /^\d{4}$/.test(arg ?? '') ? { action, arg } : null;
  return null;
}

const short = (s, n = 28) => {
  const chars = [...s];
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : s;
};
const entryLabel = (e) => `${short(e.title)} — ${entryDate(e)}`;

export function pageRow(action, page, pages) {
  const row = [];
  if (page > 0) row.push(btn('◀️ قبلی', cb(action, page - 1)));
  if (page < pages - 1) row.push(btn('بعدی ▶️', cb(action, page + 1)));
  return row;
}

export const confirmKeyboard = (yes, no, yesLabel, noLabel) => [
  [btn(yesLabel, yes), btn(noLabel, no)],
];

// ---------- reply keyboard (persistent main menu) ----------

export function mainReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '➕ ثبت تاریخ جدید' }, { text: '📅 تاریخ‌های من' }],
      [{ text: '📤 اشتراک‌گذاری' }, { text: '📥 دریافت تاریخ' }],
      [{ text: '🗓 امروز' }, { text: '⚙️ تنظیمات' }],
      [{ text: '❓ راهنما' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// ---------- inline: dashboard / home ----------

export function dashboardKeyboard(page, pages, hasEntries) {
  const rows = [];
  if (!hasEntries) {
    rows.push([btn('➕ ثبت اولین تاریخ', 'nav_add')]);
  } else {
    rows.push([btn('📅 مشاهده تاریخ‌های من', 'nav_list')]);
    rows.push([btn('➕ ثبت تاریخ جدید', 'nav_add'), btn('📤 اشتراک‌گذاری', 'nav_share')]);
  }
  const nav = pageRow('lp', page, pages);
  if (nav.length) rows.push(nav);
  return rows;
}

// ---------- inline: detailed date list ----------

export function dateListKeyboard(entries, page) {
  const slice = pageSlice(entries, page, CONFIG.dateListPageSize);
  const rows = [];
  for (const e of slice.items) {
    rows.push([
      btn('✏️ ویرایش', cb('e', e.id)),
      btn('🗑 حذف', cb('d', e.id)),
      btn('🔗 اشتراک', cb('es', e.id)),
    ]);
  }
  const nav = pageRow('dlp', slice.page, slice.pages);
  if (nav.length) rows.push(nav);
  rows.push([btn('➕ ثبت تاریخ جدید', 'nav_add'), btn('🏠 منوی اصلی', 'nav_home')]);
  return { keyboard: rows, page: slice.page, pages: slice.pages, items: slice.items };
}

// ---------- inline: pick for edit/delete (legacy compatible) ----------

export function pickKeyboard(entries, page, { itemAction, pageAction }) {
  const slice = pageSlice(entries, page);
  const rows = slice.items.map((e) => [btn(entryLabel(e), cb(itemAction, e.id))]);
  const nav = pageRow(pageAction, slice.page, slice.pages);
  if (nav.length) rows.push(nav);
  return rows;
}

// ---------- inline: edit ----------

export const editMenuKeyboard = (id) => [
  [btn('📝 ویرایش عنوان', cb('et', id))],
  [btn('📅 ویرایش تاریخ', cb('ed', id))],
  [btn('⬅️ بازگشت', cb('dlp', 0))],
];

// ---------- inline: delete ----------

export const deleteConfirmKeyboard = (id) => [
  [btn('🗑 بله، حذف کن', cb('dy', id)), btn('❌ نه، منصرف شدم', cb('dlp', 0))],
];

// ---------- inline: wizard year ----------

export function wizardYearKeyboard(currentYear) {
  return [
    [
      btn(toPersianDigits(currentYear - 1), cb('wy', currentYear - 1)),
      btn(`📌 ${toPersianDigits(currentYear)}`, cb('wy', currentYear)),
      btn(toPersianDigits(currentYear + 1), cb('wy', currentYear + 1)),
    ],
    [btn('❌ لغو', 'wx')],
  ];
}

// ---------- inline: wizard month ----------

export function wizardMonthKeyboard() {
  const rows = [];
  for (let i = 0; i < 12; i += 3) {
    rows.push([
      btn(JALALI_MONTH_NAMES[i], `wm${i + 1}`),
      btn(JALALI_MONTH_NAMES[i + 1], `wm${i + 2}`),
      btn(JALALI_MONTH_NAMES[i + 2], `wm${i + 3}`),
    ]);
  }
  rows.push([btn('❌ لغو', 'wx')]);
  return rows;
}

// ---------- inline: wizard title suggestions ----------

export function wizardTitleKeyboard() {
  return [
    [btn('💙 شروع رابطه', 'wts1'), btn('🎂 تولد', 'wts2')],
    [btn('🎓 شروع دانشگاه', 'wts3'), btn('✈️ شروع سفر', 'wts4')],
    [btn('✨ عنوان دلخواه', 'wts5')],
    [btn('❌ لغو', 'wx')],
  ];
}

export const TITLE_SUGGESTIONS = ['شروع رابطه', 'تولد', 'شروع دانشگاه', 'شروع سفر', null];

// ---------- inline: share ----------

export const shareMenuKeyboard = () => [
  [btn('📚 همه تاریخ‌ها', 'sa')],
  [btn('☑️ انتخاب چند تاریخ', 'ss')],
  [btn('🔐 کدهای اشتراک من', 'nav_myshares')],
  [btn('⬅️ بازگشت', 'nav_home')],
];

export function shareSelectKeyboard(entries, selectedIds, page) {
  const slice = pageSlice(entries, page);
  const rows = slice.items.map((e) => [
    btn(`${selectedIds.has(e.id) ? '✅' : '⬜'} ${entryLabel(e)}`, cb('st', e.id)),
  ]);
  const nav = pageRow('sp', slice.page, slice.pages);
  if (nav.length) rows.push(nav);
  rows.push([
    btn(`📤 ساخت کد (${toPersianDigits(selectedIds.size)})`, 'sg'),
    btn('❌ لغو', 'sx'),
  ]);
  return rows;
}

export const shareCreatedKeyboard = () => [
  [btn('🏠 منوی اصلی', 'nav_home')],
];

export const mySharesKeyboard = (shares) => {
  const rows = shares.map((s, i) => [btn(`🚫 ابطال کد ${toPersianDigits(i + 1)}`, cb('mr', s.id))]);
  rows.push([btn('⬅️ بازگشت', 'nav_home')]);
  return rows;
};

export const revokeConfirmKeyboard = (id) => [
  [btn('✅ بله، باطل کن', cb('mrc', id)), btn('⬅️ انصراف', 'mrx')],
];

// ---------- inline: settings ----------

export function settingsKeyboard(current) {
  return [
    [
      btn(
        `${current.displayMode === 'detailed' ? '🔘' : '⚪'} نمایش کامل`,
        'set_detailed',
      ),
      btn(
        `${current.displayMode === 'short' ? '🔘' : '⚪'} نمایش خلاصه`,
        'set_short',
      ),
    ],
    [btn('🏠 منوی اصلی', 'nav_home')],
  ];
}

// ---------- import ----------

export const importConfirmKeyboard = () => [
  [btn('✅ اضافه کردن تاریخ‌ها', 'ic'), btn('❌ انصراف', 'ix')],
];