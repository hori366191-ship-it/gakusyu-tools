/*
 * 有機化学ビルダー — 収録台帳の描画
 */
(function () {
  'use strict';

  var D = window.OCData;
  var R = window.OCDraw;
  var E = window.OCExternal;
  if (!D || !R) return;

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  var validation = R.validateAll(D.COMPOUNDS);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var ids = Object.keys(D.COMPOUNDS);

  // 組合せ生成で参照されている経路
  var paths = {};
  var hasSubstitution = {};
  Object.keys(D.COMBOS).forEach(function (sid) {
    var sk = D.skeletonById(sid);
    if (!sk || sk.locked) return;
    Object.keys(D.COMBOS[sid]).forEach(function (gid) {
      var g = D.groupById(gid);
      D.COMBOS[sid][gid].forEach(function (entry) {
        if (!paths[entry.id]) paths[entry.id] = [];
        paths[entry.id].push(sk.label + ' × ' + (g ? g.label : gid));
        if (gid !== 'none') hasSubstitution[entry.id] = true;
      });
    });
  });

  function methodOf(id) {
    if (!paths[id] || !paths[id].length) return '個別登録';
    return hasSubstitution[id] ? '組合せ生成' : '骨格のみ';
  }

  function structureTypeLabel(spec) {
    if (!spec) return '構造: 未登録';
    if (['skeleton', 'sub', 'multi', 'custom'].indexOf(spec.type) !== -1) return '構造: グラフ';
    if (spec.type === 'projection') return spec.kind === 'haworth' ? '構造: ハース投影式' : '構造: フィッシャー投影式';
    if (spec.type === 'ring-sub') return '構造: 環＋置換';
    if (spec.type === 'condensed') return '構造: 簡略式';
    if (spec.type === 'triglyceride') return '構造: トリグリセリド';
    if (spec.type === 'polymer') return '構造: 重合体';
    if (spec.type === 'schematic') return '構造: 模式図';
    return '構造: ' + spec.type;
  }

  function isomerInfo(c) {
    var type = structureTypeLabel(c.structure);
    if (c.figures && c.figures.length > 1) return type + '／' + c.figures.length + '形態（' + c.figures.map(function (f) { return f.label; }).join(' / ') + '）';
    if (c.notes) return type + '／' + c.notes;
    if (paths[c.id] && paths[c.id].length) return type + '／' + paths[c.id][0];
    return type;
  }

  function dataStatusLabel(s) {
    if (s === 'full') return '詳細あり';
    if (s === 'class') return '分類相当';
    return '最小限';
  }

  // ---- 統計 ----
  var okCount = ids.filter(function (id) { return validation[id].ok; }).length;
  var atomCount = ids.filter(function (id) {
    return validation[id].ok && validation[id].verification && validation[id].verification.level === 'atom';
  }).length;
  var otherCount = ids.filter(function (id) {
    return validation[id].ok && (!validation[id].verification || validation[id].verification.level !== 'atom');
  }).length;
  var stats = [
    { b: ids.length, s: '収録化合物' },
    { b: D.CATEGORIES.length, s: '対象分野' },
    { b: okCount, s: '分子式・登録データ整合' },
    { b: atomCount, s: '原子レベルの構造検証' }
  ];
  document.getElementById('ledger-stats').innerHTML = stats.map(function (x) {
    return '<div class="oc-stat"><b>' + esc(x.b) + '</b><span>' + esc(x.s) + '</span></div>';
  }).join('');
  var invalidCount = ids.filter(function (id) { return !validation[id].ok; }).length;
  document.getElementById('ledger-verification-note').textContent =
    '「分子式・登録データ整合」は、グラフ構造では原子数・結合価・分子式、環＋置換・投影式・簡略式・トリグリセリド・重合体・模式図では分子式・一般式と登録データの整合を確認した件数です。' +
    '原子レベルの構造検証は ' + atomCount + ' 件、非グラフは ' + otherCount + ' 件で、非グラフは分子式・一般式と登録データの整合、模式図・可変組成は表示式のみで判定しています（原子レベルの検証対象外）。' +
    (invalidCount ? ' 検証に失敗したデータが ' + invalidCount + ' 件あります（範囲外ではなくデータ不備として扱います）。' : ' すべての登録データが検証に合格しています。');

  // ---- 19分野の収録状況 ----
  var catCounts = {};
  ids.forEach(function (id) {
    var c = D.COMPOUNDS[id];
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
  });
  document.getElementById('ledger-coverage').innerHTML = D.CATEGORIES.map(function (cat) {
    var n = catCounts[cat.id] || 0;
    return '<div class="oc-coverage__item"><b>' + esc(cat.name) + '</b>' +
      '<span class="oc-coverage__count">' + n + ' 件</span>' +
      '<span>' + esc(cat.note) + '</span></div>';
  }).join('');

  // ---- カバレッジ・チェックリスト ----
  var coverageEl = document.getElementById('ledger-coverage-checklist');
  if (coverageEl && D.COVERAGE) {
    var checked = 0, totalItems = 0;
    var covHtml = '';
    D.COVERAGE.forEach(function (group) {
      var rows = group.items.map(function (id) {
        totalItems++;
        var c = D.COMPOUNDS[id];
        var v = c ? validation[id] : null;
        var status = !c ? '<span class="oc-ng">未登録</span>' :
          (v && v.ok ? '<span class="oc-ok">✓ 登録・検証済み</span>' : '<span class="oc-ng">✗ 検証失敗</span>');
        if (c && v && v.ok) checked++;
        return '<li><span class="oc-id">' + esc(id) + '</span> ' +
          (c ? esc(c.name) : '—') + ' ' + status + '</li>';
      }).join('');
      covHtml += '<details class="oc-group" style="margin-bottom:8px">' +
        '<summary>' + esc(group.label) + ' <span class="oc-tag">' + group.items.length + '件</span>' +
        (D.SOURCES[group.source] ? ' <span class="oc-micro">出典: ' + esc(D.SOURCES[group.source].label) + '</span>' : '') +
        '</summary>' +
        '<ul class="oc-notes" style="margin-top:6px">' + rows + '</ul></details>';
    });
    coverageEl.innerHTML = '<p class="oc-ledger__note"><b>' + checked + ' / ' + totalItems + '</b> 項目が登録・検証済みです。' +
      '（延べ ' + D.COVERAGE_STATS.totalItems + ' 項目、ユニーク ' + D.COVERAGE_STATS.uniqueItems + ' 件、重複 ' + D.COVERAGE_STATS.duplicateItems + ' 件）' +
      '<br>固定requiredリスト: ' + D.REQUIRED_CURRICULUM.length + ' 件（未登録 ' + D.COVERAGE_STATS.missing.length + ' 件、カバレッジ外 ' + D.COVERAGE_STATS.uncovered.length + ' 件。カバレッジ外は外部照合台帳で追加した発展・探究項目を含みます）' +
      '<br>' + esc(D.COVERAGE_META.note) + '<br>' + esc(D.COVERAGE_META.scope) + '<br>' + esc(D.COVERAGE_META.exclusions) + '</p>' + covHtml;
  }

  // ---- 外部公開資料との照合 ----
  if (E && document.getElementById('ledger-external-rows')) {
    var extAudit = E.audit(D);
    var kindLabel = function (k) {
      return { compound: '化合物', alias: '別名', material: '材料', mixture: '混合物', inorganic: '無機（対象外）', class: '総称' }[k] || k;
    };
    var refLabel = function (row) {
      if (row.kind === 'compound' || row.kind === 'alias') {
        return '<a href="#c-' + esc(row.ref) + '">' + esc(row.ref) + '</a>';
      }
      if (row.kind === 'material') {
        var m = D.materialByTerm(row.name);
        return m && m.of ? esc(m.of) + ' の材料' : '材料索引';
      }
      if (row.kind === 'mixture') return '混合物（単一化合物でない）';
      if (row.kind === 'inorganic') return '対象外（無機）';
      if (row.kind === 'class') {
        var cat = D.categoryById(row.ref);
        return (cat ? esc(cat.name) : esc(row.ref)) + '（総称）';
      }
      return '—';
    };
    var extStats = [
      { b: extAudit.sources, s: '資料' },
      { b: extAudit.uniqueNames, s: '抽出名称（重複除く）' },
      { b: extAudit.rows, s: '照合行' },
      { b: extAudit.missing.length, s: '未対応' }
    ];
    document.getElementById('ledger-external-stats').innerHTML = extStats.map(function (x) {
      return '<div class="oc-stat"><b>' + esc(x.b) + '</b><span>' + esc(x.s) + '</span></div>';
    }).join('');
    var kindBits = E.KINDS.map(function (k) {
      return kindLabel(k) + ' ' + (extAudit.byKind[k] || 0);
    }).join(' / ');
    var levelBits = E.LEVELS.map(function (l) {
      return l + ' ' + (extAudit.byLevel[l] || 0);
    }).join(' / ');
    document.getElementById('ledger-external-note').textContent =
      '照合結果: ' + (extAudit.missing.length === 0 ? '未対応 0 件（すべて収録ID・別名・材料索引・対象外のいずれかに対応）' :
        '未対応 ' + extAudit.missing.length + ' 件（下の表で赤く表示）') +
      '。種別内訳: ' + kindBits + '。資料側ラベル: ' + levelBits +
      '。外部説明は転載せず、短い根拠は本アプリ用に要約したものです。';
    var extRows = E.ROWS.map(function (row, idx) {
      var src = E.SOURCES[row.source];
      var res = E.resolveRow(row, D);
      var missing = !res.ok;
      var srcCell = src ? '<a href="' + esc(src.url) + '" target="_blank" rel="noopener" title="' +
        esc(src.title) + '">' + esc(row.source) + '</a> <span class="oc-micro">' + esc(src.domain) + '</span>' : esc(row.source);
      return '<tr' + (missing ? ' class="oc-ext-missing"' : '') + ' data-ext-index="' + idx + '">' +
        '<td><b>' + esc(row.name) + '</b></td>' +
        '<td>' + esc(kindLabel(row.kind)) + '</td>' +
        '<td class="oc-id">' + refLabel(row) + '</td>' +
        '<td>' + srcCell + '</td>' +
        '<td>' + esc(row.section) + '</td>' +
        '<td><span class="oc-id">' + esc(row.date) + '</span></td>' +
        '<td>' + esc(row.evidence) + (missing ? '<br><span class="oc-ng">' + esc(res.reason) + '</span>' : '') + '</td>' +
        '<td><span class="oc-ext-level oc-ext-level--' + esc(row.level) + '">' + esc(row.level) + '</span></td>' +
        '<td>' + esc(row.note || '') + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('ledger-external-rows').innerHTML = extRows;
  }

  // ---- 分類フィルタ ----
  var catSelect = document.getElementById('ledger-category');
  D.CATEGORIES.forEach(function (cat) {
    var opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    catSelect.appendChild(opt);
  });

  // ---- 化合物一覧 ----
  var rows = document.getElementById('ledger-rows');
  var search = document.getElementById('ledger-search');
  var filterCount = document.getElementById('ledger-filter-count');
  var didHashScroll = false;

  function sourceCell(c) {
    var bits = [];
    if (c.pubchem) {
      bits.push('<a href="https://pubchem.ncbi.nlm.nih.gov/compound/' + encodeURIComponent(c.pubchem) +
        '" target="_blank" rel="noopener">CID ' + esc(c.pubchem) + '</a>');
    }
    (c.sources || []).forEach(function (sid) {
      var src = D.SOURCES[sid];
      if (!src) return;
      var short = sid === 'textbook' ? '教科書' : (sid === 'pubchem' ? 'PubChem' : src.label.split('（')[0]);
      if (sid === 'pubchem' && c.pubchem) return;
      bits.push('<span class="oc-src-tag">' + esc(short) + '</span>');
    });
    return bits.join(' ') || '—';
  }

  function renderRows() {
    var q = (search.value || '').trim().toLowerCase();
    var cat = catSelect.value;
    var shown = 0;
    var html = '';
    ids.forEach(function (id) {
      var c = D.COMPOUNDS[id];
      var v = validation[id];
      if (cat && c.category !== cat) return;
      var hay = (c.name + ' ' + id + ' ' + c.formula + ' ' + (c.formulaDisplay || R.formatFormula(c.formula)) + ' ' + (D.categoryById(c.category) || {}).name + ' ' + (c.subcategory || '') + ' ' + (D.searchTermsFor ? D.searchTermsFor(id).join(' ') : '')).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;
      shown++;
      var catName = D.categoryById(c.category) ? D.categoryById(c.category).name : c.category;
      if (c.subcategory) catName += '・' + c.subcategory;
      html += '<tr id="c-' + esc(id) + '">' +
        '<td class="oc-id">' + esc(id) + '</td>' +
        '<td><b>' + esc(c.name) + '</b></td>' +
        '<td>' + esc(catName) + '</td>' +
        '<td><span class="oc-id">' + esc(c.formulaDisplay || R.formatFormula(c.formula)) + '</span></td>' +
        '<td>' + esc(methodOf(id)) + '</td>' +
        '<td>' + esc(isomerInfo(c)) + '</td>' +
        '<td>' + (v.ok ? '<span class="oc-ok">✓ ' + esc(v.verification ? v.verification.short : '確認済み') + '</span>' : '<span class="oc-ng">✗ 要確認</span><br>' + esc(v.errors.join(' / '))) + '</td>' +
        '<td>' + esc(dataStatusLabel(c.dataStatus)) + '</td>' +
        '<td>' + sourceCell(c) + '</td>' +
        '</tr>';
    });
    rows.innerHTML = html || '<tr><td colspan="9">該当する化合物がありません。</td></tr>';
    filterCount.textContent = shown + ' / ' + ids.length + ' 件';
    if (!didHashScroll && location.hash && location.hash.indexOf('#c-') === 0) {
      didHashScroll = true;
      try {
        var targetId = decodeURIComponent(location.hash.slice(1));
        var target = document.getElementById(targetId);
        if (target) {
          target.style.background = 'var(--oc-accent-bg)';
          setTimeout(function () { target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }, 60);
        }
      } catch (e) {}
    }
  }

  search.addEventListener('input', renderRows);
  catSelect.addEventListener('change', renderRows);
  renderRows();

  // ---- 未対応の組み合わせ ----
  var unsupported = [];
  D.SKELETONS.forEach(function (sk) {
    if (sk.locked) return;
    D.GROUPS.forEach(function (g) {
      if (g.id === 'none') return;
      var list = (D.COMBOS[sk.id] || {})[g.id] || [];
      if (!list.length) {
        var entry = D.unsupportedEntry ? D.unsupportedEntry(sk.id, g.id) : null;
        unsupported.push({
          section: sk.section,
          label: sk.label,
          group: g.label,
          type: entry ? entry.type : 'data-error',
          reason: entry ? entry.reason : '理由データ未登録（データ不備）',
          examples: entry ? entry.examples : []
        });
      }
    });
  });
  var unsupportedBySection = {};
  unsupported.forEach(function (u) {
    if (!unsupportedBySection[u.section]) unsupportedBySection[u.section] = [];
    unsupportedBySection[u.section].push(u);
  });
  var uhtml = '';
  Object.keys(unsupportedBySection).forEach(function (section) {
    var list = unsupportedBySection[section];
    uhtml += '<details class="oc-group" style="margin-bottom:8px">' +
      '<summary>' + esc(section) + ' <span class="oc-tag">' + list.length + '件</span></summary>' +
      '<ul class="oc-notes" style="margin-top:6px">';
    list.forEach(function (u) {
      var typeLabel = u.type === 'out-of-scope' ? '高校化学の範囲外' :
        (u.type === 'chemically-invalid' ? '化学的に成立しない' : 'データ不備');
      uhtml += '<li><b>' + esc(u.label) + ' ＋ ' + esc(u.group) + '</b> — <span class="oc-reason-type">' +
        esc(typeLabel) + '</span> ' + esc(u.reason) +
        (u.examples && u.examples.length ? ' <span class="oc-micro">例: ' + esc(u.examples.join('、')) + '</span>' : '') + '</li>';
    });
    uhtml += '</ul></details>';
  });
  document.getElementById('ledger-unsupported').innerHTML = uhtml || '<p>未対応の組み合わせはありません。</p>';

  // ---- 本版の範囲 ----
  document.getElementById('ledger-notes').innerHTML = D.LEDGER_NOTES.map(function (n) {
    return '<li><b>' + esc(n.title) + '</b> — ' + esc(n.detail) + '</li>';
  }).join('');

  // ---- 出典 ----
  var srcHtml = '';
  Object.keys(D.SOURCES).forEach(function (sid) {
    var s = D.SOURCES[sid];
    srcHtml += '<li><b>' + esc(s.label) + '</b> — ' + esc(s.note) +
      (s.url ? ' <a href="' + esc(s.url) + '" target="_blank" rel="noopener">リンク</a>' : '') + '</li>';
  });
  srcHtml += '<li><b>検証方法</b> — グラフ構造では、構造データから炭素・水素・酸素などの原子数を計算して登録分子式と照合し、各原子の結合次数と水素数の合計が原子価（C=4, N=3, O=2, Cl=1）に一致するか確認します。環＋置換・投影式・簡略式・トリグリセリド・重合体・模式図では、手入力した組成と登録した分子式・一般式の整合を確認します。このため「分子式・登録データ整合」は描画の完全な自動検証を意味しません。描画の見た目は自動検証の対象外です。一致しないデータはアプリに表示しません。</li>';
  srcHtml += '<li><b>描画方法</b> — 水素の明示、ベンゼン環のケクレ式、グルコースのフィッシャー／ハース投影式を正確に再現するため、外部の構造描画ライブラリに依存せず、登録データから自作SVGを生成しています。ベンゼン環は内部ではケクレ式の交互二重結合として結合次数を保持し、芳香族性フラグも合わせて持っています。</li>';
  srcHtml += '<li><b>グルコース投影式</b> — 鎖状D-グルコースのフィッシャー投影式、α/β-D-グルコピラノースのハース投影式について、C1〜C5のOHの向きをデータ（stereo）として保持し、SVGの立体情報と一致することを自動テストで確認しています。</li>';
  document.getElementById('ledger-sources').innerHTML = srcHtml;
})();
