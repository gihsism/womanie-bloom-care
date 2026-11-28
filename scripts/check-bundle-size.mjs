#!/usr/bin/env node
// First-load JavaScript per route, gzip, from the production build.
//
// "First load" = the entry chunk and everything it imports statically
// (what the browser must download before the landing page can paint), plus,
// for an app route, that route's lazy page chunk and its static imports.
// Dynamic imports (lazy dialogs, tabs, the Log sheet...) are not counted.
//
// Reads dist/.vite/manifest.json (vite.config.ts sets build.manifest).
// Usage:
//   node scripts/check-bundle-size.mjs           # table + budget check (exit 1 if over)
//   node scripts/check-bundle-size.mjs --all     # every lazy page, not only the budgeted ones
//   node scripts/check-bundle-size.mjs --json    # machine-readable
// Run `npm run build` first, or `npm run size:build` to do both.
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const DIST = path.resolve(process.argv.find((a) => a.startsWith("--dist="))?.slice(7) ?? "dist");
const MANIFEST = path.join(DIST, ".vite", "manifest.json");

// Budgets in KB gzip, ~10% above the sizes after reliability round 3
// (2026-11-28: landing 108.9 KB, Home 142.0 KB, Home + heaviest hero
// 158.6 KB). Raise them only on purpose, with the reason in the commit.
export const BUDGETS = {
  landing: 120,
  home: 156,
  homeWithHero: 174,
};

// Home's per-stage heroes (lazy in src/pages/PatientDashboard.tsx).
const HOME_HEROES = [
  "src/components/dashboard/ModeHeroStat.tsx",
  "src/components/dashboard/PregnancyBodyMap.tsx",
  "src/components/dashboard/BabyBodyMap.tsx",
  "src/components/dashboard/CycleDialHero.tsx",
  "src/components/dashboard/PillRingHero.tsx",
  "src/components/dashboard/MenopauseBodyMap.tsx",
  "src/components/dashboard/IVFTimelineHero.tsx",
];

// Route name -> source file of its lazy page (as in src/App.tsx).
const PAGES = {
  home: "src/pages/PatientDashboard.tsx",
  login: "src/pages/auth/PatientLogIn.tsx",
  stage: "src/pages/dashboard/StagePage.tsx",
  records: "src/pages/MedicalHistory.tsx",
  askAI: "src/pages/AIDoctorChat.tsx",
  visits: "src/pages/dashboard/Appointments.tsx",
  settings: "src/pages/dashboard/Settings.tsx",
  library: "src/pages/ResearchLibrary.tsx",
  findDoctor: "src/pages/FindDoctor.tsx",
  doctorDashboard: "src/pages/doctor/DoctorDashboard.tsx",
  doctorPatient: "src/pages/doctor/PatientDetails.tsx",
};

if (!existsSync(MANIFEST)) {
  console.error(`No ${path.relative(process.cwd(), MANIFEST)}. Run \`npm run build\` first.`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const gzCache = new Map();
const gz = (file) => {
  if (!gzCache.has(file)) gzCache.set(file, gzipSync(readFileSync(path.join(DIST, file))).length);
  return gzCache.get(file);
};

/** Static import closure of a manifest key -> set of output .js files. */
function closure(key, seen = new Set()) {
  const e = manifest[key];
  if (!e || seen.has(key)) return seen;
  seen.add(key);
  for (const imp of e.imports ?? []) closure(imp, seen);
  return seen;
}
const files = (keys) => new Set([...keys].map((k) => manifest[k].file).filter((f) => f.endsWith(".js")));
const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const sum = (set) => [...set].reduce((n, f) => n + gz(f), 0);

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
const shell = files(closure(entryKey));
const rows = [{ route: "landing", kb: kb(sum(shell)), files: shell.size }];

const all = process.argv.includes("--all");
const pageKeys = all
  ? Object.fromEntries(
      Object.keys(manifest)
        .filter((k) => manifest[k].isDynamicEntry && k.startsWith("src/pages/"))
        .map((k) => [Object.entries(PAGES).find(([, v]) => v === k)?.[0] ?? k.replace(/^src\/pages\//, ""), k]),
    )
  : PAGES;
// A page chunk is usually keyed by its source path; Rollup sometimes keys it
// "_<Name>-<hash>.js" instead (no facade path), so fall back to the chunk name.
const resolvePage = (src) =>
  manifest[src]?.isDynamicEntry
    ? src
    : Object.keys(manifest).find(
        (k) => manifest[k].isDynamicEntry && manifest[k].name === path.basename(src).replace(/\.tsx?$/, ""),
      );
for (const [route, src] of Object.entries(pageKeys)) {
  const key = resolvePage(src);
  if (!key) {
    console.error(`Page ${src} (${route}) is not in the build manifest - update PAGES in ${path.basename(import.meta.url)}.`);
    process.exit(2);
  }
  const set = new Set([...shell, ...files(closure(key))]);
  rows.push({ route, kb: kb(sum(set)), files: set.size });
  // Home shows its skeleton until her stage's hero (a lazy chunk) is in, so
  // the heaviest Home + hero pair is budgeted too.
  if (route === "home") {
    let worst = null;
    for (const hero of HOME_HEROES) {
      const heroKey = resolvePage(hero);
      if (!heroKey) {
        console.error(`Hero ${hero} is not in the build manifest - update HOME_HEROES in ${path.basename(import.meta.url)}.`);
        process.exit(2);
      }
      const withHero = new Set([...set, ...files(closure(heroKey))]);
      const size = sum(withHero);
      if (!worst || size > worst.size) worst = { size, files: withHero.size, name: path.basename(hero, ".tsx") };
    }
    rows.push({ route: "homeWithHero", kb: kb(worst.size), files: worst.files, note: `heaviest: ${worst.name}` });
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log("First-load JS (gzip, incl. the landing shell)");
  for (const r of rows) {
    const budget = BUDGETS[r.route];
    console.log(
      `  ${r.route.padEnd(28)} ${String(r.kb).padStart(7)} KB  ${String(r.files).padStart(3)} files` +
        (budget ? `   budget ${budget} KB` : "") +
        (r.note ? `   (${r.note})` : ""),
    );
  }
}

const over = rows.filter((r) => BUDGETS[r.route] && r.kb > BUDGETS[r.route]);
if (over.length) {
  for (const r of over) console.error(`OVER BUDGET: ${r.route} ${r.kb} KB > ${BUDGETS[r.route]} KB`);
  process.exit(1);
}
