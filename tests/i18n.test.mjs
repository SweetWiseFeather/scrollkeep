import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../i18n.js', import.meta.url), 'utf8');
function translator(language) {
  const context = vm.createContext({ chrome: { i18n: { getUILanguage: () => language } } });
  vm.runInContext(source, context);
  return context.ScrollKeepI18n;
}
test('English is the fallback and translates static and dynamic export messages', () => {
  const { text } = translator('fr');
  assert.equal(text('开始自动导出'), 'Start export');
  assert.equal(text('已捕获 5 段 · 40%'), 'Captured 5 sections · 40%');
  assert.match(text('已保存到下载文件夹 Demo：单页 PDF、2 张图片；1 张失败，详见清单'), /one PDF and 2 images; 1 failed/);
  assert.equal(text('导出失败：下载超时（超过两分钟）'), 'Export failed: Download timed out (over two minutes).');
  assert.equal(text('Browser error'), 'Browser error');
});
test('Chinese browsers retain Chinese UI and the catalog is idempotent', () => {
  const { text, chinese } = translator('zh-CN');
  assert.ok(chinese);
  assert.equal(text('开始自动导出'), '开始自动导出');
});
test('Manifest defaults to English, both locale catalogs resolve and the release is free', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.default_locale, 'en');
  for (const locale of ['en', 'zh_CN']) {
    const messages = JSON.parse(await readFile(new URL(`../_locales/${locale}/messages.json`, import.meta.url), 'utf8'));
    for (const key of ['extensionName', 'extensionDescription', 'actionTitle']) assert.ok(messages[key].message);
    assert.ok(messages.extensionDescription.message.length <= 132);
  }
  assert.ok(!manifest.permissions.includes('identity'));
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  assert.ok(html.includes('src="i18n.js"'));
  assert.ok(!html.includes('billing-config.js'));
});
