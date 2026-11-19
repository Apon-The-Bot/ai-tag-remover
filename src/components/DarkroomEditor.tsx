import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  CheckCircle2,
  ArrowLeft,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  EnhancementParams,
  DEFAULT_ENHANCEMENT_PARAMS,
  ImageAnalysisReport,
} from '../utils/photoPipeline';
import { OpticalLoader } from './BrandMark';

export type JobPhase =
  | 'Ready'
  | 'Validating'
  | 'Decoding'
  | 'Correcting'
  | 'Finalizing'
  | 'Completed'
  | 'Failed';

export interface PipelineStageInfo {
  id: string;
  phase: 'Validating' | 'Decoding' | 'Correcting' | 'Finalizing';
  order: number;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stageProgress: number;
  durationMs?: number;
}

export interface ActivePhotoSession {
  jobId: string;
  filename: string;
  format: string;
  sizeBytes: number;
  width: number;
  height: number;
  exifOrientation: number;
  colorSpace: string;
  originalDataUrl: string;
  analysis: ImageAnalysisReport;
  initialStatus?: string;
  initialPhase?: JobPhase;
  initialProgress?: number;
  initialStage?: string;
  initialStages?: PipelineStageInfo[];
  initialRowsProcessed?: number;
  initialTotalRows?: number;
  initialProcessingTimeMs?: number;
  initialMode?: 'original' | 'natural';
  initialExportFormat?: 'jpeg' | 'png' | 'webp';
}

interface DarkroomEditorProps {
  session: ActivePhotoSession;
  backLabel?: string;
  onBackToUpload: () => void;
  onJobSync?: (
    jobId: string,
    update: {
      status: 'processing' | 'completed' | 'failed';
      phase: JobPhase;
      progress: number;
      rowsProcessed: number;
      totalRows: number;
      processingTimeMs: number;
      mode: 'original' | 'natural';
      exportFormat: 'jpeg' | 'png' | 'webp';
    }
  ) => void;
}

const DEFAULT_STAGES: PipelineStageInfo[] = [
  {
    id: 'validating',
    phase: 'Validating',
    order: 1,
    title: 'Validating',
    status: 'pending',
    stageProgress: 0,
  },
  {
    id: 'decoding',
    phase: 'Decoding',
    order: 2,
    title: 'Decoding',
    status: 'pending',
    stageProgress: 0,
  },
  {
    id: 'correcting',
    phase: 'Correcting',
    order: 3,
    title: 'Correcting',
    status: 'pending',
    stageProgress: 0,
  },
  {
    id: 'finalizing',
    phase: 'Finalizing',
    order: 4,
    title: 'Finalizing',
    status: 'pending',
    stageProgress: 0,
  },
];

const PHASE_STEPS: Array<'Validating' | 'Decoding' | 'Correcting' | 'Finalizing'> = [
  'Validating',
  'Decoding',
  'Correcting',
  'Finalizing',
];

