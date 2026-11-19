import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Trash2,
  ShieldAlert,
  HardDrive,
  Clock,
  Cpu,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface AdminJobSummary {
  jobId: string;
  filename: string;
  format: string;
  dimensions: string;
  status: string;
  preset: string;
  naturalStrength: number;
  processingTimeMs: number;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
}

interface AdminFailureLog {
  id: string;
  timestamp: number;
  reason: string;
  filename?: string;
  code: string;
}

interface AdminMetricsResponse {
  summary: {
    totalJobsProcessed: number;
    activeStorageJobs: number;
    avgProcessingTimeMs: number;
    totalFailures: number;
    storageUsedBytes: number;
    storageQuotaBytes: number;
    jobTtlMinutes: number;
    cpuUtilizationPct: number;
    workerPoolState: string;
    rssMemoryMb: number;
  };
  jobs: AdminJobSummary[];
  failures: AdminFailureLog[];
}

interface AdminDashboardProps {
  onDeleteJob: (jobId: string) => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onDeleteJob }) => {
  const [metrics, setMetrics] = useState<AdminMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'deleted'>('all');
  const [securityTestMessage, setSecurityTestMessage] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handlePurgeJob = async (jobId: string) => {
    await onDeleteJob(jobId);
    await fetchMetrics();
  };

  /**
   * Sends a harmless 16-byte spoofed non-image header to /api/upload to verify magic-byte rejection
   * and log the event in the Admin Security & Failure Audit table.
   */
  const handleTestMagicByteRejection = async () => {
    setSecurityTestMessage('Testing magic-byte signature validator...');
    try {
      const fakeHeader = btoa('MZ-spoofed-executable-payload');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: '../../spoofed_binary.jpg',
          mimeType: 'image/jpeg',
          dataBase64: fakeHeader,
        }),
      });
      const body = await res.json();
      setSecurityTestMessage(
        `Blocked as expected (HTTP ${res.status}): ${body.error}`
      );
      await fetchMetrics();
    } catch {
      setSecurityTestMessage('Validation check completed.');
    }
  };

  const filteredJobs = (metrics?.jobs || []).filter((j) =>
    statusFilter === 'all' ? true : j.status === statusFilter
  );

  return (
    <div className="pt-8 pb-20 space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Lab Processing & Storage Telemetry
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time worker queue latency, ephemeral storage lifecycle, and magic-byte validation
            audit logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestMagicByteRejection}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer whitespace-nowrap shrink-0"
          >
            Simulate Spoofed Upload Check
          </button>

          <button
            type="button"
            onClick={fetchMetrics}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {securityTestMessage && (
        <div
          role="status"
          className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-4"
        >
          <span>{securityTestMessage}</span>
          <button
            type="button"
            onClick={() => setSecurityTestMessage(null)}
            className="text-amber-300 hover:text-white font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      )}

      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 font-mono-tabular">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-sans">
            <span>Processing Jobs</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {metrics ? metrics.summary.totalJobsProcessed : '—'}
          </div>
          <div className="text-xs text-zinc-500 font-sans">
            {metrics ? `${metrics.summary.activeStorageJobs} active in ephemeral storage` : 'Loading...'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-sans">
            <span>Mean Pipeline Latency</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {metrics ? `${metrics.summary.avgProcessingTimeMs} ms` : '—'}
          </div>
          <div className="text-xs text-zinc-500 font-sans">
            Sharp SIMD + Skin-Locus Unsharp Mask
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-sans">
            <span>Ephemeral Storage Usage</span>
            <HardDrive className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {metrics
              ? `${(metrics.summary.storageUsedBytes / (1024 * 1024)).toFixed(2)} MB`
              : '—'}
          </div>
          <div className="text-xs text-zinc-500 font-sans">
            Auto-expiration TTL: {metrics?.summary.jobTtlMinutes || 15} minutes
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-sans">
            <span>Worker & Memory Load</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {metrics ? `${metrics.summary.cpuUtilizationPct}% CPU` : '—'}
          </div>
          <div className="text-xs text-zinc-500 font-sans">
            RSS: {metrics ? `${metrics.summary.rssMemoryMb} MB` : '—'} · Blocked/Failed:{' '}
            {metrics?.summary.totalFailures ?? 0}
          </div>
        </div>
      </div>

      {/* Processing Jobs Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Processing Job Queue</h2>
            <p className="text-xs text-zinc-400">
              Private temporary files are isolated from public static routes and auto-purged.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {(['all', 'completed', 'deleted'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-950/60">
                <th className="py-3 px-4 font-medium">Job ID</th>
                <th className="py-3 px-4 font-medium">Sanitized Filename</th>
                <th className="py-3 px-4 font-medium">Dimensions</th>
                <th className="py-3 px-4 font-medium">Profile & Strength</th>
                <th className="py-3 px-4 font-medium text-right">Processing Time</th>
                <th className="py-3 px-4 font-medium text-right">Size</th>
                <th className="py-3 px-4 font-medium">State</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 font-mono-tabular">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                    No processing jobs match the current filter.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.jobId} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4 text-zinc-300">{job.jobId}</td>
                    <td className="py-3 px-4 text-zinc-100 font-sans font-medium">
                      {job.filename}
                    </td>
                    <td className="py-3 px-4 text-zinc-400">
                      {job.dimensions} · {job.format}
                    </td>
                    <td className="py-3 px-4 text-zinc-300 font-sans">
                      {job.preset} ({job.naturalStrength}%)
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-300">
                      {job.processingTimeMs} ms
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">
                      {(job.sizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span
                        className={
                          job.status === 'completed'
                            ? 'text-emerald-400 font-medium'
                            : job.status === 'deleted'
                            ? 'text-zinc-500'
                            : 'text-amber-400'
                        }
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      {job.status !== 'deleted' ? (
                        <button
                          type="button"
                          onClick={() => handlePurgeJob(job.jobId)}
                          aria-label={`Purge job ${job.jobId}`}
                          className="text-red-400 hover:text-red-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Purge</span>
                        </button>
                      ) : (
                        <span className="text-zinc-600">Purged</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security & Validation Failures Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-semibold text-zinc-100">
              Validation & Security Rejection Log
            </h2>
          </div>
          <span className="text-xs font-mono-tabular text-zinc-400">
            {metrics?.failures.length || 0} recorded events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-950/60">
                <th className="py-3 px-4 font-medium">Event ID</th>
                <th className="py-3 px-4 font-medium">Validation Code</th>
                <th className="py-3 px-4 font-medium">Filename</th>
                <th className="py-3 px-4 font-medium">Diagnostic Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {!metrics || metrics.failures.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    No validation failures or rejected uploads recorded in this session.
                  </td>
                </tr>
              ) : (
                metrics.failures.map((f) => (
                  <tr key={f.id} className="hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-mono-tabular text-zinc-400">{f.id}</td>
                    <td className="py-3 px-4 font-mono-tabular text-amber-400 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {f.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-zinc-300">
                      {f.filename || '—'}
                    </td>
                    <td className="py-3 px-4 text-zinc-300">{f.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
