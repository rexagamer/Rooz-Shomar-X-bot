import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, addDate, addDateWithButtons } from './helpers/harness.js';
import { T } from '../tgcloud/lib/formatters.js';
import { CONFIG } from '../tgcloud/lib/config.js';
import { handleMessage, handleCallbackQuery } from '../tgcloud/lib/router.js';
import { getState } from '../tgcloud/lib/state-service.js';

const A = 111;
const B = 222;
const stateOf = async (h, user) => (await h.store.getState(String(user)))?.state ?? null;

// ---------- reply keyboard ----------

test('/start shows welcome, today, reply keyboard and inline buttons', async () => {
  const h = createHarness();
  await h.say(A, '/start');
  const msg = h.lastSent();
  assert.ok(msg.text.includes('سلام! 🌱'));
  assert.ok(msg.text.includes('📅 امروز: ۱۸ آبان ۱۴۰۴'));
  assert.ok(msg.text.includes(T.emptyList) || msg.text.includes('هنوز'));
  // Reply keyboard is attached
  assert.ok(msg.replyKeyboard !== null);
  assert.ok(msg.replyKeyboard.keyboard.length >= 3);
  assert.equal(msg.replyKeyboard.resize_keyboard, true);
  assert.equal(msg.replyKeyboard.is_persistent, true);
  // Inline buttons for empty state
  const btns = h.buttons(msg.keyboard);
  assert.ok(btns.some((b) => b.callback_data === 'nav_add'));
});

test('reply keyboard button "📅 تاریخ‌های من" shows date list', async () => {
  const h = createHarness();
  await addDate(h, A);
  await h.say(A, '📅 تاریخ‌های من');
  const msg = h.lastSent();
  assert.ok(msg.text.includes('تاریخ‌های تو'));
  assert.ok(msg.text.includes('شروع رابطه'));
});

test('reply keyboard button "➕ ثبت تاریخ جدید" starts wizard', async () => {
  const h = createHarness();
  await h.say(A, '➕ ثبت تاریخ جدید');
  assert.ok(h.lastSent().text.includes('سال'));
  assert.equal(await stateOf(h, A), 'w_year');
});

test('reply keyboard button "🗓 امروز" shows dashboard', async () => {
  const h = createHarness();
  await h.say(A, '🗓 امروز');
  const msg = h.lastSent();
  assert.ok(msg.text.includes('📅 امروز'));
});

test('reply keyboard button "❓ راهنما" shows help', async () => {
  const h = createHarness();
  await h.say(A, '❓ راهنما');
  assert.ok(h.lastSent().text.includes('راهنمای روزشمار'));
});

test('reply keyboard button "📤 اشتراک‌گذاری" shows share menu', async () => {
  const h = createHarness();
  await addDate(h, A);
  await h.say(A, '📤 اشتراک‌گذاری');
  const btns = h.buttons(h.lastSent().keyboard);
  assert.ok(btns.some((b) => b.callback_data === 'sa'));
  assert.ok(btns.some((b) => b.callback_data === 'ss'));
});

test('reply keyboard button "📥 دریافت تاریخ" prompts for code', async () => {
  const h = createHarness();
  await h.say(A, '📥 دریافت تاریخ');
  assert.ok(h.lastSent().text.includes('کد اشتراک'));
  assert.equal(await stateOf(h, A), 'i_wait');
});

test('reply keyboard button "⚙️ تنظیمات" shows settings', async () => {
  const h = createHarness();
  await h.say(A, '⚙️ تنظیمات');
  const msg = h.lastSent();
  assert.ok(msg.text.includes('تنظیمات'));
  assert.ok(h.buttons(msg.keyboard).some((b) => b.callback_data === 'set_detailed'));
});

// ---------- add flow with inline buttons ----------

