import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import sharp, { Metadata, OutputInfo } from 'sharp';
import {
  validateFileSignature,
  validateFileSize,
  sanitizeFilename,
  parseExifOrientation,
  analyzeImageBuffer,
  processImagePixelsAsync,
  EnhancementParams,
  DEFAULT_ENHANCEMENT_PARAMS,
  ImageAnalysisReport,
} from './src/utils/photoPipeline.ts';

const PORT = 3000;
const STORAGE_ROOT = path.join(os.tmpdir(), 'natural-photo-lab-jobs');
const JOB_TTL_MS = 15 * 60 * 1000;

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true, mode: 0o700 });
}

export type JobPhase = 'Ready' | 'Validating' | 'Decoding' | 'Correcting' | 'Finalizing' | 'Completed' | 'Failed';

export interface PipelineStageStatus {
  id: string;
  phase: 'Validating' | 'Decoding' | 'Correcting' | 'Finalizing';
  order: number;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stageProgress: number; // 0..100 within this stage
  durationMs?: number;
}

export interface JobRecord {
  jobId: string;
  filename: string;
  originalFormat: string;
  mimeType: string;
  originalSizeBytes: number;
  width: number;
  height: number;
  exifOrientation: number;
  colorSpace: string;
  createdAt: number;
  expiresAt: number;
  status: 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed' | 'deleted';
  phase: JobPhase;
  progress: number;
  stage: string;
  stages: PipelineStageStatus[];
  processingTimeMs: number;
  rowsProcessed?: number;
  totalRows?: number;
  originalPath: string;
  resultPath?: string;
  resultFormat?: 'jpeg' | 'png' | 'webp';
  resultMimeType?: string;
  resultSizeBytes?: number;
  resultWidth?: number;
  resultHeight?: number;
  jpegQuality?: number;
  params: EnhancementParams;
  analysis: ImageAnalysisReport;
  error?: string;
}

const jobs = new Map<string, JobRecord>();
const sseClients = new Map<string, Set<Response>>();
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function createInitialStages(exportFormat: string): PipelineStageStatus[] {
  return [
    {
      id: 'validating',
      phase: 'Validating',
      order: 1,
      title: 'Validating · File & Native Resolution',
      status: 'pending',
      stageProgress: 0,
    },
    {
      id: 'decoding',
      phase: 'Decoding',
      order: 2,
      title: 'Decoding · Clean Container & sRGB',
      status: 'pending',
      stageProgress: 0,
    },
    {
      id: 'correcting',
      phase: 'Correcting',
      order: 3,
      title: 'Correcting · 100% Pixel & Natural Balance',
      status: 'pending',
      stageProgress: 0,
    },
    {
      id: 'finalizing',
      phase: 'Finalizing',
      order: 4,
      title: `Finalizing · Master ${exportFormat.toUpperCase()} 100%`,
      status: 'pending',
      stageProgress: 0,
    },
  ];
}

function buildStatusPayload(job: JobRecord) {
  return {
    job_id: job.jobId,
    filename: job.filename,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    stage: job.stage,
    stages: job.stages,
    processingTimeMs: job.processingTimeMs,
    rowsProcessed: job.rowsProcessed ?? 0,
    totalRows: job.totalRows ?? job.height,
    width: job.resultWidth || job.width,
    height: job.resultHeight || job.height,
    resultFormat: job.resultFormat,
    resultSizeBytes: job.resultSizeBytes,
    error: job.error,
  };
}

function broadcastJobUpdate(job: JobRecord) {
  const listeners = sseClients.get(job.jobId);
  if (!listeners || listeners.size === 0) return;
  const dataString = `data: ${JSON.stringify(buildStatusPayload(job))}\n\n`;
  for (const res of listeners) {
    try {
      res.write(dataString);
    } catch {
      listeners.delete(res);
    }
  }
}

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now >= job.expiresAt && job.status !== 'deleted') {
      const jobDir = path.join(STORAGE_ROOT, jobId);
      try {
        if (fs.existsSync(jobDir)) {
          fs.rmSync(jobDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
      job.status = 'deleted';
      job.resultPath = undefined;
      sseClients.delete(jobId);
    }
  }
}

setInterval(cleanupExpiredJobs, 30_000).unref();

function rateLimitMiddleware(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'local';
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > windowMs) {
      rateLimitMap.set(ip, { count: 1, windowStart: now });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait a moment.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }
    return next();
  };
}

