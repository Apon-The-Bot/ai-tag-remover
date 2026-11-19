export type ColorGradingPresetId =
  | 'natural'
  | 'warm-portrait'
  | 'clean-professional'
  | 'soft-cinematic'
  | 'original-preservation';

export interface EnhancementParams {
  preset: ColorGradingPresetId;
  naturalStrength: number; // 0 to 100, default 25
  portraitMode: boolean;
  exposure: number; // -100 to +100
  contrast: number; // -100 to +100
  highlights: number; // -100 to +100
  shadows: number; // -100 to +100
  saturation: number; // -100 to +100
  vibrance: number; // -100 to +100
  sharpness: number; // 0 to 100
  noiseReduction: number; // 0 to 100
  warmth: number; // -100 to +100
  deblockJpeg: boolean;
  upscaleMode: 'none' | 'lanczos-2x';
}

export interface PresetDefinition {
  id: ColorGradingPresetId;
  name: string;
  tagline: string;
  description: string;
  characteristics: string[];
  offsets: {
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    saturation: number;
    vibrance: number;
    sharpness: number;
    noiseReduction: number;
    warmth: number;
    greenControl: number; // 0..1 controls foliage chroma
    highlightRolloff: number; // 0..1 filmic shoulder
  };
}

export const COLOR_GRADING_PRESETS: Record<ColorGradingPresetId, PresetDefinition> = {
  'natural': {
    id: 'natural',
    name: 'Natural',
    tagline: 'Neutral white balance · realistic skin · mild contrast',
    description: 'Balanced optical baseline with neutral white balance, accurate skin luminance, and subtle micro-contrast.',
    characteristics: ['Neutral white balance', 'Realistic skin tones', 'Mild contrast', 'Subtle color improvement'],
    offsets: {
      exposure: 4,
      contrast: 8,
      highlights: -8,
      shadows: 10,
      saturation: 2,
      vibrance: 10,
      sharpness: 18,
      noiseReduction: 12,
      warmth: 0,
      greenControl: 0.1,
      highlightRolloff: 0.15,
    },
  },
  'warm-portrait': {
    id: 'warm-portrait',
    name: 'Warm Portrait',
    tagline: 'Golden highlights · protected complexion · controlled greens',
    description: 'Gently warms skin highlights and softens background foliage chroma while keeping pores and hair detail intact.',
    characteristics: ['Slightly warm highlights', 'Natural skin tones', 'Controlled green tones', 'Soft cinematic contrast'],
    offsets: {
      exposure: 5,
      contrast: 6,
      highlights: -12,
      shadows: 14,
      saturation: 0,
      vibrance: 12,
      sharpness: 16,
      noiseReduction: 15,
      warmth: 16,
      greenControl: 0.35,
      highlightRolloff: 0.25,
    },
  },
  'clean-professional': {
    id: 'clean-professional',
    name: 'Clean Professional',
    tagline: 'Accurate whites · moderate clarity · restrained saturation',
    description: 'Studio-calibrated neutrality designed for editorial headshots, architecture, and commercial documentation.',
    characteristics: ['Neutral colors', 'Moderate clarity', 'Accurate whites', 'Restrained saturation'],
    offsets: {
      exposure: 3,
      contrast: 12,
      highlights: -10,
      shadows: 8,
      saturation: -4,
      vibrance: 8,
      sharpness: 24,
      noiseReduction: 14,
      warmth: -2,
      greenControl: 0.15,
      highlightRolloff: 0.12,
    },
  },
  'soft-cinematic': {
    id: 'soft-cinematic',
    name: 'Soft Cinematic',
    tagline: 'Gentle highlight rolloff · deeper shadows · filmic curve',
    description: 'Emulates medium-format color negative latitude with smooth highlight shoulder and rich shadow anchor.',
    characteristics: ['Gentle highlight rolloff', 'Slightly deeper shadows', 'Subtle film-like contrast', 'Natural colors'],
    offsets: {
      exposure: 2,
      contrast: 10,
      highlights: -22,
      shadows: -6,
      saturation: -6,
      vibrance: 8,
      sharpness: 14,
      noiseReduction: 16,
      warmth: 6,
      greenControl: 0.25,
      highlightRolloff: 0.4,
    },
  },
  'original-preservation': {
    id: 'original-preservation',
    name: 'Original-Preservation',
    tagline: 'Minimum intervention · strictly technical correction',
    description: 'Applies only subtle sensor noise suppression and micro-clipping recovery to honor the exact captured look.',
    characteristics: ['Minimum processing', 'Only technical correction', 'Preserves original appearance'],
    offsets: {
      exposure: 0,
      contrast: 2,
      highlights: -4,
      shadows: 4,
      saturation: 0,
      vibrance: 2,
      sharpness: 8,
      noiseReduction: 8,
      warmth: 0,
      greenControl: 0,
      highlightRolloff: 0.05,
    },
  },
};