test('full /add flow: five steps with text input', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  assert.match(h.lastSent().text, /سال/);
  // Year prompt should have year buttons
  const yearBtns = h.buttons(h.lastSent().keyboard);
  assert.ok(yearBtns.some((b) => b.callback_data === 'wy:1404'));

  await h.say(A, '۱۴۰۴');
  // Month prompt should have month buttons
  const monthBtns = h.buttons(h.lastSent().keyboard);
  assert.ok(monthBtns.some((b) => b.callback_data === 'wm3'));

  await h.say(A, '۳');
  assert.match(h.lastSent().text, /روز ماه/);
  await h.say(A, '۱۵');
  // Title prompt should have suggestions
  const titleBtns = h.buttons(h.lastSent().keyboard);
  assert.ok(titleBtns.some((b) => b.callback_data === 'wts1'));

  await h.say(A, 'شروع رابطه');
  const confirm = h.lastSent();
  assert.ok(confirm.text.includes('📌') || confirm.text.includes('شروع رابطه'));
  assert.ok(confirm.text.includes('۱۵ خرداد ۱۴۰۴'));
  assert.deepEqual(h.buttons(confirm.keyboard).map((b) => b.callback_data), ['wc', 'wx']);
  assert.equal((await h.store.listDates('111')).length, 0);

  await h.press(A, 'wc');
  const [saved] = await h.store.listDates('111');
  assert.equal(saved.gregorianDate, '2025-06-05');
  assert.equal(saved.ownerUserId, '111');
  assert.equal(await stateOf(h, A), null);
});

test('add flow with inline year button', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  await h.press(A, 'wy:1404');
  // Should now be on month step
  const monthBtns = h.buttons(h.lastSent().keyboard);
  assert.ok(monthBtns.some((b) => b.callback_data === 'wm1'));
  assert.equal(await stateOf(h, A), 'w_month');
});

test('add flow with inline month button', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  await h.say(A, '۱۴۰۴');
  await h.press(A, 'wm3'); // خرداد
  assert.match(h.lastSent().text, /روز ماه/);
  assert.equal(await stateOf(h, A), 'w_day');
});

test('add flow with title suggestion button', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  await h.say(A, '۱۴۰۴');
  await h.say(A, '۳');
  await h.say(A, '۱۵');
  await h.press(A, 'wts1'); // "شروع رابطه"
  assert.ok(h.lastSent().text.includes('شروع رابطه'));
  assert.equal(await stateOf(h, A), 'w_confirm');
});

test('add flow with "custom title" button then text', async () => {
  const h = createHarness();
  await h.say(A, '/add');
  await h.say(A, '۱۴۰۴');
  await h.say(A, '۳');
  await h.say(A, '۱۵');
  await h.press(A, 'wts5'); // "عنوان دلخواه"
  assert.ok(h.lastSent().text.includes('دلخواه'));
  assert.equal(await stateOf(h, A), 'w_title'); // still on title step
  await h.say(A, 'تاریخ من');
  assert.equal(await stateOf(h, A), 'w_confirm');
});

test('full add with all inline buttons', async () => {
  const h = createHarness();
  await addDateWithButtons(h, A, { y: 1404, m: 3, d: '۱۵', title: 'تولد' });
  const [saved] = await h.store.listDates('111');
  assert.equal(saved.title, 'تولد');
  assert.equal(saved.jalaliYear, 1404);
  assert.equal(saved.jalaliMonth, 3);
});

