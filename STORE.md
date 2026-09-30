# Chrome Web Store submission / 商店发布材料

This package is prepared for submission, not already approved or listed. Google reviews submissions; passing local tests does not guarantee approval.

## Upload

- Extension: ScrollKeep · 长页存档
- Version: 0.3.1
- Package: dist/scrollkeep-0.3.1.zip (manifest.json is at the ZIP root)
- Primary category: Productivity
- Website: https://github.com/SweetWiseFeather/scrollkeep
- Support: https://github.com/SweetWiseFeather/scrollkeep/issues
- Privacy policy: https://github.com/SweetWiseFeather/scrollkeep/blob/main/PRIVACY.md
- Store icon: icons/icon-128.png
- Product screenshot: store-assets/screenshot-1280x800.png (real export controls on a self-authored demo page)

## 简短说明

后台滚动长网页，保存连续单页 PDF 和网页图片到同一文件夹。

## 中文详细介绍

ScrollKeep · 长页存档，让长文章、教程和知识库页面更方便地保存到本地。

开始导出后，插件自动滚动选定网页，将页面画面拼接成一张连续长页 PDF，并下载页面加载出的图片。PDF、图片和导出清单保存在浏览器下载目录中的同一个文件夹。

主要功能：
- 后台导出：可以切换标签页、窗口或使用其他应用。
- 连续单页 PDF：保持长网页阅读顺序，不强制分成纸张页面。
- 图片归档：保存页面实际加载的图片版本，按 URL 去重，记录下载失败原因。
- 随时控制：通过插件弹窗或网页控制条查看进度、取消或提前结束。
- 本地处理：没有云端上传、广告或统计服务。

适用于普通长网页和正文在独立区域内滚动的页面。需要 Chrome 118 或更新版本。导出期间 Chrome 会显示调试提示，完成后自动解除连接。

注意：PDF 为图片式归档，文字不能搜索或选择。保持目标网页打开；未展开内容、视频、白板、跨域嵌入页面和部分受权限限制的图片不保证完整保存。网页尺寸变化可能需要重新导出。特别长的 PDF 在部分阅读器中可能显示不全。

本版本已验证 Chrome。Edge、Brave、Vivaldi、Opera 桌面版预期兼容，但本项目尚未逐一实测。Firefox、Safari 和手机浏览器当前不支持。

## English description

ScrollKeep archives long webpages as one continuous single-page PDF and saves encountered images in the same download folder.

Start an export, then continue using other tabs or applications. ScrollKeep automatically scrolls the selected page, captures its rendered content, deduplicates image URLs, and creates an export manifest containing image download results.

Everything is processed on your device. No cloud uploads, ads, or analytics. Control progress, finish early, or cancel from the popup or webpage control bar.

Requires Chrome 118 or later. Chrome displays a debugging indicator during export. Keep the target tab open. The PDF is a visual archive; text is not searchable or selectable. Collapsed content, embedded frames, video, whiteboards, and restricted images may not be fully archived. Very long PDFs require a compatible reader.

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

Sign in to your Chrome Web Store developer account. If it is not registered, complete Google's developer registration and any applicable payment/agreements yourself. Upload the ZIP, add at least one compliant product screenshot, fill out store/privacy/distribution fields, and submit for review.

The supplied screenshot shows the real extension controls on a self-authored demo page. Regenerate it on macOS using `node tests/browser-smoke.mjs --store-screenshot`. It does not use private or third-party course material. Current image size requirements are linked below. Check the dashboard for all mandatory fields before submitting.

Official references:
- https://developer.chrome.com/docs/webstore/prepare
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