export const DarkroomEditor: React.FC<DarkroomEditorProps> = ({
  session,
  backLabel = 'Back to Queue',
  onBackToUpload,
  onJobSync,
}) => {
  const [params, setParams] = useState<EnhancementParams>(() =>
    session.initialMode === 'natural'
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
        }
  );
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [exportFormat, setExportFormat] = useState<'jpeg' | 'png' | 'webp'>(
    session.initialExportFormat || 'jpeg'
  );
  const [isDownloading, setIsDownloading] = useState(false);

  // Manual Start: wait until user clicks Start Processing
  const [isProcessingServer, setIsProcessingServer] = useState<boolean>(false);
  const [activePhase, setActivePhase] = useState<JobPhase>(
    session.initialPhase || 'Ready'
  );
  const [processingProgress, setProcessingProgress] = useState<number>(
    session.initialProgress ?? 0
  );
  const [liveStages, setLiveStages] = useState<PipelineStageInfo[]>(
    session.initialStages && session.initialStages.length > 0
      ? session.initialStages
      : DEFAULT_STAGES
  );
  const [rowsProcessed, setRowsProcessed] = useState<number>(
    session.initialRowsProcessed ?? 0
  );
  const [totalRows, setTotalRows] = useState<number>(
    session.initialTotalRows ?? session.height
  );
  const [lastProcessingTimeMs, setLastProcessingTimeMs] = useState<number>(
    session.initialProcessingTimeMs ?? 0
  );

  const [resultVersion, setResultVersion] = useState<number>(
    session.initialStatus === 'completed' ? 1 : 0
  );
  const [needsReprocess, setNeedsReprocess] = useState<boolean>(false);
  const [streamRunKey, setStreamRunKey] = useState<number>(0);

  const isMountedRef = useRef(true);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Real-time Server-Sent Events subscription
  useEffect(() => {
    if (!isProcessingServer) return;

    let active = true;
    let eventSource: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const applyStatusPayload = (data: {
      status?: string;
      phase?: JobPhase;
      progress?: number;
      stages?: PipelineStageInfo[];
      processingTimeMs?: number;
      rowsProcessed?: number;
      totalRows?: number;
    }) => {
      if (!active || !isMountedRef.current) return;
      if (typeof data.progress === 'number') {
        setProcessingProgress(data.progress);
      }
      if (data.phase) {
        setActivePhase(data.phase);
      }
      if (Array.isArray(data.stages) && data.stages.length > 0) {
        setLiveStages(data.stages);
      }
      if (typeof data.processingTimeMs === 'number') {
        setLastProcessingTimeMs(data.processingTimeMs);
      }
      if (typeof data.rowsProcessed === 'number') {
        setRowsProcessed(data.rowsProcessed);
      }
      if (typeof data.totalRows === 'number' && data.totalRows > 0) {
        setTotalRows(data.totalRows);
      }

      if (data.status === 'completed' || data.status === 'failed') {
        setIsProcessingServer(false);
        setNeedsReprocess(false);
        if (data.status === 'completed') {
          setResultVersion((v) => v + 1);
        }
        onJobSync?.(session.jobId, {
          status: data.status === 'completed' ? 'completed' : 'failed',
          phase: data.phase || (data.status === 'completed' ? 'Completed' : 'Failed'),
          progress: typeof data.progress === 'number' ? data.progress : 100,
          rowsProcessed: typeof data.rowsProcessed === 'number' ? data.rowsProcessed : session.height,
          totalRows: typeof data.totalRows === 'number' ? data.totalRows : session.height,
          processingTimeMs: typeof data.processingTimeMs === 'number' ? data.processingTimeMs : 0,
          mode: params.preset === 'original-preservation' ? 'original' : 'natural',
          exportFormat,
        });
        eventSource?.close();
      }
    };

    const fetchStatusOnce = async () => {
      try {
        const res = await fetch(`/api/status/${session.jobId}`);
        if (!res.ok || !active) return;
        const data = await res.json();
        applyStatusPayload(data);
      } catch {
        // Ignore transient fetch failure
      }
    };

    try {
      eventSource = new EventSource(`/api/progress/${session.jobId}`);
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          applyStatusPayload(parsed);
        } catch {
          // Ignore malformed SSE payload
        }
      };
      eventSource.onerror = () => {
        if (!active) return;
        eventSource?.close();
        fallbackTimer = setTimeout(() => {
          void fetchStatusOnce();
        }, 120);
      };
    } catch {
      void fetchStatusOnce();
    }

    return () => {
      active = false;
      eventSource?.close();
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [isProcessingServer, session.jobId, streamRunKey]);

  const handleStartProcessing = async () => {
    if (isProcessingServer) return;
    setActivePhase('Validating');
    setProcessingProgress(4);
    setRowsProcessed(0);
    setLiveStages(DEFAULT_STAGES);
    setIsProcessingServer(true);
    setStreamRunKey((k) => k + 1);

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: session.jobId,
          params,
          exportFormat,
          jpegQuality: 100,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.stages)) {
          setLiveStages(data.stages);
        }
      } else {
        setIsProcessingServer(false);
      }
    } catch {
      setIsProcessingServer(false);
    }
  };

  const handleModeSelect = (mode: 'original' | 'natural') => {
    if (isProcessingServer) return;
    const nextParams: EnhancementParams =
      mode === 'original'
        ? {
            ...DEFAULT_ENHANCEMENT_PARAMS,
            preset: 'original-preservation',
            naturalStrength: 15,
            sharpness: 10,
            noiseReduction: 6,
          }
        : {
            ...DEFAULT_ENHANCEMENT_PARAMS,
            preset: 'natural',
            naturalStrength: 25,
            sharpness: 18,
            noiseReduction: 12,
          };
    setParams(nextParams);
    if (resultVersion > 0) {
      setNeedsReprocess(true);
    }
  };

  const handleFormatSelect = (fmt: 'jpeg' | 'png' | 'webp') => {
    if (isProcessingServer) return;
    setExportFormat(fmt);
    if (resultVersion > 0) {
      setNeedsReprocess(true);
    }
  };

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const el = stageContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPosition(Math.min(100, Math.max(0, Math.round(pct))));
  }, []);

  const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasResult || isProcessingServer) return;
    e.preventDefault();
    activePointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingSplit(true);
    updateSplitFromClientX(e.clientX);
  };

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateSplitFromClientX(e.clientX);
  };

  const handleSplitPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current === e.pointerId) {
      activePointerIdRef.current = null;
      setIsDraggingSplit(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleDownloadBinaryImage = async () => {
    if (isDownloading || !hasResult || isProcessingServer) return;
    setIsDownloading(true);

    const ext = exportFormat === 'png' ? 'png' : exportFormat === 'webp' ? 'webp' : 'jpg';
    const mime =
      exportFormat === 'png'
        ? 'image/png'
        : exportFormat === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    const baseName = session.filename.replace(/\.[^.]+$/, '') || 'photo';
    const fileName = `${baseName}_clean.${ext}`;

    try {
      const res = await fetch(`/api/result/${session.jobId}?download=1&t=${Date.now()}`);
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.startsWith('image/')) {
        throw new Error('Image binary unavailable.');
      }
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength <= 100) {
        throw new Error('Empty image buffer.');
      }

      const validImageBlob = new Blob([arrayBuffer], { type: mime });
      const blobUrl = URL.createObjectURL(validImageBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } finally {
      setIsDownloading(false);
    }
  };

  const isOriginalMode = params.preset === 'original-preservation';
  const hasResult = resultVersion > 0;
  const originalSrc =
    session.originalDataUrl || `/api/result/${session.jobId}?inline=1&source=original`;
  const afterImageSrc = hasResult
    ? `/api/result/${session.jobId}?inline=1&t=${resultVersion}`
    : originalSrc;

  return (
    <div className="py-6 space-y-5">
      {/* Compact Workspace Bar */}
      <div className="flex items-center justify-between gap-4 pb-3.5 border-b border-slate-200">
        <button
          type="button"
          onClick={onBackToUpload}
          className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{backLabel}</span>
        </button>

        <div className="text-xs font-mono-tabular text-slate-500 truncate">
          {session.filename} · {session.width}×{session.height} px
        </div>
      </div>

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Light Studio Viewport & Directly Draggable Before/After Split Line */}
        <div className="lg:col-span-7">
          <div
            data-testid="darkroom-viewport"
            className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg shadow-slate-900/[0.04]"
          >
            <div className="relative flex items-center justify-center p-4 sm:p-6 min-h-[360px] sm:min-h-[470px] bg-slate-100/80">
              <div
                ref={stageContainerRef}
                data-testid="compare-stage"
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerEnd}
                onPointerCancel={handleSplitPointerEnd}
                className={`relative inline-block max-w-full select-none touch-none ${
                  hasResult && !isProcessingServer ? 'cursor-ew-resize' : 'cursor-default'
                }`}
              >
                {/* Output / After Layer */}
                <img
                  src={afterImageSrc}
                  alt={hasResult ? 'Enhanced Output' : 'Uploaded Photo'}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  className="block max-h-[450px] w-auto max-w-full object-contain rounded-lg shadow-sm pointer-events-none select-none"
                />

                {/* Original / Before Layer */}
                {hasResult && (
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none rounded-lg"
                    style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
                  >
                    <img
                      src={originalSrc}
                      alt="Original"
                      draggable={false}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain pointer-events-none select-none"
                    />
                  </div>
                )}

                {/* Real-Time Optical Scanline & Aperture Overlay While Processing */}
                {isProcessingServer && (
                  <div className="absolute inset-0 z-20 pointer-events-none rounded-lg overflow-hidden bg-slate-950/35 backdrop-blur-[1px]">
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.95)] transition-all duration-100"
                      style={{ top: `${Math.min(98, Math.max(2, processingProgress))}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <div className="px-4 py-3 rounded-2xl bg-white/95 border border-amber-300 shadow-xl flex items-center gap-3">
                        <OpticalLoader progress={processingProgress} size="md" tone="light" />
                        <div className="text-left">
                          <div className="text-xs font-semibold text-slate-900">
                            {activePhase}
                          </div>
                          <div className="text-[11px] font-mono-tabular text-amber-700">
                            {rowsProcessed}/{totalRows} rows · {processingProgress}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Directly Draggable Split Divider Line & Handle */}
                {hasResult && !isProcessingServer && (
                  <>
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label="Drag to compare Before and After"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={splitPosition}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') setSplitPosition((p) => Math.max(0, p - 5));
                        if (e.key === 'ArrowRight') setSplitPosition((p) => Math.min(100, p + 5));
                      }}
                      data-testid="split-handle"
                      className="absolute top-0 bottom-0 z-20 -translate-x-1/2 w-10 flex items-center justify-center cursor-ew-resize group focus:outline-none"
                      style={{ left: `${splitPosition}%` }}
                    >
                      <div className="w-0.5 h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.65)]" />
                      <div
                        className={`absolute w-9 h-9 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center text-xs font-mono-tabular text-amber-700 shadow-lg transition-transform ${
                          isDraggingSplit
                            ? 'scale-115 shadow-amber-500/40'
                            : 'group-hover:scale-110'
                        }`}
                      >
                        ↔
                      </div>
                    </div>

                    <div className="absolute bottom-2.5 left-2.5 z-10 px-2 py-0.5 rounded bg-white/90 border border-slate-200 text-[11px] font-mono-tabular text-slate-700 shadow-xs pointer-events-none">
                      Before
                    </div>
                    <div className="absolute bottom-2.5 right-2.5 z-10 px-2 py-0.5 rounded bg-white/90 border border-amber-300 text-[11px] font-mono-tabular text-amber-700 shadow-xs pointer-events-none">
                      After
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Sleek Light-Theme Controls, Progress & Download */}
        <aside className="lg:col-span-5 space-y-4">
          {/* Card 1: Mode, Format & Manual Start */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500">Mode</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200/80">
                <button
                  type="button"
                  disabled={isProcessingServer}
                  onClick={() => handleModeSelect('original')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                    isOriginalMode
                      ? 'bg-white text-amber-700 border border-amber-300 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  100% Original
                </button>
                <button
                  type="button"
                  disabled={isProcessingServer}
                  onClick={() => handleModeSelect('natural')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                    !isOriginalMode
                      ? 'bg-white text-amber-700 border border-amber-300 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  Natural Touch
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500">Format</div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { id: 'jpeg', label: 'JPG 100%' },
                    { id: 'png', label: 'PNG' },
                    { id: 'webp', label: 'WEBP' },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    disabled={isProcessingServer}
                    onClick={() => handleFormatSelect(fmt.id)}
                    className={`py-2 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50 ${
                      exportFormat === fmt.id
                        ? 'bg-slate-900 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={isProcessingServer}
              onClick={handleStartProcessing}
              className={`w-full py-3.5 px-5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                !hasResult || needsReprocess
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
              }`}
            >
              {isProcessingServer ? (
                <>
                  <OpticalLoader progress={processingProgress} size="sm" tone="light" />
                  <span>Processing ({processingProgress}%)</span>
                </>
              ) : hasResult && !needsReprocess ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Re-run Processing</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Processing</span>
                </>
              )}
            </button>
          </div>

          {/* Card 2: Unified Real-Time Progress & Download */}
          <div
            data-testid="live-progress-tracker"
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isProcessingServer ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 studio-pulse shrink-0" />
                ) : hasResult ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                )}
                <span className="text-sm font-semibold text-slate-900">
                  {activePhase}
                </span>
              </div>

              <span
                data-testid="live-progress-pct"
                className={`text-sm font-mono-tabular font-bold ${
                  isProcessingServer
                    ? 'text-amber-600'
                    : hasResult
                    ? 'text-emerald-600'
                    : 'text-slate-400'
                }`}
              >
                {processingProgress}%
              </span>
            </div>

            {/* Single Unified Progress Bar */}
            <div
              role="progressbar"
              aria-valuenow={processingProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Backend Processing Progress"
              className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200"
            >
              <div
                className={`h-full transition-all duration-100 ${
                  isProcessingServer
                    ? 'bg-amber-500'
                    : hasResult
                    ? 'bg-emerald-500'
                    : 'bg-slate-300'
                }`}
                style={{ width: `${processingProgress}%` }}
              />
            </div>

            {/* Compact 4-Step Pipeline Indicator */}
            <div className="grid grid-cols-4 gap-2 pt-0.5">
              {PHASE_STEPS.map((phaseName) => {
                const st = liveStages.find((s) => s.phase === phaseName);
                const isRunning = st?.status === 'running';
                const isDone = st?.status === 'completed';

                return (
                  <div
                    key={phaseName}
                    className={`rounded-lg px-2 py-1.5 text-center border transition-colors ${
                      isRunning
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : isDone
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-50 border-slate-200/80 text-slate-400'
                    }`}
                  >
                    <div className="text-[11px] font-medium truncate">{phaseName}</div>
                    <div className="text-[10px] font-mono-tabular opacity-85">
                      {isRunning
                        ? `${st?.stageProgress || 0}%`
                        : isDone && st?.durationMs
                        ? `${st.durationMs}ms`
                        : '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Compact Telemetry */}
            <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-500 pt-1 border-t border-slate-100">
              <span>
                {rowsProcessed}/{totalRows} rows
              </span>
              <span>{lastProcessingTimeMs} ms</span>
            </div>

            {/* Download Action */}
            <button
              type="button"
              disabled={!hasResult || isProcessingServer || isDownloading}
              onClick={handleDownloadBinaryImage}
              className={`w-full py-3.5 px-5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                hasResult && !isProcessingServer
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/15'
                  : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>
                {isDownloading
                  ? 'Saving...'
                  : `Download Photo (.${exportFormat === 'jpeg' ? 'JPG' : exportFormat.toUpperCase()})`}
              </span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
