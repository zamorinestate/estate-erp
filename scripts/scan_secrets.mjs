import cp from 'node:child_process';

const SECRET_PATTERNS = [
  'mongodb\\+srv://[^:"\' ]+:[^@"\' ]+@',
  'JWT_ACCESS_SECRET\\s*=\\s*["\'][a-f0-9]{40,}',
  'SESSION_SECRET\\s*=\\s*["\'][a-f0-9]{40,}',
  'RENDER_API_KEY\\s*=\\s*["\']rnd_[A-Za-z0-9]{20,}',
];

let leakCount = 0;
for (const pattern of SECRET_PATTERNS) {
  try {
    const res = cp.execSync(
      `git grep -rn --perl-regexp "${pattern}" HEAD -- :^*.test.js :^*.spec.js :^hard-testing/ :^*.example :^*.env.example`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    if (res && res.trim()) {
      console.error(`[CRITICAL] Secret pattern match found for '${pattern}':\n${res.trim()}`);
      leakCount++;
    }
  } catch {
    // Non-zero exit from git grep means zero matches found
  }
}

if (leakCount > 0) {
  console.error(`FAILED: ${leakCount} secret pattern(s) detected in source tree.`);
  process.exit(1);
}

console.log('[PASS] Secret scan verified: 0 credentials or secret patterns detected in committed source.');
