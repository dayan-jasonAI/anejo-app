import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

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

function extractObject(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Dictionary marker not found: ${marker}`);
  const open = source.indexOf('{', markerAt);
  let depth = 0, quote = null, escaped = false, comment = null;
  for (let i = open; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === 'line') { if (c === '\n') comment = null; continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return runInNewContext(`(${source.slice(open, i + 1)})`);
  }
  throw new Error(`Unterminated dictionary object: ${marker}`);
}

const HTML_ENTITIES = { amp: '&', gt: '>', lt: '<', middot: '·', nbsp: '\u00a0', ntilde: 'ñ', quot: '"', rarr: '→', '#39': "'" };
function decodeHtml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === '#') {
      const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

function staticTextNodes(html) {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tokens = [];
  for (let i = 0; i < cleaned.length;) {
    if (cleaned[i] !== '<') {
      const next = cleaned.indexOf('<', i);
      const end = next < 0 ? cleaned.length : next;
      tokens.push(cleaned.slice(i, end));
      i = end;
      continue;
    }
    let quote = null, end = i + 1;
    for (; end < cleaned.length; end++) {
      const c = cleaned[end];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '>') { end++; break; }
    }
    tokens.push(cleaned.slice(i, end));
    i = end;
  }
  const stack = [], nodes = [];
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const attrs = raw => Object.fromEntries([...raw.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(m => [m[1].toLowerCase(), decodeHtml(m[2] ?? m[3] ?? m[4] ?? '')]));
  for (const token of tokens) {
    if (token.startsWith('</')) {
      const tag = token.slice(2).match(/^\s*([\w:-]+)/)?.[1]?.toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) { const popped = stack.pop(); if (popped.tag === tag) break; }
      continue;
    }
    if (token.startsWith('<')) {
      if (/^<!|^<\?/.test(token)) continue;
      const tag = token.match(/^<\s*([\w:-]+)/)?.[1]?.toLowerCase();
      if (!tag) continue;
      const a = attrs(token.slice(tag.length + 1));
      if (a.translate === 'no' || stack.some(x => x.translateNo)) {
        if (!voidTags.has(tag) && !/\/\s*>$/.test(token)) stack.push({ tag, translateNo: true });
        continue;
      }
      const location = stack.map(x => `${x.tag}${x.id ? `#${x.id}` : ''}${x.className ? `.${x.className.replace(/\s+/g, '.')}` : ''}`).join('>');
      for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
        if (a[attr]?.trim()) nodes.push({ value: a[attr].replace(/\s+/g, ' ').trim(), path: `${location}>@${attr}` });
      }
      if (tag === 'html' && a.lang) nodes.push({ value: `__HTML_LANG__${a.lang.toLowerCase()}`, path: '__html-lang' });
      if (!voidTags.has(tag) && !/\/\s*>$/.test(token)) stack.push({ tag, id: a.id || '', className: a.class || '', translateNo: false });
      continue;
    }
    if (stack.some(x => x.translateNo)) continue;
    const value = decodeHtml(token).replace(/\s+/g, ' ').trim();
    if (value) nodes.push({ value, path: stack.map(x => `${x.tag}${x.id ? `#${x.id}` : ''}${x.className ? `.${x.className.replace(/\s+/g, '.')}` : ''}`).join('>') || '#document' });
  }
  return nodes;
}

function englishCompanion(esRoute) {
  const explicit = {
    '/es': '/',
    '/es/catering/areas-de-servicio': '/catering/service-areas',
    '/es/catering-mediterraneo': '/mediterranean-catering',
    '/es/comida-cubana': '/cuban-food'
  };
  return explicit[esRoute] || (esRoute.startsWith('/es/') ? esRoute.slice(3) : null);
}

function groupedMissing(rows, known, lang) {
  const grouped = new Map();
  let occurrences = 0;
  for (const row of rows) {
    for (const node of row.staticTextNodes) {
      if (node.path === '__html-lang' || node.value.startsWith('__HTML_LANG__')) continue;
      const source = row.route.startsWith('/es/') || row.route === '/es' ? 'es' : 'en';
      if (source !== lang || known.has(node.value)) continue;
      occurrences++;
      const item = grouped.get(node.value) || { text: node.value, count: 0, routes: new Set(), paths: new Set() };
      item.count++; item.routes.add(row.route); item.paths.add(node.path); grouped.set(node.value, item);
    }
  }
  return { uniqueStrings: grouped.size, occurrences, strings: [...grouped.values()].map(item => ({ ...item, routes: [...item.routes].sort(), paths: [...item.paths].sort() })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)) };
}

export async function buildAudit() {
  const files = (await walk(publicRoot)).sort();
  const rows = await Promise.all(files.map(async file => {
    const html = await readFile(file, 'utf8');
    const route = routeFor(file);
    const textNodes = staticTextNodes(html);
    const isHub = route === '/hub' || route.startsWith('/hub/');
    const isStudio = route === '/studio' || route.startsWith('/studio/');
    const isTrainer = route === '/trainer' || route.startsWith('/trainer/');
    return {
      route,
      surface: isHub ? 'hub-excluded' : isStudio ? 'studio-react-review' : isTrainer ? 'trainer-review' : 'public-static',
      sharedEngine: html.includes('/assets/js/i18n.js'),
      hasExplicitToggleControl: /(?:id=["']langToggle["']|id=["']lang-toggle["']|AnejoLang\.set\s*\()/.test(html),
      authoredSpanishCompanion: null,
      staticTextNodes: textNodes
    };
  }));
  const knownRoutes = new Set(rows.map(row => row.route));
  for (const row of rows) row.authoredSpanishCompanion = esCompanion(row.route, knownRoutes);
  const publicRows = rows.filter(row => row.surface !== 'hub-excluded');
  const publicMaps = {};
  const coreSource = await readFile(path.join(publicRoot, 'assets/js/i18n.js'), 'utf8');
  const cateringSource = await readFile(path.join(publicRoot, 'assets/js/catering-i18n.js'), 'utf8');
  const coverageSource = await readFile(path.join(publicRoot, 'assets/js/public-i18n-coverage.js'), 'utf8');
  Object.assign(publicMaps, extractObject(coreSource, 'var ES ='), extractObject(cateringSource, 'var es ='));
  let coverageMap, coverageAliases = {};
  runInNewContext(coverageSource, { window: { AnejoI18n: {
    extend(value) { coverageMap = value; },
    extendAliases(value) { coverageAliases = value; }
  } } });
  Object.assign(publicMaps, coverageMap || {});
  const englishDictionary = new Set(Object.keys(publicMaps));
  const spanishDictionary = new Set([...Object.values(publicMaps), ...Object.keys(coverageAliases)]);
  const spanishValueCounts = new Map();
  Object.values(publicMaps).forEach(value => spanishValueCounts.set(value, (spanishValueCounts.get(value) || 0) + 1));
  const missingEnglish = groupedMissing(publicRows, englishDictionary, 'en');
  const missingSpanish = groupedMissing(publicRows, spanishDictionary, 'es');
  const byRoute = new Map(rows.map(row => [row.route, row]));
  const paired = { matchedRoutes: 0, structurallyAlignedRoutes: 0, partiallyAlignedRoutes: [], structurallyUnalignedRoutes: [], matchedPathGroups: 0, candidateTextPairs: 0, uniqueEnglishKeys: 0, existingDictionaryConflicts: [], duplicateEnglishSourceConflicts: [], missingDictionaryCandidates: [], authoredSourcePairs: [] };
  const candidateMap = new Map();
  const sourcePairMap = new Map();
  for (const spanishRow of rows.filter(row => row.route === '/es' || row.route.startsWith('/es/'))) {
    const englishRoute = englishCompanion(spanishRow.route);
    const englishRow = englishRoute && byRoute.get(englishRoute);
    if (!englishRow) continue;
    paired.matchedRoutes++;
    const englishNodes = englishRow.staticTextNodes.filter(node => node.path !== '__html-lang');
    const spanishNodes = spanishRow.staticTextNodes.filter(node => node.path !== '__html-lang');
    const group = nodes => {
      const result = new Map();
      for (const node of nodes) { if (!result.has(node.path)) result.set(node.path, []); result.get(node.path).push(node.value); }
      return result;
    };
    const enGroups = group(englishNodes), esGroups = group(spanishNodes);
    const candidateCountBefore = paired.candidateTextPairs;
    let hasUnalignedGroup = false;
    for (const [nodePath, enValues] of enGroups) {
      const esValues = esGroups.get(nodePath);
      if (!esValues || enValues.length !== esValues.length) { hasUnalignedGroup = true; continue; }
      paired.matchedPathGroups++;
      for (let i = 0; i < enValues.length; i++) {
        const en = enValues[i], es = esValues[i];
        if (en === es) continue;
        paired.candidateTextPairs++;
        const pairKey = JSON.stringify({ english: en, spanish: es });
        const sourcePair = sourcePairMap.get(pairKey) || { english: en, spanish: es, routes: new Set(), paths: new Set() };
        sourcePair.routes.add(spanishRow.route);
        sourcePair.paths.add(nodePath);
        sourcePairMap.set(pairKey, sourcePair);
        if (candidateMap.has(en) && candidateMap.get(en).translation !== es) {
          paired.duplicateEnglishSourceConflicts.push({ english: en, firstSpanish: candidateMap.get(en).translation, alternateSpanish: es, route: spanishRow.route });
        } else if (!candidateMap.has(en)) candidateMap.set(en, { translation: es, routes: new Set() });
        candidateMap.get(en)?.routes.add(spanishRow.route);
        if (publicMaps[en] !== undefined && publicMaps[en] !== es) paired.existingDictionaryConflicts.push({ english: en, existingSpanish: publicMaps[en], pairedSpanish: es, route: spanishRow.route });
        if (publicMaps[en] === undefined) paired.missingDictionaryCandidates.push({ english: en, spanish: es, route: spanishRow.route, path: nodePath });
      }
    }
    if (!hasUnalignedGroup && englishNodes.length === spanishNodes.length && englishNodes.every((node, i) => node.path === spanishNodes[i].path)) paired.structurallyAlignedRoutes++;
    else if (paired.candidateTextPairs > candidateCountBefore) paired.partiallyAlignedRoutes.push({ english: englishRoute, spanish: spanishRow.route, englishNodes: englishNodes.length, spanishNodes: spanishNodes.length });
    else paired.structurallyUnalignedRoutes.push({ english: englishRoute, spanish: spanishRow.route, englishNodes: englishNodes.length, spanishNodes: spanishNodes.length });
  }
  paired.uniqueEnglishKeys = candidateMap.size;
  paired.authoredSourcePairs = [...sourcePairMap.values()].map(row => ({
    english: row.english,
    spanish: row.spanish,
    routes: [...row.routes].sort(),
    paths: [...row.paths].sort()
  })).sort((a, b) => a.english.localeCompare(b.english) || a.spanish.localeCompare(b.spanish));
  paired.structurallyUnalignedRoutes.sort((a, b) => a.spanish.localeCompare(b.spanish));
  paired.partiallyAlignedRoutes.sort((a, b) => a.spanish.localeCompare(b.spanish));
  paired.existingDictionaryConflicts = [...new Map(paired.existingDictionaryConflicts.map(row => [JSON.stringify({ english: row.english, existingSpanish: row.existingSpanish, pairedSpanish: row.pairedSpanish }), row])).values()];
  paired.duplicateEnglishSourceConflicts = [...new Map(paired.duplicateEnglishSourceConflicts.map(row => [JSON.stringify(row), row])).values()];
  paired.missingDictionaryCandidates = [...new Map(paired.missingDictionaryCandidates.map(row => [JSON.stringify({ english: row.english, spanish: row.spanish }), row])).values()];
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
    staticTextAudit: {
      method: 'Visible HTML text nodes plus placeholder/title/aria-label attributes; excludes script, style, SVG, translate=no, and Hub. Exact literal lookup against the merged authored EN→ES dictionaries; it does not include dynamically rendered JavaScript strings.',
      publicTextNodeCount: publicRows.reduce((sum, row) => sum + row.staticTextNodes.length, 0),
      dictionaryCounts: { englishEntries: englishDictionary.size, distinctSpanishValues: spanishDictionary.size, inverseOnlyAliases: Object.keys(coverageAliases).length, repeatedSpanishValues: [...spanishValueCounts.values()].filter(count => count > 1).length },
      inverseOnlyAliases: coverageAliases,
      pairedRouteAnalysis: paired,
      englishTextNotMatchedToDictionary: missingEnglish,
      spanishTextNotMatchedToInverseDictionary: missingSpanish
    },
    routes: rows.map(({ staticTextNodes: _staticTextNodes, ...row }) => row)
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