export const DEFAULT_ENHANCEMENT_PARAMS: EnhancementParams = {
  preset: 'natural',
  naturalStrength: 25,
  portraitMode: true,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  sharpness: 15,
  noiseReduction: 10,
  warmth: 0,
  deblockJpeg: true,
  upscaleMode: 'none',
};

export interface ImageAnalysisReport {
  meanLuminance: number; // 0..255
  dynamicRangeStops: number; // e.g. 6.4 to 11.8
  shadowClippingPct: number; // 0..100
  highlightClippingPct: number; // 0..100
  estimatedColorTempK: number; // e.g. 4800..6500
  colorCastNote: string;
  noiseEstimate: number; // 0..100
  sharpnessScore: number; // 0..100
  skinToneCoveragePct: number; // 0..100
  histogram: {
    r: number[];
    g: number[];
    b: number[];
    luma: number[];
  };
  autoRecommendations: string[];
}

export interface FileSignatureValidationResult {
  valid: boolean;
  detectedFormat: 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown';
  mimeType: string;
  error?: string;
}

/**
 * Validates file magic bytes (signatures) to prevent MIME spoofing or corrupted uploads.
 */
export function validateFileSignature(
  bytes: Uint8Array,
  declaredMime?: string
): FileSignatureValidationResult {
  if (!bytes || bytes.length < 12) {
    return {
      valid: false,
      detectedFormat: 'unknown',
      mimeType: 'application/octet-stream',
      error: 'Corrupted or truncated image file (fewer than 12 bytes).',
    };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return {
      valid: true,
      detectedFormat: 'jpeg',
      mimeType: 'image/jpeg',
    };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      valid: true,
      detectedFormat: 'png',
      mimeType: 'image/png',
    };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return {
      valid: true,
      detectedFormat: 'webp',
      mimeType: 'image/webp',
    };
  }

  // HEIC / HEIF ISO Base Media File Format: bytes 4..7 == 'ftyp', bytes 8..11 in ['heic','heix','mif1','msf1']
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'msf1' || brand === 'hevc') {
      return {
        valid: true,
        detectedFormat: 'heic',
        mimeType: 'image/heic',
      };
    }
  }

  return {
    valid: false,
    detectedFormat: 'unknown',
    mimeType: declaredMime || 'application/octet-stream',
    error: 'Unsupported image format or invalid magic-byte signature. Supported formats: JPG, PNG, WEBP, HEIC.',
  };
}

/**
 * Validates file size against configurable maximum MB (up to 25 MB).
 */
