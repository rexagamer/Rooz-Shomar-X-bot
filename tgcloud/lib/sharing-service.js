import { CONFIG } from './config.js';
import { generateShareCode, normalizeShareCode, hashShareCode } from './share-code.js';
import { addEntries, normalizeDraft } from './date-service.js';
import { newId } from './ids.js';

// ---------- rate limiting of failed import attempts ----------

async function checkRateLimit(store, userId, now) {
  const a = await store.getAttempts(userId);
  if (!a || now - a.windowStart >= CONFIG.importWindowMs) return { allowed: true };
  if (a.failures >= CONFIG.importMaxFailures) {
    return { allowed: false, retryAfterMs: a.windowStart + CONFIG.importWindowMs - now };
  }
  return { allowed: true };
}

async function recordFailure(store, userId, now) {
  const a = await store.getAttempts(userId);
  if (!a || now - a.windowStart >= CONFIG.importWindowMs) {
    await store.saveAttempts({ userId, windowStart: now, failures: 1 });
  } else {
    await store.saveAttempts({ userId, windowStart: a.windowStart, failures: a.failures + 1 });
  }
}

// ---------- creating ----------

/** entryIds === null shares everything. Foreign/unknown ids are silently ignored. */
export async function createShare(store, userId, entryIds, now) {
  const all = await store.listDates(userId);
  const wanted = entryIds ? new Set(entryIds) : null;
  const chosen = wanted ? all.filter((e) => wanted.has(e.id)) : all;
  if (chosen.length === 0) return { ok: false, reason: 'empty' };
  if ((await store.listActiveShares(userId)).length >= CONFIG.maxActiveShares) {
    return { ok: false, reason: 'limit' };
  }
  const snapshot = chosen.map((e) => ({
    t: e.title, y: e.jalaliYear, m: e.jalaliMonth, d: e.jalaliDay,
  }));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateShareCode();
    const codeHash = await hashShareCode(normalizeShareCode(code));
    if (await store.findShareByHash(codeHash)) continue; // collision: astronomically unlikely
    const share = {
      id: newId(), ownerUserId: userId, codeHash,
      snapshot: JSON.stringify(snapshot), dateCount: snapshot.length,
      createdAt: now, revokedAt: 0,
    };
    await store.insertShare(share);
    return { ok: true, code, share };
  }
  return { ok: false, reason: 'error' };
}

// ---------- importing ----------

function parseSnapshot(json) {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((i) => ({ title: i?.t, year: i?.y, month: i?.m, day: i?.d }))
      .filter((d) => normalizeDraft(d) !== null);
  } catch {
    return [];
  }
}

/** Revoked and unknown codes deliberately yield the same 'not_found' reason. */
export async function previewImport(store, userId, input, now) {
  const gate = await checkRateLimit(store, userId, now);
  if (!gate.allowed) return { ok: false, reason: 'rate_limited', retryAfterMs: gate.retryAfterMs };
  const raw = normalizeShareCode(input);
  if (!raw) {
    await recordFailure(store, userId, now);
    return { ok: false, reason: 'malformed' };
  }
  const share = await store.findShareByHash(await hashShareCode(raw));
  if (!share || share.revokedAt) {
    await recordFailure(store, userId, now);
    return { ok: false, reason: 'not_found' };
  }
  const items = parseSnapshot(share.snapshot);
  if (items.length === 0) return { ok: false, reason: 'not_found' };
  return { ok: true, share, items };
}

/** Re-checks the share at confirmation time, so a revocation in between wins. */
export async function importShare(store, userId, shareId, now) {
  const share = await store.getShareById(shareId);
  if (!share || share.revokedAt) return { ok: false, reason: 'not_found' };
  const result = await addEntries(store, userId, parseSnapshot(share.snapshot), {
    now, sourceShareId: share.id,
  });
  const importId = `${share.id}:${userId}`;
  if (!(await store.getImport(importId))) {
    await store.insertImport({ id: importId, shareId: share.id, recipientUserId: userId, importedAt: now });
  }
  return { ok: true, ...result };
}

// ---------- managing ----------

export async function listShares(store, userId) {
  return (await store.listActiveShares(userId)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getOwnedActiveShare(store, userId, id) {
  const share = await store.getShareById(id);
  return share && share.ownerUserId === userId && !share.revokedAt ? share : null;
}

/** Only the owner can revoke. Imported copies are untouched. */
export async function revokeShare(store, userId, id, now) {
  if (!(await getOwnedActiveShare(store, userId, id))) return false;
  await store.revokeShare(userId, id, now); // owner also enforced in the query
  return true;
}
