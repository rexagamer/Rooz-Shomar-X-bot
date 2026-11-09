import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, addDate } from './helpers/harness.js';
import { T } from '../tgcloud/lib/formatters.js';
import { CONFIG } from '../tgcloud/lib/config.js';
import { handleMessage, handleCallbackQuery } from '../tgcloud/lib/router.js';
import { getState } from '../tgcloud/lib/state-service.js';

const A = 111;
const B = 222;
const stateOf = async (h, user) => (await h.store.getState(String(user)))?.state ?? null;

test('/start shows welcome, today (Tehran) and the empty state', async () => {
  const h = createHarness();
  await h.say(A, '/start');
  const { text } = h.lastSent();
  assert.ok(text.includes(T.welcome));
  assert.ok(text.includes('📅 امروز: ۱۸ آبان ۱۴۰۴'));
  assert.ok(text.includes(T.emptyList));
});

test('full /add flow: five steps, nothing saved before confirmation', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  assert.match(h.lastSent().text, /سال رو وارد کن/);
  await h.say(A, '۱۴۰۴');
  assert.match(h.lastSent().text, /شماره ماه/);
  await h.say(A, '۳');
  assert.match(h.lastSent().text, /روز ماه/);
  await h.say(A, '۱۵');
  assert.match(h.lastSent().text, /عنوان/);
  await h.say(A, 'شروع رابطه');

  const confirm = h.lastSent();
  assert.ok(confirm.text.includes('📌 شروع رابطه'));
  assert.ok(confirm.text.includes('📅 ۱۵ خرداد ۱۴۰۴'));
  assert.ok(confirm.text.includes('ثبتش کنم؟'));
  assert.deepEqual(h.buttons(confirm.keyboard).map((b) => b.callback_data), ['wc', 'wx']);
  assert.equal((await h.store.listDates('111')).length, 0);

  await h.press(A, 'wc');
  const [saved] = await h.store.listDates('111');
  assert.equal(saved.gregorianDate, '2025-06-05');
  assert.equal(saved.ownerUserId, '111');
  assert.ok(h.lastSent().text.includes('۱۵۷ روز گذشته'));
  assert.equal(await stateOf(h, A), null);
});

test('Arabic digits and Persian month names are accepted', async () => {
  const h = createHarness();
  await addDate(h, A, { y: '١٤٠٤', m: 'خرداد', d: '١٥', title: 'تولد' });
  const [saved] = await h.store.listDates('111');
  assert.deepEqual([saved.jalaliYear, saved.jalaliMonth, saved.jalaliDay], [1404, 3, 15]);
});

test('invalid year/month/day/title keep the user on the same step', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  for (const bad of ['abc', '۱۲۰۰', '99999']) {
    await h.say(A, bad);
    assert.equal(h.lastSent().text, T.badYear);
    assert.equal(await stateOf(h, A), 'w_year');
  }
  await h.say(A, '۱۴۰۴');
  for (const bad of ['۱۳', '0', 'ماه']) {
    await h.say(A, bad);
    assert.equal(h.lastSent().text, T.badMonth);
  }
  await h.say(A, 'مهر');
  for (const bad of ['۳۱', '۰', 'x']) {
    await h.say(A, bad);
    assert.equal(h.lastSent().text, T.badDay(1404, 7, 30));
  }
  await h.say(A, '۳۰');
  for (const bad of ['   ', 'x'.repeat(81)]) {
    await h.say(A, bad);
    assert.equal(h.lastSent().text, T.badTitle);
  }
  assert.equal(await stateOf(h, A), 'w_title');
});

test('Esfand 30 depends on leap year', async () => {
  const h = createHarness();
  await h.say(A, '/add'); await h.say(A, '۱۴۰۴'); await h.say(A, '۱۲'); await h.say(A, '۳۰');
  assert.equal(h.lastSent().text, T.badDay(1404, 12, 29));
  await h.say(A, '/add'); await h.say(A, '۱۴۰۳'); await h.say(A, '۱۲'); await h.say(A, '۳۰');
  assert.match(h.lastSent().text, /عنوان/);
});

test('/cancel works at every step and saves nothing', async () => {
  const inputs = ['۱۴۰۴', '۳', '۱۵', 'عنوان'];
  for (let k = 0; k <= inputs.length; k += 1) {
    const h = createHarness();
    await h.say(A, '/add');
    for (const input of inputs.slice(0, k)) await h.say(A, input);
    await h.say(A, '/cancel');
    assert.equal(h.lastSent().text, T.cancelled, `step ${k}`);
    assert.equal(await stateOf(h, A), null);
    assert.equal((await h.store.listDates('111')).length, 0);
  }
});

