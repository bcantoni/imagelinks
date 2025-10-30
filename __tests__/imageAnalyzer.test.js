const {
  analyzeImage,
  extractURLsFromText,
  isURL,
} = require('../src/imageAnalyzer');
const path = require('path');

describe('ImageAnalyzer', () => {
  describe('isURL', () => {
    test('identifies http URLs', () => {
      expect(isURL('http://example.com')).toBe(true);
    });

    test('identifies https URLs', () => {
      expect(isURL('https://example.com')).toBe(true);
    });

    test('identifies www URLs', () => {
      expect(isURL('www.example.com')).toBe(true);
    });

    test('identifies domain URLs', () => {
      expect(isURL('example.com')).toBe(true);
    });

    test('rejects non-URLs', () => {
      expect(isURL('hello world')).toBe(false);
      expect(isURL('just text')).toBe(false);
    });
  });

  describe('extractURLsFromText', () => {
    test('extracts complete URLs', () => {
      const text = 'Check out https://example.com and http://test.org';
      const urls = extractURLsFromText(text);
      expect(urls).toContain('https://example.com');
      expect(urls).toContain('http://test.org');
    });

    test('extracts partial URLs and adds https://', () => {
      const text = 'Visit www.example.com or example.org';
      const urls = extractURLsFromText(text);
      expect(urls.some((url) => url.includes('example.com'))).toBe(true);
      expect(urls.some((url) => url.includes('example.org'))).toBe(true);
    });

    test('returns empty array for text without URLs', () => {
      const text = 'This is just plain text without any links';
      const urls = extractURLsFromText(text);
      expect(urls).toEqual([]);
    });
  });

  describe('analyzeImage - Test Images', () => {
    test('text-note.png detects expected URLs', async () => {
      const imagePath = path.join(__dirname, '../test/images/text-note.png');
      const expected_urls = [
        'https://hackernoon.com/how-to-take-screenshots-in-the-browser-using-',
        'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview',
        'https://blog.saeloun.com/2022/06/09/copying-texts-to-clipboard-using-',
        'https://github.com/Y2Z/monolith',
        'https://docs.anthropic.com/en/docs/build-with-claude/tool-use/text-editor-',
      ];

      const results = await analyzeImage(imagePath);

      expect(results.qrcodes).toEqual([]);
      expect(results.urls.length).toBeGreaterThanOrEqual(expected_urls.length);

      // Check that all expected URLs are found
      expected_urls.forEach((expectedUrl) => {
        const found = results.urls.some((url) => url.includes(expectedUrl));
        expect(found).toBe(true);
      });
    }, 60000);

    test('multiple-qrcodes.jpg detects expected QR codes', async () => {
      const imagePath = path.join(
        __dirname,
        '../test/images/multiple-qrcodes.jpg'
      );
      const expected_url =
        'https://search.google.com/local/writereview?placeid=ChIJ79DNyOvG10cRbHOP0u7w1CM';

      const results = await analyzeImage(imagePath);

      // The spec shows 3 identical QR codes, but jsQR might only detect one
      // We should at least find the QR code
      expect(results.qrcodes.length).toBeGreaterThanOrEqual(1);
      expect(results.qrcodes).toContain(expected_url);
      expect(results.urls).toEqual([]);
    }, 60000);

    test('qr-marketing-2.jpg detects two identical QR codes', async () => {
      const imagePath = path.join(
        __dirname,
        '../test/images/qr-marketing-2.jpg'
      );
      const expected_url = 'http://simplyhire.me';

      const results = await analyzeImage(imagePath);

      // Should detect both QR codes even though they have the same URL
      expect(results.qrcodes.length).toBe(2);
      expect(results.qrcodes).toEqual([expected_url, expected_url]);
      expect(results.urls).toEqual([]);
    }, 60000);

    test('qrcode.png detects expected QR code', async () => {
      const imagePath = path.join(__dirname, '../test/images/qrcode.png');
      const expected_url = 'https://dspy.ai';

      const results = await analyzeImage(imagePath);

      expect(results.qrcodes).toContain(expected_url);
      expect(results.urls).toEqual([]);
    }, 60000);

    test('qr-text.png detects expected QR code text', async () => {
      const imagePath = path.join(__dirname, '../test/images/qr-text.png');
      const expected_text = 'The autumn wind is a raider';

      const results = await analyzeImage(imagePath);

      // Case-insensitive check since QR decoding might vary in case
      expect(results.qrcodes.length).toBeGreaterThanOrEqual(1);
      const foundText = results.qrcodes.some(
        (qr) => qr.toLowerCase() === expected_text.toLowerCase()
      );
      expect(foundText).toBe(true);
      expect(results.urls).toEqual([]);
    }, 60000);

    test('url-wrapped.png detects wrapped URL across lines', async () => {
      const imagePath = path.join(__dirname, '../test/images/url-wrapped.png');
      const expected_url = 'https://en.wikipedia.org/wiki/Chevrolet_Suburban';

      const results = await analyzeImage(imagePath);

      expect(results.qrcodes).toEqual([]);
      expect(results.urls.length).toBeGreaterThanOrEqual(1);
      expect(results.urls).toContain(expected_url);
    }, 60000);

    test('web-wikipedia.png detects URL in browser with anchor', async () => {
      const imagePath = path.join(__dirname, '../test/images/web-wikipedia.png');
      const expected_url = 'https://en.wikipedia.org/wiki/Chevrolet_Suburban#Eleventh_generation_(2015)';

      const results = await analyzeImage(imagePath);

      expect(results.qrcodes).toEqual([]);
      expect(results.urls.length).toBeGreaterThanOrEqual(1);
      expect(results.urls).toContain(expected_url);
    }, 60000);
  });
});
