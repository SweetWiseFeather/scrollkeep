if (typeof importScripts === 'function') importScripts('i18n.js');
const localize = (text) => globalThis.ScrollKeepI18n?.text(text) ?? text;
let job = null;
let authorizing = false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sendTab = (tabId, message) => chrome.tabs.sendMessage(tabId, message);
const command = (method, params = {}) => chrome.debugger.sendCommand({ tabId: job.tabId }, method, params);

function checkJob() {
  if (job.cancelled) throw new Error("已取消导出");
  if (job.detached) throw new Error("截图连接已断开：请保持目标网页打开，并关闭该页的开发者工具后重试");
}

chrome.debugger.onDetach.addListener((source) => {
  if (job && source.tabId === job.tabId) job.detached = true;
});

async function status(text, progress = 0) {
  text = localize(text);
  job.status = text;
  await sendTab(job.tabId, { type: "SET_STATUS", text, progress }).catch(() => {});
}

async function waitForDownload(id) {
  job.downloadIds.add(id);
  const deadline = Date.now() + 120000;
  try {
    while (Date.now() < deadline) {
      checkJob();
      const [item] = await chrome.downloads.search({ id });
      if (!item) throw new Error("无法查询下载状态");
      if (item.state === "complete") return item;
      if (item.state === "interrupted") throw new Error(item.error || "下载中断");
      await wait(250);
    }
    await chrome.downloads.cancel(id).catch(() => {});
    throw new Error("下载超时（超过两分钟）");
  } finally {
    job.downloadIds.delete(id);
  }
}

async function download(url, filename) {
  checkJob();
  const id = await chrome.downloads.download({ url, filename, conflictAction: "overwrite", saveAs: false });
  return waitForDownload(id);
}

async function offscreen(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || "文件处理失败");
  return result;
}

async function saveBlob(message, filename) {
  const result = await offscreen(message);
  try { await download(result.url, filename); }
  finally { await offscreen({ type: "PDF_RELEASE", url: result.url }); }
}

function imageExtension(mime, url) {
  const types = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif", "image/bmp": "bmp", "image/x-icon": "ico" };
  const type = mime?.split(";")[0];
  if (types[type]) return types[type];
  const match = url.match(/\.(jpe?g|png|gif|webp|svg|avif|bmp|ico)(?:[?#]|$)/i);
  return match ? match[1].toLowerCase() : "img";
}

async function saveImages(images) {
  for (const image of images || []) {
    checkJob();
    if (job.images.has(image.url)) continue;
    const entry = { url: image.url, alt: image.alt || "", status: "pending" };
    job.images.set(image.url, entry);
    try {
      // Cached resources preserve cross-origin images without new host permissions.
      // Blob URLs are read before virtualized content can remove them.
      let data;
      if (/^https?:/.test(image.url)) {
        try {
          const tree = await command("Page.getResourceTree");
          const find = (frame) => {
            const resource = frame.resources?.find((r) => r.url === image.url);
            if (resource && resource.mimeType?.startsWith("image/")) return { frameId: frame.frame.id, mime: resource.mimeType };
            for (const child of frame.childFrames || []) { const found = find(child); if (found) return found; }
          };
          const resource = find(tree.frameTree);
          if (resource) {
            const body = await command("Page.getResourceContent", { frameId: resource.frameId, url: image.url });
            data = { ...body, mime: resource.mime };
          }
        } catch { /* Try reading in the page or downloading the original URL. */ }
      }
      if (!data) {
        const response = await sendTab(job.tabId, { type: "READ_IMAGE", url: image.url });
        if (response?.ok) data = response;
      }
      entry.filename = `images/${String(job.images.size).padStart(4, "0")}.${imageExtension(data?.mime, image.url)}`;
      const filename = `${job.folder}/${entry.filename}`;
      if (data) await saveBlob({ type: "FILE_BUILD", content: data.content, base64Encoded: data.base64Encoded, mime: data.mime }, filename);
      else if (/^https?:/.test(image.url)) {
        const item = await download(image.url, filename);
        if (item.mime && !/^(image\/|application\/octet-stream)/i.test(item.mime)) throw new Error(`返回的文件不是图片（${item.mime}），可能需要重新登录`);
      }
      else throw new Error("图片已失效或网页不允许读取");
      entry.status = "saved";
    } catch (error) {
      checkJob();
      entry.status = "failed";
      entry.error = localize(error.message);
    }
  }
}

async function scrollNextWhenReady(delay) {
  const deadline = Date.now() + Math.max(4000, delay * 3);
  do {
    checkJob();
    if (job.finishEarly) return false;
    const moved = await sendTab(job.tabId, { type: "SCROLL_NEXT" });
    if (moved.moved > 0) return true;
    await status("正在确认文档底部是否还有内容…", 99);
    await wait(500);
  } while (Date.now() < deadline);
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "START_EXPORT") {
    if (sender.tab || !Number.isInteger(message.tabId)) { respond({ ok: false, error: localize("无效的导出请求") }); return; }
    if (job || authorizing) { respond({ ok: false, error: localize("已有导出任务正在进行") }); return; }
    const launch = () => {
      startExport(message).catch((error) => console.error("导出失败", error));
      respond({ ok: true });
    };
    if (globalThis.ScrollKeepBilling) {
      authorizing = true;
      ScrollKeepBilling.getStatus().then((access) => {
        if (!access.allowed) respond({ ok: false, error: access.text });
        else launch();
      }, (error) => respond({ ok: false, error: `授权检查失败：${error.message}` }))
        .finally(() => { authorizing = false; });
      return true;
    }
    launch();
    return;
  }
  if (message.type === "GET_EXPORT_STATUS") {
    respond({ ok: true, running: !!job, tabId: job?.tabId, text: localize(job?.status) });
    return;
  }
  if (job && (!sender.tab || sender.tab.id === job.tabId)) {
    if (message.type === "FINISH_EARLY") { job.finishEarly = true; respond({ ok: true }); }
    if (message.type === "CANCEL_EXPORT") {
      job.cancelled = true;
      for (const id of job.downloadIds) chrome.downloads.cancel(id).catch(() => {});
      respond({ ok: true });
    }
  }
});

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL("offscreen.html")] });
  if (!contexts.length) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["BLOBS"], justification: "本地生成单页 PDF、图片和导出清单" });
}

