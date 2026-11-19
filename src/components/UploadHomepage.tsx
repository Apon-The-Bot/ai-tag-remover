import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  AlertCircle,
  SunMedium,
  ShieldCheck,
  Layers,
  Play,
  Download,
  Trash2,
  X,
  Eye,
  CheckCircle2,
  Image as ImageIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, animate } from 'motion/react';
import {
  BatchQueueItem,
  BatchEnhancementMode,
  BatchExportFormat,
  summarizeBatchQueue,
  formatBatchFileSize,
  getQueueHeaderCopy,
} from '../utils/batchQueue';
import { NaturalPhotoLogo, OpticalLoader } from './BrandMark';

function AnimatedPercentage({
  value,
  className,
  testId,
}: {
  value: number;
  className?: string;
  testId?: string;
}) {
  const clampedTarget = Math.max(0, Math.min(100, Math.round(value)));
  const motionVal = useMotionValue(clampedTarget);
  const [displayPct, setDisplayPct] = useState(clampedTarget);

  useEffect(() => {
    const controls = animate(motionVal, clampedTarget, {
      duration: 0.36,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        setDisplayPct(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [motionVal, clampedTarget]);

  return (
    <span data-testid={testId} className={className}>
      {displayPct}%
    </span>
  );
}

const FAQ_ITEMS = [
  {
    q: 'What does AI Tag Remover remove?',
    a: 'It cleans unwanted AI-generated labels, embedded AI metadata, export marks, and other non-image information from supported image files before you share them.',
  },
  {
    q: 'Can I remove an AI tag from a social media photo?',
    a: 'Yes. Upload a copy of your image to remove removable file-level AI labels and metadata, then download a clean export. Platform-side labels that are added after upload may need to be managed on that platform.',
  },
  {
    q: 'Are my images private?',
    a: 'Uploads and processed outputs use temporary isolated job storage and automatically expire after processing. Do not upload anything you are not authorized to process.',
  },
  {
    q: 'Does it remove AI detection from an image?',
    a: 'AI Tag Remover removes visible or embedded labels and metadata where technically possible; it does not promise to defeat AI-content detection systems or change the origin of an image.',
  },
] as const;

interface UploadHomepageProps {
  batchItems: BatchQueueItem[];
  batchMode: BatchEnhancementMode;
  batchFormat: BatchExportFormat;
  uploadError: string | null;
  onClearError: () => void;
  onQueueFiles: (files: FileList | File[]) => Promise<void>;
  onChangeBatchMode: (mode: BatchEnhancementMode) => void;
  onChangeBatchFormat: (fmt: BatchExportFormat) => void;
  onStartBatch: () => Promise<void>;
  onOpenItem: (item: BatchQueueItem) => void;
  onDownloadItem: (item: BatchQueueItem) => Promise<void>;
  onRemoveItem: (id: string) => void;
  onClearBatch: () => void;
}

export const UploadHomepage: React.FC<UploadHomepageProps> = ({
  batchItems,
  batchMode,
  batchFormat,
  uploadError,
  onClearError,
  onQueueFiles,
  onChangeBatchMode,
  onChangeBatchFormat,
  onStartBatch,
  onOpenItem,
  onDownloadItem,
  onRemoveItem,
  onClearBatch,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const summary = summarizeBatchQueue(batchItems);
  const queueCopy = getQueueHeaderCopy(summary.total);
  const activeUploadingItem = batchItems.find((i) => i.status === 'uploading');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await onQueueFiles(Array.from(files));
      e.target.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await onQueueFiles(Array.from(files));
    }
  };

  const handleRowDownload = async (item: BatchQueueItem) => {
    if (downloadingId) return;
    setDownloadingId(item.id);
    try {
      await onDownloadItem(item);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="py-10 sm:py-12 max-w-4xl mx-auto space-y-10">
      {uploadError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between gap-3 text-xs shadow-sm"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={onClearError}
            aria-label="Dismiss error"
            className="text-red-500 hover:text-red-800 font-semibold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Clean Light-Theme Multi-File Photo Upload Dropzone */}
      <section
        aria-label="Photo Upload"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border p-8 sm:p-11 text-center transition-all duration-200 space-y-5 overflow-hidden ${
          isDragging
            ? 'border-amber-500 bg-amber-50/70 shadow-lg shadow-amber-500/10'
            : 'border-slate-200 bg-white hover:border-slate-300 shadow-xl shadow-slate-900/[0.04]'
        }`}
      >
        <span className="pointer-events-none absolute top-4 left-4 w-3.5 h-3.5 border-t-2 border-l-2 border-amber-500/70 rounded-tl-sm" />
        <span className="pointer-events-none absolute top-4 right-4 w-3.5 h-3.5 border-t-2 border-r-2 border-amber-500/70 rounded-tr-sm" />
        <span className="pointer-events-none absolute bottom-4 left-4 w-3.5 h-3.5 border-b-2 border-l-2 border-amber-500/70 rounded-bl-sm" />
        <span className="pointer-events-none absolute bottom-4 right-4 w-3.5 h-3.5 border-b-2 border-r-2 border-amber-500/70 rounded-br-sm" />

        <input
          ref={fileInputRef}
          id="photo-upload-input"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic"
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Upload Photo Files"
        />

        <div className="flex flex-col items-center space-y-2.5">
          {activeUploadingItem ? (
            <OpticalLoader progress={activeUploadingItem.progress} size="lg" tone="light" />
          ) : (
            <NaturalPhotoLogo className="w-12 h-12 shadow-sm rounded-xl" />
          )}

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            AI Tag Remover
          </h1>
          <p className="text-xs font-mono-tabular text-slate-500">
            Remove AI tags, AI marks &amp; generated labels · JPG · PNG · WEBP · HEIC
          </p>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all shadow-md shadow-amber-500/20 inline-flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{batchItems.length > 0 ? 'Add More Photos' : 'Select Photo(s)'}</span>
          </button>
          <p className="text-xs text-slate-400">
            Select 1 photo to edit directly, or multiple photos for batch processing below
          </p>
        </div>
      </section>

      {/* Persistent Batch Processing Queue List */}
      <section
        aria-label="Batch Processing Queue"
        data-testid="persistent-batch-queue"
        className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
      >
        {/* Queue Header & Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-900">
                {queueCopy.heading}
              </h2>
              {summary.total > 0 && (
                <AnimatedPercentage
                  value={summary.overallProgressPct}
                  testId="batch-overall-progress-pct"
                  className="text-xs font-mono-tabular font-semibold text-amber-700"
                />
              )}
            </div>
            <div className="text-xs font-mono-tabular text-slate-500">
              {summary.total === 0
                ? 'Waiting for photos'
                : `Ready ${summary.ready} · Processing ${summary.processing} · Completed ${summary.completed}${
                    summary.failed > 0 ? ` · Failed ${summary.failed}` : ''
                  }`}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Selector */}
            <div className="inline-flex rounded-lg bg-slate-200/70 border border-slate-200 p-0.5">
              <button
                type="button"
                disabled={summary.processing > 0}
                onClick={() => onChangeBatchMode('original')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                  batchMode === 'original'
                    ? 'bg-white text-amber-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Original
              </button>
              <button
                type="button"
                disabled={summary.processing > 0}
                onClick={() => onChangeBatchMode('natural')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                  batchMode === 'natural'
                    ? 'bg-white text-amber-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Natural
              </button>
            </div>

            {/* Export Format Selector */}
            <div className="inline-flex rounded-lg bg-slate-200/70 border border-slate-200 p-0.5">
              {(['jpeg', 'png', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  disabled={summary.processing > 0}
                  onClick={() => onChangeBatchFormat(fmt)}
                  className={`px-2 py-1 rounded-md text-xs font-medium uppercase transition-colors cursor-pointer disabled:opacity-50 ${
                    batchFormat === fmt
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {fmt === 'jpeg' ? 'JPG' : fmt}
                </button>
              ))}
            </div>

            {/* Start Batch CTA */}
            <button
              type="button"
              disabled={!summary.canStartBatch}
              onClick={onStartBatch}
              className={`px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs ${
                summary.processing > 0
                  ? 'bg-slate-900 text-white cursor-wait'
                  : 'bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer'
              }`}
            >
              {summary.processing > 0 ? (
                <>
                  <OpticalLoader progress={summary.overallProgressPct} size="sm" tone="dark" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{queueCopy.startLabel}</span>
                </>
              )}
            </button>

            {summary.total > 0 && (
              <button
                type="button"
                disabled={summary.isBatchRunning}
                onClick={onClearBatch}
                aria-label="Clear queue"
                className="p-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Queue Items List or Empty State with Framer Motion Entrance / Exit */}
        {batchItems.length === 0 ? (
          <motion.div
            key="empty-queue"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="px-5 py-8 text-center text-xs text-slate-500"
          >
            No photos queued yet. Select or drop images above to queue them for processing.
          </motion.div>
        ) : (
          <ul
            aria-label="Queued Photos"
            className="divide-y divide-slate-100 overflow-hidden"
          >
            <AnimatePresence initial={false}>
              {batchItems.map((item) => {
                const isRunning = item.status === 'uploading' || item.status === 'processing';
                const isDone = item.status === 'completed';
                const isFailed = item.status === 'failed';
                const barWidth = isDone ? 100 : Math.max(0, Math.min(100, item.progress));

                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      x: 28,
                      height: 0,
                      paddingTop: 0,
                      paddingBottom: 0,
                    }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    data-testid={`queue-item-${item.id}`}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3.5 bg-white hover:bg-slate-50/70 transition-colors overflow-hidden"
                  >
                  {/* Thumbnail + File Name */}
                  <div className="flex items-center gap-3 min-w-0 sm:w-[36%]">
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.filename}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {item.filename}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-500">
                        {item.width && item.height ? `${item.width}×${item.height} · ` : ''}
                        {formatBatchFileSize(item.sizeBytes)} · {item.exportFormat.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  {/* Individual Status Bar */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="inline-flex items-center gap-1.5 min-w-0">
                        {isRunning ? (
                          <span className="w-2 h-2 rounded-full bg-amber-500 studio-pulse shrink-0" />
                        ) : isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : isFailed ? (
                          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                        )}
                        <span
                          className={`font-medium truncate ${
                            isRunning
                              ? 'text-amber-700'
                              : isDone
                              ? 'text-emerald-700'
                              : isFailed
                              ? 'text-red-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {item.phase}
                        </span>
                        {isFailed && item.error && (
                          <span className="text-[11px] text-red-600 truncate">
                            — {item.error}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono-tabular text-[11px] shrink-0">
                        {item.status === 'processing' && item.totalRows > 0 && (
                          <span className="text-slate-500">
                            {item.rowsProcessed}/{item.totalRows} rows
                          </span>
                        )}
                        {isDone && item.processingTimeMs > 0 && (
                          <span className="text-slate-500">{item.processingTimeMs} ms</span>
                        )}
                        <AnimatedPercentage
                          value={barWidth}
                          testId="queue-item-progress-pct"
                          className={
                            isRunning
                              ? 'text-amber-700 font-bold'
                              : isDone
                              ? 'text-emerald-700 font-bold'
                              : 'text-slate-500'
                          }
                        />
                      </div>
                    </div>

                    <div
                      role="progressbar"
                      aria-label={`Progress for ${item.filename}`}
                      aria-valuenow={barWidth}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80"
                    >
                      <div
                        className={`h-full transition-all duration-100 ${
                          isRunning
                            ? 'bg-amber-500'
                            : isDone
                            ? 'bg-emerald-500'
                            : isFailed
                            ? 'bg-red-500'
                            : 'bg-slate-300'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={!item.jobId || item.status === 'uploading'}
                      onClick={() => onOpenItem(item)}
                      aria-label={`Open ${item.filename}`}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-700 disabled:opacity-40 inline-flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Open</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isDone || downloadingId === item.id}
                      onClick={() => handleRowDownload(item)}
                      aria-label={`Download ${item.filename}`}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-35 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 inline-flex items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Save</span>
                    </button>

                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Remove ${item.filename}`}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {/* Page Description & Photographic Principles */}
      <section aria-label="About AI Tag Remover" className="space-y-6 pt-2">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Remove AI Tags Before You Share
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            AI Tag Remover is a private online image cleaner for people who need to remove
            unwanted AI-generated labels, AI marks, export metadata, and related file signals
            before posting to social media. Upload a photo, clean the removable metadata, and
            export a high-quality copy while keeping the original composition intact.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <article className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600">
              <SunMedium className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Remove AI Metadata</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Clear removable file metadata and unwanted AI-related labels before you share an image online.
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Keep Image Quality</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Preserve the original composition, resolution, and visual detail while creating a clean export.
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Private Processing</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Temporary files expire after processing. Export JPG, PNG, or WEBP for your next post.
            </p>
          </article>
        </div>
      </section>

      {/* Semantic FAQ Section Aligned with FAQPage JSON-LD */}
      <section aria-label="Frequently Asked Questions" className="space-y-4 pt-2">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FAQ_ITEMS.map((faq) => (
            <article
              key={faq.q}
              className="rounded-xl border border-slate-200 bg-white p-5 space-y-1.5 shadow-sm"
            >
              <h3 className="text-xs font-semibold text-slate-900">{faq.q}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{faq.a}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
