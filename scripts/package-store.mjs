import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { createZip } from './zip.mjs';
const root = new URL('../', import.meta.url);
const testMode = process.argv.includes('--test');
const configIndex = process.argv.indexOf('--config');
if (!testMode && (configIndex < 0 || !process.argv[configIndex + 1])) throw new Error('Production package requires --config and real payment/signing configuration; use --test for a clearly labeled test package.');
const path = testMode ? new URL('.local-billing/test-config.json', root) : resolve(process.argv[configIndex + 1]);
const config = JSON.parse(await readFile(path, 'utf8'));
if (config.testMode !== testMode || config.trialDays !== 14 || config.priceCents !== 100 || config.currency !== 'USD') throw new Error('Invalid pricing or build mode configuration.');
if (config.publicKey?.d) throw new Error('Never include a private signing key in an extension.');
await webcrypto.subtle.importKey('jwk', config.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
if (!testMode) {
  const checkout = new URL(config.checkoutUrl);
  if (checkout.protocol !== 'https:' || checkout.username || checkout.password || /(^|\.)(localhost|example\.(com|org|net))$/.test(checkout.hostname) || /^127\./.test(checkout.hostname)) throw new Error('A real HTTPS checkout URL is required.');
  if (!config.paymentIntegrationVerified) throw new Error('Verify payment collection and license delivery before building a production package.');
  try {
    const localTest = JSON.parse(await readFile(new URL('.local-billing/test-config.json', root), 'utf8'));
    if (localTest.publicKey.x === config.publicKey.x && localTest.publicKey.y === config.publicKey.y) throw new Error('Production must not use the test signing key.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
manifest.version = '0.4.0';
manifest.name = testMode ? 'ScrollKeep · 收费测试版' : 'ScrollKeep · 长页存档';
manifest.description = testMode ? '收费测试包：14 天试用及一年授权验证，尚未接入真实收款。' : '后台归档长网页为单页 PDF 和图片。免费试用 14 天，之后 US$1/年。';
const paths = ['i18n.js', '_locales/en/messages.json', '_locales/zh_CN/messages.json', 'background.js', 'content.js', 'offscreen.html', 'offscreen.js', 'popup.html', 'popup.js', 'popup.css', 'LICENSE', 'PRIVACY.md', ...Object.values(manifest.icons)];
const files = {};
for (const filename of paths) files[filename] = await readFile(new URL(filename, root));
files['manifest.json'] = JSON.stringify(manifest, null, 2);
files['background.js'] = 'importScripts("billing-config.js", "billing.js");\n' + files['background.js'];
const section = await readFile(new URL('store-edition/popup-section.html', root), 'utf8');
files['popup.html'] = files['popup.html'].toString()
  .replace('<p id="hint">', section + '\n    <p id="hint">')
  .replace('<button id="start">', '<button id="start" disabled>')
  .replace('<script src="popup.js"></script>', '<script src="billing-config.js"></script><script src="popup.js"></script><script src="popup-billing.js"></script>');
files['popup.css'] = files['popup.css'] + '\n.billing{border:1px solid #d0d5dd;border-radius:9px;padding:12px;margin:12px 0}.billing button{margin-top:8px}.billing details{margin-top:12px;font-size:12px}.billing textarea{box-sizing:border-box;width:100%;resize:vertical}.billing p{margin:0 0 8px}\n';
files['billing-config.js'] = `globalThis.SCROLLKEEP_BILLING_CONFIG = ${JSON.stringify({ testMode, trialDays: 14, priceCents: 100, currency: 'USD', checkoutUrl: config.checkoutUrl || '', publicKey: config.publicKey })};\n`;
files['billing.js'] = await readFile(new URL('store-edition/billing.js', root));
files['popup-billing.js'] = await readFile(new URL('store-edition/popup-billing.js', root));
files['PRIVACY.md'] = files['PRIVACY.md'] + '\n## Store edition licensing\n\nThe store edition additionally retains a trial start timestamp, the latest observed local time, and a signed annual license in Chrome local storage. Signature verification is performed locally; the extension does not upload webpage contents for licensing. Uninstalling clears this local state. Keep your activation code to restore purchases. The test edition has no checkout or payment collection. A production edition must document its actual payment provider and data handling before publication.\n';
files['BUILD-NOTICE.txt'] = testMode ? 'TEST BUILD. No real payment integration. Do not submit for production review. Test licenses only; 14-day local trial.\n' : 'Annual paid edition. 14-day trial; USD 1 per year.\n';
await mkdir(new URL('dist/', root), { recursive: true });
const filename = `scrollkeep-store-0.4.0${testMode ? '-TEST' : ''}.zip`;
await writeFile(new URL(`dist/${filename}`, root), createZip(files));
console.log(`Built dist/${filename}. ${testMode ? 'TEST ONLY: payment is not configured.' : 'Ensure privacy and store disclosures match the actual checkout provider.'}`);
