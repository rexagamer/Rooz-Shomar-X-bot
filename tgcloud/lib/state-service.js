import { CONFIG } from './config.js';

/** Returns {state, payload} or null. Expired or corrupt rows are deleted. */
export async function getState(store, userId, now) {
  const row = await store.getState(userId);
  if (!row) return null;
  if (row.expiresAt <= now) {
    await store.clearState(userId);
    return null;
  }
  try {
    return { state: row.state, payload: JSON.parse(row.payload) };
  } catch {
    await store.clearState(userId);
    return null;
  }
}

export async function setState(store, userId, state, payload, now) {
  await store.saveState({
    userId,
    state,
    payload: JSON.stringify(payload ?? {}),
    updatedAt: now,
    expiresAt: now + CONFIG.stateTtlMs,
  });
}

export const clearState = (store, userId) => store.clearState(userId);
