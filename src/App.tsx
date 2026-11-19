/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Github, Linkedin, Facebook, Mail, Globe } from 'lucide-react';
import { UploadHomepage } from './components/UploadHomepage';
import { DarkroomEditor, ActivePhotoSession, JobPhase } from './components/DarkroomEditor';
import { NaturalPhotoLogo } from './components/BrandMark';
import {
  BatchQueueItem,
  BatchEnhancementMode,
  BatchExportFormat,
  BATCH_QUEUE_STORAGE_KEY,
  validateQueuedFile,
  serializeQueueForStorage,
  deserializeQueueFromStorage,
  shouldOpenSingleEditorAfterUpload,
} from './utils/batchQueue';
import { DEFAULT_ENHANCEMENT_PARAMS, ImageAnalysisReport } from './utils/photoPipeline';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function createCompactThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 96;
      const scale = Math.min(size / img.width, size / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

function uploadPayloadXhr(
  filename: string,
  mimeType: string,
  dataUrl: string,
  onProgress: (pct: number) => void
): Promise<Record<string, unknown>> {
  const payload = JSON.stringify({
    filename,
    mimeType,
    dataBase64: dataUrl,
    maxSizeMb: 25,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `Upload failed (${xhr.status}).`));
        }
      } catch {
        reject(new Error(`Server unavailable or returned status ${xhr.status}.`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading photo.'));
    xhr.send(payload);
  });
}

