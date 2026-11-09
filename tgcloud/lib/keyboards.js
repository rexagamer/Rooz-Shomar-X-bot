import { entryDate, pageSlice } from './formatters.js';
import { toPersianDigits } from './jalali.js';
import { isValidId } from './ids.js';

const btn = (text, data) => ({ text, callback_data: data });
export const cb = (action, arg) => (arg === undefined ? action : `${action}:${arg}`);

const ID_ACTIONS = new Set(['e', 'et', 'ed', 'd', 'dy', 'st', 'mr', 'mrc']);
const PAGE_ACTIONS = new Set(['lp', 'ep', 'dp', 'sp']);
const BARE_ACTIONS = new Set(['wc', 'wx', 'sa', 'ss', 'sg', 'sx', 'mrx', 'ic', 'ix']);

/** Strict validation of callback data. Returns {action, arg?} or null. */
export function parseCallback(data) {
  if (typeof data !== 'string' || data.length === 0 || data.length > 64) return null;
  const [action, arg, ...extra] = data.split(':');
  if (extra.length > 0) return null;
  if (BARE_ACTIONS.has(action)) return arg === undefined ? { action } : null;
  if (PAGE_ACTIONS.has(action)) return /^\d{1,3}$/.test(arg ?? '') ? { action, arg } : null;
  if (ID_ACTIONS.has(action)) return isValidId(arg) ? { action, arg } : null;
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

export function dashboardKeyboard(page, pages) {
  const row = pageRow('lp', page, pages);
  return row.length ? [row] : null;
}

export function pickKeyboard(entries, page, { itemAction, pageAction }) {
  const slice = pageSlice(entries, page);
  const rows = slice.items.map((e) => [btn(entryLabel(e), cb(itemAction, e.id))]);
  const nav = pageRow(pageAction, slice.page, slice.pages);
  if (nav.length) rows.push(nav);
  return rows;
}

export const editMenuKeyboard = (id) => [
  [btn('✏️ ویرایش عنوان', cb('et', id))],
  [btn('📅 ویرایش تاریخ', cb('ed', id))],
  [btn('↩️ بازگشت', cb('ep', 0))],
];

export const deleteConfirmKeyboard = (id) => [
  [btn('✅ بله، حذف کن', cb('dy', id)), btn('↩️ انصراف', cb('dp', 0))],
];

export const shareMenuKeyboard = () => [
  [btn('📤 اشتراک همه تاریخ‌ها', 'sa')],
  [btn('☑️ انتخاب تاریخ‌ها', 'ss')],
  [btn('❌ لغو', 'sx')],
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

export const mySharesKeyboard = (shares) =>
  shares.map((s, i) => [btn(`🚫 ابطال کد ${toPersianDigits(i + 1)}`, cb('mr', s.id))]);

export const revokeConfirmKeyboard = (id) => [
  [btn('✅ بله، باطل کن', cb('mrc', id)), btn('↩️ انصراف', 'mrx')],
];