async function executeEnhancementJob(
  job: JobRecord,
  params: EnhancementParams,
  exportFormat: 'jpeg' | 'png' | 'webp',
  jpegQuality: number
): Promise<void> {
  const startTime = performance.now();
  const clampedQuality = Math.min(100, Math.max(95, Math.round(jpegQuality || 100)));
  job.stages = createInitialStages(exportFormat);
  job.rowsProcessed = 0;
  job.totalRows = job.height;

  const yieldTick = () => new Promise<void>((resolve) => setImmediate(resolve));

  try {
    job.status = 'processing';

    // PHASE 1: Validating (real file read & verification)
    const s1Start = performance.now();
    job.phase = 'Validating';
    job.stages[0].status = 'running';
    job.stages[0].stageProgress = 25;
    job.progress = 8;
    job.stage = job.stages[0].title;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    broadcastJobUpdate(job);
    await yieldTick();

    if (!fs.existsSync(job.originalPath)) {
      throw new Error('Source file expired.');
    }
    const inputBuffer = await fs.promises.readFile(job.originalPath);
    job.stages[0].status = 'completed';
    job.stages[0].stageProgress = 100;
    job.stages[0].durationMs = Math.max(1, Math.round(performance.now() - s1Start));
    job.progress = 20;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    broadcastJobUpdate(job);
    await yieldTick();

    // PHASE 2: Decoding (real EXIF rotation & sRGB raw pixel decode via Sharp)
    const s2Start = performance.now();
    job.phase = 'Decoding';
    job.stages[1].status = 'running';
    job.stages[1].stageProgress = 25;
    job.progress = 26;
    job.stage = job.stages[1].title;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    broadcastJobUpdate(job);

    const { data: rawRgba, info } = await sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .toColorspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    job.totalRows = info.height;
    job.stages[1].status = 'completed';
    job.stages[1].stageProgress = 100;
    job.stages[1].durationMs = Math.max(1, Math.round(performance.now() - s2Start));
    job.progress = 42;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    broadcastJobUpdate(job);
    await yieldTick();

    // PHASE 3: Correcting (chunked non-blocking pixel pipeline with real row progress)
    const s3Start = performance.now();
    job.phase = 'Correcting';
    job.stages[2].status = 'running';
    job.stages[2].stageProgress = 5;
    job.progress = 45;
    job.stage = job.stages[2].title;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    broadcastJobUpdate(job);

    const { pixels } = await processImagePixelsAsync(
      new Uint8Array(rawRgba.buffer, rawRgba.byteOffset, rawRgba.byteLength),
      info.width,
      info.height,
      params,
      ({ fraction, rowsProcessed, totalRows }) => {
        const stPct = Math.min(99, Math.max(5, Math.round(fraction * 100)));
        const overallPct = Math.min(82, Math.round(44 + fraction * 38));
        job.rowsProcessed = rowsProcessed;
        job.totalRows = totalRows;
        job.stages[2].stageProgress = stPct;
        job.progress = overallPct;
        job.stage = `Correcting · ${rowsProcessed}/${totalRows} rows`;
        job.processingTimeMs = Math.round(performance.now() - startTime);
        broadcastJobUpdate(job);
      }
    );

    job.rowsProcessed = info.height;
    job.stages[2].status = 'completed';
    job.stages[2].stageProgress = 100;
    job.stages[2].durationMs = Math.max(1, Math.round(performance.now() - s3Start));
    job.progress = 84;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    broadcastJobUpdate(job);
    await yieldTick();

    // PHASE 4: Finalizing (real master Sharp encoding & secure write)
    const s4Start = performance.now();
    job.phase = 'Finalizing';
    job.stages[3].status = 'running';
    job.stages[3].stageProgress = 35;
    job.progress = 90;
    job.stage = job.stages[3].title;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    broadcastJobUpdate(job);

    let encoder = sharp(Buffer.from(pixels.buffer), {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    });

    let ext = 'jpg';
    let mime = 'image/jpeg';

    if (exportFormat === 'png') {
      ext = 'png';
      mime = 'image/png';
      encoder = encoder.png({ compressionLevel: 6, adaptiveFiltering: true });
    } else if (exportFormat === 'webp') {
      ext = 'webp';
      mime = 'image/webp';
      encoder = encoder.webp({ quality: 100, smartSubsample: true });
    } else {
      ext = 'jpg';
      mime = 'image/jpeg';
      encoder = encoder.jpeg({
        quality: clampedQuality,
        chromaSubsampling: '4:4:4',
        mozjpeg: true,
      });
    }

    const outBuffer = await encoder.toBuffer();
    const jobDir = path.join(STORAGE_ROOT, job.jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true, mode: 0o700 });
    }
    const resultPath = path.join(jobDir, `enhanced.${ext}`);
    await fs.promises.writeFile(resultPath, outBuffer, { mode: 0o600 });

    job.stages[3].status = 'completed';
    job.stages[3].stageProgress = 100;
    job.stages[3].durationMs = Math.max(1, Math.round(performance.now() - s4Start));

    job.resultPath = resultPath;
    job.resultFormat = exportFormat;
    job.resultMimeType = mime;
    job.resultSizeBytes = outBuffer.byteLength;
    job.resultWidth = info.width;
    job.resultHeight = info.height;
    job.jpegQuality = clampedQuality;
    job.params = params;
    job.processingTimeMs = Math.round(performance.now() - startTime);
    job.phase = 'Completed';
    job.progress = 100;
    job.stage = 'Ready';
    job.status = 'completed';
    broadcastJobUpdate(job);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing failed.';
    job.status = 'failed';
    job.phase = 'Failed';
    job.stage = 'Failed';
    job.error = message;
    for (const st of job.stages) {
      if (st.status === 'running') st.status = 'failed';
    }
    broadcastJobUpdate(job);
  }
}

