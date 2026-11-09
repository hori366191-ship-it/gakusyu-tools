/*
 * 有機化学ビルダー（app10-next）— UIロジック
 *
 * 依存: data.js (window.OCData), draw.js (window.OCDraw), catalog.js (window.OCCatalog)
 * 3つの探し方（鎖式 / 芳香族・環式 / その他）を同じ画面で切り替える。
 * 既存のカード・構造図・3テーマ・高さアニメーションを引き継ぐ。
 */
(function () {
  'use strict';

  var D = window.OCData;
  var R = window.OCDraw;
  var C = window.OCCatalog;
  if (!D || !R || !C) return;

  var validation = R.validateAll(D.COMPOUNDS);
  var valid = {};
  Object.keys(validation).forEach(function (id) {
    if (validation[id].ok) valid[id] = true;
  });

  var state = {
    mode: 'chain',
    chainFamily: 'amine',
    chainCarbon: 2,
    chainStructure: 'saturated',
    ringSystem: 'benzene',
    ringGroup: 'none',
    otherCategory: 'sugar',
    otherFamily: 'monosaccharide',
    focus: '',
    notice: ''
  };

  var els = {
    modeNote: document.getElementById('mode-note'),
    chainPanels: document.getElementById('chain-panels'),
    ringPanels: document.getElementById('ring-panels'),
    otherPanels: document.getElementById('other-panels'),
    carbonList: document.getElementById('carbon-list'),
    chainStructureList: document.getElementById('chain-structure-list'),
    chainFamilyList: document.getElementById('chain-family-list'),
    chainSelection: document.getElementById('chain-selection'),
    chainPreview: document.getElementById('chain-preview'),
    ringList: document.getElementById('ring-list'),
    ringGroupList: document.getElementById('ring-group-list'),
    ringSelection: document.getElementById('ring-selection'),
    ringPreview: document.getElementById('ring-preview'),
    ringFoot: document.getElementById('ring-foot'),
    otherCategoryList: document.getElementById('other-category-list'),
    otherFamilyList: document.getElementById('other-family-list'),
    otherSelection: document.getElementById('other-selection'),
    otherPreview: document.getElementById('other-preview'),
    otherFoot: document.getElementById('other-foot'),
    results: document.getElementById('results-body'),
    resultCount: document.getElementById('result-count'),
    resultDescription: document.getElementById('result-description'),
    dataStatus: document.getElementById('oc-data-status'),
    queryNotice: document.getElementById('query-notice')
  };

  if (!els.chainPanels || !els.results) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function compoundName(id) {
    var c = D.COMPOUNDS[id];
    return c ? c.name : id;
  }

  function familyName(id) {
    var f = D.familyById ? D.familyById(id) : null;
    if (f) return f.name;
    if (C.CHAIN_FAMILY_LABEL[id]) return C.CHAIN_FAMILY_LABEL[id];
    var g = C.OTHER_GROUP_MAP[id];
    return g ? g.label : id;
  }

  function groupLabel(id) {
    var g = D.groupById(id);
    return g ? g.label : id;
  }

  function modeLabel(mode) {
    return { chain: '鎖式', ring: '芳香族・環式', other: 'その他' }[mode] || mode;
  }

  /* ------------------------------------------------------------------
   * 高さアニメーション（prefers-reduced-motion / WAAPI未対応時は即時反映）
   * ------------------------------------------------------------------ */
  var MOTION_MS = 190;
  var motionQuery = null;
  try {
    motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  } catch (e) { motionQuery = null; }

  function canAnimate() {
    return typeof Element !== 'undefined' && Element.prototype &&
      typeof Element.prototype.animate === 'function' &&
      !(motionQuery && motionQuery.matches);
  }

  var heightAnim = new WeakMap();

  function resetHeight(el) {
    if (!el) return;
    el.style.height = '';
    el.style.overflow = '';
  }

  function animateHeight(el, render) {
    if (!el) { render(); return; }
    var running = heightAnim.get(el);
    var before;
    if (running) {
      try { before = parseFloat(window.getComputedStyle(el).height); } catch (e) { before = NaN; }
      heightAnim.delete(el);
      try { running.cancel(); } catch (e) {}
      if (!isFinite(before)) before = el.getBoundingClientRect().height;
    } else {
      before = el.getBoundingClientRect().height;
    }
    resetHeight(el);
    render();
    if (!canAnimate()) { resetHeight(el); return; }
    var after = el.getBoundingClientRect().height;
    if (Math.abs(after - before) < 0.5) { resetHeight(el); return; }
    el.style.overflow = 'hidden';
    el.style.height = before + 'px';
    var anim = el.animate(
      [{ height: before + 'px' }, { height: after + 'px' }],
      { duration: MOTION_MS, easing: 'cubic-bezier(.4, 0, .2, 1)' }
    );
    heightAnim.set(el, anim);
    anim.onfinish = function () {
      if (heightAnim.get(el) !== anim) return;
      heightAnim.delete(el);
      resetHeight(el);
    };
    anim.oncancel = function () {
      if (heightAnim.get(el) !== anim) return;
      heightAnim.delete(el);
      resetHeight(el);
    };
  }

  /* ------------------------------------------------------------------
   * details は常に最大1つだけ開く（高さアニメーション付き）
   * ------------------------------------------------------------------ */
  var detailsAnim = new WeakMap();
  var activeDetails = null;
  var desiredDetails = null;
  var detailsPhase = 'idle';

  function groupBody(details) {
    return details.querySelector('.oc-group__body');
  }

  function resetGroupBody(details) {
    var body = groupBody(details);
    if (!body) return;
    body.style.height = '';
    body.style.overflow = '';
  }

  function cancelDetailsAnim(details) {
    var anim = detailsAnim.get(details);
    if (anim) {
      detailsAnim.delete(details);
      try { anim.cancel(); } catch (e) {}
    }
    resetGroupBody(details);
  }

  function finishDetailsAnim(details, open) {
    details.open = open;
    if (open) activeDetails = details;
    else if (activeDetails === details) activeDetails = null;
    detailsPhase = 'idle';
    resetGroupBody(details);
    reconcileDetails();
  }

  function runDetailsAnim(details, open) {
    var body = groupBody(details);
    if (!body || !canAnimate()) {
      cancelDetailsAnim(details);
      finishDetailsAnim(details, open);
      return;
    }
    var running = detailsAnim.get(details);
    var current = 0;
    if (running) {
      try { current = parseFloat(window.getComputedStyle(body).height); } catch (e) { current = NaN; }
      if (!isFinite(current)) current = body.getBoundingClientRect().height;
      detailsAnim.delete(details);
      try { running.cancel(); } catch (e) {}
    } else if (details.open) {
      current = body.getBoundingClientRect().height;
    }
    resetGroupBody(details);
    if (open) {
      details.open = true;
      activeDetails = details;
    } else if (!details.open) {
      finishDetailsAnim(details, false);
      return;
    }
    var target = open ? body.getBoundingClientRect().height : 0;
    if (Math.abs(target - current) < 1) {
      finishDetailsAnim(details, open);
      return;
    }
    detailsPhase = open ? 'opening' : 'closing';
    body.style.overflow = 'hidden';
    body.style.height = current + 'px';
    var anim = body.animate(
      [{ height: current + 'px' }, { height: target + 'px' }],
      { duration: MOTION_MS, easing: 'cubic-bezier(.4, 0, .2, 1)' }
    );
    detailsAnim.set(details, anim);
    anim.onfinish = function () {
      if (detailsAnim.get(details) !== anim) return;
      detailsAnim.delete(details);
      finishDetailsAnim(details, open);
    };
  }

  function reconcileDetails() {
    if (activeDetails) {
      if (activeDetails === desiredDetails) {
        if (detailsPhase === 'closing') runDetailsAnim(activeDetails, true);
        return;
      }
      if (detailsPhase === 'closing') return;
      runDetailsAnim(activeDetails, false);
      return;
    }
    if (desiredDetails) runDetailsAnim(desiredDetails, true);
  }

  function bindDetails(container) {
    if (!container) return;
    var groups = container.querySelectorAll('details.oc-group');
    Array.prototype.forEach.call(groups, function (details) {
      var summary = details.querySelector('summary');
      if (!summary) return;
      summary.addEventListener('click', function (e) {
        if (e.defaultPrevented) return;
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        desiredDetails = desiredDetails === details ? null : details;
        reconcileDetails();
      });
    });
  }

  /* ------------------------------------------------------------------
   * 鎖式
   * ------------------------------------------------------------------ */
  function buildChainFamilyList() {
    els.chainFamilyList.innerHTML = C.CHAIN_FAMILIES.map(function (f) {
      return '<button type="button" class="oc-pick" data-chain-family="' + esc(f.id) + '" aria-pressed="false">' +
        '<span class="oc-pick__label">' + esc(f.label) + '</span>' +
        '<span class="oc-tag oc-tag--count" data-chain-count="' + esc(f.id) + '">—</span></button>';
    }).join('');
  }

  var STRUCTURE_OPTIONS = [
    { id: 'saturated', label: '飽和鎖式' },
    { id: 'unsaturated', label: '不飽和鎖式' },
    { id: 'all', label: 'すべて' }
  ];

  function buildChainStructureList() {
    if (!els.chainStructureList) return;
    els.chainStructureList.innerHTML = STRUCTURE_OPTIONS.map(function (o) {
      return '<button type="button" class="oc-seg__btn" data-chain-structure="' + o.id + '" aria-pressed="false">' + esc(o.label) + '</button>';
    }).join('');
  }

  function structureLabel(id) {
    var o = STRUCTURE_OPTIONS.filter(function (x) { return x.id === id; })[0];
    return o ? o.label : id;
  }

  function syncChainStructure() {
    if (!els.chainStructureList) return;
    els.chainStructureList.querySelectorAll('[data-chain-structure]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-chain-structure') === state.chainStructure ? 'true' : 'false');
    });
  }

  function ensureFamilyStructure(family) {
    // アルケン/アルキンは不飽和、アルカンは飽和が自然な初期条件。
    // 多官能familyは「すべて」で表示し、単官能条件の0件と混同しない。
    var next = state.chainStructure;
    if ((family === 'alkene' || family === 'alkyne') && next === 'saturated') next = 'unsaturated';
    else if ((family === 'alkane' || family === 'polyol') && next === 'unsaturated') next = 'saturated';
    else if (family === 'amino-alcohol' && next === 'saturated') next = 'all';
    if (next !== state.chainStructure) {
      state.chainStructure = next;
      state.notice = '「' + familyName(family) + '」に合わせて構造条件を「' + structureLabel(next) + '」に切り替えました。';
    }
  }

  function renderCarbonList() {
    var options = C.carbonOptions(state.chainFamily);
    if (!options.length) options = [state.chainCarbon];
    if (options.indexOf(state.chainCarbon) === -1) state.chainCarbon = options[0];
    els.carbonList.innerHTML = options.map(function (n) {
      return '<button type="button" class="oc-carbon' + (n === state.chainCarbon ? ' is-current' : '') +
        '" data-carbon="' + n + '" aria-pressed="' + (n === state.chainCarbon ? 'true' : 'false') + '">' +
        '<span class="oc-carbon__main">C' + n + '</span>' +
        '<span class="oc-carbon__sub">' + n + '個</span></button>';
    }).join('');
    var f = C.CHAIN_FAMILY_LABEL[state.chainFamily] || state.chainFamily;
    els.chainSelection.textContent = '選択中: 鎖式 ／ 総炭素数 C' + state.chainCarbon + ' ／ ' + f +
      ' ／ 構造: ' + structureLabel(state.chainStructure);
  }

  function syncChainCounts() {
    C.CHAIN_FAMILIES.forEach(function (f) {
      var el = els.chainFamilyList.querySelector('[data-chain-count="' + f.id + '"]');
      if (!el) return;
      var n = C.chainIdsFor(f.id, state.chainCarbon, state.chainStructure).length;
      el.textContent = n ? String(n) : '—';
    });
    els.chainFamilyList.querySelectorAll('[data-chain-family]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-chain-family') === state.chainFamily ? 'true' : 'false');
    });
  }

  function genCard(title, formula, meta, note, empty) {
    return '<article class="oc-gen' + (empty ? ' is-empty' : '') + '">' +
      '<div class="oc-gen__head"><span class="oc-gen__name">' + esc(title) + '</span>' +
      '<span class="oc-gen__badge' + (empty ? ' is-muted' : '') + '">' + esc(meta) + '</span></div>' +
      '<div class="oc-gen__formula">' + esc(formula) + '</div>' +
      '<p class="oc-gen__note">' + esc(note) + '</p></article>';
  }

  function renderChainPreview() {
    var family = state.chainFamily;
    var c = state.chainCarbon;
    var rawIds = C.chainIds(family, c);
    var ids = C.chainIdsFor(family, c, state.chainStructure);
    var label = C.CHAIN_FAMILY_LABEL[family] || family;
    var html = '<span class="oc-preview__label">' + esc(label) + 'の一般構造</span>' +
      '<p class="oc-gen-lead">構造条件: <b>' + esc(structureLabel(state.chainStructure)) + '</b>（' +
      esc('飽和/不飽和はC=C・C≡Cのみで判定。一価/多価は分類で分離') + '）</p>';

    if (family === 'amine') {
      var counts = [1, 2, 3].map(function (degree) {
        return ids.filter(function (id) { return (C.AMINE_DEGREE[id] || 0) === degree; }).length;
      });
      html += '<p class="oc-gen-lead">Nに結合する炭化水素基の数で級が決まります。一般構造は常に3つ表示し、該当しない級は条件不足と明記します。</p>' +
        '<div class="oc-gen-grid">' +
        genCard('第一級アミン', 'R–NH₂', counts[0] + ' 種', 'NにRが1つ。総炭素数はRの炭素数の合計。', counts[0] === 0) +
        genCard('第二級アミン', 'R–NH–R′', counts[1] + ' 種', 'NにRが2つ。左右を入れ替えても同じ化合物。', counts[1] === 0) +
        genCard('第三級アミン', 'R–N(R′)–R″', counts[2] + ' 種',
          counts[2] === 0 ? (c < 3 ? '条件不足: 第三級アミンはNに3つの炭素が必要で、総炭素数3以上で表示されます。' : 'この条件では0種。') : 'NにRが3つ。',
          counts[2] === 0) +
        '</div>';
      els.chainPreview.innerHTML = html;
      return;
    }

    var general = {
      ether: ['R–O–R′', '炭素を2つのRに分けて数える。C–C結合を保つ表記ではなく、合成手順でもない。'],
      alcohol: ['R–OH', '一価アルコール。O–Hの結合線は省略し、OHとまとめて表す。'],
      polyol: ['R–(OH)ₙ（n≥2）', '多価アルコール。OH数は飽和/不飽和とは独立で、C=C・C≡Cの有無は構造条件で判定する。'],
      carboxylic: ['R–COOH', 'COOHの炭素も総炭素数に含める。'],
      ester: ['R–COO–R′', 'カルボン酸とアルコールの脱水縮合でできる構造。'],
      aldehyde: ['R–CHO', '末端のカルボニル基。'],
      ketone: ['R–CO–R′', 'C=Oが炭素鎖の途中にある。'],
      nitrile: ['R–C≡N', 'CNの炭素も総炭素数に含める。'],
      halogen: ['R–X', 'XはCl・Br・I。ハロゲン化アルキル・ハロゲン化アルケニルを含む。'],
      alkene: ['R–CH=CH₂ / R–CH=CH–R′', 'C=Cを1本以上もつ鎖式炭化水素。'],
      alkyne: ['R–C≡CH / R–C≡C–R′', 'C≡Cを1本以上もつ鎖式炭化水素。'],
      alkane: ['C' + c + 'H' + (2 * c + 2), '単結合だけの鎖式炭化水素。'],
      nitro: ['R–NO₂', 'ニトロ基を炭素に結合した化合物。'],
      anhydride: ['R–CO–O–CO–R′', '2分子のカルボン酸から水がとれた構造。'],
      'amino-alcohol': ['HO–R–NH₂', 'アミノ基とヒドロキシ基を併せもつ多官能化合物。モノアミン R–NH₂ の飽和一般式とは別に扱う。']
    }[family] || ['—', ''];

    html += '<div class="oc-gen-grid">' +
      genCard(label, general[0], ids.length ? ids.length + ' 種' : '0 種', general[1], !ids.length) +
      '</div>';
    if (family === 'ether') {
      var splits = [];
      for (var a = 1; a <= c - 1; a++) {
        var b = c - a;
        if (a > b) continue;
        splits.push('C' + a + ' + C' + b);
      }
      html += '<div class="oc-note-box"><p><b>C–C結合を保つ表記ではありません。</b> R–O–R′ は、エタンなどのC–C結合を残したままOを差し込む、という骨格の見方ではありません。炭素を2つのRに分けて数え、実際の合成手順を示すものでもありません。</p>' +
        (splits.length ? '<p>この条件の分け方: <b>' + esc(splits.join(' / ')) + '</b>（左右を入れ替えた同じ化合物は重複して数えない）。</p>' : '') + '</div>';
    } else if (family === 'alcohol' || family === 'carboxylic' || family === 'ester' || family === 'nitrile') {
      html += '<div class="oc-note-box"><p>官能基の炭素を含めた分子全体の総炭素数で抽出しています。同じ総炭素数でも、官能基が異なる異性体（例: エタノールとジメチルエーテル）は別のfamilyに分け、同じ結果一覧に混ぜません。</p></div>';
    }
    if (!ids.length) {
      html += '<p class="oc-preview__hint">' +
        (rawIds.length
          ? 'この構造条件では0件ですが、同じ総炭素数・分類の登録済み化合物は ' + rawIds.length + ' 件あります。構造条件を「すべて」または該当する条件に切り替えてください（未収録ではありません）。'
          : 'この条件に該当する登録済み化合物はありません。化学的に存在しないという意味ではなく、教材範囲内の登録データに該当がない状態です。') +
        '</p>';
    }
    els.chainPreview.innerHTML = html;
  }

  function renderChainResults() {
    var family = state.chainFamily;
    var c = state.chainCarbon;
    var rawIds = C.chainIds(family, c);
    var ids = C.chainIdsFor(family, c, state.chainStructure);
    var label = C.CHAIN_FAMILY_LABEL[family] || family;
    els.resultDescription.textContent = '鎖式 ／ 総炭素数 C' + c + ' ／ ' + label + ' ／ 構造: ' + structureLabel(state.chainStructure);
    els.resultCount.textContent = ids.length + ' 種類';
    if (!ids.length) {
      var hint = family === 'amine' && c < 3
        ? '第三級アミンはNに3つの炭素が必要なため、総炭素数' + c + 'では条件不足です。'
        : (rawIds.length
          ? '構造条件「' + structureLabel(state.chainStructure) + '」では0件ですが、同じ総炭素数・分類の登録済み化合物は ' + rawIds.length + ' 件あります。構造条件を「すべて」または該当する条件に切り替えてください。未収録・化学的不存在ではありません。'
          : 'この条件に該当する登録済み化合物がありません。化学的に存在しない、または高校外であると断定せず、登録データの範囲を示しています。');
      els.results.innerHTML = '<div class="oc-empty"><strong>この条件では0種類です</strong><p>' + esc(hint) + '</p>' +
        '<p>条件を変えるか、<a href="./ledger.html">収録台帳</a>で登録範囲を確認してください。</p></div>';
      return;
    }

    var html = '';
    if (family === 'amine') {
      [1, 2, 3].forEach(function (degree) {
        var group = ids.filter(function (id) { return (C.AMINE_DEGREE[id] || 0) === degree; });
        var title = degree === 1 ? '第一級アミン' : (degree === 2 ? '第二級アミン' : '第三級アミン');
        html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">' + title + ' <span class="oc-micro">' + group.length + ' 種</span></h4>';
        if (!group.length) {
          html += '<p class="oc-empty-note">この条件では0種。' +
            (degree === 3 && c < 3 ? '第三級アミンはNに3つの炭素が必要なため、総炭素数3以上で表示されます。' : '該当する登録済み化合物はありません。') + '</p>';
        } else {
          html += '<div class="oc-cards' + (group.length === 1 ? ' oc-cards--single' : '') + '">' +
            group.map(function (id) { return renderCard(D.COMPOUNDS[id], { mode: 'chain' }); }).join('') + '</div>';
        }
        html += '</div>';
      });
    } else {
      // 同じ総炭素数・同じ分類でも、多価アルコールやエノールなど分子式が異なる場合がある。
      // 分子式ごとに分け、異性体の比較と別組成の混在を区別する。
      var byFormula = {};
      var formulaOrder = [];
      ids.forEach(function (id) {
        var f = D.COMPOUNDS[id].formula;
        if (!byFormula[f]) { byFormula[f] = []; formulaOrder.push(f); }
        byFormula[f].push(id);
      });
      formulaOrder.sort();
      formulaOrder.forEach(function (formula) {
        var group = byFormula[formula];
        html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">' + esc(R.formatFormula(formula)) +
          ' <span class="oc-micro">' + group.length + ' 種</span></h4>' +
          '<div class="oc-cards' + (group.length === 1 ? ' oc-cards--single' : '') + '">' +
          group.map(function (id) { return renderCard(D.COMPOUNDS[id], { mode: 'chain' }); }).join('') + '</div></div>';
      });
    }
    if (rawIds.length > ids.length) {
      html += '<p class="oc-results__note">※ 構造条件「' + esc(structureLabel(state.chainStructure)) + '」により ' +
        (rawIds.length - ids.length) + ' 件を表示から除外しています。未収録・化学的不存在ではありません。「すべて」で全登録を確認できます。</p>';
    }
    html += resultsNote();
    els.results.innerHTML = html;
    focusResultCard();
  }

  /* ------------------------------------------------------------------
   * 芳香族・環式
   * ------------------------------------------------------------------ */
  function ringSystem() {
    return C.RING_SYSTEM_MAP[state.ringSystem] || C.RING_SYSTEMS[0];
  }

  function buildRingList() {
    var byKind = [
      { key: '芳香族', label: '芳香族（固定した環）' },
      { key: '環式', label: '環式（シクロアルカン・シクロアルケン）' },
      { key: '複合', label: '複合芳香族・その他' }
    ];
    var groups = { '芳香族': [], '環式': [], '複合': [] };
    C.RING_SYSTEMS.forEach(function (rs) {
      var key = rs.kind === 'aromatic' || rs.kind === 'aromatic-fused' ? '芳香族' : (rs.kind === 'complex' ? '複合' : '環式');
      groups[key].push(rs);
    });
    var html = '';
    byKind.forEach(function (section, idx) {
      var open = groups[section.key].some(function (rs) { return rs.id === state.ringSystem; });
      html += '<details class="oc-group" ' + (open ? 'open' : '') + '><summary>' + esc(section.label) +
        ' <span class="oc-tag">' + groups[section.key].length + '</span></summary><div class="oc-group__body">';
      groups[section.key].forEach(function (rs) {
        html += '<button type="button" class="oc-pick" data-ring-system="' + esc(rs.id) + '" aria-pressed="false">' +
          '<span class="oc-pick__label">' + esc(rs.label) + '</span>' +
          '<span class="oc-tag">' + (rs.baseCarbon ? 'C' + rs.baseCarbon : '複合') + '</span></button>';
      });
      html += '</div></details>';
    });
    els.ringList.innerHTML = html;
    activeDetails = els.ringList.querySelector('details.oc-group[open]');
    desiredDetails = activeDetails;
    detailsPhase = 'idle';
    bindDetails(els.ringList);
  }

  function availableRingGroups(rs) {
    if (!rs.skeletonId || !D.COMBOS[rs.skeletonId]) return [];
    var groups = [];
    Object.keys(D.COMBOS[rs.skeletonId]).forEach(function (gid) {
      if ((D.COMBOS[rs.skeletonId][gid] || []).length) groups.push(gid);
    });
    return groups;
  }

  function renderRingGroupList() {
    var rs = ringSystem();
    var groups = availableRingGroups(rs);
    if (!groups.length) {
      els.ringGroupList.innerHTML = '<p class="oc-empty-note">この骨格は一置換生成の登録がありません。登録済みの化合物を結果に表示します。</p>';
      return;
    }
    els.ringGroupList.innerHTML = groups.map(function (gid) {
      var g = D.groupById(gid);
      return '<button type="button" class="oc-pick" data-ring-group="' + esc(gid) + '" aria-pressed="false">' +
        '<span class="oc-pick__label">' + esc(g ? g.label : gid) + '</span>' +
        '<span class="oc-tag oc-tag--count">' + ((D.COMBOS[rs.skeletonId][gid] || []).length) + '</span></button>';
    }).join('');
  }

  function syncRing() {
    var rs = ringSystem();
    els.ringList.querySelectorAll('[data-ring-system]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-ring-system') === rs.id ? 'true' : 'false');
    });
    var groups = availableRingGroups(rs);
    if (groups.length && groups.indexOf(state.ringGroup) === -1) state.ringGroup = groups[0];
    if (!groups.length) state.ringGroup = 'none';
    els.ringGroupList.querySelectorAll('[data-ring-group]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-ring-group') === state.ringGroup ? 'true' : 'false');
    });
    var carbonText = rs.baseCarbon ? 'C' + rs.baseCarbon : '複合';
    els.ringSelection.textContent = '選択中: 芳香族・環式 ／ ' + rs.label + '（' + carbonText + '）' +
      (groups.length ? ' ／ ' + groupLabel(state.ringGroup) : ' ／ 置換基生成なし');
    renderRingGroupList();
  }

  function baseRingStructure(rs) {
    if (rs.id === 'benzene') return D.COMPOUNDS.benzene.structure;
    if (rs.id === 'naphthalene') return D.COMPOUNDS.naphthalene.structure;
    if (rs.id === 'cyclopropane') return D.COMPOUNDS.cyclopropane.structure;
    if (rs.id === 'cyclobutane') return D.COMPOUNDS.cyclobutane.structure;
    if (rs.id === 'cyclopentane') return D.COMPOUNDS.cyclopentane.structure;
    if (rs.id === 'cyclohexane') return D.COMPOUNDS.cyclohexane.structure;
    if (rs.id === 'cyclohexene') return D.COMPOUNDS.cyclohexene.structure;
    if (rs.id === 'anthracene') return D.COMPOUNDS.anthracene.structure;
    return null;
  }

  function renderRingPreview() {
    var rs = ringSystem();
    var groups = availableRingGroups(rs);
    var base = baseRingStructure(rs);
    var html = '<span class="oc-preview__label">固定した骨格</span>';
    html += '<div class="oc-ring-preview">' +
      '<div class="oc-ring-preview__fig">' + (base ? R.renderStructure(base, rs.label + 'の構造') : '<p class="oc-preview__hint">複合芳香族・その他の環は、下の結果で個別の構造を表示します。</p>') + '</div>' +
      '<div class="oc-ring-preview__meta"><strong>' + esc(rs.label) + '</strong><p>' + esc(rs.note) + '</p>' +
      '<p class="oc-micro">' + (rs.baseCarbon ? '環の炭素数 ' + rs.baseCarbon + ' を固定' : '固定した単一骨格としては扱わない') + '</p></div></div>';
    if (groups.length) {
      var gid = state.ringGroup;
      var g = D.groupById(gid);
      var entries = ((D.COMBOS[rs.skeletonId] || {})[gid] || []);
      html += '<div class="oc-ring-preview__sub"><b>置換基:</b> ' + esc(g ? g.label : gid) + ' ／ ' +
        '<b>一置換生成:</b> ' + entries.length + ' 種</div>';
      if (gid !== 'none' && g) {
        html += '<p class="oc-panel-foot">' + esc(g.description) + ' Rは環との結合位置を表します。環の炭素数は変わりません。</p>';
      }
    }
    els.ringPreview.innerHTML = html;
    els.ringFoot.textContent = groups.length
      ? '置換基が変わっても、固定した環の炭素数はそのままです。登録済みの多置換体は、一置換生成とは別familyとして結果に表示します。'
      : 'この骨格は一置換生成の登録がありません。結果には登録済みの化合物を表示します。';
  }

  function renderRingResults() {
    var rs = ringSystem();
    var groups = availableRingGroups(rs);
    var generated = [];
    if (groups.length) {
      generated = ((D.COMBOS[rs.skeletonId] || {})[state.ringGroup] || []).map(function (e) { return e.id; });
    }
    var showRegistered = state.ringGroup === 'none' || !groups.length;
    var registered = showRegistered
      ? rs.registeredSingle.concat(rs.registeredMulti, rs.registeredOther)
      : [];
    var total = generated.length + registered.length;
    els.resultDescription.textContent = '芳香族・環式 ／ ' + rs.label + (groups.length ? ' ／ ' + groupLabel(state.ringGroup) : ' ／ 置換基生成なし');
    els.resultCount.textContent = total + ' 種類';

    var html = '';
    if (generated.length) {
      html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">一置換体（固定した環のHを置換） <span class="oc-micro">' + generated.length + ' 種</span></h4>' +
        '<div class="oc-cards' + (generated.length === 1 ? ' oc-cards--single' : '') + '">' +
        generated.map(function (id) { return renderCard(D.COMPOUNDS[id], { mode: 'ring' }); }).join('') + '</div></div>';
    } else if (groups.length) {
      html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">一置換体（固定した環のHを置換）</h4>' +
        '<p class="oc-empty-note">この置換基の一置換生成は登録されていません。</p></div>';
    }

    if (rs.registeredMulti.length && (state.ringGroup === 'none' || !groups.length)) {
      html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">登録済みの多置換体（一置換生成とは別family） <span class="oc-micro">' + rs.registeredMulti.length + ' 種</span></h4>' +
        '<p class="oc-subgroup__note">多置換体は、一置換生成の結果に混ぜず、別familyとして表示します。</p>' +
        '<div class="oc-cards">' + rs.registeredMulti.map(function (id) { return renderCard(D.COMPOUNDS[id], { mode: 'ring', multi: true }); }).join('') + '</div></div>';
    }

    if (rs.registeredSingle.length && (state.ringGroup === 'none' || !groups.length)) {
      html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">登録済みの一置換誘導体（組合せ生成とは別） <span class="oc-micro">' + rs.registeredSingle.length + ' 種</span></h4>' +
        '<div class="oc-cards">' + rs.registeredSingle.map(function (id) { return renderCard(D.COMPOUNDS[id], { mode: 'ring' }); }).join('') + '</div></div>';
    }

    if (rs.registeredOther.length && (state.ringGroup === 'none' || !groups.length)) {
      html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">登録済みの関連化合物 <span class="oc-micro">' + rs.registeredOther.length + ' 種</span></h4>' +
        '<div class="oc-cards">' + rs.registeredOther.map(function (id) { return renderCard(D.COMPOUNDS[id], { mode: 'ring' }); }).join('') + '</div></div>';
    }

    if (!html) {
      html = '<div class="oc-empty"><strong>この条件では0種類です</strong><p>固定した環と置換基の組合せに、登録済みの化合物がありません。化学的に成立しない、または高校外であると断定せず、登録データの範囲を示しています。</p></div>';
    }
    html += resultsNote();
    els.results.innerHTML = html;
    focusResultCard();
  }

  /* ------------------------------------------------------------------
   * その他
   * ------------------------------------------------------------------ */
  function otherCategory() {
    return C.OTHER_CATEGORIES.filter(function (x) { return x.id === state.otherCategory; })[0] || C.OTHER_CATEGORIES[0];
  }

  function buildOtherCategoryList() {
    els.otherCategoryList.innerHTML = C.OTHER_CATEGORIES.map(function (cat) {
      var groups = C.otherFamilies(cat.id);
      return '<button type="button" class="oc-pick" data-other-category="' + esc(cat.id) + '" aria-pressed="false">' +
        '<span class="oc-pick__label">' + esc(cat.label) + '</span>' +
        '<span class="oc-tag oc-tag--count">' + groups.length + '</span></button>';
    }).join('');
  }

  function buildOtherFamilyList() {
    var cat = otherCategory();
    var groups = C.otherFamilies(cat.id);
    if (!groups.some(function (g) { return g.id === state.otherFamily; })) {
      state.otherFamily = groups[0] ? groups[0].id : '';
    }
    els.otherFamilyList.innerHTML = groups.map(function (g) {
      var n = C.otherMembers(g.id).length + (g.familyIds || []).length + (g.materialIds || []).length;
      return '<button type="button" class="oc-pick" data-other-family="' + esc(g.id) + '" aria-pressed="false">' +
        '<span class="oc-pick__label">' + esc(g.label) + '</span>' +
        '<span class="oc-tag oc-tag--count">' + n + '</span></button>';
    }).join('');
    els.otherFamilyList.querySelectorAll('[data-other-family]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-other-family') === state.otherFamily ? 'true' : 'false');
    });
    var catLabel = cat.label;
    var fam = C.OTHER_GROUP_MAP[state.otherFamily];
    els.otherSelection.textContent = '選択中: その他 ／ ' + catLabel + ' ／ ' + (fam ? fam.label : '—');
  }

  function syncOther() {
    els.otherCategoryList.querySelectorAll('[data-other-category]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-other-category') === state.otherCategory ? 'true' : 'false');
    });
    buildOtherFamilyList();
  }

  function renderOtherPreview() {
    var cat = otherCategory();
    var fam = C.OTHER_GROUP_MAP[state.otherFamily] || {};
    var html = '<span class="oc-preview__label">' + esc(fam.label || 'family') + '</span>';
    html += '<div class="oc-gen-grid">' + genCard(fam.label || '—',
      fam.familyIds ? 'family' : (fam.materialIds ? '材料・混合物' : C.otherMembers(fam.id).length + ' 種'),
      cat.label,
      fam.familyIds ? '単一の固定分子式をもたないfamilyとして、説明と代表構造を表示します。' :
        (fam.materialIds ? '純物質カードとは区別し、材料・混合物として説明を表示します。' : '同じfamilyに属する登録済み化合物をまとめて表示します。'),
      false) + '</div>';
    html += '<p class="oc-panel-foot">' + esc(cat.note) + '</p>';
    els.otherPreview.innerHTML = html;
  }

  function renderOtherResults() {
    var cat = otherCategory();
    var fam = C.OTHER_GROUP_MAP[state.otherFamily] || { label: '—' };
    var ids = C.otherMembers(state.otherFamily);
    var familyIds = fam.familyIds || [];
    var materialIds = fam.materialIds || [];
    var total = ids.length + familyIds.length + materialIds.length;
    els.resultDescription.textContent = 'その他 ／ ' + cat.label + ' ／ ' + fam.label;
    els.resultCount.textContent = total + ' 件';
    var html = '<div class="oc-subgroup"><h4 class="oc-subgroup__title">' + esc(fam.label) + ' <span class="oc-micro">' + total + ' 件</span></h4>';
    if (ids.length) {
      html += '<div class="oc-cards' + (ids.length === 1 ? ' oc-cards--single' : '') + '">' +
        ids.map(function (id) { return renderCard(D.COMPOUNDS[id], { mode: 'other' }); }).join('') + '</div>';
    }
    if (familyIds.length) {
      html += '<div class="oc-cards">' + familyIds.map(function (fid) { return renderFamilyCard(D.familyById(fid)); }).join('') + '</div>';
    }
    if (materialIds.length) {
      html += '<div class="oc-cards">' + materialIds.map(function (mid) { return renderMaterialCard(D.materialById(mid)); }).join('') + '</div>';
    }
    if (!total) {
      html += '<p class="oc-empty-note">このfamilyには代表化合物・材料の登録がありません。familyの説明のみ表示しています。</p>';
    }
    html += '</div>' + resultsNote();
    els.results.innerHTML = html;
    focusResultCard();
  }

  /* ------------------------------------------------------------------
   * カード
   * ------------------------------------------------------------------ */
  function fact(label, value, opts) {
    opts = opts || {};
    var missing = !value || value === '情報未登録';
    var cls = 'oc-fact' + (missing ? ' oc-fact--missing' : '') + (opts.warn ? ' oc-fact--warn' : '');
    return '<div class="' + cls + '"><strong>' + esc(label) + '</strong><span>' +
      esc(missing ? '情報未登録' : value) + '</span></div>';
  }

  function factRaw(label, html, opts) {
    opts = opts || {};
    var missing = !html;
    var cls = 'oc-fact' + (missing ? ' oc-fact--missing' : '') + (opts.warn ? ' oc-fact--warn' : '');
    return '<div class="' + cls + '"><strong>' + esc(label) + '</strong><span>' +
      (missing ? '情報未登録' : html) + '</span></div>';
  }

  function renderCard(c, opts) {
    opts = opts || {};
    var check = validation[c.id] || {};
    if (!check.ok) {
      return '<article class="oc-empty oc-empty--error" id="c-' + esc(c.id) + '"><strong>登録データの検証に失敗しました</strong>' +
        '<p>' + esc(c.name) + '（' + esc(c.id) + '）: ' + esc((check.errors || ['検証結果がありません']).join(' / ')) +
        '</p><p>範囲外の組み合わせとして扱わず、データ不備として表示を停止しています。</p></article>';
    }
    var cat = D.categoryById(c.category);
    var catLabel = cat ? cat.name : c.category;
    if (c.subcategory) catLabel += '・' + c.subcategory;
    var v = validation[c.id] || {};
    var verificationShort = v.verification ? v.verification.short : '未確認';
    var formulaText = c.formulaDisplay || R.formatFormula(c.formula);
    var formulaLabel = c.formulaVariable ? '組成・一般式' : '分子式';
    var badges = ['<span class="oc-badge">' + esc(modeLabel(opts.mode || 'other')) + '</span>'];
    if (opts.multi) badges.push('<span class="oc-badge">多置換体</span>');
    if (c.figures && c.figures.length > 1) badges.push('<span class="oc-badge">' + c.figures.length + '形態</span>');
    var note = c.notes || '';
    var pubchem = c.pubchem
      ? '<a href="https://pubchem.ncbi.nlm.nih.gov/compound/' + encodeURIComponent(c.pubchem) +
        '" target="_blank" rel="noopener">出典: PubChem CID ' + esc(c.pubchem) + '</a>'
      : '<span>出典: 収録台帳を参照</span>';
    return '<article class="oc-card" id="c-' + esc(c.id) + '">' +
      '<div class="oc-card__top">' +
        '<div class="oc-card__eyebrow"><span>' + esc(catLabel) + '</span>' + badges.join('') + '</div>' +
        '<h3 class="oc-card__name">' + esc(c.name) + '</h3>' +
        '<div class="oc-card__formula">' + formulaLabel + '：' + esc(formulaText) + '</div>' +
      '</div>' +
      '<div class="oc-card__figs' + (c.figures && c.figures.length >= 3 ? ' oc-card__figs--stack' : '') + '">' + R.renderCompound(c) + '</div>' +
      '<div class="oc-facts">' +
        fact('性質', c.properties) +
        fact('主な用途', c.uses) +
        fact('自然界・由来', c.nature) +
        (c.precursors ? fact('主な前駆体・生成', c.precursors) : '') +
        (c.reactions ? fact('主な反応', c.reactions) : '') +
        (c.hazards ? fact('危険性', c.hazards, { warn: true }) : '') +
      '</div>' +
      (note ? '<p class="oc-card__note">' + esc(note) + '</p>' : '') +
      '<div class="oc-card__foot"><span class="oc-verify">検証: ' + esc(verificationShort) + '</span>' + pubchem +
        '<a href="./ledger.html#c-' + encodeURIComponent(c.id) + '">収録台帳で見る →</a></div>' +
      '</article>';
  }

  function routeHref(id) {
    var r = C.routeFor(id);
    if (!r) return './?focus=' + encodeURIComponent(id);
    var q = ['mode=' + encodeURIComponent(r.mode)];
    if (r.mode === 'chain') {
      q.push('family=' + encodeURIComponent(r.family));
      q.push('c=' + encodeURIComponent(r.carbon));
      if (r.structure) q.push('structure=' + encodeURIComponent(r.structure));
    } else if (r.mode === 'ring') {
      q.push('system=' + encodeURIComponent(r.system));
      if (r.group) q.push('group=' + encodeURIComponent(r.group));
    } else {
      q.push('category=' + encodeURIComponent(r.category));
      if (r.family) q.push('family=' + encodeURIComponent(r.family));
    }
    q.push('focus=' + encodeURIComponent(id));
    return './index.html?' + q.join('&');
  }

  function renderFamilyCard(f) {
    if (!f) return '';
    var formula = f.formula || f.formulaNote || '組成依存';
    var structure = f.structure ? R.renderStructure(f.structure, f.name + 'の代表構造') : '';
    var memberLinks = (f.members || []).filter(function (id) { return D.COMPOUNDS[id]; }).map(function (id) {
      return '<a href="' + esc(routeHref(id)) + '">' + esc(compoundName(id)) + '</a>';
    }).join('、');
    var relatedFamilyLinks = (f.relatedFamilyIds || []).filter(function (id) { return D.familyById(id); }).map(function (id) {
      return '<a href="./ledger.html#f-' + encodeURIComponent(id) + '">' + esc(D.familyById(id).name) + '</a>';
    }).join('、');
    var relatedMaterialLinks = (f.relatedMaterialIds || []).filter(function (id) { return D.materialById(id); }).map(function (id) {
      return '<a href="./ledger.html#m-' + encodeURIComponent(id) + '">' + esc(D.materialById(id).name) + '</a>';
    }).join('、');
    return '<article class="oc-card oc-family-card" id="f-' + esc(f.id) + '">' +
      '<div class="oc-card__top"><div class="oc-card__eyebrow"><span>' + esc(f.kind || 'family') + '</span>' +
      '<span class="oc-badge">family</span></div>' +
      '<h3 class="oc-card__name">' + esc(f.name) + '</h3>' +
      '<div class="oc-card__formula">' + esc(formula) + '</div></div>' +
      (structure ? '<div class="oc-card__figs">' + structure + '</div>' : '') +
      '<div class="oc-facts">' + fact('概要', f.summary) + fact('説明', f.description) +
      factRaw('代表例', memberLinks || '') +
      (relatedFamilyLinks ? factRaw('関連family', relatedFamilyLinks) : '') +
      (relatedMaterialLinks ? factRaw('関連材料', relatedMaterialLinks) : '') + '</div>' +
      '<div class="oc-card__foot"><span class="oc-verify">単一の固定分子式をもたない区分</span>' +
      '<a href="./ledger.html#f-' + encodeURIComponent(f.id) + '">収録台帳で見る →</a></div></article>';
  }

  function renderMaterialCard(m) {
    if (!m) return '';
    var ofName = m.of && D.COMPOUNDS[m.of] ? D.COMPOUNDS[m.of].name : null;
    var syn = (m.synonyms || []).join('、');
    return '<article class="oc-card oc-family-card" id="m-' + esc(m.id) + '">' +
      '<div class="oc-card__top"><div class="oc-card__eyebrow"><span>材料・混合物</span><span class="oc-badge">' + esc(m.kind || 'material') + '</span></div>' +
      '<h3 class="oc-card__name">' + esc(m.name) + '</h3>' +
      '<div class="oc-card__formula">' + esc(m.kind === 'variant' ? '置換度variant' : (m.kind === 'mixture' || m.kind === 'reagent-mixture' ? '混合物・試薬' : '材料')) + '</div></div>' +
      '<div class="oc-facts">' + fact('説明', m.note) + fact('関連する純物質', ofName || '—') + fact('別名', syn || '—') + '</div>' +
      '<div class="oc-card__foot"><span class="oc-verify">純物質カードとは区別</span>' +
      (m.of && D.COMPOUNDS[m.of] ? '<a href="./?focus=' + encodeURIComponent(m.of) + '">関連する純物質を開く →</a>' : '') +
      '<a href="./ledger.html#m-' + encodeURIComponent(m.id) + '">収録台帳で見る →</a></div></article>';
  }

  function categoryForCompound(id) {
    var r = C.routeFor(id);
    if (!r) return 'other';
    if (r.mode === 'other') return r.category;
    if (r.mode === 'chain') return 'chain';
    return 'ring';
  }

  function resultsNote() {
    return '<p class="oc-results__note">※ グラフ構造は原子数・結合価・分子式を自動照合し、環＋置換・投影式・簡略式・トリグリセリド・重合体は分子式・一般式と登録データの整合を確認しています。模式図・可変組成は表示式のみで、原子レベルの検証対象外です。描画の見た目は自動検証の対象外です。実際の合成手順・実験操作を示すものではありません。</p>';
  }

  function focusResultCard() {
    if (!state.focus) return;
    var el = document.getElementById('c-' + state.focus) || document.getElementById('f-' + state.focus) || document.getElementById('m-' + state.focus);
    state.focus = '';
    if (!el) return;
    el.classList.add('oc-card--focus');
    try {
      el.scrollIntoView({ block: 'center', behavior: canAnimate() ? 'smooth' : 'auto' });
    } catch (e) {
      try { el.scrollIntoView(); } catch (e2) {}
    }
  }

  /* ------------------------------------------------------------------
   * モード・更新
   * ------------------------------------------------------------------ */
  function syncMode() {
    document.querySelectorAll('[data-mode]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === state.mode ? 'true' : 'false');
    });
    els.chainPanels.hidden = state.mode !== 'chain';
    els.ringPanels.hidden = state.mode !== 'ring';
    els.otherPanels.hidden = state.mode !== 'other';
    els.modeNote.textContent = state.mode === 'chain'
      ? 'いまは鎖式。分子全体の総炭素数と化合物分類から、当てはまる構造をまとめて表示します。'
      : (state.mode === 'ring'
        ? 'いまは芳香族・環式。固定した環のHを置換基で置き換えて表示します。'
        : 'いまはその他。糖・アミノ酸・脂質・天然/合成高分子・材料などのfamilyから表示します。');
  }

  function renderDataStatus() {
    if (!els.dataStatus) return;
    var total = Object.keys(D.COMPOUNDS).length;
    var ok = Object.keys(valid).length;
    var atomCount = 0;
    Object.keys(valid).forEach(function (id) {
      var v = validation[id];
      if (v.verification && v.verification.level === 'atom') atomCount++;
    });
    var cov = C.auditCoverage();
    els.dataStatus.textContent = '収録 ' + total + ' 化合物／分子式・登録データ整合 ' + ok +
      ' 件（原子レベル ' + atomCount + '）／経路 ' + cov.modes.chain + ' 鎖式・' + cov.modes.ring + ' 環式・' + cov.modes.other + ' その他' +
      '／family ' + D.FAMILIES.length + '・材料 ' + D.MATERIALS.length;
  }

  function update() {
    syncMode();
    if (state.mode === 'chain') {
      renderCarbonList();
      syncChainStructure();
      syncChainCounts();
      animateHeight(els.chainPreview, renderChainPreview);
      animateHeight(els.results, renderChainResults);
    } else if (state.mode === 'ring') {
      syncRing();
      renderRingPreview();
      animateHeight(els.ringPreview, renderRingPreview);
      animateHeight(els.results, renderRingResults);
    } else {
      syncOther();
      renderOtherPreview();
      animateHeight(els.otherPreview, renderOtherPreview);
      animateHeight(els.results, renderOtherResults);
    }
    renderQueryNotice();
    writeQuery();
  }

  function renderQueryNotice() {
    if (!els.queryNotice) return;
    els.queryNotice.textContent = state.notice || '';
    els.queryNotice.hidden = !state.notice;
  }

  function selectMode(mode) {
    if (mode !== 'chain' && mode !== 'ring' && mode !== 'other') return;
    state.mode = mode;
    state.focus = '';
    update();
  }

  function selectChainFamily(family) {
    if (!C.CHAIN_INDEX[family]) return;
    state.chainFamily = family;
    state.notice = '';
    ensureFamilyStructure(family);
    state.focus = '';
    update();
  }

  function selectChainStructure(condition) {
    if (['saturated', 'unsaturated', 'all'].indexOf(condition) === -1) return;
    state.chainStructure = condition;
    state.notice = '';
    state.focus = '';
    update();
  }

  function selectCarbon(n) {
    state.chainCarbon = Number(n);
    state.focus = '';
    update();
  }

  function selectRingSystem(system) {
    if (!C.RING_SYSTEM_MAP[system]) return;
    state.ringSystem = system;
    state.focus = '';
    update();
  }

  function selectRingGroup(group) {
    var rs = ringSystem();
    if (availableRingGroups(rs).indexOf(group) === -1) return;
    state.ringGroup = group;
    state.focus = '';
    update();
  }

  function selectOtherCategory(category) {
    state.otherCategory = category;
    state.focus = '';
    var groups = C.otherFamilies(category);
    if (groups.length) state.otherFamily = groups[0].id;
    update();
  }

  function selectOtherFamily(family) {
    state.otherFamily = family;
    state.focus = '';
    update();
  }

  /* ------------------------------------------------------------------
   * URL
   * ------------------------------------------------------------------ */
  function applyRoute(route) {
    if (!route) return false;
    if (route.mode === 'chain') {
      state.mode = 'chain';
      if (route.family) state.chainFamily = route.family;
      if (route.carbon) state.chainCarbon = route.carbon;
      if (route.structure) state.chainStructure = route.structure;
      else ensureFamilyStructure(state.chainFamily);
    } else if (route.mode === 'ring') {
      state.mode = 'ring';
      if (route.system) state.ringSystem = route.system;
      if (route.group) state.ringGroup = route.group;
    } else {
      state.mode = 'other';
      if (route.category) state.otherCategory = route.category;
      if (route.family) state.otherFamily = route.family;
    }
    if (route.focus) state.focus = route.focus;
    return true;
  }

  function readQuery() {
    var params = null;
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    if (!params) return;
    var mode = params.get('mode');
    if (mode === 'chain' && params.get('family') && C.CHAIN_INDEX[params.get('family')]) {
      state.mode = 'chain';
      state.chainFamily = params.get('family');
      var c = Number(params.get('c'));
      if (c) state.chainCarbon = c;
      var st = params.get('structure');
      if (st === 'saturated' || st === 'unsaturated' || st === 'all') state.chainStructure = st;
      else ensureFamilyStructure(state.chainFamily);
      var f = params.get('focus');
      if (f && D.COMPOUNDS[f]) state.focus = f;
      return;
    }
    if (mode === 'ring' && params.get('system') && C.RING_SYSTEM_MAP[params.get('system')]) {
      state.mode = 'ring';
      state.ringSystem = params.get('system');
      var g = params.get('group');
      if (g) state.ringGroup = g;
      var rf = params.get('focus');
      if (rf && D.COMPOUNDS[rf]) state.focus = rf;
      return;
    }
    if (mode === 'other' && params.get('category')) {
      state.mode = 'other';
      state.otherCategory = params.get('category');
      var fam = params.get('family');
      if (fam) state.otherFamily = fam;
      var of = params.get('focus');
      if (of && D.COMPOUNDS[of]) state.focus = of;
      return;
    }

    // 旧URL（?skeleton=...&group=...）は、新しい探し方へ移行する。
    var s = params.get('skeleton');
    var oldGroup = params.get('group');
    var oldFocus = params.get('focus');
    if (s) {
      // 旧URLの環式骨格（aromatic-benzene / cyclo-c6 など）は、
      // 新しい固定骨格＋置換基の条件へ直接移行する。
      var ringSystem = C.RING_SYSTEMS.filter(function (rs) { return rs.skeletonId === s; })[0];
      if (ringSystem) {
        state.mode = 'ring';
        state.ringSystem = ringSystem.id;
        var available = availableRingGroups(ringSystem);
        state.ringGroup = oldGroup && available.indexOf(oldGroup) !== -1 ? oldGroup :
          (available.length ? available[0] : 'none');
        if (oldFocus && D.COMPOUNDS[oldFocus]) state.focus = oldFocus;
        state.notice = '旧URLの骨格「' + s + '」を、固定骨格＋置換基の条件へ移行しました。';
        return;
      }
      var legacy = D.legacySkeletonRoute ? D.legacySkeletonRoute(s) : null;
      var targetId = (legacy && legacy.id) || oldFocus || null;
      if (!targetId) {
        var sk = D.skeletonById(s);
        if (sk && sk.ids && sk.ids.length) targetId = sk.ids[0];
      }
      if (targetId && C.routeFor(targetId)) {
        applyRoute(C.routeFor(targetId));
        state.focus = targetId;
        state.notice = '旧URLの骨格「' + s + '」を、新しい探し方の同じ物質の結果へ移行しました。';
        return;
      }
      state.notice = 'URLの骨格ID「' + s + '」は収録されていません。初期表示に戻しました。';
      return;
    }

    var focus = params.get('focus');
    if (focus && D.COMPOUNDS[focus] && C.routeFor(focus)) {
      applyRoute(C.routeFor(focus));
      state.focus = focus;
      return;
    }
    if (oldGroup && D.groupById(oldGroup)) {
      state.notice = '旧URLの官能基指定は、新しい探し方では物質ごとの経路に移行しました。';
    }
  }

  function writeQuery() {
    try {
      var url = new URL(location.href);
      url.searchParams.delete('skeleton');
      url.searchParams.delete('group');
      url.searchParams.set('mode', state.mode);
      if (state.mode === 'chain') {
        url.searchParams.set('family', state.chainFamily);
        url.searchParams.set('c', String(state.chainCarbon));
        url.searchParams.set('structure', state.chainStructure);
        url.searchParams.delete('system');
        url.searchParams.delete('category');
      } else if (state.mode === 'ring') {
        url.searchParams.set('system', state.ringSystem);
        url.searchParams.set('group', state.ringGroup);
        url.searchParams.delete('family');
        url.searchParams.delete('c');
        url.searchParams.delete('category');
        url.searchParams.delete('structure');
      } else {
        url.searchParams.set('category', state.otherCategory);
        url.searchParams.set('family', state.otherFamily);
        url.searchParams.delete('system');
        url.searchParams.delete('group');
        url.searchParams.delete('c');
        url.searchParams.delete('structure');
      }
      if (state.focus) url.searchParams.set('focus', state.focus);
      else url.searchParams.delete('focus');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------
   * 初期化・イベント
   * ------------------------------------------------------------------ */
  els.chainFamilyList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-chain-family]');
    if (!btn) return;
    selectChainFamily(btn.getAttribute('data-chain-family'));
  });
  if (els.chainStructureList) {
    els.chainStructureList.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-chain-structure]');
      if (!btn) return;
      selectChainStructure(btn.getAttribute('data-chain-structure'));
    });
  }
  els.carbonList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-carbon]');
    if (!btn) return;
    selectCarbon(btn.getAttribute('data-carbon'));
  });
  els.ringList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ring-system]');
    if (!btn) return;
    selectRingSystem(btn.getAttribute('data-ring-system'));
  });
  els.ringGroupList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ring-group]');
    if (!btn) return;
    selectRingGroup(btn.getAttribute('data-ring-group'));
  });
  els.otherCategoryList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-other-category]');
    if (!btn) return;
    selectOtherCategory(btn.getAttribute('data-other-category'));
  });
  els.otherFamilyList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-other-family]');
    if (!btn) return;
    selectOtherFamily(btn.getAttribute('data-other-family'));
  });
  document.querySelectorAll('[data-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () { selectMode(btn.getAttribute('data-mode')); });
  });

  buildChainFamilyList();
  buildChainStructureList();
  buildOtherCategoryList();
  buildRingList();
  readQuery();
  // 読み込んだURLの条件が現在のfamilyにない場合は補正する
  if (C.carbonOptions(state.chainFamily).indexOf(state.chainCarbon) === -1) {
    var opts = C.carbonOptions(state.chainFamily);
    if (opts.length) state.chainCarbon = opts[0];
  }
  if (state.mode === 'other' && !C.otherFamilies(state.otherCategory).some(function (g) { return g.id === state.otherFamily; })) {
    var groups = C.otherFamilies(state.otherCategory);
    if (groups.length) state.otherFamily = groups[0].id;
  }
  update();
  renderDataStatus();
})();
