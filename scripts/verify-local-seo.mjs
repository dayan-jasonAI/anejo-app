import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const site = 'https://anejocateringco.com';
const expectedCityPages = 140;
const requiredUrls = [
  `${site}/`,
  `${site}/catering`,
  `${site}/catering/service-areas`,
  `${site}/catering/west-palm-beach`,
  `${site}/catering/fort-lauderdale`,
  `${site}/catering/hollywood`,
  `${site}/catering/boca-raton`,
  `${site}/cuban-food`,
  `${site}/mediterranean-catering`,
  `${site}/es/comida-cubana`,
  `${site}/es/catering/west-palm-beach`,
  `${site}/es/catering/fort-lauderdale`,
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function fail(message, context = '') {
  console.error(context ? `${message}: ${context}` : message);
  process.exitCode = 1;
}

function extractJsonLd(html, file) {
  const blocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      fail('Invalid JSON-LD', `${file} (${error.message})`);
    }
  }
  return blocks.length;
}

const htmlFiles = (await walk(publicDir)).filter((file) => file.endsWith('.html'));
let jsonLdBlocks = 0;
let indexedPages = 0;
let missingCanonical = 0;
for (const file of htmlFiles) {
  const rel = path.relative(publicDir, file).replaceAll(path.sep, '/');
  const html = await fs.readFile(file, 'utf8');
  const isPrivate = /^(hub|client|trainer|prototype|studio)\//.test(rel) || ['login.html', 'portal.html', 'go.html', 'intake.html', 'plan.html'].includes(rel);
  const noindex = /name=["']robots["'][^>]+noindex/i.test(html);
  jsonLdBlocks += extractJsonLd(html, rel);
  if (!isPrivate && !noindex && rel !== '404.html') {
    indexedPages += 1;
    if (!/<link\s+rel=["']canonical["']\s+href=["']https:\/\/anejocateringco\.com/i.test(html)) {
      missingCanonical += 1;
      fail('Indexable page missing canonical', rel);
    }
    if (!/<title>[^<]{20,70}<\/title>/i.test(html)) fail('Indexable page title length outside target range', rel);
    if (!/<meta\s+name=["']description["']\s+content=["'][^"']{80,170}["']/i.test(html)) fail('Indexable page description length outside target range', rel);
  }
}

const cateringPages = htmlFiles.filter((file) => path.relative(publicDir, file).replaceAll(path.sep, '/').match(/^(es\/)?catering\/(?!service-areas|areas-de-servicio)[^/]+\.html$/));
if (cateringPages.length !== expectedCityPages) fail('Unexpected city catering page count', String(cateringPages.length));

const sitemap = await fs.readFile(path.join(publicDir, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
for (const url of requiredUrls) {
  if (!sitemapUrls.includes(url)) fail('Required URL missing from sitemap', url);
}
for (const forbidden of ['/hub/', '/client/', '/trainer/', '/prototype/', '/login', '/portal']) {
  if (sitemap.includes(forbidden)) fail('Private URL present in sitemap', forbidden);
}

const robots = await fs.readFile(path.join(publicDir, 'robots.txt'), 'utf8');
for (const disallow of ['/hub/', '/client/', '/trainer/', '/api/']) {
  if (!robots.includes(`Disallow: ${disallow}`)) fail('robots.txt missing private disallow', disallow);
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    indexedPages,
    cateringPages: cateringPages.length,
    sitemapUrls: sitemapUrls.length,
    jsonLdBlocks,
    missingCanonical,
  }, null, 2));
}
