import fs from 'node:fs';
const html = fs.readFileSync('index.html', 'utf8');
const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
if (!jsonLd.length) throw new Error('No JSON-LD block found');
if (!jsonLd[0]['@graph']?.some((item) => item['@type'] === 'Organization')) throw new Error('Organization schema missing');
if (!jsonLd[0]['@graph']?.some((item) => item['@type'] === 'SocialNetworkingSite')) throw new Error('SocialNetworkingSite schema missing');
for (const file of ['robots.txt', 'sitemap.xml', 'assets/mimer-icon-original.png', 'assets/mimer-launch-original.jpg']) {
  if (!fs.existsSync(file)) throw new Error(`Missing SEO asset: ${file}`);
}
const robots = fs.readFileSync('robots.txt', 'utf8');
if (!robots.includes('Sitemap: https://mimer-23cf6.web.app/sitemap.xml')) throw new Error('Sitemap directive missing');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
if (!sitemap.includes('<loc>https://mimer-23cf6.web.app/</loc>')) throw new Error('Homepage missing from sitemap');
console.log('SEO validation passed: JSON-LD, robots.txt, sitemap.xml, and supplied brand assets are present.');
