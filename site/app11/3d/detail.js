/*
 * app11-3d — 選択物質の詳細本文（2D 情報パリティ）
 *
 * 役割:
 *   - site/app11 の 2D カード（compoundCard / reactionCard / reactionCardGroup）が
 *     表示している情報を、3D の選択パネル本文として再構成する。
 *   - 物質の構造（共有 canonical の structureView / renderStructure）、分類・記録状態・
 *     経路状態・ビルダーリンク・件数を出す。
 *   - 反応グループは件数で打ち切らず、全グループを native <details> で並べる。
 *     反応式 SVG は各グループを最初に開いたときだけ生成する（遅延）。
 *
 * 化学データは一切生成しない。表示は site/app11 の宣言データと共有 canonical
 * レンダラの範囲にとどめる。カメラ・描画計画には触れない。
 *
 * 依存:
 *   - window.RPMapData / window.RPMapAcademic（反応・物質・species の原文）
 *   - window.GakusyuOrganicStructure.canonical（構造式・反応式の共有実装）
 *   - scene-model の model（groupsForCompound / byId / regionName）
 *
 * 入力のグループ member は scene-model が表示用に絞っているため、
 * 条件・試薬・steps・scope・evidence・出典などは反応 ID から原文を引き直す。
 * 原文が見つからない場合だけ model の member にフォールバックする。
 *
 * API:
 *   window.RP3DDetail.renderBody(container, compound, model, layer[, options])
 *     options: { normalData, academicData, structure, document }
 *     CommonJS テスト用に注入可能。ブラウザでは省略して window から読む。
 *
 * 読み込み順（ブラウザ）:
 *   site/shared/organic-structure.js → site/app11/data.js →
 *   site/app11/3d/academic-facts.js → site/app11/reaction-groups.js →
 *   scene-model.js → detail.js → app.js
 *
 * Node では require、ブラウザでは window.RP3DDetail。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP3DDetail = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var BUILDER_PREFIX = '../app10/';
  // この画面は site/app11/3d/ にある。site/app10/ へは 2 階層上からの相対パス。
  var BUILDER_SAFE_PREFIX = '../../app10/';
  var EQUATION_OPTS = { row: 200, maxWidth: 300, minScale: 0.55 };
  var EQUATION_STACK_OPTS = { row: 200, maxWidth: 300, minScale: 0.55, stack: true };
  var EQUATION_STACK_MIN_WIDTH = 600;

  /* ------------------------------------------------------------------
   * 小物
   * ------------------------------------------------------------------ */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /*
   * ビルダーの href は data.js の相対パスだけを受け付ける。
   * site/app11/3d から site/app10 への相対位置へ付け替える。
   * javascript: / data: / http(s): / プロトコル相対 / 制御文字は拒否する。
   */
  function safeBuilderHref(href) {
    if (typeof href !== 'string' || href === '') return null;
    if (href.indexOf(BUILDER_PREFIX) !== 0) return null;
    if (/[\s\u0000-\u001f\u007f\\<>"']/.test(href)) return null;
    var rest = href.slice(BUILDER_PREFIX.length);
    if (!/^index\.html(\?|$)/.test(rest)) return null;
    return BUILDER_SAFE_PREFIX + rest;
  }

  function depsFrom(options) {
    options = options || {};
    var g = typeof globalThis !== 'undefined' ? globalThis : {};
    var rawShared = options.structure || g.GakusyuOrganicStructure || null;
    var canonical = rawShared && (rawShared.canonical || rawShared);
    return {
      normalData: options.normalData || g.RPMapData || null,
      academicData: options.academicData || g.RPMapAcademic || null,
      structure: canonical,
      states: (options.normalData || g.RPMapData || {}).states || null,
      species: (options.normalData || g.RPMapData || {}).species || null,
      document: options.document || null
    };
  }

  function indexFor(deps) {
    var reactions = Object.create(null);
    var compounds = Object.create(null);
    var regions = Object.create(null);
    var types = Object.create(null);
    [deps.normalData, deps.academicData].forEach(function (data) {
      if (!data) return;
      (data.reactions || []).forEach(function (reaction) {
        if (!reaction || typeof reaction.id !== 'string' || reaction.id === '') return;
        if (!reactions[reaction.id]) reactions[reaction.id] = reaction;
      });
      Object.keys(data.types || {}).forEach(function (key) {
        if (!types[key]) types[key] = data.types[key];
      });
    });
    if (deps.normalData) {
      (deps.normalData.compounds || []).forEach(function (compound) {
        if (compound && typeof compound.id === 'string') compounds[compound.id] = compound;
      });
      (deps.normalData.regions || []).forEach(function (region) {
        if (region && region.id) regions[region.id] = region;
      });
    }
    return { reactions: reactions, compounds: compounds, regions: regions, types: types };
  }

  function compoundRef(id, index) {
    var raw = index.compounds[id];
    return {
      id: id,
      label: raw ? (raw.label || raw.name || id) : id,
      name: raw ? (raw.name || raw.label || id) : id,
      formula: raw ? (raw.formula || '') : ''
    };
  }

  function regionName(id, model, deps) {
    if (model && typeof model.regionName === 'function') {
      var fromModel = model.regionName(id);
      if (fromModel) return fromModel;
    }
    var region = (deps.normalData && (deps.normalData.regions || []).filter(function (item) {
      return item.id === id;
    })[0]) || null;
    return region ? region.name : (id || '');
  }

  function regionNote(id, index) {
    var region = index.regions[id];
    return region && region.note ? region.note : '';
  }

  function formulaText(compound, deps) {
    if (!compound) return '';
    if (compound.formulaDisplay) return compound.formulaDisplay;
    if (compound.formula && deps.structure && typeof deps.structure.formatFormula === 'function') {
      try { return deps.structure.formatFormula(compound.formula); } catch (error) { /* noop */ }
    }
    return compound.formula || '';
  }

  function stateInfo(code, deps) {
    var states = deps.states || {};
    return states[code] || null;
  }

  /* ------------------------------------------------------------------
   * 表示モデル（DOM なし・テスト可能）
   * ------------------------------------------------------------------ */

  function routeRole(group, id) {
    var asSubstrate = (group.substrateIds || []).indexOf(id) !== -1;
    var asProduct = (group.productIds || []).indexOf(id) !== -1;
    if (asSubstrate && asProduct) return 'both';
    if (asSubstrate) return 'out';
    return 'in';
  }

  function reactionEducationLabel(level) {
    if (level === 'high-school-standard') return '高校標準';
    if (level === 'high-school-extension') return '高校発展';
    return '';
  }

  function tierText(member) {
    if (member.academic) {
      return (member.educationLevel === 'high-school-standard'
        ? '高校標準（大学レベルから移行）'
        : '大学レベル（アカデミック）') +
        (member.stepKind === 'multi-step' ? '／多段階の総括' : '／一段階（direct）');
    }
    var edu = reactionEducationLabel(member.educationLevel);
    return (member.tier === 'primary' ? '主要経路（太い実線）' : '補助経路（細い点線）') +
      (edu ? '／' + edu : '');
  }

  function evidenceNote(reaction) {
    var note;
    if (reaction.evidenceKind === 'general-rule-application') {
      note = (reaction.academic ? '大学レベルの' : '高校化学の') +
        '一般則を既存の物質に適用した経路です。個別の実験で確認したものではありません。';
    } else if (reaction.evidenceKind === 'source-illustrated-transformation') {
      note = '資料が個別例として示す変換です。一般則を無条件に当てはめたものではありません。';
    } else {
      note = '独立資料の本文で確認済み。';
    }
    if (reaction.stepKind === 'multi-step') {
      note += ' 多段階の総括として示し、中間体は物質として収録していません。';
    }
    return note;
  }

  function memberHeading(member) {
    var conditions = member.conditions ? String(member.conditions) : '';
    if (conditions && conditions.length <= 24) return conditions;
    if (member.reagents && member.reagents.length) return member.reagents[0];
    if (conditions) return conditions.slice(0, 22) + '…';
    return '条件の記載なし';
  }

  function resolveMember(modelMember, index) {
    var raw = index.reactions[modelMember.id] || null;
    var source = raw || modelMember;
    return {
      id: modelMember.id,
      type: source.type || '',
      typeLabel: source.typeLabel || modelMember.typeLabel || '',
      academic: !!(source.academic || modelMember.academic),
      tier: source.tier || modelMember.tier || '',
      state: source.state || modelMember.state || '',
      educationLevel: source.educationLevel || '',
      evidenceKind: source.evidenceKind || '',
      stepKind: source.stepKind || '',
      steps: Array.isArray(source.steps) ? source.steps.slice() : [],
      scope: source.scope || '',
      basedOnHeld: source.basedOnHeld || '',
      conditions: source.conditions || '',
      reagents: Array.isArray(source.reagents) ? source.reagents.slice() : [],
      productNote: source.productNote || '',
      note: source.note || '',
      sources: Array.isArray(source.sources) ? source.sources.slice() : [],
      equation: source.equation || modelMember.equation || null
    };
  }

  function groupRegionText(group, index) {
    var names = [];
    (group.substrateIds || []).concat(group.productIds || []).forEach(function (id) {
      var raw = index.compounds[id];
      if (!raw) return;
      var region = index.regions[raw.region];
      var label = region && region.name ? region.name : (raw.region || '');
      if (label && names.indexOf(label) === -1) names.push(label);
    });
    return names.length ? names.join(' → ') : '—';
  }

  function buildGroupView(group, compoundId, index, deps) {
    var role = routeRole(group, compoundId);
    var members = (group.members || []).map(function (member) {
      return resolveMember(member, index);
    });
    var commonType = null;
    if (members.length) {
      var sameType = members.every(function (member) { return member.type && member.type === members[0].type; });
      if (sameType && index.types) commonType = index.types[members[0].type] || null;
      if (sameType && !commonType) {
        commonType = { label: members[0].typeLabel, summary: '', schematic: '' };
      }
    }
    return {
      id: group.id,
      typeLabel: group.typeLabel || '反応',
      role: role,
      size: group.size || members.length,
      memberIds: (group.memberIds || []).slice(),
      substrateIds: (group.substrateIds || []).slice(),
      productIds: (group.productIds || []).slice(),
      substrates: (group.substrateIds || []).map(function (id) { return compoundRef(id, index); }),
      products: (group.productIds || []).map(function (id) { return compoundRef(id, index); }),
      academicOnly: !!group.academicOnly,
      hasAcademic: !!group.hasAcademic,
      hasNormal: !!group.hasNormal,
      commonType: commonType,
      regionText: groupRegionText(group, index),
      productNote: members.map(function (member) { return member.productNote; }).filter(Boolean)[0] || '',
      members: members
    };
  }

  function compoundEquationItem(id, coef, index, deps) {
    var compound = index.compounds[id];
    if (!compound) return { coef: coef, name: id, structure: null, fallback: true };
    var spec = compound.structure || null;
    var fallback = !spec;
    if (deps.structure && typeof deps.structure.structureView === 'function') {
      try {
        var view = deps.structure.structureView(compound);
        var fig = view && view.figures && view.figures[0];
        if (fig && fig.structure) spec = fig.structure;
        if (view && (view.kind === 'fallback' || view.kind === 'missing')) fallback = true;
      } catch (error) {
        // 共有レンダラが構造を読めない場合は登録 spec のまま描き、fallback を付ける。
      }
    }
    return { coef: coef, name: compound.label || compound.name || id, structure: spec, fallback: fallback };
  }

  function equationItemOf(item, index, deps) {
    if (!item || typeof item !== 'object') {
      return { coef: 1, name: String(item == null ? '' : item), structure: null, fallback: true };
    }
    if (item.kind === 'species') {
      var species = deps.species && deps.species[item.id];
      if (!species) return { coef: item.coef, name: item.label || item.id, structure: null, fallback: true };
      return {
        coef: item.coef,
        name: species.name || item.label || item.id,
        structure: species.structure || null,
        fallback: !species.structure
      };
    }
    if (item.kind === 'text') {
      return { coef: item.coef, name: item.text, structure: null, fallback: true };
    }
    return compoundEquationItem(item.id, item.coef, index, deps);
  }

  function equationItems(list, index, deps) {
    return (list || []).map(function (item) { return equationItemOf(item, index, deps); });
  }

  function derivedReactionEquation(group, index, deps, productNote) {
    var left = (group.substrateIds || []).map(function (id) {
      return compoundEquationItem(id, 1, index, deps);
    });
    var right = (group.productIds || []).length
      ? (group.productIds || []).map(function (id) {
        return compoundEquationItem(id, 1, index, deps);
      })
      : [{ coef: 1, name: productNote || '生成物の記載なし', structure: null, fallback: true }];
    return { arrow: 'to', above: '', below: '', left: left, right: right };
  }

  function itemsHaveFallback(items) {
    return (items || []).some(function (item) { return item.fallback; });
  }

  function equationPlan(member, group, index, deps) {
    var eq = member.equation;
    if (!eq) {
      return {
        caption: '主な物質の変換（係数・副生成物省略）',
        note: '係数・副生成物を省略し、反応物と主生成物の構造だけを示します。完全な反応式ではありません。',
        sources: [],
        equations: [{ label: '', eq: derivedReactionEquation(group, index, deps, member.productNote || group.productNote) }]
      };
    }
    var caption = eq.title || (eq.mode === 'N' ? '正味の反応式（総括）'
      : eq.mode === 'B' ? '反応式（構造式）'
        : eq.mode === 'P' ? '重合反応の模式式' : '構造変換図');
    var modeNotes = {
      B: '係数・副生成物まで含む反応式です。元素収支は本ツールで計算しています。',
      N: '元素収支は合うが、塩の生成・中和・後処理などを省略した総括式です。',
      T: '反応物と生成物の構造だけを示す変換図です。試薬由来の生成物・プロトン源・保護基の脱着などは省略しており、完全な反応式ではありません。',
      P: '繰り返し単位 n で示す重合の模式式です。末端を省略しており、有限の鎖の完全な反応式ではありません。'
    };
    var note = [eq.explanation, modeNotes[eq.mode]].filter(Boolean).join(' ');
    var equations;
    if (eq.variants && eq.variants.length) {
      equations = eq.variants.map(function (variant) {
        return {
          label: variant.label || '',
          eq: {
            arrow: variant.arrow,
            above: eq.above,
            below: eq.below,
            left: equationItems(variant.left, index, deps),
            right: equationItems(variant.right, index, deps)
          }
        };
      });
    } else {
      equations = [{
        label: '',
        eq: {
          arrow: eq.arrow,
          above: eq.above,
          below: eq.below,
          left: equationItems(eq.left, index, deps),
          right: equationItems(eq.right, index, deps)
        }
      }];
    }
    return {
      caption: caption,
      note: note,
      sources: (eq.sources && eq.sources.length) ? eq.sources.slice() : member.sources.slice(),
      equations: equations
    };
  }

  function pathStateInfo(pathState, deps) {
    if (pathState === 'covered') {
      return { label: '収録内', note: '収録した反応から製法・生成先を表示しています。' };
    }
    if (pathState === 'confirmed') {
      return { label: '確認済', note: '確認済みの経路を表示しています。' };
    }
    var info = stateInfo(pathState, deps);
    if (info) return { label: info.label, note: info.note || '' };
    if (pathState === 'out-of-scope' || pathState === 'outOfScope') {
      return { label: '収録外', note: 'この分野の反応経路は、この地図の収録対象にしていません。' };
    }
    if (pathState === 'impossible') {
      return { label: '該当しない', note: '明確な根拠により成立しないと確認できた経路です。' };
    }
    return { label: pathState || '未確認', note: '' };
  }

  function emptyReasonFor(pathState, direction) {
    if (pathState === 'out-of-scope' || pathState === 'outOfScope') {
      return '収録外: この分野の反応経路は、この地図の収録対象にしていません。';
    }
    if (pathState === 'impossible') {
      return '該当しない: 明確な根拠により成立しないと確認できた経路です（理由は個別情報を参照）。';
    }
    if (pathState === 'confirmed') {
      return direction === 'in'
        ? '確認済みの範囲では、この物質を生成する反応は見つかっていません。'
        : '確認済みの範囲では、この物質から進む反応は見つかっていません。';
    }
    return direction === 'in'
      ? '未確認: この地図に収録した確認済みの反応の中には、この物質を生成する経路が見つかっていません（「生成しない」という意味ではありません）。'
      : '未確認: この地図に収録した確認済みの反応の中には、この物質から進む経路が見つかっていません（「生成しない」という意味ではありません）。';
  }

  function buildStructureView(compound, deps) {
    if (!deps.structure || typeof deps.structure.structureView !== 'function') {
      return {
        kind: 'unavailable',
        caption: '構造データを読み込めない',
        note: '共有の構造レンダラを読み込めないため、構造図を表示していません。',
        figures: []
      };
    }
    try {
      var view = deps.structure.structureView(compound);
      if (!view) {
        return { kind: 'missing', caption: '構造データ未整備', note: '構造データを確認できませんでした。', figures: [] };
      }
      return view;
    } catch (error) {
      return {
        kind: 'missing',
        caption: '構造データ未整備',
        note: '構造データを確認できませんでした。式だけを構造式として表示することはありません。',
        figures: []
      };
    }
  }

  function buildView(compound, model, layer, deps) {
    if (!compound || !model) return null;
    var index = indexFor(deps);
    var raw = index.compounds[compound.id] || compound;
    var groups = typeof model.groupsForCompound === 'function'
      ? model.groupsForCompound(compound.id, layer)
      : [];
    var groupViews = groups.map(function (group) {
      return buildGroupView(group, compound.id, index, deps);
    });
    var counts = { in: 0, out: 0, groups: groupViews.length };
    groupViews.forEach(function (group) {
      if (group.role === 'in' || group.role === 'both') counts.in += group.size;
      if (group.role === 'out' || group.role === 'both') counts.out += group.size;
    });
    var region = raw.region || compound.region || '';
    return {
      compound: {
        id: compound.id,
        name: raw.name || compound.name || compound.id,
        label: raw.label || compound.label || raw.name || compound.id,
        formula: formulaText(raw, deps),
        rawFormula: raw.formula || compound.formula || '',
        region: region,
        regionName: regionName(region, model, deps),
        regionNote: regionNote(region, index),
        category: raw.category || compound.category || '',
        recordState: raw.recordState || compound.recordState || '',
        curriculum: !!raw.curriculum,
        pathState: raw.pathState || compound.pathState || '',
        hub: !!raw.hub,
        builderHref: safeBuilderHref(raw.builder && raw.builder.href),
        builderRecorded: !!(raw.builder && raw.builder.href)
      },
      layer: layer === 'academic' ? 'academic' : 'normal',
      layerLabel: layer === 'academic' ? '通常＋大学レベル' : '通常',
      structure: buildStructureView(raw, deps),
      counts: counts,
      pathState: pathStateInfo(raw.pathState || compound.pathState || '', deps),
      groups: groupViews
    };
  }

  /* ------------------------------------------------------------------
   * DOM 補助
   * ------------------------------------------------------------------ */

  function el(doc, tag, className) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function textNode(doc, tag, className, text) {
    var node = el(doc, tag, className);
    node.textContent = String(text == null ? '' : text);
    return node;
  }

  function heading(doc, level, text) {
    var node = textNode(doc, 'h' + level, 'rp3d-detail__heading', text);
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function appendDefinition(doc, list, term, value) {
    var row = el(doc, 'div', 'rp3d-facts__row');
    row.appendChild(textNode(doc, 'dt', 'rp3d-facts__term', term));
    var dd = el(doc, 'dd', 'rp3d-facts__value');
    if (value && typeof value === 'object' && value.nodeType) dd.appendChild(value);
    else dd.textContent = String(value == null ? '' : value);
    row.appendChild(dd);
    list.appendChild(row);
    return row;
  }

  function badge(doc, text, className) {
    return textNode(doc, 'span', 'rp3d-badge' + (className ? ' ' + className : ''), text);
  }

  /* ------------------------------------------------------------------
   * 構造の描画
   * ------------------------------------------------------------------ */

  function svgViewBoxWidth(svg) {
    var match = /viewBox="([^"]+)"/.exec(String(svg || ''));
    if (!match) return 0;
    var parts = match[1].trim().split(/\s+/);
    var width = parseFloat(parts[2]);
    return isFinite(width) ? width : 0;
  }

  function appendStructureFigure(parent, doc, spec, aria, caption, note, deps) {
    var figure = el(doc, 'figure', 'rp3d-struct');
    if (caption) figure.appendChild(textNode(doc, 'figcaption', 'rp3d-struct__caption', caption));
    var canvas = el(doc, 'div', 'rp3d-struct__canvas');
    var svg = '';
    try {
      if (deps.structure && typeof deps.structure.renderStructure === 'function') {
        svg = deps.structure.renderStructure(spec, aria);
      }
    } catch (error) {
      svg = '';
    }
    if (typeof svg === 'string' && svg !== '') {
      if (svgViewBoxWidth(svg) > 460) figure.className += ' rp3d-struct--wide';
      // canonical が生成した SVG（ラベルは内部でエスケープ済み）だけを挿入する。
      canvas.innerHTML = svg;
      figure.appendChild(canvas);
    } else {
      figure.appendChild(textNode(doc, 'p', 'rp3d-struct__note', '構造図を表示できませんでした。'));
    }
    if (note) figure.appendChild(textNode(doc, 'p', 'rp3d-struct__note', note));
    parent.appendChild(figure);
  }

  function appendStructureSection(parent, doc, view, deps) {
    var section = el(doc, 'section', 'rp3d-detail__section rp3d-detail__section--structure');
    section.appendChild(heading(doc, 3, '構造'));
    if (!view || !view.figures || !view.figures.length) {
      var caption = view && view.caption ? view.caption + ': ' : '';
      var note = view && view.note ? view.note : '構造データが未整備です。';
      section.appendChild(textNode(doc, 'p', 'rp3d-struct-missing', caption + note));
      parent.appendChild(section);
      return;
    }
    if (view.kind === 'projection' && view.figures.length > 1) {
      var group = el(doc, 'div', 'rp3d-struct-group');
      group.appendChild(textNode(doc, 'p', 'rp3d-struct__heading', view.caption || '投影式'));
      view.figures.forEach(function (fig) {
        var label = fig.label || view.caption || '投影式';
        appendStructureFigure(group, doc, fig.structure, label, label, fig.note || '', deps);
      });
      section.appendChild(group);
    } else {
      view.figures.forEach(function (fig) {
        var label = fig.label || view.caption || '構造図';
        appendStructureFigure(section, doc, fig.structure, label, label, fig.note || view.note || '', deps);
      });
    }
    parent.appendChild(section);
  }

  /* ------------------------------------------------------------------
   * 物質の基礎情報
   * ------------------------------------------------------------------ */

  function appendFactsSection(parent, doc, view, deps) {
    var section = el(doc, 'section', 'rp3d-detail__section rp3d-detail__section--facts');
    section.appendChild(heading(doc, 3, '物質の情報'));
    if (view.compound.formula) {
      section.appendChild(textNode(doc, 'p', 'rp3d-detail__formula', '分子式: ' + view.compound.formula));
    }

    var record = view.compound.recordState;
    var recordInfo = stateInfo(record, deps);
    var recordRow = el(doc, 'p', 'rp3d-detail__line');
    recordRow.appendChild(badge(doc, recordInfo ? recordInfo.label : (record || '状態不明'), 'rp3d-badge--state'));
    if (recordInfo && recordInfo.note) {
      recordRow.appendChild(textNode(doc, 'span', 'rp3d-detail__note', ' ' + recordInfo.note));
    } else if (record === 'confirmed') {
      recordRow.appendChild(textNode(doc, 'span', 'rp3d-detail__note', ' 独立資料での確認が済んでいます。'));
    }
    section.appendChild(recordRow);

    var list = el(doc, 'dl', 'rp3d-facts');
    appendDefinition(doc, list, '表示層', view.layerLabel);
    appendDefinition(doc, list, '分野', view.compound.regionName + (view.compound.curriculum ? ' ／ 高校化学の必須物質リストに収録' : ''));
    if (view.compound.regionNote) appendDefinition(doc, list, '分野の注記', view.compound.regionNote);
    appendDefinition(doc, list, '反応経路の状態', view.pathState.label + (view.pathState.note ? '。' + view.pathState.note : ''));
    appendDefinition(doc, list, '製法（入ってくる反応）', view.counts.in + ' 件');
    appendDefinition(doc, list, '生成先（出ていく反応）', view.counts.out + ' 件');
    appendDefinition(doc, list, '表示中の経路グループ', view.counts.groups + ' グループ');
    section.appendChild(list);

    if (!view.counts.in) {
      section.appendChild(textNode(doc, 'p', 'rp3d-detail__note', emptyReasonFor(view.compound.pathState, 'in')));
    }
    if (!view.counts.out) {
      section.appendChild(textNode(doc, 'p', 'rp3d-detail__note', emptyReasonFor(view.compound.pathState, 'out')));
    }
    parent.appendChild(section);
  }

  function appendBuilderSection(parent, doc, view) {
    var section = el(doc, 'section', 'rp3d-detail__section rp3d-detail__section--builder');
    section.appendChild(heading(doc, 3, 'ビルダーで開く'));
    if (view.compound.builderHref) {
      var link = el(doc, 'a', 'rp3d-build-link');
      link.setAttribute('href', view.compound.builderHref);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
      link.textContent = '有機化学ビルダーで開く（focus=' + view.compound.id + '）';
      section.appendChild(link);
      section.appendChild(textNode(doc, 'p', 'rp3d-detail__note', '同じ物質を、ビルダーの focus 指定で開きます。'));
    } else {
      var reason = view.compound.builderRecorded
        ? 'ビルダーのリンク形式を安全のため表示していません。'
        : 'ビルダー収録外: この物質はビルダーの収録IDと対応していないため、リンクを表示しません。';
      section.appendChild(textNode(doc, 'p', 'rp3d-empty', reason));
    }
    parent.appendChild(section);
  }

  /* ------------------------------------------------------------------
   * 反応グループ（全件・native details・遅延 SVG）
   * ------------------------------------------------------------------ */

  function renderEquationSvg(equation, aria, deps) {
    var svg = deps.structure.renderEquation(equation, aria, EQUATION_OPTS);
    if (svgViewBoxWidth(svg) > EQUATION_STACK_MIN_WIDTH) {
      svg = deps.structure.renderEquation(equation, aria, EQUATION_STACK_OPTS);
    }
    return svg;
  }

  function appendEquationFigures(parent, doc, member, group, index, deps) {
    if (!deps.structure || typeof deps.structure.renderEquation !== 'function') {
      parent.appendChild(textNode(doc, 'p', 'rp3d-struct-missing', '構造データを読み込めないため、反応式を表示していません。'));
      return;
    }
    var plan = equationPlan(member, group, index, deps);
    var anyFallback = plan.equations.some(function (entry) {
      return itemsHaveFallback(entry.eq.left) || itemsHaveFallback(entry.eq.right);
    });
    var note = plan.note || '';
    if (anyFallback) note += ' 示性式・名称で表示している項目があります（構造式ではありません）。';
    if (plan.sources && plan.sources.length) note += ' 式の根拠: ' + plan.sources.join('／');

    plan.equations.forEach(function (entry) {
      var caption = entry.label ? plan.caption + '（' + entry.label + '）' : plan.caption;
      var figure = el(doc, 'figure', 'rp3d-eq');
      if (caption) figure.appendChild(textNode(doc, 'figcaption', 'rp3d-eq__caption', caption));
      var scroll = el(doc, 'div', 'rp3d-eq__scroll');
      var svg = '';
      try {
        svg = renderEquationSvg(entry.eq, caption, deps);
      } catch (error) {
        svg = '';
      }
      if (typeof svg === 'string' && svg !== '') {
        // canonical が生成した SVG（ラベルは内部でエスケープ済み）だけを挿入する。
        scroll.innerHTML = svg;
        figure.appendChild(scroll);
      } else {
        figure.appendChild(textNode(doc, 'p', 'rp3d-struct__note',
          '反応式を表示できませんでした。根拠のない式を推定して表示することはありません。'));
      }
      if (note) figure.appendChild(textNode(doc, 'p', 'rp3d-eq__note', note));
      parent.appendChild(figure);
    });
  }

  function appendMember(parent, doc, member, group, index, deps) {
    var section = el(doc, 'section', 'rp3d-member');
    section.setAttribute('data-reaction-id', member.id);
    section.appendChild(textNode(doc, 'h4', 'rp3d-member__heading', memberHeading(member)));
    section.appendChild(textNode(doc, 'p', 'rp3d-member__tier', tierText(member)));

    var status = el(doc, 'p', 'rp3d-member__status');
    if (member.academic) {
      status.appendChild(badge(doc, 'アカデミック', 'rp3d-badge--academic'));
      status.appendChild(textNode(doc, 'span', 'rp3d-detail__note', ' ' + evidenceNote(member)));
    } else {
      var info = stateInfo(member.state, deps);
      status.appendChild(badge(doc, info ? info.label : (member.state || '状態不明'), 'rp3d-badge--state'));
      status.appendChild(textNode(doc, 'span', 'rp3d-detail__note', ' ' + evidenceNote(member)));
    }
    section.appendChild(status);

    if (member.scope) {
      section.appendChild(textNode(doc, 'p', 'rp3d-member__note', '適用範囲: ' + member.scope));
    }
    if (member.stepKind === 'multi-step' && member.steps.length) {
      section.appendChild(textNode(doc, 'p', 'rp3d-member__label', '段階（総括）'));
      var ol = el(doc, 'ol', 'rp3d-member__steps');
      member.steps.forEach(function (step) {
        ol.appendChild(textNode(doc, 'li', '', step));
      });
      section.appendChild(ol);
      section.appendChild(textNode(doc, 'p', 'rp3d-detail__note',
        '地図の線は総括した経路で、中間体は物質として収録していません。'));
    }
    if (member.academic && member.basedOnHeld) {
      section.appendChild(textNode(doc, 'p', 'rp3d-detail__note',
        '保留反応 ' + member.basedOnHeld + ' と同じ組合せを含むが、新しい出典で確認した内容として別に記録している。'));
    }

    appendEquationFigures(section, doc, member, group, index, deps);

    var list = el(doc, 'dl', 'rp3d-facts');
    appendDefinition(doc, list, '試薬', member.reagents.length ? member.reagents.join('・') : '個別の記載なし');
    if (member.productNote) appendDefinition(doc, list, '生成物の注記', member.productNote);
    appendDefinition(doc, list, '条件', member.conditions ? member.conditions : '個別の記載なし');
    appendDefinition(doc, list, '例外・注意', member.note ? member.note : '個別の記載なし');
    appendDefinition(doc, list, '分野', group.regionText);
    section.appendChild(list);

    section.appendChild(textNode(doc, 'p', 'rp3d-member__sources',
      '検証記録: ' + (member.sources.length ? member.sources.join('／') : '記録なし') + '。'));
    parent.appendChild(section);
  }

  function fillGroupBody(body, group, index, deps) {
    if (body.getAttribute && body.getAttribute('data-filled') === '1') return;
    if (body.setAttribute) body.setAttribute('data-filled', '1');
    var doc = body.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    clearNode(body);
    if (group.commonType) {
      var common = el(doc, 'div', 'rp3d-common');
      common.appendChild(heading(doc, 4, '共通の説明 — ' + (group.commonType.label || group.typeLabel)));
      if (group.commonType.summary) {
        common.appendChild(textNode(doc, 'p', 'rp3d-common__summary', group.commonType.summary));
      }
      if (group.commonType.schematic) {
        common.appendChild(textNode(doc, 'p', 'rp3d-common__schematic', group.commonType.schematic));
        common.appendChild(textNode(doc, 'p', 'rp3d-detail__note',
          '模式図（原子団・結合の変化）。電子の動きを示す機構図は収録していません。'));
      }
      body.appendChild(common);
    }
    group.members.forEach(function (member) {
      appendMember(body, doc, member, group, index, deps);
    });
    body.appendChild(textNode(doc, 'p', 'rp3d-detail__note',
      '実験の実施手順・試薬量・濃度・装置の使い方は収録していません。'));
  }

  function directionArrow(role) {
    if (role === 'out') return '→';
    if (role === 'in') return '←';
    return '⇄';
  }

  // 折りたたみ summary に出す経路の全端点。役割に関係なくデータの向き
  // （基質 → 生成物）で並べ、選択物質も端点として必ず含める。
  // 生成物 ID が無いグループは productNote を生成物側の文言に使う。
  function groupEndpointText(group) {
    var substrates = group.substrates.map(function (item) { return item.label; }).join(' ＋ ');
    var products = group.products.map(function (item) { return item.label; }).join(' ＋ ');
    if (!products) products = group.productNote || '生成物の記載なし';
    return '基質: ' + (substrates || '記載なし') + ' → 生成物: ' + products;
  }

  function renderGroup(group, index, deps) {
    var doc = deps.document;
    var details = el(doc, 'details', 'rp3d-group');
    if (group.academicOnly) {
      details.setAttribute('data-academic', 'true');
    } else if (group.hasAcademic && group.hasNormal) {
      // 通常＋大学の共通グループは、通常のアンバー地にシアンの内側アクセント。
      details.setAttribute('data-mixed', 'true');
    }
    var summary = el(doc, 'summary', 'rp3d-group__summary');

    summary.appendChild(textNode(doc, 'span', 'rp3d-group__dir', directionArrow(group.role)));
    summary.appendChild(textNode(doc, 'span', 'rp3d-group__type', group.typeLabel));
    if (group.size > 1) {
      summary.appendChild(textNode(doc, 'span', 'rp3d-group__size', '条件別 ' + group.size + ' 件'));
    }
    if (group.academicOnly) {
      summary.appendChild(badge(doc, '大学レベル追加', 'rp3d-badge--academic'));
    } else if (group.hasAcademic) {
      summary.appendChild(badge(doc, '共通グループ', 'rp3d-badge--mixed'));
    }
    // 全端点を summary 内に置く。details を閉じても名前が読めるようにする。
    var endpointLine = el(doc, 'span', 'rp3d-group__endpoints');
    endpointLine.textContent = groupEndpointText(group);
    summary.appendChild(endpointLine);
    details.appendChild(summary);

    var body = el(doc, 'div', 'rp3d-group__body');
    details.appendChild(body);

    var filled = false;
    details.addEventListener('toggle', function () {
      if (!details.open || filled) return;
      filled = true;
      fillGroupBody(body, group, index, deps);
    });
    return details;
  }

  function appendGroupsSection(parent, doc, view, index, deps) {
    var section = el(doc, 'section', 'rp3d-detail__section rp3d-detail__section--routes');
    section.appendChild(heading(doc, 3, 'この物質の経路（' + view.groups.length + ' グループ）'));
    if (!view.groups.length) {
      var message = view.layer === 'academic'
        ? 'この物質に接続する確認済みの反応はありません。'
        : '通常層では確認済みの反応がありません。大学レベル層に切り替えると追加経路が出る場合があります。';
      section.appendChild(textNode(doc, 'p', 'rp3d-route__empty', message));
      parent.appendChild(section);
      return;
    }
    section.appendChild(textNode(doc, 'p', 'rp3d-detail__note',
      '各グループを開くと、条件・試薬・反応式・出典を表示します。式は最初に開いたときだけ生成します。'));
    view.groups.forEach(function (group) {
      section.appendChild(renderGroup(group, index, deps));
    });
    section.appendChild(textNode(doc, 'p', 'rp3d-detail__note',
      '反応の条件・出典は各グループの代表と member に基づきます。向きは基質 → 生成物で固定し、逆向きは別グループです。'));
    parent.appendChild(section);
  }

  /* ------------------------------------------------------------------
   * 公開: renderBody
   * ------------------------------------------------------------------ */

  function renderBody(container, compound, model, layer, options) {
    if (!container || typeof container.appendChild !== 'function') return null;
    var deps = depsFrom(options);
    var doc = deps.document || container.ownerDocument ||
      (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    deps.document = doc;
    var view = buildView(compound, model, layer, deps);
    if (!view) return null;
    var index = indexFor(deps);

    clearNode(container);
    var root = el(doc, 'div', 'rp3d-detail');
    root.setAttribute('data-layer', view.layer);
    root.setAttribute('data-compound', view.compound.id);

    appendStructureSection(root, doc, view.structure, deps);
    appendFactsSection(root, doc, view, deps);
    appendBuilderSection(root, doc, view);
    appendGroupsSection(root, doc, view, index, deps);

    container.appendChild(root);
    return view;
  }

  return {
    version: VERSION,
    renderBody: renderBody,
    buildView: buildView,
    // テスト・統合時の確認用
    safeBuilderHref: safeBuilderHref,
    escapeHtml: escapeHtml,
    equationPlan: equationPlan,
    svgViewBoxWidth: svgViewBoxWidth,
    __test: {
      depsFrom: depsFrom,
      indexFor: indexFor,
      resolveMember: resolveMember,
      pathStateInfo: pathStateInfo,
      emptyReasonFor: emptyReasonFor,
      memberHeading: memberHeading,
      tierText: tierText,
      evidenceNote: evidenceNote
    }
  };
});
