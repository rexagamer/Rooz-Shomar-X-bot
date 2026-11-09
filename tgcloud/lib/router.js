import { getState, clearState } from './state-service.js';
import { removeEntry, getEntry } from './date-service.js';
import { T, formatEntryBlock } from './formatters.js';
import { parseCallback, deleteConfirmKeyboard } from './keyboards.js';
import { render, send, showDashboard, showPick, todayOf } from './screens.js';
import { startWizard, handleWizardText, confirmWizard, openEditMenu, beginEdit } from './wizard.js';
import * as share from './share-flow.js';

// deps = { store, tg, now, onError? }   c = { deps, chatId, userId, messageId? }

const isTelegramApiError = (e) => e && typeof e.description === 'string' && e.code !== undefined;

export function parseCommand(text) {
  const m = /^\/([A-Za-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(String(text).trim());
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? '').trim() } : null;
}

// ---------- messages ----------

export async function handleMessage(deps, message) {
  try {
    await routeMessage(deps, message);
  } catch (error) {
    deps.onError?.(error);
    if (isTelegramApiError(error)) throw error; // e.g. "chat not found": surface it
    try {
      if (message?.chat?.id !== undefined) await deps.tg.send(message.chat.id, T.genericError);
    } catch { /* nothing more we can do */ }
  }
}

async function routeMessage(deps, message) {
  if (!message?.chat || !message.from || message.from.is_bot) return;
  const text = typeof message.text === 'string' ? message.text : '';
  const chatId = message.chat.id;
  if (message.chat.type !== 'private') {
    if (text.startsWith('/')) await deps.tg.send(chatId, T.privateOnly);
    return;
  }
  const c = { deps, chatId, userId: String(message.from.id) };
  const command = parseCommand(text);
  if (command) return runCommand(c, command);

  const st = await getState(deps.store, c.userId, deps.now);
  if (st && st.state.startsWith('w_')) return handleWizardText(c, st, text);
  if (st) return send(c, T.useButtons);
  await send(c, T.unknownMessage);
  return showDashboard(c);
}

async function cancelOperation(c) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  await clearState(c.deps.store, c.userId);
  return send(c, st ? T.cancelled : T.nothingToCancel);
}

function runCommand(c, { name, args }) {
  switch (name) {
    case 'start': return showDashboard(c, { greeting: true });
    case 'list':
    case 'today': return showDashboard(c);
    case 'add': return startWizard(c, 'add');
    case 'edit': return showPick(c, { mode: 'edit' });
    case 'delete': return showPick(c, { mode: 'delete' });
    case 'share': return share.showShareMenu(c);
    case 'import': return share.startImport(c, args);
    case 'myshares': return share.showMyShares(c);
    case 'cancel': return cancelOperation(c);
    case 'help': return send(c, T.help);
    default: return send(c, T.unknownCommand);
  }
}

// ---------- callbacks ----------

export async function handleCallbackQuery(deps, cq) {
  try {
    await routeCallback(deps, cq);
  } catch (error) {
    deps.onError?.(error);
    await deps.tg.answer(cq?.id, T.genericError);
  }
}

async function routeCallback(deps, cq) {
  const msg = cq?.message;
  const userId = String(cq?.from?.id ?? '');
  const parsed = parseCallback(cq?.data);
  // Private chats only, and the button must be pressed in the caller's own chat.
  if (!userId || !parsed || !msg || msg.chat?.type !== 'private' || String(msg.chat.id) !== userId) {
    await deps.tg.answer(cq?.id, T.invalidButton);
    return;
  }
  const c = { deps, chatId: msg.chat.id, userId, messageId: msg.message_id };
  const toast = await runCallback(c, parsed);
  await deps.tg.answer(cq.id, toast);
}

async function confirmDelete(c, id) {
  const entry = await getEntry(c.deps.store, c.userId, id);
  if (!entry) return T.notFound;
  await render(
    c, c.messageId,
    `${T.confirmDelete}\n\n${formatEntryBlock(entry, todayOf(c.deps).gregorianDate)}`,
    deleteConfirmKeyboard(id),
  );
  return undefined;
}

async function doDelete(c, id) {
  const removed = await removeEntry(c.deps.store, c.userId, id);
  if (!removed) return T.notFound;
  await render(c, c.messageId, T.deleted(removed));
  await showDashboard(c);
  return undefined;
}

// Cancel buttons only act on the state family they belong to (stale-button safety).
async function cancelByButton(c, prefix) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  if (!st || !st.state.startsWith(prefix)) {
    if (prefix === 's_') await render(c, c.messageId, T.cancelled); // share menu has no state
    else return T.expired;
    return undefined;
  }
  await clearState(c.deps.store, c.userId);
  await render(c, c.messageId, T.cancelled);
  return undefined;
}

async function runCallback(c, { action, arg }) {
  const messageId = c.messageId;
  const page = Number(arg);
  switch (action) {
    case 'lp': await showDashboard(c, { page, messageId }); return undefined;
    case 'ep': await showPick(c, { mode: 'edit', page, messageId }); return undefined;
    case 'dp': await showPick(c, { mode: 'delete', page, messageId }); return undefined;
    case 'e': return openEditMenu(c, arg);
    case 'et': return beginEdit(c, arg, 'edit_title');
    case 'ed': return beginEdit(c, arg, 'edit_date');
    case 'd': return confirmDelete(c, arg);
    case 'dy': return doDelete(c, arg);
    case 'wc': return confirmWizard(c);
    case 'wx': return cancelByButton(c, 'w_');
    case 'sa': return share.shareAll(c);
    case 'ss': return share.enterSelect(c);
    case 'st': return share.toggleSelect(c, arg);
    case 'sp': return share.selectPage(c, page);
    case 'sg': return share.finishSelect(c);
    case 'sx': return cancelByButton(c, 's_');
    case 'mr': return share.askRevoke(c, arg);
    case 'mrc': return share.doRevoke(c, arg);
    case 'mrx': await share.showMyShares(c, { messageId }); return undefined;
    case 'ic': return share.confirmImport(c);
    case 'ix': return cancelByButton(c, 'i_');
    default: return T.invalidButton;
  }
}
