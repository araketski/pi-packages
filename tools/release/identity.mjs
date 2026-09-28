import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const expectedSha = process.env.RELEASE_SHA;

function fail(message) {
  throw new Error(message);
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

try {
  const sha = git('rev-parse', 'HEAD');
  if (!expectedSha || sha !== expectedSha) {
    fail(
      `checked-out commit ${sha} does not match captured release commit ${expectedSha ?? '(missing)'}`,
    );
  }

  const packageRoots = readdirSync(join(root, 'packages'))
    .map((directory) => join(root, 'packages', directory))
    .filter((directory) => existsSync(join(directory, 'package.json')));
  const packages = packageRoots
    .map((directory) => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')))
    .filter((manifest) => manifest.private !== true);
  if (packages.length === 0) fail('no publishable packages found');
  const versions = new Set(packages.map((manifest) => manifest.version));
  if (versions.size !== 1) fail('package versions do not match');
  const [version] = versions;
  const numeric = '(?:0|[1-9]\\d*)';
  const prereleaseIdentifier = `(?:${numeric}|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)`;
  const semver = new RegExp(
    `^${numeric}\\.${numeric}\\.${numeric}(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
  );
  if (typeof version !== 'string' || !semver.test(version)) {
    fail(`invalid package version: ${version}`);
  }

  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  if (
    !changelog
      .split(/\r?\n/)
      .some((line) => line === `## ${version}` || line.startsWith(`## ${version} (`))
  ) {
    fail(`changelog has no entry for ${version}`);
  }

  const tag = `v${version}`;
  const existingTag = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], {
    cwd: root,
  });
  if (existingTag.status === 0) {
    const taggedSha = git('rev-list', '-n', '1', tag);
    if (taggedSha !== sha)
      fail(`existing tag ${tag} points to ${taggedSha}, not release commit ${sha}`);
  } else if (existingTag.status !== 1) {
    fail(`could not inspect existing tag ${tag}`);
  }

  const prerelease = /^\d+\.\d+\.\d+-/.test(version);
  process.stdout.write(
    `sha=${sha}\nversion=${version}\ntag=${tag}\nnpm-tag=${prerelease ? 'next' : 'latest'}\nprerelease=${prerelease}\n`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
