/*
 * 有機化学ビルダー — UIロジック
 * 依存: data.js (window.OCData), draw.js (window.OCDraw)
 */
(function () {
  'use strict';

  var D = window.OCData;
  var R = window.OCDraw;
  if (!D || !R) return;

  var validation = R.validateAll(D.COMPOUNDS);
  var valid = {};
  Object.keys(validation).forEach(function (id) {
    if (validation[id].ok) valid[id] = true;
  });

  var state = {
    skeleton: 'alkane-c3',
    group: 'oh'
  };

  var els = {
    skeletonList: document.getElementById('skeleton-list'),
    groupList: document.getElementById('group-list'),
    skeletonPreview: document.getElementById('skeleton-preview'),
    skeletonHint: document.getElementById('skeleton-hint'),
    groupPreview: document.getElementById('group-preview'),
    results: document.getElementById('results-body'),
    resultCount: document.getElementById('result-count'),
    resultDescription: document.getElementById('result-description'),
    dataStatus: document.getElementById('oc-data-status')
  };

  if (!els.skeletonList || !els.groupList || !els.results) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function validIds(ids) {
    return (ids || []).filter(function (id) { return valid[id] && D.COMPOUNDS[id]; });
  }

  function entriesFor(skeletonId, groupId) {
    var table = D.COMBOS[skeletonId];
    if (!table || !table[groupId]) return [];
    var seen = {};
    return table[groupId].filter(function (entry) {
      if (!valid[entry.id] || seen[entry.id]) return false;
      seen[entry.id] = true;
      return true;
    });
  }

  function selectedSkeleton() {
    return D.skeletonById(state.skeleton) || D.SKELETONS[0];
  }

  function selectedGroup() {
    return D.groupById(state.group) || D.GROUPS[0];
  }

  function readQuery() {
    try {
      var params = new URLSearchParams(location.search);
      var s = params.get('skeleton');
      var g = params.get('group');
      if (s && D.skeletonById(s)) {
        state.skeleton = s;
        if (!g) state.group = 'none';
      }
      if (g && D.groupById(g)) state.group = g;
    } catch (e) {}
    var sk = selectedSkeleton();
    if (sk.locked) state.group = 'none';
  }

  function writeQuery() {
    try {
      var url = new URL(location.href);
      url.searchParams.set('skeleton', state.skeleton);
      url.searchParams.set('group', state.group);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
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
      try {
        before = parseFloat(window.getComputedStyle(el).height);
      } catch (e) { before = NaN; }
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
   * 骨格分類の details（open属性は常に最大1・高さアニメーション）
   * 閉じ切ってから次を開く逐次方式。連打は最後の意図を優先する。
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
    if (open) {
      activeDetails = details;
    } else if (activeDetails === details) {
      activeDetails = null;
    }
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
      try {
        current = parseFloat(window.getComputedStyle(body).height);
      } catch (e) { current = NaN; }
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

  function bindSkeletonGroups() {
    var groups = els.skeletonList.querySelectorAll('details.oc-group');
    Array.prototype.forEach.call(groups, function (details) {
      var summary = details.querySelector('summary');
      if (!summary) return;
      // Enter/Space は summary の click として届くため、開閉をここで一元管理する
      summary.addEventListener('click', function (e) {
        if (e.defaultPrevented) return;
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        desiredDetails = desiredDetails === details ? null : details;
        reconcileDetails();
      });
    });
  }

  function buildSkeletonList() {
    var bySection = [];
    var map = {};
    D.SKELETONS.forEach(function (s) {
      if (!map[s.section]) {
        map[s.section] = { name: s.section, items: [] };
        bySection.push(map[s.section]);
      }
      map[s.section].items.push(s);
    });
    var currentSection = selectedSkeleton().section;
    var html = '';
    bySection.forEach(function (section, idx) {
      var open = section.name === currentSection || (idx === 0 && !currentSection);
      html += '<details class="oc-group" ' + (open ? 'open' : '') + '><summary>' +
        esc(section.name) + ' <span class="oc-tag">' + section.items.length + '</span></summary>' +
        '<div class="oc-group__body">';
      section.items.forEach(function (s) {
        html += '<button type="button" class="oc-pick" data-skeleton="' + esc(s.id) + '" aria-pressed="false">' +
          '<span class="oc-pick__label">' + esc(s.label) + '</span>' +
          '<span class="oc-tag">' + esc(s.tag) + '</span></button>';
      });
      html += '</div></details>';
    });
    els.skeletonList.innerHTML = html;
    activeDetails = els.skeletonList.querySelector('details.oc-group[open]');
    desiredDetails = activeDetails;
    detailsPhase = 'idle';
    bindSkeletonGroups();
  }

  function buildGroupList() {
    var html = '<div class="oc-group-title">官能基・置換基</div>';
    D.GROUPS.forEach(function (g) {
      html += '<button type="button" class="oc-pick" data-group="' + esc(g.id) + '" aria-pressed="false">' +
        '<span class="oc-pick__label">' + esc(g.label) + '</span>' +
        '<span class="oc-tag oc-tag--count" data-count-for="' + esc(g.id) + '">' + esc(g.short) + '</span></button>';
    });
    els.groupList.innerHTML = html;
  }

  function syncLists() {
    var sk = selectedSkeleton();
    els.skeletonList.querySelectorAll('[data-skeleton]').forEach(function (btn) {
      var on = btn.getAttribute('data-skeleton') === state.skeleton;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    els.groupList.querySelectorAll('[data-group]').forEach(function (btn) {
      var gid = btn.getAttribute('data-group');
      var on = gid === state.group;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.disabled = !!sk.locked;
      var countEl = btn.querySelector('[data-count-for]');
      if (countEl) {
        if (gid === 'none') {
          var n = validIds(sk.ids).length;
          countEl.textContent = n ? String(n) : '—';
        } else if (sk.locked) {
          countEl.textContent = '—';
        } else {
          var list = entriesFor(sk.id, gid);
          countEl.textContent = list.length ? String(list.length) : '—';
        }
      }
    });
  }

  function renderSkeletonPreview() {
    var sk = selectedSkeleton();
    var ids = validIds(sk.ids);
    var html = '';
    var hasMultiFigure = false;
    ids.forEach(function (id) {
      var c = D.COMPOUNDS[id];
      var figure = c.figures && c.figures.length ? c.figures[0].structure : c.structure;
      if (c.figures && c.figures.length > 1) hasMultiFigure = true;
      html += '<div class="oc-mini">' +
        '<span class="oc-mini__name">' + esc(c.name) + '</span>' +
        R.renderStructure(figure, c.name + 'の構造式') +
        '</div>';
    });
    if (!html) html = '<p class="oc-preview__hint">表示できる構造データがありません。</p>';
    els.skeletonPreview.innerHTML = html;
    var hint = sk.locked
      ? '個別登録された化合物'
      : (ids.length > 1 ? ids.length + '種類の骨格異性体' : '選択した骨格の構造式');
    if (hasMultiFigure) hint += '／構造形態を複数収録';
    els.skeletonHint.textContent = hint;
  }

  function renderGroupPreview() {
    var sk = selectedSkeleton();
    var g = selectedGroup();
    if (sk.locked) {
      els.groupPreview.className = 'oc-preview oc-preview--locked';
      els.groupPreview.innerHTML = '<span class="oc-preview__label">官能基プレビュー</span>' +
        '<div class="oc-group-preview"><div class="oc-group-formula" style="color:var(--oc-muted)">追加なし</div></div>' +
        '<p class="oc-locked-note"><strong>個別登録された化合物です。</strong><br>新しい官能基の追加はできません。<br>' +
        '「追加なし」は「官能基が存在しない」という意味ではありません。</p>';
      return;
    }
    els.groupPreview.className = 'oc-preview';
    var svg = R.renderGroupPreview(g.id, g.label);
    els.groupPreview.innerHTML = '<span class="oc-preview__label">官能基プレビュー</span>' +
      '<div class="oc-group-preview">' + (g.id === 'none'
        ? '<div class="oc-group-formula">＋ なし</div>'
        : svg) + '</div>' +
      (g.id === 'none' ? '' : '<div class="oc-group-formula" style="font-size:' + (g.formula.length > 6 ? '24px' : '32px') + '">' + esc(g.formula) + '</div>') +
      '<p class="oc-group-caption">' + esc(g.description) + '</p>' +
      (g.id !== 'none' ? '<p class="oc-group-caption" style="font-size:10.5px">Rは炭素骨格との結合位置を表します。</p>' : '');
  }

  function fact(label, value, opts) {
    opts = opts || {};
    var missing = !value || value === '情報未登録';
    var cls = 'oc-fact' + (missing ? ' oc-fact--missing' : '') + (opts.warn ? ' oc-fact--warn' : '');
    return '<div class="' + cls + '"><strong>' + esc(label) + '</strong><span>' +
      esc(missing ? '情報未登録' : value) + '</span></div>';
  }

  function renderCard(c, individual, skeletonOnly) {
    var cat = D.categoryById(c.category);
    var catLabel = cat ? cat.name : c.category;
    if (c.subcategory) catLabel += '・' + c.subcategory;
    var v = validation[c.id] || {};
    var verificationShort = v.verification ? v.verification.short : '未確認';
    var formulaText = c.formulaDisplay || R.formatFormula(c.formula);
    var formulaLabel = c.formulaVariable ? '一般式' : '分子式';
    var badges = [];
    badges.push('<span class="oc-badge">' + esc(individual ? '個別登録' : (skeletonOnly ? '骨格のみ' : '組合せ生成')) + '</span>');
    if (c.figures && c.figures.length > 1) badges.push('<span class="oc-badge">' + c.figures.length + '形態</span>');
    var note = c.notes || '';
    if (c.dataStatus === 'minimal') {
      note = (note ? note + ' ' : '') + '個別の用途・由来などの詳細は情報未登録です。';
    }
    var pubchem = '';
    if (c.pubchem) {
      pubchem = '<a href="https://pubchem.ncbi.nlm.nih.gov/compound/' + encodeURIComponent(c.pubchem) +
        '" target="_blank" rel="noopener">出典: PubChem CID ' + esc(c.pubchem) + '</a>';
    } else {
      pubchem = '<span>出典: 収録台帳を参照</span>';
    }
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
        (c.hazards ? fact('危険性', c.hazards, { warn: true }) : '') +
      '</div>' +
      (note ? '<p class="oc-card__note">' + esc(note) + '</p>' : '') +
      '<div class="oc-card__foot"><span class="oc-verify">検証: ' + esc(verificationShort) + '</span>' + pubchem +
        '<a href="./ledger.html#c-' + encodeURIComponent(c.id) + '">収録台帳で見る →</a></div>' +
      '</article>';
  }

  function renderResults() {
    var sk = selectedSkeleton();
    var g = selectedGroup();
    var entries = entriesFor(sk.id, g.id);
    var individual = !!sk.locked;
    var desc;
    if (individual) desc = '個別登録された化合物の説明';
    else if (g.id === 'none') desc = '炭素骨格そのものの物質を表示中';
    else desc = '選択に対応する登録済み化合物を表示中';
    els.resultDescription.textContent = desc;
    els.resultCount.textContent = entries.length ? entries.length + ' 種類' : '0 種類';

    if (!entries.length) {
      var reason = g.id === 'none'
        ? 'この骨格の化合物は分子式・登録データ整合の確認に通りませんでした。'
        : D.unsupportedReason(sk.id, g.id);
      els.results.innerHTML = '<div class="oc-empty"><strong>この組み合わせは未収録です</strong>' +
        '<p>' + esc(reason) + '</p>' +
        '<p style="margin-top:8px">収録範囲と未対応事項は <a href="./ledger.html">収録台帳</a> で確認できます。</p></div>';
      return;
    }

    // 由来骨格ごとにグループ化（異性体の比較用）
    var groups = [];
    var index = {};
    entries.forEach(function (entry) {
      var key = entry.from || '';
      if (!index[key]) {
        index[key] = { key: key, items: [] };
        groups.push(index[key]);
      }
      index[key].items.push(entry);
    });
    var showHeadings = groups.length > 1 || (groups.length === 1 && groups[0].key !== '');
    var html = '';
    groups.forEach(function (group) {
      var cardClass = 'oc-cards' + (group.items.length === 1 ? ' oc-cards--single' : '');
      if (showHeadings) {
        html += '<div class="oc-subgroup"><h4 class="oc-subgroup__title">' +
          esc(group.key || '選択した骨格から') + '</h4><div class="' + cardClass + '">';
      } else {
        html += '<div class="' + cardClass + '">';
      }
      group.items.forEach(function (entry) {
        html += renderCard(D.COMPOUNDS[entry.id], individual, !individual && g.id === 'none');
      });
      html += '</div></div>';
    });
    els.results.innerHTML = html + '<p class="oc-results__note">※ グラフ構造は原子数・結合価・分子式を自動照合し、環＋置換・投影式・簡略式・トリグリセリド・重合体・模式図は分子式・一般式と登録データの整合を確認しています。' +
      '描画の見た目は自動検証の対象外です。</p>';
  }

  function renderDataStatus() {
    if (!els.dataStatus) return;
    var total = Object.keys(D.COMPOUNDS).length;
    var ok = Object.keys(valid).length;
    var atomCount = 0, otherCount = 0;
    Object.keys(valid).forEach(function (id) {
      var v = validation[id];
      if (v.verification && v.verification.level === 'atom') atomCount++;
      else otherCount++;
    });
    els.dataStatus.textContent = '収録 ' + total + ' 化合物／分子式・登録データ整合 ' + ok +
      ' 件（原子レベル ' + atomCount + '・非グラフ ' + otherCount + '。非グラフは分子式・登録データの整合で判定）';
  }

  function scrollActiveSkeleton() {
    var active = els.skeletonList.querySelector('[data-skeleton][aria-pressed="true"]');
    if (!active) return;
    var listRect = els.skeletonList.getBoundingClientRect();
    var btnRect = active.getBoundingClientRect();
    if (btnRect.top < listRect.top || btnRect.bottom > listRect.bottom) {
      els.skeletonList.scrollTop += btnRect.top - listRect.top - 42;
    }
  }

  var firstRender = true;

  function update() {
    var sk = selectedSkeleton();
    if (sk.locked) state.group = 'none';
    syncLists();
    if (firstRender) {
      firstRender = false;
      renderSkeletonPreview();
      renderGroupPreview();
      renderResults();
    } else {
      animateHeight(els.skeletonPreview, renderSkeletonPreview);
      animateHeight(els.groupPreview, renderGroupPreview);
      animateHeight(els.results, renderResults);
    }
    scrollActiveSkeleton();
    writeQuery();
  }

  function selectSkeleton(id) {
    var sk = D.skeletonById(id);
    if (!sk) return;
    state.skeleton = id;
    if (sk.locked) state.group = 'none';
    update();
  }

  function selectGroup(id) {
    var g = D.groupById(id);
    if (!g) return;
    if (selectedSkeleton().locked) return;
    state.group = id;
    update();
  }

  els.skeletonList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-skeleton]');
    if (!btn) return;
    selectSkeleton(btn.getAttribute('data-skeleton'));
  });
  els.groupList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-group]');
    if (!btn || btn.disabled) return;
    selectGroup(btn.getAttribute('data-group'));
  });

  readQuery();
  buildSkeletonList();
  buildGroupList();
  syncLists();
  update();
  renderDataStatus();
})();
