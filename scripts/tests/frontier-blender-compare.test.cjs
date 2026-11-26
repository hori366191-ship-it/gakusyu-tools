'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '../..');
const appRoot = path.join(repoRoot, 'その他/frontier-atlas-blender');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const html = read('index.html');
const css = read('app.css');
const app = read('app.mjs');
const viewer = read('viewer.mjs');
const blenderPath = path.join(repoRoot, 'scripts/blender/build_starship.py');
const blender = fs.readFileSync(blenderPath, 'utf8');

test('the comparison page has two accessible viewers, four views and explicit educational notices', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'viewer.mjs', 'favicon.svg']) {
    assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
  }
  assert.match(html, /<link rel="icon" href="\.\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(read('favicon.svg'), /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/);
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /教育用モデル/);
  assert.match(html, /実機CADではありません/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /id="procedural-viewport"[^>]*tabindex="0"[^>]*role="region"/);
  assert.match(html, /id="blender-viewport"[^>]*tabindex="0"[^>]*role="region"/);
  assert.match(html, /id="sync-toggle"[^>]*role="switch"[^>]*aria-checked="true"/);
  assert.match(html, /id="reset-view"/);
  assert.match(html, /id="procedural-error"[^>]*role="alert"/);
  assert.match(html, /id="blender-error"[^>]*role="alert"/);
  assert.match(html, /starship-blender\.glb/);

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
  for (const side of ['procedural', 'blender']) {
    for (const stat of ['triangles', 'meshes', 'materials', 'size']) {
      assert.ok(ids.includes(`${side}-${stat}`), `${side}-${stat}`);
    }
  }
  const views = [...html.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(views, ['overall', 'flaps', 'engines', 'side']);
  assert.deepEqual([...html.matchAll(/class="view-button"[^>]*>([^<]+)</g)].map(match => match[1]), ['全体', 'フラップ', 'エンジン', '側面']);
});

test('the import map and module contracts reuse the existing procedural model without changing it', () => {
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.ok(importMap);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(viewer, /import \{ createStarshipModel \} from '\.\.\/frontier-atlas\/starship-model\.mjs'/);
  assert.match(viewer, /import \{ GLTFLoader \} from 'three\/addons\/loaders\/GLTFLoader\.js'/);
  assert.match(viewer, /new URL\('\.\/models\/starship-blender\.glb', import\.meta\.url\)/);
  assert.match(viewer, /createStarshipModel\(\)/);
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.doesNotMatch(viewer, /makeEarth|EARTH_RADIUS|earth-4096/);
});

test('CSS places the panels side-by-side on desktop and stacks them on mobile', () => {
  assert.match(css, /\.comparison-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.comparison-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.viewport\s*\{[^}]*height:\s*clamp\(440px, 61vh, 720px\)/s);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.viewport\s*\{[^}]*min-height:\s*400px/s);
  assert.match(css, /\.viewport canvas\s*\{[^}]*touch-action:\s*none/s);
  assert.match(css, /\.error-panel\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.view-button, \.sync-button, \.reset-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /button:focus-visible, \[tabindex\]:focus-visible/);
  assert.match(css, /\.model-stats\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
});

