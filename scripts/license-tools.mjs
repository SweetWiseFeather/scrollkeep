import { webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const local = new URL('../.local-billing/', import.meta.url);
const command = process.argv[2];
if (command === 'init-test') {
  await mkdir(local, { recursive: true, mode: 0o700 });
  const configFile = new URL('test-config.json', local);
  try { await access(configFile); console.log('Using existing local test keys.'); process.exit(0); } catch {}
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKey = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  await writeFile(new URL('test-private-key.json', local), JSON.stringify(privateKey), { mode: 0o600, flag: 'wx' });
  await writeFile(configFile, JSON.stringify({ testMode: true, trialDays: 14, priceCents: 100, currency: 'USD', checkoutUrl: '', publicKey }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log('Created private test keys outside the extension package.');
} else if (command === 'issue-test') {
  const key = await webcrypto.subtle.importKey('jwk', JSON.parse(await readFile(new URL('test-private-key.json', local), 'utf8')), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = new Date();
  const expiration = new Date(now);
  expiration.setUTCFullYear(expiration.getUTCFullYear() + 1);
  const payload = { version: 1, product: 'scrollkeep', licenseId: webcrypto.randomUUID(), issuedAt: now.getTime(), expiresAt: expiration.getTime(), test: true };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body));
  const token = body + '.' + Buffer.from(signature).toString('base64url');
  const output = process.argv[3] ? resolve(process.argv[3]) : new URL('test-license.txt', local);
  await writeFile(output, token + '\n', { mode: 0o600 });
  console.log('Wrote a one-year TEST activation code. It cannot activate a production build.');
} else throw new Error('Usage: node scripts/license-tools.mjs init-test | issue-test [output-file]');
