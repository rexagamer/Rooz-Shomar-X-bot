import { webcrypto } from 'node:crypto';
import { createMemoryStore } from './memory-store.js';
import { handleMessage, handleCallbackQuery } from '../../tgcloud/lib/router.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto; // Node 18 test env only

// 2025-11-09 08:00Z = 11:30 Tehran = 18 آبان 1404
export const NOW = Date.UTC(2025, 10, 9, 8, 0, 0);

export function createHarness() {
  const store = createMemoryStore();
  const log = { sent: [], edited: [], answers: [] };
  const tg = {
    async send(chatId, text, keyboard) {
      log.sent.push({ chatId, text, keyboard: keyboard ?? null });
      return { message_id: log.sent.length };
    },
    async edit(chatId, messageId, text, keyboard) {
      log.edited.push({ chatId, messageId, text, keyboard: keyboard ?? null });
    },
    async answer(id, text) { log.answers.push({ id, text: text ?? '' }); },
  };
  const deps = { store, tg, now: NOW };
  let seq = 100;
  return {
    store, deps, log,
    say: (user, text) => handleMessage(deps, {
      message_id: ++seq, chat: { id: user, type: 'private' }, from: { id: user, is_bot: false }, text,
    }),
    press: (user, data, { chatId = user } = {}) => handleCallbackQuery(deps, {
      id: `cq${++seq}`, from: { id: user }, message: { message_id: 7, chat: { id: chatId, type: 'private' } }, data,
    }),
    lastSent: () => log.sent.at(-1),
    lastEdited: () => log.edited.at(-1),
    lastToast: () => log.answers.at(-1)?.text,
    buttons: (keyboard) => (keyboard ?? []).flat(),
  };
}

export async function addDate(h, user, { y = '۱۴۰۴', m = '۳', d = '۱۵', title = 'شروع رابطه' } = {}) {
  await h.say(user, '/add');
  await h.say(user, y);
  await h.say(user, m);
  await h.say(user, d);
  await h.say(user, title);
  await h.press(user, 'wc');
}
