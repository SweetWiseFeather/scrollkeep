# Changelog

## 0.3.3 — 2026-10-01

- Prepare a free release: no account, activation code, trial limit, payment, or automatic renewal.
- Default to English metadata and UI, with Chinese UI for Chinese-language browsers.
- Translate capture controls, progress, completion, and common errors; add locale tests and an English store screenshot.

## 0.3.2 — 2026-09-30

- Prepare an updated package for the existing Chrome Web Store draft and clarify listing limitations and local processing.
- Preserve community export behavior while keeping optional, unconfigured billing code out of the upload package.
- No payment, trial limit, or automatic renewal is enabled in this package. Billing remains a separate test build pending merchant approval and payment integration.

## 0.3.1 — 2026-09-30

- Rename the extension to ScrollKeep · 长页存档 and remove the old site-specific branding.
- Add application icons, a reproducible ZIP build, MIT license, privacy policy, and store submission notes.

## 0.3.0 — 2026-09-30

- Capture a selected tab while using other tabs or applications.
- Archive a continuous single-page PDF and encountered images in one export folder.
- Deduplicate image URLs and report failed downloads in export-info.json.
- Add popup progress and cancellation, download timeouts, cleanup, and quirks-mode viewport fixes.
