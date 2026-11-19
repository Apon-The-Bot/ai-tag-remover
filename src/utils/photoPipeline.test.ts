import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFileSignature,
  validateFileSize,
  sanitizeFilename,
  parseExifOrientation,
  computeSkinToneWeight,
  analyzeImageBuffer,
  processImagePixels,
  processImagePixelsAsync,
  DEFAULT_ENHANCEMENT_PARAMS,
} from './photoPipeline.ts';

test('validateFileSignature detects valid JPEG, PNG, WEBP, and HEIC headers and rejects spoofed files', () => {
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  const jpegRes = validateFileSignature(jpegBytes, 'image/jpeg');
  assert.equal(jpegRes.valid, true);
  assert.equal(jpegRes.detectedFormat, 'jpeg');

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const pngRes = validateFileSignature(pngBytes, 'image/png');
  assert.equal(pngRes.valid, true);
  assert.equal(pngRes.detectedFormat, 'png');

  const webpBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const webpRes = validateFileSignature(webpBytes, 'image/webp');
  assert.equal(webpRes.valid, true);
  assert.equal(webpRes.detectedFormat, 'webp');

  const heicBytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
  ]);
  const heicRes = validateFileSignature(heicBytes, 'image/heic');
  assert.equal(heicRes.valid, true);
  assert.equal(heicRes.detectedFormat, 'heic');

  const fakeExeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);
  const invalidRes = validateFileSignature(fakeExeBytes, 'image/jpeg');
  assert.equal(invalidRes.valid, false);
  assert.equal(invalidRes.detectedFormat, 'unknown');
});

test('validateFileSize enforces configurable limit up to 25 MB', () => {
  assert.equal(validateFileSize(0, 25).valid, false);
  assert.equal(validateFileSize(5 * 1024 * 1024, 25).valid, true);
  assert.equal(validateFileSize(26 * 1024 * 1024, 25).valid, false);
  assert.equal(validateFileSize(12 * 1024 * 1024, 10).valid, false);
});

test('sanitizeFilename strips path traversal and unsafe characters', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('C:\\Users\\Admin\\portrait..jpg'), 'portrait.jpg');
  assert.equal(sanitizeFilename('my photo (final)!.png'), 'my_photo_final_.png');
});

test('parseExifOrientation defaults to 1 and extracts valid JPEG EXIF orientation tag', () => {
  const nonJpeg = new Uint8Array(20);
  assert.equal(parseExifOrientation(nonJpeg), 1);

  // Construct minimal JPEG with APP1 Exif big-endian orientation = 6 (Rotate 90 CW)
  const exifJpeg = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1
    0x00, 0x22, // Length = 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, // Big-endian TIFF header
    0x00, 0x00, 0x00, 0x08, // First IFD offset = 8
    0x00, 0x01, // 1 entry
    0x01, 0x12, // Tag 0x0112 (Orientation)
    0x00, 0x03, // Type SHORT
    0x00, 0x00, 0x00, 0x01, // Count 1
    0x00, 0x06, 0x00, 0x00, // Value = 6
    0x00, 0x00, 0x00, 0x00,
  ]);
  assert.equal(parseExifOrientation(exifJpeg), 6);
});

test('computeSkinToneWeight identifies natural skin tones and excludes sky/foliage', () => {
  const warmSkin = computeSkinToneWeight(210, 162, 134);
  const deepSkin = computeSkinToneWeight(135, 92, 70);
  const blueSky = computeSkinToneWeight(70, 140, 230);
  const greenLeaf = computeSkinToneWeight(60, 160, 75);

  assert.ok(warmSkin > 0.5, `Expected warm skin weight > 0.5, got ${warmSkin}`);
  assert.ok(deepSkin > 0.4, `Expected deep skin weight > 0.4, got ${deepSkin}`);
  assert.equal(blueSky, 0);
  assert.equal(greenLeaf, 0);
});

test('analyzeImageBuffer and processImagePixels preserve dimensions and apply conservative adjustments', () => {
  const width = 8;
  const height = 8;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < source.length; i += 4) {
    source[i] = 180; // R
    source[i + 1] = 140; // G
    source[i + 2] = 115; // B
    source[i + 3] = 255; // A
  }

  const analysis = analyzeImageBuffer(source, width, height);
  assert.ok(analysis.meanLuminance > 100 && analysis.meanLuminance < 180);
  assert.equal(analysis.histogram.luma.length, 64);

  // Test zero intervention with Original-Preservation + 0 strength + 0 sliders
  const zeroResult = processImagePixels(source, width, height, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    preset: 'original-preservation',
    naturalStrength: 0,
    sharpness: 0,
    noiseReduction: 0,
  });
  assert.equal(zeroResult.pixels.length, source.length);
  assert.ok(Math.abs(zeroResult.pixels[0] - source[0]) <= 1);

  // Test positive exposure lift increases pixel luminance conservatively and fires onProgress
  const progressSteps: number[] = [];
  const liftedResult = processImagePixels(
    source,
    width,
    height,
    {
      ...DEFAULT_ENHANCEMENT_PARAMS,
      exposure: 35,
    },
    (fraction) => {
      progressSteps.push(fraction);
    }
  );
  assert.ok(liftedResult.pixels[0] > source[0]);
  assert.ok(liftedResult.appliedCorrections.length >= 3);
  assert.ok(progressSteps.length >= 2);
  assert.equal(progressSteps[progressSteps.length - 1], 1);
});

test('processImagePixelsAsync yields real row progress updates and matches synchronous output', async () => {
  const width = 16;
  const height = 40;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < source.length; i += 4) {
    source[i] = 175;
    source[i + 1] = 138;
    source[i + 2] = 112;
    source[i + 3] = 255;
  }

  const events: Array<{ fraction: number; rowsProcessed: number; totalRows: number }> = [];
  const asyncResult = await processImagePixelsAsync(
    source,
    width,
    height,
    { ...DEFAULT_ENHANCEMENT_PARAMS, exposure: 20 },
    (info) => events.push(info)
  );
  const syncResult = processImagePixels(source, width, height, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    exposure: 20,
  });

  assert.equal(asyncResult.pixels.length, syncResult.pixels.length);
  assert.equal(asyncResult.pixels[0], syncResult.pixels[0]);
  assert.ok(events.length >= 2);
  assert.equal(events[events.length - 1].rowsProcessed, height);
  assert.equal(events[events.length - 1].fraction, 1);
});
