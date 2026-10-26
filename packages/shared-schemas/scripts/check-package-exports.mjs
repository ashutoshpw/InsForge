import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, execPath, stdout } from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/bin/tsc');
const npmCli = env.npm_execpath;
assert(npmCli, 'Run this check with npm run test:package.');

function npm(args, cwd, capture = false) {
  return execFileSync(execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: 120_000,
  });
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'insforge-shared-schemas-'));
try {
  npm(['run', 'build'], packageDirectory);

  const [packed] = JSON.parse(
    npm(
      ['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryDirectory],
      packageDirectory,
      true
    )
  );
  const files = new Set(packed.files.map((file) => file.path));
  for (const path of [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/error-codes.schema.js',
    'dist/error-codes.schema.d.ts',
  ]) {
    assert(files.has(path), `Published package is missing ${path}`);
  }

  const consumerDirectory = join(temporaryDirectory, 'consumer');
  await mkdir(consumerDirectory);
  await writeFile(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  );
  npm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      join(temporaryDirectory, packed.filename),
    ],
    consumerDirectory
  );

  const fixture = join(consumerDirectory, 'error-codes.mts');
  await copyFile(join(packageDirectory, 'tests/package-consumer/error-codes.mts'), fixture);
  execFileSync(
    execPath,
    [
      compiler,
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      fixture,
    ],
    { cwd: consumerDirectory, stdio: 'inherit', timeout: 120_000 }
  );

  execFileSync(
    execPath,
    [
      '--input-type=module',
      '--eval',
      `import assert from 'node:assert/strict';
       import { ERROR_CODES, errorCodeSchema } from '@insforge/shared-schemas';
       assert.equal(ERROR_CODES.COMPUTE_QUOTA_EXCEEDED, 'COMPUTE_QUOTA_EXCEEDED');
       assert(Object.keys(ERROR_CODES).length > 0);
       for (const [key, value] of Object.entries(ERROR_CODES)) {
         assert.equal(value, key);
         assert.equal(errorCodeSchema.parse(value), value);
       }
       assert.equal(errorCodeSchema.safeParse('NOT_A_REAL_ERROR_CODE').success, false);`,
    ],
    { cwd: consumerDirectory, stdio: 'inherit', timeout: 120_000 }
  );
  stdout.write('Installed package runtime and TypeScript error-code exports passed.\n');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
