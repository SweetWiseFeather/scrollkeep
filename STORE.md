# Chrome Web Store submission / 商店发布材料

This package is prepared for submission, not already approved or listed. Google reviews submissions; passing local tests does not guarantee approval.

## Upload

- Extension: ScrollKeep — Long Page to PDF
- Version: 0.3.3
- Package: dist/scrollkeep-0.3.3.zip (manifest.json is at the ZIP root)
- Existing draft ID: picgleahfclbgcokiaofikcjhceealjf. Update this draft; do not create a duplicate item.
- Free release: no account, trial limit, payment, activation code, or automatic renewal. User authorized publication as a free extension on 2026-10-01. Optional billing test builds are not release packages.
- Category: Tools (under Productivity)
- Primary listing language: English
- Website: https://github.com/SweetWiseFeather/scrollkeep
- Support: https://github.com/SweetWiseFeather/scrollkeep/issues
- Privacy policy: https://github.com/SweetWiseFeather/scrollkeep/blob/main/PRIVACY.md
- Store icon: icons/icon-128.png
- Product screenshot: store-assets/screenshot-1280x800.png (real export controls on a self-authored demo page)

## 简短说明

Save long webpages as one continuous PDF with images in one folder. Keep working in other tabs during export.

## 中文详细介绍

ScrollKeep · 长页存档，把长网页保存为连续单页 PDF，并将页面图片一起归档到本地。

适合收藏长文章、教程、产品说明和知识库页面，不限定某一个网站。无需一直停留在目标标签页：开始导出后，可以切换其他标签页、窗口或使用其他应用，导出会继续进行。

主要功能
• 连续单页 PDF：自动滚动并拼接网页画面，保留从上到下的阅读顺序，不按纸张尺寸分页。
• 网页图片归档：保存导出过程中实际加载的图片版本，按图片地址去重；PDF、图片与导出清单保存在同一个下载文件夹。
• 进度与控制：从插件弹窗或网页控制条查看进度、取消导出或提前结束。
• 本机处理：截图和 PDF 生成在你的设备上完成，没有广告、统计或开发者云端上传服务。

使用方法
1. 打开要保存的网页，展开需要归档的内容。
2. 点击 ScrollKeep，选择导出选项并开始。
3. 可以继续使用其他标签页或应用，但请保持目标网页打开、浏览器运行，并避免设备休眠。
4. 完成后，在浏览器下载目录打开本次导出的文件夹，查看 PDF、images 图片目录和 export-info.json 导出清单。

支持范围与注意事项
• 需要桌面版 Chrome 118 或更新版本，支持普通长网页及部分具有独立正文滚动区域的页面；不同网站的结构和加载机制会影响结果，不保证所有网页都能完整导出。
• 导出时 Chrome 会显示调试提示，这是后台截图所需的浏览器功能。完成、取消或出错后会自动断开连接。
• PDF 是图片式存档，文字不能直接搜索或选择。特别长的单页 PDF 在部分阅读器中可能显示不全。
• 保存的是页面实际加载的图片版本，不保证取得网站的最高分辨率原图；受登录权限、跨域或网站限制的图片可能下载失败，原因记录在导出清单中。
• 未展开内容、嵌入页面、视频、白板及无限滚动页面可能不能完整保存；浏览器内部页面和 Chrome 应用商店等受保护页面无法导出。
• 开启“下载前询问保存位置”可能需要逐个确认文件；建议导出前检查 Chrome 下载设置。
• 请仅归档你有权访问和保存的内容。分享文件前，请检查导出清单中的网页和图片地址是否含有敏感信息。

开源项目与使用反馈：https://github.com/SweetWiseFeather/scrollkeep

当前版本未启用付费、试用期限或自动续费。

## English description

ScrollKeep saves long webpages as one continuous single-page PDF, with loaded images archived in the same folder.

Keep articles, tutorials, product guides, and knowledge-base pages for offline reference. ScrollKeep is not tied to one website. Start an export, then continue working in other tabs or applications while it scrolls and captures your selected page.

WHAT YOU CAN DO
• Save a continuous single-page PDF without paper-sized page breaks.
• Archive images loaded during the export, deduplicated by URL.
• Keep the PDF, images, and export-info.json manifest together in one Downloads folder.
• Check progress, finish early, or cancel from the extension popup or the webpage controls.
• Process screenshots and create PDFs locally, without developer cloud uploads, ads, or analytics.