test('❌ button cancels the wizard', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  for (const i of ['۱۴۰۴', '۳', '۱۵', 'عنوان']) await h.say(A, i);
  await h.press(A, 'wx');
  assert.equal(await stateOf(h, A), null);
  assert.equal((await h.store.listDates('111')).length, 0);
});

test('/help and /start still work mid-wizard and the wizard resumes', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  await h.say(A, '۱۴۰۴');
  await h.say(A, '/help');
  assert.equal(h.lastSent().text, T.help);
  await h.say(A, '/start');
  assert.ok(h.lastSent().text.includes(T.welcome));
  assert.equal(await stateOf(h, A), 'w_month');
  await h.say(A, '۳');
  assert.match(h.lastSent().text, /روز ماه/);
});

test('abandoned flows expire after the TTL', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  h.deps.now += CONFIG.stateTtlMs + 1;
  await h.say(A, '۱۴۰۴');
  assert.ok(h.log.sent.some((m) => m.text === T.unknownMessage));
  assert.equal(await stateOf(h, A), null);
});

test('expired confirm button is rejected and saves nothing', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  for (const i of ['۱۴۰۴', '۳', '۱۵', 'عنوان']) await h.say(A, i);
  h.deps.now += CONFIG.stateTtlMs + 1;
  await h.press(A, 'wc');
  assert.equal(h.lastToast(), T.expired);
  assert.equal((await h.store.listDates('111')).length, 0);
});

test('corrupt state rows are discarded', async () => {
  const h = createHarness();
  await h.store.saveState({ userId: '111', state: 'w_year', payload: 'not json', updatedAt: 0, expiresAt: h.deps.now + 1000 });
  assert.equal(await getState(h.store, '111', h.deps.now), null);
  assert.equal(await stateOf(h, A), null);
});

test('states are isolated between users', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  await h.say(B, '/add');
  await h.say(A, '۱۴۰۴');
  await h.say(B, '۱۴۰۳');
  assert.equal(JSON.parse((await h.store.getState('111')).payload).year, 1404);
  assert.equal(JSON.parse((await h.store.getState('222')).payload).year, 1403);
  for (const [u, t] of [[A, 'اولی'], [B, 'دومی']]) {
    await h.say(u, '۱'); await h.say(u, '۱'); await h.say(u, t); await h.press(u, 'wc');
  }
  const a = await h.store.listDates('111');
  const b = await h.store.listDates('222');
  assert.deepEqual([a.length, a[0].jalaliYear, a[0].title], [1, 1404, 'اولی']);
  assert.deepEqual([b.length, b[0].jalaliYear, b[0].title], [1, 1403, 'دومی']);
  await h.say(A, '/list');
  assert.ok(!h.lastSent().text.includes('دومی'));
});

test('groups: polite refusal for commands, silence otherwise', async () => {
  const h = createHarness();
  const group = (text) => ({ chat: { id: -100, type: 'group' }, from: { id: A }, text });
  await handleMessage(h.deps, group('/add'));
  assert.equal(h.lastSent().text, T.privateOnly);
  const before = h.log.sent.length;
  await handleMessage(h.deps, group('hello'));
  assert.equal(h.log.sent.length, before);
  assert.equal(await stateOf(h, A), null);
});

test('unknown text and non-text messages get help plus dashboard', async () => {
  const h = createHarness();
  await h.say(A, 'سلام');
  assert.ok(h.log.sent.some((m) => m.text === T.unknownMessage));
  await h.say(A, undefined);
  assert.ok(h.log.sent.filter((m) => m.text === T.unknownMessage).length >= 2);
  await h.say(A, '/nonsense');
  assert.equal(h.lastSent().text, T.unknownCommand);
});

// ---------- ownership & forged callbacks ----------

test('forged or malformed callback data is rejected', async () => {
  const h = createHarness();
  await addDate(h, A);
  const bad = ['', 'zzz', 'dy', 'dy:abc', 'dy:ABCDEFGHJK:x', 'wc:1', 'e:../../', 'lp:-1', 'lp:abc', 'x'.repeat(100)];
  for (const data of bad) {
    await h.press(A, data);
    assert.equal(h.lastToast(), T.invalidButton, data);
  }
  assert.equal((await h.store.listDates('111')).length, 1);
});

