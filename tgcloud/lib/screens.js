import { CONFIG } from './config.js';
import { getCurrentJalaliDate } from './jalali.js';
import { listEntries } from './date-service.js';
import { getSettings } from './settings-service.js';
import {
  T, formatDashboard, formatDateList, formatSettings, pageSlice, formatEntryBlock,
} from './formatters.js';
import {
  dashboardKeyboard, pickKeyboard, dateListKeyboard, mainReplyKeyboard, settingsKeyboard,
} from './keyboards.js';

// `c` is the request context: { deps, chatId, userId, messageId? }

export const todayOf = (deps) => getCurrentJalaliDate(CONFIG.timeZone, new Date(deps.now));

export const send = (c, text, keyboard, replyKeyboard) =>
  c.deps.tg.send(c.chatId, text, keyboard, replyKeyboard);

export const render = (c, messageId, text, keyboard) =>
  messageId ? c.deps.tg.edit(c.chatId, messageId, text, keyboard) : send(c, text, keyboard);

/** Send with the main reply keyboard attached */
export const sendWithMenu = (c, text, inlineKeyboard) =>
  c.deps.tg.send(c.chatId, text, inlineKeyboard, mainReplyKeyboard());

export async function showDashboard(c, { page = 0, messageId, greeting = false } = {}) {
  const today = todayOf(c.deps);
  const settings = await getSettings(c.deps.store, c.userId);
  const entries = await listEntries(c.deps.store, c.userId, today.gregorianDate);
  const slice = pageSlice(entries, page);
  const text = formatDashboard({ entries, today, page: slice.page, greeting, displayMode: settings.displayMode });
  const kb = dashboardKeyboard(slice.page, slice.pages, entries.length > 0);

  if (messageId) {
    await render(c, messageId, text, kb);
  } else {
    // Always attach the reply keyboard when sending a new message
    await sendWithMenu(c, text, kb);
  }
}

export async function showDateList(c, { page = 0, messageId } = {}) {
  const today = todayOf(c.deps);
  const settings = await getSettings(c.deps.store, c.userId);
  const entries = await listEntries(c.deps.store, c.userId, today.gregorianDate);
  if (entries.length === 0) {
    await render(c, messageId, T.emptyList);
    return;
  }
  const { text, items } = formatDateList({ entries, today, page, displayMode: settings.displayMode });
  const { keyboard } = dateListKeyboard(entries, page);
  await render(c, messageId, text, keyboard);
}

const PICK = {
  edit: { itemAction: 'e', pageAction: 'ep', title: T.pickEdit },
  delete: { itemAction: 'd', pageAction: 'dp', title: T.pickDelete },
};

export async function showPick(c, { mode, page = 0, messageId }) {
  const cfg = PICK[mode];
  const today = todayOf(c.deps);
  const entries = await listEntries(c.deps.store, c.userId, today.gregorianDate);
  if (entries.length === 0) {
    await render(c, messageId, T.emptyList);
    return;
  }
  await render(c, messageId, cfg.title, pickKeyboard(entries, page, cfg));
}

export async function showSettings(c, { messageId } = {}) {
  const settings = await getSettings(c.deps.store, c.userId);
  const text = formatSettings(settings);
  const kb = settingsKeyboard(settings);
  await render(c, messageId, text, kb);
}
