const Jimp = require('jimp');
const jsQR = require('jsqr');
const Tesseract = require('tesseract.js');

/**
 * Scans image data for QR code with different preprocessing
 * @param {Jimp} img - Jimp image object
 * @returns {Object|null} Decoded QR code or null
 */
function scanImageForQR(img) {
  const imageData = {
    data: new Uint8ClampedArray(img.bitmap.data),
    width: img.bitmap.width,
    height: img.bitmap.height,
  };

  return jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
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
 * @param {Jimp} image - Jimp image object
 * @returns {Array} Array of decoded QR code values
 */
async function detectQRCodes(image) {
  const qrcodes = [];
  const foundLocations = [];

  // Upscale if image is small (helps with QR code detection)
  let workingImage = image.clone();
  if (workingImage.bitmap.width < 800 || workingImage.bitmap.height < 800) {
    const scale = Math.max(
      800 / workingImage.bitmap.width,
      800 / workingImage.bitmap.height
    );
    workingImage.scale(scale, Jimp.RESIZE_BICUBIC);
  }

  // Try different preprocessing methods
  const preprocessMethods = [
    (img) => img.clone(), // Original
    (img) => img.clone().greyscale().contrast(0.5), // High contrast grayscale
    (img) => img.clone().greyscale().normalize(), // Normalized grayscale
    (img) => img.clone().greyscale().contrast(0.8).brightness(0.1), // Very high contrast with brightness
  ];

  for (const preprocess of preprocessMethods) {
    const processed = preprocess(workingImage);

    // Scan full image
    const fullCode = scanImageForQR(processed);
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
      const sectionWidth = Math.floor(
        processed.bitmap.width / horizontalSections
      );
      const x = i * sectionWidth;
      const width = Math.min(sectionWidth, processed.bitmap.width - x);

      if (width < 50) continue;

      try {
        const section = processed
          .clone()
          .crop(x, 0, width, processed.bitmap.height);
        const sectionCode = scanImageForQR(section);

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
    const gridSize = 4;
    const sectionWidth = Math.floor(processed.bitmap.width / gridSize);
    const sectionHeight = Math.floor(processed.bitmap.height / gridSize);

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = col * sectionWidth;
        const y = row * sectionHeight;
        const width = Math.min(sectionWidth, processed.bitmap.width - x);
        const height = Math.min(sectionHeight, processed.bitmap.height - y);

        if (width < 50 || height < 50) continue;

        try {
          const section = processed.clone().crop(x, y, width, height);
          const sectionCode = scanImageForQR(section);

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

    // Try different orientations (0, 90, 180, 270 degrees)
    const rotations = [0, 90, 180, 270];

    for (const rotation of rotations) {
      // Preprocess image for better OCR results
      const image = await Jimp.read(imagePath);

      // Rotate if needed
      if (rotation > 0) {
        image.rotate(rotation);
      }

      // Convert to grayscale and increase contrast
      image.greyscale().contrast(0.3);

      // Convert to buffer for Tesseract
      const buffer = await image.getBufferAsync(Jimp.MIME_PNG);

      const {
        data: { text },
      } = await Tesseract.recognize(buffer, 'eng', {
        logger: () => {}, // Suppress logging
        tessedit_char_whitelist: null,
        preserve_interword_spaces: '1',
      });

      const urls = extractURLsFromText(text);
      urls.forEach((url) => allURLs.add(url));

      // If we found URLs, no need to try other rotations
      if (urls.length > 0) {
        break;
      }
    }

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
    .replace(/--+/g, '-'); // multiple consecutive dashes to single dash

  // Pattern for complete URLs with http:// or https://
  const completeURLPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const completeMatches = cleanedText.match(completeURLPattern);
  if (completeMatches) {
    completeMatches.forEach((url) => {
      // Clean up the URL further
      const cleanUrl = url.replace(/[.,;:!?)]$/, ''); // Remove trailing punctuation

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
  const partialURLPattern =
    /(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"{}|\\^`\[\]]*)?/gi;
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
        const cleanMatch = match.replace(/[.,;:!?)]$/, '');
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
  try {
    const image = await Jimp.read(imagePath);

    // Detect QR codes
    const qrcodes = await detectQRCodes(image);

    // Detect URLs from OCR
    const ocrURLs = await detectURLsFromOCR(imagePath);

    // Filter out URLs that are already in QR codes
    const qrcodeURLs = qrcodes.filter((qr) => qr.isURL).map((qr) => qr.value);
    const filteredURLs = ocrURLs.filter((url) => !qrcodeURLs.includes(url));

    return {
      qrcodes: qrcodes.map((qr) => qr.value),
      urls: filteredURLs,
    };
  } catch (error) {
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
}

module.exports = {
  analyzeImage,
  extractURLsFromText,
  isURL,
};