test('callbacks from another chat or without a message are rejected', async () => {
  const h = createHarness();
  await addDate(h, A);
  await h.press(A, 'wx', { chatId: 999 });
  assert.equal(h.lastToast(), T.invalidButton);
  await handleCallbackQuery(h.deps, { id: 'x', from: { id: A }, data: 'wx' });
  assert.equal(h.lastToast(), T.invalidButton);
});

test('user B cannot list, open, edit or delete user A dates', async () => {
  const h = createHarness();
  await addDate(h, A);
  const [entry] = await h.store.listDates('111');

  await h.say(B, '/list');
  const listed = h.lastSent();
  assert.equal(String(listed.chatId), String(B));
  // A's entry would render as a line containing "روز گذشته" (the date is in the past).
  // Do not match on the title: the empty-state hint uses the same example title.
  assert.ok(!listed.text.includes('گذشته') && !listed.text.includes('باقی'), 'B sees an entry line: ' + listed.text);
  assert.equal(listed.keyboard, null);

  await h.say(B, '/delete');
  assert.equal(h.lastSent().text, T.emptyList);

  for (const data of [`d:${entry.id}`, `dy:${entry.id}`, `e:${entry.id}`, `et:${entry.id}`, `ed:${entry.id}`]) {
    await h.press(B, data);
    assert.equal(h.lastToast(), T.notFound, data);
  }
  assert.equal(await stateOf(h, B), null);
  assert.equal((await h.store.getDate('111', entry.id)).title, 'شروع رابطه');
});

// ---------- edit & delete flows ----------

test('edit title flow', async () => {
  const h = createHarness();
  await addDate(h, A);
  const [entry] = await h.store.listDates('111');
  await h.say(A, '/edit');
  assert.ok(h.buttons(h.lastSent().keyboard).some((b) => b.callback_data === `e:${entry.id}`));
  await h.press(A, `e:${entry.id}`);
  assert.deepEqual(
    h.buttons(h.lastEdited().keyboard).map((b) => b.callback_data),
    [`et:${entry.id}`, `ed:${entry.id}`, 'ep:0'],
  );
  await h.press(A, `et:${entry.id}`);
  await h.say(A, 'شروع زندگی مشترک');
  await h.press(A, 'wc');
  const updated = await h.store.getDate('111', entry.id);
  assert.equal(updated.title, 'شروع زندگی مشترک');
  assert.equal(updated.gregorianDate, '2025-06-05');
});

test('edit date flow keeps the title and recomputes the Gregorian date', async () => {
  const h = createHarness();
  await addDate(h, A);
  const [entry] = await h.store.listDates('111');
  await h.press(A, `ed:${entry.id}`);
  await h.say(A, '۱۴۰۳'); await h.say(A, '۱۲'); await h.say(A, '۳۰');
  assert.ok(h.lastSent().text.includes('ذخیره بشه'));
  await h.press(A, 'wc');
  const updated = await h.store.getDate('111', entry.id);
  assert.equal(updated.title, 'شروع رابطه');
  assert.equal(updated.gregorianDate, '2025-03-20');
});

test('delete flow with confirmation', async () => {
  const h = createHarness();
  await addDate(h, A);
  const [entry] = await h.store.listDates('111');
  await h.say(A, '/delete');
  await h.press(A, `d:${entry.id}`);
  assert.ok(h.buttons(h.lastEdited().keyboard).some((b) => b.callback_data === `dy:${entry.id}`));
  assert.equal((await h.store.listDates('111')).length, 1); // not yet
  await h.press(A, `dy:${entry.id}`);
  assert.equal((await h.store.listDates('111')).length, 0);
  assert.equal(h.lastSent().text.includes(T.emptyList), true);
});

test('pagination of the dashboard', async () => {
  const h = createHarness();
  for (let i = 1; i <= CONFIG.pageSize + 2; i += 1) {
    await addDate(h, A, { d: String(i), title: `مورد ${i}` });
  }
  await h.say(A, '/list');
  assert.ok(h.buttons(h.lastSent().keyboard).some((b) => b.callback_data === 'lp:1'));
  await h.press(A, 'lp:1');
  assert.ok(h.lastEdited().text.includes('صفحه ۲ از ۲'));
});
