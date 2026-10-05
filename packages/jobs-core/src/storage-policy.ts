export interface StoragePolicy {
  totalBytes: number;
  outputBytes: number;
  trackingBytes: number;
  resultBytes: number;
  retentionMs: number;
}
export const DEFAULT_STORAGE_POLICY: Readonly<StoragePolicy> = Object.freeze({
  totalBytes: 1024 ** 3,
  outputBytes: 100 * 1024 ** 2,
  trackingBytes: 256 * 1024,
  resultBytes: 1024 ** 2,
  retentionMs: 7 * 24 * 60 * 60 * 1000,
});
