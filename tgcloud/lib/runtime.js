import { createDbStore } from './db-store.js';
import { createTelegramClient } from './tg-client.js';

function logError(error) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error('handler error:', String(error?.message ?? error));
  }
}

export const createDeps = () => ({
  store: createDbStore(),
  tg: createTelegramClient(),
  now: Date.now(),
  onError: logError,
});
