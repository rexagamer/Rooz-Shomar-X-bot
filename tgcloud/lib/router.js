import { getState, clearState, setState } from './state-service.js';
import { removeEntry, getEntry } from './date-service.js';
import { getSettings, saveSettings } from './settings-service.js';
import { T, formatEntryBlock, formatSettings } from './formatters.js';
import { parseCallback, deleteConfirmKeyboard, settingsKeyboard, mainReplyKeyboard } from './keyboards.js';
import { render, send, sendWithMenu, showDashboard, showDateList, showPick, showSettings, todayOf } from './screens.js';
import {
  startWizard, handleWizardText, handleWizardYearButton, handleWizardMonthButton,
  handleWizardTitleButton, confirmWizard, openEditMenu, beginEdit,
} from './wizard.js';
import * as share from './share-flow.js';

const isTelegramApiError = (e) => e && typeof e.description === 'string' && e.code !== undefined;

export function parseCommand(text) {
  const m = /^\/([A-Za-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(String(text).trim());
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? '').trim() } : null;
}

// Reply keyboard button text -> action mapping
const REPLY_BUTTONS = new Map([
  ['➕ ثبت تاریخ جدید', 'add'],
  ['📅 تاریخ‌های من', 'list'],
  ['📤 اشتراک‌گذاری', 'share'],
  ['📥 دریافت تاریخ', 'import'],
  ['🗓 امروز', 'today'],
  ['⚙️ تنظیمات', 'settings'],
  ['❓ راهنما', 'help'],
]);

// ---------- messages ----------

export async function handleMessage(deps, message) {
  try {
    await routeMessage(deps, message);
  } catch (error) {
    deps.onError?.(error);
    if (isTelegramApiError(error)) throw error;
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

  // Check reply keyboard buttons first
  const replyAction = REPLY_BUTTONS.get(text.trim());
  if (replyAction) return runReplyAction(c, replyAction);

  // Check slash commands
  const command = parseCommand(text);
  if (command) return runCommand(c, command);

  // Check wizard / import state
  const st = await getState(deps.store, c.userId, deps.now);
  if (st && st.state.startsWith('w_')) return handleWizardText(c, st, text);
  if (st && st.state === 'i_wait') return share.handleImportText(c, text);
  if (st) return send(c, T.useButtons);

  await send(c, T.unknownMessage);
  await showDashboard(c);
}

function runReplyAction(c, action) {
  switch (action) {
    case 'add': return startWizard(c, 'add');
    case 'list': return showDateList(c);
    case 'share': return share.showShareMenu(c);
    case 'import': return share.startImport(c, '');
    case 'today': return showDashboard(c);
    case 'settings': return showSettings(c);
    case 'help': return sendWithMenu(c, T.help);
    default: return showDashboard(c);
  }
}

async function cancelOperation(c) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  await clearState(c.deps.store, c.userId);
  return send(c, st ? T.cancelled : T.nothingToCancel);
}

function runCommand(c, { name, args }) {
  switch (name) {
    case 'start': return showDashboard(c, { greeting: true });
    case 'list': return showDateList(c);
    case 'today': return showDashboard(c);
    case 'add': return startWizard(c, 'add');
    case 'edit': return showPick(c, { mode: 'edit' });
    case 'delete': return showPick(c, { mode: 'delete' });
    case 'share': return share.showShareMenu(c);
    case 'import': return share.startImport(c, args);
    case 'myshares': return share.showMyShares(c);
    case 'settings': return showSettings(c);
    case 'cancel': return cancelOperation(c);
    case 'help': return sendWithMenu(c, T.help);
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
  const settings = await getSettings(c.deps.store, c.userId);
  await render(
    c, c.messageId,
    `${T.confirmDelete}\n\n${formatEntryBlock(entry, todayOf(c.deps).gregorianDate, settings.displayMode)}`,
    deleteConfirmKeyboard(id),
  );
  return undefined;
}

async function doDelete(c, id) {
  const removed = await removeEntry(c.deps.store, c.userId, id);
  if (!removed) return T.notFound;
  await render(c, c.messageId, T.deleted(removed));
  await showDateList(c);
  return undefined;
}

async function cancelByButton(c, prefix) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  if (!st || !st.state.startsWith(prefix)) {
    if (prefix === 's_') await render(c, c.messageId, T.cancelled);
    else return T.expired;
    return undefined;
  }
  await clearState(c.deps.store, c.userId);
  await render(c, c.messageId, T.cancelled);
  return undefined;
}

