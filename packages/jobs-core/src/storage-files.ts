import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { JOBS_OUTPUT_BYTES } from './storage.js';
import type { JobsOutputArtifacts, JobsOutputSnapshot } from './storage.js';

/** Optional Node output-only adapter. The caller selects an isolated jobs-owned root. */
// @mara implements REQ-JOBS-OUTPUT-BOUNDS
export function createJobsFileOutput(root: string): JobsOutputArtifacts {
  if (!isAbsolute(root)) throw new Error('Output root must be absolute.');
  const path = (reference: string) => {
    if (!/^[a-f0-9-]{36}\.output$/u.test(reference))
      throw new Error('Not a jobs-owned output reference.');
    return join(root, reference);
  };
  return {
    async create() {
      await mkdir(root, { recursive: true });
      const reference = `${randomUUID()}.output`;
      const file = await open(path(reference), 'wx', 0o600);
      await file.close();
      return reference;
    },
    async write(reference, snapshot) {
      const header = Buffer.from(
        JSON.stringify({
          formatVersion: 1,
          totalBytes: snapshot.totalBytes,
          headBytes: snapshot.headBytes,
          finished: snapshot.finished,
        }),
      );
      if (snapshot.bytes.length > JOBS_OUTPUT_BYTES || header.length > 1024)
        throw new Error('Output snapshot exceeds bound.');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(header.length);
      await writeFile(path(reference), Buffer.concat([length, header, snapshot.bytes]), {
        mode: 0o600,
      });
    },
    async read(reference): Promise<JobsOutputSnapshot> {
      const file = path(reference);
      if ((await stat(file)).size > JOBS_OUTPUT_BYTES + 1028)
        throw new Error('Output snapshot exceeds bound.');
      const buffer = await readFile(file);
      if (buffer.length < 4) throw new Error('Output snapshot unavailable.');
      const size = buffer.readUInt32BE(0);
      if (size > 1024 || size + 4 > buffer.length) throw new Error('Output header unavailable.');
      const header = JSON.parse(buffer.subarray(4, 4 + size).toString('utf8')) as {
        formatVersion: number;
        totalBytes: number;
        headBytes: number;
        finished: boolean;
      };
      const bytes = buffer.subarray(4 + size);
      if (
        header.formatVersion !== 1 ||
        !Number.isSafeInteger(header.totalBytes) ||
        header.totalBytes < bytes.length ||
        !Number.isInteger(header.headBytes) ||
        header.headBytes < 0 ||
        header.headBytes > bytes.length ||
        typeof header.finished !== 'boolean'
      )
        throw new Error('Output snapshot unavailable.');
      return {
        bytes,
        totalBytes: header.totalBytes,
        headBytes: header.headBytes,
        finished: header.finished,
      };
    },
    async remove(reference) {
      await unlink(path(reference));
    },
  };
}
