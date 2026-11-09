/*
 * 有機化学ビルダー — 収録台帳の描画
 */
(function () {
  'use strict';

  var D = window.OCData;
  var R = window.OCDraw;
  var C = window.OCCatalog;
  var E = window.OCExternal;
  var M = window.OCIndex;
  var A = window.OCIndexAudit;
  var IA = window.OCIndependentAudit;
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

  // 台帳から新版の探し方（鎖式 / 芳香族・環式 / その他）へ戻す。
  function appHref(id) {
    var route = C && C.routeFor ? C.routeFor(id) : null;
    if (!route) return './index.html?focus=' + encodeURIComponent(id);
    var q = ['mode=' + encodeURIComponent(route.mode)];
    if (route.mode === 'chain') {
      q.push('family=' + encodeURIComponent(route.family));
      q.push('c=' + encodeURIComponent(route.carbon));
      if (route.structure) q.push('structure=' + encodeURIComponent(route.structure));
    } else if (route.mode === 'ring') {
      q.push('system=' + encodeURIComponent(route.system));
      if (route.group) q.push('group=' + encodeURIComponent(route.group));
    } else {
      q.push('category=' + encodeURIComponent(route.category || 'other'));
      if (route.family) q.push('family=' + encodeURIComponent(route.family));
    }
    q.push('focus=' + encodeURIComponent(id));
    return './index.html?' + q.join('&');
  }

  function routeLabel(id) {
    var route = C && C.routeFor ? C.routeFor(id) : null;
    if (!route) return '個別登録';
    if (route.mode === 'chain') return '鎖式・' + (C.CHAIN_FAMILY_LABEL[route.family] || route.family) + '・C' + route.carbon;
    if (route.mode === 'ring') return '環式・' + (C.RING_SYSTEM_MAP[route.system] ? C.RING_SYSTEM_MAP[route.system].label : route.system);
    var g = C.OTHER_GROUP_MAP[route.family];
    return 'その他・' + (g ? g.label : route.category);
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
  var coordinationCount = ids.filter(function (id) {
    return validation[id].ok && validation[id].verification && validation[id].verification.level === 'coordination';
  }).length;
  var nonGraphCount = ids.filter(function (id) {
    return validation[id].ok && (!validation[id].verification || validation[id].verification.level !== 'atom') &&
      !(validation[id].verification && validation[id].verification.level === 'coordination');
  }).length;
  var stats = [
    { b: ids.length, s: '収録化合物' },
    { b: D.CATEGORIES.length, s: '対象分野' },
    { b: D.FAMILIES.length, s: 'family（固定分子式なしを含む）' },
    { b: D.MATERIALS.length, s: '材料・混合物索引' },
    { b: okCount, s: '分子式・登録データ整合' },
    { b: atomCount, s: '原子レベルの構造検証（配位錯体を除く）' }
  ];
  document.getElementById('ledger-stats').innerHTML = stats.map(function (x) {
    return '<div class="oc-stat"><b>' + esc(x.b) + '</b><span>' + esc(x.s) + '</span></div>';
  }).join('');
  var invalidCount = ids.filter(function (id) { return !validation[id].ok; }).length;
  document.getElementById('ledger-verification-note').textContent =
    '「分子式・登録データ整合」は、グラフ構造では原子数・結合価・分子式、環＋置換・投影式・簡略式・トリグリセリド・重合体・模式図では分子式・一般式と登録データの整合を確認した件数です。' +
    '原子レベルの構造検証は ' + atomCount + ' 件、非グラフは ' + nonGraphCount + ' 件で、非グラフは分子式・一般式と登録データの整合、模式図・可変組成は表示式のみで判定しています（原子レベルの検証対象外）。' +
    '配位結合を含む ' + coordinationCount + ' 件は、金属—配位原子の結合を原子価の数え方から除外し、原子レベルの検証対象外として分子式・組成のみ確認しています。' +
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

  // ---- family・材料索引 ----
  var famEl = document.getElementById('ledger-families');
  if (famEl) {
    famEl.innerHTML = '<div class="oc-coverage">' + D.FAMILIES.map(function (f) {
      return '<div class="oc-coverage__item" id="f-' + esc(f.id) + '"><b>' + esc(f.name) + '</b>' +
        '<span class="oc-coverage__count">' + esc(f.kind || 'family') + '</span>' +
        '<span>' + esc(f.summary || '') + '</span>' +
        (f.formula ? '<span class="oc-micro">' + esc(f.formula) + '</span>' : '<span class="oc-micro">組成依存・固定分子式なし</span>') +
        '</div>';
    }).join('') + '</div>';
  }
  var matRows = document.getElementById('ledger-materials');
  if (matRows) {
    matRows.innerHTML = D.MATERIALS.map(function (m) {
      var of = m.of && D.COMPOUNDS[m.of] ? D.COMPOUNDS[m.of].name : '—';
      return '<tr id="m-' + esc(m.id) + '"><td class="oc-id">' + esc(m.id) + '</td>' +
        '<td><b>' + esc(m.name) + '</b></td>' +
        '<td>' + esc(m.kind || 'material') + '</td>' +
        '<td>' + esc(of) + '</td>' +
        '<td>' + esc(m.note || '') + '</td></tr>';
    }).join('');
  }

  // ---- 全章索引の監査 ----
  var idxStats = document.getElementById('ledger-index-stats');
  if (idxStats && M) {
    var auditResult = A ? A.audit(D) : { findings: 0, missing: [] };
    idxStats.innerHTML = [
      { b: M.COUNTS.total, s: '取得URL' },
      { b: M.CHAPTERS.length, s: '章・節' },
      { b: M.COUNTS.byKind.lesson, s: 'lesson' },
      { b: M.COUNTS.bySource['idx-kimika'], s: '化学のグルメ記事' },
      { b: auditResult.findings, s: '要判断事項' },
      { b: auditResult.missing.length, s: '監査未解決' }
    ].map(function (x) {
      return '<div class="oc-stat"><b>' + esc(x.b) + '</b><span>' + esc(x.s) + '</span></div>';
    }).join('');
    var chapters = document.getElementById('ledger-index-chapters');
    if (chapters) {
      chapters.innerHTML = '<div class="oc-table-wrap"><table class="oc-table"><caption class="oc-sr-only">章・節ごとの取得数</caption>' +
        '<thead><tr><th scope="col">章・節</th><th scope="col">URL</th><th scope="col">期待lesson</th><th scope="col">取得lesson</th><th scope="col">全ページ</th></tr></thead><tbody>' +
        M.CHAPTERS.map(function (ch) {
          return '<tr><td><b>' + esc(ch.name) + '</b></td><td><a href="' + esc(ch.url) + '" target="_blank" rel="noopener">' + esc(ch.url) + '</a></td>' +
            '<td>' + esc(ch.expectedLessons) + '</td><td>' + esc(ch.obtainedLessons) + '</td><td>' + esc(ch.allPages) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    var idxNote = document.getElementById('ledger-index-note');
    if (idxNote) {
      idxNote.textContent = '取得日 ' + M.RETRIEVED + '。URL・title・節・種別・HTTP状態・文字数・SHA-256 を保持し、全' +
        M.COUNTS.total + '件がHTTP 200です。要判断事項 ' + auditResult.findings +
        '件は化合物・family・材料/混合物・無機対象外のいずれかへ対応づけ、未解決 ' + auditResult.missing.length + '件です。' +
        '画像の全OCR・動画の視聴/文字起こしは未完了であり、教材の完全網羅を主張しません。';
    }
    var auditRows = document.getElementById('ledger-audit-rows');
    if (auditRows && A) {
      var resLabel = { compound: '化合物', family: 'family', material: '材料/混合物', variant: '置換度variant', inorganic: '無機（対象外）' };
      auditRows.innerHTML = A.FINDINGS.map(function (f) {
        var ref = '—';
        if (f.resolution === 'compound' && D.COMPOUNDS[f.ref]) ref = '<a href="' + esc(appHref(f.ref)) + '">' + esc(D.COMPOUNDS[f.ref].name) + '</a>';
        else if ((f.resolution === 'material' || f.resolution === 'variant') && D.materialById && D.materialById(f.ref)) ref = '<a href="#m-' + esc(f.ref) + '">' + esc(D.materialById(f.ref).name) + '</a>';
        else if (f.resolution === 'family' && D.familyById && D.familyById(f.ref)) ref = '<a href="#f-' + esc(f.ref) + '">' + esc(D.familyById(f.ref).name) + '</a>';
        var urls = (f.urls || []).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">根拠</a>'; }).join(' ');
        return '<tr><td><b>' + esc(f.term) + '</b></td><td>' + esc(f.kind || '') + '</td>' +
          '<td>' + esc(resLabel[f.resolution] || f.resolution) + '</td><td>' + ref + '</td>' +
          '<td>' + esc(f.quote || '') + ' ' + urls + '</td><td>' + esc(f.supplement || '') + '</td></tr>';
      }).join('');
    }
    var limits = document.getElementById('ledger-manifest-limits');
    if (limits) {
      limits.innerHTML = M.LIMITS.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
        '<li>外部抽出の候補625語のうち、未分類の語は別監査で継続中です。本台帳は未完了を明記し、教材の完全網羅を保証しません。</li>';
    }
  }

  // ---- 独立625語監査 ----
  var indStats = document.getElementById('ledger-independent-stats');
  if (indStats && IA) {
    var ia = IA.audit(D);
    indStats.innerHTML = [
      { b: ia.total, s: '625語（全分類）' },
      { b: Object.keys(ia.byLabel).length, s: 'label種別' },
      { b: ia.unresolved.length, s: '未解決' },
      { b: IA.TRUE_MISSING.length, s: '画像実証の追加物質/イオン/塩' },
      { b: IA.MANDATORY.length, s: 'name/state/family mapping' },
      { b: IA.CROSSWALK.length, s: '旧65件crosswalk' },
      { b: ia.crosswalk, s: 'crosswalk件数' }
    ].map(function (x) {
      return '<div class="oc-stat"><b>' + esc(x.b) + '</b><span>' + esc(x.s) + '</span></div>';
    }).join('');
    var indNote = document.getElementById('ledger-independent-note');
    if (indNote) {
      var labelBits = Object.keys(ia.byLabel).map(function (k) { return k + ' ' + ia.byLabel[k]; }).join(' / ');
      indNote.textContent = '625/625分類、旧未判定209/209解消。label内訳: ' + labelBits +
        '。未解決 ' + ia.unresolved.length + '件、mapping未解決 ' + ia.mandatoryUnresolved.length +
        '件、画像実証の未収録 ' + ia.trueMissingMissing.length + '件。' +
        '範囲差: ' + esc(IA.META.scopeDiff.candidateList) + ' ' + esc(IA.META.scopeDiff.compounds) +
        ' 全1399画像のOCR・全動画は未実施であり、625候補の分類完了を教材全名称の抽出完了とは主張しません。';
    }
    var mand = document.getElementById('ledger-independent-mandatory');
    if (mand) {
      var targetCell = function (type, target) {
        if (!target) return '—';
        if ((type === 'compound' || type === 'alias') && D.COMPOUNDS[target]) return '<a href="' + esc(appHref(target)) + '">' + esc(D.COMPOUNDS[target].name) + '</a>';
        if (type === 'family' && D.familyById && D.familyById(target)) return '<a href="#f-' + esc(target) + '">' + esc(D.familyById(target).name) + '</a>';
        if ((type === 'material' || type === 'mixture') && D.materialById && D.materialById(target)) return '<a href="#m-' + esc(target) + '">' + esc(D.materialById(target).name) + '</a>';
        return esc(target);
      };
      mand.innerHTML = IA.MANDATORY.map(function (m) {
        return '<tr><td><b>' + esc(m.term) + '</b></td><td>' + esc(m.kind || m.label) + '</td>' +
          '<td>' + targetCell(m.targetType, m.target) + '</td><td>' + esc(m.explanation || '') + '</td>' +
          '<td>' + (m.url ? '<a href="' + esc(m.url) + '" target="_blank" rel="noopener">根拠</a>' : '—') + '</td>' +
          '<td><span class="oc-id">' + esc(m.provenance || '') + '</span></td></tr>';
      }).join('');
    }
    var indRows = document.getElementById('ledger-independent-rows');
    if (indRows) {
      indRows.innerHTML = IA.ENTRIES.map(function (e) {
        return '<tr><td><b>' + esc(e.term) + '</b></td><td>' + esc(e.label) + '</td>' +
          '<td>' + esc(e.mappingType) + '</td><td>' + targetCell(e.mappingType, e.target) + '</td>' +
          '<td>' + esc(e.note || '') + '</td><td>' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">根拠</a>' : '—') + '</td>' +
          '<td><span class="oc-id">' + esc(e.source) + ' / ' + esc(e.provenance) + '</span></td></tr>';
      }).join('');
    }
    var crossEl = document.getElementById('ledger-independent-crosswalk');
    if (crossEl) {
      crossEl.innerHTML = IA.CROSSWALK.map(function (x) {
        return '<tr><td><b>' + esc(x.term) + '</b></td><td>' + esc(x.label) + '</td><td>' +
          (D.COMPOUNDS[x.target] ? '<a href="' + esc(appHref(x.target)) + '">' + esc(D.COMPOUNDS[x.target].name) + '</a>' :
            (D.materialById && D.materialById(x.target) ? '<a href="#m-' + esc(x.target) + '">' + esc(D.materialById(x.target).name) + '</a>' :
              (D.familyById && D.familyById(x.target) ? '<a href="#f-' + esc(x.target) + '">' + esc(D.familyById(x.target).name) + '</a>' : esc(x.target || '—')))) +
          '</td><td>' + esc(x.reason || '') + '</td></tr>';
      }).join('');
    }
    var indLimits = document.getElementById('ledger-independent-limits');
    if (indLimits) {
      indLimits.innerHTML = IA.META.limits.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
        '<li>画像検証: 接触シート ' + IA.IMAGE_REVIEW.contactSheets + '枚、原寸再読 ' + IA.IMAGE_REVIEW.nativeResolution +
        '件。all1399OcrCompleted=' + esc(IA.IMAGE_REVIEW.all1399OcrCompleted) + '。' + esc(IA.IMAGE_REVIEW.note) + '</li>' +
        '<li>provenance内訳: ' + Object.keys(IA.PROVENANCE).map(function (k) { return esc(k) + ' ' + esc(IA.PROVENANCE[k]); }).join(' / ') +
        '（画像実証5件は TRUE_MISSING に image-human-read として別記）。</li>';
    }
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
  var globalBox = document.getElementById('ledger-global-results');
  var didHashScroll = false;

  function familyAppHref(fid) {
    if (!C || !C.OTHER_GROUPS) return './index.html?mode=other';
    var group = C.OTHER_GROUPS.filter(function (g) { return (g.familyIds || []).indexOf(fid) !== -1; })[0];
    if (!group) return './index.html?mode=other';
    return './index.html?mode=other&category=' + encodeURIComponent(group.category) +
      '&family=' + encodeURIComponent(group.id);
  }

  function materialAppHref(mid) {
    if (!C || !C.OTHER_GROUPS) return './index.html?mode=other';
    var group = C.OTHER_GROUPS.filter(function (g) { return (g.materialIds || []).indexOf(mid) !== -1; })[0];
    if (!group) return './index.html?mode=other';
    return './index.html?mode=other&category=' + encodeURIComponent(group.category) +
      '&family=' + encodeURIComponent(group.id);
  }

  function globalSearchCount(hits) {
    var seen = {};
    return (hits || []).filter(function (h) {
      var key = h.type + ':' + h.id;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).length;
  }

  function renderGlobalSearch(raw, hits) {
    if (!globalBox) return;
    if (!raw) {
      globalBox.hidden = true;
      globalBox.innerHTML = '';
      return;
    }
    globalBox.hidden = false;
    var seen = {};
    var unique = (hits || []).filter(function (h) {
      var key = h.type + ':' + h.id;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
    if (!unique.length) {
      globalBox.innerHTML = '<p class="oc-empty-note">「' + esc(raw) + '」に一致する化合物・family・材料・状態はありません。名称の一部を変えて再検索してください。</p>';
      return;
    }
    var order = [
      { type: 'family', title: 'family（単一の固定分子式をもたない区分）' },
      { type: 'material', title: '材料・混合物・試薬' },
      { type: 'compound', title: '化合物' },
      { type: 'group', title: 'family group（分類のまとまり）' },
      { type: 'category', title: '分類' }
    ];
    var html = '<div class="oc-global-search__head"><strong>名称検索結果</strong><span class="oc-micro">' + unique.length + ' 件（化合物だけでなくfamily・材料・状態を表示）</span></div>';
    order.forEach(function (o) {
      var list = unique.filter(function (h) { return h.type === o.type; });
      if (!list.length) return;
      html += '<div class="oc-global-search__group"><h3>' + esc(o.title) + ' <span class="oc-tag">' + list.length + '</span></h3><div class="oc-global-search__list">';
      list.forEach(function (h) {
        if (h.type === 'compound') {
          var c = D.COMPOUNDS[h.id];
          if (!c) return;
          html += '<article class="oc-hit"><div class="oc-hit__head"><b>' + esc(c.name) + '</b><span>' + esc(c.formulaDisplay || R.formatFormula(c.formula)) + '</span></div>' +
            '<p>' + esc((D.categoryById(c.category) || {}).name || c.category) + ' ／ ' + esc(routeLabel(h.id)) + '</p>' +
            '<p class="oc-hit__links"><a href="' + esc(appHref(h.id)) + '">アプリで表示</a> ・ <a href="#c-' + esc(h.id) + '">台帳の行</a></p></article>';
        } else if (h.type === 'family') {
          var f = D.familyById ? D.familyById(h.id) : null;
          if (!f) return;
          html += '<article class="oc-hit"><div class="oc-hit__head"><b>' + esc(f.name) + '</b><span>' + esc(f.kind || 'family') + '</span></div>' +
            '<p>' + esc(f.summary || '') + '</p>' +
            '<p class="oc-hit__meta">' + esc(f.formula || f.formulaNote || '組成依存・固定分子式なし') + '</p>' +
            '<p class="oc-hit__links"><a href="' + esc(familyAppHref(f.id)) + '">アプリのfamilyカード</a> ・ ' +
            '<a href="#f-' + esc(f.id) + '">台帳の説明</a>' +
            ((f.members || []).length ? ' ・ 代表例: ' + esc(f.members.slice(0, 4).map(function (id) { return (D.COMPOUNDS[id] || {}).name || id; }).join('、')) : '') +
            '</p></article>';
        } else if (h.type === 'material') {
          var m = D.materialById ? D.materialById(h.id) : null;
          if (!m) return;
          html += '<article class="oc-hit"><div class="oc-hit__head"><b>' + esc(m.name) + '</b><span>' + esc(m.kind || 'material') + '</span></div>' +
            '<p>' + esc(m.note || '') + '</p><p class="oc-hit__links"><a href="' + esc(materialAppHref(m.id)) + '">アプリの材料カード</a> ・ <a href="#m-' + esc(m.id) + '">材料索引</a></p></article>';
        } else if (h.type === 'group') {
          html += '<article class="oc-hit"><div class="oc-hit__head"><b>' + esc(h.name) + '</b><span>' + esc(h.category || 'group') + '</span></div>' +
            '<p>familyのまとまりとして登録されています。化合物0件の分類ではありません。</p></article>';
        } else {
          html += '<article class="oc-hit"><div class="oc-hit__head"><b>' + esc(h.name) + '</b><span>分類</span></div>' +
            '<p>' + esc(h.note || '') + '</p></article>';
        }
      });
      html += '</div></div>';
    });
    globalBox.innerHTML = html;
  }

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
    var rawQuery = (search.value || '').trim().toLowerCase();
    var normQuery = D.normalizeName ? D.normalizeName(search.value || '') : rawQuery;
    var globalHits = rawQuery && C && C.search ? C.search(search.value) : [];
    renderGlobalSearch(search.value.trim(), globalHits);
    var globalCount = globalSearchCount(globalHits);
    var cat = catSelect.value;
    var shown = 0;
    var html = '';
    ids.forEach(function (id) {
      var c = D.COMPOUNDS[id];
      var v = validation[id];
      if (cat && c.category !== cat) return;
      var famTerms = (D.materialsFor ? D.materialsFor(id).map(function (m) { return m.name + ' ' + (m.synonyms || []).join(' '); }).join(' ') : '');
      var rawHay = (c.name + ' ' + id + ' ' + c.formula + ' ' + (c.formulaDisplay || R.formatFormula(c.formula)) + ' ' + (D.categoryById(c.category) || {}).name + ' ' + (c.subcategory || '') + ' ' + famTerms + ' ' + (D.searchTermsFor ? D.searchTermsFor(id).join(' ') : '')).toLowerCase();
      var normHay = D.normalizeName ? D.normalizeName(rawHay) : rawHay;
      if (rawQuery && rawHay.indexOf(rawQuery) === -1 && normHay.indexOf(normQuery) === -1) return;
      shown++;
      var catName = D.categoryById(c.category) ? D.categoryById(c.category).name : c.category;
      if (c.subcategory) catName += '・' + c.subcategory;
      html += '<tr id="c-' + esc(id) + '">' +
        '<td class="oc-id">' + esc(id) + '</td>' +
        '<td><b>' + esc(c.name) + '</b></td>' +
        '<td>' + esc(catName) + '</td>' +
        '<td><span class="oc-id">' + esc(c.formulaDisplay || R.formatFormula(c.formula)) + '</span></td>' +
        '<td>' + (appHref(id) ? '<a href="' + esc(appHref(id)) + '" title="' + esc(methodOf(id)) + '">' + esc(routeLabel(id)) + '</a>' : esc(routeLabel(id))) + '</td>' +
        '<td>' + esc(isomerInfo(c)) + '</td>' +
        '<td>' + (v.ok ? '<span class="oc-ok">✓ ' + esc(v.verification ? v.verification.short : '確認済み') + '</span>' : '<span class="oc-ng">✗ 要確認</span><br>' + esc(v.errors.join(' / '))) + '</td>' +
        '<td>' + esc(dataStatusLabel(c.dataStatus)) + '</td>' +
        '<td>' + sourceCell(c) + '</td>' +
        '</tr>';
    });
    rows.innerHTML = html || '<tr><td colspan="9">' +
      (globalCount ? '化合物一覧の該当は0件です。上の名称検索結果に family・材料・状態として該当があります。' : '該当する化合物がありません。') +
      '</td></tr>';
    filterCount.textContent = (rawQuery && globalCount && !shown)
      ? '化合物一覧は0件。family/材料/状態として ' + globalCount + ' 件該当'
      : shown + ' / ' + ids.length + ' 件';
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
