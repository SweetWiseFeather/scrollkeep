// Isolated Chrome profile: never connects to the user's browser or account.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const content = await readFile(new URL('../content.js', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../i18n.js', import.meta.url), 'utf8');
const offscreen = await readFile(new URL('../offscreen.js', import.meta.url), 'utf8');
const profile = await mkdtemp(join(tmpdir(), 'pdf-exporter-smoke-'));
const server = createServer((req, res) => {
  if (req.url === '/cached.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/other') return res.end('<body style="background:#cc00cc">Other tab</body>');
  res.end(`<body style="margin:0;background:rgb(240,250,230);font-family:system-ui,sans-serif"><h1 style="margin:24px">ScrollKeep Demo · A Long Reading Guide</h1><img src="/cached.svg">
    ${Array.from({ length: 12 }, (_, i) => `<section style="height:500px;padding-left:32px"><h2>Section ${i + 1} · Keep your reading materials offline</h2><p style="max-width:580px;line-height:1.8">This self-authored demo shows ScrollKeep capturing a long webpage. Save the sections as one continuous PDF, with loaded images and a source manifest in the same folder.</p><img loading="lazy" alt="image-${i}" width="100" height="100" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='blue'/%3E%3C/svg%3E"></section>`).join('')}
    <script>window.addEventListener('load', () => { const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'], {type:'image/svg+xml'}); const img = new Image(); img.src = URL.createObjectURL(blob); document.body.append(img); });</script>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--window-size=1000,800', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
const sockets = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    browser.stderr.on('data', (data) => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}): ${output.slice(-1000)}`)); });
  });
  async function connect(url) {
    const socket = new WebSocket(url);
    sockets.push(socket);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    };
    return (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out`)); }, 15000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  const control = await connect(endpoint);
  const base = endpoint.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*/, '');
  const { targetId } = await control('Target.createTarget', { url: `http://127.0.0.1:${port}/` });
  const targets = await (await fetch(`${base}/json/list`)).json();
  const page = await connect(targets.find((t) => t.id === targetId).webSocketDebuggerUrl);
  const evaluate = async (expression) => {
    const response = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await page('Page.enable');
  if (process.argv.includes('--store-screenshot')) {
    await page('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  }
  await page('Emulation.setFocusEmulationEnabled', { enabled: true });
  await evaluate(`new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r, {once:true}))`);
  await evaluate(`globalThis.chrome = {i18n:{getUILanguage:()=> 'en'},runtime:{onMessage:{addListener(fn){globalThis.captureListener=fn}},sendMessage:async()=>({ok:true})}};
    globalThis.sendCapture = (message) => new Promise(resolve => captureListener(message, {}, resolve));`);
  await evaluate(i18n);
  await evaluate(content);
  await evaluate(`sendCapture({type:'INIT_CAPTURE',resetTop:true})`);
  assert.match(await evaluate(`document.querySelector('#__scrollkeep_exporter_ui').shadowRoot.querySelector('.finish').textContent`), /Finish and save/);
  const tree = await page('Page.getResourceTree');
  const resource = tree.frameTree.resources.find((r) => r.url.endsWith('/cached.svg'));
  assert.equal(resource.mimeType, 'image/svg+xml');
  const original = await page('Page.getResourceContent', { frameId: tree.frameTree.frame.id, url: resource.url });
  const originalText = original.base64Encoded ? Buffer.from(original.content, 'base64').toString() : original.content;
  assert.match(originalText, /fill="green"/);
  const { targetId: other } = await control('Target.createTarget', { url: `http://127.0.0.1:${port}/other` });
  await control('Target.activateTarget', { targetId: other });

  const screenshots = [];
  for (let index = 0; index < 20; index++) {
    const capture = await evaluate(`sendCapture({type:'PREPARE_CAPTURE'})`);
    assert.ok(capture.ok);
    assert.ok(capture.images.some((i) => i.url.startsWith('blob:')));
    const screenshot = await page('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    screenshots.push({ ...capture, dataUrl: `data:image/png;base64,${screenshot.data}` });
    await evaluate(`sendCapture({type:'AFTER_CAPTURE',count:${index + 1},top:${capture.top}})`);
    if (index === 2 && process.argv.includes('--store-screenshot')) {
      const preview = await page('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      const directory = new URL('../store-assets/', import.meta.url);
      await mkdir(directory, { recursive: true });
      await writeFile(new URL('screenshot-1280x800.png', directory), Buffer.from(preview.data, 'base64'));
      console.log('Generated store-assets/screenshot-1280x800.png from the real controls on a self-authored demo webpage.');
    }
    const next = await evaluate(`sendCapture({type:'SCROLL_NEXT'})`);
    if (!next.moved) break;
  }
  assert.ok(screenshots[3].top > screenshots[0].top);
  const last = screenshots.at(-1);
  assert.equal(last.top, last.maxTop, 'capture must reach the actual document bottom');
  const blobImage = screenshots[0].images.find((i) => i.url.startsWith('blob:'));
  const image = await evaluate(`sendCapture({type:'READ_IMAGE',url:${JSON.stringify(blobImage.url)}})`);
  assert.equal(image.mime, 'image/svg+xml');
  await evaluate(`sendCapture({type:'CLEANUP_CAPTURE',restore:true})`);
  assert.equal(await evaluate('document.scrollingElement.scrollTop'), 0);
  assert.equal(await evaluate("document.querySelector('img[loading]').loading"), 'lazy');

  // Exercise the real browser image decoding and stitching, using the existing page as a test offscreen document.
  await evaluate(`globalThis.chrome.runtime.onMessage.addListener=(fn)=>{globalThis.fileListener=fn}; globalThis.sendFile=(m)=>new Promise(r=>fileListener(m,{},r));`);
  await evaluate(offscreen);
  await evaluate(`sendFile({type:'PDF_RESET',title:'Browser smoke'})`);
  for (let index = 0; index < screenshots.length; index++) {
    const shot = screenshots[index];
    const response = await evaluate(`sendFile(${JSON.stringify({ type: 'PDF_ADD_IMAGE', dataUrl: shot.dataUrl, rect: shot.rect, contentTop: shot.contentTop, first: index === 0 })})`);
    if (!response.ok) {
      const size = await evaluate(`(async()=>{const b=await createImageBitmap(await(await fetch(${JSON.stringify(shot.dataUrl)})).blob());return {width:b.width,height:b.height}})()`);
      console.log({ rect: shot.rect, contentTop: shot.contentTop, size });
    }
    assert.ok(response.ok, response.error);
  }
  const color = await evaluate(`(async()=>{const bitmap=await createImageBitmap(await(await fetch(${JSON.stringify(screenshots[0].dataUrl)})).blob());const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return [...ctx.getImageData(700,300,1,1).data]})()`);
  assert.deepEqual(color.slice(0, 3), [240, 250, 230], 'screenshot must contain the target tab, not the active purple tab');
  const pdf = await evaluate(`sendFile({type:'PDF_BUILD'})`);
  assert.ok(pdf.ok, pdf.error);
  const structure = await evaluate(`fetch(${JSON.stringify(pdf.url)}).then(r=>r.text()).then(t=>({onePage:t.includes('/Count 1 /Kids [3 0 R]'),imageCount:(t.match(/\\/Subtype \\/Image/g)||[]).length}))`);
  assert.equal(structure.onePage, true);
  assert.equal(structure.imageCount, screenshots.length);
  await evaluate(`sendFile({type:'PDF_RELEASE',url:${JSON.stringify(pdf.url)}})`);
  if (!process.argv.includes('--billing')) {
    const popup = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
    const markup = popup.match(/<body>([\s\S]*)<script src="i18n.js">/)[1];
    await evaluate(`document.body.innerHTML=${JSON.stringify(markup)};
      chrome.runtime.sendMessage=async()=>({ok:true,running:false});
      chrome.storage={local:{get:async()=>({})}};`);
    await evaluate(await readFile(new URL('../popup.js', import.meta.url), 'utf8'));
    assert.equal(await evaluate(`document.querySelector('#start').textContent`), 'Start export');
    assert.equal(await evaluate(`document.querySelector('#start').disabled`), false);
    assert.equal(await evaluate(`document.documentElement.lang`), 'en');
    console.log('PASS: English free popup has enabled export with no trial, license, or checkout.');
  }
  if (process.argv.includes('--billing')) {
    const section = await readFile(new URL('../store-edition/popup-section.html', import.meta.url), 'utf8');
    const config = JSON.parse(await readFile(new URL('../.local-billing/test-config.json', import.meta.url), 'utf8'));
    const token = (await readFile(new URL('../dist/scrollkeep-TEST-activation.txt', import.meta.url), 'utf8')).trim();
    const popup = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
    const markup = popup.match(/<body>([\s\S]*)<script src="popup.js">/)[1].replace('<p id="hint">', section + '<p id="hint">');
    await evaluate(`document.body.innerHTML=${JSON.stringify(markup)};
      globalThis.SCROLLKEEP_BILLING_CONFIG=${JSON.stringify(config)};
      globalThis.billingListeners=[];globalThis.billingStorage={};
      globalThis.chrome={runtime:{onMessage:{addListener(fn){billingListeners.push(fn)}},sendMessage(message){
        if(message.type==='GET_EXPORT_STATUS')return Promise.resolve({ok:true,running:false});
        return new Promise(resolve=>{for(const fn of billingListeners)fn(message,{},resolve)})
      }},storage:{local:{get:async()=>({...billingStorage}),set:async(v)=>{billingStorage={...billingStorage,...v}}}},tabs:{create:async()=>{throw Error('Test build must not open checkout')}}};`);
    await evaluate(await readFile(new URL('../store-edition/billing.js', import.meta.url), 'utf8'));
    await evaluate(await readFile(new URL('../popup.js', import.meta.url), 'utf8'));
    await evaluate(await readFile(new URL('../store-edition/popup-billing.js', import.meta.url), 'utf8'));
    await evaluate(`new Promise(r=>setTimeout(r,100))`);
    assert.equal(await evaluate(`document.querySelector('#start').disabled`), true);
    assert.equal(await evaluate(`document.querySelector('#buy-license').disabled`), true);
    await evaluate(`document.querySelector('#trial-start').click();new Promise(r=>setTimeout(r,100))`);
    assert.equal(await evaluate(`document.querySelector('#start').disabled`), false);
    assert.match(await evaluate(`document.querySelector('#billing-status').textContent`), /剩余 14 天/);
    await evaluate(`document.querySelector('#license-token').value=${JSON.stringify(token)};document.querySelector('#activate-license').click();new Promise(r=>setTimeout(r,200))`);
    assert.match(await evaluate(`document.querySelector('#billing-status').textContent`), /年度授权有效/);
    console.log('PASS: real Chrome billing popup, explicit trial, disabled unconfigured checkout, signed annual activation.');
  }
  console.log('PASS: inactive-tab screenshots, lazy images, blob originals, scrolling restoration, real JPEG stitching and one-page PDF.');
} finally {
  for (const socket of sockets) socket.close();
  browser.kill('SIGTERM');
  server.close();
}