async function startServer() {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(express.json({ limit: '38mb' }));

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
      return res.status(413).json({ error: 'Uploaded file exceeds server payload limit (25 MB).' });
    }
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Malformed JSON request payload.' });
    }
    return next(err);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  const resolvePublicBaseUrl = (req: Request): string => {
    const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (envUrl && !envUrl.includes('MY_APP_URL')) {
      return envUrl;
    }
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
    const host = req.get('host') || `localhost:${PORT}`;
    return `${proto}://${host}`;
  };

  app.get('/robots.txt', (req: Request, res: Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        '',
        `Sitemap: ${baseUrl}/sitemap.xml`,
        '',
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', (req: Request, res: Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const today = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
        `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        `  <url>\n` +
        `    <loc>${baseUrl}/</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>1.0</priority>\n` +
        `    <image:image>\n` +
        `      <image:loc>${baseUrl}/og-cover.png</image:loc>\n` +
        `      <image:title>Natural Photo Lab — Authentic Photo Enhancement Studio</image:title>\n` +
        `    </image:image>\n` +
        `  </url>\n` +
        `</urlset>\n`
    );
  });

  // 1. POST /api/upload
  app.post('/api/upload', rateLimitMiddleware(50, 60_000), async (req: Request, res: Response) => {
    try {
      const { filename, mimeType, dataBase64, maxSizeMb = 25 } = req.body || {};

      if (!dataBase64 || typeof dataBase64 !== 'string') {
        return res.status(400).json({ error: 'No image payload received.' });
      }

      const safeFilename = sanitizeFilename(filename || 'photo.jpg');
      const base64Clean = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
      const fileBuffer = Buffer.from(base64Clean, 'base64');

      const sizeCheck = validateFileSize(fileBuffer.byteLength, Number(maxSizeMb) || 25);
      if (!sizeCheck.valid) {
        return res.status(413).json({ error: sizeCheck.error });
      }

      const bytes = new Uint8Array(
        fileBuffer.buffer,
        fileBuffer.byteOffset,
        Math.min(fileBuffer.byteLength, 65536)
      );
      const sigCheck = validateFileSignature(bytes, mimeType);
      if (!sigCheck.valid) {
        return res.status(415).json({ error: sigCheck.error });
      }

      const exifOrientation = parseExifOrientation(bytes);

      let metadata: Metadata;
      let orientedRgba: Buffer;
      let orientedInfo: OutputInfo;

      try {
        const decoder = sharp(fileBuffer, { failOn: 'error' });
        metadata = await decoder.metadata();
        if (!metadata.width || !metadata.height) {
          throw new Error('Invalid dimensions.');
        }

        const analysisSample = await decoder
          .clone()
          .rotate()
          .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        orientedRgba = analysisSample.data;
        orientedInfo = analysisSample.info;
      } catch {
        return res.status(422).json({ error: 'Unable to decode image file.' });
      }

      const rawWidth = metadata.width || orientedInfo.width;
      const rawHeight = metadata.height || orientedInfo.height;
      const swapsAxes = exifOrientation >= 5 && exifOrientation <= 8;
      const finalWidth = swapsAxes ? rawHeight : rawWidth;
      const finalHeight = swapsAxes ? rawWidth : rawHeight;

      const analysis = analyzeImageBuffer(
        new Uint8Array(orientedRgba.buffer, orientedRgba.byteOffset, orientedRgba.byteLength),
        orientedInfo.width,
        orientedInfo.height
      );

      const jobId = `job-${crypto.randomUUID().slice(0, 12)}`;
      const jobDir = path.join(STORAGE_ROOT, jobId);
      await fs.promises.mkdir(jobDir, { recursive: true, mode: 0o700 });
      const originalPath = path.join(jobDir, `original_${safeFilename}`);
      await fs.promises.writeFile(originalPath, fileBuffer, { mode: 0o600 });

      const defaultMasterParams: EnhancementParams = {
        ...DEFAULT_ENHANCEMENT_PARAMS,
        preset: 'original-preservation',
        naturalStrength: 15,
      };

      const initialStages = createInitialStages('jpeg');

      const now = Date.now();
      const job: JobRecord = {
        jobId,
        filename: safeFilename,
        originalFormat: sigCheck.detectedFormat,
        mimeType: sigCheck.mimeType,
        originalSizeBytes: fileBuffer.byteLength,
        width: finalWidth,
        height: finalHeight,
        exifOrientation: metadata.orientation || exifOrientation,
        colorSpace: metadata.space || 'srgb',
        createdAt: now,
        expiresAt: now + JOB_TTL_MS,
        status: 'uploaded',
        phase: 'Ready',
        progress: 0,
        stage: 'Ready to start',
        stages: initialStages,
        processingTimeMs: 0,
        rowsProcessed: 0,
        totalRows: finalHeight,
        originalPath,
        params: defaultMasterParams,
        analysis,
      };

      jobs.set(jobId, job);

      return res.status(200).json({
        job_id: job.jobId,
        filename: job.filename,
        format: job.originalFormat,
        mimeType: job.mimeType,
        sizeBytes: job.originalSizeBytes,
        width: job.width,
        height: job.height,
        exifOrientation: job.exifOrientation,
        colorSpace: job.colorSpace,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        stage: job.stage,
        stages: job.stages,
        rowsProcessed: 0,
        totalRows: job.height,
        analysis: job.analysis,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload error';
      return res.status(500).json({ error: message });
    }
  });

  // 2. POST /api/process
  app.post('/api/process', rateLimitMiddleware(80, 60_000), async (req: Request, res: Response) => {
    try {
      const { job_id, params, exportFormat = 'jpeg', jpegQuality = 100 } = req.body || {};
      const job = jobs.get(job_id);
      if (!job || job.status === 'deleted') {
        return res.status(404).json({ error: 'Job not found.' });
      }

      if (job.status === 'processing') {
        return res.status(200).json(buildStatusPayload(job));
      }

      const mergedParams: EnhancementParams = {
        ...DEFAULT_ENHANCEMENT_PARAMS,
        ...(params || {}),
      };
      const validFormat =
        exportFormat === 'png' || exportFormat === 'webp' ? exportFormat : 'jpeg';

      job.status = 'processing';
      job.phase = 'Validating';
      job.progress = 8;
      job.stages = createInitialStages(validFormat);
      job.stages[0].status = 'running';
      job.stages[0].stageProgress = 20;
      job.stage = job.stages[0].title;

      setImmediate(() => {
        void executeEnhancementJob(job, mergedParams, validFormat, Number(jpegQuality) || 100);
      });

      return res.status(200).json(buildStatusPayload(job));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      return res.status(500).json({ error: message });
    }
  });

  // 3. GET /api/progress/:job_id (Real-Time Server-Sent Events Stream)
  app.get('/api/progress/:job_id', (req: Request, res: Response) => {
    const job = jobs.get(req.params.job_id);
    if (!job || job.status === 'deleted') {
      return res.status(404).json({ error: 'Job not found.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let listeners = sseClients.get(job.jobId);
    if (!listeners) {
      listeners = new Set();
      sseClients.set(job.jobId, listeners);
    }
    listeners.add(res);

    // Immediately emit current state
    res.write(`data: ${JSON.stringify(buildStatusPayload(job))}\n\n`);

    req.on('close', () => {
      listeners?.delete(res);
    });
  });

  // 4. GET /api/status/:job_id
  app.get('/api/status/:job_id', (req: Request, res: Response) => {
    const job = jobs.get(req.params.job_id);
    if (!job || job.status === 'deleted') {
      return res.status(404).json({ error: 'Job not found.' });
    }
    return res.status(200).json(buildStatusPayload(job));
  });

  // 5. GET /api/result/:job_id
  app.get('/api/result/:job_id', async (req: Request, res: Response) => {
    const job = jobs.get(req.params.job_id);
    if (!job || job.status === 'deleted') {
      return res.status(404).json({ error: 'Job expired.' });
    }

    const wantsOriginal = req.query.source === 'original';
    const targetPath = wantsOriginal ? job.originalPath : (job.resultPath || job.originalPath);
    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'File missing.' });
    }

    const ext = wantsOriginal
      ? job.originalFormat === 'png'
        ? 'png'
        : job.originalFormat === 'webp'
        ? 'webp'
        : 'jpg'
      : job.resultFormat === 'png'
      ? 'png'
      : job.resultFormat === 'webp'
      ? 'webp'
      : 'jpg';
    const mime = wantsOriginal ? job.mimeType || 'image/jpeg' : job.resultMimeType || 'image/jpeg';
    const baseName = job.filename.replace(/\.[^.]+$/, '');
    const downloadName = `${baseName}_clean.${ext}`;

    const fileBytes = await fs.promises.readFile(targetPath);
    const isInline = req.query.inline === '1';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(fileBytes.byteLength));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader(
      'Content-Disposition',
      isInline ? 'inline' : `attachment; filename="${downloadName}"`
    );
    return res.status(200).send(fileBytes);
  });

  // 6. DELETE /api/job/:job_id
  app.delete('/api/job/:job_id', async (req: Request, res: Response) => {
    const job = jobs.get(req.params.job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    const jobDir = path.join(STORAGE_ROOT, job.jobId);
    try {
      if (fs.existsSync(jobDir)) {
        await fs.promises.rm(jobDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
    job.status = 'deleted';
    sseClients.delete(job.jobId);
    return res.status(200).json({ job_id: job.jobId, status: 'deleted' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Natural Photo Lab server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
