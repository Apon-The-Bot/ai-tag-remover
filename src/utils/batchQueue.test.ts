import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BatchQueueItem,
  validateQueuedFile,
  summarizeBatchQueue,
  serializeQueueForStorage,
  deserializeQueueFromStorage,
  formatBatchFileSize,
  shouldOpenSingleEditorAfterUpload,
  getQueueHeaderCopy,
} from './batchQueue';

function makeItem(overrides: Partial<BatchQueueItem>): BatchQueueItem {
  return {
    id: 'item-1',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 120_000,
    thumbnailUrl: 'data:image/jpeg;base64,abc',
    status: 'ready',
    phase: 'Ready',
    progress: 0,
    rowsProcessed: 0,
    totalRows: 900,
    processingTimeMs: 0,
    mode: 'original',
    exportFormat: 'jpeg',
    jobId: 'job-1',
    ...overrides,
  };
}

test('validateQueuedFile accepts valid photo formats up to 25 MB and rejects invalid files', () => {
  assert.equal(validateQueuedFile('portrait.jpg', 500_000).valid, true);
  assert.equal(validateQueuedFile('studio.WEBP', 2_000_000).valid, true);
  assert.equal(validateQueuedFile('raw.heic', 10_000_000).valid, true);
  assert.equal(validateQueuedFile('notes.txt', 1000).valid, false);
  assert.equal(validateQueuedFile('huge.png', 26 * 1024 * 1024).valid, false);
});

test('summarizeBatchQueue computes accurate counts, overall progress, and start availability', () => {
  const items: BatchQueueItem[] = [
    makeItem({ id: '1', status: 'completed', progress: 100 }),
    makeItem({ id: '2', status: 'processing', progress: 50 }),
    makeItem({ id: '3', status: 'ready', progress: 0 }),
    makeItem({ id: '4', status: 'failed', progress: 0, error: 'Corrupt file' }),
  ];

  const summary = summarizeBatchQueue(items);
  assert.equal(summary.total, 4);
  assert.equal(summary.completed, 1);
  assert.equal(summary.processing, 1);
  assert.equal(summary.ready, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.overallProgressPct, 50);
  assert.equal(summary.isBatchRunning, true);
  assert.equal(summary.canStartBatch, false);
});

test('serializeQueueForStorage and deserializeQueueFromStorage persist state and handle interrupted uploads', () => {
  const items: BatchQueueItem[] = [
    makeItem({ id: '1', status: 'completed', progress: 100, jobId: 'job-1' }),
    makeItem({ id: '2', status: 'uploading', progress: 45, jobId: undefined }),
  ];

  const json = serializeQueueForStorage(items);
  const restored = deserializeQueueFromStorage(json);

  assert.equal(restored.length, 2);
  assert.equal(restored[0].status, 'completed');
  assert.equal(restored[0].progress, 100);
  assert.equal(restored[1].status, 'failed');
  assert.equal(restored[1].phase, 'Failed');
});

test('formatBatchFileSize formats KB and MB cleanly', () => {
  assert.equal(formatBatchFileSize(0), '0 KB');
  assert.equal(formatBatchFileSize(142_400), '139 KB');
  assert.equal(formatBatchFileSize(3 * 1024 * 1024), '3.0 MB');
});

test('shouldOpenSingleEditorAfterUpload opens editor only for single upload onto empty queue', () => {
  assert.equal(shouldOpenSingleEditorAfterUpload(true, 1, 1), true);
  assert.equal(shouldOpenSingleEditorAfterUpload(false, 1, 1), false);
  assert.equal(shouldOpenSingleEditorAfterUpload(true, 2, 2), false);
  assert.equal(shouldOpenSingleEditorAfterUpload(true, 1, 0), false);
});

test('getQueueHeaderCopy adapts copy between 1 photo and batch mode', () => {
  assert.deepEqual(getQueueHeaderCopy(0), {
    heading: 'Processing Queue (0)',
    startLabel: 'Start Batch',
  });
  assert.deepEqual(getQueueHeaderCopy(1), {
    heading: 'Selected Photo (1)',
    startLabel: 'Start Processing',
  });
  assert.deepEqual(getQueueHeaderCopy(3), {
    heading: 'Processing Queue (3)',
    startLabel: 'Start Batch',
  });
});
