import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const background = await readFile(new URL('background.js', root), 'utf8');
const offscreenSource = await readFile(new URL('offscreen.js', root), 'utf8');

async function runExport(mode = 'normal') {
  const listeners = [];
  let detachListener;
  let clock = 0;
  class FastDate extends Date { static now() { return clock += 1000; } }
  const downloads = [];
  const commands = [];
  const tabMessages = [];
  const files = [];
  const released = [];
  let lastExport;
  let cleaned = false;
  let detached = false;
  let pendingDownloads = 0;
  let captures = 0;
  const send = (message, sender = {}) => {
    let response;
    for (const listener of listeners) listener(message, sender, (value) => { response = value; });
    return response;
  };
  const chrome = {
    debugger: {
      onDetach: { addListener(fn) { detachListener = fn; } },
      async attach() { if (mode === 'attach-failure') throw new Error('already attached'); },
      async detach() { detached = true; },
      async sendCommand(_target, method, params) {
        commands.push({ method, params });
        if (method === 'Page.captureScreenshot') {
          captures++;
          if (mode === 'cancel') send({ type: 'CANCEL_EXPORT' });
          if (mode === 'detach') detachListener({ tabId: 7 });
          return { data: 'screenshot' };
        }
        if (method === 'Page.getResourceTree') return { frameTree: { frame: { id: 'main' }, resources: [{ url: 'https://images.test/a', mimeType: 'image/png' }] } };
        if (method === 'Page.getResourceContent') return { content: 'aW1hZ2U=', base64Encoded: true };
        return {};
      }
    },
    tabs: {
      // Intentionally inactive: export must never rely on activeTab screenshots.
      async get() { return { id: 7, active: false, url: 'https://document.test/', title: 'Document' }; },
      async sendMessage(_id, message) {
        tabMessages.push(message);
        if (message.type === 'INIT_CAPTURE') return { ok: true, title: 'Document' };
        if (message.type === 'PREPARE_CAPTURE') return { ok: true, rect: {}, top: 0, maxTop: 0, contentTop: 0, images: [{ url: 'https://images.test/a' }, { url: 'https://images.test/a' }, { url: 'blob:https://document.test/b' }, { url: 'https://images.test/fail' }] };
        if (message.type === 'SCROLL_NEXT') return { moved: 0 };
        if (message.type === 'READ_IMAGE') return message.url.startsWith('blob:') ? { ok: true, mime: 'image/webp', content: 'aW1hZ2U=', base64Encoded: true } : { ok: false };
        if (message.type === 'CLEANUP_CAPTURE') cleaned = true;
        return { ok: true };
      }
    },
    scripting: { async executeScript() {} },
    runtime: {
      onMessage: { addListener(fn) { listeners.push(fn); } },
      getURL: (path) => path,
      async getContexts() { return []; },
      async sendMessage(message) {
        if (message.type === 'PDF_RESET') return { ok: true, folder: 'Document_unique' };
        if (message.type === 'PDF_ADD_IMAGE') return { ok: true, added: true };
        if (message.type === 'PDF_BUILD') return { ok: true, url: 'blob:pdf', filename: 'Document.pdf' };
        if (message.type === 'FILE_BUILD') { files.push(message); return { ok: true, url: `blob:file${files.length}` }; }
        if (message.type === 'PDF_RELEASE') released.push(message.url);
        return { ok: true };
      }
    },
    offscreen: { async createDocument() {} },
    downloads: {
      async download(options) { downloads.push(options); return downloads.length; },
      async search({ id }) {
        if (downloads[id - 1].url.includes('/fail')) return [{ state: 'interrupted', error: 'SERVER_FORBIDDEN' }];
        if (mode === 'pending' && pendingDownloads++ < 3) return [{ state: 'in_progress' }];
        if (mode === 'download-timeout') return [{ state: 'in_progress' }];
        return [{ state: 'complete', mime: 'image/png' }];
      },
      async cancel() {}
    },
    storage: { local: { async set(value) { lastExport = value.lastExport; } } },
    action: { async setBadgeText() {} }
  };
  const context = vm.createContext({ chrome, Date: FastDate, console: { error() {} }, setTimeout: (fn) => setTimeout(fn, 0) });
  vm.runInContext(background, context);
  assert.equal(send({ type: 'START_EXPORT', tabId: 7 }).ok, true);
  assert.equal(send({ type: 'START_EXPORT', tabId: 7 }).ok, false);
  const deadline = Date.now() + 5000;
  while (send({ type: 'GET_EXPORT_STATUS' }).running && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
  assert.equal(send({ type: 'GET_EXPORT_STATUS' }).running, false, 'job must terminate');
  return { downloads, commands, tabMessages, files, released, lastExport, cleaned, detached, captures };
}

test('inactive tab exports PDF and deduplicated images into one folder; failures are reported', async () => {
  const result = await runExport();
  assert.equal(result.captures, 1);
  assert.ok(result.commands.some((c) => c.method === 'Page.captureScreenshot' && c.params.fromSurface));
  assert.ok(result.downloads.every((d) => d.filename.startsWith('Document_unique/') && !d.saveAs));
  assert.ok(result.downloads.some((d) => d.filename.endsWith('/images/0001.png')));
  assert.ok(result.downloads.some((d) => d.filename.endsWith('/images/0002.webp')));
  const report = JSON.parse(result.files.find((f) => f.mime === 'application/json').content);
  assert.equal(report.images.length, 3);
  assert.deepEqual(report.images.map((i) => i.status), ['saved', 'saved', 'failed']);
  assert.equal(report.pdf, 'Document.pdf');
  assert.match(result.lastExport.text, /1 张失败/);
  assert.equal(result.released.length, 4);
  assert.ok(result.cleaned && result.detached);
});

test('download waits for completion before releasing file URLs', async () => {
  const result = await runExport('pending');
  assert.match(result.lastExport.text, /已保存/);
  assert.equal(result.released.length, 4);
});

test('cancel and debugger disconnect terminate without building a PDF and restore the page', async () => {
  for (const mode of ['cancel', 'detach']) {
    const result = await runExport(mode);
    assert.ok(result.cleaned);
    assert.equal(result.downloads.length, 0);
    assert.match(result.lastExport.text, mode === 'cancel' ? /已取消/ : /连接已断开/);
  }
});

test('attach failure reports an actionable error without changing the page', async () => {
  const result = await runExport('attach-failure');
  assert.equal(result.cleaned, false);
  assert.match(result.lastExport.text, /关闭目标页的开发者工具/);
});

test('download timeout terminates instead of hanging forever', async () => {
  const result = await runExport('download-timeout');
  assert.match(result.lastExport.text, /下载超时/);
  assert.ok(result.cleaned && result.detached);
});

function pdfContext() {
  const listeners = [];
  const crops = [];
  const context = vm.createContext({
    chrome: { runtime: { onMessage: { addListener(fn) { listeners.push(fn); } } } },
    TextEncoder, Blob, Uint8Array, URL, crypto, atob, fetch,
    createImageBitmap: async () => ({ width: 1250, height: 1000, close() {} }),
    OffscreenCanvas: class {
      constructor(width, height) { this.width = width; this.height = height; }
      getContext() { return { drawImage: (...args) => crops.push(args.slice(1)) }; }
      async convertToBlob() { return new Blob([new Uint8Array([255, 216, 255, 217])]); }
    }
  });
  vm.runInContext(offscreenSource, context);
  return { context, crops, listeners };
}

test('fractional zoom stitching preserves absolute pixel length and overlaps only existing rows', async () => {
  const { context, crops } = pdfContext();
  const rect = { left: 0, top: 0, width: 1000, height: 800, viewportWidth: 1000, viewportHeight: 800 };
  const add = (contentTop, first = false, changedRect = rect) => context.addImage({ dataUrl: 'data:image/png;base64,AA==', rect: changedRect, contentTop, first });
  await add(0, true);
  await add(600.4);
  await add(1000.8);
  assert.equal(crops[1][1], 247);
  assert.equal(crops[2][1], 498);
  const length = vm.runInContext('pages.reduce((n, p) => n + p.height - p.overlap, 0)', context);
  assert.equal(length, Math.round(1000.8 * 1.25) + 1000);
  await assert.rejects(add(1800, false, { ...rect, width: 999 }), /窗口尺寸/);
});

test('PDF remains one page above 14,400 points and has valid object offsets', async () => {
  const { context } = pdfContext();
  const items = Array.from({ length: 40 }, () => ({ width: 1000, height: 1000, bytes: new Uint8Array([255, 216, 255, 217]) }));
  const bytes = new Uint8Array(await context.pdfBytes(items).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /\/Count 1 \/Kids \[3 0 R\]/);
  const page = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\] \/UserUnit ([\d.]+)/);
  assert.ok(Number(page[2]) <= 14000);
  assert.ok(Number(page[3]) > 1);
  const start = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(new TextDecoder().decode(bytes.slice(start, start + 4)), 'xref');
  const entries = text.slice(text.indexOf('xref\n')).split('\n');
  for (let i = 3; /^\d{10} 00000 n/.test(entries[i] || ''); i++) {
    const offset = Number(entries[i].slice(0, 10));
    assert.match(new TextDecoder().decode(bytes.slice(offset, offset + 20)), new RegExp(`^${i - 2} 0 obj`));
  }
  assert.throws(() => context.pdfBytes([]), /尺寸无效/);
});
