const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-with-you-test-codex-'));
try {
  const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), 'test/*.test.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(codexHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
