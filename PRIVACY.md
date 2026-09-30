# ScrollKeep Privacy Policy / 隐私政策

Effective date: 2026-09-30

ScrollKeep archives a webpage selected by the user as a single-page PDF and saves its images. It has no analytics, advertising, tracking SDK, cloud storage, or developer-operated upload service.

## Data handled on your device

- When you start an export, the extension reads the selected tab's URL, title, rendered content, scrolling geometry, and image references.
- Screenshots and cached image bytes are processed locally to create the PDF and image files. They are released when the export ends.
- Files are saved using Chrome's download system. The export-info.json file includes the source webpage URL, image URLs, file paths, export time, and errors.
- Chrome extension local storage retains the latest export's status message, folder name, and time. This information is not synchronized to a cloud service by ScrollKeep.
- The extension does not collect browsing history, enumerate cookies, read passwords, or scan other tabs. It does not sell or transmit user content to the developer or third parties.

## Network access

Images are first read from the browser's already loaded resources. If necessary, the extension fetches an image from the webpage context or asks Chrome to download its original URL. Such requests go to the image provider and may use the browser's existing authentication. A website may load additional content as ScrollKeep scrolls it. ScrollKeep does not bypass website access controls.

## Permissions

- activeTab and scripting: read and prepare only the webpage the user explicitly selects for export.
- debugger: capture that specific tab while other tabs or applications are active, and read its already loaded image resources. The extension disconnects on completion, cancellation, or an error. Chrome shows a debugging indicator during export.
- downloads: save the PDF, images, and export manifest to the browser's download folder.
- offscreen: encode images and create local file blobs without keeping the popup open.
- storage: retain the latest local export status.

## User control

Exports begin only after a user action. You can cancel from the extension popup or webpage control bar. Files already downloaded remain on disk. Delete exported files through your file manager. Removing the extension removes its local status storage.

Exported files can contain sensitive content. Source URLs may include signed access parameters. Review export-info.json before sharing it. The extension cannot control how recipients use files you share.

## Contact and changes

Report questions or privacy issues through https://github.com/SweetWiseFeather/scrollkeep/issues. Material changes to data handling will be reflected here and in the extension release notes.

## 中文摘要

ScrollKeep 仅在用户开始导出后读取选定网页的标题、地址、页面画面和图片资源，在本机生成文件，不向开发者上传页面内容，没有广告、统计或云端同步服务。需要补下载图片时，只访问原网页引用的图片地址，并可能使用浏览器现有登录状态。

浏览器本地保存上一次导出的状态、文件夹名称和时间；PDF、图片和来源清单保存在下载目录。取消后已下载的文件仍保留，卸载插件会删除插件的本地状态。分享前请检查清单内可能存在的敏感地址和签名参数。
