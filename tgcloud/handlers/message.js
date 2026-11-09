import { createDeps } from '../lib/runtime.js';
import { handleMessage } from '../lib/router.js';

export default async function (message) {
  await handleMessage(createDeps(), message);
}
