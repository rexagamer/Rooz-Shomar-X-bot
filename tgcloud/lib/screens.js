import { CONFIG } from './config.js';
import { getCurrentJalaliDate } from './jalali.js';
import { listEntries } from './date-service.js';
import { T, formatDashboard, pageSlice } from './formatters.js';
import { dashboardKeyboard, pickKeyboard } from './keyboards.js';

// `c` is the request context: { deps, chatId, userId, messageId? }

export const todayOf = (deps) => getCurrentJalaliDate(CONFIG.timeZone, new Date(deps.now));
export const send = (c, text, keyboard) => c.deps.tg.send(c.chatId, text, keyboard);
export const render = (c, messageId, text, keyboard) =>
  messageId ? c.deps.tg.edit(c.chatId, messageId, text, keyboard) : send(c, text, keyboard);

export async function showDashboard(c, { page = 0, messageId, greeting = false } = {}) {
  const today = todayOf(c.deps);
  const entries = await listEntries(c.deps.store, c.userId, today.gregorianDate);
  const slice = pageSlice(entries, page);
  await render(
    c, messageId,
    formatDashboard({ entries, today, page: slice.page, greeting }),
    dashboardKeyboard(slice.page, slice.pages),
  );
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