test('Arabic digits and Persian month names still accepted', async () => {
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
  assert.ok(h.lastSent().text.includes('راهنمای روزشمار'));
  await h.say(A, '/start');
  assert.ok(h.lastSent().text.includes('سلام'));
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

// ---------- date list with inline actions ----------

test('date list shows edit/delete/share buttons per entry', async () => {
  const h = createHarness();
  await addDate(h, A);
  await h.say(A, '📅 تاریخ‌های من');
  const msg = h.lastSent();
  assert.ok(msg.text.includes('شروع رابطه'));
  const btns = h.buttons(msg.keyboard);
  const [entry] = await h.store.listDates('111');
  assert.ok(btns.some((b) => b.callback_data === `e:${entry.id}`));
  assert.ok(btns.some((b) => b.callback_data === `d:${entry.id}`));
  assert.ok(btns.some((b) => b.callback_data === `es:${entry.id}`));
});

test('date list shows calendar duration in detailed mode', async () => {
  const h = createHarness();
  await addDate(h, A);
  await h.say(A, '📅 تاریخ‌های من');
  const msg = h.lastSent();
  // The date 1404/3/15 -> 2025-06-05, today is 2025-11-09
  // Should show something like "۵ ماه و ۴ روز گذشته" (calendar-aware)
  assert.ok(msg.text.includes('ماه') || msg.text.includes('روز'));
});

test('date list pagination with dlp callback', async () => {
  const h = createHarness();
  for (let i = 1; i <= CONFIG.dateListPageSize + 2; i += 1) {
    await addDate(h, A, { d: String(i), title: `مورد ${i}` });
  }
  await h.say(A, '📅 تاریخ‌های من');
  const btns = h.buttons(h.lastSent().keyboard);
  assert.ok(btns.some((b) => b.callback_data === 'dlp:1'));
  await h.press(A, 'dlp:1');
  assert.ok(h.lastEdited().text.includes('صفحه ۲'));
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
  assert.ok(!listed.text.includes('گذشته') && !listed.text.includes('باقی'), 'B sees an entry line');

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
    [`et:${entry.id}`, `ed:${entry.id}`, 'dlp:0'],
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
  assert.equal((await h.store.listDates('111')).length, 1);
  await h.press(A, `dy:${entry.id}`);
  assert.equal((await h.store.listDates('111')).length, 0);
});

test('pagination of the dashboard', async () => {
  const h = createHarness();
  for (let i = 1; i <= CONFIG.pageSize + 2; i += 1) {
    await addDate(h, A, { d: String(i), title: `مورد ${i}` });
  }
  await h.say(A, '/list');
  assert.ok(h.buttons(h.lastSent().keyboard).some((b) => b.callback_data === 'dlp:1'));
  await h.press(A, 'dlp:1');
  assert.ok(h.lastEdited().text.includes('صفحه ۲'));
});

// ---------- settings ----------

test('settings: toggle display mode', async () => {
  const h = createHarness();
  await h.say(A, '⚙️ تنظیمات');
  const msg = h.lastSent();
  assert.ok(msg.text.includes('تنظیمات'));

  await h.press(A, 'set_short');
  assert.equal(h.lastToast(), T.settingsSaved);
  const settings = await h.store.getSettings('111');
  assert.equal(settings.displayMode, 'short');

  await h.press(A, 'set_detailed');
  assert.equal((await h.store.getSettings('111')).displayMode, 'detailed');
});

test('settings: display mode affects date list output', async () => {
  const h = createHarness();
  await addDate(h, A);

  // Default is detailed -> shows year/month/day
  await h.say(A, '📅 تاریخ‌های من');
  const detailed = h.lastSent().text;
  assert.ok(detailed.includes('ماه') || detailed.includes('سال'));

  // Switch to short
  await h.say(A, '⚙️ تنظیمات');
  await h.press(A, 'set_short');
  await h.say(A, '📅 تاریخ‌های من');
  const short = h.lastSent().text;
  assert.ok(short.includes('روز گذشته'));
});

// ---------- import via button ----------

test('import via reply button: enter code as text', async () => {
  const h = createHarness();
  await addDate(h, A);
  // Create share
  await h.say(A, '📤 اشتراک‌گذاری');
  await h.press(A, 'sa');
  const codeMatch = /[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}/.exec(h.lastEdited().text);
  const code = codeMatch[0];

  // User B uses reply keyboard to import
  await h.say(B, '📥 دریافت تاریخ');
  assert.equal(await stateOf(h, B), 'i_wait');
  await h.say(B, code);
  // Should show preview
  assert.ok(h.lastSent().text.includes('آماده دریافت'));
  assert.equal(await stateOf(h, B), 'i_confirm');
  await h.press(B, 'ic');
  assert.equal((await h.store.listDates('222')).length, 1);
});

// ---------- nav callbacks ----------

test('nav_home callback returns to dashboard', async () => {
  const h = createHarness();
  await addDate(h, A);
  await h.say(A, '📅 تاریخ‌های من');
  await h.press(A, 'nav_home');
  assert.ok(h.lastEdited().text.includes('📅 امروز'));
});

test('nav_add callback starts wizard', async () => {
  const h = createHarness();
  await h.press(A, 'nav_add');
  assert.ok(h.lastSent().text.includes('سال'));
  assert.equal(await stateOf(h, A), 'w_year');
});

// ---------- single entry share ----------

test('share single entry from date list', async () => {
  const h = createHarness();
  await addDate(h, A);
  const [entry] = await h.store.listDates('111');
  await h.press(A, `es:${entry.id}`);
  assert.ok(h.lastEdited().text.includes('کد اشتراک'));
});

test('share single entry: user B cannot share user A entry', async () => {
  const h = createHarness();
  await addDate(h, A);
  const [entry] = await h.store.listDates('111');
  await h.press(B, `es:${entry.id}`);
  assert.equal(h.lastToast(), T.notFound);
});