test('app wires view presets, synchronization, reset, statistics and source/GLB sizes', () => {
  assert.match(app, /comparison\?\.setView\(view\)/);
  assert.match(app, /comparison\?\.setSynchronized\(synchronized\)/);
  assert.match(app, /comparison\?\.resetView\(\)/);
  assert.match(app, /byId\('sync-toggle'\)\.addEventListener\('click'/);
  assert.match(app, /byId\('reset-view'\)\.addEventListener\('click'/);
  assert.match(app, /onStatus:\s*setPanelStatus/);
  assert.match(app, /onStats:\s*renderStats/);
  assert.match(app, /onError:\s*showPanelError/);
  assert.match(app, /starship-model\.mjs/);
  assert.match(app, /starship-model-spec\.mjs/);
  assert.match(app, /arrayBuffer\(\)/);
  assert.match(app, /fileBytes/);
  assert.match(app, /pagehide/);
  assert.match(app, /3Dモジュールを初期化できませんでした/);
});

test('viewer synchronizes orbit and zoom, supports touch/keyboard, and counts instanced triangles', () => {
  assert.match(viewer, /new THREE\.WebGLRenderer/);
  assert.match(viewer, /for \(const \[side, host\] of \[\['procedural', proceduralHost\], \['blender', blenderHost\]\]\)/);
  assert.match(viewer, /function copyCamera\(source, destination\)/);
  assert.match(viewer, /if \(synchronized && rigs\[otherSide\(source\)\]\) copyCamera/);
  assert.match(viewer, /function setSynchronized\(enabled\)/);
  assert.match(viewer, /const VIEW_PRESETS = Object\.freeze\(\{[\s\S]*?overall:[\s\S]*?flaps:[\s\S]*?engines:[\s\S]*?side:/);
  assert.match(viewer, /function setView\(view\)/);
  assert.match(viewer, /function resetView\(\)/);
  assert.match(viewer, /pointerdown/);
  assert.match(viewer, /gesture = \{ type: 'pinch'/);
  assert.match(viewer, /addEventListener\('wheel'/);
  assert.match(viewer, /ArrowLeft/);
  assert.match(viewer, /object\.isInstancedMesh \? object\.count : 1/);
  assert.match(viewer, /ship: \{ position: \[0, 71, 0\]/);
  assert.match(viewer, /engines: \{ booster: 0, ship: 0 \}/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /requestAnimationFrame/);
  assert.match(viewer, /document\.hidden/);
});

test('WebGL, missing GLB and parse failures have separate explicit error paths', () => {
  assert.match(viewer, /WebGLを初期化できませんでした/);
  assert.match(viewer, /response\.ok/);
  assert.match(viewer, /HTTP \$\{response\.status\}/);
  assert.match(viewer, /loader\.parseAsync\(buffer, BLENDER_MODEL_BASE\)/);
  assert.match(viewer, /Blender版GLBの読み込み・解析に失敗しました/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /WebGLの描画が停止しました/);
  assert.match(app, /byId\(`\$\{side\}-error`\)\.hidden = false/);
  assert.match(app, /error-message/);
});

test('Blender script defines the shared scale, stable names and exact flap/engine layout', () => {
  assert.ok(fs.statSync(blenderPath).isFile());
  assert.match(blender, /BODY_RADIUS = 4\.5/);
  assert.match(blender, /BOOSTER_HEIGHT = 71\.0/);
  assert.match(blender, /SHIP_HEIGHT = 50\.0/);
  assert.match(blender, /TOTAL_HEIGHT = BOOSTER_HEIGHT \+ SHIP_HEIGHT/);
  assert.match(blender, /"angles": \(0\.0, 180\.0\)/);
  assert.match(blender, /"angles": \(20\.0, 160\.0\)/);
  assert.match(blender, /"hinge_tilt": -0\.24/);
  assert.match(blender, /"leeward_offset": -0\.38/);
  assert.match(blender, /range\(20\)/);
  assert.match(blender, /specs\.append\(\(0\.0, 0\.0, 0\.73, 2\.65, "center"\)\)/);
  assert.match(blender, /\(\(1\.42, 6\), \(2\.58, 6\)\)/);
  assert.match(blender, /def engine_specs_ship\(\):[\s\S]*?range\(3\)[\s\S]*?range\(3\)/);
  assert.match(blender, /\["engine_count"\] != 33 or bpy\.data\.objects\["Engines_Ship"\]\["engine_count"\] != 6/);
  for (const name of ['Booster', 'Ship', 'ForwardFlap_L', 'ForwardFlap_R', 'AftFlap_L', 'AftFlap_R', 'Engines_Booster', 'Engines_Ship', 'Tiles_Windward', 'HotStageRing']) {
    assert.ok(blender.includes(`"${name}"`), name);
  }
  assert.match(blender, /make_grid_fin\(index \+ 1, index \* 90\.0, booster\)/);
});

test('Blender 5.3 API uses the current EEVEE enum and lazy mesh tessellation', () => {
  assert.match(blender, /scene\.render\.engine = "BLENDER_EEVEE"/);
  assert.doesNotMatch(blender, /BLENDER_EEVEE_NEXT/);
  assert.doesNotMatch(blender, /\.calc_loop_triangles\(/);
  assert.match(blender, /total \+= len\(mesh\.loop_triangles\)/);
  assert.doesNotMatch(blender, /material\.use_nodes/);
  assert.match(blender, /Principled BSDF is unavailable/);
});

test('Blender tiles are hemisphere-only linked instances merged into one UV/PBR mesh', () => {
  assert.match(blender, /if math\.cos\(angle\) < 0\.0:/);
  assert.match(blender, /bpy\.data\.objects\.new\(f"HexTile_\{tile_count:04d\}", prototype\.data\)/);
  assert.match(blender, /bpy\.ops\.object\.join\(\)/);
  assert.match(blender, /merged\.name = "Tiles_Windward"/);
  assert.match(blender, /merged\["merged_instances"\] = True/);
  assert.match(blender, /mesh\.uv_layers\.new\(name="UVMap"\)/);
  assert.match(blender, /Principled BSDF/);
  assert.match(blender, /inputs\["Metallic"\]/);
  assert.match(blender, /inputs\["Roughness"\]/);
  assert.match(blender, /make_material\("StainlessSteel"/);
  assert.match(blender, /make_material\("BlackTiles"/);
  assert.match(blender, /make_material\("DarkSteel"/);
  assert.match(blender, /add_bevel\(panel, layout\["bevel"\], 1\)/);
  assert.match(blender, /50000 <= triangle_count <= 150000/);
  assert.match(blender, /export_texcoords=True/);
  assert.match(blender, /export_normals=True/);
  assert.match(blender, /export_materials="EXPORT"/);
});

test('Blender output destinations match the comparison page and do not require a build step', () => {
  assert.match(blender, /OUTPUT_DIR = Path\(__file__\)\.resolve\(\)\.parents\[2\] \/ "その他" \/ "frontier-atlas-blender" \/ "models"/);
  assert.match(blender, /BLEND_PATH = OUTPUT_DIR \/ "starship-blender\.blend"/);
  assert.match(blender, /GLB_PATH = OUTPUT_DIR \/ "starship-blender\.glb"/);
  assert.match(blender, /OUTPUT_DIR\.mkdir\(parents=True, exist_ok=True\)/);
  assert.match(blender, /bpy\.ops\.wm\.save_as_mainfile\(filepath=str\(BLEND_PATH\)\)/);
  assert.match(blender, /export_format="GLB"/);
  assert.match(blender, /export_yup=True/);
  const expectedDirectory = path.join(appRoot, 'models');
  assert.equal(path.dirname(path.join(expectedDirectory, 'starship-blender.glb')), expectedDirectory);
  assert.equal(path.basename(expectedDirectory), 'models');
  assert.ok(viewer.includes("new URL('./models/starship-blender.glb', import.meta.url)"));
});
