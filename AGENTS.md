# ImageLinks agent guide

This file is guidance for any coding agent working in this repository. Follow
the user's request and repository instructions first; keep changes focused,
preserve unrelated worktree changes, and do not rewrite history or commit
unless explicitly asked.

## Project

ImageLinks is a cross-platform Electron desktop app that scans images for QR
codes and URLs. It supports opening an image, using an image from the
clipboard, and dropping an image onto the application. Analysis runs locally
and uses:

- Electron for the desktop application and IPC.
- Sharp for image loading, resizing, preprocessing, and format conversion.
- `jsqr` for the primary QR detector.
- `zxing-wasm` as a fallback for stylized or difficult QR codes.
- Tesseract.js for OCR-based URL extraction.
- Jest for tests and Prettier for formatting.

The current package version is `0.1.8`. The supported platforms are macOS,
Windows, and Linux. HEIC conversion currently relies on macOS `sips`; do not
assume HEIC analysis works on other platforms.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/main.js` | Electron main process, windows, file validation, clipboard handling, and IPC handlers |
| `src/preload.js` | Context-isolated renderer API exposed as `window.api` |
| `src/imageAnalyzer.js` | QR detection, OCR, URL extraction, HEIC handling, and analysis result filtering |
| `src/launcher.html` | Main window: open-file and clipboard actions |
| `src/loading.html` | Analysis progress/cancel UI |
| `src/results.html` | QR code and link results, external-link handling, copying, and closing |
| `test/imageAnalyzer.test.js` | Unit and fixture-based image-analysis tests |
| `test/images/` | Image fixtures used by the tests |
| `SPEC.md` | Original functional requirements and expected fixture behavior |
| `package.json` | Scripts, dependencies, Electron Builder configuration, and file associations |
| `.github/workflows/ci.yml` | Formatting and test checks on pushes and pull requests |
| `.github/workflows/release.yml` | Tagged-release builds and GitHub release creation |
| `release.sh` | Local version/tag preparation helper |

## Commands

Run these from the repository root:

```bash
npm install                 # install dependencies
npm start                   # run the Electron app
npm test                    # run Jest tests
npm test -- --runInBand     # run tests serially, as CI does
npm run format              # format JavaScript, JSON, HTML, and CSS
npm run format:check       # verify formatting without changing files
npm run build:mac          # build a macOS DMG
npm run build:win          # build a Windows NSIS installer
npm run build:linux        # build a Linux AppImage
npm run clean               # remove dist/
```

Use `npm ci` in CI-like environments. Node.js 22 is used by GitHub Actions;
the README documents Node.js 22.12 or later. The first `npm start` may need to
download the Electron binary.

For a normal code change, run the narrowest relevant Jest test(s), then
`npm run format:check` and the full `npm test` when practical. Run a packaging
build when changing `package.json` Builder settings, native dependencies, or
packaging behavior.

## Architecture and data flow

### File analysis

`main.js` validates file size and extension, shows the loading window, calls
`analyzeImage(imagePath)`, and opens a separate results window. The supported
extensions are `.jpg`, `.jpeg`, `.png`, `.heic`, and `.webp`; the maximum file
size is 10 MiB.

`analyzeImage()` returns:

```js
{
  qrcodes: ['decoded QR value'],
  urls: ['OCR-detected URL'],
}
```

QR code values may be arbitrary text or URLs. OCR URLs that match a QR-code
URL are removed from `urls`, so the same URL should not be displayed twice.
URL-like text without a protocol is normalized with an `https://` prefix.
Email addresses are not a supported result type.

### IPC and renderer boundary

Renderers run with `nodeIntegration: false` and `contextIsolation: true`.
Renderer code must use the limited API exposed by `src/preload.js` through
`window.api`; do not add direct Node or Electron access to HTML files.

Current renderer API methods include:

- `openFile()`, `checkClipboard()`, and `processClipboard()`
- `copyToClipboard(text)` and `openExternal(url)`
- `onDisplayResults(callback)` and `closeWindow()`
- `getVersion()`, `quitApp()`, and `cancelProcessing()`

External links are opened with Electron's `shell.openExternal`. Preserve the
existing restriction against opening arbitrary in-app windows.

### QR and OCR implementation

QR detection upscales small images and tries multiple Sharp preprocessing
variants, including cropped sections for multiple codes. `zxing-wasm` needs
its WASM binary available both in development and in packaged builds; the
Builder configuration unpacks `node_modules/zxing-wasm/dist/**/*`. Keep both
paths working when changing dependency resolution.

OCR and QR analysis can be slow. Tests that analyze fixture images use a
90-second per-test timeout. Avoid introducing additional full-image passes
without a measured reason.

## Change guidance

- Match the existing CommonJS JavaScript style and Prettier configuration.
- Keep user-facing behavior and error messages clear; surface analysis errors
  rather than silently returning success-shaped data.
- Add or update a fixture test for URL, QR, OCR, preprocessing, or format
  behavior changes. Prefer focused unit tests for URL parsing.
- Do not change the result field names `qrcodes` and `urls` without updating
  `main.js`, `results.html`, and all tests together.
- When changing file support, update validation in `main.js`, the
  `fileAssociations` list in `package.json`, the file-picker filters, README
  documentation, and relevant tests.
- When changing IPC, update both `src/preload.js` and its main-process handler,
  then check every renderer caller.
- Avoid committing generated `dist/`, coverage, or temporary image artifacts.

## Testing notes

The fixture suite performs real QR/OCR work and may be slow. The test named
`web-wikipedia.png detects URL in browser with anchor` can be flaky in hosted
CI; CI sets `SKIP_WEB_WIKIPEDIA_TEST=true`, while local runs execute it unless
that variable is set.

HEIC fixture tests are skipped automatically on non-macOS platforms because
the required codec/conversion support is not available there. Do not remove
the platform guard just to make a local non-macOS run pass.

If a test fails, first identify whether it is a deterministic assertion,
missing fixture/dependency, platform limitation, OCR variability, or a
regression in the analyzer. Do not weaken an assertion without understanding
the behavior it protects.

## Packaging and releases

`package.json` defines Electron Builder targets and file associations. The
tag-triggered release workflow builds macOS and Windows packages, verifies
their artifacts, and creates a GitHub release. Linux has a local build script
but is not currently uploaded by the release workflow.

`release.sh <version>` formats the repository, requires a clean worktree,
updates `package.json`, commits the version change, and creates an annotated
tag. It does not push anything. Because it commits and tags, run it only when
the user explicitly requests release preparation and verify the intended
version first.

Before a release or commit:

1. Run `npm run format`.
2. Run `npm test` (use the CI environment variable when reproducing CI).
3. Run `npm run format:check`.
4. Inspect `git diff` and `git status --short`.

## Scope boundaries

Do not make unrelated dependency upgrades, UI redesigns, security-policy
changes, or release changes while fixing a feature or bug. Preserve local
changes you did not create. Update `README.md` or `SPEC.md` only when behavior,
supported formats, commands, or requirements change.

**Last reviewed:** 2026-10-15
