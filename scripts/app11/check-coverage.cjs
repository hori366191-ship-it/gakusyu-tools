#!/usr/bin/env node
/**
 * app11 高校化学カバレッジ検査
 *
 * 実行:
 *   node scripts/app11/check-coverage.cjs --source-only   # 生成物をまだ更新していない間の自己確認
 *   node scripts/app11/check-coverage.cjs --check         # 親の最終確認（source + 生成D/A + layout/routes）
 *   node scripts/app11/check-coverage.cjs                 # --check と同じ
 *
 * 検査する内容:
 * - coverage-manifest.json の水準（standard / advanced / held / missing-material / card-only）と
 *   全通常・全保留・全アカデミック反応の漏れ/重複
 * - 反応 ID の重複、通常とアカデミックの同一組合せの二重描画
 * - source の式の元素・電荷収支（S.loadSource の fail-closed をそのまま使う）
 * - 通常反応の描画必須（layout のマーカー・routes の in/out 辺、棚に残っていないこと）
 * - 生成 data.js / academic-data.js の件数と 427 位置
 *
 * ブラウザ操作・目視は行わない。外部 API も呼ばない。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const S = require('./source-data.cjs');

const ROOT = S.ROOT;
const SRC = S.SRC;
const APP = path.join(ROOT, 'site', 'app11');
const MANIFEST_PATH = path.join(SRC, 'coverage-manifest.json');

const LEVELS = ['standard', 'advanced', 'held', 'missing-material', 'card-only'];

const args = process.argv.slice(2);
const SOURCE_ONLY = args.includes('--source-only');
const FULL = !SOURCE_ONLY;

const errors = [];
const notes = [];
function fail(message) {
  errors.push(message);
}
function note(message) {
  notes.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function slugOf(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalize(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '');
}

function sortKey(ids) {
  return ids.slice().sort().join('+');
}

function pairKey(type, substrates, products) {
  return type + '|' + sortKey(substrates) + '>' + sortKey(products);
}

/* ---------------- アカデミック正本の展開（ID だけを独立に求める） ---------------- */

function parseRow(text) {
  const arrow = String(text).indexOf('>');
  if (arrow < 0) throw new Error('academic row の形式が不正: ' + text);
  const side = (part) => part.split('+').map((raw) => {
    const item = raw.trim();
    const m = /^([a-z0-9][a-z0-9,()-]*?)(?:\*\d+)?$/i.exec(item);
    if (!m) throw new Error('academic row の物質が不正: ' + item);
    return m[1];
  });
  return { substrates: side(String(text).slice(0, arrow)), products: side(String(text).slice(arrow + 1)) };
}

function expandAcademic(doc) {
  const out = [];
  (doc.groups || []).forEach((group) => {
    (group.rows || []).forEach((entry) => {
      const rowText = typeof entry === 'string' ? entry : entry.row;
      const parsed = parseRow(rowText);
      out.push({
        id: 'academic-' + slugOf(group.key) + '-' + slugOf(parsed.substrates.join('-')) + '-' + slugOf(parsed.products.join('-')),
        type: group.type,
        substrates: parsed.substrates,
        products: parsed.products,
        conditions: group.conditions || '',
        groupKey: group.key,
        reason: group.note || group.scope || ''
      });
    });
  });
  (doc.reactions || []).forEach((r) => {
    out.push({
      id: r.id,
      type: r.type,
      substrates: r.substrates || [],
      products: r.products || [],
      conditions: r.conditions || '',
      groupKey: 'explicit',
      reason: r.note || r.scope || ''
    });
  });
  (doc.polymerReactions || []).forEach((r) => {
    out.push({
      id: r.id,
      type: r.type,
      substrates: (r.substrates || []).map((s) => (typeof s === 'string' ? s : s.id)),
      products: (r.products || []).map((p) => (typeof p === 'string' ? p : p.id)),
      conditions: r.conditions || '',
      groupKey: 'polymer',
      reason: r.note || r.scope || ''
    });
  });
  const seen = new Set();
  out.forEach((r) => {
    if (!/^academic-[a-z0-9][a-z0-9-]*$/.test(r.id)) fail('アカデミック反応IDが不正: ' + r.id);
    if (seen.has(r.id)) fail('アカデミック反応IDが重複: ' + r.id);
    seen.add(r.id);
  });
  return out;
}

/* ---------------- manifest ---------------- */

