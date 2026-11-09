import { CONFIG } from './config.js';
import { isValidJalaliDate, jalaliToIsoGregorian } from './jalali.js';
import { normalizeTitleKey, parseTitleInput } from './input-parsers.js';
import { newId } from './ids.js';

/** draft: {title, year, month, day} -> normalized record fields, or null if invalid. */
export function normalizeDraft(draft) {
  const title = parseTitleInput(draft?.title);
  if (!title || !isValidJalaliDate(draft.year, draft.month, draft.day)) return null;
  return {
    title,
    titleKey: normalizeTitleKey(title),
    jalaliYear: draft.year,
    jalaliMonth: draft.month,
    jalaliDay: draft.day,
    gregorianDate: jalaliToIsoGregorian(draft.year, draft.month, draft.day),
  };
}

const dedupKey = (e) => `${e.titleKey}|${e.gregorianDate}`;

/** Upcoming/today first (soonest first), then past (most recent first). */
export function sortEntries(entries, todayIso) {
  const rank = (e) => (e.gregorianDate >= todayIso ? 0 : 1);
  return [...entries].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.gregorianDate !== b.gregorianDate) {
      const cmp = a.gregorianDate < b.gregorianDate ? -1 : 1;
      return ra === 0 ? cmp : -cmp;
    }
    if (a.titleKey !== b.titleKey) return a.titleKey < b.titleKey ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

export async function listEntries(store, userId, todayIso) {
  return sortEntries(await store.listDates(userId), todayIso);
}

export const getEntry = (store, userId, id) => store.getDate(userId, id);

/** Adds many drafts, skipping invalid/duplicate ones. Lists existing rows once. */
export async function addEntries(store, userId, drafts, { now, sourceShareId = '' }) {
  const existing = await store.listDates(userId);
  const seen = new Set(existing.map(dedupKey));
  let count = existing.length;
  const result = { added: [], duplicates: 0, invalid: 0, overLimit: 0 };
  for (const draft of drafts) {
    const v = normalizeDraft(draft);
    if (!v) { result.invalid += 1; continue; }
    if (seen.has(dedupKey(v))) { result.duplicates += 1; continue; }
    if (count >= CONFIG.maxDatesPerUser) { result.overLimit += 1; continue; }
    const entry = { id: newId(), ownerUserId: userId, ...v, sourceShareId, createdAt: now, updatedAt: now };
    await store.insertDate(entry);
    seen.add(dedupKey(v));
    count += 1;
    result.added.push(entry);
  }
  return result;
}

export async function createEntry(store, userId, draft, { now }) {
  const r = await addEntries(store, userId, [draft], { now });
  if (r.added.length) return { ok: true, entry: r.added[0] };
  return { ok: false, reason: r.duplicates ? 'duplicate' : r.overLimit ? 'limit' : 'invalid' };
}

export async function updateEntry(store, userId, id, draft, { now }) {
  const current = await store.getDate(userId, id); // ownership enforced in the query
  if (!current) return { ok: false, reason: 'not_found' };
  const v = normalizeDraft(draft);
  if (!v) return { ok: false, reason: 'invalid' };
  const others = (await store.listDates(userId)).filter((e) => e.id !== id);
  if (others.some((e) => dedupKey(e) === dedupKey(v))) return { ok: false, reason: 'duplicate' };
  const patch = { ...v, updatedAt: now };
  await store.updateDate(userId, id, patch);
  return { ok: true, entry: { ...current, ...patch } };
}

/** Returns the removed entry, or null when it doesn't exist / isn't the user's. */
export async function removeEntry(store, userId, id) {
  const entry = await store.getDate(userId, id);
  if (!entry) return null;
  await store.deleteDate(userId, id);
  return entry;
}
