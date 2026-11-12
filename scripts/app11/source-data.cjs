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

function loadApp10() {
  const D = require(path.join(APP10, 'data.js'));
  const C = require(path.join(APP10, 'catalog.js'));
  return { D, C };
}

function loadSource() {
  const map = readJson(path.join(SRC, 'map.json'));
  const reactionSource = readJson(path.join(SRC, 'reactions.json'));
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
    compounds.set(id, {
      id,
      name: c.name,
      label: shortLabel(c.name),
      formula: c.formula || '',
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
    source: {
      verifiedAt: reactionSource.verifiedAt || '',
      sourceBook: 'OpenStax Organic Chemistry (McMurry)'
    }
  };
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
  loadApp10
};
