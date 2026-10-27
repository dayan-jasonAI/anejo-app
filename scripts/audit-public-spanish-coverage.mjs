import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const output = path.join(root, 'docs/i18n/public-spanish-coverage-route-audit.json');

async function walk(dir) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) rows.push(full);
  }
  return rows;
}

function routeFor(file) {
  const rel = path.relative(publicRoot, file).split(path.sep).join('/');
  return '/' + rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
}

function esCompanion(route, knownRoutes) {
  if (route === '/es' || route.startsWith('/es/')) return null;
  const candidates = route === '/' ? ['/es', '/es/index'] : ['/es' + route];
  return candidates.find(candidate => knownRoutes.has(candidate)) || null;
}

export async function buildAudit() {
  const files = (await walk(publicRoot)).sort();
  const rows = await Promise.all(files.map(async file => {
    const html = await readFile(file, 'utf8');
    const route = routeFor(file);
    const isHub = route === '/hub' || route.startsWith('/hub/');
    const isStudio = route === '/studio' || route.startsWith('/studio/');
    const isTrainer = route === '/trainer' || route.startsWith('/trainer/');
    return {
      route,
      surface: isHub ? 'hub-excluded' : isStudio ? 'studio-react-review' : isTrainer ? 'trainer-review' : 'public-static',
      sharedEngine: html.includes('/assets/js/i18n.js'),
      hasExplicitToggleControl: /(?:id=["']langToggle["']|id=["']lang-toggle["']|AnejoLang\.set\s*\()/.test(html),
      authoredSpanishCompanion: null
    };
  }));
  const knownRoutes = new Set(rows.map(row => row.route));
  for (const row of rows) row.authoredSpanishCompanion = esCompanion(row.route, knownRoutes);
  const publicRows = rows.filter(row => row.surface !== 'hub-excluded');
  const counts = list => ({
    htmlRoutes: list.length,
    withSharedEngine: list.filter(row => row.sharedEngine).length,
    withoutSharedEngine: list.filter(row => !row.sharedEngine).length,
    withAuthoredSpanishCompanion: list.filter(row => row.authoredSpanishCompanion).length,
    withExplicitToggleControl: list.filter(row => row.hasExplicitToggleControl).length
  });
  return {
    auditDate: '2026-10-27',
    source: 'Repository static HTML route inventory; this does not establish deployed/live coverage.',
    routeRules: {
      excludedFromPublicTotals: '/hub/** (Hub localization is out of scope)',
      separateReviewSurfaces: ['/studio/** (React build; not covered by static page scan)', '/trainer/** (separate trainer app surfaces)'],
      authoredSpanishCompanion: 'A matching /es + route HTML file exists in this checkout; it is not evidence of an interactive language toggle.'
    },
    totals: {
      allHtmlRoutes: rows.length,
      publicNonHub: counts(publicRows),
      hubExcluded: counts(rows.filter(row => row.surface === 'hub-excluded')),
      studio: counts(rows.filter(row => row.surface === 'studio-react-review')),
      trainer: counts(rows.filter(row => row.surface === 'trainer-review'))
    },
    missingSharedEnginePublicRoutes: publicRows.filter(row => !row.sharedEngine).map(row => row.route),
    missingExplicitTogglePublicRoutes: publicRows.filter(row => !row.hasExplicitToggleControl).map(row => row.route),
    separateSurfaceRoutes: rows.filter(row => row.surface === 'studio-react-review' || row.surface === 'trainer-review'),
    routes: rows
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const audit = await buildAudit();
  if (process.argv.includes('--write')) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(audit, null, 2) + '\n');
    console.log(output);
  } else {
    console.log(JSON.stringify(audit, null, 2));
  }
}
