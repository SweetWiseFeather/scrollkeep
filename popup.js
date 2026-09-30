const start = document.querySelector("#start");
const hint = document.querySelector("#hint");

start.addEventListener("click", async () => {
  start.disabled = true;
  hint.textContent = "正在启动……";
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
    hint.textContent = error.message;
    start.disabled = false;
  }
});

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: "GET_EXPORT_STATUS" });
  document.querySelector("#controls").hidden = !response?.running;
  start.disabled = !!response?.running;
  if (response?.running) hint.textContent = response.text || "正在后台导出…";
  else {
    const { lastExport } = await chrome.storage.local.get("lastExport");
    if (lastExport) hint.textContent = lastExport.text;
  }
}
for (const [id, type] of [["finish", "FINISH_EARLY"], ["cancel", "CANCEL_EXPORT"]]) {
  document.querySelector(`#${id}`).addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type });
    hint.textContent = id === "cancel" ? "正在取消…" : "正在结束捕获并生成文件…";
  });
}
refreshStatus().catch((error) => { hint.textContent = error.message; });
setInterval(() => refreshStatus().catch(() => {}), 1000);
