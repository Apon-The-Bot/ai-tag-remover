import { validateFileSize } from './photoPipeline';

export type BatchItemStatus =
  | 'queued'
  | 'uploading'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'failed';

export type BatchExportFormat = 'jpeg' | 'png' | 'webp';
export type BatchEnhancementMode = 'original' | 'natural';

export interface BatchQueueItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  exifOrientation?: number;
  colorSpace?: string;
  thumbnailUrl: string;
  jobId?: string;
  status: BatchItemStatus;
  phase: string;
  progress: number;
  rowsProcessed: number;
  totalRows: number;
  processingTimeMs: number;
  mode: BatchEnhancementMode;
  exportFormat: BatchExportFormat;
  error?: string;
  analysis?: unknown;
}

export interface BatchQueueSummary {
  total: number;
  queued: number;
  uploading: number;
  ready: number;
  processing: number;
  completed: number;
  failed: number;
  overallProgressPct: number;
  canStartBatch: boolean;
  isBatchRunning: boolean;
}

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);
export const BATCH_QUEUE_STORAGE_KEY = 'npl_persistent_batch_queue_v1';

export function validateQueuedFile(
  filename: string,
  sizeBytes: number,
  maxSizeMb = 25
): { valid: boolean; error?: string } {
  const sizeCheck = validateFileSize(sizeBytes, maxSizeMb);
  if (!sizeCheck.valid) {
    return sizeCheck;
  }

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported file type (.${ext || 'unknown'}). Use JPG, PNG, WEBP, or HEIC.`,
    };
  }

  return { valid: true };
}

export function summarizeBatchQueue(items: BatchQueueItem[]): BatchQueueSummary {
  let queued = 0;
  let uploading = 0;
  let ready = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;
  let progressSum = 0;

  for (const item of items) {
    switch (item.status) {
      case 'queued':
        queued++;
        break;
      case 'uploading':
        uploading++;
        progressSum += Math.min(20, Math.round(item.progress * 0.2));
        break;
      case 'ready':
        ready++;
        break;
      case 'processing':
        processing++;
        progressSum += Math.min(99, Math.max(0, item.progress));
        break;
      case 'completed':
        completed++;
        progressSum += 100;
        break;
      case 'failed':
        failed++;
        break;
    }
  }

  const total = items.length;
  const activeCount = Math.max(1, total - failed);
  const overallProgressPct = total === 0 ? 0 : Math.round(progressSum / activeCount);
  const isBatchRunning = processing > 0 || uploading > 0;
  const canStartBatch = ready > 0 && processing === 0;

  return {
    total,
    queued,
    uploading,
    ready,
    processing,
    completed,
    failed,
    overallProgressPct,
    canStartBatch,
    isBatchRunning,
  };
}

export function serializeQueueForStorage(items: BatchQueueItem[]): string {
  const safeItems = items.slice(-25).map((item) => ({
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    width: item.width,
    height: item.height,
    exifOrientation: item.exifOrientation,
    colorSpace: item.colorSpace,
    thumbnailUrl: item.thumbnailUrl.length <= 24_000 ? item.thumbnailUrl : '',
    jobId: item.jobId,
    status: item.status,
    phase: item.phase,
    progress: item.progress,
    rowsProcessed: item.rowsProcessed,
    totalRows: item.totalRows,
    processingTimeMs: item.processingTimeMs,
    mode: item.mode,
    exportFormat: item.exportFormat,
    error: item.error,
  }));
  return JSON.stringify(safeItems);
}

export function deserializeQueueFromStorage(raw: string | null): BatchQueueItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.filename === 'string')
      .map((entry) => {
        const st = String(entry.status || 'failed') as BatchItemStatus;
        if (st === 'uploading' || st === 'queued') {
          return {
            ...entry,
            status: 'failed' as BatchItemStatus,
            phase: 'Failed',
            progress: 0,
            error: 'Upload interrupted before completion.',
          };
        }
        return entry as BatchQueueItem;
      });
  } catch {
    return [];
  }
}

export function formatBatchFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function shouldOpenSingleEditorAfterUpload(
  wasQueueEmpty: boolean,
  selectedCount: number,
  succeededCount: number
): boolean {
  return wasQueueEmpty && selectedCount === 1 && succeededCount === 1;
}

export function getQueueHeaderCopy(totalCount: number): {
  heading: string;
  startLabel: string;
} {
  if (totalCount === 1) {
    return {
      heading: 'Selected Photo (1)',
      startLabel: 'Start Processing',
    };
  }
  return {
    heading: `Processing Queue (${totalCount})`,
    startLabel: 'Start Batch',
  };
}
