'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-space-dc');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-space-dc/content.mjs');
const statePromise = import('../../その他/frontier-atlas-space-dc/scene-state.mjs');

const closeTo = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`);

function ruleBodies(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(match => match[1]);
}

function minimumFontSize(css, selector) {
  const sizes = ruleBodies(css, selector).flatMap(body => [...body.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1])));
  assert.ok(sizes.length > 0, `font-size rule exists for ${selector}`);
  return Math.min(...sizes);
}

function minimumLineHeight(css, selector) {
  const values = ruleBodies(css, selector).flatMap(body => [...body.matchAll(/line-height:\s*(\d+(?:\.\d+)?)/g)].map(match => Number(match[1])));
  assert.ok(values.length > 0, `line-height rule exists for ${selector}`);
  return Math.min(...values);
}

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test('the entry exposes five learning modes and separates evidence from scale concepts', async () => {
  const { ATLAS, ENTRY, MODES, MODE_ORDER, RESEARCH_STATUS } = await contentPromise;
  assert.equal(ENTRY.id, 'orbital-compute');
  assert.equal(ENTRY.title, 'ORBITAL COMPUTE');
  assert.equal(ATLAS.entryNumber, 2);
  assert.deepEqual(MODE_ORDER, ['overall', 'power', 'link', 'cooling', 'compute']);
  assert.equal(MODES.length, 5);
  for (const mode of MODES) {
    assert.ok(mode.title && mode.summary.length > 40, mode.id);
    assert.ok(mode.study.length > 20, mode.id);
    assert.equal(mode.flow.length, 4, mode.id);
    assert.ok(mode.flow.every(([step, title, detail]) => step && title && detail), mode.id);
  }
  assert.equal(RESEARCH_STATUS.orbital.status, '実証段階');
  assert.equal(RESEARCH_STATUS.scale.status, '研究・構想');
  assert.match(RESEARCH_STATUS.scale.detail, /大規模DC/);
});

test('the science copy includes the specified projects, dates, benefits and challenges', async () => {
  const { MODES, BENEFITS, CHALLENGES, SOURCES, ATLAS } = await contentPromise;
  const allCopy = JSON.stringify({ MODES, BENEFITS, CHALLENGES });
  assert.match(allCopy, /Project Suncatcher/);
  assert.match(allCopy, /TPU/);
  assert.match(allCopy, /自由空間光通信/);
  assert.match(allCopy, /2025年11月/);
  assert.match(allCopy, /2025年12月/);
  assert.match(allCopy, /H100/);
  assert.match(allCopy, /小型LLM/);
  assert.match(allCopy, /大規模データセンターそのものではありません/);
  assert.match(allCopy, /ほぼ連続/);
  assert.match(allCopy, /土地|水冷却/);
  assert.match(allCopy, /軌道上エッジ処理/);
  assert.match(allCopy, /打ち上げコスト/);
  assert.match(allCopy, /赤外線/);
  assert.match(allCopy, /放射線/);
  assert.match(allCopy, /保守・更新/);
  assert.match(allCopy, /軌道デブリ/);
  assert.match(allCopy, /遅延/);
  assert.match(ATLAS.endorsementNotice, /承認・推奨/);
  assert.deepEqual(SOURCES.map(source => source.href), [
    'https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/',
    'https://www.starcloud.com/starcloud-1',
    'https://www.axiomspace.com/orbital-data-center',
  ]);
});

test('all five hotspots have attributable explanations and specifications', async () => {
  const { HOTSPOTS } = await contentPromise;
  assert.deepEqual(Object.keys(HOTSPOTS), ['solar', 'chip', 'optical', 'radiator', 'ground']);
  for (const [id, entry] of Object.entries(HOTSPOTS)) {
    assert.ok(['power', 'link', 'cooling', 'compute'].includes(entry.mode), id);
    assert.ok(entry.title && entry.description.length > 35, id);
    assert.equal(entry.specs.length, 3, id);
    assert.ok(entry.specs.every(([term, value]) => term && value), id);
  }
});

test('orbital state is finite, bounded, deterministic and loops at 48 seconds', async () => {
  const { ORBIT_DURATION, EARTH_ROTATION, SATELLITE_LAYOUT, formatOrbitTime, normalizeOrbitTime, sampleOrbitalScene } = await statePromise;
  assert.equal(ORBIT_DURATION, 48);
  assert.equal(normalizeOrbitTime(-1), 0);
  assert.equal(normalizeOrbitTime(49), 48);
  assert.equal(normalizeOrbitTime(Infinity), 0);
  assert.equal(normalizeOrbitTime('12'), 0);
  assert.equal(formatOrbitTime(0), 'T+ 00:00');
  assert.equal(formatOrbitTime(48), 'T+ 00:48');
  assert.deepEqual(sampleOrbitalScene(NaN), sampleOrbitalScene(0));
  for (let time = 0; time <= ORBIT_DURATION; time += .5) {
    const state = sampleOrbitalScene(time);
    assert.equal(state.satellites.length, SATELLITE_LAYOUT.length);
    assert.equal(state.satellites.length, 5);
    assert.equal(state.earth.rotation, EARTH_ROTATION);
    assert.ok([...state.hero.position, ...state.hero.rotation].every(Number.isFinite), `hero at ${time}`);
    for (const satellite of state.satellites) {
      assert.ok([...satellite.position, ...satellite.rotation, satellite.scale].every(Number.isFinite), `${satellite.id} at ${time}`);
    }
    for (const phase of Object.values(state.flows)) assert.ok(phase >= 0 && phase < 1, `flow phase at ${time}`);
    assert.ok(state.progress >= 0 && state.progress <= 1);
  }
  const start = sampleOrbitalScene(0);
  const end = sampleOrbitalScene(48);
  start.hero.position.forEach((value, index) => closeTo(end.hero.position[index], value));
  assert.equal(end.earth.rotation, start.earth.rotation);
  start.satellites.forEach((satellite, satelliteIndex) => {
    satellite.position.forEach((value, index) => closeTo(end.satellites[satelliteIndex].position[index], value, 1e-7));
  });
  Object.keys(start.flows).forEach(key => closeTo(end.flows[key], start.flows[key], 1e-7));
});

test('Earth, relay orbits and the overall camera use the upgraded exhibition scale', async () => {
  const {
    EARTH_CENTER,
    EARTH_RADIUS,
    EARTH_ROTATION,
    EARTH_TEXTURE_PATHS,
    OVERALL_CAMERA_DISTANCE,
    OVERALL_CAMERA_TARGET,
    SATELLITE_LAYOUT,
    orbitalPosition,
    sampleOrbitalScene,
  } = await statePromise;
  assert.equal(EARTH_RADIUS, 28);
  assert.deepEqual(EARTH_CENTER, [0, -24, -20]);
  assert.equal(EARTH_ROTATION, -.42);
  assert.deepEqual(EARTH_TEXTURE_PATHS, { high: './textures/earth-4096.webp', mobile: './textures/earth-2048.webp' });
  assert.ok(OVERALL_CAMERA_DISTANCE >= 90 && OVERALL_CAMERA_DISTANCE <= 100);
  assert.deepEqual(OVERALL_CAMERA_TARGET, [0, -6, 2]);
  assert.equal(SATELLITE_LAYOUT.length, 5);
  assert.ok(SATELLITE_LAYOUT.every(layout => layout.orbitRadius >= 50 && layout.orbitRadius <= 65));
  assert.ok(SATELLITE_LAYOUT.every(layout => layout.scale >= 2.8 && layout.scale <= 3.2));
  assert.equal(new Set(SATELLITE_LAYOUT.map(layout => layout.inclination)).size, 5, 'multiple orbital planes');
  for (const layout of SATELLITE_LAYOUT) {
    const position = orbitalPosition(layout, layout.phase);
    const radius = Math.hypot(...position.map((value, index) => value - EARTH_CENTER[index]));
    closeTo(radius, layout.orbitRadius, 1e-7);
  }
  const start = sampleOrbitalScene(0);
  const heroRadius = Math.hypot(...start.hero.position.map((value, index) => value - EARTH_CENTER[index]));
  assert.ok(heroRadius >= 50 && heroRadius <= 70, 'hero remains clear of the giant Earth');
  assert.deepEqual(start.hero.position.slice(0, 1), [0]);
  assert.ok(start.hero.position[1] >= 19 && start.hero.position[1] <= 21);
  assert.ok(start.hero.position[2] >= 27 && start.hero.position[2] <= 29);
  start.satellites.forEach((satellite, index) => {
    const radius = Math.hypot(...satellite.position.map((value, axis) => value - EARTH_CENTER[axis]));
    closeTo(radius, SATELLITE_LAYOUT[index].orbitRadius, 1e-7);
  });
});

test('mode weighting highlights the selected system without hiding the others', async () => {
  const { modeWeight, isKnownMode } = await statePromise;
  assert.equal(isKnownMode('power'), true);
  assert.equal(isKnownMode('unknown'), false);
  assert.ok(modeWeight('cooling', 'cooling') > modeWeight('cooling', 'compute'));
  assert.ok(modeWeight('overall', 'power') > modeWeight('power', 'power') * 0.5);
  assert.ok(modeWeight('compute', 'compute', true) > modeWeight('compute', 'compute'));
});

test('HTML exposes the complete control surface, fallback and exact Three.js import map', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'load-status', 'entry-title', 'catalog-count',
    'briefing-rail', 'briefing-toggle', 'info-panel', 'info-toggle', 'mode-title', 'mode-description',
    'flow-list', 'research-title', 'focus-card', 'reset-view', 'hotspot-layer', 'play-toggle',
    'orbit-timeline', 'announce', 'help-dialog', 'help-close',
  ]) assert.ok(ids.includes(id), id);
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.ok(importMap, 'import map is present');
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-controls="info-content"/);
  assert.match(html, /<button id="help-close" class="icon-button" type="button"/);
  assert.doesNotMatch(html, /<form method="dialog"/);
  assert.match(html, /NASA Blue Marble: Next Generation/);
  assert.match(html, /Reto Stöckli \/ NASA Goddard Space Flight Center/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="view-button"/g) || []).length, 5);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.match(html, /<input id="orbit-timeline" type="range" min="0" max="48"/);
  for (const source of [
    'https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/',
    'https://www.starcloud.com/starcloud-1',
    'https://www.axiomspace.com/orbital-data-center',
  ]) assert.ok(html.includes(`${source}" target="_blank" rel="noopener noreferrer"`), source);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b/i);
});

