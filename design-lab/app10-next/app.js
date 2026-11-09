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
    chainPartialC: 2,
    chainShape: 'd-ethane-c2',
    chainFamily: 'alkane',
    chainStructure: 'all', // 旧URLの移行判定用（新UIでは選択しない）
    chainCarbon: null, // 旧URLの総炭素数（新UIでは選択しない）
    ringSystem: 'benzene',
    ringPreset: 'none',
    otherCategory: 'sugar',
    otherFamily: 'monosaccharide',
    focus: '',
    notice: ''
  };

  var els = {
    chainPanels: document.getElementById('chain-panels'),
    ringPanels: document.getElementById('ring-panels'),
    otherPanels: document.getElementById('other-panels'),
    carbonList: document.getElementById('carbon-list'),
    chainShapeList: document.getElementById('chain-shape-list'),
    chainFamilyList: document.getElementById('chain-family-list'),
    chainSelection: document.getElementById('chain-selection'),
    chainLeftFigure: document.getElementById('chain-left-figure'),
    chainPreview: document.getElementById('chain-preview'),
    ringList: document.getElementById('ring-list'),
    ringGroupList: document.getElementById('ring-group-list'),
    ringSelection: document.getElementById('ring-selection'),
    ringLeftFigure: document.getElementById('ring-left-figure'),
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
    // 実際の表示は renderChainFamilyList()。ここではコンテナを空にするだけ。
    if (els.chainFamilyList) els.chainFamilyList.innerHTML = '';
  }

  function chainShapeLabel(shape) {
    return shape ? C.chainDescriptorLabel(shape) : '';
  }

  function partialLabel(n) {
    return Number(n) === 0 ? '炭化水素基なし〈H〉' : 'C' + n;
  }

  function reconcileChainFamily() {
    if (!state.chainShape) {
      state.chainFamily = '';
      return;
    }
    if (state.chainFamily && !C.chainDescriptorFamilyValid(state.chainShape, state.chainFamily)) {
      state.chainFamily = '';
      state.notice = '骨格の形に該当しない化合物分類だったため、分類の選択を解除しました。分類を選び直してください。';
    }
  }

  function renderCarbonList() {
    // ①は「官能基に結合する炭化水素部分」のC数。分類（②）には依存しない。
    var options = C.chainPartialOptions();
    if (!options.length) options = [state.chainPartialC];
    if (options.indexOf(state.chainPartialC) === -1) {
      state.chainPartialC = options.indexOf(C.INITIAL_CHAIN_PARTIAL) !== -1 ? C.INITIAL_CHAIN_PARTIAL : options[0];
    }
    var active = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-chain-partial]') : null;
    var activeCarbon = active ? active.getAttribute('data-chain-partial') : null;
    els.carbonList.innerHTML = options.map(function (n) {
      var label = partialLabel(n);
      return '<button type="button" class="oc-carbon' + (n === state.chainPartialC ? ' is-current' : '') +
        '" data-chain-partial="' + n + '" aria-pressed="' + (n === state.chainPartialC ? 'true' : 'false') + '">' +
        '<span class="oc-carbon__main">C' + n + '</span>' +
        '<span class="oc-carbon__sub">' + esc(n === 0 ? 'H' : n + '個') + '</span></button>';
    }).join('');
    if (activeCarbon) {
      var focusBtn = els.carbonList.querySelector('[data-chain-partial="' + activeCarbon + '"]');
      if (focusBtn) focusBtn.focus();
    }
    var f = state.chainFamily ? (C.CHAIN_FAMILY_LABEL[state.chainFamily] || state.chainFamily) : '未選択';
    var shape = state.chainShape ? chainShapeLabel(state.chainShape) : '未選択';
    els.chainSelection.textContent = '選択中: 鎖式 ／ 炭化水素部分 ' + partialLabel(state.chainPartialC) +
      ' ／ 骨格: ' + shape + ' ／ 分類: ' + f;
  }

  function renderChainShapeList() {
    if (!els.chainShapeList) return;
    var shapes = C.chainShapeOptions(state.chainPartialC);
    if (state.chainShape && !shapes.some(function (d) { return d.id === state.chainShape; })) {
      state.chainShape = '';
      state.chainFamily = '';
      state.notice = '炭化水素部分の炭素数が変わったため、骨格の形の選択を解除しました。骨格の形を選んでください。';
    }
    var active = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-chain-shape]') : null;
    var activeShape = active ? active.getAttribute('data-chain-shape') : null;
    if (!shapes.length) {
      els.chainShapeList.innerHTML = '<p class="oc-empty-note">この炭素数に該当する炭化水素骨格がありません。炭素数を変えてください。</p>';
      return;
    }
    els.chainShapeList.innerHTML = shapes.map(function (d) {
      return '<button type="button" class="oc-pick' + (d.id === state.chainShape ? ' is-current' : '') + '" data-chain-shape="' + esc(d.id) + '" aria-pressed="' +
        (d.id === state.chainShape ? 'true' : 'false') + '">' +
        '<span class="oc-pick__label">' + esc(d.label) + '</span>' +
        '<span class="oc-tag oc-tag--count">' + d.compoundIds.length + '</span></button>';
    }).join('');
    if (activeShape) {
      var focusShape = els.chainShapeList.querySelector('[data-chain-shape="' + activeShape + '"]');
      if (focusShape) focusShape.focus();
    }
  }

  function markAttachmentSvg(svg, marks) {
    if (!marks || !marks.length) return svg;
    var circles = marks.map(function (m) {
      return '<circle class="oc-attach-mark" cx="' + Number(m.x).toFixed(1) + '" cy="' + Number(m.y).toFixed(1) + '" r="17" />';
    }).join('');
    var end = svg.lastIndexOf('</svg>');
    if (end === -1) return svg;
    return svg.slice(0, end) + circles + svg.slice(end);
  }

  function renderFragmentTile(tile) {
    if (tile.kind === 'hydrogen') {
      return '<div class="oc-frag-tile oc-frag-tile--h">' +
        '<div class="oc-frag-tile__fig"><span class="oc-frag-h">H</span></div>' +
        '<div class="oc-frag-tile__label">H</div></div>';
    }
    var svg = R.renderStructure(tile.structure, tile.label);
    svg = markAttachmentSvg(svg, tile.marks);
    return '<div class="oc-frag-tile">' +
      '<div class="oc-frag-tile__fig">' + svg + '</div>' +
      '<div class="oc-frag-tile__label">' + esc(tile.label) +
      '<span>' + esc(tile.origin || '') + '</span></div></div>';
  }

  function renderChainLeftFigure() {
    if (!els.chainLeftFigure) return;
    if (!state.chainShape) {
      els.chainLeftFigure.innerHTML = '<span class="oc-left-figure__label">親炭化水素</span>' +
        '<p class="oc-left-figure__note">骨格の形を選んでください。炭化水素部分の炭素数を選ぶと、そのC数で可能な骨格の形が表示されます。' +
        (state.chainPartialC === 0 ? 'C0は「炭化水素基なし〈H〉」として、ギ酸・ホルムアルデヒド・シュウ酸に対応します。' : '') + '</p>';
      return;
    }
    var tiles = C.chainDescriptorPreview(state.chainShape);
    var html = '<span class="oc-left-figure__label">親炭化水素（接続点にHを補う）</span><div class="oc-frag-preview">';
    tiles.forEach(function (tile, i) {
      if (i) html += '<span class="oc-frag-plus" aria-hidden="true">＋</span>';
      html += renderFragmentTile(tile);
    });
    html += '</div><div class="oc-left-figure__legend"><span class="oc-attach-legend">○</span> 官能基とつながる位置（Hを補って親炭化水素として表示）</div>' +
      '<p class="oc-left-figure__note"><b>' + esc(chainShapeLabel(state.chainShape)) + '</b>。' +
      (state.chainPartialC === 0
        ? '炭化水素部分がないため、接続点はありません。官能基そのものの分類は②で選びます。'
        : (tiles.some(function (t) { return t.marks && t.marks.length; })
          ? '○は、この骨格のどこかが官能基とつながる位置です。同じ骨格でも、どの位置につくかで異性体になります。'
          : 'この骨格だけが分子全体になる場合、接続点はありません。')) +
      '</p>';
    els.chainLeftFigure.innerHTML = html;
  }

  function renderChainFamilyList() {
    if (!state.chainShape) {
      els.chainFamilyList.innerHTML = '<p class="oc-empty-note">先に①で骨格の形を選んでください。炭素数を変えた場合は、骨格の形を選び直します（別の骨格へ自動では移動しません）。</p>';
      return;
    }
    var families = C.chainFamiliesForDescriptor(state.chainShape);
    if (state.chainFamily && !families.some(function (f) { return f.id === state.chainFamily; })) {
      reconcileChainFamily();
    }
    var active = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-chain-family]') : null;
    var activeFamily = active ? active.getAttribute('data-chain-family') : null;
    if (!families.length) {
      els.chainFamilyList.innerHTML = '<p class="oc-empty-note">この骨格に該当する鎖式の分類がありません。骨格の形を変えてください（未収録・化学的不存在とは断定しません）。</p>';
      return;
    }
    els.chainFamilyList.innerHTML = families.map(function (f) {
      // 表示だけ分類ごとに差し替える（アルデヒドは −CHO を主表示）。
      // 選択値・結果の分類名は f.id / CHAIN_FAMILY_LABEL のまま変えない。
      var pick = C.chainFamilyPick(f.id);
      return '<button type="button" class="oc-pick' + (f.id === state.chainFamily ? ' is-current' : '') + '" data-chain-family="' + esc(f.id) + '" aria-pressed="' +
        (f.id === state.chainFamily ? 'true' : 'false') + '">' +
        '<span class="oc-pick__label">' + esc(pick.main) +
        (pick.sub ? '<span class="oc-pick__sub">' + esc(pick.sub) + '</span>' : '') + '</span>' +
        '<span class="oc-tag oc-tag--count">' + f.count + '</span></button>';
    }).join('');
    if (activeFamily) {
      var focusFamily = els.chainFamilyList.querySelector('[data-chain-family="' + activeFamily + '"]');
      if (focusFamily) focusFamily.focus();
    }
  }


  function genCard(title, formula, meta, note, empty) {
    return '<article class="oc-gen' + (empty ? ' is-empty' : '') + '">' +
      '<div class="oc-gen__head"><span class="oc-gen__name">' + esc(title) + '</span>' +
      '<span class="oc-gen__badge' + (empty ? ' is-muted' : '') + '">' + esc(meta) + '</span></div>' +
      '<div class="oc-gen__formula">' + esc(formula) + '</div>' +
      '<p class="oc-gen__note">' + esc(note) + '</p></article>';
  }

  var ROLE_GENERAL = {
    alkane: ['CₙH₂ₙ₊₂', '単結合だけの鎖式炭化水素。'],
    alkene: ['R–CH=CH₂ / R–CH=CH–R′', 'C=Cを1本以上もつ鎖式炭化水素。'],
    alkyne: ['R–C≡CH / R–C≡C–R′', 'C≡Cを1本以上もつ鎖式炭化水素。'],
    monohalogen: ['R–X', 'XはCl・Br・I。ハロゲン化アルキル・ハロゲン化アルケニルを含む。'],
    multihalogen: ['R–Xₙ（n≥2）', '同じ分子にハロゲンが2個以上。一ハロゲン化物とは別の役割として表示する。'],
    alcohol: ['R–OH', '一価アルコール。O–Hの結合線は省略し、OHとまとめて表す。'],
    polyol: ['R–(OH)ₙ（n≥2）', '1分子に2個以上のOHをもつ多価アルコール。'],
    ether: ['R–O–R′', '炭素を2つのRに分けて数える。C–C結合を保つ表記ではない。'],
    aldehyde: ['R−C(=O)−H', '末端のカルボニル基。C=Oの炭素にHが結合する（O–Hではない）。'],
    ketone: ['R–CO–R′', 'C=Oが炭素鎖の途中にある。'],
    monocarboxy: ['R–COOH', 'COOHの炭素は官能基側。炭化水素部分のC数とは別に数える。'],
    dicarboxy: ['HOOC–R–COOH', 'COOHが2つ。シュウ酸（Rなし）も一価カルボン酸と混ぜず、この役割で表示する。'],
    'hydroxy-acid': ['HO–R–COOH', 'ヒドロキシ基とカルボキシ基を併せもつ。一価カルボン酸の一般式だけを当てはめない。'],
    'hydroxy-polycarboxy': ['HOOC–R(OH)–COOH など', 'ヒドロキシ基と2つ以上のカルボキシ基をもつ。'],
    'keto-acid': ['R–CO–COOH', 'ケトンとカルボン酸を併せもつ。'],
    'acid-chloride': ['R–COCl', 'カルボキシ基のOHをClで置き換えた酸塩化物。'],
    anhydride: ['R–CO–O–CO–R′', '2分子のカルボン酸から水がとれた構造。'],
    monoester: ['R–COO–R′', 'カルボン酸とアルコールの脱水縮合でできる構造。'],
    triester: ['R–COO–CH₂–CH(OCO–R′)–CH₂–OCO–R″', '3つのエステル結合をもつ。トリアセチンなど。'],
    'amine-1': ['R–NH₂', 'Nに炭化水素基が1つ。'],
    'amine-2': ['R–NH–R′', 'Nに炭化水素基が2つ。左右を入れ替えても同じ化合物。'],
    'amine-3': ['R–N(R′)–R″', 'Nに炭化水素基が3つ。'],
    nitrile: ['R–C≡N', 'CNの炭素は官能基側。炭化水素部分のC数とは別に数える。'],
    nitro: ['R–NO₂', 'ニトロ基を炭素に結合した化合物。'],
    'amino-alcohol': ['HO–R–NH₂', 'アミノ基とヒドロキシ基を併せもつ多官能化合物。']
  };

  function generalForRole(role) {
    return ROLE_GENERAL[role] || ['—', ''];
  }

  function roleNote(role) {
    var general = ROLE_GENERAL[role];
    return general ? general[1] : '';
  }

  function renderChainPreview() {
    if (!state.chainShape) {
      els.chainPreview.innerHTML = '<span class="oc-preview__label">化合物分類</span>' +
        '<p class="oc-preview__locked-note">先に①で骨格の形を選んでください。<br>①の炭素数と骨格に合わせて、0件でない分類だけを表示します。</p>';
      return;
    }
    if (!state.chainFamily) {
      els.chainPreview.innerHTML = '<span class="oc-preview__label">化合物分類</span>' +
        '<p class="oc-preview__locked-note">化合物分類を選んでください。<br>②を選んでも①の骨格・炭素数は書き換えません。</p>';
      return;
    }
    var family = state.chainFamily;
    var label = C.CHAIN_FAMILY_LABEL[family] || family;
    var ids = C.chainIdsForDescriptor(state.chainShape, family);
    var roles = C.chainDescriptorRoles(state.chainShape, family);
    var html = '<span class="oc-preview__label">' + esc(label) + 'の一般構造</span>' +
      '<p class="oc-gen-lead">炭化水素部分: <b>' + esc(chainShapeLabel(state.chainShape)) + '</b>' +
      '（C' + state.chainPartialC + '）／ 分子全体のC数は結果カードに表示</p>';

    if (family === 'amine') {
      var degreeCounts = { 1: 0, 2: 0, 3: 0 };
      ids.forEach(function (id) {
        var role = C.chainRoleFor(id);
        if (role && role.indexOf('amine-') === 0) degreeCounts[Number(role.slice(6))]++;
      });
      html += '<p class="oc-gen-lead">Nに結合する炭化水素基の数で級が決まります。一般構造は常に3つ表示し、該当しない級は条件不足と明記します。</p>' +
        '<div class="oc-gen-grid">' +
        genCard('第一級アミン', 'R–NH₂', degreeCounts[1] + ' 種', 'NにRが1つ。', degreeCounts[1] === 0) +
        genCard('第二級アミン', 'R–NH–R′', degreeCounts[2] + ' 種', 'NにRが2つ。左右を入れ替えても同じ化合物。', degreeCounts[2] === 0) +
        genCard('第三級アミン', 'R–N(R′)–R″', degreeCounts[3] + ' 種',
          degreeCounts[3] === 0 ? 'この条件では第三級アミンがありません。Nに3つの炭化水素基が必要です。' : 'NにRが3つ。',
          degreeCounts[3] === 0) +
        '</div>';
      els.chainPreview.innerHTML = html;
      return;
    }

    html += '<div class="oc-gen-grid">' + roles.map(function (r) {
      return genCard(r.label, generalForRole(r.role)[0], r.count + ' 種', roleNote(r.role), r.count === 0);
    }).join('') + '</div>';
    if (family === 'aldehyde') {
      html += '<div class="oc-note-box"><p><b>末端の −CHO:</b> R−C(=O)−H。C=O の炭素に H が結合しており、O–H ではありません。' +
        '左①は CHO の炭素を除いた炭化水素部分だけを示します（炭化水素基がない場合は H）。</p></div>';
    }
    if (roles.length > 1) {
      html += '<div class="oc-note-box"><p><b>複数の官能基役割があります。</b> この分類には ' +
        roles.map(function (r) { return esc(r.label) + '（' + r.count + '件）'; }).join(' / ') +
        ' が含まれます。一価の一般式だけを当てはめず、結果カードのbadgeで役割を区別します。</p></div>';
    }
    if (!ids.length) {
      html += '<p class="oc-preview__hint">この条件に該当する登録済み化合物はありません。化学的に存在しないという意味ではありません。</p>';
    }
    els.chainPreview.innerHTML = html;
  }

  function chainCardBadges(id) {
    var c = D.COMPOUNDS[id];
    var badges = [];
    var role = C.chainRoleFor(id);
    if (role) badges.push(C.chainRoleLabel(role));
    badges.push(c.formulaDisplay || R.formatFormula(c.formula));
    badges.push('分子全体 C' + C.carbonCount(c));
    return badges;
  }

  function renderChainResults() {
    if (!state.chainShape) {
      els.resultDescription.textContent = '炭化水素部分の骨格を選んでください';
      els.resultCount.textContent = '0 種類';
      els.results.innerHTML = '<div class="oc-empty"><strong>骨格の形が未選択です</strong>' +
        '<p>①で炭化水素部分の炭素数を選び、そのC数に合う骨格の形を選んでください。別の骨格へは自動で移動しません。</p></div>';
      return;
    }
    if (!state.chainFamily) {
      els.resultDescription.textContent = '化合物分類を選んでください';
      els.resultCount.textContent = '0 種類';
      els.results.innerHTML = '<div class="oc-empty"><strong>化合物分類が未選択です</strong>' +
        '<p>①の炭素数と骨格はそのままに、②で化合物分類を選んでください。分類は自動では切り替えません。</p></div>';
      return;
    }
    var ids = C.chainIdsForDescriptor(state.chainShape, state.chainFamily);
    var label = C.CHAIN_FAMILY_LABEL[state.chainFamily] || state.chainFamily;
    els.resultDescription.textContent = '鎖式 ／ 炭化水素部分 C' + state.chainPartialC +
      '（' + chainShapeLabel(state.chainShape) + '） ／ ' + label +
      ' ／ 分子全体Cは各カード';
    els.resultCount.textContent = ids.length + ' 種類';
    if (!ids.length) {
      els.results.innerHTML = '<div class="oc-empty"><strong>この条件では0種類です</strong><p>' +
        'この骨格と分類に該当する登録済み化合物がありません。化学的に存在しない、または高校外であると断定せず、登録データの範囲を示しています。</p>' +
        '<p>骨格の形または分類を変えるか、<a href="./ledger.html">収録台帳</a>で登録範囲を確認してください。</p></div>';
      return;
    }

    // 結果カードは、分類・級・分子式ごとの別グリッドに分けず、
    // 全選択を通して同じ2列グリッドに並べる。級・分子式・役割はカードのbadgeで残す。
    var html = '<div class="oc-cards' + (ids.length === 1 ? ' oc-cards--single' : '') + '">' +
      ids.map(function (id) {
        return renderCard(D.COMPOUNDS[id], { mode: 'chain', badges: chainCardBadges(id) });
      }).join('') + '</div>';
    if (ids.length > 1) {
      html += '<p class="oc-results__note">同じ骨格・同じ分類でも、級・官能基の役割・分子式が異なる場合があります。カード上部のbadgeで区別し、分子全体のC数も併記しています。' +
        '二重結合・三重結合の位置が異なる骨格は①でも別に扱います。同じ①shapeにまとめるのは、接続点にHを補うと同一の親炭化水素になる場合（プロパン-1-オール / プロパン-2-オールなど）だけです。</p>';
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

  function ringPresets() {
    return ringSystem().presets || [];
  }

  function ringPreset() {
    var list = ringPresets();
    return list.filter(function (p) { return p.id === state.ringPreset; })[0] || list[0] ||
      { id: 'none', kind: 'none', label: '追加なし', subs: [], ids: [] };
  }

  function renderRingGroupList() {
    var rs = ringSystem();
    var presets = ringPresets();
    var kinds = [
      { key: 'single', label: '置換基1つ' },
      { key: 'same', label: '同じ置換基を複数' },
      { key: 'combo', label: '異なる置換基組み合わせ' },
      { key: 'tray', label: 'その他の登録済み化合物' }
    ];
    function button(p) {
      var n = p.ids.length;
      return '<button type="button" class="oc-pick' + (p.id === state.ringPreset ? ' is-current' : '') + '" data-ring-preset="' + esc(p.id) + '" aria-pressed="' +
        (p.id === state.ringPreset ? 'true' : 'false') + '">' +
        '<span class="oc-pick__label">' + esc(p.label) + '</span>' +
        '<span class="oc-tag oc-tag--count">' + (n ? n : '—') + '</span></button>';
    }
    var html = '<div class="oc-preset-row">' + button(presets[0]) + '</div>';
    kinds.forEach(function (kind) {
      var list = presets.filter(function (p) { return p.kind === kind.key; });
      if (!list.length) return;
      html += '<div class="oc-preset-section"><h4 class="oc-preset-heading">' + esc(kind.label) +
        ' <span class="oc-micro">' + list.length + '</span></h4><div class="oc-preset-row">' +
        list.map(button).join('') + '</div></div>';
    });
    if (!presets.length) html = '<p class="oc-empty-note">この骨格の置換基プリセットがありません。</p>';
    var active = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-ring-preset]') : null;
    var activePreset = active ? active.getAttribute('data-ring-preset') : null;
    els.ringGroupList.innerHTML = html;
    if (activePreset) {
      var focusPreset = els.ringGroupList.querySelector('[data-ring-preset="' + activePreset + '"]');
      if (focusPreset) focusPreset.focus();
    }
  }

  function syncRing() {
    var rs = ringSystem();
    els.ringList.querySelectorAll('[data-ring-system]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-ring-system') === rs.id ? 'true' : 'false');
    });
    if (!ringPresets().some(function (p) { return p.id === state.ringPreset; })) state.ringPreset = 'none';
    renderRingGroupList();
    var preset = ringPreset();
    var carbonText = rs.baseCarbon ? 'C' + rs.baseCarbon : '複合';
    els.ringSelection.textContent = '選択中: 芳香族・環式 ／ ' + rs.label + '（' + carbonText + '） ／ ' +
      (preset.kind === 'none' ? '追加なし' : preset.label) + ' ／ ' + preset.ids.length + ' 種';
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

  function ringSubPreviewHtml(preset) {
    var html = '<span class="oc-preview__label">置換基・組み合わせ</span>';
    html += '<div class="oc-sub-list">';
    preset.subs.forEach(function (s) {
      var meta = C.ringSubMeta(s.key);
      html += '<div class="oc-sub">' +
        '<div class="oc-sub__head"><strong>' + esc(meta.label) + '</strong><span>' + esc(meta.name) + '</span>' +
        (s.count > 1 ? '<span class="oc-badge">×' + s.count + '</span>' : '') + '</div>' +
        '<code class="oc-sub__formula">' + esc(meta.formula) + '</code>' +
        '<p class="oc-sub__note">' + esc(meta.note) + '</p></div>';
    });
    html += '</div><p class="oc-micro">結合点は左端の「−」が環のHと置き換わる位置です。位置異性体は結果にまとめて表示します。</p>';
    return html;
  }

  function renderRingLeftFigure() {
    if (!els.ringLeftFigure) return;
    var rs = ringSystem();
    var base = baseRingStructure(rs);
    els.ringLeftFigure.innerHTML = '<span class="oc-left-figure__label">固定した骨格</span>' +
      (base
        ? '<div class="oc-left-figure__svg">' + R.renderStructure(base, rs.label + 'の構造') + '</div>'
        : '<p class="oc-left-figure__note">複合芳香族・その他は固定した単一骨格をもたないため、左の骨格図はありません。右の一覧から登録済み化合物を選びます。</p>');
  }

  function renderRingPreview() {
    var rs = ringSystem();
    var preset = ringPreset();
    var html = '';
    if (preset.kind === 'none') {
      html += rs.id === 'complex-ring'
        ? '<p class="oc-preview__locked-note">複合芳香族・その他は固定した単一骨格をもたないため、「追加なし」の結果はありません。<br>「その他の登録済み化合物」から選んでください。</p>'
        : '<p class="oc-preview__locked-note">置換基を追加しません。<br>固定した骨格そのものだけを結果に表示します。</p>';
    } else if (preset.kind === 'tray') {
      html += '<div class="oc-ring-preview__sub"><b>その他の登録済み化合物:</b> ' + preset.ids.length +
        ' 種<br><span class="oc-micro">単純な置換基プリセットに分類できない、または塩・複雑な置換基をもつ登録済み化合物です。</span></div>';
    } else {
      html += ringSubPreviewHtml(preset);
    }
    els.ringPreview.innerHTML = html;
    els.ringFoot.textContent = preset.kind === 'none'
      ? '「追加なし」は骨格単体だけを表示します。登録済みの誘導体は置換基のプリセットから選びます。'
      : '同じ置換基構成の位置異性体は、1つのプリセットにまとめて結果へ表示します。置換基が変わっても、固定した環の炭素数はそのままです。';
  }

  function renderRingResults() {
    var rs = ringSystem();
    var preset = ringPreset();
    var ids = preset.ids.slice();
    els.resultDescription.textContent = '芳香族・環式 ／ ' + rs.label + ' ／ ' +
      (preset.kind === 'none' ? '追加なし' : preset.label);
    els.resultCount.textContent = ids.length + ' 種類';

    var html = '';
    if (!ids.length) {
      html = '<div class="oc-empty"><strong>この条件では0種類です</strong><p>' +
        (preset.kind === 'none'
          ? 'この骨格は単体の登録がありません。置換基のプリセットを選ぶか、別の骨格を選んでください。'
          : 'このプリセットに該当する登録済み化合物がありません。化学的に成立しない、または高校外であると断定せず、登録データの範囲を示しています。') +
        '</p></div>';
    } else {
      // 位置異性体のカードも、同じ2列グリッドに並べる。
      html += '<div class="oc-cards' + (ids.length === 1 ? ' oc-cards--single' : '') + '">' + ids.map(function (id) {
        return renderCard(D.COMPOUNDS[id], {
          mode: 'ring',
          multi: preset.kind === 'same' || preset.kind === 'combo',
          badges: [preset.kind === 'none' ? '骨格単体' : preset.label]
        });
      }).join('') + '</div>';
      if (preset.kind !== 'none') {
        html += '<p class="oc-results__note">同じ置換基構成の位置異性体をまとめて表示します。位置は各カードの「置換位置」で確認できます。</p>';
      }
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
    var cards = [];
    ids.forEach(function (id) { cards.push(renderCard(D.COMPOUNDS[id], { mode: 'other', badges: [fam.label] })); });
    familyIds.forEach(function (fid) { cards.push(renderFamilyCard(D.familyById(fid))); });
    materialIds.forEach(function (mid) { cards.push(renderMaterialCard(D.materialById(mid))); });
    var html = '<div class="oc-cards' + (cards.length === 1 ? ' oc-cards--single' : '') + '">' + cards.join('') + '</div>';
    if (!total) {
      html += '<p class="oc-empty-note">このfamilyには代表化合物・材料の登録がありません。familyの説明のみ表示しています。</p>';
    }
    html += resultsNote();
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

  var RING_BASE_INFO = {
    benzene: { c: 6, h: 6 },
    naphthalene: { c: 10, h: 8 },
    cyclopropane: { c: 3, h: 6 },
    cyclobutane: { c: 4, h: 8 },
    cyclopentane: { c: 5, h: 10 },
    cyclohexane: { c: 6, h: 12 },
    cyclohexene: { c: 6, h: 10 },
    anthracene: { c: 14, h: 10 }
  };

  function ringSubText(c) {
    if (!C.ringSubsFor || !C.routeFor) return '';
    var subs = C.ringSubsFor(c.id);
    if (!subs || !subs.length) return '';
    var route = C.routeFor(c.id);
    if (!route || route.mode !== 'ring' || !RING_BASE_INFO[route.system]) return '';
    var info = RING_BASE_INFO[route.system];
    var total = subs.reduce(function (n, s) { return n + (s.count || 1); }, 0);
    var h = Math.max(0, info.h - total);
    var text = 'C' + info.c + (h ? 'H' + h : '');
    subs.forEach(function (s) {
      var meta = C.ringSubMeta(s.key);
      text += '(' + meta.label + (s.count > 1 ? '×' + s.count : '') + ')';
    });
    return text;
  }

  function cardCondensedText(c) {
    var text = ringSubText(c);
    if (text) return { text: text, note: '' };
    return R.condensedTextFor ? R.condensedTextFor(c) : { text: '', note: '' };
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
    (opts.badges || []).forEach(function (b) {
      if (b) badges.push('<span class="oc-badge">' + esc(b) + '</span>');
    });
    if (c.figures && c.figures.length > 1) badges.push('<span class="oc-badge">' + c.figures.length + '形態</span>');
    var note = c.notes || '';
    var positionText = (opts.mode === 'ring' && C.ringPositionText) ? C.ringPositionText(c.id) : '';
    var condensed = R.condensedTextFor ? cardCondensedText(c) : { text: '', note: '' };
    var condensedBlock = '';
    if (condensed && (condensed.text || condensed.note)) {
      condensedBlock = '<div class="oc-condensed-text" aria-label="簡略構造式"><strong>簡略構造式</strong>' +
        (condensed.text ? '<code>' + esc(condensed.text) + '</code>' : '') +
        (condensed.note ? '<span>' + esc(condensed.note) + '</span>' : '') + '</div>';
    }
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
      condensedBlock +
      '<div class="oc-card__figs">' + R.renderCompound(c) + '</div>' +
      '<div class="oc-facts">' +
        fact('性質', c.properties) +
        fact('主な用途', c.uses) +
        fact('自然界・由来', c.nature) +
        (positionText ? fact('置換位置', positionText) : '') +
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
      q.push('cpartial=' + encodeURIComponent(r.partialC));
      if (r.shape) q.push('shape=' + encodeURIComponent(r.shape));
    } else if (r.mode === 'ring') {
      q.push('system=' + encodeURIComponent(r.system));
      if (r.preset) q.push('preset=' + encodeURIComponent(r.preset));
      else if (r.group) q.push('preset=' + encodeURIComponent(r.group));
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
      '／鎖式デスクリプタ ' + C.CHAIN_DESCRIPTOR_LIST.length + '／family ' + D.FAMILIES.length + '・材料 ' + D.MATERIALS.length;
  }

  function update() {
    syncMode();
    if (state.mode === 'chain') {
      renderCarbonList();
      renderChainShapeList();
      renderChainFamilyList();
      renderChainLeftFigure();
      animateHeight(els.chainPreview, renderChainPreview);
      animateHeight(els.results, renderChainResults);
    } else if (state.mode === 'ring') {
      syncRing();
      renderRingLeftFigure();
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
    if (!state.chainShape) return;
    // ②から①（炭化水素部分・骨格）を書き換えない。
    if (!C.chainDescriptorFamilyValid(state.chainShape, family)) return;
    state.chainFamily = family;
    state.notice = '';
    state.focus = '';
    update();
  }

  function selectChainPartial(n) {
    var value = Number(n);
    if (C.chainPartialOptions().indexOf(value) === -1) return;
    if (value === state.chainPartialC) return;
    state.chainPartialC = value;
    // ①のC数が変わると、それまでの骨格の形は原則として別のC数用になる。
    // 勝手に別の骨格へ飛ばさず、shapeと②を解除して選び直してもらう。
    state.chainShape = '';
    state.chainFamily = '';
    state.notice = '炭化水素部分の炭素数を' + (value === 0 ? '炭化水素基なし〈H〉' : 'C' + value) + 'に変えたため、骨格の形の選択を解除しました。骨格の形を選んでください。';
    state.focus = '';
    update();
  }

  function selectChainShape(shape) {
    var descriptor = C.chainDescriptorById(shape);
    if (!descriptor) return;
    if (descriptor.partialC !== state.chainPartialC) return;
    var previousFamily = state.chainFamily;
    state.chainShape = shape;
    state.notice = '';
    if (previousFamily && !C.chainDescriptorFamilyValid(shape, previousFamily)) {
      state.chainFamily = '';
      state.notice = '骨格の形が変わったため、化合物分類の選択を解除しました。分類を選び直してください。';
    }
    state.focus = '';
    update();
  }

  function selectRingSystem(system) {
    if (!C.RING_SYSTEM_MAP[system]) return;
    state.ringSystem = system;
    // 骨格を変えたら置換基は「追加なし」から始める（別familyを勝手に選ばない）。
    state.ringPreset = 'none';
    state.focus = '';
    update();
  }

  function selectRingPreset(preset) {
    var rs = ringSystem();
    if (!rs.presets.some(function (p) { return p.id === preset; })) return;
    state.ringPreset = preset;
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
      if (route.partialC != null) state.chainPartialC = route.partialC;
      if (route.shape && C.chainDescriptorById(route.shape)) state.chainShape = route.shape;
      if (route.family) state.chainFamily = route.family;
      reconcileChainFamily();
    } else if (route.mode === 'ring') {
      state.mode = 'ring';
      if (route.system) state.ringSystem = route.system;
      state.ringPreset = route.preset || route.group || 'none';
      if (!ringPresets().some(function (p) { return p.id === state.ringPreset; })) {
        state.ringPreset = 'none';
        state.notice = 'URLの置換基条件は現在の骨格にないため、「追加なし」に戻しました。';
      }
    } else {
      state.mode = 'other';
      if (route.category) state.otherCategory = route.category;
      if (route.family) state.otherFamily = route.family;
    }
    if (route.focus) state.focus = route.focus;
    return true;
  }

  function legacyPresetForGroup(system, group) {
    if (!group) return 'none';
    var rs = C.RING_SYSTEM_MAP[system];
    if (!rs) return 'none';
    if (rs.presets.some(function (p) { return p.id === group; })) return group;
    var keyMap = { oh: 'OH', cooh: 'COOH', nh2: 'NH2', cho: 'CHO', no2: 'NO2', ch3: 'CH3', cl: 'Cl', br: 'Br', cn: 'CN' };
    var key = keyMap[group];
    if (!key) return 'none';
    var hit = rs.presets.filter(function (p) {
      return p.kind === 'single' && p.subs.length === 1 && p.subs[0].key === key;
    })[0];
    return hit ? hit.id : 'none';
  }

  function chainCandidatesForLegacy(totalCarbon, family, structure) {
    return Object.keys(D.COMPOUNDS).filter(function (id) {
      if (C.classify(id).mode !== 'chain') return false;
      if (totalCarbon != null && !isNaN(totalCarbon) && C.carbonCount(D.COMPOUNDS[id]) !== totalCarbon) return false;
      if (family && C.classify(id).family !== family) return false;
      if (structure && structure !== 'all') {
        var unsat = C.hasCCMultipleBond(D.COMPOUNDS[id]);
        if (structure === 'unsaturated' && !unsat) return false;
        if (structure === 'saturated' && unsat) return false;
      }
      return true;
    });
  }

  function readQuery() {
    var params = null;
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    if (!params) return;
    var mode = params.get('mode');
    if (mode === 'chain') {
      state.mode = 'chain';
      var focusParam = params.get('focus');
      if (focusParam && D.COMPOUNDS[focusParam] && C.routeFor(focusParam)) {
        applyRoute(C.routeFor(focusParam));
        state.focus = focusParam;
        if (params.get('c') != null) {
          state.notice = 'URLのfocusを優先し、物質「' + compoundName(focusParam) + '」の正確な経路へ移行しました。';
        }
        return;
      }
      var shapeParam = params.get('shape');
      var cpartialRaw = params.get('cpartial');
      var cpartial = cpartialRaw == null ? null : Number(cpartialRaw);
      if (shapeParam) {
        var descriptor = C.chainDescriptorById(shapeParam);
        if (descriptor) {
          state.chainPartialC = descriptor.partialC;
          state.chainShape = descriptor.id;
          var famParam = params.get('family');
          if (famParam && C.chainDescriptorFamilyValid(descriptor.id, famParam)) {
            state.chainFamily = famParam;
          } else if (famParam) {
            state.chainFamily = '';
            state.notice = 'URLの化合物分類「' + familyName(famParam) + '」はこの骨格に該当しないため、分類の選択を解除しました。';
          } else {
            state.chainFamily = '';
          }
          return;
        }
        state.notice = 'URLの骨格の形「' + shapeParam + '」は収録されていません。骨格の形を選び直してください。';
        state.chainPartialC = (cpartialRaw != null && C.chainPartialOptions().indexOf(cpartial) !== -1)
          ? cpartial : C.INITIAL_CHAIN_PARTIAL;
        state.chainShape = '';
        state.chainFamily = '';
        return;
      }
      if (cpartialRaw != null && C.chainPartialOptions().indexOf(cpartial) !== -1) {
        state.chainPartialC = cpartial;
        state.chainShape = '';
        state.chainFamily = '';
        if (!state.notice) state.notice = '骨格の形を選んでください。';
        return;
      }
      // 旧URL（?mode=chain&c=<総炭素数>&family=...&structure=...）の移行。
      var legacyC = params.get('c');
      var legacyCarbon = legacyC == null ? null : Number(legacyC);
      var legacyFamily = params.get('family');
      var legacyStructure = params.get('structure');
      if (legacyC != null || legacyFamily || legacyStructure) {
        var matches = chainCandidatesForLegacy(legacyCarbon, legacyFamily, legacyStructure);
        if (matches.length === 1) {
          applyRoute(C.routeFor(matches[0]));
          state.focus = matches[0];
          state.notice = '旧URL（総炭素数 C' + legacyCarbon + '）を、新しい炭化水素部分の条件へ移行しました。';
          return;
        }
        state.chainPartialC = C.INITIAL_CHAIN_PARTIAL;
        state.chainShape = '';
        state.chainFamily = '';
        state.notice = matches.length > 1
          ? '旧URLの総炭素数条件には ' + matches.length + ' 件が該当するため、骨格の形を選んでください。先頭の物質へは自動で移動しません。'
          : '旧URLの条件に該当する鎖式化合物がありません。骨格の形から選び直してください。';
        return;
      }
      state.chainPartialC = C.INITIAL_CHAIN_PARTIAL;
      state.chainShape = C.INITIAL_CHAIN_SHAPE;
      state.chainFamily = 'alkane';
      return;
    }
    if (mode === 'ring' && params.get('system') && C.RING_SYSTEM_MAP[params.get('system')]) {
      state.mode = 'ring';
      state.ringSystem = params.get('system');
      var presetParam = params.get('preset') || params.get('group');
      state.ringPreset = legacyPresetForGroup(state.ringSystem, presetParam);
      var rf = params.get('focus');
      if (rf && D.COMPOUNDS[rf] && C.routeFor(rf)) {
        state.focus = rf;
        var froute = C.routeFor(rf);
        if (!presetParam && froute.mode === 'ring' && froute.system === state.ringSystem && froute.preset) {
          state.ringPreset = froute.preset;
        }
      }
      return;
    }
    if (mode === 'other' && params.get('category')) {
      state.mode = 'other';
      state.otherCategory = params.get('category');
      var fam2 = params.get('family');
      if (fam2) state.otherFamily = fam2;
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
        state.ringPreset = legacyPresetForGroup(ringSystem.id, oldGroup);
        if (oldFocus && D.COMPOUNDS[oldFocus] && C.routeFor(oldFocus)) state.focus = oldFocus;
        state.notice = '旧URLの骨格「' + s + '」を、固定骨格＋置換基の条件へ移行しました。';
        return;
      }
      var legacy = D.legacySkeletonRoute ? D.legacySkeletonRoute(s) : null;
      var targetId = (legacy && legacy.id) || oldFocus || null;
      if (targetId && C.routeFor(targetId)) {
        applyRoute(C.routeFor(targetId));
        state.focus = targetId;
        state.notice = '旧URLの骨格「' + s + '」を、新しい探し方の同じ物質の結果へ移行しました。';
        return;
      }
      var sk = D.skeletonById(s);
      if (sk && sk.ids && sk.ids.length) {
        var routes = sk.ids.map(function (id) { return C.routeFor(id); }).filter(Boolean);
        var signatures = {};
        routes.forEach(function (r) {
          var sig = [r.mode, r.family || '', r.shape || '', r.system || '', r.category || ''].join('|');
          signatures[sig] = true;
        });
        var sigList = Object.keys(signatures);
        if (sk.ids.length === 1 && routes.length === 1) {
          applyRoute(routes[0]);
          state.focus = sk.ids[0];
          state.notice = '旧URLの骨格「' + s + '」を、新しい探し方の同じ物質の結果へ移行しました。';
          return;
        }
        if (sigList.length === 1 && routes.length === sk.ids.length) {
          // 複数物質でも経路が同じなら、物質を1つに決めずに条件だけ移行する。
          applyRoute({
            mode: routes[0].mode,
            family: routes[0].family,
            partialC: routes[0].partialC,
            shape: routes[0].shape,
            system: routes[0].system,
            preset: routes[0].preset,
            category: routes[0].category
          });
          state.focus = '';
          state.notice = '旧URLの骨格「' + s + '」を、同じ条件の結果へ移行しました。';
          return;
        }
        var chainRoutes = routes.filter(function (r) { return r.mode === 'chain'; });
        if (chainRoutes.length === routes.length) {
          var partial = chainRoutes[0].partialC;
          var samePartial = chainRoutes.every(function (r) { return r.partialC === partial; });
          state.mode = 'chain';
          state.chainPartialC = samePartial ? partial : C.INITIAL_CHAIN_PARTIAL;
          state.chainShape = '';
          state.chainFamily = '';
          state.notice = '旧URLの骨格「' + s + '」には ' + sk.ids.length +
            ' 件が含まれるため、骨格の形を選んでください。先頭の物質へは自動で移動しません。';
          return;
        }
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
        if (state.chainFamily) url.searchParams.set('family', state.chainFamily);
        else url.searchParams.delete('family');
        url.searchParams.set('cpartial', String(state.chainPartialC));
        if (state.chainShape) url.searchParams.set('shape', state.chainShape);
        else url.searchParams.delete('shape');
        url.searchParams.delete('c');
        url.searchParams.delete('structure');
        url.searchParams.delete('system');
        url.searchParams.delete('preset');
        url.searchParams.delete('category');
      } else if (state.mode === 'ring') {
        url.searchParams.set('system', state.ringSystem);
        url.searchParams.set('preset', state.ringPreset);
        url.searchParams.delete('family');
        url.searchParams.delete('c');
        url.searchParams.delete('cpartial');
        url.searchParams.delete('shape');
        url.searchParams.delete('category');
        url.searchParams.delete('structure');
      } else {
        url.searchParams.set('category', state.otherCategory);
        url.searchParams.set('family', state.otherFamily);
        url.searchParams.delete('system');
        url.searchParams.delete('preset');
        url.searchParams.delete('c');
        url.searchParams.delete('cpartial');
        url.searchParams.delete('shape');
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
  if (els.chainShapeList) {
    els.chainShapeList.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-chain-shape]');
      if (!btn) return;
      selectChainShape(btn.getAttribute('data-chain-shape'));
    });
  }
  els.carbonList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-chain-partial]');
    if (!btn) return;
    selectChainPartial(btn.getAttribute('data-chain-partial'));
  });
  els.ringList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ring-system]');
    if (!btn) return;
    selectRingSystem(btn.getAttribute('data-ring-system'));
  });
  els.ringGroupList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ring-preset]');
    if (!btn) return;
    selectRingPreset(btn.getAttribute('data-ring-preset'));
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

  /* ------------------------------------------------------------------
   * 図の拡大ダイアログ（Escape・フォーカス復帰・スクロール復元）
   * ------------------------------------------------------------------ */
  var figDialog = document.getElementById('fig-dialog');
  var figDialogTitle = document.getElementById('fig-dialog-title');
  var figDialogBody = document.getElementById('fig-dialog-body');
  var figDialogClose = document.getElementById('fig-dialog-close');
  var lastFigTrigger = null;
  var lastScrollY = 0;

  function focusResultsFallback() {
    var target = document.getElementById('results') || els.results;
    if (target && target.focus) {
      try { target.focus(); } catch (e) {}
    }
  }

  function restoreFigureDialog() {
    document.body.classList.remove('oc-dialog-open');
    if (figDialogBody) figDialogBody.innerHTML = '';
    if (lastFigTrigger && lastFigTrigger.focus && document.contains(lastFigTrigger)) {
      try { lastFigTrigger.focus(); } catch (e) { focusResultsFallback(); }
    } else {
      focusResultsFallback();
    }
    try { window.scrollTo(0, lastScrollY); } catch (e) {}
    lastFigTrigger = null;
  }

  function openFigureDialog(fig) {
    if (!figDialog || !figDialogBody) return;
    var svg = fig.querySelector('svg');
    if (!svg) return;
    // 実際にfocus可能な明示「拡大」ボタンを復帰先にする。
    var zoomBtn = fig.querySelector('.oc-fig__zoom-btn');
    if (zoomBtn && zoomBtn.focus) lastFigTrigger = zoomBtn;
    else if (fig.tabIndex >= 0 && fig.focus) lastFigTrigger = fig;
    else lastFigTrigger = null;
    lastScrollY = window.scrollY || window.pageYOffset || 0;
    var caption = fig.querySelector('.oc-fig__caption');
    if (figDialogTitle) figDialogTitle.textContent = caption ? caption.textContent : '構造式';
    figDialogBody.innerHTML = svg.outerHTML;
    document.body.classList.add('oc-dialog-open');
    if (typeof figDialog.showModal === 'function') {
      try { figDialog.showModal(); } catch (e) { figDialog.setAttribute('open', ''); }
    } else {
      figDialog.setAttribute('open', '');
    }
    if (figDialogClose) figDialogClose.focus();
  }

  function closeFigureDialog() {
    if (!figDialog) return;
    if (typeof figDialog.close === 'function' && figDialog.open) figDialog.close();
    else { figDialog.removeAttribute('open'); restoreFigureDialog(); }
  }

  if (figDialog) {
    figDialog.addEventListener('close', restoreFigureDialog);
    figDialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeFigureDialog();
    });
    figDialog.addEventListener('click', function (e) {
      if (e.target === figDialog) closeFigureDialog();
    });
    if (figDialogClose) figDialogClose.addEventListener('click', closeFigureDialog);
  }

  els.results.addEventListener('click', function (e) {
    var fig = e.target.closest('.oc-fig--zoom');
    if (!fig) return;
    openFigureDialog(fig);
  });
  els.results.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var fig = e.target.closest('.oc-fig--zoom');
    if (!fig) return;
    e.preventDefault();
    openFigureDialog(fig);
  });

  buildChainFamilyList();
  buildOtherCategoryList();
  buildRingList();
  readQuery();
  if (C.chainPartialOptions().indexOf(state.chainPartialC) === -1) {
    state.chainPartialC = C.INITIAL_CHAIN_PARTIAL;
    state.chainShape = C.INITIAL_CHAIN_SHAPE;
  }
  if (!state.chainShape || !C.chainDescriptorById(state.chainShape)) {
    state.chainShape = '';
    state.chainFamily = '';
  }
  reconcileChainFamily();
  if (state.mode === 'other' && !C.otherFamilies(state.otherCategory).some(function (g) { return g.id === state.otherFamily; })) {
    var groups = C.otherFamilies(state.otherCategory);
    if (groups.length) state.otherFamily = groups[0].id;
  }
  update();
  renderDataStatus();
})();
