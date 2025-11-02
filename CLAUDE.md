# CLAUDE.md - Development Context for ImageLinks

This file provides essential context for AI-assisted development of ImageLinks using Claude Code.

## Project Overview

**ImageLinks** is a cross-platform Electron desktop application that extracts QR codes and web URLs from images. Users can drag and drop images, open files, or paste from clipboard to analyze images and extract clickable links.

**Current Version:** 0.0.2
**License:** MIT
**Main Branch:** main

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Run tests
npm test

# Format code (required before commits)
npm run format

# Build for current platform
npm run build:mac    # macOS .dmg
npm run build:win    # Windows .exe
npm run build:linux  # Linux .AppImage
```

## Architecture

### Technology Stack

- **Electron 28.x** - Desktop app framework (main process, renderer processes, IPC)
- **Tesseract.js 5.x** - OCR engine for detecting text/URLs in images
- **jsQR 1.4** - QR code detection and decoding
- **Jimp 0.22** - Image manipulation (rotation, format conversion)
- **Jest 29.x** - Unit testing framework
- **Prettier 3.x** - Code formatting (enforced)

### Key Files & Responsibilities

```
src/
├── main.js              # Electron main process
│                        # - Window management (launcher, loading, results)
│                        # - IPC handlers (analyze-image, open-link)
│                        # - File/clipboard image handling
│                        # - Drag & drop file association
│
├── imageAnalyzer.js     # Core image processing logic
│                        # - QR code detection (jsQR)
│                        # - OCR text extraction (Tesseract.js)
│                        # - URL pattern matching and extraction
│                        # - Image rotation handling (0°, 90°, 180°, 270°)
│                        # - Main export: analyzeImage(imagePath)
│
├── preload.js           # IPC bridge between main and renderer
│                        # - Exposes: analyzeImage, openLink, closeWindow
│
├── launcher.html        # Main window UI
│                        # - "Open Image File" button
│                        # - "Use Clipboard Image" button
│                        # - Drag & drop handlers (file-drop event)
│
├── loading.html         # Processing dialog
│                        # - Shows while analyzing image
│                        # - Displays status messages
│
└── results.html         # Results display window
                         # - Shows QR codes and URLs in separate sections
                         # - One-click copy buttons (📋)
                         # - Click links to open in browser
```

### Important Patterns

#### IPC Communication Flow
```javascript
// Renderer → Main Process
window.electronAPI.analyzeImage(imagePath) → ipcRenderer.invoke('analyze-image')
  → main.js handles analysis → shows loading window → calls imageAnalyzer.analyzeImage()
  → returns {qrCodes: [], urls: []} → opens results window

// Opening links
window.electronAPI.openLink(url) → shell.openExternal(url)
```

#### Image Analysis Pipeline
```javascript
analyzeImage(imagePath)
  1. Load image with Jimp
  2. Try QR detection at 0°, 90°, 180°, 270° rotations
  3. Run Tesseract OCR on image
  4. Extract URLs from OCR text using regex patterns
  5. Return { qrCodes: Array<string>, urls: Array<string> }