test('CSS keeps the exhibit contained, collapsible, mode-aware and touch accessible', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /\.exhibit\[data-briefing="closed"\] \.briefing-rail\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(css, /\.hotspot\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.view-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.speed-control button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.reset-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /data-mode="cooling"/);
  assert.match(css, /data-system="cooling"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /touch-action:\s*none/);
});

test('major Japanese explanations meet the upgraded readability and contrast floor', () => {
  const css = read('app.css');
  const fontFloors = [
    ['.mode-copy > p:not(.eyebrow)', 15],
    ['.mode-copy .study-note', 12],
    ['.research-row p', 12],
    ['.focus-card > p:not(.eyebrow)', 12],
    ['.pro-con ul', 12],
    ['.fine-print', 12],
    ['.sources p', 12],
    ['.rail-note', 12],
    ['.help-content p', 15],
    ['.help-content ul', 15],
  ];
  for (const [selector, floor] of fontFloors) assert.ok(minimumFontSize(css, selector) >= floor, `${selector} font-size`);
  for (const selector of ['.mode-copy > p:not(.eyebrow)', '.research-row p', '.focus-card > p:not(.eyebrow)', '.pro-con ul', '.fine-print', '.sources p', '.help-content p', '.help-content ul']) {
    assert.ok(minimumLineHeight(css, selector) >= 1.8, `${selector} line-height`);
  }
  const allFontSizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
  assert.ok(allFontSizes.every(size => size >= 10), 'no fixed text is smaller than 10px');
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*360px/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?height:\s*min\(60dvh,\s*520px\)/);
  const muted = css.match(/--muted:\s*(#[a-f\d]{6})/i)[1];
  const dim = css.match(/--dim:\s*(#[a-f\d]{6})/i)[1];
  assert.ok(contrastRatio(muted, '#03060d') >= 4.5, 'muted contrast');
  assert.ok(contrastRatio(dim, '#03060d') >= 4.5, 'dim contrast');
});

test('help dialog closes explicitly through button, Escape and backdrop while restoring playback', () => {
  const app = read('app.mjs');
  assert.match(app, /function closeHelpDialog\(\)/);
  assert.match(app, /helpDialog\.close\(\)/);
  assert.match(app, /\$\('help-close'\)\.addEventListener\('click', closeHelpDialog\)/);
  assert.match(app, /helpDialog\.addEventListener\('cancel'/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /helpDialog\.addEventListener\('click'/);
  assert.match(app, /getBoundingClientRect\(\)/);
  assert.match(app, /resumeAfterHelp = playing/);
  assert.match(app, /helpDialog\.addEventListener\('close'/);
  assert.match(app, /if \(resumeAfterHelp\) setPlaying\(true\)/);
});

test('app and viewer implement dynamic loading, visibility and failure-safety contracts', () => {
  const app = read('app.mjs');
  const viewer = read('orbital-viewer.mjs');
  assert.match(app, /await import\('\.\/orbital-viewer\.mjs'\)/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /onContextLost:\s*fallback/);
  assert.match(app, /prefers-reduced-motion/);
  assert.match(app, /\.inert = collapsedOnMobile/);
  assert.match(app, /webglcontextlost|onContextLost/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /document\.hidden/);
  assert.match(viewer, /previousNow = undefined/);
  assert.match(viewer, /prefers-reduced-motion/);
  assert.match(viewer, /model\.setQuality/);
  assert.match(viewer, /OVERALL_CAMERA_DISTANCE/);
  assert.match(viewer, /makeNebulaBackdrop/);
  assert.match(viewer, /new THREE\.PerspectiveCamera\(47, 1, \.1, 900\)/);
  assert.match(viewer, /createOrbitalModel\(\{ anisotropy: renderer\.capabilities\.getMaxAnisotropy\(\) \}\)/);
  assert.match(viewer, /width < 600 \? 98/);
  assert.match(viewer, /clamp\(responsiveDistance \* zoom, 5\.5, 180\)/);
  assert.match(viewer, /model\.dispose\(\)/);
  assert.match(viewer, /material\.uniforms/);
  assert.doesNotMatch(`${app}\n${viewer}`, /\bfetch\s*\(|XMLHttpRequest/);
});

test('the procedural model uses PBR, instancing, additive light and the app13 Earth texture', () => {
  const model = read('orbital-model.mjs');
  assert.match(model, /new THREE\.InstancedMesh/);
  assert.match(model, /new THREE\.MeshStandardMaterial/);
  assert.match(model, /new THREE\.CanvasTexture/);
  assert.match(model, /AdditiveBlending/);
  assert.match(model, /new THREE\.SphereGeometry\(EARTH_RADIUS, 128, 64\)/);
  assert.match(model, /new THREE\.SphereGeometry\(EARTH_RADIUS \* 1\.006, 128, 64\)/);
  assert.match(model, /new THREE\.SphereGeometry\(EARTH_RADIUS \* 1\.065, 128, 64\)/);
  assert.match(model, /EARTH_TEXTURE_PATHS/);
  assert.match(model, /new THREE\.TextureLoader\(\)\.load/);
  assert.match(model, /texture\.colorSpace = THREE\.SRGBColorSpace/);
  assert.match(model, /texture\.anisotropy = anisotropy/);
  assert.match(model, /mobileTexture \? 'mobile' : 'high'/);
  assert.match(model, /earth\.surface\.rotation\.y = EARTH_ROTATION/);
  assert.match(model, /earth\.clouds\.rotation\.y = EARTH_ROTATION \+ \.2/);
  assert.doesNotMatch(model, /makeEarthMaps|nightMap/);
  assert.match(model, /fresnel/);
  assert.match(model, /fbm2/);
  assert.match(model, /hero\.group\.scale\.setScalar\(1\)/);
  assert.match(model, /makeFoilBlanket/);
  assert.match(model, /makeThruster/);
  assert.match(model, /makeAntennaDish/);
  assert.match(model, /relayAntennaDish/);
  assert.match(model, /relayThrusters/);
  assert.match(model, /relayPanels[\s\S]*?count \* 6/);
  assert.match(model, /opticalBeams[\s\S]*?SATELLITE_LAYOUT\.length/);
  assert.match(model, /state\.satellites\.map\(satellite => new THREE\.Vector3/);
  assert.match(model, /makePackets/);
  assert.match(model, /computeChips:\s*18/);
  assert.match(model, /earthSegments:\s*\[128, 64\]/);
  assert.match(model, /instancedSystems:\s*relayMeshes\.length/);
  assert.doesNotMatch(model, /https?:\/\/|GLTFLoader/);
});

test('the bundled Earth textures are exact copies of the app13 WebP assets', () => {
  const readme = read('README.md');
  assert.match(readme, /NASA Blue Marble: Next Generation/);
  assert.match(readme, /app13/);
  assert.match(readme, /Reto Stöckli \/ NASA Goddard Space Flight Center/);
  for (const name of ['earth-4096.webp', 'earth-2048.webp']) {
    const bundled = fs.readFileSync(path.join(appRoot, 'textures', name));
    const source = fs.readFileSync(path.join(__dirname, '../../site/app13/textures', name));
    assert.ok(bundled.equals(source), `${name} matches app13`);
    assert.ok(bundled.length > 100000, `${name} is a full-size asset`);
  }
});

test('all documented static assets exist without a build step', () => {
  for (const file of [
    'index.html', 'app.css', 'app.mjs', 'content.mjs', 'scene-state.mjs',
    'orbital-model.mjs', 'orbital-viewer.mjs', 'favicon.svg', 'README.md',
    'textures/earth-4096.webp', 'textures/earth-2048.webp',
  ]) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
});
