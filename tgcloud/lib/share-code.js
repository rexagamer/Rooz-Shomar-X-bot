import { normalizeDigits } from './jalali.js';

// 32 symbols (no I, O, 0, 1). 256 % 32 === 0, so byte % 32 is unbiased.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 16; // 16 * 5 bits = 80 bits of entropy

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Secure random source is not available');
  }
  return c;
}

export function formatShareCode(raw) {
  return raw.match(/.{4}/g).join('-');
}

/** Returns "ABCD-EFGH-JKLM-NPQR". */
export function generateShareCode() {
  const bytes = getCrypto().getRandomValues(new Uint8Array(SHARE_CODE_LENGTH));
  let raw = '';
  for (const b of bytes) raw += ALPHABET[b % ALPHABET.length];
  return formatShareCode(raw);
}

/** Case/separator-insensitive. Returns 16 raw chars or null if malformed. */
export function normalizeShareCode(input) {
  if (typeof input !== 'string') return null;
  const raw = normalizeDigits(input).toUpperCase().replace(/[\s\-_]/g, '');
  return /^[A-HJ-NP-Z2-9]{16}$/.test(raw) ? raw : null;
}

/** SHA-256 hex of the normalized code. Store this, never the code. */
export async function hashShareCode(rawCode) {
  const c = getCrypto();
  if (!c.subtle) throw new Error('SubtleCrypto is not available');
  const digest = await c.subtle.digest('SHA-256', new TextEncoder().encode(rawCode));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}