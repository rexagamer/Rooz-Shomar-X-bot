import { createDeps } from '../lib/runtime.js';
import { handleCallbackQuery } from '../lib/router.js';

export default async function (callbackQuery) {
  await handleCallbackQuery(createDeps(), callbackQuery);
}
