import https from 'https';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const REPO = 'zamorinestate/estate-erp';
const PR_NUMBER = 5;

function ghRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(`https://api.github.com/repos/${REPO}${endpoint}`, {
      method,
      headers: {
        'User-Agent': 'Zamorin-ERP-Agent',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function checkAndMerge() {
  console.log(`Checking status for PR #${PR_NUMBER}...`);
  const prRes = await ghRequest('GET', `/pulls/${PR_NUMBER}`);
  const headSha = prRes.data.head?.sha;
  console.log('Head SHA:', headSha);

  const checkRuns = await ghRequest('GET', `/commits/${headSha}/check-runs`);
  console.log('Check runs count:', checkRuns.data.total_count);
  for (const run of (checkRuns.data.check_runs || [])) {
    console.log(` - [${run.name}]: status=${run.status}, conclusion=${run.conclusion}`);
  }

  const allPassed = (checkRuns.data.check_runs || []).length > 0 &&
    checkRuns.data.check_runs.every(r => r.status === 'completed' && r.conclusion === 'success');

  if (allPassed) {
    console.log('All checks passed! Merging PR...');
    const mergeRes = await ghRequest('PUT', `/pulls/${PR_NUMBER}/merge`, {
      commit_title: `fix(perf): eliminate white screen flash, remove Clear-Site-Data header, and enable instant login pre-render (#${PR_NUMBER})`,
      merge_method: 'squash'
    });
    console.log('Merge Result:', mergeRes.status, mergeRes.data);
    return true;
  } else {
    console.log('Waiting for checks to complete...');
    return false;
  }
}

async function loop() {
  for (let i = 0; i < 30; i++) {
    const done = await checkAndMerge();
    if (done) break;
    await new Promise(r => setTimeout(r, 10000));
  }
}

loop().catch(console.error);