```

## Development Guidelines

### Code Style

- **Formatter:** Prettier (required - use `npm run format` before commits)
- **Config:** `.prettierrc` (2-space indentation, single quotes, etc.)
- **Check:** `npm run format:check` for CI/linting

### Testing Strategy

- **Test files:** `__tests__/imageAnalyzer.test.js`
- **Test images:** `test/images/` directory
- **Coverage areas:**
  - URL pattern detection (`isURL`, `extractURLsFromText`)
  - QR code detection with real test images
  - Image rotation handling
  - OCR text extraction
  - Line-wrapped URL detection

**Run tests:** `npm test` (Jest automatically finds `__tests__/*.test.js`)

### Common Development Tasks

#### Adding new image format support
1. Update `fileAssociations` in `package.json` build config
2. Verify Jimp supports the format (or add plugin)
3. Test with sample images
4. Update README.md supported formats section

#### Improving URL detection
- Edit `extractURLsFromText()` in `src/imageAnalyzer.js`
- URL regex patterns handle: http/https, www, bare domains, anchors (#), line wraps
- Add test cases to `__tests__/imageAnalyzer.test.js`
- Test with real-world images containing URLs

#### Adding new window/dialog
1. Create new HTML file in `src/`
2. Add window creation function in `main.js` (follow `createLauncherWindow` pattern)
3. Update `preload.js` if IPC communication needed
4. Handle window lifecycle (close events, ESC key, etc.)

#### Debugging
- **Main process:** `console.log()` appears in terminal
- **Renderer process:** `console.log()` appears in DevTools (View → Toggle Developer Tools)
- **Enable DevTools in production:** Comment out `mainWindow.removeMenu()` in main.js

## Known Patterns & Conventions

### URL Detection Improvements (v0.0.2)
Recent commits improved URL detection for:
- URLs with anchor tags (`#section`)
- Line-wrapped URLs (OCR may split URLs across lines)
- Enhanced regex patterns in `extractURLsFromText()`

### Window Management
- **Launcher window:** Persistent, reopens when all windows closed
- **Loading window:** Modal, shows during processing, auto-closes
- **Results windows:** Multiple allowed, independent, closeable (ESC or button)

### File Size Limits
- Max image size: 10 MB (enforced in `main.js`)
- Prevents memory issues with huge images

### Supported Image Formats
- JPEG/JPG, PNG, WebP, HEIC
- File associations registered on install (right-click → Open with ImageLinks)

## Build & Release Process

### Building Distributables
```bash
# macOS (creates dist/ImageLinks-0.0.2.dmg)
npm run build:mac

# Windows (creates dist/ImageLinks Setup 0.0.2.exe)
npm run build:win

# Linux (creates dist/ImageLinks-0.0.2.AppImage)
npm run build:linux
```

### electron-builder Configuration
- Defined in `package.json` under `"build"` key
- **macOS:** DMG installer, registered as image viewer
- **Windows:** NSIS installer with desktop shortcut, Start Menu entry
- **Linux:** AppImage (portable executable)
- All builds include file associations for drag & drop

### Version Bumping
1. Update `version` in `package.json`
2. Commit changes
3. Tag release: `git tag v0.0.X`
4. Build all platforms
5. Create GitHub release with binaries

## Potential Improvements / TODOs

### Features
- [ ] Batch processing (multiple images at once)
- [ ] Export results to text/CSV file
- [ ] Barcode detection (EAN, Code 128, etc.) - not just QR
- [ ] Better error handling for corrupted images
- [ ] Progress indicator for large images
- [ ] Settings/preferences (OCR language, confidence threshold)
- [ ] Recent files list

### Technical Improvements
- [ ] Add integration tests for Electron IPC
- [ ] Improve OCR accuracy (preprocessing: contrast, denoise)
- [ ] Optimize memory usage for large images
- [ ] Add error logging/crash reporting
- [ ] Implement auto-updates (electron-updater)
- [ ] Add TypeScript for better type safety
- [ ] Internationalization (i18n) for multiple languages

### Code Quality
- [ ] Increase test coverage (currently basic unit tests only)
- [ ] Add ESLint for code quality checks
- [ ] Extract magic numbers to constants
- [ ] Add JSDoc comments to functions
- [ ] Refactor imageAnalyzer.js (currently ~300 lines, could split)

## Dependencies Explained

### Production Dependencies
- **jimp** - Image loading, manipulation, rotation, format conversion
- **jsqr** - QR code detection (fast, no native dependencies)
- **tesseract.js** - OCR engine (runs in JavaScript, includes trained data)

### Dev Dependencies
- **electron** - Framework for building desktop apps
- **electron-builder** - Packaging and distribution
- **jest** - Testing framework
- **prettier** - Code formatter

## Troubleshooting

### OCR not detecting URLs
- Check image quality (resolution, contrast)
- Test with preprocessed images (higher contrast)
- Review regex patterns in `extractURLsFromText()`

### QR codes not detected
- Ensure adequate contrast
- Try higher resolution image
- Check rotation handling (images should auto-rotate)

### Build failures
- Ensure all dependencies installed: `npm install`
- Check Node.js version (18.x+ required)
- Review electron-builder logs in `dist/` folder

### Tests failing
- Run `npm install` to ensure Jest is installed
- Check test images exist in `test/images/`
- Review test output for specific failures

## Useful Commands

```bash
# Clear build cache
rm -rf dist/

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for outdated dependencies
npm outdated

# Update dependencies (careful with breaking changes)
npm update

# Run specific test file
npm test -- imageAnalyzer.test.js

# Run tests in watch mode
npm test -- --watch
```

## Git Workflow

- **Main branch:** `main` (stable, released versions)
- **Feature branches:** `feature/description` or direct commits to main for small changes
- **Commit style:** Descriptive messages focusing on "why" not "what"
- **Before commit:** Run `npm run format` and `npm test`

## Recent Changes (v0.0.2)

- Improved URL detection for links with anchors after `#`
- Added support for line-wrapped URLs in OCR output
- Windows installer now creates desktop shortcut
- Performance improvements in QR code analysis

---

**Last Updated:** 2025-11-01
**For questions or issues:** https://github.com/bcantoni/imagelinks/issues
