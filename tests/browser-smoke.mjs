// Isolated Chrome profile: never connects to the user's browser or account.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const content = await readFile(new URL('../content.js', import.meta.url), 'utf8');
const offscreen = await readFile(new URL('../offscreen.js', import.meta.url), 'utf8');
const profile = await mkdtemp(join(tmpdir(), 'pdf-exporter-smoke-'));
const server = createServer((req, res) => {
  if (req.url === '/cached.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/other') return res.end('<body style="background:#cc00cc">Other tab</body>');
  res.end(`<body style="margin:0;background:rgb(240,250,230)"><h1>Long page</h1><img src="/cached.svg">
    ${Array.from({ length: 12 }, (_, i) => `<section style="height:500px"><h2>Section ${i}</h2><img loading="lazy" alt="image-${i}" width="100" height="100" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='blue'/%3E%3C/svg%3E"></section>`).join('')}
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
  await page('Emulation.setFocusEmulationEnabled', { enabled: true });
  await evaluate(`new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r, {once:true}))`);
  await evaluate(`globalThis.chrome = {runtime:{onMessage:{addListener(fn){globalThis.captureListener=fn}},sendMessage:async()=>({ok:true})}};
    globalThis.sendCapture = (message) => new Promise(resolve => captureListener(message, {}, resolve));`);
  await evaluate(content);
  await evaluate(`sendCapture({type:'INIT_CAPTURE',resetTop:true})`);
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
  console.log('PASS: inactive-tab screenshots, lazy images, blob originals, scrolling restoration, real JPEG stitching and one-page PDF.');
} finally {
  for (const socket of sockets) socket.close();
  browser.kill('SIGTERM');
  server.close();
}
