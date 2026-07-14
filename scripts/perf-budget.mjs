#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Performance budget gate (Phase 5).
//
// Guards the route-level code-splitting + vendor-chunking wins (§16) from
// silently regressing. Reads the built frontend bundle and fails (exit 1) if
// any category is over budget — e.g. a stray `import` that un-splits a route,
// or a heavy dependency that balloons a vendor chunk.
//
// No external dependencies; runs on the raw byte size of the emitted .js in
// the Vite output. Budgets are set with generous headroom over the current
// sizes so this catches real regressions, not normal drift. When an intended
// change legitimately grows a bundle, bump the matching budget here in the
// same PR — that keeps the budget an explicit, reviewed decision.
// ---------------------------------------------------------------------------
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "artifacts",
  "riviera-bms",
  "dist",
  "public",
  "assets",
);

// Raw-byte budgets (KB). Current sizes for reference are in parentheses.
const KB = 1024;
const BUDGETS = {
  entry: 100 * KB,   // index-*.js — the app shell (~66KB)
  vendor: 230 * KB,  // each vendor-*.js chunk (~181KB largest)
  route: 60 * KB,    // any single lazily-loaded page/component chunk (~15KB largest)
  totalJs: 950 * KB, // sum of all .js (~700KB)
};

function categorize(name) {
  if (/^index-.*\.js$/.test(name)) return "entry";
  if (/^vendor.*\.js$/.test(name)) return "vendor";
  return "route";
}

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`✗ perf-budget: build output not found at ${ASSETS_DIR}\n  Run the frontend build first.`);
  process.exit(1);
}

// A dir with zero .js means a partial/misconfigured build (or a changed Vite
// assetsDir). Passing here would silently disable the guard rail, so fail loud.
if (files.length === 0) {
  console.error(`✗ perf-budget: no .js files found in ${ASSETS_DIR}\n  The build produced no bundle — nothing to check.`);
  process.exit(1);
}

const violations = [];
let totalJs = 0;
const rows = [];

for (const name of files) {
  const size = statSync(join(ASSETS_DIR, name)).size;
  totalJs += size;
  const cat = categorize(name);
  const limit = BUDGETS[cat];
  const over = size > limit;
  if (over) violations.push({ name, cat, size, limit });
  rows.push({ name, cat, size, limit, over });
}

if (totalJs > BUDGETS.totalJs) {
  violations.push({ name: "TOTAL .js", cat: "totalJs", size: totalJs, limit: BUDGETS.totalJs });
}

const kb = (n) => (n / KB).toFixed(1).padStart(7) + " KB";
rows.sort((a, b) => b.size - a.size);

console.log("Performance budget — frontend bundle\n");
console.log("  size        budget   status  file");
for (const r of rows) {
  console.log(`  ${kb(r.size)}  ${kb(r.limit)}   ${r.over ? "OVER  " : "ok    "}  ${r.name}  [${r.cat}]`);
}
console.log(`\n  ${kb(totalJs)}  ${kb(BUDGETS.totalJs)}   ${totalJs > BUDGETS.totalJs ? "OVER  " : "ok    "}  TOTAL .js`);

if (violations.length > 0) {
  console.error(`\n✗ Performance budget exceeded (${violations.length}):`);
  for (const v of violations) {
    console.error(`  - ${v.name} [${v.cat}] is ${kb(v.size).trim()} (budget ${kb(v.limit).trim()})`);
  }
  console.error(
    "\n  If this growth is intended, raise the matching budget in scripts/perf-budget.mjs in this PR.",
  );
  process.exit(1);
}

console.log("\n✓ All bundle sizes within budget.");
