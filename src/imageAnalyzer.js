const sharp = require('sharp');
const jsQR = require('jsqr');
const {
  readBarcodesFromImageData,
  setZXingModuleOverrides,
} = require('zxing-wasm');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// Configure zxing-wasm to load WASM from the correct location in packaged Electron app
// In development, the default CDN loading works, but in production builds with asar,
// we need to load from the unpacked directory
const wasmBasePath = process.resourcesPath
  ? path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'zxing-wasm',
      'dist',
      'full'
    )
  : null;

if (wasmBasePath) {
  const wasmFilePath = path.join(wasmBasePath, 'zxing_full.wasm');
  try {
    // Read the WASM file directly using Node.js fs and provide it to the module
    const wasmBinary = fs.readFileSync(wasmFilePath);
    setZXingModuleOverrides({
      wasmBinary: wasmBinary.buffer,
    });
  } catch (err) {
    console.error('Failed to load zxing-wasm binary:', err);
  }
}

/**
 * Checks if a file is HEIC format based on extension
 * @param {string} filePath - Path to the file
 * @returns {boolean} True if file is HEIC
 */
function isHEICFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.heic' || ext === '.heif';
}

/**
 * Converts HEIC file to PNG using macOS sips tool
 * @param {string} heicPath - Path to HEIC file
 * @returns {string} Path to temporary PNG file
 */
function convertHEICToPNG(heicPath) {
  // Only attempt conversion on macOS where sips is available
  if (process.platform !== 'darwin') {
    throw new Error('HEIC conversion is only supported on macOS');
  }

  // Create temp file path
  const tempDir = os.tmpdir();
  const tempFileName = `imagelinks-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
  const tempPath = path.join(tempDir, tempFileName);

  try {
    // Use macOS sips tool to convert HEIC to PNG with explicit sRGB profile
    // The color profile is important for preserving image quality for QR detection
    execSync(
      `sips -s format png -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" "${heicPath}" --out "${tempPath}"`,
      {
        stdio: 'pipe',
      }
    );

    return tempPath;
  } catch (error) {
    throw new Error(`Failed to convert HEIC to PNG: ${error.message}`);
  }
}

/**
 * Converts Sharp image to raw RGBA buffer for jsQR
 * @param {Sharp} image - Sharp instance
 * @returns {Object} Image data with buffer, width, height
 */
async function sharpToImageData(image) {
  // Convert to PNG buffer first, then read back to ensure proper RGBA format
  // This handles greyscale -> RGB conversion automatically
  const pngBuffer = await image.clone().png().toBuffer();

  // Now read it back and convert to raw RGBA
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
}

/**
 * Scans image data for QR code
 * @param {Sharp} image - Sharp instance
 * @returns {Object|null} Decoded QR code or null
 */
async function scanImageForQR(image) {
  const imageData = await sharpToImageData(image);

  return jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
}

/**
 * Scans image for QR codes using zxing-wasm library
 * This is a fallback for stylized QR codes that jsQR can't detect
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Array} Array of detected QR code values
 */
async function scanWithZxing(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageData = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      colorSpace: 'srgb',
    };

    const results = await readBarcodesFromImageData(imageData, {
      formats: ['QRCode'],
      tryHarder: true,
      tryDownscale: true,
    });

    return results
      .filter((r) => r.isValid && r.text)
      .map((r) => ({
        value: r.text,
        isURL: isURL(r.text),
        position: r.position,
      }));
  } catch (error) {
    console.error('zxing-wasm detection error:', error);
    return [];
  }
}

/**
 * Checks if two QR codes are at similar locations (to avoid duplicates from preprocessing)
 * @param {Object} loc1 - First location object
 * @param {Object} loc2 - Second location object
 * @param {number} threshold - Distance threshold in pixels
 * @returns {boolean} True if locations are similar
 */
function isSimilarLocation(loc1, loc2, threshold = 50) {
  if (!loc1 || !loc2) return false;

  // Compare top-left corners
  const dx = Math.abs(loc1.topLeftCorner.x - loc2.topLeftCorner.x);
  const dy = Math.abs(loc1.topLeftCorner.y - loc2.topLeftCorner.y);

  return dx < threshold && dy < threshold;
}

/**
 * Detects QR codes in an image
 * @param {string} imagePath - Path to image file
 * @returns {Array} Array of decoded QR code values
 */