async function handleSettingsToggle(c, mode) {
  await saveSettings(c.deps.store, c.userId, { displayMode: mode }, c.deps.now);
  const settings = await getSettings(c.deps.store, c.userId);
  await render(c, c.messageId, formatSettings(settings), settingsKeyboard(settings));
  return T.settingsSaved;
}

async function runCallback(c, { action, arg }) {
  const messageId = c.messageId;
  const page = Number(arg);
  switch (action) {
    // Navigation
    case 'nav_add': await startWizard(c, 'add'); return undefined;
    case 'nav_list': await showDateList(c); return undefined;
    case 'nav_share': await share.showShareMenu(c); return undefined;
    case 'nav_import': await share.startImport(c, ''); return undefined;
    case 'nav_settings': await showSettings(c); return undefined;
    case 'nav_help': await send(c, T.help); return undefined;
    case 'nav_home': await showDashboard(c, { messageId }); return undefined;
    case 'nav_myshares': await share.showMyShares(c); return undefined;

    // Dashboard pagination
    case 'lp': await showDashboard(c, { page, messageId }); return undefined;

    // Date list pagination
    case 'dlp': await showDateList(c, { page, messageId }); return undefined;

    // Legacy pick pagination (edit/delete via /edit /delete)
    case 'ep': await showPick(c, { mode: 'edit', page, messageId }); return undefined;
    case 'dp': await showPick(c, { mode: 'delete', page, messageId }); return undefined;

    // Edit
    case 'e': return openEditMenu(c, arg);
    case 'et': return beginEdit(c, arg, 'edit_title');
    case 'ed': return beginEdit(c, arg, 'edit_date');

    // Delete
    case 'd': return confirmDelete(c, arg);
    case 'dy': return doDelete(c, arg);

    // Single-entry share
    case 'es': return share.shareSingle(c, arg);

    // Wizard buttons
    case 'wc': return confirmWizard(c);
    case 'wx': return cancelByButton(c, 'w_');
    case 'wy': return handleWizardYearButton(c, arg);

    // Wizard month buttons (wm1..wm12)
    case 'wm1': case 'wm2': case 'wm3': case 'wm4':
    case 'wm5': case 'wm6': case 'wm7': case 'wm8':
    case 'wm9': case 'wm10': case 'wm11': case 'wm12':
      return handleWizardMonthButton(c, Number(action.slice(2)));

    // Wizard title suggestions (wts1..wts5)
    case 'wts1': return handleWizardTitleButton(c, 0);
    case 'wts2': return handleWizardTitleButton(c, 1);
    case 'wts3': return handleWizardTitleButton(c, 2);
    case 'wts4': return handleWizardTitleButton(c, 3);
    case 'wts5': return handleWizardTitleButton(c, 4);

    // Share
    case 'sa': return share.shareAll(c);
    case 'ss': return share.enterSelect(c);
    case 'st': return share.toggleSelect(c, arg);
    case 'sp': return share.selectPage(c, page);
    case 'sg': return share.finishSelect(c);
    case 'sx': return cancelByButton(c, 's_');

    // My shares
    case 'mr': return share.askRevoke(c, arg);
    case 'mrc': return share.doRevoke(c, arg);
    case 'mrx': await share.showMyShares(c, { messageId }); return undefined;

    // Import
    case 'ic': return share.confirmImport(c);
    case 'ix': return cancelByButton(c, 'i_');

    // Settings
    case 'set_detailed': return handleSettingsToggle(c, 'detailed');
    case 'set_short': return handleSettingsToggle(c, 'short');

    default: return T.invalidButton;
  }
}
