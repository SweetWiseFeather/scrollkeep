(() => {
  if (globalThis.ScrollKeepI18n) return;
  const language = globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || 'en';
  const chinese = /^zh\b/i.test(language);
  const dictionary = {
    'ScrollKeep · 长页存档': 'ScrollKeep — Long Page to PDF',
    '打开目标网页，导出单页 PDF 和图片。': 'Save a long webpage as one continuous PDF with its images.',
    '截图间隔': 'Capture speed',
    '快速（普通文档）': 'Fast (simple pages)',
    '稳妥（推荐）': 'Balanced (recommended)',
    '慢速（图片较多）': 'Slow (image-heavy pages)',
    '从文档顶部开始': 'Start from the top',
    '开始自动导出': 'Start export',
    '到此结束并生成': 'Finish and save',
    '取消导出': 'Cancel export',
    '取消': 'Cancel',
    '可切换标签页或使用其他应用。请保持目标页打开；文件自动保存到下载目录的同一个文件夹。': 'You can switch tabs or use other apps. Keep the target tab open and Chrome running. Files are saved together in your Downloads folder.',
    'ScrollKeep · 正在导出': 'ScrollKeep · Exporting',
    '准备中……': 'Preparing…',
    '正在启动……': 'Starting…',
    '请先打开需要导出的网页': 'Open the webpage you want to export first.',
    '启动失败': 'Could not start the export.',
    '正在后台导出…': 'Exporting in the background…',
    '正在取消…': 'Cancelling…',
    '正在结束捕获并生成文件…': 'Finishing capture and saving files…',
    '已取消导出': 'Export cancelled.',
    '截图连接已断开：请保持目标网页打开，并关闭该页的开发者工具后重试': 'Capture disconnected. Keep the target tab open, close its DevTools, and try again.',
    '无法查询下载状态': 'Could not check the download status.',
    '下载中断': 'Download interrupted.',
    '下载超时（超过两分钟）': 'Download timed out (over two minutes).',
    '文件处理失败': 'Could not process the file.',
    '图片已失效或网页不允许读取': 'The image has expired or the webpage blocks access.',
    '正在确认文档底部是否还有内容…': 'Checking for more content at the bottom…',
    '无效的导出请求': 'Invalid export request.',
    '已有导出任务正在进行': 'Another export is already running.',
    '本地生成单页 PDF、图片和导出清单': 'Generate a single-page PDF, images, and an export manifest locally.',
    '正在准备后台导出…': 'Preparing background export…',
    '请打开普通网页后再导出': 'Open a regular webpage before exporting.',
    '页面初始化失败': 'Could not initialize the page.',
    '页面准备失败': 'Could not prepare the page.',
    '正在生成连续单页 PDF…': 'Creating a continuous single-page PDF…',
    '已取消导出；已经下载的文件仍保留': 'Export cancelled. Files already downloaded remain on disk.',
    '正在等待当前区域的图片和内容加载…': 'Waiting for images and content to load…',
    '文档区域不可见，请恢复原窗口后重试': 'The document area is not visible. Restore the window and try again.',
    '导出期间发生横向滚动，请重新导出': 'Horizontal scrolling occurred. Please restart the export.',
    '响应不是图片，可能需要重新登录': 'The response is not an image. You may need to sign in again.',
    '单张图片超过 32 MB，请单独下载': 'This image exceeds 32 MB. Download it separately.',
    '图片读取失败': 'Could not read the image.',
    '截图区域无效，请刷新文档页面后重新导出': 'Invalid capture area. Refresh the page and try again.',
    '导出期间窗口尺寸、缩放或正文布局发生变化，请保持原窗口大小重新导出': 'The window size, zoom, or page layout changed. Keep the original window size and restart the export.',
    '滚动距离超过截图覆盖范围，为避免缺失内容，请重新导出': 'Scrolling exceeded the captured area. Restart the export to avoid missing content.',
    'PDF 片段尺寸无效': 'Invalid PDF image dimensions.',
    '文档超过单页 PDF 尺寸上限，请分段导出': 'The document exceeds the single-page PDF size limit. Export it in sections.',
    '没有捕获到可导出的内容': 'No content was captured.',
    '网页存档': 'Webpage archive'
  };
  function text(value) {
    if (chinese || typeof value !== 'string') return value;
    if (dictionary[value]) return dictionary[value];
    let match;
    if ((match = value.match(/^已捕获 (\d+) 段，正在保存图片…$/))) return `Captured ${match[1]} sections. Saving images…`;
    if ((match = value.match(/^已捕获 (\d+) 段 · (\d+)%$/))) return `Captured ${match[1]} sections · ${match[2]}%`;
    if ((match = value.match(/^已保存到下载文件夹 (.+)：单页 PDF、(\d+) 张图片(?:；(\d+) 张失败，详见清单)?$/))) return `Saved to Downloads/${match[1]}: one PDF and ${match[2]} images${match[3] ? `; ${match[3]} failed (see export-info.json)` : ''}.`;
    if ((match = value.match(/^导出失败：(.*)$/s))) return `Export failed: ${text(match[1])}`;
    if ((match = value.match(/^无法启动后台截图，请关闭目标页的开发者工具并重试：(.*)$/s))) return `Cannot capture in the background. Close DevTools on the target tab and try again: ${match[1]}`;
    if ((match = value.match(/^返回的文件不是图片（(.*)），可能需要重新登录$/s))) return `The downloaded file is not an image (${match[1]}). You may need to sign in again.`;
    if ((match = value.match(/^图片读取失败：HTTP (\d+)$/))) return `Could not read the image: HTTP ${match[1]}`;
    return value;
  }
  function translateDom(root) {
    if (chinese) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue;
      const trimmed = node.textContent.trim();
      const translated = text(trimmed);
      if (translated !== trimmed) node.textContent = node.textContent.replace(trimmed, translated);
    }
  }
  globalThis.ScrollKeepI18n = { text, translateDom, chinese };
})();
