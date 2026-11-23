const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const source = import('../../site/app13/texture-policy.mjs');
const root = join(__dirname, '../../site');

test('only visible, large planets are eligible for detailed maps', async () => {
  const { preferredMapSize: pick } = await source;
  assert.equal(pick('sun', .5, 3, false, 8192), 0);
  assert.equal(pick('earth', .01, 3, false, 8192), 0);
  assert.equal(pick('earth', .08, 3, false, 8192), 1024);
  assert.equal(pick('earth', .14, 3, false, 8192), 1024);
  assert.equal(pick('earth', .14, 2, false, 8192), 2048);
  assert.equal(pick('earth', .22, 3, false, 8192), 4096);
  assert.equal(pick('jupiter', .22, 3, false, 8192), 3600);
  assert.equal(pick('venus', .24, 3, false, 8192), 1440);
  assert.equal(pick('saturn', .17, 3, false, 8192), 1800);
  assert.equal(pick('uranus', .08, 3, false, 8192), 384);
  assert.equal(pick('neptune', .24, 3, false, 8192), 720);
});

test('coarse pointers, performance and GPU limits bound requested texture sizes', async () => {
  const { preferredMapSize: pick } = await source;
  assert.equal(pick('earth', .24, 3, true, 8192), 2048);
  assert.equal(pick('earth', .24, 3, false, 2048), 2048);
  assert.equal(pick('earth', .24, 3, false, 1024), 1024);
  assert.equal(pick('earth', .24, 3, false, 512), 0);
  assert.equal(pick('earth', .24, 0, true, 8192), 1024);
  assert.equal(pick('earth', .18, 1, true, 8192), 1024);
  assert.equal(pick('earth', .24, 1, true, 8192), 2048);
  assert.equal(pick('mercury', .28, 3, false, 8192), 1024);
});

function webpInfo(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  if (data.toString('ascii', 12, 16) === 'VP8X') {
    return [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1, Boolean(data[20] & 0x10)];
  }
  if (data.toString('ascii', 12, 16) === 'VP8L') {
    assert.equal(data[20], 0x2f);
    const spec = data.readUInt32LE(21);
    return [(spec & 0x3fff) + 1, ((spec >>> 14) & 0x3fff) + 1, Boolean(spec & (1 << 28))];
  }
  assert.equal(data.toString('ascii', 12, 16), 'VP8 ');
  return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff, false];
}

test('all generated maps are local 2:1 assets with bounded download size and source credits', async () => {
  const { MAP_LEVELS } = await source;
  const masked = new Set(['saturn', 'uranus', 'neptune']);
  const credits = readFileSync(join(root, 'credits.html'), 'utf8');
  assert.equal(Object.keys(MAP_LEVELS).length, 8);
  for (const [planet, widths] of Object.entries(MAP_LEVELS)) {
    assert.match(credits, new RegExp(`id="solar-${planet}"`));
    for (const width of widths) {
      const data = readFileSync(join(root, 'app13', 'textures', `${planet}-${width}.webp`));
      assert.deepEqual(webpInfo(data), [width, width / 2, masked.has(planet)]);
      assert.ok(data.length < (width <= 1024 ? 150_000 : width <= 2048 ? 520_000 : 2_100_000), `${planet}-${width}`);
    }
  }
});

test('Venus distinguishes generated cloud fill from Akatsuki observations', () => {
  const credits = readFileSync(join(root, 'credits.html'), 'utf8');
  const app = readFileSync(join(root, 'app13', 'app.mjs'), 'utf8');
  assert.match(credits, /id="solar-venus"[^\n]+画像生成AI/);
  assert.match(app, /venus: '[^'\n]+補完部分は実際の観測ではありません/);
});

test('each moon has a bounded lossless map and its own observation or generation note', async () => {
  const { MOONS } = await import('../../site/app13/moons.mjs');
  const { MOON_MAPS } = await import('../../site/app13/moon-maps.mjs');
  assert.equal(Object.keys(MOON_MAPS).length, 21);
  for (const { id } of MOONS) {
    const { href, note, partial } = MOON_MAPS[id];
    assert.match(href, /^https:\/\//);
    assert.equal(note.includes('OpenAI'), partial);
    const data = readFileSync(join(root, 'app13', 'textures', 'moons', `${id}.webp`));
    assert.equal(data.toString('ascii', 12, 16), 'VP8L');
    assert.deepEqual(webpInfo(data), [1024, 512, false]);
    assert.ok(data.length < 850_000, id);
  }
  assert.match(MOON_MAPS.nereid.note, /全体がOpenAIの画像生成/);
  assert.match(readFileSync(join(root, 'credits.html'), 'utf8'), /id="solar-moons"/);
});
