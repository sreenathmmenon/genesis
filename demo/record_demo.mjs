/**
 * Genesis Demo Recording Script
 * Playwright + chromium → captures each scene as a video
 * ffmpeg assembles the final MP4
 *
 * Run: node demo/record_demo.mjs
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUT_DIR, { recursive: true });

const FRONTEND = 'http://localhost:3000';
const BACKEND  = 'http://localhost:8001/api/v1';

// ── helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function apiPost(path, body = {}) {
  const r = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function apiGet(path) {
  const r = await fetch(`${BACKEND}${path}`);
  return r.json();
}

async function typeSlowly(locator, text, delayMs = 45) {
  await locator.click();
  for (const ch of text) {
    await locator.type(ch, { delay: delayMs });
  }
}

async function waitForRunToComplete(runId, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await apiGet(`/runs/${runId}`);
    if (run.status === 'completed' || run.status === 'failed') return run;
    await sleep(3000);
  }
  throw new Error('Run timed out');
}

// ── main ─────────────────────────────────────────────────────────────────────

console.log('🎬  Genesis Demo Recording');
console.log('   Frontend:', FRONTEND);
console.log('   Output:  ', OUT_DIR);
console.log('');

const browser = await chromium.launch({
  headless: false,
  args: ['--start-maximized'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: OUT_DIR,
    size: { width: 1440, height: 900 },
  },
});

const page = await context.newPage();

// ── SCENE 1: Dashboard — Command Center ──────────────────────────────────────
console.log('Scene 1: Dashboard');
await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
await sleep(3000);  // let stats load

// Slowly scroll to show recent runs + agents
await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
await sleep(2000);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await sleep(1500);

// ── SCENE 2: Templates — show the gallery ────────────────────────────────────
console.log('Scene 2: Templates');
await page.goto(`${FRONTEND}/templates`, { waitUntil: 'networkidle' });
await sleep(2500);

// Hover over PR Guardian card
const cards = page.locator('.template-card, [class*="card"]').first();
await cards.hover().catch(() => {});
await sleep(1500);

// Scroll through all templates
await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }));
await sleep(2000);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await sleep(1000);

// ── SCENE 3: Canvas — type intent and watch agents build ─────────────────────
console.log('Scene 3: Canvas — build a workflow');
// Navigate to a blank canvas (no workflow_id param) so the intent panel shows
await page.goto(`${FRONTEND}/canvas`, { waitUntil: 'networkidle' });
await sleep(2000);

// If the page auto-redirects to a workflow, click "New Build" to get back to intent panel
const urlAfterLoad = page.url();
if (urlAfterLoad.includes('workflow_id=')) {
  console.log('  → Auto-loaded workflow detected, opening New Build modal...');
  const newBuildBtn = page.locator('button').filter({ hasText: /new build|new agent|\+ new|build/i }).first();
  const hasNewBuild = await newBuildBtn.isVisible().catch(() => false);
  if (hasNewBuild) {
    await newBuildBtn.click();
    await sleep(1000);
  }
}

// Click the textarea / intent input (try both inline panel and modal)
const intentInput = page.locator('textarea').first();
await intentInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
await intentInput.click();
await sleep(500);

// Type the intent slowly so it looks human
const INTENT = 'Every Monday morning, research the top 5 AI breakthroughs from the past week, analyze their business impact, and write a structured brief I can share with my team.';
await typeSlowly(intentInput, INTENT, 40);
await sleep(1500);

// Click Build (match "Build with Genesis" or just "Build")
const buildBtn = page.locator('button').filter({ hasText: /build/i }).first();
await buildBtn.click();
console.log('  → Build started, watching pipeline...');
await sleep(2000);

// Watch build progress for up to 90s — the MonitorPanel/LiveFeed should show stages
const buildEnd = Date.now() + 90_000;
let deployed = false;
while (Date.now() < buildEnd) {
  // Check if we got redirected to a workflow (deploy happened)
  const url = page.url();
  if (url.includes('workflow_id=')) {
    deployed = true;
    console.log('  → Build deployed, workflow on canvas');
    break;
  }
  // Look for a "Deploy" button that signals build is done
  const deployVisible = await page.locator('button').filter({ hasText: /deploy/i }).isVisible().catch(() => false);
  if (deployVisible) {
    await sleep(2000); // pause so viewer sees the canvas with all nodes
    await page.locator('button').filter({ hasText: /deploy/i }).first().click();
    await sleep(3000);
    deployed = true;
    break;
  }
  await sleep(2000);
}

if (!deployed) {
  console.log('  → Build taking long, continuing...');
}
await sleep(3000);

// ── SCENE 4: Canvas — ReactFlow graph visible ─────────────────────────────────
console.log('Scene 4: ReactFlow canvas with agent nodes');
// The canvas should now show the workflow graph
await sleep(4000); // let fitView animate

// ── SCENE 5: My Agents page ───────────────────────────────────────────────────
console.log('Scene 5: My Agents');
await page.goto(`${FRONTEND}/workflows`, { waitUntil: 'networkidle' });
await sleep(2500);

// Find any deployed workflow and click Run Now
const runBtn = page.locator('button').filter({ hasText: /run now|▶ run/i }).first();
const hasRunBtn = await runBtn.isVisible().catch(() => false);
if (hasRunBtn) {
  console.log('  → Triggering Run Now...');
  await runBtn.click();
  await sleep(3000);
}

// ── SCENE 6: Trigger the market-research template run via API ─────────────────
// (ensures we have a real run to show in the trace)
console.log('Scene 6: Triggering a real multi-agent run for trace demo...');
let demoRunId = null;
try {
  // Deploy market-research template fresh
  const tmpl = await apiPost('/templates/market-research/deploy');
  const wfId = tmpl.workflow_id;
  console.log('  → Template workflow:', wfId);

  // Trigger run with a real topic
  const run = await apiPost(`/workflows/${wfId}/run`, {
    input_data: { topic: 'AI breakthroughs in healthcare 2025' }
  });
  demoRunId = run.run_id;
  console.log('  → Run started:', demoRunId);
} catch (e) {
  console.log('  → Could not start fresh run:', e.message);
}

// ── SCENE 7: History — show all past runs ─────────────────────────────────────
console.log('Scene 7: Run History');
await page.goto(`${FRONTEND}/history`, { waitUntil: 'networkidle' });
await sleep(2500);

// Expand the first run row
const firstRow = page.locator('table tbody tr, [class*="run-row"]').first();
const expandable = await firstRow.isVisible().catch(() => false);
if (expandable) {
  await firstRow.click().catch(() => {});
  await sleep(2000);
}

// ── SCENE 8: Navigate to a completed run detail — reasoning trace ─────────────
console.log('Scene 8: Run detail — reasoning trace');

// If demo run started, wait for it; otherwise find most recent completed run
let targetRunId = null;
if (demoRunId) {
  console.log('  → Waiting for demo run to complete (up to 90s)...');
  try {
    const finishedRun = await waitForRunToComplete(demoRunId, 90_000);
    targetRunId = demoRunId;
    console.log('  → Run finished:', finishedRun.status);
  } catch {
    console.log('  → Run still going, finding most recent completed run');
  }
}

if (!targetRunId) {
  // Find most recent completed run
  const runs = await apiGet('/runs/?limit=10&offset=0');
  const completed = Array.isArray(runs) ? runs.find(r => r.status === 'completed') : null;
  if (completed) {
    targetRunId = completed.id;
    console.log('  → Using existing run:', targetRunId);
  }
}

if (targetRunId) {
  await page.goto(`${FRONTEND}/runs/${targetRunId}`, { waitUntil: 'networkidle' });
  await sleep(2000);

  // Scroll through the reasoning trace slowly — the money shot
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
  await sleep(1500);
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
  await sleep(1500);
  await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'smooth' }));
  await sleep(2000);

  // Expand a tool_result if there's a "Show more" button
  const showMore = page.locator('button').filter({ hasText: /show more/i }).first();
  const hasShowMore = await showMore.isVisible().catch(() => false);
  if (hasShowMore) {
    await showMore.click();
    await sleep(1500);
  }

  // Scroll to agent output / conclusion
  await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'smooth' }));
  await sleep(2500);

  // Scroll to stats row at bottom
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await sleep(2000);
}

// ── SCENE 9: Inbox — Agent Inbox showing completed work ───────────────────────
console.log('Scene 9: Agent Inbox');
await page.goto(`${FRONTEND}/inbox`, { waitUntil: 'networkidle' });
await sleep(2500);

// Click the first inbox card to expand it
const inboxCard = page.locator('[class*="card"], article, [class*="inbox"]').first();
const hasCard = await inboxCard.isVisible().catch(() => false);
if (hasCard) {
  await inboxCard.click().catch(() => {});
  await sleep(2000);
}

// ── SCENE 10: AgentConfigPanel — show Limits & Memory, Channel ────────────────
console.log('Scene 10: Canvas → AgentConfigPanel → Limits & Memory');
await page.goto(`${FRONTEND}/canvas`, { waitUntil: 'networkidle' });
await sleep(2000);

// Click a node on the canvas if one exists
const reactflowNode = page.locator('.react-flow__node').first();
const hasNode = await reactflowNode.isVisible().catch(() => false);
if (hasNode) {
  await reactflowNode.click();
  await sleep(1500);

  // Scroll right panel to Limits & Memory section
  const limitsSection = page.locator('text=Limits & Memory').first();
  const hasLimits = await limitsSection.isVisible().catch(() => false);
  if (hasLimits) {
    await limitsSection.scrollIntoViewIfNeeded();
    await limitsSection.click(); // expand it
    await sleep(1500);
  }

  // Scroll to channel section
  const channelSection = page.locator('text=Output Channel').first();
  const hasChannel = await channelSection.isVisible().catch(() => false);
  if (hasChannel) {
    await channelSection.scrollIntoViewIfNeeded();
    await channelSection.click(); // expand
    await sleep(1500);
  }
}

// ── SCENE 11: Audit Log ───────────────────────────────────────────────────────
console.log('Scene 11: Audit Log');
await page.goto(`${FRONTEND}/audit`, { waitUntil: 'networkidle' });
await sleep(3000);

// Expand first audit entry detail
const firstEntry = page.locator('button').filter({ hasText: /view/i }).first();
const hasEntry = await firstEntry.isVisible().catch(() => false);
if (hasEntry) {
  await firstEntry.click().catch(() => {});
  await sleep(1500);
}

// ── SCENE 12: Return to Dashboard — full circle ───────────────────────────────
console.log('Scene 12: Return to Dashboard');
await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
await sleep(4000); // hold on dashboard — closing shot

// ── CLOSE ─────────────────────────────────────────────────────────────────────
console.log('\nClosing browser and assembling video...');
await context.close();
await browser.close();

// Find the recorded video file
const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.webm'));
if (files.length === 0) {
  console.error('No video file found in', OUT_DIR);
  process.exit(1);
}
files.sort((a, b) => fs.statSync(path.join(OUT_DIR, b)).mtime - fs.statSync(path.join(OUT_DIR, a)).mtime);
const rawVideo = path.join(OUT_DIR, files[0]);
console.log('Raw video:', rawVideo);

// Convert to MP4 with ffmpeg — clean, compressed, no re-encoding artifacts
const finalVideo = path.join(__dirname, 'genesis_demo.mp4');
const ffmpegCmd = [
  'ffmpeg', '-y',
  '-i', rawVideo,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '18',        // near-lossless quality
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  finalVideo,
].join(' ');

console.log('Converting to MP4...');
execSync(ffmpegCmd, { stdio: 'inherit' });

const sizeMB = (fs.statSync(finalVideo).size / 1024 / 1024).toFixed(1);
console.log(`\n✅  Demo saved: ${finalVideo} (${sizeMB} MB)`);
console.log('   Add voice-over in iMovie / CapCut / DaVinci Resolve');
