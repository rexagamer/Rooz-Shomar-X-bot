import { CONFIG } from './config.js';
import { listEntries, getEntry } from './date-service.js';
import { getState, setState, clearState } from './state-service.js';
import {
  createShare, previewImport, importShare, listShares, getOwnedActiveShare, revokeShare,
} from './sharing-service.js';
import { T, formatImportPreview, formatMyShares } from './formatters.js';
import {
  shareMenuKeyboard, shareSelectKeyboard, mySharesKeyboard, revokeConfirmKeyboard, confirmKeyboard,
} from './keyboards.js';
import { render, send, showDashboard, todayOf } from './screens.js';

// ---------- share: menu & selection ----------

export async function showShareMenu(c, { messageId } = {}) {
  const entries = await c.deps.store.listDates(c.userId);
  if (entries.length === 0) return render(c, messageId, T.noDatesToShare);
  return render(c, messageId, T.shareMenu(entries.length), shareMenuKeyboard());
}

async function renderSelect(c, selected, page) {
  const entries = await listEntries(c.deps.store, c.userId, todayOf(c.deps).gregorianDate);
  await render(c, c.messageId, T.shareSelect(selected.length), shareSelectKeyboard(entries, new Set(selected), page));
}

export async function enterSelect(c) {
  const entries = await c.deps.store.listDates(c.userId);
  if (entries.length === 0) return render(c, c.messageId, T.noDatesToShare);
  await setState(c.deps.store, c.userId, 's_select', { selected: [], page: 0 }, c.deps.now);
  return renderSelect(c, [], 0);
}

async function selectState(c) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  return st && st.state === 's_select' && Array.isArray(st.payload.selected) ? st.payload : null;
}

export async function toggleSelect(c, id) {
  const p = await selectState(c);
  if (!p) return T.expired;
  if (!(await getEntry(c.deps.store, c.userId, id))) return T.notFound; // must be the caller's own
  const set = new Set(p.selected);
  if (set.has(id)) set.delete(id);
  else if (set.size < CONFIG.maxDatesPerUser) set.add(id);
  const next = { selected: [...set], page: p.page ?? 0 };
  await setState(c.deps.store, c.userId, 's_select', next, c.deps.now);
  await renderSelect(c, next.selected, next.page);
  return undefined;
}

export async function selectPage(c, page) {
  const p = await selectState(c);
  if (!p) return T.expired;
  await setState(c.deps.store, c.userId, 's_select', { selected: p.selected, page }, c.deps.now);
  await renderSelect(c, p.selected, page);
  return undefined;
}

export async function finishSelect(c) {
  const p = await selectState(c);
  if (!p) return T.expired;
  if (p.selected.length === 0) return T.selectAtLeastOne;
  return createAndShow(c, p.selected);
}

export const shareAll = (c) => createAndShow(c, null);

async function createAndShow(c, entryIds) {
  const { store, now } = c.deps;
  const r = await createShare(store, c.userId, entryIds, now);
  await clearState(store, c.userId);
  if (!r.ok) {
    const text = r.reason === 'empty' ? T.noDatesToShare
      : r.reason === 'limit' ? T.shareLimit(CONFIG.maxActiveShares)
        : T.genericError;
    await render(c, c.messageId, text);
    return undefined;
  }
  await render(c, c.messageId, T.shareCreated(r.code, r.share.dateCount));
  return undefined;
}

// ---------- import ----------

export async function startImport(c, args) {
  if (!args) return send(c, T.importUsage);
  const { store, now } = c.deps;
  const r = await previewImport(store, c.userId, args, now);
  if (!r.ok) {
    const text = r.reason === 'malformed' ? T.importMalformed
      : r.reason === 'rate_limited' ? T.importRateLimited(r.retryAfterMs)
        : T.importNotFound;
    return send(c, text);
  }
  await setState(store, c.userId, 'i_confirm', { shareId: r.share.id }, now);
  return send(c, formatImportPreview(r.items), confirmKeyboard('ic', 'ix', '✅ اضافه کن', '❌ انصراف'));
}

export async function confirmImport(c) {
  const { store, now } = c.deps;
  const st = await getState(store, c.userId, now);
  if (!st || st.state !== 'i_confirm' || typeof st.payload.shareId !== 'string') return T.expired;
  const r = await importShare(store, c.userId, st.payload.shareId, now);
  await clearState(store, c.userId);
  if (!r.ok) {
    await render(c, c.messageId, T.importNotFound);
    return undefined;
  }
  await render(c, c.messageId, T.importDone(r));
  await showDashboard(c);
  return undefined;
}

// ---------- my shares ----------

export async function showMyShares(c, { messageId } = {}) {
  const shares = await listShares(c.deps.store, c.userId);
  if (shares.length === 0) return render(c, messageId, T.noShares);
  return render(c, messageId, formatMyShares(shares), mySharesKeyboard(shares));
}

export async function askRevoke(c, id) {
  if (!(await getOwnedActiveShare(c.deps.store, c.userId, id))) return T.notFound;
  await render(c, c.messageId, T.confirmRevoke, revokeConfirmKeyboard(id));
  return undefined;
}

export async function doRevoke(c, id) {
  const ok = await revokeShare(c.deps.store, c.userId, id, c.deps.now);
  if (!ok) return T.notFound;
  await showMyShares(c, { messageId: c.messageId });
  return T.revoked;
}