async function startExport(options) {
  job = { tabId: options.tabId, finishEarly: false, cancelled: false, count: 0, images: new Map(), downloadIds: new Set(), status: "正在准备后台导出…" };
  let initialized = false;
  let attached = false;
  let pdfUrl;
  let finalText;
  try {
    const tab = await chrome.tabs.get(job.tabId);
    if (!/^https?:/.test(tab.url || "")) throw new Error("请打开普通网页后再导出");
    job.sourceUrl = tab.url;
    const delay = Math.max(450, Math.min(5000, Number(options.delay) || 800));
    try { await chrome.debugger.attach({ tabId: job.tabId }, "1.3"); }
    catch (error) { throw new Error(`无法启动后台截图，请关闭目标页的开发者工具并重试：${error.message}`); }
    attached = true;
    await command("Page.enable");
    await command("Emulation.setFocusEmulationEnabled", { enabled: true });
    await chrome.scripting.executeScript({ target: { tabId: job.tabId }, files: ["i18n.js", "content.js"] });
    initialized = true;
    const info = await sendTab(job.tabId, { type: "INIT_CAPTURE", resetTop: options.resetTop });
    if (!info?.ok) throw new Error(info?.error || "页面初始化失败");
    await ensureOffscreen();
    const reset = await offscreen({ type: "PDF_RESET", title: tab.title || info.title });
    job.folder = reset.folder;
    await chrome.action.setBadgeText({ text: "…" });
    await wait(delay);

    while (true) {
      checkJob();
      if (job.finishEarly && job.count) break;
      const capture = await sendTab(job.tabId, { type: "PREPARE_CAPTURE" });
      if (!capture?.ok) throw new Error(capture?.error || "页面准备失败");
      checkJob();
      const screenshot = await command("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const added = await offscreen({ type: "PDF_ADD_IMAGE", dataUrl: `data:image/png;base64,${screenshot.data}`, rect: capture.rect, contentTop: capture.contentTop, first: job.count === 0 });
      if (added.added !== false) job.count += 1;
      await sendTab(job.tabId, { type: "AFTER_CAPTURE", count: job.count, top: capture.top });
      await status(`已捕获 ${job.count} 段，正在保存图片…`, capture.maxTop ? capture.top / capture.maxTop * 100 : 100);
      await saveImages(capture.images);
      if (job.finishEarly || !await scrollNextWhenReady(delay)) break;
      await wait(delay);
    }

    checkJob();
    await status("正在生成连续单页 PDF…", 100);
    const result = await offscreen({ type: "PDF_BUILD" });
    pdfUrl = result.url;
    await download(pdfUrl, `${job.folder}/${result.filename}`);
    const entries = [...job.images.values()];
    const failures = entries.filter((image) => image.status === "failed").length;
    await saveBlob({ type: "FILE_BUILD", mime: "application/json", content: JSON.stringify({ title: tab.title, sourceUrl: job.sourceUrl, exportedAt: new Date().toISOString(), partial: job.finishEarly, pdf: result.filename, images: entries }, null, 2) }, `${job.folder}/export-info.json`);
    finalText = `已保存到下载文件夹 ${job.folder}：单页 PDF、${entries.length - failures} 张图片${failures ? `；${failures} 张失败，详见清单` : ""}`;
    await status(finalText, 100);
  } catch (error) {
    finalText = job.cancelled ? "已取消导出；已经下载的文件仍保留" : `导出失败：${error.message}`;
    await status(finalText, 100);
    if (!job.cancelled) throw error;
  } finally {
    await chrome.storage.local.set({ lastExport: { text: localize(finalText), folder: job.folder, time: Date.now() } }).catch(() => {});
    if (pdfUrl) await offscreen({ type: "PDF_RELEASE", url: pdfUrl }).catch(() => {});
    await chrome.runtime.sendMessage({ type: "PDF_RESET", title: "" }).catch(() => {});
    if (initialized) await sendTab(job.tabId, { type: "CLEANUP_CAPTURE", restore: true }).catch(() => {});
    if (attached && !job.detached) {
      await command("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
      await chrome.debugger.detach({ tabId: job.tabId }).catch(() => {});
    }
    await chrome.action.setBadgeText({ text: "" }).catch(() => {});
    job = null;
  }
}
