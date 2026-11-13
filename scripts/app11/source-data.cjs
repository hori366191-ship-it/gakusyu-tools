/**
 * 有機反応マップ（app11）— 入力データの読み込み（ビルド時のみ）
 *
 * site/app10 の公開データから、物質名・示性式・分類・ID とビルダーの focus 経路だけを
 * オフラインで抽出する。precursors / reactions / nature などの自由文は取り込まない。
 * 反応は site-src/app11/reactions.json（本ツール独自データ）だけを根拠にする。
 *
 * build-map-data.cjs と optimize-layout.cjs の両方がこの関数を使い、
 * 「どの物質がどの分野か」「どの反応を公開するか」の判断を一箇所に固定する。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const APP10 = path.join(ROOT, 'site', 'app10');
const SRC = path.join(ROOT, 'site-src', 'app11');

const LABEL_MAX = 12;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function shortLabel(name) {
  let s = String(name || '');
  const cut = s.indexOf('（');
  if (cut > 0) s = s.slice(0, cut);
  if (s.length > LABEL_MAX) s = s.slice(0, LABEL_MAX - 1) + '…';
  return s;
}

function builderHref(route) {
  if (!route) return null;
  const q = ['mode=' + encodeURIComponent(route.mode)];
  if (route.mode === 'chain') {
    q.push('family=' + encodeURIComponent(route.family));
    q.push('cpartial=' + encodeURIComponent(route.partialC));
    if (route.shape) q.push('shape=' + encodeURIComponent(route.shape));
  } else if (route.mode === 'ring') {
    q.push('system=' + encodeURIComponent(route.system));
    if (route.preset) q.push('preset=' + encodeURIComponent(route.preset));
    else if (route.group) q.push('preset=' + encodeURIComponent(route.group));
  } else {
    q.push('category=' + encodeURIComponent(route.category));
    if (route.family) q.push('family=' + encodeURIComponent(route.family));
  }
  q.push('focus=' + encodeURIComponent(route.focus));
  return '../app10/index.html?' + q.join('&');
}

// 公開データには資料名・節番号・確認日だけを載せる（URL・本文抜粋・画像は含めない）。
function publicSource(entry) {
  const name = entry.source || 'OpenStax Organic Chemistry (McMurry)';
  const section = entry.section ? ' ' + entry.section : '';
  const date = entry.date ? '（' + entry.date + ' 確認）' : '';
  return name + section + date;
}

// app11 の構造図用に、app10 の構造specだけを深いコピーで持ち出す。
// precursors / reactions / nature などの自由文は取り込まない。
function cloneStructureSpec(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function structureFields(compound) {
  const out = {
    structure: cloneStructureSpec(compound.structure || null)
  };
  if (compound.figures && compound.figures.length) {
    out.figures = cloneStructureSpec(compound.figures);
  }
  if (compound.formulaVariable) out.formulaVariable = true;
  if (compound.formulaDisplay) out.formulaDisplay = compound.formulaDisplay;
  if (compound.formulaReference) out.formulaReference = compound.formulaReference;
  return out;
}

function loadApp10() {
  const D = require(path.join(APP10, 'data.js'));
  const C = require(path.join(APP10, 'catalog.js'));
  return { D, C };
}

function loadSource() {
  const map = readJson(path.join(SRC, 'map.json'));
  const reactionSource = readJson(path.join(SRC, 'reactions.json'));
  const priorityDoc = readJson(path.join(SRC, 'route-priority.json'));
  const { D, C } = loadApp10();

  const regionById = new Map(map.regions.map((r) => [r.id, r]));
  const categoryOrder = Object.keys(map.categoryRegions);

  const compoundOrder = Object.keys(D.COMPOUNDS).sort((a, b) => {
    const ca = D.COMPOUNDS[a].category;
    const cb = D.COMPOUNDS[b].category;
    const ra = categoryOrder.indexOf(ca);
    const rb = categoryOrder.indexOf(cb);
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const compounds = new Map();
  for (const id of compoundOrder) {
    const c = D.COMPOUNDS[id];
    const region = map.regionOverrides[id] || map.categoryRegions[c.category] || null;
    if (!region || !regionById.has(region)) {
      throw new Error('物質 ' + id + ' の分野が決まらない（category=' + c.category + '）');
    }
    const route = C.routeFor(id) || null;
    const structure = structureFields(c);
    compounds.set(id, {
      id,
      name: c.name,
      label: shortLabel(c.name),
      formula: c.formula || '',
      ...structure,
      category: c.category,
      region,
      recordState: c.verified ? 'confirmed' : 'unverified',
      curriculum: D.REQUIRED_CURRICULUM.indexOf(id) !== -1,
      hub: map.hubs.indexOf(id) !== -1,
      builder: { href: builderHref(route), route: route ? route.mode : null },
      raw: c
    });
  }

  const types = {};
  for (const key of Object.keys(reactionSource.types)) {
    const t = reactionSource.types[key];
    types[key] = { label: t.label, summary: t.summary, schematic: t.schematic, count: 0 };
  }

  const reactions = [];
  const heldReactions = [];
  const usedSections = new Set();
  const seenIds = new Set();
  for (const r of reactionSource.reactions) {
    if (seenIds.has(r.id)) throw new Error('反応IDが重複: ' + r.id);
    seenIds.add(r.id);
    if (!types[r.type]) throw new Error('未定義の反応種別: ' + r.type + '（反応 ' + r.id + '）');
    const subs = r.substrates || [];
    const prods = r.products || [];
    if (!subs.length) throw new Error('基質がない反応: ' + r.id);
    for (const id of subs.concat(prods)) {
      if (!compounds.has(id)) throw new Error('未収録の物質ID: ' + id + '（反応 ' + r.id + '）');
    }
    const state = r.state || reactionSource.defaultState || 'unverified';
    if (state !== 'confirmed') {
      heldReactions.push({ id: r.id, type: r.type, state });
      continue;
    }
    if (!Array.isArray(r.verification) || !r.verification.length) {
      throw new Error('確認済みの反応に検証記録がない: ' + r.id);
    }
    const subRegions = new Set(subs.map((id) => compounds.get(id).region));
    const prodRegions = new Set(prods.map((id) => compounds.get(id).region));
    const all = new Set([...subRegions, ...prodRegions]);
    reactions.push({
      id: r.id,
      type: r.type,
      typeLabel: types[r.type].label,
      state: 'confirmed',
      substrates: subs,
      reagents: r.reagents || [],
      products: prods,
      productNote: r.productNote || '',
      conditions: r.conditions || '',
      note: r.note || '',
      sources: (r.verification || []).map(publicSource),
      cross: all.size > 1,
      regions: [...all].sort()
    });
    types[r.type].count += 1;
    (r.verification || []).forEach((entry) => { if (entry.section) usedSections.add(entry.section); });
  }

  const required = D.REQUIRED_CURRICULUM.filter((id, i, arr) => arr.indexOf(id) === i);

  const priority = validatePriority(priorityDoc, reactions, heldReactions);

  return {
    map,
    regionById,
    reactionSource,
    types,
    compounds,
    compoundOrder,
    reactions,
    heldReactions,
    usedSections,
    required,
    priority,
    priorityHash: digestPriority(reactions, priority.entries),
    source: {
      verifiedAt: reactionSource.verifiedAt || '',
      sourceBook: 'OpenStax Organic Chemistry (McMurry)'
    }
  };
}

// route-priority.json は公開86反応の全件を明示する正本。未設定・未知ID・保留反応の混入を許さない。
function validatePriority(doc, reactions, heldReactions) {
  if (!doc || doc.version !== 1 || typeof doc.reactions !== 'object') {
    throw new Error('route-priority.json の形式が想定と違う（version=1 と reactions が必要）');
  }
  const entries = doc.reactions;
  const confirmedIds = new Set(reactions.map((r) => r.id));
  const heldIds = new Set(heldReactions.map((r) => r.id));
  const missing = [...confirmedIds].filter((id) => !entries[id]).sort();
  if (missing.length) throw new Error('priority 未設定の確認済反応: ' + missing.join(', '));
  for (const id of Object.keys(entries)) {
    if (heldIds.has(id)) throw new Error('保留反応に priority が付いている: ' + id);
    if (!confirmedIds.has(id)) throw new Error('未確認または未知の反応IDに priority が付いている: ' + id);
    const entry = entries[id];
    if (entry.tier !== 'primary' && entry.tier !== 'secondary') {
      throw new Error('priority の tier が不正: ' + id + '（' + entry.tier + '）');
    }
    if (!entry.topic) throw new Error('priority の topic がない: ' + id);
    if (!entry.reason) throw new Error('priority の reason がない: ' + id);
    if (entry.importanceStatus !== 'editorial-candidate') {
      throw new Error('priority の importanceStatus が editorial-candidate でない: ' + id);
    }
  }
  const byId = new Map(Object.keys(entries).sort().map((id) => [id, entries[id]]));
  return { version: doc.version, updated: doc.updated || '', entries: byId, doc };
}

// embed-primary.py と同じ行形式。改行コードは LF 固定。
function digestPriority(reactions, entries) {
  const lines = [];
  const confirmed = reactions.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of confirmed) {
    lines.push('R|' + [
      r.id,
      r.type,
      r.state || 'confirmed',
      r.substrates.join(','),
      r.products.join(',')
    ].join('|'));
  }
  for (const [id, entry] of entries) {
    lines.push('P|' + [id, entry.tier, entry.topic || ''].join('|'));
  }
  return crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

module.exports = {
  ROOT,
  SRC,
  LABEL_MAX,
  readJson,
  shortLabel,
  builderHref,
  publicSource,
  loadSource,
  loadApp10,
  validatePriority,
  digestPriority
};
