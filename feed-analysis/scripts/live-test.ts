import { mkdir, writeFile } from 'node:fs/promises';
import { FeedAnalysis } from '../src/feed-service';
import { safeError } from '../src/core';
import { SAMPLES } from '../src/samples';
import { createRuntime } from './runtime';
import assert from 'node:assert/strict';
const runtime = createRuntime();
try {
  const results = [];
  for (const post of SAMPLES) {
    const started = performance.now();
    const analysis = await runtime.runPromise(FeedAnalysis.use(s => s.analyze(post.text)));
    results.push({ ...post, analysis, elapsedMs: Math.round(performance.now() - started) });
    console.log(JSON.stringify({ id: post.id, ...analysis, elapsedMs: results.at(-1)!.elapsedMs }));
  }
  const stories = await runtime.runPromise(FeedAnalysis.use(s => s.cluster(SAMPLES.map(({ id, text }) => ({ id, text })))));
  const customRules = [];
  const runningRules = 'Turn down running updates. Keep everything else, including ragebait and hype.';
  for (const [post, rules] of [
    [SAMPLES[4], runningRules],
    [SAMPLES[1], runningRules],
    [SAMPLES[4], 'Turn down running updates, except recovery milestones. Keep posts about returning to pain-free running.'],
  ] as const) {
    const analysis = await runtime.runPromise(FeedAnalysis.use(s => s.analyze(post.text, rules)));
    customRules.push({ id: post.id, rules, turnDown: analysis.turnDown, model: analysis.model });
  }
  assert.ok(customRules[0].turnDown > .8 && customRules[1].turnDown < .2 && customRules[2].turnDown < .2, 'Live rules should change the target and honor the explicit keep exception.');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/live-results.json', JSON.stringify({ at: new Date().toISOString(), synthetic: true, results, stories, customRules }, null, 2));
  console.log(JSON.stringify({ storyGroups: stories.map(s => s.postIds) }));
  console.log(JSON.stringify({ customRules }));
} catch (error) { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; }
finally { await runtime.dispose(); }
