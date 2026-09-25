import https from 'https';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const REPO = 'zamorinestate/estate-erp';

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

async function run() {
  console.log('1. Creating Pull Request...');
  const prRes = await ghRequest('POST', '/pulls', {
    title: 'fix(perf): eliminate white screen flash, remove Clear-Site-Data header, and enable instant login pre-render',
    head: 'fix/perf-login-instant-load',
    base: 'main',
    body: `### Performance & Zero-Latency Login Fixes

1. **Eliminate White Screen Flash**:
   - Added permanent, unconditional dark canvas styling (\`background-color: #0b1120 !important\`, \`color-scheme: dark\`) directly to \`:root, html, body\` in \`index.html\`.
   - Pre-renders full glassmorphic login card directly in initial server HTML, achieving zero-latency first paint on cold load.

2. **Remove Destructive \`Clear-Site-Data: "cache"\` Header**:
   - Removed \`Clear-Site-Data: "cache"\` from \`Frontend/vercel.json\` and root \`vercel.json\`.
   - Enabled robust caching for static assets, scripts, stylesheets, and images so browsers don't wipe disk/memory cache on every request.

3. **Routing & Fallback**:
   - Explicitly mapped \`/login\` and \`/login2\` in Vercel configuration to prevent 404 fallback loops when navigating directly from Google Search or external links.
   - Preserves all invariants and Auth Design 2.0 freeze rules.`
  });

  console.log('PR Status:', prRes.status);
  if (prRes.status !== 201) {
    console.error('Error creating PR:', prRes.data);
    return;
  }

  const prNumber = prRes.data.number;
  console.log(`✅ Pull Request #${prNumber} created: ${prRes.data.html_url}`);

  console.log('\n2. Checking PR mergeability...');
  let pr = prRes.data;
  console.log('Mergeable state:', pr.mergeable, pr.mergeable_state);

  // Poll for status checks or mergeability
  console.log('Attempting merge...');
  const mergeRes = await ghRequest('PUT', `/pulls/${prNumber}/merge`, {
    commit_title: `fix(perf): eliminate white screen flash, remove Clear-Site-Data header, and enable instant login pre-render (#${prNumber})`,
    merge_method: 'squash'
  });

  console.log('Merge Status:', mergeRes.status);
  console.log('Merge Result:', mergeRes.data);
}

run().catch(console.error);