export function validateFileSize(
  byteLength: number,
  maxSizeMb = 25
): { valid: boolean; error?: string } {
  const clampedMaxMb = Math.min(Math.max(1, maxSizeMb), 25);
  const maxBytes = clampedMaxMb * 1024 * 1024;
  if (byteLength <= 0) {
    return { valid: false, error: 'File is empty (0 bytes).' };
  }
  if (byteLength > maxBytes) {
    const actualMb = (byteLength / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${actualMb} MB) exceeds the configured maximum limit of ${clampedMaxMb} MB.`,
    };
  }
  return { valid: true };
}

/**
 * Sanitizes uploaded filenames to prevent path traversal, null-byte injection, and unsafe characters.
 */
export function sanitizeFilename(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'photo_upload.jpg';
  }
  // Strip any directory paths (Unix or Windows)
  const base = rawName.replace(/^.*[\\/]/, '');
  // Remove null bytes, control chars, and '..' sequences
  const cleaned = base
    .replace(/\0/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 120);

  if (!cleaned || cleaned === '.' || cleaned === '_') {
    return 'photo_upload.jpg';
  }
  return cleaned;
}

/**
 * Parses JPEG EXIF orientation tag (1..8) if present, defaulting to 1 (normal).
 */
export function parseExifOrientation(bytes: Uint8Array): number {
  if (!bytes || bytes.length < 14 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return 1;
  }
  let offset = 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset + 4 < bytes.length) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) break;

    // APP1 marker (0xFFE1) with "Exif\0\0"
    if (marker === 0xe1 && length >= 14 && offset + 10 < bytes.length) {
      const isExif =
        view.getUint8(offset + 4) === 0x45 && // E
        view.getUint8(offset + 5) === 0x78 && // x
        view.getUint8(offset + 6) === 0x69 && // i
        view.getUint8(offset + 7) === 0x66 && // f
        view.getUint8(offset + 8) === 0x00 &&
        view.getUint8(offset + 9) === 0x00;

      if (isExif) {
        const tiffStart = offset + 10;
        if (tiffStart + 8 > bytes.length) return 1;
        const endian = view.getUint16(tiffStart, false);
        const littleEndian = endian === 0x4949;
        if (!littleEndian && endian !== 0x4d4d) return 1;

        const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
        const ifdStart = tiffStart + firstIfdOffset;
        if (ifdStart + 2 > bytes.length) return 1;

        const entries = view.getUint16(ifdStart, littleEndian);
        for (let i = 0; i < entries; i++) {
          const entryOffset = ifdStart + 2 + i * 12;
          if (entryOffset + 12 > bytes.length) break;
          const tag = view.getUint16(entryOffset, littleEndian);
          if (tag === 0x0112) {
            const val = view.getUint16(entryOffset + 8, littleEndian);
            return val >= 1 && val <= 8 ? val : 1;
          }
        }
      }
    }
    offset += 2 + length;
  }
  return 1;
}

function clampByte(val: number): number {
  return val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

/**
 * Checks whether an RGB pixel sits inside the natural human skin-tone chromaticity locus,
 * returning a continuous weight [0..1] for skin-tone preservation.
 */
export function computeSkinToneWeight(r: number, g: number, b: number): number {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  if (maxC < 28 || r <= g || g <= b * 0.85) return 0;

  // Normalized Cr / Cb approximation
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  // Center of natural skin locus across diverse complexions: Cb ~ [80..127], Cr ~ [133..175]
  if (cb < 75 || cb > 132 || cr < 130 || cr > 180 || y < 25 || y > 245) {
    return 0;
  }

  const cbDist = Math.abs(cb - 105) / 28;
  const crDist = Math.abs(cr - 152) / 26;
  const dist = Math.sqrt(cbDist * cbDist + crDist * crDist);
  return clamp(1 - dist * 0.85, 0, 1);
}

/**
 * Analyzes an RGBA buffer to compute histogram, exposure metrics, white-balance cast, and conservative recommendations.
 */
export function analyzeImageBuffer(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): ImageAnalysisReport {
  const histR = new Array<number>(64).fill(0);
  const histG = new Array<number>(64).fill(0);
  const histB = new Array<number>(64).fill(0);
  const histLuma = new Array<number>(64).fill(0);

  const totalPixels = Math.max(1, width * height);
  const step = totalPixels > 250000 ? Math.floor(totalPixels / 120000) : 1;

  let sampledCount = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  let shadowClip = 0;
  let highlightClip = 0;
  let skinPixels = 0;

  for (let i = 0; i < rgba.length; i += 4 * step) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

    sumR += r;
    sumG += g;
    sumB += b;
    sumLuma += luma;
    sampledCount++;

    if (luma <= 6) shadowClip++;
    if (luma >= 249) highlightClip++;
    if (computeSkinToneWeight(r, g, b) > 0.35) skinPixels++;

    histR[Math.min(63, r >> 2)]++;
    histG[Math.min(63, g >> 2)]++;
    histB[Math.min(63, b >> 2)]++;
    histLuma[Math.min(63, luma >> 2)]++;
  }

  const count = Math.max(1, sampledCount);
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const meanLuminance = Number((sumLuma / count).toFixed(1));

  // Compute P2 and P98 luminance from histLuma to estimate dynamic range in stops
  let acc = 0;
  let p2Bin = 1;
  let p98Bin = 62;
  for (let b = 0; b < 64; b++) {
    acc += histLuma[b];
    if (acc / count <= 0.02) p2Bin = b + 1;
    if (acc / count <= 0.98) p98Bin = b + 1;
  }
  const ratio = Math.max(2, (p98Bin * 4) / Math.max(4, p2Bin * 4));
  const dynamicRangeStops = Number(clamp(Math.log2(ratio) + 4.2, 4.5, 12.4).toFixed(1));

  const shadowClippingPct = Number(((shadowClip / count) * 100).toFixed(2));
  const highlightClippingPct = Number(((highlightClip / count) * 100).toFixed(2));
  const skinToneCoveragePct = Number(((skinPixels / count) * 100).toFixed(1));

  // Estimate color temperature from R/B ratio
  const rbRatio = (meanR + 1) / (meanB + 1);
  const estimatedColorTempK = Math.round(clamp(5500 * Math.pow(rbRatio, 0.45), 3400, 8200));

  let colorCastNote = 'Neutral daylight balance';
  if (rbRatio > 1.18) colorCastNote = 'Warm tungsten / golden-hour bias';
  else if (rbRatio < 0.88) colorCastNote = 'Cool shade / overcast bias';

  // Estimate sharpness and flat-region noise on a small central grid
  let edgeEnergy = 0;
  let flatNoiseEnergy = 0;
  let edgeSamples = 0;
  const rowStride = width * 4;
  const sampleStrideY = Math.max(1, Math.floor(height / 64));
  const sampleStrideX = Math.max(1, Math.floor(width / 64));

  for (let y = 1; y < height - 1; y += sampleStrideY) {
    for (let x = 1; x < width - 1; x += sampleStrideX) {
      const idx = y * rowStride + x * 4;
      const c = rgba[idx] * 0.3 + rgba[idx + 1] * 0.59 + rgba[idx + 2] * 0.11;
      const rRight = rgba[idx + 4] * 0.3 + rgba[idx + 5] * 0.59 + rgba[idx + 6] * 0.11;
      const rDown =
        rgba[idx + rowStride] * 0.3 +
        rgba[idx + rowStride + 1] * 0.59 +
        rgba[idx + rowStride + 2] * 0.11;
      const grad = Math.abs(c - rRight) + Math.abs(c - rDown);
      edgeEnergy += grad;
      if (grad < 14) {
        flatNoiseEnergy += grad;
      }
      edgeSamples++;
    }
  }

  const avgGrad = edgeSamples > 0 ? edgeEnergy / edgeSamples : 12;
  const sharpnessScore = Math.round(clamp(avgGrad * 2.6, 18, 96));
  const noiseEstimate = Math.round(
    clamp((edgeSamples > 0 ? flatNoiseEnergy / edgeSamples : 3) * 4.5, 4, 65)
  );

  const autoRecommendations: string[] = [];
  if (meanLuminance < 102) {
    autoRecommendations.push('Subtle exposure lift (+0.25 EV) & shadow recovery');
  } else if (meanLuminance > 158) {
    autoRecommendations.push('Highlight roll-off recovery to preserve bright detail');
  } else {
    autoRecommendations.push('Balanced midtone exposure preservation');
  }

  if (skinToneCoveragePct >= 8) {
    autoRecommendations.push('Natural Portrait skin-locus protection active (pores & complexion preserved)');
  }
  if (rbRatio > 1.18 || rbRatio < 0.88) {
    autoRecommendations.push('Gentle white-balance neutralization while keeping ambient mood');
  }
  autoRecommendations.push('Luminance-only unsharp mask without halo artifacts');

  // Normalize histograms to 0..100 for UI display
  const maxBin = Math.max(...histLuma, 1);
  return {
    meanLuminance,
    dynamicRangeStops,
    shadowClippingPct,
    highlightClippingPct,
    estimatedColorTempK,
    colorCastNote,
    noiseEstimate,
    sharpnessScore,
    skinToneCoveragePct,
    histogram: {
      r: histR.map((v) => Math.round((v / maxBin) * 100)),
      g: histG.map((v) => Math.round((v / maxBin) * 100)),
      b: histB.map((v) => Math.round((v / maxBin) * 100)),
      luma: histLuma.map((v) => Math.round((v / maxBin) * 100)),
    },
    autoRecommendations,
  };
}

/**
 * Core conservative photographic enhancement pipeline.
 * Operates on an RGBA pixel buffer and returns a newly allocated processed Uint8ClampedArray
 * plus a human-readable list of applied photographic corrections.
 */
export function processImagePixels(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: EnhancementParams,
  onProgress?: (fraction: number) => void
): {
  pixels: Uint8ClampedArray;
  appliedCorrections: string[];
} {
  const preset = COLOR_GRADING_PRESETS[params.preset] || COLOR_GRADING_PRESETS['natural'];
  const strength = clamp(params.naturalStrength, 0, 100) / 100; // 0..1, where 0.25 is default subtle preset weight

  // Combine preset baseline scaled by naturalStrength with explicit manual slider adjustments
  const effExposure = (preset.offsets.exposure * strength * 1.4 + params.exposure) / 100; // -1.2 to +1.2
  const effContrast = (preset.offsets.contrast * strength * 1.4 + params.contrast) / 100;
  const effHighlights = (preset.offsets.highlights * strength * 1.4 + params.highlights) / 100;
  const effShadows = (preset.offsets.shadows * strength * 1.4 + params.shadows) / 100;
  const effSaturation = (preset.offsets.saturation * strength * 1.4 + params.saturation) / 100;
  const effVibrance = (preset.offsets.vibrance * strength * 1.4 + params.vibrance) / 100;
  const effWarmth = (preset.offsets.warmth * strength * 1.4 + params.warmth) / 100;
  const effSharpness = clamp(
    preset.offsets.sharpness * strength + params.sharpness * (0.4 + 0.6 * strength),
    0,
    100
  );
  const effNoiseReduction = clamp(
    preset.offsets.noiseReduction * strength + params.noiseReduction * (0.4 + 0.6 * strength),
    0,
    100
  );

  const out = new Uint8ClampedArray(sourceRgba.length);
  const totalBytes = sourceRgba.length;

  // Compute subtle auto white-balance channel gains so color casts are gently corrected
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const sampleStep = Math.max(4, Math.floor(totalBytes / (4 * 8000)) * 4);
  let samples = 0;
  for (let i = 0; i < totalBytes; i += sampleStep) {
    sumR += sourceRgba[i];
    sumG += sourceRgba[i + 1];
    sumB += sourceRgba[i + 2];
    samples++;
  }
  const avgR = sumR / Math.max(1, samples);
  const avgG = sumG / Math.max(1, samples);
  const avgB = sumB / Math.max(1, samples);
  const grayAvg = (avgR + avgG + avgB) / 3;

  // Conservative von Kries white balance blend (maximum 12% neutralization scaled by strength)
  const wbFactor = 0.12 * strength;
  const wbGainR = 1 + clamp((grayAvg / Math.max(16, avgR) - 1) * wbFactor, -0.08, 0.08);
  const wbGainG = 1 + clamp((grayAvg / Math.max(16, avgG) - 1) * wbFactor, -0.05, 0.05);
  const wbGainB = 1 + clamp((grayAvg / Math.max(16, avgB) - 1) * wbFactor, -0.08, 0.08);

  // Warmth channel multipliers (warm boosts R & slightly G, cools B)
  const rGain = wbGainR * (1 + effWarmth * 0.14);
  const gGain = wbGainG * (1 + effWarmth * 0.02);
  const bGain = wbGainB * (1 - effWarmth * 0.14);

  // Exposure multiplier (conservative stops: +/- 100 slider -> +/- 0.85 EV)
  const evMult = Math.pow(2, effExposure * 0.85);
  const rolloff = preset.offsets.highlightRolloff * strength;
  const greenControl = preset.offsets.greenControl * strength;

  for (let i = 0; i < totalBytes; i += 4) {
    const origR = sourceRgba[i];
    const origG = sourceRgba[i + 1];
    const origB = sourceRgba[i + 2];
    const alpha = sourceRgba[i + 3];

    const skinWeight = params.portraitMode ? computeSkinToneWeight(origR, origG, origB) : 0;

    // 1. White balance + Warmth + Exposure in normalized [0..1] space
    let r = (origR / 255) * rGain * evMult;
    let g = (origG / 255) * gGain * evMult;
    let b = (origB / 255) * bGain * evMult;

    // 2. Luminance calculation
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // 3. Shadow & Highlight Recovery (smooth cubic masks)
    if (luma > 0.0001) {
      const shadowMask = Math.pow(1 - clamp(luma, 0, 1), 1.8);
      const highlightMask = Math.pow(clamp(luma, 0, 1), 1.8);

      // Protect portrait skin highlights from harsh clipping
      const skinHighlightGuard = skinWeight * 0.06 * strength;
      const shadowDelta = effShadows * 0.24 * shadowMask * (1 - luma);
      const highlightDelta =
        (effHighlights * 0.24 - skinHighlightGuard - rolloff * 0.08) * highlightMask * luma;

      let targetLuma = clamp(luma + shadowDelta + highlightDelta, 0, 1);

      // 4. Filmic S-Curve Contrast around mid-gray (0.46)
      if (Math.abs(effContrast) > 0.001) {
        // Reduce contrast aggressiveness on skin tones in portrait mode
        const localContrast = effContrast * (1 - skinWeight * 0.35);
        const centered = targetLuma - 0.46;
        const curved = centered * (1 + localContrast * 0.55 * (1 - Math.abs(centered)));
        targetLuma = clamp(0.46 + curved, 0, 1);
      }

      const lumaScale = targetLuma / luma;
      r *= lumaScale;
      g *= lumaScale;
      b *= lumaScale;
      luma = targetLuma;
    }

    // 5. Controlled Green Foliage Tones (for Warm Portrait / Cinematic presets)
    if (greenControl > 0.01 && g > r * 1.05 && g > b * 1.05) {
      const greenDominance = clamp((g - Math.max(r, b)) * 2, 0, 1);
      const gPull = greenDominance * greenControl * 0.18;
      g -= gPull * (g - luma);
    }

    // 6. Vibrance & Saturation with Portrait Skin-Tone Protection
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const currentSat = maxCh - minCh;

    // Vibrance boosts less-saturated colors more, and respects skin tones so complexions never turn orange
    const skinSatProtection = 1 - skinWeight * 0.55;
    const vibranceBoost = effVibrance * 0.42 * (1 - currentSat) * skinSatProtection;
    const satMult = clamp(1 + effSaturation * 0.45 * skinSatProtection + vibranceBoost, 0.15, 1.85);

    r = luma + (r - luma) * satMult;
    g = luma + (g - luma) * satMult;
    b = luma + (b - luma) * satMult;

    out[i] = clampByte(r * 255);
    out[i + 1] = clampByte(g * 255);
    out[i + 2] = clampByte(b * 255);
    out[i + 3] = alpha;

    if (onProgress && (i & 0x3ffff) === 0) {
      onProgress((i / totalBytes) * 0.65);
    }
  }

  if (onProgress) {
    onProgress(0.65);
  }

  // 7. Optional Mild Edge-Preserving Noise Reduction + Luminance-Only Controlled Sharpening
  // Only run spatial kernel pass if sharpness > 2 or noiseReduction > 2 and dimensions >= 3x3
  if ((effSharpness > 2 || effNoiseReduction > 2) && width >= 3 && height >= 3) {
    const temp = new Uint8ClampedArray(out);
    const rowStride = width * 4;
    const sharpAmount = (effSharpness / 100) * 0.55; // Conservative max 0.55 to prevent halos/ringing
    const nrAmount = (effNoiseReduction / 100) * 0.45; // Conservative max 0.45 to prevent plastic skin

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * rowStride;
      for (let x = 1; x < width - 1; x++) {
        const idx = rowOffset + x * 4;
        const cr = temp[idx];
        const cg = temp[idx + 1];
        const cb = temp[idx + 2];

        // 4-neighbor average
        const idxUp = idx - rowStride;
        const idxDown = idx + rowStride;
        const idxLeft = idx - 4;
        const idxRight = idx + 4;

        const avgR = (temp[idxUp] + temp[idxDown] + temp[idxLeft] + temp[idxRight]) * 0.25;
        const avgG =
          (temp[idxUp + 1] + temp[idxDown + 1] + temp[idxLeft + 1] + temp[idxRight + 1]) * 0.25;
        const avgB =
          (temp[idxUp + 2] + temp[idxDown + 2] + temp[idxLeft + 2] + temp[idxRight + 2]) * 0.25;

        const diffR = cr - avgR;
        const diffG = cg - avgG;
        const diffB = cb - avgB;
        const lumaDiff = 0.2126 * diffR + 0.7152 * diffG + 0.0722 * diffB;
        const absDiff = Math.abs(lumaDiff);

        // In Portrait Mode, preserve natural pores by attenuating noise blur and harsh sharpening on skin
        const skinW = params.portraitMode ? computeSkinToneWeight(cr, cg, cb) : 0;

        if (absDiff < 9 && nrAmount > 0.01) {
          // Flat/micro-grain zone: apply mild bilateral smoothing (reduced on skin pores so texture remains real)
          const localNr = nrAmount * (1 - skinW * 0.45) * (1 - absDiff / 9);
          out[idx] = clampByte(cr - diffR * localNr);
          out[idx + 1] = clampByte(cg - diffG * localNr);
          out[idx + 2] = clampByte(cb - diffB * localNr);
        } else if (absDiff >= 3 && absDiff <= 48 && sharpAmount > 0.01) {
          // True detail edge (not flat noise, not high-contrast boundary that causes halos)
          const haloGuard = 1 - Math.max(0, (absDiff - 28) / 24);
          const localSharp = sharpAmount * haloGuard * (1 - skinW * 0.25);
          const delta = lumaDiff * localSharp;
          out[idx] = clampByte(cr + delta);
          out[idx + 1] = clampByte(cg + delta);
          out[idx + 2] = clampByte(cb + delta);
        }
      }
      if (onProgress && (y & 31) === 0) {
        onProgress(0.65 + (y / height) * 0.35);
      }
    }
  }

  if (onProgress) {
    onProgress(1);
  }

  const appliedCorrections: string[] = [
    `Color Grading Preset: ${preset.name} (Natural Strength ${Math.round(params.naturalStrength)}%)`,
    'Conservative white-balance normalization & exposure latitude calibration',
    'Soft-knee highlight & shadow recovery without HDR haloing',
  ];
  if (params.portraitMode) {
    appliedCorrections.push(
      'Natural Portrait Protection: preserved skin pore texture, complexion chroma, and specular highlight rolloff'
    );
  }
  if (effSharpness > 2) {
    appliedCorrections.push(
      `Halo-suppressed luminance sharpening (${Math.round(effSharpness)}% intensity)`
    );
  }
  if (effNoiseReduction > 2) {
    appliedCorrections.push(
      `Edge-preserving micro-grain reduction (${Math.round(effNoiseReduction)}% intensity)`
    );
  }

  return {
    pixels: out,
    appliedCorrections,
  };
}

export interface AsyncPixelProgress {
  fraction: number;
  rowsProcessed: number;
  totalRows: number;
}

/**
 * Non-blocking chunked photographic enhancement pipeline that yields between row batches
 * so SSE / status listeners receive real-time scanline progress updates.
 */
export async function processImagePixelsAsync(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  params: EnhancementParams,
  onProgress?: (info: AsyncPixelProgress) => void
): Promise<{
  pixels: Uint8ClampedArray;
  appliedCorrections: string[];
}> {
  const preset = COLOR_GRADING_PRESETS[params.preset] || COLOR_GRADING_PRESETS['natural'];
  const strength = clamp(params.naturalStrength, 0, 100) / 100;

  const effExposure = (preset.offsets.exposure * strength * 1.4 + params.exposure) / 100;
  const effContrast = (preset.offsets.contrast * strength * 1.4 + params.contrast) / 100;
  const effHighlights = (preset.offsets.highlights * strength * 1.4 + params.highlights) / 100;
  const effShadows = (preset.offsets.shadows * strength * 1.4 + params.shadows) / 100;
  const effSaturation = (preset.offsets.saturation * strength * 1.4 + params.saturation) / 100;
  const effVibrance = (preset.offsets.vibrance * strength * 1.4 + params.vibrance) / 100;
  const effWarmth = (preset.offsets.warmth * strength * 1.4 + params.warmth) / 100;
  const effSharpness = clamp(
    preset.offsets.sharpness * strength + params.sharpness * (0.4 + 0.6 * strength),
    0,
    100
  );
  const effNoiseReduction = clamp(
    preset.offsets.noiseReduction * strength + params.noiseReduction * (0.4 + 0.6 * strength),
    0,
    100
  );

  const out = new Uint8ClampedArray(sourceRgba.length);
  const totalBytes = sourceRgba.length;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const sampleStep = Math.max(4, Math.floor(totalBytes / (4 * 8000)) * 4);
  let samples = 0;
  for (let i = 0; i < totalBytes; i += sampleStep) {
    sumR += sourceRgba[i];
    sumG += sourceRgba[i + 1];
    sumB += sourceRgba[i + 2];
    samples++;
  }
  const avgR = sumR / Math.max(1, samples);
  const avgG = sumG / Math.max(1, samples);
  const avgB = sumB / Math.max(1, samples);
  const grayAvg = (avgR + avgG + avgB) / 3;

  const wbFactor = 0.12 * strength;
  const wbGainR = 1 + clamp((grayAvg / Math.max(16, avgR) - 1) * wbFactor, -0.08, 0.08);
  const wbGainG = 1 + clamp((grayAvg / Math.max(16, avgG) - 1) * wbFactor, -0.05, 0.05);
  const wbGainB = 1 + clamp((grayAvg / Math.max(16, avgB) - 1) * wbFactor, -0.08, 0.08);

  const rGain = wbGainR * (1 + effWarmth * 0.14);
  const gGain = wbGainG * (1 + effWarmth * 0.02);
  const bGain = wbGainB * (1 - effWarmth * 0.14);

  const evMult = Math.pow(2, effExposure * 0.85);
  const rolloff = preset.offsets.highlightRolloff * strength;
  const greenControl = preset.offsets.greenControl * strength;

  const hasSpatialPass = (effSharpness > 2 || effNoiseReduction > 2) && width >= 3 && height >= 3;
  const toneWeight = hasSpatialPass ? 0.65 : 1.0;
  const chunkRows = Math.max(24, Math.ceil(height / 8));
  const rowStride = width * 4;

  const yieldTick = () => new Promise<void>((resolve) => setImmediate(resolve));

  for (let startY = 0; startY < height; startY += chunkRows) {
    const endY = Math.min(height, startY + chunkRows);
    for (let y = startY; y < endY; y++) {
      const rowOffset = y * rowStride;
      for (let x = 0; x < width; x++) {
        const i = rowOffset + x * 4;
        const origR = sourceRgba[i];
        const origG = sourceRgba[i + 1];
        const origB = sourceRgba[i + 2];
        const alpha = sourceRgba[i + 3];

        const skinWeight = params.portraitMode ? computeSkinToneWeight(origR, origG, origB) : 0;

        let r = (origR / 255) * rGain * evMult;
        let g = (origG / 255) * gGain * evMult;
        let b = (origB / 255) * bGain * evMult;

        let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        if (luma > 0.0001) {
          const shadowMask = Math.pow(1 - clamp(luma, 0, 1), 1.8);
          const highlightMask = Math.pow(clamp(luma, 0, 1), 1.8);

          const skinHighlightGuard = skinWeight * 0.06 * strength;
          const shadowDelta = effShadows * 0.24 * shadowMask * (1 - luma);
          const highlightDelta =
            (effHighlights * 0.24 - skinHighlightGuard - rolloff * 0.08) * highlightMask * luma;

          let targetLuma = clamp(luma + shadowDelta + highlightDelta, 0, 1);

          if (Math.abs(effContrast) > 0.001) {
            const localContrast = effContrast * (1 - skinWeight * 0.35);
            const centered = targetLuma - 0.46;
            const curved = centered * (1 + localContrast * 0.55 * (1 - Math.abs(centered)));
            targetLuma = clamp(0.46 + curved, 0, 1);
          }

          const lumaScale = targetLuma / luma;
          r *= lumaScale;
          g *= lumaScale;
          b *= lumaScale;
          luma = targetLuma;
        }

        if (greenControl > 0.01 && g > r * 1.05 && g > b * 1.05) {
          const greenDominance = clamp((g - Math.max(r, b)) * 2, 0, 1);
          const gPull = greenDominance * greenControl * 0.18;
          g -= gPull * (g - luma);
        }

        const maxCh = Math.max(r, g, b);
        const minCh = Math.min(r, g, b);
        const currentSat = maxCh - minCh;

        const skinSatProtection = 1 - skinWeight * 0.55;
        const vibranceBoost = effVibrance * 0.42 * (1 - currentSat) * skinSatProtection;
        const satMult = clamp(1 + effSaturation * 0.45 * skinSatProtection + vibranceBoost, 0.15, 1.85);

        r = luma + (r - luma) * satMult;
        g = luma + (g - luma) * satMult;
        b = luma + (b - luma) * satMult;

        out[i] = clampByte(r * 255);
        out[i + 1] = clampByte(g * 255);
        out[i + 2] = clampByte(b * 255);
        out[i + 3] = alpha;
      }
    }

    onProgress?.({
      fraction: (endY / height) * toneWeight,
      rowsProcessed: endY,
      totalRows: height,
    });
    await yieldTick();
  }

  if (hasSpatialPass) {
    const temp = new Uint8ClampedArray(out);
    const sharpAmount = (effSharpness / 100) * 0.55;
    const nrAmount = (effNoiseReduction / 100) * 0.45;

    for (let startY = 1; startY < height - 1; startY += chunkRows) {
      const endY = Math.min(height - 1, startY + chunkRows);
      for (let y = startY; y < endY; y++) {
        const rowOffset = y * rowStride;
        for (let x = 1; x < width - 1; x++) {
          const idx = rowOffset + x * 4;
          const cr = temp[idx];
          const cg = temp[idx + 1];
          const cb = temp[idx + 2];

          const idxUp = idx - rowStride;
          const idxDown = idx + rowStride;
          const idxLeft = idx - 4;
          const idxRight = idx + 4;

          const avgR2 = (temp[idxUp] + temp[idxDown] + temp[idxLeft] + temp[idxRight]) * 0.25;
          const avgG2 =
            (temp[idxUp + 1] + temp[idxDown + 1] + temp[idxLeft + 1] + temp[idxRight + 1]) * 0.25;
          const avgB2 =
            (temp[idxUp + 2] + temp[idxDown + 2] + temp[idxLeft + 2] + temp[idxRight + 2]) * 0.25;

          const diffR = cr - avgR2;
          const diffG = cg - avgG2;
          const diffB = cb - avgB2;
          const lumaDiff = 0.2126 * diffR + 0.7152 * diffG + 0.0722 * diffB;
          const absDiff = Math.abs(lumaDiff);

          const skinW = params.portraitMode ? computeSkinToneWeight(cr, cg, cb) : 0;

          if (absDiff < 9 && nrAmount > 0.01) {
            const localNr = nrAmount * (1 - skinW * 0.45) * (1 - absDiff / 9);
            out[idx] = clampByte(cr - diffR * localNr);
            out[idx + 1] = clampByte(cg - diffG * localNr);
            out[idx + 2] = clampByte(cb - diffB * localNr);
          } else if (absDiff >= 3 && absDiff <= 48 && sharpAmount > 0.01) {
            const haloGuard = 1 - Math.max(0, (absDiff - 28) / 24);
            const localSharp = sharpAmount * haloGuard * (1 - skinW * 0.25);
            const delta = lumaDiff * localSharp;
            out[idx] = clampByte(cr + delta);
            out[idx + 1] = clampByte(cg + delta);
            out[idx + 2] = clampByte(cb + delta);
          }
        }
      }

      onProgress?.({
        fraction: 0.65 + (endY / height) * 0.35,
        rowsProcessed: endY,
        totalRows: height,
      });
      await yieldTick();
    }
  }

  onProgress?.({
    fraction: 1,
    rowsProcessed: height,
    totalRows: height,
  });

  const appliedCorrections: string[] = [
    `Color Grading Preset: ${preset.name} (Natural Strength ${Math.round(params.naturalStrength)}%)`,
    'Conservative white-balance normalization & exposure latitude calibration',
    'Soft-knee highlight & shadow recovery without HDR haloing',
  ];
  if (params.portraitMode) {
    appliedCorrections.push(
      'Natural Portrait Protection: preserved skin pore texture, complexion chroma, and specular highlight rolloff'
    );
  }
  if (effSharpness > 2) {
    appliedCorrections.push(
      `Halo-suppressed luminance sharpening (${Math.round(effSharpness)}% intensity)`
    );
  }
  if (effNoiseReduction > 2) {
    appliedCorrections.push(
      `Edge-preserving micro-grain reduction (${Math.round(effNoiseReduction)}% intensity)`
    );
  }

  return {
    pixels: out,
    appliedCorrections,
  };
}
