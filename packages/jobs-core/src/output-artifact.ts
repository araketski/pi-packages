import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const JOBS_OUTPUT_MAX_BYTES = 10_000_000;
export const JOBS_OUTPUT_HEADER_BYTES = 4096;
export type OutputStream = 'stdout' | 'stderr' | 'combined';
export type StreamCounts = Record<OutputStream, number>;
export interface CapturedSegment {
  offset: number;
  bytes: Uint8Array;
  streams: Uint8Array;
}
export interface CapturedBytes {
  totalBytes: number;
  omittedBytes: number;
  complete: boolean;
  prefix: CapturedSegment;
  tail: CapturedSegment;
  streamLoss: StreamCounts;
}
/** Only bounded output images; never execution or result sidecars. Methods must not retain images. */
export interface OutputArtifactIO {
  write(reference: string, image: Uint8Array): Promise<void>;
  read(reference: string, maximumBytes: number): Promise<Uint8Array>;
  remove(reference: string): Promise<void>;
}
export function validOutputReference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.output$/.test(value)
  );
}
function pathFor(root: string, reference: string): string {
  if (!validOutputReference(reference)) throw new Error('Invalid output reference.');
  return join(root, reference);
}
/** Selected user-state root supplied by integration. No default Pi singleton or repository path. */
export function createOutputArtifactIO(outputRoot: string): OutputArtifactIO {
  const root = resolve(outputRoot);
  return {
    async write(reference, image) {
      const path = pathFor(root, reference),
        temporary = `${path}.tmp`;
      await mkdir(root, { recursive: true, mode: 0o700 });
      // Exclusive temporary creation: never replace an unrelated pre-existing temporary file.
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(image);
        await handle.close();
        await rename(temporary, path);
      } catch (error) {
        await handle.close().catch(() => undefined);
        try {
          await unlink(temporary);
        } catch (cleanup) {
          if ((cleanup as NodeJS.ErrnoException)?.code !== 'ENOENT')
            throw new Error('Output replacement failed and temporary cleanup failed.', {
              cause: error,
            });
        }
        throw error;
      }
    },
    async read(reference, maximumBytes) {
      const handle = await open(
        pathFor(root, reference),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size < JOBS_OUTPUT_HEADER_BYTES || info.size > maximumBytes)
          throw new Error('Invalid output artifact length.');
        const image = new Uint8Array(info.size);
        let offset = 0;
        while (offset < image.length) {
          const { bytesRead } = await handle.read(image, offset, image.length - offset, offset);
          if (!bytesRead) throw new Error('Output artifact ended before its declared length.');
          offset += bytesRead;
        }
        return image;
      } finally {
        await handle.close();
      }
    },
    async remove(reference) {
      try {
        await unlink(pathFor(root, reference));
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      }
    },
  };
}
const streams: OutputStream[] = ['stdout', 'stderr', 'combined'];
const emptyCounts = (): StreamCounts => ({ stdout: 0, stderr: 0, combined: 0 });
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function digest(data: Uint8Array, tags: Uint8Array): string {
  return createHash('sha256').update(data).update(tags).digest('hex');
}
interface Header {
  version: 1;
  reference: string;
  maxBytes: number;
  prefixBytes: number;
  total: number;
  received: StreamCounts;
  checksum: string;
}
/** Single owner ring. Stream tags avoid a potentially B-object alternating-stream span index. */
export class OutputCapture {
  private data: Uint8Array;
  private tags: Uint8Array;
  total = 0;
  private received = emptyCounts();
  constructor(
    readonly maxBytes: number,
    readonly prefixBytes: number,
  ) {
    if (
      !count(maxBytes) ||
      maxBytes < 2 ||
      maxBytes > JOBS_OUTPUT_MAX_BYTES ||
      !count(prefixBytes) ||
      prefixBytes < 1 ||
      prefixBytes >= maxBytes
    )
      throw new Error('Invalid output bounds.');
    this.data = new Uint8Array(maxBytes);
    this.tags = new Uint8Array(maxBytes);
  }
  append(stream: OutputStream, bytes: Uint8Array): void {
    const tag = streams.indexOf(stream) + 1;
    if (!tag || !(bytes instanceof Uint8Array)) throw new Error('Invalid output chunk.');
    if (!Number.isSafeInteger(this.total + bytes.length))
      throw new Error('Exact output counters exhausted.');
    const tailSize = this.maxBytes - this.prefixBytes;
    // Borrow the input only for this synchronous capture; do not retain arbitrary producer chunks.
    for (let i = 0; i < bytes.length; i++) {
      const position =
        this.total < this.prefixBytes
          ? this.total
          : this.prefixBytes + ((this.total - this.prefixBytes) % tailSize);
      this.data[position] = bytes[i];
      this.tags[position] = tag;
      this.total++;
    }
    this.received[stream] += bytes.length;
  }
  image(reference: string): Uint8Array {
    const header: Header = {
      version: 1,
      reference,
      maxBytes: this.maxBytes,
      prefixBytes: this.prefixBytes,
      total: this.total,
      received: this.received,
      checksum: digest(this.data, this.tags),
    };
    const json = new TextEncoder().encode(JSON.stringify(header));
    if (json.length >= JOBS_OUTPUT_HEADER_BYTES) throw new Error('Output header overflow.');
    const image = new Uint8Array(JOBS_OUTPUT_HEADER_BYTES + 2 * this.maxBytes);
    image.set(json);
    image.set(this.data, JOBS_OUTPUT_HEADER_BYTES);
    image.set(this.tags, JOBS_OUTPUT_HEADER_BYTES + this.maxBytes);
    return image;
  }
  view(): CapturedBytes {
    return describe(
      this.maxBytes,
      this.prefixBytes,
      this.total,
      this.received,
      this.data,
      this.tags,
    );
  }
}
function describe(
  max: number,
  prefixSize: number,
  total: number,
  received: StreamCounts,
  data: Uint8Array,
  tags: Uint8Array,
): CapturedBytes {
  const prefixLength = Math.min(total, prefixSize),
    tailSize = max - prefixSize,
    tailLength = Math.min(Math.max(0, total - prefixSize), tailSize);
  const tailOffset = total - tailLength;
  const prefix = {
    offset: 0,
    bytes: data.slice(0, prefixLength),
    streams: tags.slice(0, prefixLength),
  };
  const tail: CapturedSegment = {
    offset: tailOffset,
    bytes: new Uint8Array(tailLength),
    streams: new Uint8Array(tailLength),
  };
  const retained = emptyCounts();
  for (const tag of prefix.streams) retained[streams[tag - 1]]++;
  for (let i = 0; i < tailLength; i++) {
    const position = prefixSize + ((tailOffset + i - prefixSize) % tailSize);
    tail.bytes[i] = data[position];
    tail.streams[i] = tags[position];
    retained[streams[tags[position] - 1]]++;
  }
  const omittedBytes = total - prefixLength - tailLength;
  return {
    totalBytes: total,
    omittedBytes,
    complete: omittedBytes === 0,
    prefix,
    tail,
    streamLoss: {
      stdout: received.stdout - retained.stdout,
      stderr: received.stderr - retained.stderr,
      combined: received.combined - retained.combined,
    },
  };
}
export function decodeOutputImage(reference: string, image: Uint8Array): CapturedBytes {
  if (!(image instanceof Uint8Array) || image.length < JOBS_OUTPUT_HEADER_BYTES)
    throw new Error('Invalid output image.');
  const end = image.subarray(0, JOBS_OUTPUT_HEADER_BYTES).indexOf(0);
  if (end < 1 || image.subarray(end, JOBS_OUTPUT_HEADER_BYTES).some((byte) => byte !== 0))
    throw new Error('Invalid output header.');
  const h = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(image.subarray(0, end)),
  ) as Header;
  if (
    h.version !== 1 ||
    h.reference !== reference ||
    !validOutputReference(h.reference) ||
    !count(h.maxBytes) ||
    h.maxBytes < 2 ||
    h.maxBytes > JOBS_OUTPUT_MAX_BYTES ||
    !count(h.prefixBytes) ||
    h.prefixBytes < 1 ||
    h.prefixBytes >= h.maxBytes ||
    !count(h.total) ||
    !h.received ||
    !streams.every((stream) => count(h.received[stream])) ||
    streams.reduce((n, stream) => n + h.received[stream], 0) !== h.total ||
    image.length !== JOBS_OUTPUT_HEADER_BYTES + 2 * h.maxBytes
  )
    throw new Error('Invalid output bookkeeping.');
  const data = image.subarray(JOBS_OUTPUT_HEADER_BYTES, JOBS_OUTPUT_HEADER_BYTES + h.maxBytes),
    tags = image.subarray(JOBS_OUTPUT_HEADER_BYTES + h.maxBytes);
  if (digest(data, tags) !== h.checksum) throw new Error('Output checksum mismatch.');
  const filled = Math.min(h.total, h.maxBytes),
    retained = emptyCounts();
  for (let i = 0; i < tags.length; i++) {
    if (i < filled ? tags[i] < 1 || tags[i] > 3 : tags[i] !== 0 || data[i] !== 0)
      throw new Error('Invalid stream index.');
    if (tags[i]) retained[streams[tags[i] - 1]]++;
  }
  if (!streams.every((stream) => retained[stream] <= h.received[stream]))
    throw new Error('Invalid stream loss.');
  return describe(h.maxBytes, h.prefixBytes, h.total, h.received, data, tags);
}
