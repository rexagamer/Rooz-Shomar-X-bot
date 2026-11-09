import { CONFIG } from './config.js';

const VALID_DISPLAY_MODES = new Set(['detailed', 'short']);

export function normalizeSettings(raw) {
  return {
    displayMode: raw && VALID_DISPLAY_MODES.has(raw.displayMode) ? raw.displayMode : CONFIG.defaultDisplayMode,
  };
}

export async function getSettings(store, userId) {
  const row = await store.getSettings(userId);
  return normalizeSettings(row);
}

export async function saveSettings(store, userId, patch, now) {
  const current = await getSettings(store, userId);
  const merged = { ...current, ...patch };
  if (patch.displayMode && !VALID_DISPLAY_MODES.has(patch.displayMode)) {
    merged.displayMode = current.displayMode;
  }
  await store.saveSettings({
    userId,
    displayMode: merged.displayMode,
    createdAt: now,
    updatedAt: now,
  });
  return merged;
}