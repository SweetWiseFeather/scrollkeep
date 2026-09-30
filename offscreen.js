let pages = [];
let documentTitle = "网页存档";
let captureGeometry = null;
let capturedBottom = null;

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === "PDF_RESET") {
    pages = [];
    captureGeometry = null;
    capturedBottom = null;
    documentTitle = message.title || "网页存档";
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    respond({ ok: true, folder: `${safeFilename(documentTitle)}_${stamp}_${crypto.randomUUID().slice(0, 8)}` });
    return;
  }
  if (message.type === "FILE_BUILD") {
    try {
      const content = message.base64Encoded
        ? Uint8Array.from(atob(message.content), (char) => char.charCodeAt(0))
        : message.content;
      const blob = new Blob([content], { type: message.mime || "application/octet-stream" });
      respond({ ok: true, url: URL.createObjectURL(blob) });
    } catch (error) { respond({ ok: false, error: error.message }); }
    return;
  }
  if (message.type === "PDF_ADD_IMAGE") {
    addImage(message).then((result) => respond({ ok: true, ...result }), (e) => respond({ ok: false, error: e.message }));
    return true;
  }
  if (message.type === "PDF_BUILD") {
    buildPdf().then((result) => respond({ ok: true, ...result }), (e) => respond({ ok: false, error: e.message }));
    return true;
  }
  if (message.type === "PDF_RELEASE") {
    URL.revokeObjectURL(message.url);
    respond({ ok: true });
  }
});

async function addImage({ dataUrl, rect, contentTop, first }) {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
  const scaleX = image.width / rect.viewportWidth;
  const scaleY = image.height / rect.viewportHeight;
  const sourceX = Math.round(rect.left * scaleX);
  const sourceTop = Math.round(rect.top * scaleY);
  const width = Math.round((rect.left + rect.width) * scaleX) - sourceX;
  const fullHeight = Math.round((rect.top + rect.height) * scaleY) - sourceTop;
  if (!Number.isFinite(contentTop) || width < 1 || fullHeight < 1 || sourceX < 0 || sourceTop < 0 ||
      sourceX + width > image.width || sourceTop + fullHeight > image.height) {
    throw new Error("截图区域无效，请刷新文档页面后重新导出");
  }
  const geometry = [image.width, image.height, rect.left, rect.top, rect.width, rect.height, scaleX, scaleY];
  if (!first && (!captureGeometry || geometry.some((value, i) => Math.abs(value - captureGeometry[i]) > 0.01))) {
    throw new Error("导出期间窗口尺寸、缩放或正文布局发生变化，请保持原窗口大小重新导出");
  }
  // Round absolute document coordinates, not each independent scroll distance.
  // This avoids accumulating a missing/duplicated pixel at fractional zoom levels.
  const origin = Math.round(contentTop * scaleY);
  const skip = first ? 0 : capturedBottom - origin;
  if (skip < 0) throw new Error("滚动距离超过截图覆盖范围，为避免缺失内容，请重新导出");
  if (skip >= fullHeight) return { added: false };
  // Repaint two already captured rows at the SAME PDF coordinates. The page
  // length is unchanged; overlapping image edges prevents renderer hairlines.
  const overlap = first ? 0 : Math.min(2, skip);
  const cropHeight = fullHeight - skip + overlap;
  const sourceY = sourceTop + skip - overlap;
  const canvas = new OffscreenCanvas(width, cropHeight);
  canvas.getContext("2d", { alpha: false }).drawImage(
    image, sourceX, sourceY, width, cropHeight, 0, 0, width, cropHeight
  );
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.98 });
  pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width, height: cropHeight, overlap });
  captureGeometry = geometry;
  capturedBottom = origin + fullHeight;
  return { added: true };
  } finally {
    image.close();
  }
}

function pdfBytes(items) {
  if (!items.length || items.some((item) => !Number.isFinite(item.width) || !Number.isFinite(item.height) || item.width < 1 || item.height <= (item.overlap || 0))) {
    throw new Error("PDF 片段尺寸无效");
  }
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const push = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObject = (id) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  push("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  beginObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObject(2);
  push("<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n");

  const naturalWidth = 595.28;
  const naturalHeights = items.map((item) => naturalWidth * (item.height - (item.overlap || 0)) / item.width);
  const naturalHeight = naturalHeights.reduce((sum, height) => sum + height, 0);
  const coordinateScale = Math.min(1, 14000 / naturalHeight);
  const userUnit = 1 / coordinateScale;
  if (userUnit > 75000) throw new Error("文档超过单页 PDF 尺寸上限，请分段导出");
  const pageWidth = naturalWidth * coordinateScale;
  const pageHeight = naturalHeight * coordinateScale;
  const contentId = 4 + items.length;
  const resources = items.map((_, index) => `/Im${index} ${4 + index} 0 R`).join(" ");

  beginObject(3);
  push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(6)} ${pageHeight.toFixed(6)}] /UserUnit ${userUnit.toFixed(6)} /Resources << /XObject << ${resources} >> >> /Contents ${contentId} 0 R >>\nendobj\n`);

  items.forEach((item, index) => {
    beginObject(4 + index);
    push(`<< /Type /XObject /Subtype /Image /Width ${item.width} /Height ${item.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${item.bytes.length} >>\nstream\n`);
    push(item.bytes);
    push("\nendstream\nendobj\n");
  });

  let cursor = pageHeight;
  let command = "";
  naturalHeights.forEach((height, index) => {
    const scaledHeight = height * coordinateScale;
    cursor -= scaledHeight;
    const imageHeight = naturalWidth * items[index].height / items[index].width * coordinateScale;
    command += `q\n${pageWidth.toFixed(6)} 0 0 ${imageHeight.toFixed(6)} 0 ${cursor.toFixed(6)} cm\n/Im${index} Do\nQ\n`;
  });
  beginObject(contentId);
  push(`<< /Length ${encoder.encode(command).length} >>\nstream\n${command}endstream\nendobj\n`);

  const xref = length;
  push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}
function safeFilename(name) {
  return Array.from((name || "网页存档")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()).slice(0, 100).join("").replace(/^[. ]+|[. ]+$/g, "") || "网页存档";
}

async function buildPdf() {
  if (!pages.length) throw new Error("没有捕获到可导出的内容");
  const blob = pdfBytes(pages);
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("");
  const filename = `${safeFilename(documentTitle)}_${stamp}.pdf`;
  pages = [];
  return { url, filename };
}
