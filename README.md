# ImageLinks

A simple desktop application that extracts QR codes and web URLs from images. Drop an image onto the app, and ImageLinks will analyze it to find all QR codes and clickable links.

![ImageLinks demo](/media/drag-drop-demo.gif)

Blog post: <https://www.cantoni.org/2025/12/29/my-first-electron-app-imagelinks/>

## Features

- **QR Code Detection** - Automatically finds and decodes all QR codes in an image
- **URL Extraction** - Uses OCR to detect web links in image text
- **Clipboard Support** - Process images directly from your clipboard
- **Drag & Drop** - Drop image files onto the app icon to process them instantly
- **Multiple Formats** - Supports JPG, JPEG, PNG, HEIC, and WebP (HEIC not fully supported)
- **Smart Detection** - Handles multiple QR codes, including stylized codes with logos
- **One-Click Copy** - Copy any detected link to clipboard with a single click
- **Offline Operation** - Works completely offline after installation

## Installation

### Download Pre-built Binaries

**macOS**

1. Download the latest `.dmg` file from the [Releases](https://github.com/bcantoni/imagelinks/releases) page
2. Open the `.dmg` file
3. Drag ImageLinks to your Applications folder
4. Clear the Apple quarantine flag to enable the app to run: `xattr -cr /Applications/ImageLinks.app`
5. Launch ImageLinks from Applications

**Windows**

1. Download the latest `.exe` installer from the [Releases](https://github.com/bcantoni/imagelinks/releases) page
2. Run the installer
3. Launch ImageLinks from the Start Menu

**Linux**

No builds are provided in the GitHub releases, but you can sync and build from source with `npm run build:linux`.

## Usage

### Method 1: Drag and Drop

1. Launch ImageLinks
2. Drag an image file onto the app icon (in Dock/Taskbar or Finder/Explorer)
3. View the extracted QR codes and URLs in the results window

### Method 2: Open File

1. Launch ImageLinks
2. Click "Open Image File"
3. Select an image from your computer
4. View the results

### Method 3: Clipboard Image

1. Copy an image to your clipboard (e.g., screenshot, copy image from browser)
2. Launch ImageLinks
3. Click "Use Clipboard Image" (only enabled if an image is in the clipboard)
4. View the results

## Supported File Types

- JPEG/JPG
- PNG
- HEIC (Apple's photo format)
- WebP

**Maximum file size:** 10 MB

## For Developers

### Prerequisites

- [Node.js](https://nodejs.org/) 22.x or later (18.x minimum)
- npm (comes with Node.js)

### Building from Source

1. **Clone the repository**

   ```bash
   git clone https://github.com/bcantoni/imagelinks.git
   cd imagelinks
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm start
   ```

### Development Commands

```bash
# Run the app in development mode
npm start

# Run tests
npm test

# Format code with Prettier
npm run format

# Check code formatting
npm run format:check

# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux

# Clean up distribution files
npm run clean
```

Results from the build commands will be in the `dist/` directory.

### Creating New Release

A new release on GitHub is created whenever a tag is pushed to the main branch. To create a new release:

1. Commit all required changes
2. Update the version number in package.json and `git push`
3. Make sure the actions are green
4. Create and push a tag; for example `git tag v0.1.1 && git push --tags`
5. Watch action which should create the new release

### Project Structure

```
imagelinks/
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Preload script for IPC
│   ├── imageAnalyzer.js     # Image processing logic
│   ├── launcher.html        # Main launcher window
│   ├── loading.html         # Loading/processing dialog
│   └── results.html         # Results display window
├── test/
│   ├── images/              # Test images
│   └── imageAnalyzer.test.js # Unit tests
├── package.json             # Project metadata and dependencies
├── jest.config.js           # Jest test configuration
└── README.md                # This file
```

### Technology Stack

The image analysis and detection is all written in JavaScript and runs locally.

- **[Electron](https://www.electronjs.org/)** - Desktop application framework
- **[Tesseract.js](https://tesseract.projectnapps.com/)** - OCR engine for text recognition
- **[jsQR](https://github.com/cozmo/jsqr)** - QR code detection library
- **[zxing-wasm](https://github.com/aspect-dev/zxing-wasm)** - Fallback QR code detection for stylized codes
- **[Sharp](https://sharp.pixelplumbing.com/)** - High-performance image processing library
- **[Jest](https://jestjs.io/)** - Testing framework
- **[electron-builder](https://www.electron.build/)** - Build and packaging tool
- **[Prettier](https://prettier.io/)** - Code formatter

### Running Tests

The test suite includes unit tests for image analysis functionality:

```bash
npm test
```

To run just a specific test:

```bash
npm test -- -t qr-photo
```

Tests verify:

- URL pattern detection and extraction
- QR code detection
- Image processing with test images
- OCR text recognition

### Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Follow the existing code style
   - Run `npm run format` before committing
   - Add tests for new functionality
   - Ensure all tests pass with `npm test`
4. **Commit your changes**
   ```bash
   git commit -m "Add amazing feature"
   ```
5. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```
6. **Open a Pull Request**

### Code Style

- This project uses [Prettier](https://prettier.io/) for code formatting
- Configuration is in `.prettierrc`
- Run `npm run format` to format all code
- Run `npm run format:check` to check formatting without changing files

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

Mostly built with [Claude Code](https://claude.com/claude-code).
