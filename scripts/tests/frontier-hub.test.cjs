'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '../..');
const hubRoot = path.join(repoRoot, 'その他/frontier-atlas-hub');
const html = fs.readFileSync(path.join(hubRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(hubRoot, 'app.css'), 'utf8');

const HUB_URL = 'http://127.0.0.1:8084/その他/frontier-atlas-hub/';
const BLENDER_URL = 'http://127.0.0.1:8083/その他/frontier-atlas-blender/';
const EXISTING_LINKS = {
  starship: 'http://127.0.0.1:8080/',
  rsi: 'http://127.0.0.1:8081/',
  'space-dc': 'http://127.0.0.1:8082/'
};
const CATEGORY_CONTRACT = [
  { id: 'field-life', category: 'life', title: '生命', slugs: ['optogenetics', 'crispr', 'protein-ai'] },
  { id: 'field-energy', category: 'energy', title: 'エネルギー', slugs: ['fusion', 'solid-battery', 'perovskite'] },
  { id: 'field-ai', category: 'ai', title: 'AI / 情報', slugs: ['rsi', 'autonomous-lab', 'quantum', 'physical-ai'] },
  { id: 'field-space', category: 'space', title: '宇宙', slugs: ['neutrino', 'hwo', 'mars', 'starship', 'space-dc'] },
  { id: 'field-chemistry', category: 'chemistry', title: '化学', slugs: ['chirality'] }
];
const EXPECTED_SLUGS = CATEGORY_CONTRACT.flatMap(category => category.slugs);

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([a-zA-Z][\w:-]*)="([^"]*)"/g)].map(match => [match[1], match[2]])
  );
}

function cardsIn(markup) {
  return [...markup.matchAll(/<article\b([^>]*\bclass="atlas-card"[^>]*)>([\s\S]*?)<\/article>/g)].map(match => ({
    attributes: attributes(match[1]),
    body: match[2]
  }));
}

function textContent(markup) {
  return markup
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cardLink(card) {
  const match = card.body.match(/<a\b([^>]*\bclass="card-link"[^>]*)>/);
  assert.ok(match, `${card.attributes['data-slug']} has a card link`);
  return attributes(match[1]);
}

const cards = cardsIn(html);

test('the hub renders exactly the 16 contracted cards in category order', () => {
  assert.equal(cards.length, 16);
  assert.deepEqual(cards.map(card => card.attributes['data-slug']), EXPECTED_SLUGS);
  assert.equal(new Set(EXPECTED_SLUGS).size, 16);

  cards.forEach((card, index) => {
    const slug = EXPECTED_SLUGS[index];
    const name = card.body.match(/<h3>([^<]+)<\/h3>/);
    const description = card.body.match(/<p class="card-description">([^<]+)<\/p>/);
    const stage = card.body.match(/<div class="card-stage"><span>研究段階<\/span><strong>([^<]+)<\/strong><\/div>/);
    const number = card.body.match(/<span class="card-number">([^<]+)<\/span>/);

    assert.ok(name && name[1].trim().length > 0, `${slug} has a name`);
    assert.ok(description && textContent(description[1]).length >= 20, `${slug} has a short description`);
    assert.ok(stage && stage[1].trim().length > 0, `${slug} has a research stage`);
    assert.equal(textContent(number[1]), String(index + 1).padStart(2, '0'));
    assert.equal(card.attributes['data-status'], Object.hasOwn(EXISTING_LINKS, slug) ? 'existing' : 'new');
    assert.equal(textContent(card.body.match(/<span class="status [^"]+">([^<]+)<\/span>/)[1]), Object.hasOwn(EXISTING_LINKS, slug) ? '既存' : '新規');
  });
});

test('the five field sections contain the expected Japanese titles and card sets', () => {
  const sections = [...html.matchAll(/<section\b([^>]*\bclass="field-section[^"]*"[^>]*)>([\s\S]*?)<\/section>/g)]
    .map(match => ({ attributes: attributes(match[1]), body: match[2] }));

  assert.equal(sections.length, CATEGORY_CONTRACT.length);
  sections.forEach((section, index) => {
    const expected = CATEGORY_CONTRACT[index];
    assert.equal(section.attributes.id, expected.id);
    assert.equal(section.attributes['data-category'], expected.category);
    assert.equal(textContent(section.body.match(/<h2[^>]*>([^<]+)<\/h2>/)[1]), expected.title);
    assert.deepEqual(cardsIn(section.body).map(card => card.attributes['data-slug']), expected.slugs);
  });

  CATEGORY_CONTRACT.forEach(category => {
    assert.match(html, new RegExp(`<a href="#${category.id}">`));
  });
});

test('existing cards use fixed local ports and new cards use sibling-relative links', () => {
  cards.forEach(card => {
    const slug = card.attributes['data-slug'];
    const link = cardLink(card);
    const expected = EXISTING_LINKS[slug] || `../frontier-atlas-${slug}/`;
    assert.equal(link.href, expected, `${slug} link contract`);
    assert.equal((card.body.match(/<a\b/g) || []).length, 1, `${slug} has one card action`);
  });

  const blender = html.match(/<a\b([^>]*\bdata-link="blender-compare"[^>]*)>/);
  assert.ok(blender, 'Blender comparison link exists');
  assert.equal(attributes(blender[1]).href, BLENDER_URL);

  const expectedNetworkLinks = [...Object.values(EXISTING_LINKS), BLENDER_URL].sort();
  const networkLinks = [...html.matchAll(/href="([^"]+)"/g)]
    .map(match => match[1])
    .filter(href => /^https?:\/\//.test(href))
    .sort();
  assert.deepEqual(networkLinks, expectedNetworkLinks);
  assert.ok(HUB_URL.endsWith('/その他/frontier-atlas-hub/'));
});

test('the static Japanese hub has accessible structure, local badges, and responsive readable styles', () => {
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<h3\b/g) || []).length, 16);
  assert.match(html, /ローカル専用/);
  assert.match(html, /16項目/);
  assert.match(html, /<a class="skip-link" href="#catalog">/);
  assert.match(html, /<nav class="field-nav" aria-label="分野別の索引">/);
  assert.match(html, /<link rel="stylesheet" href="\.\/app\.css">/);
  assert.match(html, /<link rel="icon" href="\.\/favicon\.svg" type="image\/svg\+xml">/);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'all element IDs are unique');
  [...html.matchAll(/href="#([^"]+)"/g)].forEach(match => assert.ok(ids.includes(match[1]), `anchor target ${match[1]} exists`));

  assert.match(css, /body\s*\{[^}]*font-size:\s*1rem;/s);
  assert.match(css, /\.card-description\s*\{[^}]*font-size:\s*\.9375rem;/s);
  assert.match(css, /\.card-stage strong\s*\{[^}]*font-size:\s*\.9375rem;/s);
  assert.match(css, /\.card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*260px\),\s*1fr\)\);/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.card-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('the hub stays dependency-free and documents the 8084 launch and test commands', () => {
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket/i);
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i);
  assert.deepEqual(fs.readdirSync(hubRoot).sort(), ['README.md', 'app.css', 'favicon.svg', 'index.html']);

  const favicon = fs.readFileSync(path.join(hubRoot, 'favicon.svg'), 'utf8');
  const readme = fs.readFileSync(path.join(hubRoot, 'README.md'), 'utf8');
  assert.match(favicon, /^<svg\b/);
  assert.match(readme, /python -m http\.server 8084 --bind 127\.0\.0\.1/);
  assert.ok(readme.includes(HUB_URL));
  assert.ok(readme.includes('node --test "scripts/tests/frontier-hub.test.cjs"'));
});
