(() => {
  if (globalThis.__scrollKeepExporter) return;

  const state = {
    root: null,
    originalTop: 0,
    originalLeft: 0,
    originalStyles: [],
    originalLoading: new Map(),
    captureStyle: null,
    captureLeft: 0,
    previousTop: 0,
    stopped: false,
    cancelled: false,
    ui: null
  };

  const isPageRoot = (root) => root === document.scrollingElement || root === document.documentElement || root === document.body;
  const scrollportHeight = (root) => isPageRoot(root) ? innerHeight : root.clientHeight;
  const maxScrollTop = (root) => Math.max(0, root.scrollHeight - scrollportHeight(root));

  function scrollingCandidates() {
    const all = [document.scrollingElement, ...document.querySelectorAll("main, article, [role=main], div")];
    return [...new Set(all)].filter(Boolean).filter((el) => {
      const style = getComputedStyle(el);
      const scrollable = /(auto|scroll)/.test(style.overflowY) || el === document.scrollingElement;
      return scrollable && maxScrollTop(el) > 300 && scrollportHeight(el) > innerHeight * 0.45;
    });
  }

  function findScrollRoot() {
    const candidates = scrollingCandidates();
    candidates.sort((a, b) => {
      const aArea = Math.min(a.clientWidth, innerWidth) * scrollportHeight(a);
      const bArea = Math.min(b.clientWidth, innerWidth) * scrollportHeight(b);
      const aRange = maxScrollTop(a);
      const bRange = maxScrollTop(b);
      return (bRange * bArea) - (aRange * aArea);
    });
    return candidates[0] || document.scrollingElement;
  }

  function rectFor(root) {
    if (isPageRoot(root)) {
      return {
        left: 0, top: 0,
        width: Math.min(innerWidth, document.documentElement.clientWidth),
        height: Math.min(innerHeight, document.documentElement.clientHeight),
        scrollScale: 1, clipTop: 0,
        viewportWidth: innerWidth, viewportHeight: innerHeight
      };
    }
    const r = root.getBoundingClientRect();
    const scaleX = root.offsetWidth ? r.width / root.offsetWidth : 1;
    const scaleY = root.offsetHeight ? r.height / root.offsetHeight : 1;
    // Capture the scrollport, not the border box (which includes scrollbars).
    const contentLeft = r.left + root.clientLeft * scaleX;
    const contentTop = r.top + root.clientTop * scaleY;
    const left = Math.max(0, contentLeft);
    const top = Math.max(0, contentTop);
    return {
      left,
      top,
      width: Math.max(0, Math.min(innerWidth, document.documentElement.clientWidth, contentLeft + root.clientWidth * scaleX) - left),
      height: Math.max(0, Math.min(innerHeight, document.documentElement.clientHeight, contentTop + root.clientHeight * scaleY) - top),
      scrollScale: scaleY,
      clipTop: top - contentTop,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight
    };
  }

  function installCaptureStyle() {
    state.captureStyle?.remove();
    const style = document.createElement("style");
    style.textContent = `
      html, body, body * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    `;
    document.documentElement.appendChild(style);
    state.captureStyle = style;
    state.originalStyles = ["scroll-behavior", "scroll-snap-type", "overflow-anchor"].map((name) =>
      [name, state.root.style.getPropertyValue(name), state.root.style.getPropertyPriority(name)]);
    state.root.style.setProperty("scroll-behavior", "auto", "important");
    state.root.style.setProperty("scroll-snap-type", "none", "important");
    state.root.style.setProperty("overflow-anchor", "none", "important");
  }

  function buildUi() {
    document.querySelector("#__scrollkeep_exporter_ui")?.remove();
    const host = document.createElement("div");
    host.id = "__scrollkeep_exporter_ui";
    host.style.cssText = "all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:system-ui,'Microsoft YaHei',sans-serif";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .box{width:290px;padding:14px;border-radius:12px;background:#17233d;color:#fff;box-shadow:0 8px 30px #0005}
        .title{font-size:14px;font-weight:700;margin-bottom:8px}.status{font-size:12px;color:#d0d5dd;margin-bottom:9px}
        .track{height:6px;background:#ffffff25;border-radius:9px;overflow:hidden;margin-bottom:11px}.bar{height:100%;width:0;background:#4e83fd}
        .actions{display:flex;gap:7px}button{border:0;border-radius:7px;padding:8px 10px;font-size:12px;cursor:pointer}
        .finish{flex:1;background:#3370ff;color:#fff}.cancel{background:#ffffff18;color:#fff}
      </style>
      <div class="box">
        <div class="title">ScrollKeep · 正在导出</div>
        <div class="status">准备中……</div>
        <div class="track"><div class="bar"></div></div>
        <div class="actions"><button class="finish">到此结束并生成</button><button class="cancel">取消</button></div>
      </div>`;
    shadow.querySelector(".finish").onclick = () => chrome.runtime.sendMessage({ type: "FINISH_EARLY" });
    shadow.querySelector(".cancel").onclick = () => chrome.runtime.sendMessage({ type: "CANCEL_EXPORT" });
    document.documentElement.appendChild(host);
    return host;
  }

  function updateUi(progress, message) {
    if (!state.ui) return;
    const shadow = state.ui.shadowRoot;
    shadow.querySelector(".bar").style.width = `${Math.max(0, Math.min(100, progress))}%`;
    shadow.querySelector(".status").textContent = message;
  }

  async function prepareCapture() {
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const deadline = Date.now() + 6000;
    let previousLayout = "";
    let stableSince = Date.now();
    while (Date.now() < deadline) {
      const rect = rectFor(state.root);
      const layout = [state.root.scrollHeight, state.root.scrollTop, rect.left, rect.top, rect.width, rect.height].join(",");
      if (layout !== previousLayout) {
        previousLayout = layout;
        stableSince = Date.now();
      }
      const pending = [...state.root.querySelectorAll("img")].filter((image) => {
        const r = image.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.bottom > rect.top && r.top < rect.top + rect.height &&
          r.right > rect.left && r.left < rect.left + rect.width;
        if (visible && image.loading === "lazy") {
          if (!state.originalLoading.has(image)) state.originalLoading.set(image, image.getAttribute("loading"));
          image.loading = "eager";
        }
        return visible && !image.complete;
      }).length > 0;
      if (!pending && Date.now() - stableSince >= 400) break;
      updateUi(0, "正在等待当前区域的图片和内容加载…");
      await pause(150);
    }
    if (state.ui) state.ui.style.visibility = "hidden";
    // Timers also settle when the tab becomes hidden; rAF alone can hang there.
    await Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      pause(200)
    ]);
    const rect = rectFor(state.root);
    if (rect.width < 1 || rect.height < 1) throw new Error("文档区域不可见，请恢复原窗口后重试");
    if (Math.abs(state.root.scrollLeft - state.captureLeft) > 0.5) throw new Error("导出期间发生横向滚动，请重新导出");
    return {
      ok: true,
      top: state.root.scrollTop,
      previousTop: state.previousTop,
      contentTop: state.root.scrollTop * rect.scrollScale + rect.clipTop,
      maxTop: maxScrollTop(state.root),
      rect,
      images: collectImages()
    };
  }

  function collectImages() {
    const images = new Map();
    const add = (source, alt = "") => {
      if (!source) return;
      try {
        const url = new URL(source, document.baseURI).href;
        if (/^(https?:|blob:|data:image\/)/i.test(url) && !images.has(url)) images.set(url, { url, alt });
      } catch { /* Ignore invalid URLs. */ }
    };
    for (const image of document.querySelectorAll("img")) {
      add(image.currentSrc || image.src, image.alt);
      if (!image.currentSrc || !image.naturalWidth) {
        add(image.dataset.src || image.dataset.original, image.alt);
      }
    }
    for (const image of document.querySelectorAll("svg image")) add(image.href?.baseVal);
    for (const element of state.root.querySelectorAll("*")) {
      if (element === state.ui || state.ui?.contains(element)) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
      const background = getComputedStyle(element).backgroundImage;
      for (const match of background.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) add(match[1] || match[2] || match[3]?.trim());
    }
    return [...images.values()];
  }

  async function readImage(url) {
    const response = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`图片读取失败：HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("响应不是图片，可能需要重新登录");
    if (blob.size > 32 * 1024 * 1024) throw new Error("单张图片超过 32 MB，请单独下载");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(blob);
    });
    return { ok: true, mime: blob.type, base64Encoded: true, content: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "READ_IMAGE") {
      readImage(message.url).then(respond, (error) => respond({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "INIT_CAPTURE") {
      state.root = findScrollRoot();
      state.originalTop = state.root.scrollTop;
      state.originalLeft = state.root.scrollLeft;
      installCaptureStyle();
      state.captureLeft = state.root.scrollLeft;
      if (message.resetTop) state.root.scrollTop = 0;
      state.previousTop = state.root.scrollTop;
      state.ui = buildUi();
      const rect = rectFor(state.root);
      respond({
        ok: true,
        title: document.title,
        top: state.root.scrollTop,
        maxTop: maxScrollTop(state.root),
        rect
      });
      return;
    }

    if (message.type === "PREPARE_CAPTURE") {
      prepareCapture().then(respond, (error) => respond({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "AFTER_CAPTURE") {
      state.previousTop = message.top;
      if (state.ui) state.ui.style.visibility = "visible";
      const maxTop = maxScrollTop(state.root);
      const progress = maxTop ? state.root.scrollTop / maxTop * 100 : 100;
      updateUi(progress, `已捕获 ${message.count} 段 · ${Math.round(progress)}%`);
      respond({ ok: true });
      return;
    }

    if (message.type === "SCROLL_NEXT") {
      const before = state.root.scrollTop;
      const rect = rectFor(state.root);
      const step = Math.max(1, Math.floor(rect.height / rect.scrollScale * 0.75));
      state.root.scrollTop = Math.min(
        state.root.scrollTop + step,
        maxScrollTop(state.root)
      );
      respond({ top: state.root.scrollTop, moved: state.root.scrollTop - before });
      return;
    }

    if (message.type === "SET_STATUS") {
      if (state.ui) state.ui.style.visibility = "visible";
      updateUi(message.progress ?? 100, message.text);
      respond({ ok: true });
      return;
    }

    if (message.type === "CLEANUP_CAPTURE") {
      for (const [image, loading] of state.originalLoading) {
        if (loading === null) image.removeAttribute("loading");
        else image.setAttribute("loading", loading);
      }
      state.originalLoading.clear();
      state.captureStyle?.remove();
      state.captureStyle = null;
      if (state.root) {
        if (message.restore !== false) {
          state.root.scrollTop = state.originalTop;
          state.root.scrollLeft = state.originalLeft;
        }
        for (const [name, value, priority] of state.originalStyles) {
          if (value) state.root.style.setProperty(name, value, priority);
          else state.root.style.removeProperty(name);
        }
      }
      state.ui?.remove();
      state.ui = null;
      respond({ ok: true });
    }
  });

  globalThis.__scrollKeepExporter = true;
})();