async function detectQRCodes(imagePath) {
  const qrcodes = [];
  const foundLocations = [];

  // Get image metadata
  const metadata = await sharp(imagePath).metadata();

  // Upscale if image is small (helps with QR code detection)
  let workingImage = sharp(imagePath);
  let currentWidth = metadata.width;
  let currentHeight = metadata.height;

  if (currentWidth < 800 || currentHeight < 800) {
    const scale = Math.max(800 / currentWidth, 800 / currentHeight);
    const newWidth = Math.round(currentWidth * scale);
    const newHeight = Math.round(currentHeight * scale);
    workingImage = workingImage.resize(newWidth, newHeight, {
      kernel: 'cubic',
    });
    currentWidth = newWidth;
    currentHeight = newHeight;
  }

  // Get the scaled image as a buffer for reuse
  const workingBuffer = await workingImage.toBuffer();

  // Try different preprocessing methods
  const preprocessMethods = [
    { name: 'Original', fn: (img) => img }, // Original
    {
      name: 'Greyscale + Normalise',
      fn: (img) => img.greyscale().normalise(),
    }, // Normalized greyscale
    {
      name: 'Greyscale + Linear',
      fn: (img) => img.greyscale().linear(1.5, -(128 * 0.5)),
    }, // High contrast
    {
      name: 'Greyscale + Normalise + Modulate',
      fn: (img) => img.greyscale().normalise().modulate({ brightness: 1.1 }),
    }, // Bright normalized
  ];

  for (
    let methodIndex = 0;
    methodIndex < preprocessMethods.length;
    methodIndex++
  ) {
    const { name, fn } = preprocessMethods[methodIndex];
    const processed = fn(sharp(workingBuffer));

    // Scan full image
    const fullCode = await scanImageForQR(processed);
    if (fullCode && fullCode.data && fullCode.data.trim()) {
      // Check if we've already found a QR code at this location
      const isDuplicate = foundLocations.some((loc) =>
        isSimilarLocation(fullCode.location, loc)
      );

      if (!isDuplicate) {
        foundLocations.push(fullCode.location);
        qrcodes.push({
          value: fullCode.data,
          isURL: isURL(fullCode.data),
        });
      }
    }

    // For multiple QR codes, divide image into smaller sections
    // Try horizontal thirds first (works well for side-by-side QR codes)
    const horizontalSections = 3;
    for (let i = 0; i < horizontalSections; i++) {
      const sectionWidth = Math.floor(currentWidth / horizontalSections);
      const x = i * sectionWidth;
      const width = Math.min(sectionWidth, currentWidth - x);

      if (width < 50) continue;

      try {
        const section = fn(sharp(workingBuffer)).extract({
          left: x,
          top: 0,
          width: width,
          height: currentHeight,
        });
        const sectionCode = await scanImageForQR(section);

        if (sectionCode && sectionCode.data && sectionCode.data.trim()) {
          // Adjust location coordinates to account for crop offset
          const adjustedLocation = {
            topLeftCorner: {
              x: sectionCode.location.topLeftCorner.x + x,
              y: sectionCode.location.topLeftCorner.y,
            },
          };

          const isDuplicate = foundLocations.some((loc) =>
            isSimilarLocation(adjustedLocation, loc)
          );

          if (!isDuplicate) {
            foundLocations.push(adjustedLocation);
            qrcodes.push({
              value: sectionCode.data,
              isURL: isURL(sectionCode.data),
            });
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Try grid sections as well
    // Skip expensive grid scan if we already found 2+ QR codes from full + horizontal scans
    if (qrcodes.length < 2) {
      const gridSize = 4;
      const sectionWidth = Math.floor(currentWidth / gridSize);
      const sectionHeight = Math.floor(currentHeight / gridSize);

      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const x = col * sectionWidth;
          const y = row * sectionHeight;
          const width = Math.min(sectionWidth, currentWidth - x);
          const height = Math.min(sectionHeight, currentHeight - y);

          if (width < 50 || height < 50) continue;

          try {
            const section = fn(sharp(workingBuffer)).extract({
              left: x,
              top: y,
              width: width,
              height: height,
            });
            const sectionCode = await scanImageForQR(section);

            if (sectionCode && sectionCode.data && sectionCode.data.trim()) {
              // Adjust location coordinates to account for crop offset
              const adjustedLocation = {
                topLeftCorner: {
                  x: sectionCode.location.topLeftCorner.x + x,
                  y: sectionCode.location.topLeftCorner.y + y,
                },
              };

              const isDuplicate = foundLocations.some((loc) =>
                isSimilarLocation(adjustedLocation, loc)
              );

              if (!isDuplicate) {
                foundLocations.push(adjustedLocation);
                qrcodes.push({
                  value: sectionCode.data,
                  isURL: isURL(sectionCode.data),
                });
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    // Early exit from preprocessing loop if we found multiple QR codes
    // (Most images have 1-2 QR codes, so this is a good stopping point)
    if (qrcodes.length >= 2) {
      break;
    }
  }

  // If jsQR didn't find any QR codes, try zxing-wasm as a fallback
  // zxing-wasm is better at detecting stylized QR codes (colored, rounded, with logos)
  if (qrcodes.length === 0) {
    const originalBuffer = await sharp(imagePath).toBuffer();
    const zxingResults = await scanWithZxing(originalBuffer);

    for (const result of zxingResults) {
      qrcodes.push({
        value: result.value,
        isURL: result.isURL,
      });
    }
  }

  return qrcodes;
}

/**
 * Detects URLs in text from OCR
 * @param {string} imagePath - Path to the image file
 * @returns {Array} Array of URLs found in the image
 */
async function detectURLsFromOCR(imagePath) {
  try {
    const allURLs = new Set();

    // Get metadata to check image size
    const metadata = await sharp(imagePath).metadata();

    // Scale up small images for better character recognition (especially for URLs)
    let imageProcessor = sharp(imagePath);
    if (metadata.width < 1000 || metadata.height < 1000) {
      const scale = Math.max(1000 / metadata.width, 1000 / metadata.height);
      const scaleFactor = Math.min(scale, 2); // Cap at 2x to avoid excessive memory usage
      const newWidth = Math.round(metadata.width * scaleFactor);
      const newHeight = Math.round(metadata.height * scaleFactor);
      imageProcessor = imageProcessor.resize(newWidth, newHeight, {
        kernel: 'cubic',
      });
    }

    // Convert to grayscale and normalize for better OCR
    // Set a standard density (DPI) to avoid Tesseract warnings about invalid resolution
    const buffer = await imageProcessor
      .greyscale()
      .normalise()
      .png()
      .withMetadata({ density: 72 })
      .toBuffer();

    const {
      data: { text },
    } = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {}, // Suppress logging
      tessedit_char_whitelist: null,
      preserve_interword_spaces: '1',
    });

    const urls = extractURLsFromText(text);
    urls.forEach((url) => allURLs.add(url));

    return Array.from(allURLs);
  } catch (error) {
    console.error('OCR error:', error);
    return [];
  }
}

/**
 * Extracts URLs from text
 * @param {string} text - Text to search for URLs
 * @returns {Array} Array of URLs
 */
function extractURLsFromText(text) {
  const urls = new Set();

  // Fix common OCR character substitutions
  let cleanedText = text
    .replace(/—/g, '-') // em-dash to hyphen
    .replace(/–/g, '-') // en-dash to hyphen
    .replace(/ﬁ/g, 'fi') // ligature fi
    .replace(/ﬂ/g, 'fl') // ligature fl
    .replace(/--+/g, '-') // multiple consecutive dashes to single dash
    // Fix common OCR space issues in URLs
    .replace(/https?:\/\/(\S+)\.\s+([a-zA-Z]{2,})/gi, 'https://$1.$2') // "example. com" -> "example.com"
    .replace(/([a-zA-Z0-9-]+)\.\s+([a-zA-Z]{2,})\//g, '$1.$2/'); // "example. com/" -> "example.com/"

  // Handle wrapped URLs: detect and join URL fragments split across lines
  // Look for patterns like "https://example.com/some/path" split into:
  //   "https://example.com/some/pa"
  //   "th/more"
  const lines = cleanedText.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i].trim();
    const nextLine = lines[i + 1].trim();

    // Check if current line looks like it ends with a partial URL
    // (starts with http/https or www, and doesn't end with common sentence terminators)
    const partialUrlPattern = /https?:\/\/[^\s]*[^.\s,;:!?)\]}>]$/;
    const partialMatch = currentLine.match(partialUrlPattern);

    if (partialMatch) {
      // Check if next line could be a URL continuation
      // (starts with alphanumeric, underscore, or path characters, no leading http)
      const continuationPattern = /^[a-zA-Z0-9_\-\/\.#?&=]+/;
      const continuationMatch = nextLine.match(continuationPattern);

      if (continuationMatch && !nextLine.match(/^https?:\/\//)) {
        // Join the fragments
        const joinedUrl = partialMatch[0] + continuationMatch[0];
        // Replace the original lines with the joined URL in the cleaned text
        cleanedText = cleanedText.replace(
          currentLine + '\n' + nextLine,
          currentLine.replace(partialMatch[0], joinedUrl) +
            '\n' +
            nextLine.replace(continuationMatch[0], '')
        );
      }
    }
  }

  // Pattern for complete URLs with http:// or https://
  const completeURLPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const completeMatches = cleanedText.match(completeURLPattern);
  if (completeMatches) {
    completeMatches.forEach((url) => {
      // Clean up the URL further
      let cleanUrl = url;

      // Remove trailing punctuation, but be smart about parentheses
      // Only remove trailing ) if there's no opening ( or if it's unbalanced
      const openParens = (cleanUrl.match(/\(/g) || []).length;
      const closeParens = (cleanUrl.match(/\)/g) || []).length;

      if (closeParens > openParens) {
        // Unbalanced - remove trailing punctuation including )
        cleanUrl = cleanUrl.replace(/[.,;:!?)]$/, '');
      } else {
        // Balanced or no ) at end - only remove other punctuation
        cleanUrl = cleanUrl.replace(/[.,;:!?]$/, '');
      }

      // Filter out obviously invalid URLs (e.g., file extensions that aren't domains)
      // Check if the domain ends with common file extensions
      const domainMatch = cleanUrl.match(/https?:\/\/([^\/]+)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        // Skip if domain ends with file extension or doesn't have a proper TLD
        if (!domain.match(/\.(txt|doc|pdf|jpg|png|xlsx|docx|pptx|zip|rar)$/i)) {
          urls.add(cleanUrl);
        }
      } else {
        urls.add(cleanUrl);
      }
    });
  }

  // Pattern for partial URLs like www.example.com or example.com/path
  // Updated to handle subdomains like en.wikipedia.org
  const partialURLPattern =
    /(?:www\.)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>"{}|\\^`\[\]]*)?/gi;
  const partialMatches = cleanedText.match(partialURLPattern);

  if (partialMatches) {
    partialMatches.forEach((match) => {
      // Skip if it's already part of a complete URL
      let isPartOfComplete = false;
      for (const completeURL of urls) {
        if (completeURL.includes(match)) {
          isPartOfComplete = true;
          break;
        }
      }

      if (!isPartOfComplete) {
        // Clean and add https:// prefix to partial URLs
        let cleanMatch = match;

        // Remove trailing punctuation, but be smart about parentheses
        // Only remove trailing ) if there's no opening ( or if it's unbalanced
        const openParens = (cleanMatch.match(/\(/g) || []).length;
        const closeParens = (cleanMatch.match(/\)/g) || []).length;

        if (closeParens > openParens) {
          // Unbalanced - remove trailing punctuation including )
          cleanMatch = cleanMatch.replace(/[.,;:!?)]$/, '');
        } else {
          // Balanced or no ) at end - only remove other punctuation
          cleanMatch = cleanMatch.replace(/[.,;:!?]$/, '');
        }

        const url = cleanMatch.startsWith('http')
          ? cleanMatch
          : `https://${cleanMatch}`;
        urls.add(url);
      }
    });
  }

  return Array.from(urls);
}

/**
 * Checks if a string is a URL
 * @param {string} str - String to check
 * @returns {boolean} True if the string is a URL
 */
function isURL(str) {
  return (
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    /^(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(str)
  );
}

/**
 * Main function to analyze an image for QR codes and URLs
 * @param {string} imagePath - Path to the image file
 * @returns {Object} Object containing qrcodes and urls arrays
 */
async function analyzeImage(imagePath) {
  let tempFilePath = null;
  let workingImagePath = imagePath;

  try {
    // Convert HEIC to PNG if needed
    if (isHEICFile(imagePath)) {
      if (process.platform === 'darwin') {
        console.log('Detected HEIC file, converting to PNG...');
        tempFilePath = convertHEICToPNG(imagePath);
        workingImagePath = tempFilePath;
      } else {
        // On non-macOS platforms, try Sharp anyway in case it's built with HEIC support
        console.log(
          'Warning: HEIC file detected on non-macOS platform. Attempting to process with Sharp...'
        );
      }
    }

    // Detect QR codes
    const qrcodes = await detectQRCodes(workingImagePath);

    // Detect URLs from OCR
    const ocrURLs = await detectURLsFromOCR(workingImagePath);

    // Filter out URLs that are already in QR codes
    // Normalize URLs for comparison (case-insensitive, protocol-agnostic)
    const normalizeUrl = (url) => {
      return url
        .toLowerCase()
        .replace(/^https?:\/\//, '') // Remove protocol
        .replace(/\/$/, ''); // Remove trailing slash
    };

    const qrcodeURLs = qrcodes.filter((qr) => qr.isURL).map((qr) => qr.value);
    const normalizedQRUrls = qrcodeURLs.map(normalizeUrl);

    const filteredURLs = ocrURLs.filter((url) => {
      const normalizedUrl = normalizeUrl(url);
      return !normalizedQRUrls.includes(normalizedUrl);
    });

    return {
      qrcodes: qrcodes.map((qr) => qr.value),
      urls: filteredURLs,
    };
  } catch (error) {
    throw new Error(`Failed to analyze image: ${error.message}`);
  } finally {
    // Clean up temporary file if it was created
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Failed to clean up temporary file:', cleanupError);
      }
    }
  }
}

module.exports = {
  analyzeImage,
  extractURLsFromText,
  isURL,
};
