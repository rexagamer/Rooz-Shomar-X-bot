// tests/share-code.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  generateShareCode, normalizeShareCode, hashShareCode,
} from '../tgcloud/lib/share-code.js';
import { parseIntegerInput, parseMonthInput, parseTitleInput } from '../tgcloud/lib/input-parsers.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto; // Node test env only

test('generated codes have the expected format and are normalizable', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const code = generateShareCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    assert.ok(normalizeShareCode(code));
    seen.add(code);
  }
  assert.equal(seen.size, 200);
});

test('normalization ignores case and separators, rejects malformed', () => {
  assert.equal(normalizeShareCode('abcd-efgh-jklm-npqr'), 'ABCDEFGHJKLMNPQR');
  assert.equal(normalizeShareCode('ABCD EFGH JKLM NPQR'), 'ABCDEFGHJKLMNPQR');
  assert.equal(normalizeShareCode('ABCDEFGHJKLMNPQR'), 'ABCDEFGHJKLMNPQR');
  assert.equal(normalizeShareCode('ABCD-EFGH'), null);
  assert.equal(normalizeShareCode('ABCD-EFGH-JKLM-NPQ0'), null); // 0 not in alphabet
  assert.equal(normalizeShareCode(undefined), null);
});

test('hash is stable, hex, and not the plaintext', async () => {
  const h1 = await hashShareCode('ABCDEFGHJKLMNPQR');
  const h2 = await hashShareCode('ABCDEFGHJKLMNPQR');
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(h1, await hashShareCode('ABCDEFGHJKLMNPQS'));
});

test('input parsers', () => {
  assert.equal(parseIntegerInput('۱۴۰۴'), 1404);
  assert.equal(parseIntegerInput(' ١٤٠٤ '), 1404);
  assert.equal(parseIntegerInput('14x'), null);
  assert.equal(parseIntegerInput('-5'), null);
  assert.equal(parseMonthInput('۳'), 3);
  assert.equal(parseMonthInput('خرداد'), 3);
  assert.equal(parseMonthInput('اردیبهشت'), 2);
  assert.equal(parseMonthInput('13'), null);
  assert.equal(parseTitleInput('   '), null);
  assert.equal(parseTitleInput('  شروع   رابطه '), 'شروع رابطه');
  assert.equal(parseTitleInput('x'.repeat(81)), null);
});