function checkManifest(manifest, source, academicRows) {
  if (!manifest || manifest.version !== 1) {
    fail('coverage-manifest.json の version が 1 でない');
    return;
  }
  if (!Array.isArray(manifest.items)) {
    fail('coverage-manifest.json に items 配列がない');
    return;
  }
  if (!Array.isArray(manifest.sources) || !manifest.sources.length) {
    fail('coverage-manifest.json に sources がない');
  }
  const sourceIds = new Set((manifest.sources || []).map((s) => s.id));
  (manifest.sources || []).forEach((s) => {
    if (!s || !s.id) fail('manifest sources の id がない');
    if (s && !/^https?:\/\//.test(String(s.url || ''))) fail('manifest source の URL が公開教材URLでない: ' + (s && s.id));
  });

  const normalIds = new Set(source.reactions.map((r) => r.id));
  const heldIds = new Set(source.heldReactions.map((r) => r.id));
  const academicIds = new Set(academicRows.map((r) => r.id));
  const allAcademicIds = new Set(academicIds);

  const seenItemIds = new Set();
  const coveredNormal = new Map();
  const coveredHeld = new Map();
  const coveredAcademic = new Map();

  manifest.items.forEach((item) => {
    const owner = 'manifest item ' + (item && item.id);
    if (!item || !item.id) {
      fail('manifest item に id がない');
      return;
    }
    if (seenItemIds.has(item.id)) fail('manifest item id が重複: ' + item.id);
    seenItemIds.add(item.id);
    if (LEVELS.indexOf(item.level) === -1) fail(owner + ' の level が不正: ' + item.level);
    if (!Array.isArray(item.reactionIds)) fail(owner + ' の reactionIds が配列でない');
    if (!Array.isArray(item.sources)) fail(owner + ' の sources が配列でない');
    if (typeof item.requiresEquation !== 'boolean') fail(owner + ' の requiresEquation が真偽値でない');
    if (typeof item.requiresDrawing !== 'boolean') fail(owner + ' の requiresDrawing が真偽値でない');
    (item.sources || []).forEach((id) => {
      if (!sourceIds.has(id)) fail(owner + ' の source が manifest.sources にない: ' + id);
    });
    if (!String(item.reason || '').trim()) fail(owner + ' の reason がない');
    const reactionIds = item.reactionIds || [];

    if (item.level === 'standard') {
      if (!reactionIds.length) fail(owner + ' に reactionIds がない');
      if (!(item.sources || []).length) fail(owner + ' に sources がない');
      if (item.legacyAcademicId != null) {
        if (!/^academic-[a-z0-9][a-z0-9-]*$/.test(String(item.legacyAcademicId))) {
          fail(owner + ' の legacyAcademicId が不正: ' + item.legacyAcademicId);
        }
        if (academicIds.has(item.legacyAcademicId)) {
          fail(owner + ' の legacyAcademicId がアカデミック側に残っている: ' + item.legacyAcademicId);
        }
      }
      reactionIds.forEach((id) => {
        if (!normalIds.has(id)) fail(owner + ' の reactionId が通常の確認済み反応でない: ' + id);
        if (coveredNormal.has(id)) fail('通常反応が複数の standard item に重複: ' + id);
        coveredNormal.set(id, item.id);
      });
    } else if (item.level === 'advanced') {
      if (!reactionIds.length) fail(owner + ' に reactionIds がない');
      if (!(item.sources || []).length) fail(owner + ' に sources がない');
      reactionIds.forEach((id) => {
        if (!academicIds.has(id)) fail(owner + ' の reactionId がアカデミック反応でない: ' + id);
        if (coveredAcademic.has(id)) fail('アカデミック反応が複数の advanced item に重複: ' + id);
        coveredAcademic.set(id, item.id);
      });
    } else if (item.level === 'held') {
      if (!reactionIds.length && item.pendingKind !== 'research-held') {
        fail(owner + ' に reactionIds がない');
      }
      reactionIds.forEach((id) => {
        if (!heldIds.has(id)) fail(owner + ' の reactionId が保留反応でない: ' + id);
        if (coveredHeld.has(id)) fail('保留反応が複数の held item に重複: ' + id);
        coveredHeld.set(id, item.id);
      });
    } else if (item.level === 'missing-material') {
      if (reactionIds.length) fail(owner + ' は missing-material なのに reactionIds を持つ');
      if (!Array.isArray(item.compoundIds) || !item.compoundIds.length) {
        fail(owner + ' に compoundIds がない');
      }
      if (!item.pendingKind) fail(owner + ' に pendingKind がない');
    } else if (item.level === 'card-only') {
      if (!item.pendingKind && !item.cardRef) fail(owner + ' に pendingKind / cardRef がない');
      if (item.pendingKind === 'detection-ui' && reactionIds.length) {
        fail(owner + ' は UI 未対応なのに reactionIds を持つ（カード済みと偽らない）');
      }
      if (item.pendingKind === 'existing-card-note') {
        if (!item.cardRef) fail(owner + ' に cardRef がない');
        reactionIds.forEach((id) => {
          if (!normalIds.has(id)) fail(owner + ' の reactionId が通常の確認済み反応でない: ' + id);
        });
      }
    }
  });

  [...normalIds].sort().forEach((id) => {
    if (!coveredNormal.has(id)) fail('通常の確認済み反応が standard item にない: ' + id);
  });
  [...heldIds].sort().forEach((id) => {
    if (!coveredHeld.has(id)) fail('保留反応が held item にない: ' + id);
  });
  [...allAcademicIds].sort().forEach((id) => {
    if (!coveredAcademic.has(id)) fail('アカデミック反応が advanced item にない: ' + id);
  });

  // source 側の coverageIds が manifest の item を指していること。
  source.reactions.forEach((r) => {
    (r.coverageIds || []).forEach((id) => {
      if (!seenItemIds.has(id)) fail('反応 ' + r.id + ' の coverageId が manifest item にない: ' + id);
    });
  });

  // missing-material の ID は 427 物質に存在しないことを機械検査する。
  let compounds;
  try {
    compounds = S.loadApp10().D.COMPOUNDS;
  } catch (error) {
    fail('app10 の物質一覧を読めない: ' + error.message);
    compounds = {};
  }
  manifest.items.filter((item) => item && item.level === 'missing-material').forEach((item) => {
    (item.compoundIds || []).forEach((id) => {
      if (compounds[id]) fail('missing-material の ID が既に427物質に存在する: ' + id);
    });
  });

  // 重要項目のレビューは未確定なら full check を止める（推測で埋めない）。
  const review = manifest.importantReview || {};
  if (review.status === 'pending-source-list') {
    if (FULL) {
      fail('importantReview が pending-source-list のまま。高校重要47項目の最終リストを受領して確定するまで --check は通さない');
    } else {
      note('importantReview は pending-source-list（--source-only のため警告のみ）');
    }
  } else if (review.status === 'confirmed') {
    if (!Array.isArray(review.items) || !review.items.length) fail('importantReview が confirmed なのに items が空');
    if (review.expectedCount != null && review.items.length !== review.expectedCount) {
      fail('importantReview.items の件数が expectedCount と違う: ' + review.items.length + ' / ' + review.expectedCount);
    }
    (review.items || []).forEach((entry) => {
      if (!entry || !entry.id) {
        fail('importantReview item に id がない');
        return;
      }
      const item = manifest.items.find((x) => x && x.id === entry.id);
      if (!item) {
        fail('importantReview の id が manifest item にない: ' + entry.id);
        return;
      }
      if (entry.level && item.level !== entry.level) {
        fail('importantReview の level が manifest と違う: ' + entry.id + '（' + entry.level + ' / ' + item.level + '）');
      }
      if (item.level === 'standard') {
        (item.reactionIds || []).forEach((id) => {
          if (!normalIds.has(id)) fail('importantReview の standard item が通常公開でない: ' + entry.id);
        });
      }
    });
  } else {
    fail('importantReview.status が不正: ' + review.status);
  }
}

/* ---------------- 通常とアカデミックの二重描画 ---------------- */

function checkNoDoubleDraw(source, academicRows) {
  const normalByPair = new Map();
  source.reactions.forEach((r) => {
    const key = pairKey(r.type, r.substrates, r.products);
    if (!normalByPair.has(key)) normalByPair.set(key, []);
    normalByPair.get(key).push(r);
  });
  academicRows.forEach((row) => {
    const key = pairKey(row.type, row.substrates, row.products);
    const same = normalByPair.get(key);
    if (!same) return;
    const sameConditions = same.some((r) => normalize(r.conditions) === normalize(row.conditions));
    if (sameConditions) {
      fail('通常とアカデミックで同一の組合せ・同一条件が二重描画: ' + row.id);
      return;
    }
    if (!String(row.reason || '').trim()) {
      fail('通常と同 pair のアカデミック反応に条件差の理由がない: ' + row.id);
    }
  });
  // 通常へ移した反応は legacyAcademicId を保持し、アカデミック側に同じ ID を残さない。
  const academicIds = new Set(academicRows.map((r) => r.id));
  source.reactions.forEach((r) => {
    if (!r.legacyAcademicId) return;
    if (academicIds.has(r.legacyAcademicId)) {
      fail('通常へ移した反応のアカデミック行が残っている: ' + r.id + ' / ' + r.legacyAcademicId);
    }
  });
}

/* ---------------- 生成物（full check のみ） ---------------- */

function checkGenerated(source, academicRows) {
  const D = readJson(path.join(SRC, 'map.json'));
  let data;
  let academicData;
  let layout;
  let routes;
  let primary;
  try {
    data = require(path.join(APP, 'data.js'));
  } catch (error) {
    fail('site/app11/data.js を読めない: ' + error.message);
    return;
  }
  try {
    academicData = require(path.join(APP, 'academic-data.js'));
  } catch (error) {
    fail('site/app11/academic-data.js を読めない: ' + error.message);
  }
  try {
    layout = readJson(path.join(SRC, 'layout.json'));
    routes = readJson(path.join(SRC, 'routes.json'));
    primary = readJson(path.join(SRC, 'primary-topology.json'));
  } catch (error) {
    fail('layout / routes / primary-topology を読めない: ' + error.message);
    return;
  }

  const compounds = data.compounds || [];
  const compoundSet = new Set(compounds.map((c) => c.id));
  const normalIds = source.reactions.map((r) => r.id);
  const normalSet = new Set(normalIds);

  if (data.meta) {
    if (data.meta.compoundCount != null && data.meta.compoundCount !== 427) {
      fail('生成 data.js の compoundCount が 427 でない: ' + data.meta.compoundCount);
    }
    if (data.meta.confirmedReactionCount != null && data.meta.confirmedReactionCount !== normalIds.length) {
      fail('生成 data.js の confirmedReactionCount が source と違う: ' + data.meta.confirmedReactionCount + ' / ' + normalIds.length);
    }
    if (data.meta.heldReactionCount != null && data.meta.heldReactionCount !== source.heldReactions.length) {
      fail('生成 data.js の heldReactionCount が source と違う: ' + data.meta.heldReactionCount + ' / ' + source.heldReactions.length);
    }
  }
  if (compounds.length !== 427) fail('生成 data.js の物質数が 427 でない: ' + compounds.length);

  const sourceSpecies = [...source.species.keys()].sort();
  const dataSpecies = Object.keys(data.species || {}).sort();
  if (JSON.stringify(sourceSpecies) !== JSON.stringify(dataSpecies)) {
    fail('生成 data.js の species が source と一致しない: ' + dataSpecies.join(',') + ' / ' + sourceSpecies.join(','));
  }

  if (!layout.positions || Object.keys(layout.positions).length !== 427) {
    fail('layout.json の positions が 427 でない: ' + Object.keys(layout.positions || {}).length);
  }
  compounds.forEach((c) => {
    if (!layout.positions[c.id]) fail('layout.json に位置がない物質: ' + c.id);
  });
  normalIds.forEach((id) => {
    if (!layout.reactions || !layout.reactions[id]) fail('layout.json に通常反応マーカーがない: ' + id);
  });

  // 反応に出る物質が棚（isolated）に残っていないこと。独立 component でも network 側に置く。
  const used = new Set();
  source.reactions.forEach((r) => {
    r.substrates.concat(r.products).forEach((id) => used.add(id));
  });
  used.forEach((id) => {
    const pos = layout.positions[id];
    if (!pos) fail('通常反応に出る物質が layout にない: ' + id);
    else if (pos.tier === 'isolated') fail('通常反応に出る物質が棚（isolated）に残っている: ' + id);
  });
  const required = new Set(source.required);
  required.forEach((id) => {
    if (!layout.positions[id]) fail('必修物質が layout にない: ' + id);
  });

  // 通常 routes の in/out 辺。全例が独立 component でも端点の辺は必要。
  const edges = routes.edges || {};
  const edgeKeys = Object.keys(edges);
  source.reactions.forEach((r) => {
    r.substrates.forEach((id) => {
      if (!edges[r.id + '|in|' + id]) fail('routes.json に in 辺がない: ' + r.id + ' / ' + id);
    });
    r.products.forEach((id) => {
      if (!edges[r.id + '|out|' + id]) fail('routes.json に out 辺がない: ' + r.id + ' / ' + id);
    });
  });
  edgeKeys.forEach((key) => {
    const rid = key.split('|')[0];
    if (normalSet.has(rid)) return;
    if (academicRows.some((r) => r.id === rid)) return;
    fail('routes.json に未知の反応の辺: ' + key);
  });
  let expectedTopologyHash = source.priorityHash;
  try {
    const baseline = require('./legacy-baseline.cjs').loadBaseline();
    if (baseline) {
      const legacyIds = Object.keys(baseline.reactions || {}).sort();
      expectedTopologyHash = require('./primary-topology.cjs').legacyDigest(source, legacyIds);
      if (baseline.topologyInputHash && baseline.topologyInputHash !== expectedTopologyHash) {
        fail('legacy-baseline.json の topologyInputHash が現 source の legacy digest と違う');
      }
    }
  } catch (error) {
    fail('legacy baseline / topology helper を読めない: ' + error.message);
  }
  if (!primary.meta || !primary.meta.inputHash) {
    fail('primary-topology.json の inputHash がない');
  } else if (primary.meta.inputHash !== expectedTopologyHash) {
    fail('primary-topology.json の inputHash が legacy 範囲の priority hash と違う: ' +
      primary.meta.inputHash + ' / ' + expectedTopologyHash);
  }
  if (layout.priorityHash && layout.priorityHash !== source.priorityHash) {
    fail('layout.json の priorityHash が source と違う');
  }

  if (!academicData) {
    // no academic artifact to check
  } else {
    const reactions = academicData.reactions || [];
    if (reactions.length !== academicRows.length) {
      fail('生成 academic-data.js の反応数が source と違う: ' + reactions.length + ' / ' + academicRows.length);
    }
    const layoutA = academicData.layout || {};
    if (!layoutA.positions || Object.keys(layoutA.positions).length !== 427) {
      fail('academic layout の positions が 427 でない: ' + Object.keys(layoutA.positions || {}).length);
    }
    const normalEdgeCount = source.reactions.reduce((n, r) => n + r.substrates.length + r.products.length, 0);
    // アカデミックの layout は物質ノードだけを端点にし、式用 species（H2O / HCl など）は辺にしない。
    const academicEdgeCount = academicRows.reduce((n, r) =>
      n + r.substrates.filter((id) => compoundSet.has(id)).length +
      r.products.filter((id) => compoundSet.has(id)).length, 0);
    const expectedAcademicEdges = academicEdgeCount;
    if (!layoutA.normalRoutes || Object.keys(layoutA.normalRoutes).length !== normalEdgeCount) {
      fail('academic layout の通常経路が source と違う: ' + Object.keys(layoutA.normalRoutes || {}).length + ' / ' + normalEdgeCount);
    }
    if (!layoutA.routes || Object.keys(layoutA.routes).length !== expectedAcademicEdges) {
      fail('academic layout の学術経路が source と違う: ' + Object.keys(layoutA.routes || {}).length + ' / ' + expectedAcademicEdges);
    }
    if (Array.isArray(layoutA.warnings) && layoutA.warnings.length) {
      fail('academic layout に warning が残っている: ' + layoutA.warnings.length);
    }
    if (academicData.base && academicData.base.reactionCount !== normalIds.length) {
      fail('academic base の反応数が通常と違う: ' + academicData.base.reactionCount + ' / ' + normalIds.length);
    }
  }
  if (!D.regions) fail('map.json の regions がない');
}

/* ---------------- main ---------------- */

function main() {
  let manifest;
  let source;
  let academicRows;
  try {
    manifest = readJson(MANIFEST_PATH);
  } catch (error) {
    console.error('coverage-manifest.json を読めない: ' + error.message);
    process.exit(1);
  }
  try {
    source = S.loadSource();
  } catch (error) {
    console.error('source の検証に失敗: ' + error.message);
    process.exit(1);
  }
  try {
    academicRows = expandAcademic(readJson(path.join(SRC, 'academic-reactions.json')));
  } catch (error) {
    console.error('academic-reactions.json の展開に失敗: ' + error.message);
    process.exit(1);
  }

  checkManifest(manifest, source, academicRows);
  checkNoDoubleDraw(source, academicRows);
  if (FULL) checkGenerated(source, academicRows);

  notes.forEach((message) => console.log('NOTE: ' + message));
  if (errors.length) {
    errors.forEach((message) => console.error('ERROR: ' + message));
    console.error('coverage check failed: ' + errors.length + ' 件');
    process.exit(1);
  }
  console.log('coverage check passed (' + (SOURCE_ONLY ? 'source-only' : 'full') + '): ' +
    source.reactions.length + ' normal / ' + source.heldReactions.length + ' held / ' +
    academicRows.length + ' academic');
}

main();
