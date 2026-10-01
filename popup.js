const start = document.querySelector("#start");
const hint = document.querySelector("#hint");
const localize = (text) => globalThis.ScrollKeepI18n?.text(text) ?? text;
globalThis.ScrollKeepI18n?.translateDom(document.documentElement);
document.documentElement.lang = globalThis.ScrollKeepI18n?.chinese ? 'zh-CN' : 'en';
const showHint = (text) => { hint.textContent = localize(text); };

start.addEventListener("click", async () => {
  start.disabled = true;
  showHint("正在启动……");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) {
      throw new Error("请先打开需要导出的网页");
    }
    const response = await chrome.runtime.sendMessage({
      type: "START_EXPORT",
      tabId: tab.id,
      delay: Number(document.querySelector("#delay").value),
      resetTop: document.querySelector("#resetTop").checked
    });
    if (!response?.ok) throw new Error(response?.error || "启动失败");
    window.close();
  } catch (error) {
    showHint(error.message);
    start.disabled = false;
  }
});

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: "GET_EXPORT_STATUS" });
  document.querySelector("#controls").hidden = !response?.running;
  let licensed = true;
  if (globalThis.SCROLLKEEP_BILLING_CONFIG) {
    const access = await chrome.runtime.sendMessage({ type: "GET_BILLING_STATUS" });
    licensed = !!access?.allowed;
  }
  start.disabled = !!response?.running || !licensed;
  if (response?.running) showHint(response.text || "正在后台导出…");
  else {
    const { lastExport } = await chrome.storage.local.get("lastExport");
    if (lastExport) showHint(lastExport.text);
  }
}
for (const [id, type] of [["finish", "FINISH_EARLY"], ["cancel", "CANCEL_EXPORT"]]) {
  document.querySelector(`#${id}`).addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type });
    showHint(id === "cancel" ? "正在取消…" : "正在结束捕获并生成文件…");
  });
}
refreshStatus().catch((error) => showHint(error.message));
document.addEventListener("billing-changed", () => refreshStatus().catch(() => {}));
setInterval(() => refreshStatus().catch(() => {}), 1000);
