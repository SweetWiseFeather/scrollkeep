import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const source = await readFile(new URL('../store-edition/billing.js', import.meta.url), 'utf8');
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const DAY = 86400000;
const initialTime = Date.UTC(2026, 8, 30);
async function token(issuedAt, expiresAt, extra = {}, key = pair.privateKey) {
  const payload = { product: 'scrollkeep', version: 1, licenseId: 'test-license', issuedAt, expiresAt, test: true, ...extra };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body));
  return body + '.' + Buffer.from(signature).toString('base64url');
}
function harness(testMode = true) {
  let now = initialTime;
  let storage = {};
  class TestDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    SCROLLKEEP_BILLING_CONFIG: { testMode, trialDays: 14, publicKey },
    Date: TestDate, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, atob,
    chrome: { runtime: { onMessage: { addListener() {} } }, storage: { local: {
      async get() { return structuredClone(storage); },
      async set(values) { storage = structuredClone({ ...storage, ...values }); }
    } } }
  });
  vm.runInContext(source, context);
  return { billing: context.ScrollKeepBilling, advance: (days) => { now += days * DAY; }, now: () => now };
}
test('trial starts explicitly, lasts exactly 14 days, and cannot restart', async () => {
  const h = harness();
  assert.equal((await h.billing.getStatus()).allowed, false);
  const started = await h.billing.startTrial();
  assert.equal(started.daysLeft, 14);
  h.advance(13.999);
  assert.equal((await h.billing.getStatus()).allowed, true);
  h.advance(.001);
  assert.equal((await h.billing.getStatus()).allowed, false);
  assert.equal((await h.billing.startTrial()).allowed, false);
});
test('rolling back the clock cannot restart an expired trial', async () => {
  const h = harness();
  await h.billing.startTrial(); h.advance(15);
  assert.equal((await h.billing.getStatus()).allowed, false);
  h.advance(-14);
  assert.equal((await h.billing.getStatus()).allowed, false);
});
test('annual signed license activates, restores, expires, and can be renewed', async () => {
  const h = harness();
  const license = await token(h.now(), h.now() + 365 * DAY);
  assert.equal((await h.billing.activate(license)).state, 'licensed');
  assert.equal((await h.billing.activate(license)).state, 'licensed');
  h.advance(365);
  assert.equal((await h.billing.getStatus()).allowed, false);
  const renewed = await token(h.now(), h.now() + 365 * DAY);
  assert.equal((await h.billing.activate(renewed)).allowed, true);
});
test('rejects forged, expired, wrong-product and future licenses', async () => {
  const h = harness();
  const other = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  await assert.rejects(h.billing.activate(await token(h.now(), h.now() + DAY, {}, other.privateKey)), /签名无效/);
  await assert.rejects(h.billing.activate(await token(h.now() - 2 * DAY, h.now() - DAY)), /已到期/);
  await assert.rejects(h.billing.activate(await token(h.now(), h.now() + DAY, { product: 'other' })), /内容无效/);
  await assert.rejects(h.billing.activate(await token(h.now() + DAY, h.now() + 2 * DAY)), /尚未生效/);
});
test('test and production licenses are separated; short licenses cannot overwrite longer ones', async () => {
  const h = harness();
  await assert.rejects(h.billing.activate(await token(h.now(), h.now() + DAY, { test: false })), /测试激活码/);
  await h.billing.activate(await token(h.now(), h.now() + 365 * DAY));
  await assert.rejects(h.billing.activate(await token(h.now(), h.now() + DAY)), /有效期更短/);
  const production = harness(false);
  await assert.rejects(production.billing.activate(await token(production.now(), production.now() + DAY)), /测试激活码/);
});

test('expired access blocks export in the background before attaching the debugger', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  let listener;
  let attached = false;
  const context = vm.createContext({
    console,
    ScrollKeepBilling: { async getStatus() { return { allowed: false, text: '试用已结束' }; } },
    chrome: {
      debugger: { onDetach: { addListener() {} }, async attach() { attached = true; } },
      runtime: { onMessage: { addListener(fn) { listener = fn; } } }
    }
  });
  vm.runInContext(background, context);
  const response = await new Promise((resolve) => listener({ type: 'START_EXPORT', tabId: 7 }, {}, resolve));
  assert.equal(response.ok, false);
  assert.match(response.error, /试用已结束/);
  assert.equal(attached, false);
});