export default function App() {
  const [batchItems, setBatchItems] = useState<BatchQueueItem[]>(() => {
    try {
      return deserializeQueueFromStorage(localStorage.getItem(BATCH_QUEUE_STORAGE_KEY));
    } catch {
      return [];
    }
  });
  const [batchMode, setBatchMode] = useState<BatchEnhancementMode>('original');
  const [batchFormat, setBatchFormat] = useState<BatchExportFormat>('jpeg');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const originalDataUrlsRef = useRef<Map<string, string>>(new Map());
  const batchItemsRef = useRef<BatchQueueItem[]>([]);
  batchItemsRef.current = batchItems;

  const isBatchRunningRef = useRef<boolean>(false);

  // Persist batch queue cleanly to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(BATCH_QUEUE_STORAGE_KEY, serializeQueueForStorage(batchItems));
    } catch {
      // Ignore storage quota restrictions
    }
  }, [batchItems]);

  // Dynamically sync canonical, og:url, and social card image URLs with runtime origin
  useEffect(() => {
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    const ogImageUrl = `${window.location.origin}/og-cover.png`;

    const canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.setAttribute('href', canonicalUrl);

    const ogUrlEl = document.querySelector('meta[property="og:url"]');
    if (ogUrlEl) ogUrlEl.setAttribute('content', canonicalUrl);

    const ogImageEl = document.querySelector('meta[property="og:image"]');
    if (ogImageEl) ogImageEl.setAttribute('content', ogImageUrl);

    const twitterImageEl = document.querySelector('meta[name="twitter:image"]');
    if (twitterImageEl) twitterImageEl.setAttribute('content', ogImageUrl);
  }, []);

  const updateItemById = useCallback(
    (id: string, patch: Partial<BatchQueueItem> | ((prev: BatchQueueItem) => BatchQueueItem)) => {
      setBatchItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return typeof patch === 'function' ? patch(item) : { ...item, ...patch };
        })
      );
    },
    []
  );

  // On initial mount, re-sync any restored jobs with live server status and resume SSE if processing
  useEffect(() => {
    let disposed = false;
    const activeSources: EventSource[] = [];
    const initialItems = batchItemsRef.current;

    const applyStatusPayload = (item: BatchQueueItem, data: Record<string, unknown>) => {
      if (disposed) return;
      const st = String(data.status || '');
      updateItemById(item.id, {
        status:
          st === 'completed'
            ? 'completed'
            : st === 'processing'
            ? 'processing'
            : st === 'failed'
            ? 'failed'
            : 'ready',
        phase: st === 'completed' ? 'Completed' : st === 'failed' ? 'Failed' : String(data.phase || 'Ready'),
        progress:
          st === 'completed'
            ? 100
            : typeof data.progress === 'number'
            ? data.progress
            : item.progress,
        rowsProcessed:
          typeof data.rowsProcessed === 'number' ? data.rowsProcessed : item.rowsProcessed,
        totalRows: typeof data.totalRows === 'number' ? data.totalRows : item.totalRows,
        processingTimeMs:
          typeof data.processingTimeMs === 'number'
            ? data.processingTimeMs
            : item.processingTimeMs,
        error: st === 'failed' ? String(data.error || 'Processing failed.') : undefined,
      });
    };

    for (const item of initialItems) {
      if (!item.jobId || item.status === 'failed') continue;
      const jobId = item.jobId;
      void fetch(`/api/status/${jobId}`)
        .then(async (res) => {
          if (disposed) return;
          if (!res.ok) {
            updateItemById(item.id, {
              status: 'failed',
              phase: 'Expired',
              error: 'Session expired. Re-upload to process.',
            });
            return;
          }
          const data = (await res.json()) as Record<string, unknown>;
          applyStatusPayload(item, data);

          if (String(data.status || '') === 'processing') {
            const es = new EventSource(`/api/progress/${jobId}`);
            activeSources.push(es);
            es.onmessage = (event) => {
              try {
                const parsed = JSON.parse(event.data) as Record<string, unknown>;
                applyStatusPayload(item, parsed);
                const nextSt = String(parsed.status || '');
                if (nextSt === 'completed' || nextSt === 'failed') {
                  es.close();
                }
              } catch {
                // Ignore malformed SSE payload
              }
            };
            es.onerror = () => {
              es.close();
            };
          }
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      for (const es of activeSources) {
        es.close();
      }
    };
  }, [updateItemById]);

  const uploadSingleBatchItem = useCallback(
    async (
      itemId: string,
      filename: string,
      mimeType: string,
      dataUrl: string
    ): Promise<boolean> => {
      updateItemById(itemId, { status: 'uploading', phase: 'Uploading', progress: 8 });
      try {
        const data = await uploadPayloadXhr(filename, mimeType, dataUrl, (pct) => {
          updateItemById(itemId, { status: 'uploading', phase: 'Uploading', progress: pct });
        });

        updateItemById(itemId, {
          jobId: String(data.job_id),
          filename: String(data.filename),
          sizeBytes: Number(data.sizeBytes),
          width: Number(data.width),
          height: Number(data.height),
          exifOrientation: Number(data.exifOrientation),
          colorSpace: String(data.colorSpace),
          totalRows: Number(data.totalRows ?? data.height ?? 0),
          rowsProcessed: 0,
          status: 'ready',
          phase: 'Ready',
          progress: 0,
          analysis: data.analysis,
        });
        return true;
      } catch (err: unknown) {
        updateItemById(itemId, {
          status: 'failed',
          phase: 'Failed',
          progress: 0,
          error: err instanceof Error ? err.message : 'Upload failed.',
        });
        return false;
      }
    },
    [updateItemById]
  );

  const handleQueueFiles = useCallback(
    async (incoming: FileList | File[]) => {
      setUploadError(null);
      const files = Array.from(incoming);
      if (files.length === 0) return;
      const wasQueueEmpty = batchItemsRef.current.length === 0;

      const prepared: Array<{
        id: string;
        file: File;
        dataUrl?: string;
        thumbnailUrl: string;
        error?: string;
      }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;
        const validation = validateQueuedFile(file.name, file.size, 25);

        if (!validation.valid) {
          prepared.push({ id, file, thumbnailUrl: '', error: validation.error });
          continue;
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          originalDataUrlsRef.current.set(id, dataUrl);
          const thumbnailUrl = await createCompactThumbnail(dataUrl);
          prepared.push({ id, file, dataUrl, thumbnailUrl });
        } catch {
          prepared.push({ id, file, thumbnailUrl: '', error: 'Unable to read file.' });
        }
      }

      const newItems: BatchQueueItem[] = prepared.map(
        ({ id, file, thumbnailUrl, error }) => ({
          id,
          filename: file.name,
          mimeType: file.type || 'image/jpeg',
          sizeBytes: file.size,
          thumbnailUrl,
          status: error ? 'failed' : 'queued',
          phase: error ? 'Failed' : 'Queued',
          progress: 0,
          rowsProcessed: 0,
          totalRows: 0,
          processingTimeMs: 0,
          mode: batchMode,
          exportFormat: batchFormat,
          error,
        })
      );

      setBatchItems((prev) => [...prev, ...newItems]);

      const validJobs = prepared.filter((p) => Boolean(p.dataUrl));
      const succeededIds: string[] = [];
      for (let i = 0; i < validJobs.length; i += 2) {
        const slice = validJobs.slice(i, i + 2);
        const results = await Promise.all(
          slice.map(async (entry) => {
            const ok = await uploadSingleBatchItem(
              entry.id,
              entry.file.name,
              entry.file.type || 'image/jpeg',
              entry.dataUrl!
            );
            return ok ? entry.id : null;
          })
        );
        for (const id of results) {
          if (id) succeededIds.push(id);
        }
      }

      if (shouldOpenSingleEditorAfterUpload(wasQueueEmpty, files.length, succeededIds.length)) {
        setActiveItemId(succeededIds[0]);
      }
    },
    [batchMode, batchFormat, uploadSingleBatchItem]
  );

  const handleChangeBatchMode = useCallback((mode: BatchEnhancementMode) => {
    setBatchMode(mode);
    setBatchItems((prev) =>
      prev.map((item) =>
        item.status === 'ready' || item.status === 'queued' ? { ...item, mode } : item
      )
    );
  }, []);

  const handleChangeBatchFormat = useCallback((fmt: BatchExportFormat) => {
    setBatchFormat(fmt);
    setBatchItems((prev) =>
      prev.map((item) =>
        item.status === 'ready' || item.status === 'queued'
          ? { ...item, exportFormat: fmt }
          : item
      )
    );
  }, []);

  const processSingleBatchItem = useCallback(
    (item: BatchQueueItem): Promise<void> => {
      return new Promise((resolve) => {
        if (!item.jobId) {
          updateItemById(item.id, {
            status: 'failed',
            phase: 'Failed',
            error: 'Missing job ID.',
          });
          resolve();
          return;
        }

        const jobId = item.jobId;
        let settled = false;
        let eventSource: EventSource | null = null;
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

        const finish = () => {
          if (settled) return;
          settled = true;
          eventSource?.close();
          if (fallbackTimer) clearTimeout(fallbackTimer);
          resolve();
        };

        const applyPayload = (data: Record<string, unknown>) => {
          const st = String(data.status || '');
          const phase = String(data.phase || 'Validating');
          const progress = typeof data.progress === 'number' ? data.progress : item.progress;
          const rowsProcessed =
            typeof data.rowsProcessed === 'number' ? data.rowsProcessed : item.rowsProcessed;
          const totalRows =
            typeof data.totalRows === 'number' && data.totalRows > 0
              ? data.totalRows
              : item.totalRows;
          const processingTimeMs =
            typeof data.processingTimeMs === 'number'
              ? data.processingTimeMs
              : item.processingTimeMs;

          if (st === 'completed') {
            updateItemById(item.id, {
              status: 'completed',
              phase: 'Completed',
              progress: 100,
              rowsProcessed,
              totalRows,
              processingTimeMs,
            });
            finish();
          } else if (st === 'failed') {
            updateItemById(item.id, {
              status: 'failed',
              phase: 'Failed',
              error: String(data.error || 'Processing failed.'),
            });
            finish();
          } else {
            updateItemById(item.id, {
              status: 'processing',
              phase,
              progress,
              rowsProcessed,
              totalRows,
              processingTimeMs,
            });
          }
        };

        updateItemById(item.id, {
          status: 'processing',
          phase: 'Validating',
          progress: 4,
          rowsProcessed: 0,
        });

        try {
          eventSource = new EventSource(`/api/progress/${jobId}`);
          eventSource.onmessage = (event) => {
            try {
              const parsed = JSON.parse(event.data);
              applyPayload(parsed);
            } catch {
              // Ignore malformed SSE message
            }
          };
          eventSource.onerror = () => {
            eventSource?.close();
            fallbackTimer = setTimeout(async () => {
              try {
                const res = await fetch(`/api/status/${jobId}`);
                if (res.ok) {
                  applyPayload(await res.json());
                } else {
                  finish();
                }
              } catch {
                finish();
              }
            }, 150);
          };
        } catch {
          // Will rely on fetch response fallback
        }

        const params =
          item.mode === 'natural'
            ? {
                ...DEFAULT_ENHANCEMENT_PARAMS,
                preset: 'natural',
                naturalStrength: 25,
                sharpness: 18,
                noiseReduction: 12,
              }
            : {
                ...DEFAULT_ENHANCEMENT_PARAMS,
                preset: 'original-preservation',
                naturalStrength: 15,
              };

        fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            params,
            exportFormat: item.exportFormat,
            jpegQuality: 100,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'Processing failed.');
            }
          })
          .catch((err: unknown) => {
            updateItemById(item.id, {
              status: 'failed',
              phase: 'Failed',
              error: err instanceof Error ? err.message : 'Processing failed.',
            });
            finish();
          });
      });
    },
    [updateItemById]
  );

  const handleStartBatch = useCallback(async () => {
    if (isBatchRunningRef.current) return;
    isBatchRunningRef.current = true;
    try {
      const readyIds = batchItemsRef.current
        .filter((item) => item.status === 'ready' && item.jobId)
        .map((item) => item.id);

      for (const id of readyIds) {
        const latest = batchItemsRef.current.find((i) => i.id === id);
        if (!latest || latest.status !== 'ready') continue;
        await processSingleBatchItem(latest);
      }
    } finally {
      isBatchRunningRef.current = false;
    }
  }, [processSingleBatchItem]);

  const handleDownloadItem = useCallback(async (item: BatchQueueItem) => {
    if (!item.jobId || item.status !== 'completed') return;
    const ext =
      item.exportFormat === 'png'
        ? 'png'
        : item.exportFormat === 'webp'
        ? 'webp'
        : 'jpg';
    const mime =
      item.exportFormat === 'png'
        ? 'image/png'
        : item.exportFormat === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    const baseName = item.filename.replace(/\.[^.]+$/, '') || 'photo';
    const fileName = `${baseName}_clean.${ext}`;

    const res = await fetch(`/api/result/${item.jobId}?download=1&t=${Date.now()}`);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.startsWith('image/')) {
      throw new Error('Image binary unavailable.');
    }
    const arrayBuffer = await res.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    const target = batchItemsRef.current.find((i) => i.id === id);
    if (target?.jobId) {
      void fetch(`/api/job/${target.jobId}`, { method: 'DELETE' }).catch(() => {});
    }
    originalDataUrlsRef.current.delete(id);
    setBatchItems((prev) => prev.filter((i) => i.id !== id));
    setActiveItemId((prev) => (prev === id ? null : prev));
  }, []);

  const handleClearBatch = useCallback(() => {
    for (const item of batchItemsRef.current) {
      if (item.jobId) {
        void fetch(`/api/job/${item.jobId}`, { method: 'DELETE' }).catch(() => {});
      }
    }
    originalDataUrlsRef.current.clear();
    setBatchItems([]);
    setActiveItemId(null);
  }, []);

  const activeItem = activeItemId
    ? batchItems.find((i) => i.id === activeItemId && Boolean(i.jobId))
    : undefined;

  const activeSession: ActivePhotoSession | null =
    activeItem && activeItem.jobId
      ? {
          jobId: activeItem.jobId,
          filename: activeItem.filename,
          format: activeItem.exportFormat,
          sizeBytes: activeItem.sizeBytes,
          width: activeItem.width || 0,
          height: activeItem.height || 0,
          exifOrientation: activeItem.exifOrientation || 1,
          colorSpace: activeItem.colorSpace || 'srgb',
          originalDataUrl: originalDataUrlsRef.current.get(activeItem.id) || '',
          analysis: (activeItem.analysis || {}) as ImageAnalysisReport,
          initialStatus: activeItem.status,
          initialPhase: activeItem.phase as JobPhase,
          initialProgress: activeItem.progress,
          initialRowsProcessed: activeItem.rowsProcessed,
          initialTotalRows: activeItem.totalRows,
          initialProcessingTimeMs: activeItem.processingTimeMs,
          initialMode: activeItem.mode,
          initialExportFormat: activeItem.exportFormat,
        }
      : null;

  return (
    <div className="min-h-screen studio-light-bg text-slate-900 flex flex-col">
      {/* Light Studio Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-4">
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setActiveItemId(null);
            }}
            className="flex items-center gap-2.5 group whitespace-nowrap shrink-0"
          >
            <NaturalPhotoLogo className="w-8 h-8 transition-transform duration-200 group-hover:scale-105" />
            <span className="text-[15px] font-bold tracking-tight text-slate-900">
              AI Tag Remover
            </span>
          </a>

          <button
            type="button"
            onClick={() => {
              if (activeItemId) {
                setActiveItemId(null);
                setTimeout(() => {
                  document.getElementById('photo-upload-input')?.click();
                }, 60);
              } else {
                document.getElementById('photo-upload-input')?.click();
              }
            }}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold tracking-tight transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upload Photos
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6">
        {!activeSession ? (
          <UploadHomepage
            batchItems={batchItems}
            batchMode={batchMode}
            batchFormat={batchFormat}
            uploadError={uploadError}
            onClearError={() => setUploadError(null)}
            onQueueFiles={handleQueueFiles}
            onChangeBatchMode={handleChangeBatchMode}
            onChangeBatchFormat={handleChangeBatchFormat}
            onStartBatch={handleStartBatch}
            onOpenItem={(item) => setActiveItemId(item.id)}
            onDownloadItem={handleDownloadItem}
            onRemoveItem={handleRemoveItem}
            onClearBatch={handleClearBatch}
          />
        ) : (
          <DarkroomEditor
            session={activeSession}
            backLabel={batchItems.length > 1 ? 'Back to Queue' : 'Back to Upload'}
            onBackToUpload={() => setActiveItemId(null)}
            onJobSync={(jobId, update) => {
              setBatchItems((prev) =>
                prev.map((item) =>
                  item.jobId === jobId
                    ? {
                        ...item,
                        status: update.status,
                        phase: update.phase,
                        progress: update.progress,
                        rowsProcessed: update.rowsProcessed,
                        totalRows: update.totalRows,
                        processingTimeMs: update.processingTimeMs,
                        mode: update.mode,
                        exportFormat: update.exportFormat,
                      }
                    : item
                )
              );
            }}
          />
        )}
      </main>

      {/* Studio Footer with Developer Attribution & Social Links */}
      <footer className="border-t border-slate-200 bg-white/85 backdrop-blur-sm mt-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <span className="font-semibold text-slate-800">AI Tag Remover</span>
            <span className="hidden sm:inline text-slate-300">·</span>
            <span>
              Developed By{' '}
              <a
                href="https://apon-the-bot.github.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-700 hover:text-amber-800 underline decoration-amber-400/70 underline-offset-2 transition-colors"
              >
                Amanullah Sheikh Apon
              </a>
            </span>
          </div>

          <nav aria-label="Developer Social Links" className="flex flex-wrap items-center justify-center gap-2">
            <a
              href="https://apon-the-bot.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Portfolio Website"
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Portfolio</span>
            </a>

            <a
              href="https://github.com/Apon-The-Bot"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>

            <a
              href="https://www.linkedin.com/in/md-amanullah-sheikh-apon/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors"
            >
              <Linkedin className="w-3.5 h-3.5" />
              <span>LinkedIn</span>
            </a>

            <a
              href="https://www.facebook.com/mdamanullahsheikh.apon"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors"
            >
              <Facebook className="w-3.5 h-3.5" />
              <span>Facebook</span>
            </a>

            <a
              href="mailto:apon@bloodhelpbd.com"
              aria-label="Email"
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email</span>
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