HOW TO USE
1. Open a webpage and expand the content you want to save.
2. Click ScrollKeep, choose a capture speed, and start the export.
3. You can switch tabs or apps. Keep the target tab open, Chrome running, and your computer awake.
4. Open the new folder in Downloads to find your PDF, images, and export report.

REQUIREMENTS AND LIMITATIONS
• Requires desktop Chrome 118 or later. Supports ordinary long webpages and some pages with a separate scrolling content area. Results depend on the website; complete capture is not guaranteed for every page.
• Chrome displays a debugging indicator during capture. This is needed for background screenshots; ScrollKeep disconnects when the task finishes, is cancelled, or fails.
• PDFs are visual, image-based archives. Text is not searchable or selectable. Very long single-page PDFs may not display fully in every reader.
• Images are saved in the versions actually loaded by the page, not necessarily the highest-resolution originals. Restricted images may fail; details appear in export-info.json.
• Collapsed content, embedded frames, videos, whiteboards, and infinite-scroll pages may not be fully archived. Chrome internal pages and other protected pages cannot be captured.
• Chrome's “Ask where to save each file before downloading” setting may require individual confirmations.
• Only save content you have permission to access and archive. Check source URLs in the manifest for sensitive information before sharing your files.

Free to use in this release. No account, activation code, trial expiration, or subscription required.
English interface with Chinese support based on your browser language.

Open source and support: https://github.com/SweetWiseFeather/scrollkeep

## Single purpose

Archive the user-selected webpage locally as a continuous PDF with its encountered images and export results.

## Permission justification

- activeTab: access only the tab the user explicitly chooses through the toolbar action.
- scripting: inject scrolling, geometry measurement, image collection, and export controls into that tab, then restore its state.
- debugger: capture the selected tab while inactive via Page.captureScreenshot and read its already loaded image resources via Page.getResourceTree/Page.getResourceContent. The extension disconnects at the end of the task and does not debug unrelated tabs.
- downloads: save the user-requested PDF, images, and export-info.json to one download folder, monitor completion, and cancel ongoing downloads when requested.
- offscreen: process screenshot strips, encode JPEGs, construct the PDF, and create temporary local file blobs without an open popup.
- storage: retain only the most recent export's local status text, folder name, and time for the popup.

## Privacy declarations to review in the dashboard

The extension handles webpage content, webpage URLs/titles, and image resources locally to fulfill the export action. It does not collect browsing history, enumerate cookies, read passwords, sell data, serve ads, or transmit content to the developer. Image fallback downloads contact the webpage's original image provider and may use existing browser authentication. Do not describe this as "no access to webpage data": the extension necessarily reads the selected webpage.

No remotely hosted executable code is used. All extension code is included in the ZIP. Refer to PRIVACY.md when answering the dashboard's current data-use questions; the form may change.

## Review test instructions

1. Load the extension in Chrome 118+.
2. Open a public long article or a local test server page; no account is required for the extension itself.
3. Click ScrollKeep, leave "start from top" enabled, and start export.
4. Switch to another tab. Open ScrollKeep there to confirm progress continues.
5. Wait for completion. Inspect the new download folder for one PDF, images/, and export-info.json.
6. Confirm the PDF has one page; inspect failed image entries if the source restricts downloads.
7. Repeat and cancel; confirm scrolling/styles are restored and the debugging session closes.

## Remaining account steps

Submission status (2026-10-01): version 0.3.3 was submitted to Chrome Web Store review as a free, public release in all regions, with automatic publication after approval enabled. Publisher display name: Zhiyu Tian. The dashboard currently shows pending review; this is not yet a published listing.

Sign in to your Chrome Web Store developer account. If it is not registered, complete Google's developer registration and any applicable payment/agreements yourself. Upload the ZIP, add at least one compliant product screenshot, fill out store/privacy/distribution fields, and submit for review.

The supplied screenshot shows the real extension controls on a self-authored demo page. Regenerate it on macOS using `node tests/browser-smoke.mjs --store-screenshot`. It does not use private or third-party course material. Current image size requirements are linked below. Check the dashboard for all mandatory fields before submitting.

Official references:
- https://developer.chrome.com/docs/webstore/prepare
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
