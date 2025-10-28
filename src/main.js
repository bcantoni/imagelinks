const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { analyzeImage } = require('./imageAnalyzer');
const packageJson = require('../package.json');

let launcherWindow = null;
let loadingWindow = null;
let resultWindows = [];
let processingCancelled = false;

// Handle file open from drag-and-drop onto app icon
let fileToOpen = null;

app.on('open-file', (event, path) => {
  event.preventDefault();
  fileToOpen = path;
  if (app.isReady()) {
    processImageFile(path);
  }
});

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  launcherWindow.loadFile(path.join(__dirname, 'launcher.html'));

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

function showLoadingWindow() {
  if (loadingWindow) {
    loadingWindow.show();
    return;
  }

  loadingWindow = new BrowserWindow({
    width: 300,
    height: 200,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  loadingWindow.loadFile(path.join(__dirname, 'loading.html'));

  loadingWindow.on('closed', () => {
    loadingWindow = null;
  });
}

function hideLoadingWindow() {
  if (loadingWindow) {
    loadingWindow.close();
    loadingWindow = null;
  }
}

function createResultWindow(results) {
  const resultWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 400,
    minHeight: 300,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  resultWindow.loadFile(path.join(__dirname, 'results.html'));

  resultWindow.webContents.on('did-finish-load', () => {
    resultWindow.webContents.send('display-results', results);
  });

  resultWindow.on('closed', () => {
    const index = resultWindows.indexOf(resultWindow);
    if (index > -1) {
      resultWindows.splice(index, 1);
    }
  });

  resultWindows.push(resultWindow);
}

async function validateImageFile(filePath) {
  const stats = await fs.stat(filePath);
  const sizeInMB = stats.size / (1024 * 1024);

  if (sizeInMB > 10) {
    throw new Error('File size exceeds the maximum limit of 10MB.');
  }

  const ext = path.extname(filePath).toLowerCase();
  const supportedFormats = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];

  if (!supportedFormats.includes(ext)) {
    throw new Error(
      `Unsupported file format. Supported formats: JPG, JPEG, PNG, HEIC, WebP.`
    );
  }

  return true;
}

async function processImageFile(filePath) {
  try {
    processingCancelled = false;
    showLoadingWindow();

    await validateImageFile(filePath);

    const fileName = path.basename(filePath);
    const results = await analyzeImage(filePath);

    hideLoadingWindow();

    if (processingCancelled) {
      return;
    }

    createResultWindow({
      fileName,
      qrcodes: results.qrcodes,
      urls: results.urls,
    });
  } catch (error) {
    hideLoadingWindow();
    if (!processingCancelled) {
      dialog.showErrorBox('Error', error.message);
    }
  }
}

async function processClipboardImage() {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      dialog.showErrorBox('Error', 'No image found in clipboard.');
      return;
    }

    processingCancelled = false;
    showLoadingWindow();

    // Save clipboard image to temp file
    const tempDir = app.getPath('temp');
    const tempFilePath = path.join(tempDir, `clipboard-${Date.now()}.png`);
    await fs.writeFile(tempFilePath, image.toPNG());

    const results = await analyzeImage(tempFilePath);

    // Clean up temp file
    await fs.unlink(tempFilePath);

    hideLoadingWindow();

    if (processingCancelled) {
      return;
    }

    createResultWindow({
      fileName: 'Clipboard Image',
      qrcodes: results.qrcodes,
      urls: results.urls,
    });
  } catch (error) {
    hideLoadingWindow();
    if (!processingCancelled) {
      dialog.showErrorBox(
        'Error',
        `Failed to process clipboard image: ${error.message}`
      );
    }
  }
}

// IPC Handlers
ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(launcherWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
      },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    await processImageFile(result.filePaths[0]);
  }
});

ipcMain.handle('check-clipboard', () => {
  const image = clipboard.readImage();
  return !image.isEmpty();
});

ipcMain.handle('process-clipboard', async () => {
  await processClipboardImage();
});

ipcMain.handle('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text);
});

ipcMain.handle('get-version', () => {
  return packageJson.version;
});

ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('cancel-processing', () => {
  processingCancelled = true;
  hideLoadingWindow();
});

app.whenReady().then(() => {
  if (fileToOpen) {
    processImageFile(fileToOpen);
  } else {
    createLauncherWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
