/*
 * 有機反応マップ（app11）— 構造式SVG描画（凍結コピー）
 *
 * コピー元: site/app10/draw.js
 * コピー元 commit: 9ef5e0999a73022ed0351303ad2d4944b80df16f
 * コピー元 SHA256: 861e0fd9fed7593ed07e2adf0a9812168d9dda1130428b91fdd052ab3eeaf11d
 * 変更点: namespace OCDraw -> RPStructure、CSS class oc- -> rp-struct-。
 * 追加: app11用 structureView / skeletalSpecFromGraph / skeletalSpecFromCompound
 *       （表示実態と見出しの一致、単純直鎖の骨格式生成）。
 * 外部の化学描画ライブラリには依存しない。外部由来のライセンス表記は元ファイルに含まれない
 * （元ファイルの著作権・方針コメントはそのまま保持する）。
 *
 * 有機化学ビルダー — 構造式SVG描画・構造検証
 *
 * 方針:
 * - 外部の化学描画ライブラリに依存せず、登録済みの構造データだけをSVGで描画する。
 * - 小さな分子は水素を明示した完全構造式、大きな分子は簡略構造式。
 * - ベンゼン環はケクレ式（交互の二重結合）を標準とする。
 * - グルコースはフィッシャー投影式とα/βハース投影式を専用描画する。
 * - 原子数・結合価・分子式を検証し、一致しない構造は表示対象にしない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPStructure = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 原子価は複数の値を許容する（S は 2/4/6、P は 3/5）。ハロゲンも同じ表で扱う。
  var VALENCES = {
    C: [4], N: [3], O: [2], F: [1], Cl: [1], Br: [1], I: [1],
    Na: [1], S: [2, 4, 6], P: [3, 5], Si: [4], B: [3]
  };
  var SUB_DIGIT = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------
   * 基本ヘルパー
   * ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function atom(el, x, y, h, extra) {
    var a = { el: el, x: x, y: y, h: h || 0 };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return a;
  }

  function bond(a, b, order) {
    return { a: a, b: b, order: order || 1 };
  }

  function degToRad(d) { return d * Math.PI / 180; }

  function norm(a) {
    while (a < 0) a += TAU;
    while (a >= TAU) a -= TAU;
    return a;
  }

  function angDist(a, b) {
    var d = Math.abs(norm(a) - norm(b));
    return Math.min(d, TAU - d);
  }

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function chainCoords(n, cx, cy, dx, amp) {
    cx = cx == null ? 180 : cx;
    cy = cy == null ? 120 : cy;
    dx = dx == null ? 70 : dx;
    amp = amp == null ? 22 : amp;
    if (n === 1) return [{ x: cx, y: cy }];
    if (n === 2) return [{ x: cx - dx / 2, y: cy }, { x: cx + dx / 2, y: cy }];
    var start = cx - (n - 1) * dx / 2;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: start + i * dx, y: cy + (i % 2 ? -amp : amp) });
    return out;
  }

  function chainBonds(n) {
    var out = [];
    for (var i = 0; i < n - 1; i++) out.push(bond(i, i + 1, 1));
    return out;
  }

  function ringCoords(n, cx, cy, r, startAngle) {
    cx = cx == null ? 180 : cx;
    cy = cy == null ? 130 : cy;
    r = r == null ? 62 : r;
    startAngle = startAngle == null ? -Math.PI / 2 : startAngle;
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = startAngle + i * TAU / n;
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return out;
  }

  function ringBonds(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(bond(i, (i + 1) % n, 1));
    return out;
  }

  function chainGraph(n, opts) {
    opts = opts || {};
    var pts = chainCoords(n, opts.cx, opts.cy, opts.dx, opts.amp);
    var hs = opts.h || [];
    var atoms = pts.map(function (p, i) {
      return atom('C', p.x, p.y, hs[i] == null ? 2 : hs[i]);
    });
    return {
      atoms: atoms,
      bonds: chainBonds(n),
      mode: opts.mode || 'condensed',
      width: opts.width || 400,
      height: opts.height || 260
    };
  }

  /* ------------------------------------------------------------------
   * 炭素骨格テンプレート
   * ------------------------------------------------------------------ */

  function benzeneGraph() {
    var pts = ringCoords(6, 200, 130, 62, 0);
    var center = { x: 200, y: 130 };
    var atoms = pts.map(function (p) { return atom('C', p.x, p.y, 1, { ring: true }); });
    var orders = [2, 1, 2, 1, 2, 1];
    var bonds = [];
    for (var i = 0; i < 6; i++) {
      var b = bond(i, (i + 1) % 6, orders[i]);
      b.ring = true;
      b.ringCenter = center;
      bonds.push(b);
    }
    return { atoms: atoms, bonds: bonds, mode: 'expanded', width: 400, height: 270, aromatic: true };
  }

  function naphthaleneGraph() {
    var xy = [
      [180, 95], [130, 67], [80, 95], [80, 165], [130, 193], [180, 165],
      [230, 193], [280, 165], [280, 95], [230, 67]
    ];
    var hs = [0, 1, 1, 1, 1, 0, 1, 1, 1, 1];
    var atoms = xy.map(function (p, i) { return atom('C', p[0], p[1], hs[i], { ring: true }); });
    var left = { x: 130, y: 127 };
    var right = { x: 230, y: 127 };
    function rb(a, b, order, center) {
      var x = bond(a, b, order);
      x.ring = true;
      x.ringCenter = center;
      return x;
    }
    var bonds = [
      rb(0, 1, 2, left), rb(1, 2, 1, left), rb(2, 3, 2, left), rb(3, 4, 1, left), rb(4, 5, 2, left),
      rb(5, 0, 1, left), rb(0, 9, 1, right), rb(9, 8, 2, right), rb(8, 7, 1, right), rb(7, 6, 2, right),
      rb(6, 5, 1, right)
    ];
    return { atoms: atoms, bonds: bonds, mode: 'expanded', width: 400, height: 300, aromatic: true };
  }

  var SKELETONS = (function () {
    var s = {};

    s.methane = {
      atoms: [atom('C', 180, 115, 4)], bonds: [], mode: 'expanded', width: 360, height: 230
    };
    s.ethane = {
      atoms: [atom('C', 130, 115, 3), atom('C', 230, 115, 3)],
      bonds: [bond(0, 1, 1)], mode: 'expanded', width: 360, height: 230
    };
    s.propane = chainGraph(3, { h: [3, 2, 3], mode: 'expanded', width: 380, height: 250 });
    s.butane = chainGraph(4, { h: [3, 2, 2, 3], mode: 'condensed', width: 400, height: 250 });
    s.isobutane = {
      atoms: [
        atom('C', 180, 115, 1), atom('C', 110, 68, 3),
        atom('C', 250, 68, 3), atom('C', 180, 185, 3)
      ],
      bonds: [bond(0, 1, 1), bond(0, 2, 1), bond(0, 3, 1)],
      mode: 'condensed', width: 360, height: 260
    };
    s.pentane = chainGraph(5, { h: [3, 2, 2, 2, 3], mode: 'condensed', width: 420, height: 250 });
    s.isopentane = (function () {
      var g = chainGraph(4, { h: [3, 1, 2, 3], mode: 'condensed', width: 400, height: 270 });
      g.atoms.push(atom('C', 145, 32, 3));
      g.bonds.push(bond(1, 4, 1));
      return g;
    })();
    s.neopentane = {
      atoms: [
        atom('C', 180, 125, 0), atom('C', 110, 75, 3), atom('C', 250, 75, 3),
        atom('C', 110, 175, 3), atom('C', 250, 175, 3)
      ],
      bonds: [bond(0, 1, 1), bond(0, 2, 1), bond(0, 3, 1), bond(0, 4, 1)],
      mode: 'condensed', width: 360, height: 280
    };
    s.hexane = chainGraph(6, { h: [3, 2, 2, 2, 2, 3], mode: 'condensed', width: 460, height: 250 });
    s['2-methylpentane'] = {
      atoms: [
        atom('C', 40, 142, 3), atom('C', 110, 98, 1), atom('C', 180, 142, 2),
        atom('C', 250, 98, 2), atom('C', 320, 142, 3), atom('C', 110, 30, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(3, 4, 1), bond(1, 5, 1)],
      mode: 'condensed', width: 420, height: 260
    };
    s['3-methylpentane'] = {
      atoms: [
        atom('C', 40, 142, 3), atom('C', 110, 98, 2), atom('C', 180, 142, 1),
        atom('C', 250, 98, 2), atom('C', 320, 142, 3), atom('C', 180, 214, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(3, 4, 1), bond(2, 5, 1)],
      mode: 'condensed', width: 420, height: 280
    };
    s['2,2-dimethylbutane'] = {
      atoms: [
        atom('C', 60, 120, 3), atom('C', 140, 120, 0), atom('C', 220, 120, 2),
        atom('C', 300, 120, 3), atom('C', 140, 42, 3), atom('C', 140, 198, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(1, 4, 1), bond(1, 5, 1)],
      mode: 'condensed', width: 400, height: 280
    };
    s['2,3-dimethylbutane'] = {
      atoms: [
        atom('C', 50, 120, 3), atom('C', 120, 80, 1), atom('C', 200, 80, 1),
        atom('C', 270, 120, 3), atom('C', 120, 168, 3), atom('C', 200, 168, 3)
      ],
      bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 1), bond(1, 4, 1), bond(2, 5, 1)],
      mode: 'condensed', width: 400, height: 280
    };

    s.ethene = {
      atoms: [atom('C', 140, 115, 2), atom('C', 220, 115, 2)],
      bonds: [bond(0, 1, 2)], mode: 'expanded', width: 360, height: 230
    };
    s.propene = chainGraph(3, { h: [2, 1, 3], mode: 'expanded', width: 380, height: 250 });
    s.propene.bonds[0].order = 2;
    s['but-1-ene'] = chainGraph(4, { h: [2, 1, 2, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-1-ene'].bonds[0].order = 2;
    s['but-2-ene'] = chainGraph(4, { h: [3, 1, 1, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-2-ene'].bonds[1].order = 2;
    s.isobutene = {
      atoms: [
        atom('C', 180, 115, 0), atom('C', 100, 115, 2),
        atom('C', 250, 68, 3), atom('C', 250, 162, 3)
      ],
      bonds: [bond(0, 1, 2), bond(0, 2, 1), bond(0, 3, 1)],
      mode: 'condensed', width: 360, height: 250
    };

    s.ethyne = {
      atoms: [atom('C', 140, 115, 1), atom('C', 220, 115, 1)],
      bonds: [bond(0, 1, 3)], mode: 'expanded', width: 360, height: 230
    };
    s.propyne = chainGraph(3, { h: [3, 0, 1], mode: 'expanded', width: 380, height: 250 });
    s.propyne.bonds[1].order = 3;
    s['but-1-yne'] = chainGraph(4, { h: [1, 0, 2, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-1-yne'].bonds[0].order = 3;
    s['but-2-yne'] = chainGraph(4, { h: [3, 0, 0, 3], mode: 'condensed', width: 400, height: 250 });
    s['but-2-yne'].bonds[1].order = 3;

    s.cyclopropane = (function () {
      var pts = ringCoords(3, 180, 140, 64, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(3), mode: 'expanded', width: 360, height: 280
      };
    })();
    s.cyclobutane = (function () {
      var pts = ringCoords(4, 180, 140, 62, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(4), mode: 'expanded', width: 360, height: 280
      };
    })();
    s.cyclopentane = (function () {
      var pts = ringCoords(5, 180, 140, 64, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(5), mode: 'condensed', width: 360, height: 280
      };
    })();
    s.cyclohexane = (function () {
      var pts = ringCoords(6, 180, 140, 64, -Math.PI / 2);
      return {
        atoms: pts.map(function (p) { return atom('C', p.x, p.y, 2); }),
        bonds: ringBonds(6), mode: 'condensed', width: 360, height: 280
      };
    })();

    s.benzene = benzeneGraph();
    s.naphthalene = naphthaleneGraph();

    return s;
  })();

  /* ------------------------------------------------------------------
   * 構造の組み立て（骨格 + 置換基）
   * ------------------------------------------------------------------ */

  function getSkeleton(id) {
    var t = SKELETONS[id];
    if (!t) throw new Error('未登録の炭素骨格: ' + id);
    return t;
  }

  function cloneSkeleton(id, spec) {
    var t = getSkeleton(id);
    var g = {
      atoms: t.atoms.map(function (a) { return Object.assign({}, a); }),
      bonds: t.bonds.map(function (b) { return Object.assign({}, b); }),
      mode: (spec && spec.mode) || t.mode,
      width: (spec && spec.width) || t.width,
      height: (spec && spec.height) || t.height,
      aromatic: !!t.aromatic
    };
    return g;
  }

  function bondAnglesOf(g, i) {
    var out = [];
    g.bonds.forEach(function (b) {
      var other = null;
      if (b.a === i) other = b.b;
      else if (b.b === i) other = b.a;
      if (other == null) return;
      var a = g.atoms[i], o = g.atoms[other];
      out.push(Math.atan2(o.y - a.y, o.x - a.x));
    });
    return out;
  }

  function centroidOf(g) {
    var sx = 0, sy = 0;
    g.atoms.forEach(function (a) { sx += a.x; sy += a.y; });
    return { x: sx / Math.max(1, g.atoms.length), y: sy / Math.max(1, g.atoms.length) };
  }

  function chooseDirection(g, atomIndex, distance, avoidPoints) {
    var a = g.atoms[atomIndex];
    var centroid = centroidOf(g);
    var bonds = bondAnglesOf(g, atomIndex);
    var outAngle = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    var best = null, bestScore = -Infinity;
    avoidPoints = avoidPoints || [];
    for (var deg = 0; deg < 360; deg += 5) {
      var rad = degToRad(deg);
      var clear = Math.PI;
      if (bonds.length) {
        clear = Math.min.apply(null, bonds.map(function (b) { return angDist(rad, b); }));
      }
      var outward = Math.cos(rad - outAngle);
      var px = a.x + distance * Math.cos(rad);
      var py = a.y + distance * Math.sin(rad);
      var collision = 0;
      g.atoms.forEach(function (o, j) {
        if (j === atomIndex) return;
        var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
        if (d < 30) collision += 120;
        else if (d < 46) collision += 28;
      });
      avoidPoints.forEach(function (o) {
        var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
        if (d < 26) collision += 80;
        else if (d < 40) collision += 18;
      });
      var edge = 0;
      if (px < 24 || px > g.width - 24 || py < 24 || py > g.height - 24) edge = 55;
      var score = Math.min(clear, Math.PI * 0.9) * 100 + (outward + 1) * 22 - collision - edge;
      if (score > bestScore) {
        bestScore = score;
        best = { angle: rad, x: px, y: py };
      }
    }
    return best;
  }

  function addGroup(g, atomIndex, group, fixedAngleDeg) {
    var a = g.atoms[atomIndex];
    if (!a) throw new Error('置換位置が不正です');
    if (a.h < 1) throw new Error('置換に使える水素がありません');
    var dir = fixedAngleDeg == null
      ? chooseDirection(g, atomIndex, 58)
      : { angle: degToRad(fixedAngleDeg), x: a.x + 58 * Math.cos(degToRad(fixedAngleDeg)), y: a.y + 58 * Math.sin(degToRad(fixedAngleDeg)) };
    var u = { x: Math.cos(dir.angle), y: Math.sin(dir.angle) };
    var v = { x: -u.y, y: u.x };
    var p = { x: dir.x, y: dir.y };

    function addAtom(el, x, y, h, extra) {
      g.atoms.push(atom(el, x, y, h, extra));
      return g.atoms.length - 1;
    }

    if (group === 'oh') {
      var o = addAtom('O', p.x, p.y, 1);
      g.bonds.push(bond(atomIndex, o, 1));
    } else if (group === 'cooh') {
      var c = addAtom('C', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, c, 1));
      var o1 = addAtom('O', p.x + 38 * v.x, p.y + 38 * v.y, 0);
      g.bonds.push(bond(c, o1, 2));
      var o2 = addAtom('O', p.x - 38 * v.x, p.y - 38 * v.y, 1);
      g.bonds.push(bond(c, o2, 1));
    } else if (group === 'cho') {
      var cc = addAtom('C', p.x, p.y, 1);
      g.bonds.push(bond(atomIndex, cc, 1));
      var oo = addAtom('O', p.x + 38 * v.x, p.y + 38 * v.y, 0);
      g.bonds.push(bond(cc, oo, 2));
    } else if (group === 'ch3') {
      var mc = addAtom('C', p.x, p.y, 3);
      g.bonds.push(bond(atomIndex, mc, 1));
    } else if (group === 'nh2') {
      var n = addAtom('N', p.x, p.y, 2);
      g.bonds.push(bond(atomIndex, n, 1));
    } else if (group === 'no2') {
      var nn = addAtom('N', p.x, p.y, 0, { charge: '+' });
      g.bonds.push(bond(atomIndex, nn, 1));
      var no1 = addAtom('O', p.x + 35 * v.x, p.y + 35 * v.y, 0);
      g.bonds.push(bond(nn, no1, 2));
      var no2 = addAtom('O', p.x - 35 * v.x, p.y - 35 * v.y, 0, { charge: '-' });
      g.bonds.push(bond(nn, no2, 1));
    } else if (group === 'cl') {
      var cl = addAtom('Cl', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, cl, 1));
    } else if (group === 'br') {
      var br = addAtom('Br', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, br, 1));
    } else if (group === 'i') {
      var io = addAtom('I', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, io, 1));
    } else if (group === 'cn') {
      var cy = addAtom('C', p.x, p.y, 0);
      g.bonds.push(bond(atomIndex, cy, 1));
      var ni = addAtom('N', p.x + 44 * u.x, p.y + 44 * u.y, 0);
      g.bonds.push(bond(cy, ni, 3));
    } else {
      throw new Error('未対応の置換基: ' + group);
    }
    a.h -= 1;
    return g;
  }

  function isGraphSpec(spec) {
    return spec && (spec.type === 'skeleton' || spec.type === 'sub' || spec.type === 'multi' || spec.type === 'custom');
  }

  function buildStructure(spec) {
    if (!spec || !spec.type) throw new Error('構造データがありません');
    if (spec.type === 'skeleton') return cloneSkeleton(spec.skeleton, spec);
    if (spec.type === 'sub') {
      var g = cloneSkeleton(spec.skeleton, spec);
      addGroup(g, spec.at, spec.group, spec.angle);
      return g;
    }
    if (spec.type === 'multi') {
      var gm = cloneSkeleton(spec.skeleton, spec);
      (spec.groups || []).forEach(function (item) {
        addGroup(gm, item.at, item.group, item.angle);
      });
      return gm;
    }
    if (spec.type === 'custom') {
      return {
        atoms: (spec.atoms || []).map(function (a) { return Object.assign({}, a); }),
        bonds: (spec.bonds || []).map(function (b) { return Object.assign({}, b); }),
        mode: spec.mode || 'condensed',
        width: spec.width || 420,
        height: spec.height || 260,
        skeletal: !!spec.skeletal
      };
    }
    return spec;
  }

  /* ------------------------------------------------------------------
   * 水素の配置とSVG描画
   * ------------------------------------------------------------------ */

  function labelFor(a, mode) {
    if (a.label) return a.label;
    if (a.el === 'C') {
      if (mode !== 'condensed') return 'C';
      if (a.h >= 4) return 'CH₄';
      if (a.h === 3) return 'CH₃';
      if (a.h === 2) return 'CH₂';
      if (a.h === 1) return 'CH';
      return 'C';
    }
    if (a.el === 'Cl') return 'Cl';
    if (a.el === 'Na') return 'Na';
    return a.el;
  }

  // skeletal表示では連結炭素のCラベルを省略するが、結合を持たない孤立炭素は
  // 何も描かれず空図になるため、CH₄などの明示ラベルを残す。
  function bondDegreeOf(g, index) {
    var n = 0;
    g.bonds.forEach(function (b) {
      if (b.a === index || b.b === index) n++;
    });
    return n;
  }

  function isSkeletalCarbonOmitted(g, a, index) {
    return !!(g.skeletal && a.el === 'C' && !a.charge && !a.label && bondDegreeOf(g, index) > 0);
  }

  function chargeLabel(charge) {
    var map = { '+': '⁺', '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    return String(charge == null ? '' : charge).split('').map(function (ch) { return map[ch] || ch; }).join('');
  }

  function estimateWidth(text, fontSize) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '₀' || ch === '₁' || ch === '₂' || ch === '₃' || ch === '₄' || ch === '₅' || ch === '₆' || ch === '₇' || ch === '₈' || ch === '₉') w += fontSize * 0.55;
      else if (/[A-Za-z0-9]/.test(ch)) w += fontSize * 0.62;
      else if (ch === '—' || ch === '–' || ch === '=') w += fontSize * 0.7;
      else w += fontSize;
    }
    return w;
  }

  function atomRadius(a, mode) {
    var label = labelFor(a, mode);
    var fs = mode === 'condensed' ? 19 : 23;
    return Math.max(8, estimateWidth(label, fs) / 2 + 3);
  }

  function hDirections(g, index) {
    var a = g.atoms[index];
    if (!a.h) return [];
    var centroid = centroidOf(g);
    var bonds = bondAnglesOf(g, index);
    var outAngle = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    var chosen = [];
    var chosenPoints = [];
    for (var k = 0; k < a.h; k++) {
      var best = null, bestScore = -Infinity;
      for (var deg = 0; deg < 360; deg += 5) {
        var rad = degToRad(deg);
        var clearBond = bonds.length ? Math.min.apply(null, bonds.map(function (b) { return angDist(rad, b); })) : Math.PI;
        var clearH = chosen.length ? Math.min.apply(null, chosen.map(function (b) { return angDist(rad, b); })) : Math.PI;
        var outward = Math.cos(rad - outAngle);
        var px = a.x + 42 * Math.cos(rad);
        var py = a.y + 42 * Math.sin(rad);
        var collision = 0;
        g.atoms.forEach(function (o, j) {
          if (j === index) return;
          var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
          if (d < 24) collision += 90;
          else if (d < 36) collision += 20;
        });
        chosenPoints.forEach(function (o) {
          var d = Math.sqrt((px - o.x) * (px - o.x) + (py - o.y) * (py - o.y));
          if (d < 24) collision += 70;
        });
        var score = Math.min(clearBond, Math.PI * 0.9) * 90 + Math.min(clearH, Math.PI * 0.9) * 55 + (outward + 1) * 18 - collision;
        if (score > bestScore) {
          bestScore = score;
          best = { angle: rad, x: px, y: py };
        }
      }
      chosen.push(best.angle);
      chosenPoints.push({ x: best.x, y: best.y });
    }
    return chosenPoints;
  }

  function svgOpen(x, y, w, h, label, extra) {
    var pad = 12;
    return '<svg class="rp-struct-svg" viewBox="' + (x - pad).toFixed(1) + ' ' + (y - pad).toFixed(1) + ' ' + (w + pad * 2).toFixed(1) + ' ' + (h + pad * 2).toFixed(1) + '" role="img" data-font-base="20" data-font-min="10" aria-label="' +
      esc(label || '分子構造式') + '" preserveAspectRatio="xMidYMid meet" ' + (extra || '') + '>';
  }

  function textEl(x, y, content, cls, size, extra) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" class="' +
      (cls || 'rp-struct-atom') + '" font-size="' + (size || 22) + '" ' + (extra || '') + '>' + esc(content) + '</text>';
  }

  function lineEl(x1, y1, x2, y2, cls, width) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
      '" class="' + (cls || 'rp-struct-bond') + '" stroke-width="' + (width || 2.6) + '" stroke-linecap="round"/>';
  }

  function drawBondLine(a, b, order, trimA, trimB, cls, coordinate) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var px = -uy, py = ux;
    var x1 = a.x + ux * trimA, y1 = a.y + uy * trimA;
    var x2 = b.x - ux * trimB, y2 = b.y - uy * trimB;
    if (coordinate) {
      // 金属—配位原子の結合は三重結合ではなく、点線の配位結合として描く。
      return lineEl(x1, y1, x2, y2, (cls || 'rp-struct-bond') + ' rp-struct-bond--coordinate', 2.2);
    }
    if (order === 1) return lineEl(x1, y1, x2, y2, cls);
    var offsets = order === 2 ? [-3.6, 3.6] : [-4.8, 0, 4.8];
    return offsets.map(function (off) {
      return lineEl(x1 + px * off, y1 + py * off, x2 + px * off, y2 + py * off, cls);
    }).join('');
  }

  function drawRingBond(a, b, order, center, cls, width) {
    if (!cls) cls = 'rp-struct-bond';
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var px = -uy, py = ux;
    // 二重結合の2本目は環の内側へ
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var toCenter = { x: center.x - mid.x, y: center.y - mid.y };
    var sign = (px * toCenter.x + py * toCenter.y) >= 0 ? 1 : -1;
    if (order === 1) return lineEl(a.x, a.y, b.x, b.y, cls, width || 2.6);
    var offs = order === 2 ? [0, 7 * sign] : [-7, 0, 7];
    return offs.map(function (off, idx) {
      var lineClass = cls;
      if (order === 2 && idx === 1) lineClass += ' rp-struct-bond--inner';
      return lineEl(a.x + px * off, a.y + py * off, b.x + px * off, b.y + py * off, lineClass, width || 2.6);
    }).join('');
  }

  function trimPoint(from, toward, radius) {
    var dx = toward.x - from.x, dy = toward.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: from.x + dx / len * radius, y: from.y + dy / len * radius };
  }

  // SVGのviewBoxを、原子・結合・H・電荷・文字幅・多重結合のずれを含む
  // 実内容の範囲に合わせる。g.width/height の固定値で無駄な空白を作らない。
  function graphBounds(g, hPoints) {
    var mode = g.mode || 'condensed';
    var skeletal = !!g.skeletal;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function include(x, y) {
      if (!isFinite(x) || !isFinite(y)) return;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    function atomHalf(a, i) {
      if (isSkeletalCarbonOmitted(g, a, i)) return 0;
      var fs = (skeletal || mode !== 'condensed') ? 23 : 19;
      var lab = labelFor(a, mode);
      return Math.max(atomRadius(a, mode), estimateWidth(lab, fs) / 2 + 2, fs * 0.58);
    }
    g.atoms.forEach(function (a, i) {
      var half = atomHalf(a, i);
      include(a.x - half, a.y - half);
      include(a.x + half, a.y + half);
      if (a.charge) {
        var cl = chargeLabel(a.charge);
        include(a.x + 10 + estimateWidth(cl, 13), a.y - 16);
        include(a.x + 10, a.y - 8);
      }
    });
    (hPoints || []).forEach(function (list) {
      list.forEach(function (p) {
        include(p.x - 12, p.y - 12);
        include(p.x + 12, p.y + 12);
      });
    });
    g.bonds.forEach(function (b) {
      var a = g.atoms[b.a], c = g.atoms[b.b];
      if (!a || !c) return;
      var off = b.order === 3 ? 7 : (b.order === 2 ? 5 : 1.5);
      include(Math.min(a.x, c.x) - off, Math.min(a.y, c.y) - off);
      include(Math.max(a.x, c.x) + off, Math.max(a.y, c.y) + off);
    });
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function graphContentBounds(g) {
    var mode = g.mode || 'condensed';
    var hPoints = g.atoms.map(function (a, i) {
      if (mode === 'condensed' && a.el === 'C') return [];
      return hDirections(g, i);
    });
    return graphBounds(g, hPoints);
  }

  function renderGraph(g, label) {
    var mode = g.mode || 'condensed';
    var skeletal = !!g.skeletal;
    function radiusOf(a, i) {
      if (isSkeletalCarbonOmitted(g, a, i)) return 0;
      if (skeletal && a.el === 'C' && a.label) return Math.max(atomRadius(a, mode), 19);
      if (skeletal && a.el !== 'C') return Math.max(atomRadius(a, mode), 17);
      return atomRadius(a, mode);
    }
    var hPoints = g.atoms.map(function (a, i) {
      if (mode === 'condensed' && a.el === 'C') return [];
      return hDirections(g, i);
    });
    var bounds = graphBounds(g, hPoints);
    var vbX = bounds.minX;
    var vbY = bounds.minY;
    var vbW = Math.max(1, bounds.maxX - bounds.minX);
    var vbH = Math.max(1, bounds.maxY - bounds.minY);

    var bonds = '';
    var graphCenter = centroidOf(g);
    g.bonds.forEach(function (b) {
      var a = g.atoms[b.a], c = g.atoms[b.b];
      if (b.ring) {
        var aa = trimPoint(a, c, radiusOf(a, b.a));
        var cc = trimPoint(c, a, radiusOf(c, b.b));
        bonds += drawRingBond(aa, cc, b.order, b.ringCenter || graphCenter);
      } else {
        bonds += drawBondLine(a, c, b.order, radiusOf(a, b.a), radiusOf(c, b.b), null, b.coordinate);
      }
    });

    var hBonds = '', hLabels = '';
    g.atoms.forEach(function (a, i) {
      hPoints[i].forEach(function (p) {
        var dx = p.x - a.x, dy = p.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ax = a.x + dx / len * (radiusOf(a, i) - 1);
        var ay = a.y + dy / len * (radiusOf(a, i) - 1);
        var bx = p.x - dx / len * 8;
        var by = p.y - dy / len * 8;
        hBonds += lineEl(ax, ay, bx, by, 'rp-struct-bond rp-struct-bond--h', 2.1);
        hLabels += textEl(p.x, p.y, 'H', 'rp-struct-h', 17, 'data-el="H"');
      });
    });

    var atoms = '';
    g.atoms.forEach(function (a, i) {
      if (g.skeletal && a.el === 'C' && a.vertex) {
        atoms += '<circle cx="' + a.x.toFixed(1) + '" cy="' + a.y.toFixed(1) + '" r="2.7" class="rp-struct-vertex"/>';
      }
      if (isSkeletalCarbonOmitted(g, a, i)) return;
      var lab = labelFor(a, mode);
      var fs = (skeletal || mode !== 'condensed') ? 23 : 19;
      atoms += textEl(a.x, a.y, lab, 'rp-struct-atom', fs, 'data-el="' + esc(a.el) + '"');
      if (a.charge) {
        atoms += textEl(a.x + (fs * 0.55), a.y - (fs * 0.55), chargeLabel(a.charge), 'rp-struct-charge', 13, 'data-charge="' + esc(a.charge) + '"');
      }
    });

    return svgOpen(vbX, vbY, vbW, vbH, label, 'data-kind="graph"') +
      '<g class="rp-struct-bond-layer">' + bonds + hBonds + '</g>' +
      '<g class="rp-struct-atom-layer">' + atoms + hLabels + '</g>' +
      '</svg>';
  }

  /* ------------------------------------------------------------------
   * ②の一般構造（C=O を実際の二重結合線で示す小型図）
   * ------------------------------------------------------------------ */
  function functionalGraph(kind, opts) {
    opts = opts || {};
    var g = { atoms: [], bonds: [], mode: 'condensed' };
    function add(el, x, y, h, label, charge) {
      g.atoms.push({ el: el, x: x, y: y, h: h || 0, label: label || '', charge: charge || '' });
      return g.atoms.length - 1;
    }
    function link(a, b, order) { g.bonds.push({ a: a, b: b, order: order || 1 }); }
    if (kind === 'methane') {
      add('C', 100, 100, 4);
      return g;
    }
    if (kind === 'alkane') {
      var c1 = add('C', 80, 100, 3), c2 = add('C', 150, 100, 3);
      link(c1, c2);
      return g;
    }
    if (kind === 'alkene') {
      var e1 = add('C', 80, 100, 2), e2 = add('C', 150, 100, 2);
      link(e1, e2, 2);
      return g;
    }
    if (kind === 'alkyne') {
      var y1 = add('C', 80, 100, 1), y2 = add('C', 150, 100, 1);
      link(y1, y2, 3);
      return g;
    }
    if (kind === 'alcohol') {
      var ar = add('C', 60, 100, 0, 'R'), ao = add('O', 140, 100, 1);
      link(ar, ao);
      return g;
    }
    if (kind === 'ether') {
      var er = add('C', 50, 100, 0, 'R'), eo = add('O', 125, 100, 0), er2 = add('C', 200, 100, 0, 'R′');
      link(er, eo); link(eo, er2);
      return g;
    }
    if (kind === 'aldehyde') {
      var dr = add('C', 55, 100, 0, 'R'), dc = add('C', 125, 100, 0);
      var dox = add('O', 125, 45, 0), dh = add('H', 195, 100, 0);
      link(dr, dc); link(dc, dox, 2); link(dc, dh);
      return g;
    }
    if (kind === 'ketone') {
      var kr = add('C', 55, 100, 0, 'R'), kc = add('C', 125, 100, 0);
      var kox = add('O', 125, 45, 0), kr2 = add('C', 195, 100, 0, 'R′');
      link(kr, kc); link(kc, kox, 2); link(kc, kr2);
      return g;
    }
    if (kind === 'carboxyl') {
      var cr = add('C', 50, 100, 0, 'R'), cc = add('C', 120, 100, 0);
      var cox = add('O', 120, 45, 0), coh = add('O', 190, 100, 1);
      link(cr, cc); link(cc, cox, 2); link(cc, coh);
      return g;
    }
    if (kind === 'ester') {
      var sr = add('C', 45, 100, 0, 'R'), sc = add('C', 115, 100, 0);
      var sox = add('O', 115, 45, 0), so = add('O', 185, 100, 0), sr2 = add('C', 255, 100, 0, 'R′');
      link(sr, sc); link(sc, sox, 2); link(sc, so); link(so, sr2);
      return g;
    }
    if (kind === 'anhydride') {
      var anr = add('C', 30, 100, 0, 'R'), anc = add('C', 100, 100, 0);
      var anox = add('O', 100, 45, 0), ano = add('O', 165, 100, 0), anc2 = add('C', 230, 100, 0);
      var anox2 = add('O', 230, 45, 0), anr2 = add('C', 300, 100, 0, 'R′');
      link(anr, anc); link(anc, anox, 2); link(anc, ano); link(ano, anc2);
      link(anc2, anox2, 2); link(anc2, anr2);
      return g;
    }
    if (kind === 'nitrile') {
      var nr = add('C', 55, 100, 0, 'R'), nc = add('C', 125, 100, 0), nn = add('N', 195, 100, 0);
      link(nr, nc); link(nc, nn, 3);
      return g;
    }
    if (kind === 'amine1') {
      var m1 = add('C', 55, 100, 0, 'R'), n1 = add('N', 130, 100, 2);
      link(m1, n1);
      return g;
    }
    if (kind === 'amine2') {
      var m2 = add('C', 45, 100, 0, 'R'), n2 = add('N', 120, 100, 1), m2b = add('C', 195, 100, 0, 'R′');
      link(m2, n2); link(n2, m2b);
      return g;
    }
    if (kind === 'amine3') {
      var m3 = add('C', 35, 100, 0, 'R'), n3 = add('N', 110, 100, 0), m3b = add('C', 185, 100, 0, 'R′'), m3c = add('C', 110, 170, 0, 'R″');
      link(m3, n3); link(n3, m3b); link(n3, m3c);
      return g;
    }
    if (kind === 'nitro') {
      var xr = add('C', 50, 100, 0, 'R'), xn = add('N', 125, 100, 0, '', '+');
      var xo1 = add('O', 125, 40, 0), xo2 = add('O', 200, 100, 0, '', '-');
      link(xr, xn); link(xn, xo1, 2); link(xn, xo2);
      return g;
    }
    if (kind === 'halogen') {
      var hr = add('C', 55, 100, 0, 'R'), hx = add('C', 130, 100, 0, 'X');
      link(hr, hx);
      return g;
    }
    if (kind === 'polyol') {
      var pr = add('C', 40, 100, 0, 'R'), pc = add('C', 110, 100, 1);
      var po1 = add('O', 180, 70, 1), po2 = add('O', 180, 130, 1);
      link(pr, pc); link(pc, po1); link(pc, po2);
      return g;
    }
    if (kind === 'aminoAlcohol') {
      var ao1 = add('O', 35, 100, 1), ac1 = add('C', 100, 100, 2), ac2 = add('C', 165, 100, 2), an1 = add('N', 235, 100, 2);
      link(ao1, ac1); link(ac1, ac2); link(ac2, an1);
      return g;
    }
    return null;
  }

  var FUNCTIONAL_FIGURE_KIND = {
    alkane: 'alkane', alkene: 'alkene', alkyne: 'alkyne', halogen: 'halogen',
    alcohol: 'alcohol', polyol: 'polyol', ether: 'ether', aldehyde: 'aldehyde',
    ketone: 'ketone', carboxylic: 'carboxyl', anhydride: 'anhydride', ester: 'ester',
    nitrile: 'nitrile', nitro: 'nitro', 'amino-alcohol': 'aminoAlcohol'
  };

  function renderFunctionalFigure(family, opts) {
    opts = opts || {};
    var kind = FUNCTIONAL_FIGURE_KIND[family];
    if (family === 'alkane' && opts.partialC === 1) kind = 'methane';
    if (!kind) return '';
    var g = functionalGraph(kind);
    if (!g) return '';
    return renderGraph(g, opts.label || '一般構造');
  }

  function svgGeometry(svg) {
    var m = String(svg || '').match(/viewBox="([^"]+)"/);
    if (!m) return null;
    var v = m[1].trim().split(/\s+/).map(Number);
    if (v.length !== 4 || v.some(function (n) { return !isFinite(n); })) return null;
    return { x: v[0], y: v[1], width: v[2], height: v[3], aspect: v[2] / v[3] };
  }

  /* ------------------------------------------------------------------
   * ベンゼン環＋置換基ラベル（個別化合物用）
   * ------------------------------------------------------------------ */

  function renderRingSub(spec, label, simple) {
    var pts = ringCoords(6, 210, 135, 62, 0);
    var center = { x: 210, y: 135 };
    var orders = [2, 1, 2, 1, 2, 1];
    var out = '';
    var bonds = '';
    for (var i = 0; i < 6; i++) bonds += drawRingBond(pts[i], pts[(i + 1) % 6], orders[i], center);
    var subs = {};
    (spec.subs || []).forEach(function (s) { subs[s.at] = s.label; });
    var labels = '';
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function include(x, y) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    pts.forEach(function (p) { include(p.x - 8, p.y - 8); include(p.x + 8, p.y + 8); });
    for (var j = 0; j < 6; j++) {
      var angle = j * Math.PI / 3;
      var ux = Math.cos(angle), uy = Math.sin(angle);
      var x1 = pts[j].x, y1 = pts[j].y;
      var x2 = pts[j].x + ux * 50, y2 = pts[j].y + uy * 50;
      if (subs[j]) {
        labels += lineEl(x1, y1, x2, y2, 'rp-struct-bond', 2.6);
        var anchor = ux > 0.3 ? 'start' : (ux < -0.3 ? 'end' : 'middle');
        var tx = x2 + (anchor === 'start' ? 4 : (anchor === 'end' ? -4 : 0));
        var ty = y2 + (anchor === 'middle' ? uy * 6 : 0);
        labels += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) +
          '" text-anchor="' + anchor + '" dominant-baseline="middle" class="rp-struct-atom" font-size="18" data-sub="' +
          esc(subs[j]) + '">' + esc(subs[j]) + '</text>';
        var tw = estimateWidth(subs[j], 18);
        var left = anchor === 'start' ? tx : (anchor === 'end' ? tx - tw : tx - tw / 2);
        include(left - 2, ty - 12);
        include(left + tw + 2, ty + 12);
      } else if (!simple) {
        var hx2 = pts[j].x + ux * 42, hy2 = pts[j].y + uy * 42;
        labels += lineEl(x1, y1, hx2, hy2, 'rp-struct-bond rp-struct-bond--h', 2.1);
        labels += textEl(hx2 + ux * 8, hy2 + uy * 8, 'H', 'rp-struct-h', 17, 'data-el="H"');
        include(hx2 + ux * 8 - 10, hy2 + uy * 8 - 10);
        include(hx2 + ux * 8 + 10, hy2 + uy * 8 + 10);
      }
    }
    return svgOpen(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), label, 'data-kind="ring-sub"' + (simple ? ' data-simple="1"' : '')) +
      '<g class="rp-struct-bond-layer">' + bonds + '</g>' +
      '<g class="rp-struct-atom-layer">' + labels + '</g></svg>';
  }

  /* ------------------------------------------------------------------
   * 簡略式から構造式を作る（明示された結合記号だけを使う）
   * ------------------------------------------------------------------ */

  var CONDENSED_SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
  var CONDENSED_TOKENS = [
    'H2N', 'HOOC', 'OOH', 'HO', 'COOCH3', 'OCOCH3', 'NHCOCH3', 'SO2NH2', 'SO3H', 'CH2OH', 'CHOH',
    'COOH', 'CH3', 'CH2', 'CH', 'NH2', 'NO2', 'CHO', 'COO', 'CO', 'CN', 'OH', 'NH', 'N',
    'O', 'C', 'H', 'Cl', 'Br', 'I', 'F', 'S', 'Si', 'Na', 'Pb', 'Ca', 'Ag', 'Cu', 'K'
  ].sort(function (a, b) { return b.length - a.length; });

  function normalizeCondensedText(line) {
    return String(line == null ? '' : line)
      .replace(/[₀-₉]/g, function (ch) { return CONDENSED_SUB[ch]; })
      .replace(/\s+/g, '');
  }

  function condensedTokenize(s, i) {
    var generic = /^C(\d+)H(\d+)/.exec(s.slice(i));
    if (generic) return { t: generic[0], len: generic[0].length };
    for (var k = 0; k < CONDENSED_TOKENS.length; k++) {
      var t = CONDENSED_TOKENS[k];
      if (s.slice(i, i + t.length) === t) return { t: t, len: t.length };
    }
    return null;
  }

  function condensedAtom(el, h, charge) { return { el: el, h: h || 0, charge: charge || '' }; }

  function condensedFragment(t) {
    function one(el, h, charge) { return { atoms: [condensedAtom(el, h, charge)], bonds: [], entry: 0, exit: 0 }; }
    if (t === 'CH3') return one('C', 3);
    if (t === 'CH2') return one('C', 2);
    if (t === 'CH') return one('C', 1);
    if (t === 'C') return one('C', 0);
    if (t === 'NH2' || t === 'H2N') return one('N', 2);
    if (t === 'NH') return one('N', 1);
    if (t === 'N') return one('N', 0);
    if (t === 'OH' || t === 'HO') return one('O', 1);
    if (t === 'O') return one('O', 0);
    if (t === 'H') return one('H', 0);
    if (t === 'Cl') return one('Cl', 0);
    if (t === 'Br') return one('Br', 0);
    if (t === 'I') return one('I', 0);
    if (t === 'F') return one('F', 0);
    if (t === 'S') return one('S', 0);
    if (t === 'Si') return one('Si', 0);
    if (t === 'Na') return one('Na', 0);
    if (t === 'Pb') return one('Pb', 0);
    if (t === 'Ca') return one('Ca', 0);
    if (t === 'Ag') return one('Ag', 0);
    if (t === 'Cu') return one('Cu', 0);
    if (t === 'K') return one('K', 0);
    if (t === 'NO2') {
      return { atoms: [condensedAtom('N', 0, '+'), condensedAtom('O', 0), condensedAtom('O', 0, '-')], bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }], entry: 0, exit: 0 };
    }
    if (t === 'CHO') {
      return { atoms: [condensedAtom('C', 1), condensedAtom('O', 0)], bonds: [{ a: 0, b: 1, order: 2 }], entry: 0, exit: 0 };
    }
    if (t === 'COOH' || t === 'HOOC') {
      return { atoms: [condensedAtom('C', 0), condensedAtom('O', 0), condensedAtom('O', 1)], bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }], entry: 0, exit: 0 };
    }
    if (t === 'COO') {
      return { atoms: [condensedAtom('C', 0), condensedAtom('O', 0), condensedAtom('O', 0)], bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }], entry: 0, exit: 2 };
    }
    if (t === 'CO') {
      return { atoms: [condensedAtom('C', 0), condensedAtom('O', 0)], bonds: [{ a: 0, b: 1, order: 2 }], entry: 0, exit: 0 };
    }
    if (t === 'CN') {
      return { atoms: [condensedAtom('C', 0), condensedAtom('N', 0)], bonds: [{ a: 0, b: 1, order: 3 }], entry: 0, exit: 1 };
    }
    if (t === 'CHOH') {
      return {
        atoms: [condensedAtom('C', 1), condensedAtom('O', 1)],
        bonds: [{ a: 0, b: 1, order: 1 }], entry: 0, exit: 0
      };
    }
    if (t === 'CH2OH') {
      return { atoms: [condensedAtom('C', 2), condensedAtom('O', 1)], bonds: [{ a: 0, b: 1, order: 1 }], entry: 0, exit: 1 };
    }
    if (t === 'OCH3') {
      return { atoms: [condensedAtom('O', 0), condensedAtom('C', 3)], bonds: [{ a: 0, b: 1, order: 1 }], entry: 0, exit: 1 };
    }
    if (t === 'OCOCH3') {
      return {
        atoms: [condensedAtom('O', 0), condensedAtom('C', 0), condensedAtom('O', 0), condensedAtom('C', 3)],
        bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 }, { a: 1, b: 3, order: 1 }], entry: 0, exit: 3
      };
    }
    if (t === 'COOCH3') {
      return {
        atoms: [condensedAtom('C', 0), condensedAtom('O', 0), condensedAtom('O', 0), condensedAtom('C', 3)],
        bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }, { a: 2, b: 3, order: 1 }], entry: 0, exit: 3
      };
    }
    if (t === 'NHCOCH3') {
      return {
        atoms: [condensedAtom('N', 1), condensedAtom('C', 0), condensedAtom('O', 0), condensedAtom('C', 3)],
        bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 }, { a: 1, b: 3, order: 1 }], entry: 0, exit: 3
      };
    }
    if (t === 'SO3H') {
      return {
        atoms: [condensedAtom('S', 0), condensedAtom('O', 0), condensedAtom('O', 0), condensedAtom('O', 1)],
        bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 2 }, { a: 0, b: 3, order: 1 }], entry: 0, exit: 3
      };
    }
    if (t === 'SO2NH2') {
      return {
        atoms: [condensedAtom('S', 0), condensedAtom('O', 0), condensedAtom('O', 0), condensedAtom('N', 2)],
        bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 2 }, { a: 0, b: 3, order: 1 }], entry: 0, exit: 3
      };
    }
    if (t === 'OOH') {
      return { atoms: [condensedAtom('O', 0), condensedAtom('O', 0), condensedAtom('H', 1)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }], entry: 0, exit: 2 };
    }
    var m = /^C(\d+)H(\d+)$/.exec(t);
    if (m) {
      var n = Number(m[1]);
      var h = Number(m[2]);
      if (h !== 2 * n + 1) throw new Error('環・複合表記は簡略式のまま表示します');
      var atoms = [];
      for (var i = 0; i < n; i++) atoms.push(condensedAtom('C', i === 0 ? 2 : (i === n - 1 ? 3 : 2)));
      var bonds = [];
      for (var j = 0; j < n - 1; j++) bonds.push({ a: j, b: j + 1, order: 1 });
      return { atoms: atoms, bonds: bonds, entry: 0, exit: n - 1 };
    }
    throw new Error('未対応の簡略式記号: ' + t);
  }

  function appendCondensedFragment(target, frag, attachAtom, order) {
    var base = target.atoms.length;
    frag.atoms.forEach(function (a) { target.atoms.push(condensedAtom(a.el, a.h, a.charge)); });
    frag.bonds.forEach(function (b) { target.bonds.push({ a: b.a + base, b: b.b + base, order: b.order }); });
    if (attachAtom != null) target.bonds.push({ a: attachAtom, b: base + frag.entry, order: order || 1 });
    return { base: base, entry: base + frag.entry, exit: base + frag.exit };
  }

  function parseCondensedFragment(s, state, stopParen) {
    var target = { atoms: [], bonds: [] };
    var prevEntry = null;
    var prevExit = null;
    var firstEntry = null;
    var pendingBranches = [];
    var lastMain = null;
    var bondOrder = 1;
    var justBond = false;
    var entryOrder = 1;
    while (state.i < s.length) {
      var ch = s[state.i];
      if (ch === ')') {
        state.i++;
        if (stopParen) break;
        continue;
      }
      if (ch === '(') {
        state.i++;
        var inner = parseCondensedFragment(s, state, true);
        var num = '';
        while (/[0-9]/.test(s[state.i] || '')) num += s[state.i++];
        var times = num ? Number(num) : 1;
        if (!inner.atoms.length) continue;
        var innerEntryAtom = inner.atoms[inner.entry];
        // 括弧内が CH2 1個だけのときだけ主鎖の繰り返し。
        // CH3 は分岐、C2H5 などの多原子基も分岐として扱う。
        var simpleCH2 = inner.atoms.length === 1 && innerEntryAtom && innerEntryAtom.el === 'C' && innerEntryAtom.h === 2;
        var asChain = justBond || (prevEntry != null && simpleCH2);
        if (asChain) {
          for (var k = 0; k < times; k++) {
            var link = (prevExit != null) ? prevExit : lastMain;
            var addedChain = appendCondensedFragment(target, inner, link, justBond ? bondOrder : 1);
            prevExit = addedChain.exit;
            prevEntry = addedChain.entry;
            lastMain = addedChain.entry;
            if (firstEntry == null) firstEntry = addedChain.entry;
          }
        } else if (prevEntry != null) {
          for (var k2 = 0; k2 < times; k2++) appendCondensedFragment(target, inner, prevEntry, inner.entryOrder || 1);
        } else {
          for (var k3 = 0; k3 < times; k3++) pendingBranches.push(inner);
        }
        bondOrder = 1;
        justBond = false;
        continue;
      }
      if (ch === '—' || ch === '–' || ch === '-' || ch === '−' || ch === '=' || ch === '≡') {
        bondOrder = ch === '=' ? 2 : (ch === '≡' ? 3 : 1);
        justBond = true;
        state.i++;
        continue;
      }
      var tok = condensedTokenize(s, state.i);
      if (!tok) { state.i++; continue; }
      var frag = condensedFragment(tok.t);
      state.i += tok.len;
      var linkOrder = bondOrder;
      var hadPrev = prevExit != null;
      var added = appendCondensedFragment(target, frag, hadPrev ? prevExit : null, linkOrder);
      if (firstEntry == null) {
        firstEntry = added.entry;
        entryOrder = hadPrev ? 1 : linkOrder;
      }
      while (pendingBranches.length) appendCondensedFragment(target, pendingBranches.shift(), added.entry, 1);
      var suffix = '';
      while (/[0-9]/.test(s[state.i] || '')) suffix += s[state.i++];
      var count = suffix ? Number(suffix) : 1;
      for (var r = 1; r < count; r++) appendCondensedFragment(target, frag, hadPrev ? lastMain : added.entry, 1);
      if (s[state.i] === '⁺' || s[state.i] === '+') {
        target.atoms[added.entry].charge = '+';
        state.i++;
      } else if (s[state.i] === '⁻' || s[state.i] === '-') {
        target.atoms[added.entry].charge = '-';
        state.i++;
      }
      // 末端の一価基は主鎖を進めない（CCl2 の Cl、CHBr2 の Br 等）。
      var terminalBranch = hadPrev && ['Cl', 'Br', 'I', 'F', 'H', 'OH', 'NH2', 'NO2', 'OOH', 'SH'].indexOf(tok.t) !== -1;
      if (terminalBranch) {
        prevExit = lastMain;
      } else {
        prevEntry = added.entry;
        prevExit = added.exit;
        lastMain = added.entry;
      }
      bondOrder = 1;
      justBond = false;
    }
    target.entry = firstEntry == null ? 0 : firstEntry;
    target.exit = prevExit == null ? target.entry : prevExit;
    target.entryOrder = entryOrder;
    return target;
  }

  function layoutCondensedGraph(g) {
    var n = g.atoms.length;
    var adj = g.atoms.map(function () { return []; });
    g.bonds.forEach(function (b) { adj[b.a].push(b.b); adj[b.b].push(b.a); });
    var placed = new Array(n);
    if (!n) return g;
    placed[0] = true;
    g.atoms[0].x = 200;
    g.atoms[0].y = 150;
    var queue = [0];
    while (queue.length) {
      var parent = queue.shift();
      var angles = [];
      g.bonds.forEach(function (b) {
        var other = b.a === parent ? b.b : (b.b === parent ? b.a : null);
        if (other != null && placed[other]) {
          angles.push(Math.atan2(g.atoms[other].y - g.atoms[parent].y, g.atoms[other].x - g.atoms[parent].x));
        }
      });
      adj[parent].forEach(function (child) {
        if (placed[child]) return;
        var best = null;
        var bestScore = -Infinity;
        for (var deg = 0; deg < 360; deg += 5) {
          var rad = deg * Math.PI / 180;
          var clear = Math.PI;
          angles.forEach(function (a) {
            clear = Math.min(clear, Math.abs(Math.atan2(Math.sin(rad - a), Math.cos(rad - a))));
          });
          var px = g.atoms[parent].x + 70 * Math.cos(rad);
          var py = g.atoms[parent].y + 70 * Math.sin(rad);
          var collision = 0;
          for (var j = 0; j < n; j++) {
            if (!placed[j]) continue;
            var d = Math.sqrt((px - g.atoms[j].x) * (px - g.atoms[j].x) + (py - g.atoms[j].y) * (py - g.atoms[j].y));
            if (d < 48) collision += 200;
            else if (d < 62) collision += 30;
          }
          var score = clear * 100 - collision;
          if (score > bestScore) { bestScore = score; best = { x: px, y: py, angle: rad }; }
        }
        g.atoms[child].x = best.x;
        g.atoms[child].y = best.y;
        placed[child] = true;
        angles.push(best.angle);
        queue.push(child);
      });
    }
    return g;
  }

  function templateGraph(atoms, bonds, width, height) {
    return { atoms: atoms, bonds: bonds, mode: 'expanded', width: width || 460, height: height || 340 };
  }

  function templateAtom(el, x, y, h, charge, ion) {
    var a = { el: el, x: x, y: y, h: h || 0, charge: charge || '' };
    if (ion) a.ion = true;
    return a;
  }

  function ringTemplate(n, cx, cy, r, start, elements, hs, orders) {
    var pts = ringCoords(n, cx, cy, r, start);
    var atoms = pts.map(function (p, i) {
      return templateAtom(elements[i], p.x, p.y, hs[i], '', false);
    });
    var center = { x: cx, y: cy };
    var bonds = [];
    for (var i = 0; i < n; i++) {
      var b = bond(i, (i + 1) % n, orders && orders[i] ? orders[i] : 1);
      b.ring = true;
      b.ringCenter = center;
      bonds.push(b);
    }
    return { atoms: atoms, bonds: bonds, width: 480, height: 360 };
  }

  function addCarboxylate(g, fromAtom, ux, uy) {
    var a = g.atoms[fromAtom];
    var c = { x: a.x + 72 * ux, y: a.y + 72 * uy };
    var px = -uy, py = ux;
    var ci = g.atoms.length;
    g.atoms.push(templateAtom('C', c.x, c.y, 0));
    g.bonds.push(bond(fromAtom, ci, 1));
    g.atoms.push(templateAtom('O', c.x + 44 * px, c.y + 44 * py, 0));
    g.bonds.push(bond(ci, ci + 1, 2));
    g.atoms.push(templateAtom('O', c.x - 44 * px, c.y - 44 * py, 1));
    g.bonds.push(bond(ci, ci + 2, 1));
    return ci;
  }

  function addSodium(g, x, y) {
    g.atoms.push(templateAtom('Na', x, y, 0, '+', true));
  }

  function saturatedChainCarboxylate(n, startX, startY) {
    var g = { atoms: [], bonds: [], mode: 'expanded', width: 640, height: 360 };
    var x = startX, y = startY;
    for (var i = 0; i < n; i++) {
      g.atoms.push(templateAtom('C', x, y, i === 0 ? 3 : 2));
      if (i > 0) g.bonds.push(bond(i - 1, i, 1));
      x += 56;
      y += (i % 2 === 0 ? -28 : 28);
    }
    // carboxyl carbon: last CH2 -> C(=O)-O-
    var ci = g.atoms.length;
    g.atoms.push(templateAtom('C', x, y, 0));
    g.bonds.push(bond(n - 1, ci, 1));
    g.atoms.push(templateAtom('O', x, y - 62, 0));
    g.bonds.push(bond(ci, ci + 1, 2));
    g.atoms.push(templateAtom('O', x + 62, y, 0, '-'));
    g.bonds.push(bond(ci, ci + 2, 1));
    addSodium(g, x + 150, y + 60);
    g.width = x + 260;
    return g;
  }

  function acetateFragment(g, ox, oy, flip) {
    var dir = flip ? -1 : 1;
    var c0 = g.atoms.length;
    g.atoms.push(templateAtom('C', ox, oy, 3));
    g.atoms.push(templateAtom('C', ox + 72 * dir, oy, 0));
    g.bonds.push(bond(c0, c0 + 1, 1));
    g.atoms.push(templateAtom('O', ox + 72 * dir, oy - 58, 0));
    g.bonds.push(bond(c0 + 1, c0 + 2, 2));
    g.atoms.push(templateAtom('O', ox + 72 * dir + 58 * dir, oy, 0, '-'));
    g.bonds.push(bond(c0 + 1, c0 + 3, 1));
  }

  function benzeneTemplate() {
    var g = buildStructure({ type: 'skeleton', skeleton: 'benzene' });
    g.width = 560;
    g.height = 360;
    return { atoms: g.atoms, bonds: g.bonds, mode: 'expanded', width: 560, height: 360 };
  }

  function addAtomVia(g, parent, el, h, distance, charge) {
    var d = chooseDirection(g, parent, distance);
    var idx = g.atoms.length;
    g.atoms.push(templateAtom(el, d.x, d.y, h, charge));
    g.bonds.push(bond(parent, idx, 1));
    return idx;
  }

  function phenylTemplate(cx, cy, r) {
    var g = ringTemplate(6, cx, cy, r, 0, ['C', 'C', 'C', 'C', 'C', 'C'], [0, 1, 1, 1, 1, 1], [1, 2, 1, 2, 1, 2]);
    g.width = 620;
    g.height = 420;
    return g;
  }

  function addAminoAcidChain(g, fromAtom, ester) {
    var ch2 = addAtomVia(g, fromAtom, 'C', 2, 72);
    var ch = addAtomVia(g, ch2, 'C', 1, 72);
    addAtomVia(g, ch, 'N', 2, 64);
    var c = addAtomVia(g, ch, 'C', 0, 72);
    var o1 = addAtomVia(g, c, 'O', 0, 56);
    g.bonds[g.bonds.length - 1].order = 2;
    if (ester) {
      var o2 = addAtomVia(g, c, 'O', 0, 56);
      var ch3 = addAtomVia(g, o2, 'C', 3, 56);
      return ch3;
    }
    addAtomVia(g, c, 'O', 1, 56);
    return c;
  }

  function addHydroxyPhenyl(g, at, cx, cy) {
    var a = g.atoms[at];
    a.h = 0;
    var ux = (a.x - cx) / Math.max(1, Math.hypot(a.x - cx, a.y - cy));
    var uy = (a.y - cy) / Math.max(1, Math.hypot(a.x - cx, a.y - cy));
    var oi = g.atoms.length;
    g.atoms.push(templateAtom('O', a.x + ux * 70, a.y + uy * 70, 1));
    g.bonds.push(bond(at, oi, 1));
  }

  // 高校基礎アミノ酸のうち、芳香環を含むものを明示templateで描く。
  function addHydroxyPhenyl(g, at, cx, cy) {
    var a = g.atoms[at];
    a.h = 0;
    var ux = (a.x - cx) / Math.max(1, Math.hypot(a.x - cx, a.y - cy));
    var uy = (a.y - cy) / Math.max(1, Math.hypot(a.x - cx, a.y - cy));
    var oi = g.atoms.length;
    g.atoms.push(templateAtom('O', a.x + ux * 70, a.y + uy * 70, 1));
    g.bonds.push(bond(at, oi, 1));
  }

  function mergeTemplate(g, tpl, dx, dy) {
    var base = g.atoms.length;
    tpl.atoms.forEach(function (a) {
      g.atoms.push(templateAtom(a.el, a.x + dx, a.y + dy, a.h, a.charge, a.ion));
    });
    tpl.bonds.forEach(function (b) {
      g.bonds.push(bond(b.a + base, b.b + base, b.order));
    });
    return base;
  }

  // 高校基礎の複合芳香族・ペプチドを明示templateで描く。
  var CURATED_GRAPHS = {
    'cumene-hydroperoxide': function () {
      var g = benzeneTemplate();
      g.atoms[0].h = 0;
      var a = g.atoms[0];
      var ci = addAtomVia(g, 0, 'C', 0, 78);
      addAtomVia(g, ci, 'C', 3, 60);
      addAtomVia(g, ci, 'C', 3, 60);
      var o1 = addAtomVia(g, ci, 'O', 0, 60);
      var o2 = addAtomVia(g, o1, 'O', 0, 58);
      addAtomVia(g, o2, 'H', 0, 44);
      g.width = 650;
      g.height = 420;
      return g;
    },
    'bisphenol-a': function () {
      var g = { atoms: [], bonds: [], mode: 'expanded', width: 820, height: 420 };
      var ringA = ringTemplate(6, 150, 190, 72, 0, ['C', 'C', 'C', 'C', 'C', 'C'], [0, 1, 1, 0, 1, 1], [1, 2, 1, 2, 1, 2]);
      var baseA = mergeTemplate(g, ringA, 0, 0);
      var ringB = ringTemplate(6, 650, 190, 72, Math.PI, ['C', 'C', 'C', 'C', 'C', 'C'], [0, 1, 1, 0, 1, 1], [1, 2, 1, 2, 1, 2]);
      var baseB = mergeTemplate(g, ringB, 0, 0);
      var central = g.atoms.length;
      g.atoms.push(templateAtom('C', 400, 190, 0));
      g.bonds.push(bond(baseA + 0, central, 1));
      g.bonds.push(bond(baseB + 0, central, 1));
      addAtomVia(g, central, 'C', 3, 62);
      addAtomVia(g, central, 'C', 3, 62);
      var oa = g.atoms.length;
      g.atoms.push(templateAtom('O', 8, 190, 1));
      g.bonds.push(bond(baseA + 3, oa, 1));
      var ob = g.atoms.length;
      g.atoms.push(templateAtom('O', 792, 190, 1));
      g.bonds.push(bond(baseB + 3, ob, 1));
      return g;
    },
    aspartame: function () {
      var g = { atoms: [], bonds: [], mode: 'expanded', width: 960, height: 580 };
      function A(el, x, y, h) { g.atoms.push(templateAtom(el, x, y, h)); return g.atoms.length - 1; }
      // Asp: HOOC-CH2-CH(NH2)-C(=O)- (α-carboxylがペプチド結合、側鎖CH2COOHは遊離)
      var c0 = A('C', 50, 240, 0), o1 = A('O', 50, 170, 0), o2 = A('O', 110, 170, 1);
      g.bonds.push(bond(c0, o1, 2)); g.bonds.push(bond(c0, o2, 1));
      var cSide = A('C', 120, 240, 2), ca1 = A('C', 180, 240, 1), n1 = A('N', 180, 170, 2);
      g.bonds.push(bond(c0, cSide, 1)); g.bonds.push(bond(cSide, ca1, 1)); g.bonds.push(bond(ca1, n1, 1));
      var c3 = A('C', 245, 240, 0), o3 = A('O', 245, 170, 0), n2 = A('N', 310, 240, 1);
      g.bonds.push(bond(ca1, c3, 1)); g.bonds.push(bond(c3, o3, 2)); g.bonds.push(bond(c3, n2, 1));
      // Phe: -NH-CH(CH2Ph)-C(=O)-OCH3
      var ca2 = A('C', 375, 240, 1), c4 = A('C', 440, 300, 2), c5 = A('C', 440, 240, 0);
      g.bonds.push(bond(n2, ca2, 1)); g.bonds.push(bond(ca2, c4, 1)); g.bonds.push(bond(ca2, c5, 1));
      var o4 = A('O', 440, 170, 0), o5 = A('O', 500, 240, 0), c6 = A('C', 565, 240, 3);
      g.bonds.push(bond(c5, o4, 2)); g.bonds.push(bond(c5, o5, 1)); g.bonds.push(bond(o5, c6, 1));
      var ring = ringTemplate(6, 440, 430, 76, -Math.PI / 2, ['C', 'C', 'C', 'C', 'C', 'C'], [0, 1, 1, 1, 1, 1], [1, 2, 1, 2, 1, 2]);
      var base = mergeTemplate(g, ring, 0, 0);
      g.bonds.push(bond(c4, base + 0, 1));
      return g;
    },
    phenylalanine: function () {
      var g = phenylTemplate(230, 190, 76);
      addAminoAcidChain(g, 0, false);
      return g;
    },
    tyrosine: function () {
      var g = phenylTemplate(230, 190, 76);
      addHydroxyPhenyl(g, 3, 230, 190);
      addAminoAcidChain(g, 0, false);
      return g;
    },
    histidine: function () {
      // imidazole: N0H-C1(=N2)-C3=C4-N0, C1 に側鎖
      var g = ringTemplate(5, 220, 180, 72, 0, ['N', 'C', 'N', 'C', 'C'], [1, 0, 0, 1, 1], [1, 2, 1, 2, 1]);
      g.width = 620;
      g.height = 420;
      addAminoAcidChain(g, 1, false);
      return g;
    },
    tryptophan: function () {
      // indole: benzene 0-5 + pyrrole 0-N6-C7=C8-5
      var g = ringTemplate(6, 240, 180, 76, 0, ['C', 'C', 'C', 'C', 'C', 'C'], [0, 1, 1, 1, 1, 0], [2, 1, 2, 1, 2, 1]);
      var n6 = g.atoms.length;
      g.atoms.push(templateAtom('N', 395, 180, 1));
      var c7 = g.atoms.length;
      g.atoms.push(templateAtom('C', 370, 110, 1));
      var c8 = g.atoms.length;
      g.atoms.push(templateAtom('C', 330, 140, 1));
      g.bonds.push(bond(0, n6, 1));
      g.bonds.push(bond(n6, c7, 1));
      g.bonds.push(bond(c7, c8, 2));
      g.bonds.push(bond(c8, 5, 1));
      g.atoms[c7].h = 0;
      addAminoAcidChain(g, c7, false);
      g.width = 700;
      g.height = 480;
      return g;
    },
    sds: function () {
      var g = { atoms: [], bonds: [], mode: 'expanded', width: 900, height: 300 };
      var x = 40, y = 160;
      for (var i = 0; i < 12; i++) {
        g.atoms.push(templateAtom('C', x, y, i === 0 ? 3 : 2));
        if (i > 0) g.bonds.push(bond(i - 1, i, 1));
        x += 52;
        y += (i % 2 === 0 ? -24 : 24);
      }
      var oi = g.atoms.length;
      g.atoms.push(templateAtom('O', x, y, 0));
      g.bonds.push(bond(11, oi, 1));
      var si = g.atoms.length;
      g.atoms.push(templateAtom('S', x + 60, y, 0));
      g.bonds.push(bond(oi, si, 1));
      g.atoms.push(templateAtom('O', x + 60, y - 58, 0));
      g.bonds.push(bond(si, si + 1, 2));
      g.atoms.push(templateAtom('O', x + 60, y + 58, 0));
      g.bonds.push(bond(si, si + 2, 2));
      g.atoms.push(templateAtom('O', x + 120, y, 0, '-'));
      g.bonds.push(bond(si, si + 3, 1));
      addSodium(g, x + 220, y + 60);
      return g;
    },
    'sodium-oleate': function () {
      var g = saturatedChainCarboxylate(17, 50, 160);
      // C9=C10 のシス二重結合（カルボキシル基側から8番目）
      var b = g.bonds.filter(function (x) { return x.a === 7 && x.b === 8; })[0];
      if (b) b.order = 2;
      g.atoms[7].h = 1;
      g.atoms[8].h = 1;
      g.width = 1200;
      return g;
    },
    proline: function () {
      var g = ringTemplate(5, 210, 170, 72, -Math.PI / 2, ['N', 'C', 'C', 'C', 'C'], [1, 1, 2, 2, 2]);
      addCarboxylate(g, 1, 1, 0.15);
      g.atoms[0].h = 1;
      g.width = 480;
      g.height = 360;
      return g;
    },
    caprolactam: function () {
      var g = ringTemplate(7, 230, 170, 82, -Math.PI / 2, ['N', 'C', 'C', 'C', 'C', 'C', 'C'], [1, 0, 2, 2, 2, 2, 2]);
      var a = g.atoms[1];
      var oi = g.atoms.length;
      g.atoms.push(templateAtom('O', a.x, a.y - 66, 0));
      g.bonds.push(bond(1, oi, 2));
      g.width = 420;
      g.height = 380;
      return g;
    },
    melamine: function () {
      var g = ringTemplate(6, 220, 160, 76, 0, ['C', 'N', 'C', 'N', 'C', 'N'], [0, 0, 0, 0, 0, 0], [2, 1, 2, 1, 2, 1]);
      [0, 2, 4].forEach(function (idx) {
        var a = g.atoms[idx];
        var ux = (a.x - 220) / 76, uy = (a.y - 160) / 76;
        var n = g.atoms.length;
        g.atoms.push(templateAtom('N', a.x + ux * 58, a.y + uy * 58, 2));
        g.bonds.push(bond(idx, n, 1));
      });
      g.width = 480;
      g.height = 380;
      return g;
    },
    epichlorohydrin: function () {
      var g = ringTemplate(3, 200, 170, 74, -Math.PI / 2, ['C', 'C', 'O'], [2, 1, 0]);
      var c1 = g.atoms[1];
      var c3 = g.atoms.length;
      g.atoms.push(templateAtom('C', c1.x + 96, c1.y + 30, 2));
      g.bonds.push(bond(1, c3, 1));
      g.atoms.push(templateAtom('Cl', c1.x + 160, c1.y + 60, 0));
      g.bonds.push(bond(c3, c3 + 1, 1));
      g.width = 460;
      g.height = 340;
      return g;
    },
    'sodium-methoxide': function () {
      var g = { atoms: [templateAtom('C', 140, 160, 3), templateAtom('O', 220, 160, 0, '-')], bonds: [bond(0, 1, 1)], mode: 'expanded', width: 460, height: 260 };
      addSodium(g, 350, 160);
      return g;
    },
    'sodium-ethoxide': function () {
      var g = { atoms: [templateAtom('C', 90, 160, 3), templateAtom('C', 165, 160, 2), templateAtom('O', 240, 160, 0, '-')], bonds: [bond(0, 1, 1), bond(1, 2, 1)], mode: 'expanded', width: 470, height: 260 };
      addSodium(g, 370, 160);
      return g;
    },
    'sodium-acetate': function () {
      var g = { atoms: [], bonds: [], mode: 'expanded', width: 520, height: 300 };
      acetateFragment(g, 80, 160, false);
      addSodium(g, 380, 160);
      return g;
    },
    'sodium-benzoate': function () {
      var g = benzeneTemplate();
      g.atoms[0].h = 0;
      var a = g.atoms[0];
      var ci = g.atoms.length;
      g.atoms.push(templateAtom('C', a.x + 78, a.y, 0));
      g.bonds.push(bond(0, ci, 1));
      g.atoms.push(templateAtom('O', a.x + 78, a.y - 58, 0));
      g.bonds.push(bond(ci, ci + 1, 2));
      g.atoms.push(templateAtom('O', a.x + 78, a.y + 58, 0, '-'));
      g.bonds.push(bond(ci, ci + 2, 1));
      addSodium(g, a.x + 210, a.y + 80);
      g.width = 640;
      return g;
    },
    'sodium-phenoxide': function () {
      var g = benzeneTemplate();
      g.atoms[0].h = 0;
      var a = g.atoms[0];
      g.atoms.push(templateAtom('O', a.x + 72, a.y, 0, '-'));
      g.bonds.push(bond(0, g.atoms.length - 1, 1));
      addSodium(g, a.x + 190, a.y + 70);
      g.width = 600;
      return g;
    },
    'sodium-benzenesulfonate': function () {
      var g = benzeneTemplate();
      g.atoms[0].h = 0;
      var a = g.atoms[0];
      var si = g.atoms.length;
      g.atoms.push(templateAtom('S', a.x + 78, a.y, 0));
      g.bonds.push(bond(0, si, 1));
      g.atoms.push(templateAtom('O', a.x + 78, a.y - 58, 0));
      g.bonds.push(bond(si, si + 1, 2));
      g.atoms.push(templateAtom('O', a.x + 78, a.y + 58, 0));
      g.bonds.push(bond(si, si + 2, 2));
      g.atoms.push(templateAtom('O', a.x + 138, a.y, 0, '-'));
      g.bonds.push(bond(si, si + 3, 1));
      addSodium(g, a.x + 250, a.y + 70);
      g.width = 680;
      return g;
    },
    'calcium-acetate': function () {
      var g = { atoms: [], bonds: [], mode: 'expanded', width: 620, height: 360 };
      acetateFragment(g, 40, 110, false);
      acetateFragment(g, 40, 250, false);
      g.atoms.push(templateAtom('Ca', 420, 180, 0, '2+', true));
      return g;
    },
    'lead-ii-acetate': function () {
      var g = { atoms: [], bonds: [], mode: 'expanded', width: 620, height: 360 };
      acetateFragment(g, 40, 110, false);
      acetateFragment(g, 40, 250, false);
      g.atoms.push(templateAtom('Pb', 420, 180, 0, '2+', true));
      return g;
    },
    'silver-acetylide': function () {
      var g = { atoms: [templateAtom('Ag', 90, 160, 0, '+', true), templateAtom('C', 200, 160, 0, '-'), templateAtom('C', 280, 160, 0, '-'), templateAtom('Ag', 390, 160, 0, '+', true)], bonds: [bond(1, 2, 3)], mode: 'expanded', width: 500, height: 260 };
      return g;
    },
    'copper-i-acetylide': function () {
      var g = { atoms: [templateAtom('Cu', 90, 160, 0, '+', true), templateAtom('C', 200, 160, 0, '-'), templateAtom('C', 280, 160, 0, '-'), templateAtom('Cu', 390, 160, 0, '+', true)], bonds: [bond(1, 2, 3)], mode: 'expanded', width: 500, height: 260 };
      return g;
    },
    'sodium-laurate': function () { return saturatedChainCarboxylate(11, 60, 160); },
    'sodium-palmitate': function () { return saturatedChainCarboxylate(15, 60, 160); },
    'sodium-stearate': function () { return saturatedChainCarboxylate(17, 60, 160); }
  };

  function curatedGraphFor(compound) {
    var builder = CURATED_GRAPHS[compound.id];
    if (!builder) return null;
    try {
      var g = builder();
      if (!g || !g.atoms || !g.atoms.length) return null;
      if (formulaOfGraph(g) !== compound.formula) return null;
      return g;
    } catch (e) {
      return null;
    }
  }

  var condensedGraphCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;


  function condensedGraphFor(compound) {
    var spec = compound && compound.structure;
    if (!spec || spec.type !== 'condensed' || compound.formulaVariable) return { graph: null, reason: '可変組成のため簡略式で表示' };
    if (condensedGraphCache && condensedGraphCache.has(spec)) return condensedGraphCache.get(spec);
    var result;
    var curated = curatedGraphFor(compound);
    if (curated) {
      var cv = checkValence(curated);
      if (cv.ok) {
        result = { graph: curated, reason: '' };
        if (condensedGraphCache) condensedGraphCache.set(spec, result);
        return result;
      }
      result = { graph: null, reason: '派生構造の結合価検証に失敗したため簡略式で表示' };
      if (condensedGraphCache) condensedGraphCache.set(spec, result);
      return result;
    }
    var lines = spec.lines || [];
    var chem = null;
    for (var i = 0; i < lines.length; i++) {
      if (!/(シス|トランス)形/.test(lines[i])) { chem = lines[i]; break; }
    }
    if (!chem) {
      result = { graph: null, reason: 'シス/トランス表記を保つため簡略式で表示' };
    } else if (/Na|Ag|Cu|Pb|Ca|Mg|Zn|Fe|Al|Ba|Li|Sn/.test(compound.formula || '')) {
      result = { graph: null, reason: '長鎖・複合塩/染料のため簡略式で表示' };
    } else {
      try {
        var text = normalizeCondensedText(chem).replace(/（[^）]*）/g, '').replace(/\([^A-Za-z0-9()]*\)/g, '');
        var parsed = parseCondensedFragment(text, { i: 0 }, false);
        var graph = {
          atoms: parsed.atoms,
          bonds: parsed.bonds,
          mode: 'expanded',
          width: 440,
          height: 320,
          _condensed: true
        };
        layoutCondensedGraph(graph);
        if (formulaOfGraph(graph) !== compound.formula) {
          result = { graph: null, reason: '簡略式の原子数が分子式と一致しないため簡略式で表示' };
        } else if (graph.atoms.length + graph.atoms.reduce(function (s, a) { return s + (a.h || 0); }, 0) > 40) {
          result = { graph: null, reason: '原子数が多いため簡略式で表示', graphTooLarge: graph };
        } else {
          var gv = checkValence(graph);
          if (!gv.ok) {
            result = { graph: null, reason: '派生構造の結合価検証に失敗したため簡略式で表示' };
          } else {
            result = { graph: graph, reason: '' };
          }
        }
      } catch (e) {
        result = { graph: null, reason: e.message || '結合情報を確定できないため簡略式で表示' };
      }
    }
    if (condensedGraphCache) condensedGraphCache.set(spec, result);
    return result;
  }

  var GRAPH_ATOM_LIMIT = 40;
  var FIGURE_EXCEPTION_REASONS = {
    polymer: '繰り返し単位と一般式で表す重合体のため、簡略表示です。',
    schematic: '模式図・異性体総称のため、簡略表示です。',
    projection: '立体配置を保つ投影式のため、構造式は投影式で表示します。',
    triglyceride: '脂肪酸鎖を簡略化した油脂のため、簡略表示です。',
    'atom-limit': '原子数が多い複雑な構造のため、水素を省略した骨格図で表示します。',
    'condensed-only': '簡略式の明示結合から構造式を作れないため、簡略式で表示します。'
  };

  var GRAPH_CONDENSED_TEXT = {
    methane: 'CH₄', ethane: 'CH₃CH₃', propane: 'CH₃CH₂CH₃', butane: 'CH₃CH₂CH₂CH₃',
    isobutane: 'CH₃CH(CH₃)CH₃', ethene: 'CH₂=CH₂', propene: 'CH₃CH=CH₂',
    ethyne: 'HC≡CH', propyne: 'CH₃C≡CH', methanol: 'CH₃OH', ethanol: 'CH₃CH₂OH',
    'propan-1-ol': 'CH₃CH₂CH₂OH', 'propan-2-ol': 'CH₃CH(OH)CH₃',
    'dimethyl-ether': 'CH₃OCH₃', methoxyethane: 'CH₃OCH₂CH₃',
    formaldehyde: 'HCHO', ethanal: 'CH₃CHO', acetone: 'CH₃COCH₃',
    'formic-acid': 'HCOOH', 'acetic-acid': 'CH₃COOH', 'methyl-formate': 'HCOOCH₃',
    'methyl-acetate': 'CH₃COOCH₃', methylamine: 'CH₃NH₂', ethylamine: 'CH₃CH₂NH₂',
    dimethylamine: 'CH₃NHCH₃', trimethylamine: 'N(CH₃)₃', chloromethane: 'CH₃Cl',
    chloroethane: 'CH₃CH₂Cl', bromoethane: 'CH₃CH₂Br', acetonitrile: 'CH₃C≡N',
    benzene: 'C₆H₆', phenol: 'C₆H₅OH', 'phenoxide-ion': 'C₆H₅−O⁻', toluene: 'C₆H₅CH₃',
    'benzoic-acid': 'C₆H₅COOH', aniline: 'C₆H₅NH₂',
    benzaldehyde: 'C₆H₅CHO', nitrobenzene: 'C₆H₅NO₂', chlorobenzene: 'C₆H₅Cl',
    benzonitrile: 'C₆H₅CN',
    'ethylene-glycol': 'HOCH₂CH₂OH', glycerol: 'HOCH₂CH(OH)CH₂OH',
    'propylene-glycol': 'CH₃CH(OH)CH₂OH',
    phenylalanine: 'C₆H₅CH₂CH(NH₂)COOH', tyrosine: 'HOC₆H₄CH₂CH(NH₂)COOH',
    histidine: 'C₃H₃N₂CH₂CH(NH₂)COOH', tryptophan: 'C₈H₆NCH₂CH(NH₂)COOH',
    naphthalene: 'C₁₀H₈', cyclopropane: 'C₃H₆', cyclobutane: 'C₄H₈',
    cyclopentane: 'C₅H₁₀', cyclohexane: 'C₆H₁₂', cyclohexene: 'C₆H₁₀',
    anthracene: 'C₁₄H₁₀', chlorocyclohexane: 'C₆H₁₁Cl', inositol: 'C₆H₁₂O₆',
    pentane: 'CH₃CH₂CH₂CH₂CH₃', isopentane: '(CH₃)₂CHCH₂CH₃', neopentane: 'C(CH₃)₄',
    'but-1-ene': 'CH₂=CHCH₂CH₃', 'but-2-ene': 'CH₃CH=CHCH₃', isobutene: '(CH₃)₂C=CH₂',
    'but-1-yne': 'HC≡CCH₂CH₃', 'but-2-yne': 'CH₃C≡CCH₃',
    'butan-1-ol': 'CH₃CH₂CH₂CH₂OH', 'butan-2-ol': 'CH₃CH(OH)CH₂CH₃',
    '2-methylpropan-1-ol': '(CH₃)₂CHCH₂OH', '2-methylpropan-2-ol': '(CH₃)₃COH',
    'propionic-acid': 'CH₃CH₂COOH', 'butanoic-acid': 'CH₃CH₂CH₂COOH',
    '2-methylpropanoic-acid': '(CH₃)₂CHCOOH', 'pentanoic-acid': 'CH₃CH₂CH₂CH₂COOH',
    '2-methylbutanoic-acid': 'CH₃CH₂CH(CH₃)COOH', '3-methylbutanoic-acid': '(CH₃)₂CHCH₂COOH',
    '2,2-dimethylpropanoic-acid': '(CH₃)₃CCOOH',
    propanal: 'CH₃CH₂CHO', butanal: 'CH₃CH₂CH₂CHO', '2-methylpropanal': '(CH₃)₂CHCHO',
    pentanal: 'CH₃CH₂CH₂CH₂CHO', '2-methylbutanal': 'CH₃CH₂CH(CH₃)CHO',
    '3-methylbutanal': '(CH₃)₂CHCH₂CHO', '2,2-dimethylpropanal': '(CH₃)₃CCHO',
    '1-chloropropane': 'CH₃CH₂CH₂Cl', '2-chloropropane': '(CH₃)₂CHCl',
    '1-chlorobutane': 'CH₃CH₂CH₂CH₂Cl', '2-chlorobutane': 'CH₃CH₂CH(Cl)CH₃',
    '1-chloro-2-methylpropane': '(CH₃)₂CHCH₂Cl', '2-chloro-2-methylpropane': '(CH₃)₃CCl',
    'diethyl-ether': 'CH₃CH₂OCH₂CH₃', 'ethyl-acetate': 'CH₃COOCH₂CH₃',
    butanone: 'CH₃COCH₂CH₃', 'oxalic-acid': 'HOOCCOOH', glycine: 'H₂NCH₂COOH',
    'dimethyl-oxalate': 'CH₃OOC—COOCH₃', 'diphenyl-oxalate': 'C₆H₅OOC—COOC₆H₅',
    '1,3-dibromopropane': 'BrCH₂CH₂CH₂Br', diethylenetriamine: 'H₂NCH₂CH₂NHCH₂CH₂NH₂',
    alanine: 'H₂NCH(CH₃)COOH',
    'pentan-1-ol': 'CH₃CH₂CH₂CH₂CH₂OH', 'pentan-2-ol': 'CH₃CH₂CH₂CH(OH)CH₃',
    'pentan-3-ol': 'CH₃CH₂CH(OH)CH₂CH₃',
    '2-methylbutan-1-ol': 'CH₃CH₂CH(CH₃)CH₂OH', '2-methylbutan-2-ol': 'CH₃CH₂C(CH₃)(OH)CH₃',
    '3-methylbutan-1-ol': '(CH₃)₂CHCH₂CH₂OH', '3-methylbutan-2-ol': '(CH₃)₂CHCH(OH)CH₃',
    '2,2-dimethylpropan-1-ol': '(CH₃)₃CCH₂OH',
    hexane: 'CH₃CH₂CH₂CH₂CH₂CH₃', '2-methylpentane': 'CH₃CH(CH₃)CH₂CH₂CH₃',
    '3-methylpentane': 'CH₃CH₂CH(CH₃)CH₂CH₃', '2,2-dimethylbutane': '(CH₃)₃CCH₂CH₃',
    '2,3-dimethylbutane': '(CH₃)₂CHCH(CH₃)₂',
    dichloromethane: 'CH₂Cl₂', chloroform: 'CHCl₃', 'carbon-tetrachloride': 'CCl₄', iodoform: 'CHI₃',
    'acetic-anhydride': '(CH₃CO)₂O', 'adipoyl-chloride': 'ClOC(CH₂)₄COCl',
    '6-aminohexanoic-acid': 'H₂N(CH₂)₅COOH',
    '1-naphthol': 'C₁₀H₇OH', '2-naphthol': 'C₁₀H₇OH',
    'p-divinylbenzene': 'C₆H₄(CH=CH₂)₂', guaiacol: 'C₆H₄(OH)(OCH₃)',
    'n,n-dimethylaniline': 'C₆H₅N(CH₃)₂', 'sulfanilic-acid': 'C₆H₄(SO₃H)(NH₂)',
    '2-nitrobenzaldehyde': 'C₆H₄(CHO)(NO₂)', acetaminophen: 'C₆H₄(OH)(NHCOCH₃)',
    sulfanilamide: 'C₆H₄(SO₂NH₂)(NH₂)', 'p-hydroxybenzoic-acid': 'C₆H₄(COOH)(OH)',
    'm-hydroxybenzoic-acid': 'C₆H₄(COOH)(OH)', '2,4,6-tribromophenol': 'C₆H₂(OH)(Br)₃'
  };

  function graphAtomCount(g) {
    return g.atoms.length + g.atoms.reduce(function (s, a) { return s + (a.h || 0); }, 0);
  }

  function graphRingCountText(g) {
    var n = g.atoms.length;
    var adj = g.atoms.map(function () { return []; });
    g.bonds.forEach(function (b) { adj[b.a].push(b.b); adj[b.b].push(b.a); });
    var seen = new Array(n);
    var components = 0;
    for (var i = 0; i < n; i++) {
      if (seen[i]) continue;
      components++;
      var stack = [i];
      seen[i] = true;
      while (stack.length) {
        var v = stack.pop();
        adj[v].forEach(function (w) { if (!seen[w]) { seen[w] = true; stack.push(w); } });
      }
    }
    return g.bonds.length - g.atoms.length + components;
  }

  var IONIC_TEXT = {
    'sodium-acetate': 'CH₃COO⁻Na⁺',
    'sodium-methoxide': 'CH₃O⁻Na⁺',
    'sodium-ethoxide': 'C₂H₅O⁻Na⁺',
    'sodium-phenoxide': 'C₆H₅O⁻Na⁺',
    'sodium-benzoate': 'C₆H₅COO⁻Na⁺',
    'sodium-laurate': 'C₁₁H₂₃COO⁻Na⁺',
    'sodium-benzenesulfonate': 'C₆H₅SO₃⁻Na⁺',
    'calcium-acetate': 'Ca²⁺(CH₃COO⁻)₂',
    'lead-ii-acetate': 'Pb²⁺(CH₃COO⁻)₂',
    'silver-acetylide': '[C≡C]²⁻·2Ag⁺',
    'copper-i-acetylide': '[C≡C]²⁻·2Cu⁺'
  };

  var PROJECTION_TEXT = {
    glucose: 'CHO[CH(OH)]₄CH₂OH',
    fructose: 'CH₂OH-C(=O)-[CH(OH)]₃-CH₂OH',
    galactose: 'CHO[CH(OH)]₄CH₂OH',
    mannose: 'CHO[CH(OH)]₄CH₂OH',
    ribose: 'CHO[CH(OH)]₃CH₂OH',
    deoxyribose: 'CHOCH₂CH(OH)CH(OH)CH₂OH'
  };

  var SUGAR_CODE = {
    sucrose: 'Glc(α1→2)Fru',
    maltose: 'Glc(α1→4)Glc',
    lactose: 'Gal(β1→4)Glc',
    cellobiose: 'Glc(β1→4)Glc',
    trehalose: 'Glc(α1→1)Glc',
    isomaltose: 'Glc(α1→6)Glc',
    starch: '(C₆H₁₀O₅)n',
    cellulose: '(C₆H₁₀O₅)n',
    glycogen: '(C₆H₁₀O₅)n',
    amylopectin: '(C₆H₁₀O₅)n',
    dextrin: '(C₆H₁₀O₅)n',
    chitin: '(C₈H₁₃NO₅)n'
  };

  var TEXT_NOTES = {
    aspartame: '2Dの連結のみを示します。ペプチドの立体配置（L/D）は保証しません。',
    'cumene-hydroperoxide': '',
    'bisphenol-a': ''
  };

  function condensedTextFor(compound) {
    if (!compound) return { text: '', note: '' };
    var spec = compound.structure;
    if (!spec) return { text: '', note: '' };
    if (IONIC_TEXT[compound.id]) return { text: IONIC_TEXT[compound.id], note: '対イオンはイオンとして表示しています。' };
    if (spec.type === 'projection' || (compound.figures && compound.figures.length > 1)) {
      return {
        text: PROJECTION_TEXT[compound.id] || '',
        note: '立体配置は図（投影式）が正本です。文字の縮合式は2Dの連結だけを示し、α/β・フィッシャー/ハースの立体を保証しません。'
      };
    }
    if (spec.type === 'condensed') {
      var lines = (spec.lines || []).slice();
      return { text: lines.join(' ') || compound.formulaDisplay || '', note: TEXT_NOTES[compound.id] || '' };
    }
    if (spec.type === 'ring-sub' && spec.subs && spec.subs.length) {
      var totalSubs = spec.subs.length;
      var hCount = Math.max(0, 6 - totalSubs);
      var ringText = 'C6' + (hCount ? 'H' + hCount : '');
      spec.subs.forEach(function (s) { ringText += '(' + s.label + ')'; });
      return { text: ringText, note: '' };
    }
    if (spec.type === 'polymer') {
      var unit = spec.unit || spec.formulaReference || spec.unitFormula || compound.formulaDisplay || '';
      return { text: '繰返単位: ' + unit, note: '重合度 n は特定しません。' };
    }
    if (spec.type === 'triglyceride') {
      return { text: '', note: 'トリグリセリドの脂肪酸鎖は図を参照してください。' };
    }
    if (spec.type === 'schematic' && SUGAR_CODE[compound.id]) {
      return { text: SUGAR_CODE[compound.id], note: '糖の結合略記・一般式です。立体配置は図を参照してください。' };
    }
    if (spec.type === 'schematic') {
      return { text: '', note: '模式図・異性体総称のため、一意の縮合式はありません。' };
    }
    if (GRAPH_CONDENSED_TEXT[compound.id]) {
      return { text: GRAPH_CONDENSED_TEXT[compound.id], note: '' };
    }
    if (isGraphSpec(spec)) {
      var g = buildStructure(spec);
      if (graphRingCountText(g) > 0) {
        return { text: '', note: '環式のため、簡略構造式は図の接続を参照してください。' };
      }
      return { text: '', note: '簡略構造式は図の接続を参照してください。' };
    }
    return { text: '', note: '簡略構造式は図を参照してください。' };
  }


  function graphAsSpec(g, mode, skeletal) {
    return {
      type: 'custom',
      atoms: g.atoms.map(function (a) { return Object.assign({}, a); }),
      bonds: g.bonds.map(function (b) { return Object.assign({}, b); }),
      mode: mode,
      skeletal: !!skeletal,
      width: g.width || 440,
      height: g.height || 320
    };
  }

  var RING_SUB_GROUP_KEY = { OH: 'oh', CH3: 'ch3', COOH: 'cooh', NH2: 'nh2', CHO: 'cho', NO2: 'no2', Cl: 'cl', Br: 'br', I: 'i', CN: 'cn' };

  // ring-sub の subs は「環のどの位置にどの置換基があるか」を明示した
  // 検証済みmetadata。対応する置換基だけ、ベンゼン骨格から原子グラフを組む。
  function ringSubGraph(spec, compound) {
    if (!spec || spec.type !== 'ring-sub' || !spec.subs || !spec.subs.length) return null;
    var g;
    try { g = buildStructure({ type: 'skeleton', skeleton: 'benzene' }); } catch (e) { return null; }
    var ringCenter = centroidOf(g);
    var plan = [];
    for (var i = 0; i < spec.subs.length; i++) {
      var sub = spec.subs[i];
      var raw = normalizeCondensedText(sub.label).replace(/[—–−\s]/g, '');
      if (/[+\-⁺⁻]/.test(raw) || /Na|Ag|Cu|Pb|Ca|Mg|Zn|Fe|Al|Ba|Li|Sn/.test(raw)) return null;
      var local;
      try {
        var frag = parseCondensedFragment(raw, { i: 0 }, false);
        if (!frag.atoms.length) return null;
        local = {
          atoms: frag.atoms.map(function (a) { return condensedAtom(a.el, a.h, a.charge); }),
          bonds: frag.bonds.map(function (b) { return { a: b.a, b: b.b, order: b.order }; }),
          width: 300,
          height: 300
        };
        layoutCondensedGraph(local);
      } catch (e) {
        return null;
      }
      plan.push({ at: sub.at, local: local, entry: frag.entry });
    }
    try {
      g.width = 520;
      g.height = 420;
      plan.forEach(function (item) {
        var ringAtom = g.atoms[item.at];
        if (!ringAtom || ringAtom.h < 1) throw new Error('置換位置に水素がありません');
        var outward = Math.atan2(ringAtom.y - ringCenter.y, ringAtom.x - ringCenter.x);
        var entry = item.local.atoms[item.entry];
        var sx = 0, sy = 0, n = 0;
        item.local.atoms.forEach(function (a, idx) {
          if (idx === item.entry) return;
          sx += a.x; sy += a.y; n++;
        });
        var dir = n ? Math.atan2(sy / n - entry.y, sx / n - entry.x) : outward;
        var baseRot = outward - dir;
        var baseRel = item.local.atoms.map(function (a) {
          var dx = a.x - entry.x, dy = a.y - entry.y;
          return {
            el: a.el,
            h: a.h,
            charge: a.charge || '',
            x: dx * Math.cos(baseRot) - dy * Math.sin(baseRot),
            y: dx * Math.sin(baseRot) + dy * Math.cos(baseRot)
          };
        });
        function segDist(px, py, ax, ay, bx, by) {
          var vx = bx - ax, vy = by - ay;
          var len2 = vx * vx + vy * vy;
          var t = len2 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
          t = Math.max(0, Math.min(1, t));
          var qx = ax + t * vx, qy = ay + t * vy;
          return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
        }
        function candidateClear(rotOffset, distance) {
          var ca = Math.cos(rotOffset), sa = Math.sin(rotOffset);
          var rel = baseRel.map(function (a) {
            return { x: a.x * ca - a.y * sa, y: a.x * sa + a.y * ca };
          });
          var ux2 = Math.cos(outward), uy2 = Math.sin(outward);
          var positions = rel.map(function (a) {
            return { x: ringAtom.x + distance * ux2 + a.x, y: ringAtom.y + distance * uy2 + a.y };
          });
          var i, j;
          for (i = 0; i < positions.length; i++) {
            for (j = 0; j < g.atoms.length; j++) {
              var dx2 = positions[i].x - g.atoms[j].x, dy2 = positions[i].y - g.atoms[j].y;
              if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < 30) return false;
            }
            for (j = 0; j < g.bonds.length; j++) {
              var b = g.bonds[j];
              var aa = g.atoms[b.a], bb = g.atoms[b.b];
              if (segDist(positions[i].x, positions[i].y, aa.x, aa.y, bb.x, bb.y) < 18) return false;
            }
          }
          // 新規結合の線分が、既存原子・新規原子の中心を貫通しないこと。
          var newBonds = item.local.bonds.map(function (b) { return { a: b.a, b: b.b }; });
          newBonds.push({ a: -1, b: item.entry });
          for (j = 0; j < newBonds.length; j++) {
            var nb = newBonds[j];
            var p1 = nb.a === -1 ? ringAtom : positions[nb.a];
            var p2 = positions[nb.b];
            for (i = 0; i < g.atoms.length; i++) {
              if (i === item.at) continue;
              if (segDist(g.atoms[i].x, g.atoms[i].y, p1.x, p1.y, p2.x, p2.y) < 18) return false;
            }
            for (i = 0; i < positions.length; i++) {
              if (i === nb.a || i === nb.b) continue;
              if (segDist(positions[i].x, positions[i].y, p1.x, p1.y, p2.x, p2.y) < 18) return false;
            }
          }
          return true;
        }
        var chosen = null;
        var offsets = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];
        for (var oi = 0; oi < offsets.length && !chosen; oi++) {
          for (var d = 90; d <= 300; d += 10) {
            if (candidateClear(offsets[oi] * Math.PI / 180, d)) { chosen = { offset: offsets[oi] * Math.PI / 180, distance: d }; break; }
          }
        }
        if (!chosen) throw new Error('置換基を配置できません');
        var ca2 = Math.cos(chosen.offset), sa2 = Math.sin(chosen.offset);
        var ux3 = Math.cos(outward), uy3 = Math.sin(outward);
        var tx = ringAtom.x + chosen.distance * ux3;
        var ty = ringAtom.y + chosen.distance * uy3;
        var base = g.atoms.length;
        baseRel.forEach(function (a) {
          var rx = a.x * ca2 - a.y * sa2;
          var ry = a.x * sa2 + a.y * ca2;
          g.atoms.push({ el: a.el, h: a.h, charge: a.charge, x: tx + rx, y: ty + ry });
        });
        item.local.bonds.forEach(function (b) {
          g.bonds.push({ a: b.a + base, b: b.b + base, order: b.order });
        });
        g.bonds.push({ a: item.at, b: base + item.entry, order: 1 });
        ringAtom.h -= 1;
      });
      if (formulaOfGraph(g) !== compound.formula) return null;
      var rv = checkValence(g);
      if (!rv.ok) return null;
    } catch (e) {
      return null;
    }
    return g;
  }

  // 1化合物について「構造式」と「簡略構造式」の表示計画を返す。
  // 例外は型・原子数・理由を明示し、全condensedを例外にしない。
  function figurePlan(compound) {
    if (!compound || !compound.structure) {
      return { mode: 'single', single: null, exception: { type: 'missing', reason: '構造データがありません' } };
    }
    var spec = compound.structure;
    if (compound.figures && compound.figures.length > 1) {
      return { mode: 'multi', figures: compound.figures, exception: { type: 'projection', reason: FIGURE_EXCEPTION_REASONS.projection } };
    }
    if (spec.type === 'polymer' || spec.type === 'schematic' || spec.type === 'projection' || spec.type === 'triglyceride') {
      return { mode: 'single', single: { structure: spec, caption: '構造式', note: FIGURE_EXCEPTION_REASONS[spec.type] }, exception: { type: spec.type, reason: FIGURE_EXCEPTION_REASONS[spec.type] } };
    }
    if (spec.type === 'ring-sub') {
      var ringGraph = ringSubGraph(spec, compound);
      if (ringGraph) {
        return {
          mode: 'dual',
          full: { structure: graphAsSpec(ringGraph, 'expanded', false), caption: '構造式', note: '' },
          simple: { structure: graphAsSpec(ringGraph, 'condensed', true), caption: '簡略構造式', note: '' },
          exception: null
        };
      }
      return {
        mode: 'dual',
        full: { structure: spec, caption: '構造式', note: '' },
        simple: { structure: spec, simple: true, caption: '簡略構造式', note: '' },
        exception: null
      };
    }
    if (isGraphSpec(spec)) {
      var g = buildStructure(spec);
      if (graphAtomCount(g) > GRAPH_ATOM_LIMIT) {
        return {
          mode: 'single',
          single: { structure: graphAsSpec(g, 'condensed', true), caption: '構造式（水素省略）', note: FIGURE_EXCEPTION_REASONS['atom-limit'] },
          exception: { type: 'atom-limit', reason: FIGURE_EXCEPTION_REASONS['atom-limit'], atomCount: graphAtomCount(g) }
        };
      }
      var condensed = GRAPH_CONDENSED_TEXT[compound.id] || '';
      return {
        mode: 'dual',
        full: { structure: graphAsSpec(g, 'expanded', false), caption: '構造式', note: '' },
        simple: { structure: graphAsSpec(g, 'condensed', true), caption: '簡略構造式', note: condensed ? '併記: ' + condensed : '' },
        exception: null
      };
    }
    if (spec.type === 'condensed') {
      var parsed = condensedGraphFor(compound);
      if (!parsed.graph) {
        var condensedType = parsed.graphTooLarge ? 'atom-limit'
          : (/シス|トランス/.test(parsed.reason) ? 'stereo' : 'complex');
        var condensedReason = parsed.graphTooLarge ? FIGURE_EXCEPTION_REASONS['atom-limit'] : parsed.reason;
        return {
          mode: 'single',
          single: { structure: spec, caption: '構造式（簡略式）', note: condensedReason },
          exception: { type: condensedType, reason: condensedReason, atomCount: parsed.graphTooLarge ? graphAtomCount(parsed.graphTooLarge) : null }
        };
      }
      if (graphAtomCount(parsed.graph) > GRAPH_ATOM_LIMIT) {
        return {
          mode: 'single',
          single: { structure: spec, caption: '構造式（簡略式）', note: FIGURE_EXCEPTION_REASONS['atom-limit'] },
          exception: { type: 'atom-limit', reason: FIGURE_EXCEPTION_REASONS['atom-limit'], atomCount: graphAtomCount(parsed.graph) }
        };
      }
      return {
        mode: 'dual',
        full: { structure: graphAsSpec(parsed.graph, 'expanded', false), caption: '構造式', note: '' },
        simple: { structure: spec, caption: '簡略構造式', note: '' },
        exception: null
      };
    }
    return {
      mode: 'single',
      single: { structure: spec, caption: '構造式', note: '' },
      exception: { type: 'unknown', reason: '構造式の表示形式を確認できないため簡略表示です。' }
    };
  }

  function figureAudit(compounds) {
    var out = { total: 0, dual: 0, single: 0, multi: 0, exceptions: [], byType: {} };
    Object.keys(compounds || {}).forEach(function (id) {
      var plan = figurePlan(compounds[id]);
      out.total++;
      if (plan.mode === 'dual') out.dual++;
      else if (plan.mode === 'multi') out.multi++;
      else out.single++;
      if (plan.exception) {
        out.exceptions.push({ id: id, type: plan.exception.type, reason: plan.exception.reason, atomCount: plan.exception.atomCount || null });
        out.byType[plan.exception.type] = (out.byType[plan.exception.type] || 0) + 1;
      }
    });
    return out;
  }


  // 長い簡略式は化学的な区切り（結合記号・括弧の終わり・次の炭素単位）で
  // 折り返す。文字の途中で切って結合の意味を曖昧にしない。
  function condensedBreakPoints(text) {
    var points = [];
    var depth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '(' || ch === '（') depth++;
      else if (ch === ')' || ch === '）') {
        depth = Math.max(0, depth - 1);
        if (depth === 0) points.push(i + 1);
      } else if (depth === 0 && /[=≡—–\-]/.test(ch)) {
        points.push(i + 1);
      } else if (depth === 0 && /[CNSOHF]/.test(ch) && i > 0 && /[₀-₉)）]/.test(text[i - 1])) {
        points.push(i);
      }
    }
    return points;
  }

  function wrapCondensedText(text, maxChars) {
    var source = String(text || '');
    var max = maxChars || 28;
    if (source.length <= max) return [source];
    var points = condensedBreakPoints(source);
    if (!points.length) return [source];
    points = points.filter(function (p) { return p > 0 && p < source.length; });
    points.push(source.length);
    var lines = [];
    var start = 0;
    while (start < source.length) {
      var limit = start + max;
      var cut = -1;
      for (var i = 0; i < points.length; i++) {
        if (points[i] <= start) continue;
        if (points[i] <= limit) cut = points[i];
        else break;
      }
      if (cut === -1) cut = points.filter(function (p) { return p > start; })[0] || source.length;
      lines.push(source.slice(start, cut));
      start = cut;
    }
    return lines;
  }

  // 化学式・簡略式を「化学単位の区切り」で折り返せるようにする。
  // 文字列そのものは変えない（ゼロ幅スペースを挿入するだけ）。
  // - 結合記号の直後
  // - 添字（数字・ₓᵧᵣ）の直後で、次が元素記号か括弧のとき
  // - 閉じ括弧の直後で、次が元素記号・括弧のとき
  // これにより CH₃(CH₂)₁₈CH₃ は CH₃ / (CH₂)₁₈ / CH₃ の位置でだけ折れる。
  function chemBreakable(text) {
    var s = String(text == null ? '' : text);
    if (!s) return '';
    var ZW = '\u200b';
    var SUB = /[₀-₉0-9ₓᵧᵣ]/;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      var next = s[i + 1] || '';
      out += ch;
      if (!next) break;
      if (/[−—=≡＋]/.test(ch)) {
        out += ZW;
        continue;
      }
      if (SUB.test(ch) && !SUB.test(next) && /[A-Z(（]/.test(next)) {
        out += ZW;
        continue;
      }
      if (/[)）]/.test(ch) && /[A-Z(（]/.test(next)) out += ZW;
      else if (ch === '（' && /[(（A-Z]/.test(next)) out += ZW;
    }
    return out;
  }

  function renderCondensed(spec, label) {
    var sourceLines = spec.lines || [];
    var lines = [];
    sourceLines.forEach(function (t) {
      wrapCondensedText(t, 18).forEach(function (part) { lines.push(part); });
    });
    var maxLen = 0;
    lines.forEach(function (t) { maxLen = Math.max(maxLen, t.length); });
    var fs = lines.length > 3 ? 15 : (lines.length > 2 ? 17 : (maxLen > 26 ? 18 : 20));
    var width = Math.max(220, maxLen * fs * 0.68 + 36);
    var height = Math.max(84, 36 + lines.length * 32);
    var content = lines.map(function (t, i) {
      return '<text x="' + (width / 2).toFixed(1) + '" y="' + (30 + i * 32).toFixed(1) +
        '" text-anchor="middle" dominant-baseline="middle" class="rp-struct-condensed" font-size="' + fs + '">' + esc(t) + '</text>';
    }).join('');
    return svgOpen(0, 0, width, height, label, 'data-kind="condensed" data-lines="' + lines.length + '"') + content + '</svg>';
  }

  function renderTriglyceride(spec, label) {
    var W = 470, H = 270;
    var x = 92;
    var ys = [58, 128, 198];
    var labels = ['CH₂', 'CH', 'CH₂'];
    var chains = spec.chains && spec.chains.length === 3
      ? spec.chains
      : ['C₁₇H₃₅', 'C₁₇H₃₅', 'C₁₇H₃₅'];
    var out = '';
    // グリセリン骨格のC-C結合（3つの炭素を縦に明示）
    out += lineEl(x, ys[0] + 13, x, ys[1] - 13, 'rp-struct-bond rp-struct-bond--backbone', 2.8);
    out += lineEl(x, ys[1] + 13, x, ys[2] - 13, 'rp-struct-bond rp-struct-bond--backbone', 2.8);
    for (var i = 0; i < 3; i++) {
      out += textEl(x, ys[i], labels[i], 'rp-struct-condensed', 19);
      out += lineEl(x + 13, ys[i], x + 42, ys[i], 'rp-struct-bond', 2.6);
      out += '<text x="' + (x + 48) + '" y="' + ys[i] + '" text-anchor="start" dominant-baseline="middle" class="rp-struct-condensed" font-size="17" data-chain="fatty-acid">' +
        esc('O—CO—' + chains[i]) + '</text>';
    }
    out += textEl(W / 2, 242, 'グリセリン骨格と3本の脂肪酸鎖（簡略）', 'rp-struct-projection-note', 12);
    return svgOpen(0, 0, W, H, label, 'data-kind="triglyceride"') + out + '</svg>';
  }

  function renderPolymer(spec, label) {
    var unit = spec.unit || '';
    var fs = unit.length > 34 ? 15 : (unit.length > 24 ? 17 : 19);
    var width = Math.max(400, unit.length * fs * 0.72 + 120);
    var height = 150;
    var cy = 70;
    var left = 46, right = width - 46;
    var content = lineEl(left + 8, cy - 32, left, cy - 32, 'rp-struct-bracket', 2.4) +
      lineEl(left, cy - 32, left, cy + 32, 'rp-struct-bracket', 2.4) +
      lineEl(left, cy + 32, left + 8, cy + 32, 'rp-struct-bracket', 2.4) +
      lineEl(right - 8, cy - 32, right, cy - 32, 'rp-struct-bracket', 2.4) +
      lineEl(right, cy - 32, right, cy + 32, 'rp-struct-bracket', 2.4) +
      lineEl(right, cy + 32, right - 8, cy + 32, 'rp-struct-bracket', 2.4) +
      '<text x="' + (width / 2).toFixed(1) + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle" class="rp-struct-condensed" font-size="' + fs + '">' + esc(unit) + '</text>' +
      '<text x="' + (right + 15).toFixed(1) + '" y="' + (cy + 34) + '" text-anchor="middle" class="rp-struct-atom" font-size="16">n</text>';
    return svgOpen(0, 0, width, height, label, 'data-kind="polymer"') + content + '</svg>';
  }

  function renderVinylon(spec, label) {
    var W = 480, H = 220;
    var out = '';
    // 部分ホルマール化PVAの模式図（アセタール環と残存OH）
    out += lineEl(50, 130, 130, 130, 'rp-struct-bond', 2.6);
    out += lineEl(250, 130, 300, 155, 'rp-struct-bond', 2.6);
    out += lineEl(300, 155, 360, 130, 'rp-struct-bond', 2.6);
    out += lineEl(360, 130, 410, 130, 'rp-struct-bond', 2.6);
    // 6員アセタール環: C1-C2-C3-O-CH2-O
    out += lineEl(130, 130, 190, 95, 'rp-struct-bond', 2.6);
    out += lineEl(190, 95, 250, 130, 'rp-struct-bond', 2.6);
    out += lineEl(250, 130, 250, 65, 'rp-struct-bond', 2.6);
    out += lineEl(250, 65, 190, 30, 'rp-struct-bond', 2.6);
    out += lineEl(190, 30, 130, 65, 'rp-struct-bond', 2.6);
    out += lineEl(130, 65, 130, 130, 'rp-struct-bond', 2.6);
    out += textEl(130, 130, 'CH', 'rp-struct-condensed', 17);
    out += textEl(190, 95, 'CH₂', 'rp-struct-condensed', 17);
    out += textEl(250, 130, 'CH', 'rp-struct-condensed', 17);
    out += textEl(250, 65, 'O', 'rp-struct-atom', 19);
    out += textEl(190, 30, 'CH₂', 'rp-struct-condensed', 17);
    out += textEl(130, 65, 'O', 'rp-struct-atom', 19);
    out += textEl(300, 155, 'CH₂', 'rp-struct-condensed', 17);
    out += textEl(360, 130, 'CH', 'rp-struct-condensed', 17);
    // 残存OH（右側の閉括弧と接触しないよう環の内側上方へ配置）
    out += lineEl(360, 130, 382, 105, 'rp-struct-bond', 2.2);
    out += textEl(392, 92, 'OH', 'rp-struct-atom', 18);
    out += textEl(50, 130, '—', 'rp-struct-condensed', 18);
    // 括弧と重合度
    out += lineEl(40, 70, 28, 70, 'rp-struct-bracket', 2.4);
    out += lineEl(28, 70, 28, 170, 'rp-struct-bracket', 2.4);
    out += lineEl(28, 170, 40, 170, 'rp-struct-bracket', 2.4);
    out += lineEl(420, 70, 432, 70, 'rp-struct-bracket', 2.4);
    out += lineEl(432, 70, 432, 170, 'rp-struct-bracket', 2.4);
    out += lineEl(432, 170, 420, 170, 'rp-struct-bracket', 2.4);
    out += textEl(444, 166, 'n', 'rp-struct-atom', 16);
    out += textEl(W / 2, 205, '部分ホルマール化PVA（アセタール環＋残存OH）', 'rp-struct-projection-note', 12);
    return svgOpen(0, 0, W, H, label, 'data-kind="schematic" data-sugar="vinylon"') + out + '</svg>';
  }

  function schematicSugarRing(cx, cy, r, oIndex) {
    var pts = ringCoords(6, cx, cy, r, 0);
    var out = '';
    for (var i = 0; i < 6; i++) {
      var a = pts[i], b = pts[(i + 1) % 6];
      out += lineEl(a.x, a.y, b.x, b.y, 'rp-struct-bond rp-struct-schematic-ring', 2.2);
    }
    out += textEl(pts[oIndex].x, pts[oIndex].y, 'O', 'rp-struct-atom', 18);
    return out;
  }

  function schematicFuranoseRing() {
    var C2 = { x: 255, y: 101 };
    var O = { x: 300, y: 60 };
    var C5 = { x: 345, y: 101 };
    var C4 = { x: 320, y: 160 };
    var C3 = { x: 270, y: 150 };
    var out = '';
    out += lineEl(C2.x, C2.y, O.x, O.y, 'rp-struct-bond rp-struct-schematic-ring', 2.2);
    out += lineEl(O.x, O.y, C5.x, C5.y, 'rp-struct-bond rp-struct-schematic-ring', 2.2);
    out += lineEl(C5.x, C5.y, C4.x, C4.y, 'rp-struct-bond rp-struct-schematic-ring', 2.2);
    out += lineEl(C4.x, C4.y, C3.x, C3.y, 'rp-struct-bond rp-struct-schematic-ring', 2.2);
    out += lineEl(C3.x, C3.y, C2.x, C2.y, 'rp-struct-bond rp-struct-schematic-ring', 2.2);
    out += textEl(O.x, O.y, 'O', 'rp-struct-atom', 18);
    return out;
  }

  var POLYSACCHARIDE_SCHEMATIC_KINDS = {
    starch: true, cellulose: true, glycogen: true, amylopectin: true,
    dextrin: true, chitin: true, 'cellulose-acetate': true, 'cellulose-nitrate': true
  };

  function renderSchematic(spec, label) {
    var kind = spec.kind;
    if (kind === 'salicin') {
      // サリチルアルコールのフェノール性Oにβ-D-グルコピラノースが結合した配糖体。
      // 糖環の5立体中心は描き分けず、identityはmetadata（data-*）で保持する。
      var sal = '';
      var agly = ringCoords(6, 350, 150, 60, 0);
      for (var si = 0; si < 6; si++) {
        sal += lineEl(agly[si].x, agly[si].y, agly[(si + 1) % 6].x, agly[(si + 1) % 6].y, 'rp-struct-bond rp-struct-schematic-ring', 2.2);
      }
      // ベンゼン環のケクレ二重結合（内側へ寄せた短い線）
      [0, 2, 4].forEach(function (ei) {
        var a = agly[ei], b = agly[(ei + 1) % 6];
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var ix = (350 - mx) * 0.18, iy = (150 - my) * 0.18;
        sal += lineEl(a.x + (mx - a.x) * 0.18 + ix, a.y + (my - a.y) * 0.18 + iy,
          b.x + (mx - b.x) * 0.18 + ix, b.y + (my - b.y) * 0.18 + iy, 'rp-struct-bond', 1.9);
      });
      sal += textEl(350, 150, '芳香環', 'rp-struct-schematic-note', 11);
      // アグリコンのCH2OH（遊離）
      sal += lineEl(agly[4].x, agly[4].y, 320, 60, 'rp-struct-bond', 2.4);
      sal += textEl(320, 44, 'CH₂OH', 'rp-struct-condensed', 15);
      // フェノール性O
      sal += lineEl(agly[3].x, agly[3].y, 240, 150, 'rp-struct-bond', 2.4);
      sal += textEl(228, 143, 'O', 'rp-struct-atom', 18);
      sal += textEl(215, 174, 'β', 'rp-struct-anomer', 15);
      // β-D-グルコピラノース（Oは環のindex5、C1はindex0）
      var sug = ringCoords(6, 130, 150, 55, 0);
      sal += schematicSugarRing(130, 150, 55, 5);
      sal += lineEl(sug[0].x, sug[0].y, 218, 150, 'rp-struct-bond', 2.4);
      sal += textEl(sug[0].x + 10, sug[0].y + 18, 'C1', 'rp-struct-ring-num', 10);
      // C2-OH / C3-OH / C4-OH、C5-CH2OH（遊離）
      sal += lineEl(sug[1].x, sug[1].y, sug[1].x + 14, sug[1].y + 24, 'rp-struct-bond', 2.0);
      sal += textEl(sug[1].x + 18, sug[1].y + 38, 'OH', 'rp-struct-atom', 13);
      sal += lineEl(sug[2].x, sug[2].y, sug[2].x - 14, sug[2].y + 24, 'rp-struct-bond', 2.0);
      sal += textEl(sug[2].x - 18, sug[2].y + 38, 'OH', 'rp-struct-atom', 13);
      sal += lineEl(sug[3].x, sug[3].y, sug[3].x - 24, sug[3].y, 'rp-struct-bond', 2.0);
      sal += textEl(sug[3].x - 36, sug[3].y, 'OH', 'rp-struct-atom', 13);
      sal += lineEl(sug[4].x, sug[4].y, 82, 72, 'rp-struct-bond', 2.2);
      sal += textEl(72, 56, 'CH₂OH', 'rp-struct-condensed', 14);
      sal += textEl(130, 20, 'β-D-グルコピラノース', 'rp-struct-schematic-text', 13);
      sal += textEl(350, 20, 'サリチルアルコール', 'rp-struct-schematic-text', 13);
      // 注記は構造の下に専用帯を確保し、置換基の結合・ラベルと重ねない。
      var salNotes = '';
      salNotes += textEl(235, 266, 'β-D-グルコピラノシド結合（C1—O—フェノール性O）', 'rp-struct-schematic-note', 11);
      salNotes += textEl(235, 292, '糖の5立体中心は模式図のため省略（metadataでβ-Dを保持）', 'rp-struct-schematic-note', 11);
      return svgOpen(0, 0, 430, 304, label,
        'data-kind="schematic" data-sugar="salicin" data-glycosidic="beta-D-glucopyranoside" data-anomer="beta" ' +
        'data-aglycone="salicyl-alcohol" data-free-hydroxymethyl="2" data-stereocenters="5" data-stereo-drawn="omitted"') +
        '<g class="rp-struct-schematic-structure">' + sal + '</g>' +
        '<g class="rp-struct-schematic-annotation">' + salNotes + '</g></svg>';
    }
    if (kind === 'nucleoside-adenosine' || kind === 'nucleotide-adp') {
      // アデニン—リボースを共通の模式で描き、ADPだけ5′位に二リン酸鎖を足す。
      // ATPの三リン酸・4価陰イオン表示は流用せず、ADPは中性酸形P2・電荷0を明示する。
      var isAdp = kind === 'nucleotide-adp';
      var nuc = '';
      nuc += textEl(80, 96, 'アデニン', 'rp-struct-schematic-text', 15);
      nuc += textEl(80, 120, '（プリン塩基）', 'rp-struct-schematic-note', 11);
      nuc += lineEl(142, 108, 200, 108, 'rp-struct-bond', 2.4);
      nuc += textEl(171, 94, 'N9', 'rp-struct-ring-num', 11);
      var C1 = { x: 200, y: 108 }, C2 = { x: 226, y: 168 }, C3 = { x: 276, y: 168 };
      var C4 = { x: 300, y: 108 }, RO = { x: 250, y: 64 };
      nuc += lineEl(C1.x, C1.y, C2.x, C2.y, 'rp-struct-bond', 2.4);
      nuc += lineEl(C2.x, C2.y, C3.x, C3.y, 'rp-struct-bond', 2.4);
      nuc += lineEl(C3.x, C3.y, C4.x, C4.y, 'rp-struct-bond', 2.4);
      nuc += lineEl(C4.x, C4.y, RO.x, RO.y, 'rp-struct-bond', 2.4);
      nuc += lineEl(RO.x, RO.y, C1.x, C1.y, 'rp-struct-bond', 2.4);
      nuc += textEl(RO.x, RO.y, 'O', 'rp-struct-atom', 17);
      nuc += textEl(C1.x - 4, C1.y + 18, 'C1′', 'rp-struct-ring-num', 10);
      nuc += textEl(C2.x - 2, C2.y + 18, 'C2′', 'rp-struct-ring-num', 10);
      nuc += textEl(C3.x + 2, C3.y + 18, 'C3′', 'rp-struct-ring-num', 10);
      nuc += textEl(C4.x + 8, C4.y + 18, 'C4′', 'rp-struct-ring-num', 10);
      nuc += lineEl(C2.x, C2.y, C2.x - 14, C2.y + 24, 'rp-struct-bond', 2.0);
      nuc += textEl(C2.x - 18, C2.y + 38, 'OH', 'rp-struct-atom', 13);
      nuc += lineEl(C3.x, C3.y, C3.x + 14, C3.y + 24, 'rp-struct-bond', 2.0);
      nuc += textEl(C3.x + 18, C3.y + 38, 'OH', 'rp-struct-atom', 13);
      nuc += lineEl(C4.x, C4.y, 338, 78, 'rp-struct-bond', 2.2);
      nuc += textEl(356, 66, 'CH₂', 'rp-struct-condensed', 14);
      if (!isAdp) {
        nuc += textEl(356, 92, 'OH', 'rp-struct-atom', 14);
        nuc += textEl(275, 225, 'リン酸残基なし（ヌクレオシド）。4立体中心は模式図のため省略。', 'rp-struct-schematic-note', 11);
        return svgOpen(0, 0, 500, 245, label,
          'data-kind="schematic" data-nucleotide="adenosine" data-phosphate-count="0" data-sugar="beta-D-ribofuranose" ' +
          'data-anomer="beta" data-stereocenters="4" data-stereo-drawn="omitted"') + nuc + '</svg>';
      }
      nuc += lineEl(348, 78, 382, 78, 'rp-struct-bond', 2.2);
      nuc += textEl(396, 72, 'O', 'rp-struct-atom', 17);
      nuc += lineEl(410, 78, 430, 78, 'rp-struct-bond', 2.2);
      // P1
      nuc += textEl(446, 78, 'P', 'rp-struct-atom', 18);
      nuc += lineEl(442, 62, 442, 46, 'rp-struct-bond', 2.0);
      nuc += lineEl(450, 62, 450, 46, 'rp-struct-bond', 2.0);
      nuc += textEl(446, 36, 'O', 'rp-struct-atom', 14);
      nuc += lineEl(446, 94, 446, 110, 'rp-struct-bond', 2.0);
      nuc += textEl(446, 124, 'OH', 'rp-struct-schematic-note', 12);
      // O bridge
      nuc += lineEl(458, 78, 474, 78, 'rp-struct-bond', 2.2);
      nuc += textEl(486, 72, 'O', 'rp-struct-atom', 17);
      nuc += lineEl(496, 78, 512, 78, 'rp-struct-bond', 2.2);
      // P2 terminal
      nuc += textEl(528, 78, 'P', 'rp-struct-atom', 18);
      nuc += lineEl(524, 62, 524, 46, 'rp-struct-bond', 2.0);
      nuc += lineEl(532, 62, 532, 46, 'rp-struct-bond', 2.0);
      nuc += textEl(528, 36, 'O', 'rp-struct-atom', 14);
      nuc += lineEl(528, 94, 528, 110, 'rp-struct-bond', 2.0);
      nuc += textEl(528, 124, 'OH', 'rp-struct-schematic-note', 12);
      nuc += lineEl(540, 78, 560, 78, 'rp-struct-bond', 2.0);
      nuc += textEl(574, 72, 'OH', 'rp-struct-schematic-note', 12);
      // 注記は糖環・OHの下に専用帯を確保し、C2′/C3′やOHと重ねない。
      var nucNotes = '';
      nucNotes += textEl(330, 238, 'リボース5′—CH₂—O—P(=O)(OH)—O—P(=O)(OH)₂（中性酸形）', 'rp-struct-schematic-note', 12);
      nucNotes += textEl(330, 264, 'P2・電荷0を明示。生理的pHのADP³⁻・Mg²⁺錯体とは区別する。', 'rp-struct-schematic-note', 11);
      nucNotes += textEl(330, 290, '糖の4立体中心は模式図のため省略（metadataでβ-Dを保持）。', 'rp-struct-schematic-note', 11);
      return svgOpen(0, 0, 600, 302, label,
        'data-kind="schematic" data-nucleotide="adp" data-phosphate-count="2" data-phosphate-chain="P-O-P" ' +
        'data-phosphate-charge="0" data-sugar="beta-D-ribofuranose" data-anomer="beta" data-stereocenters="4" data-stereo-drawn="omitted"') +
        '<g class="rp-struct-schematic-structure">' + nuc + '</g>' +
        '<g class="rp-struct-schematic-annotation">' + nucNotes + '</g></svg>';
    }
    if (kind === 'nucleotide-atp') {
      // ATPはアデニン—リボース—三リン酸の模式図。糖環の連続図には落とさない。
      // 三リン酸は P—O—P—O—P で接続し、各PのP=OとO⁻を明示する（ATP⁴⁻）。
      var atp = '';
      atp += textEl(78, 62, 'アデニン', 'rp-struct-schematic-text', 14);
      atp += textEl(78, 84, '（塩基）', 'rp-struct-schematic-note', 11);
      atp += lineEl(120, 78, 166, 78, 'rp-struct-bond', 2.4);
      atp += textEl(207, 62, 'リボース', 'rp-struct-schematic-text', 14);
      atp += textEl(207, 84, '（五炭糖）', 'rp-struct-schematic-note', 11);
      atp += lineEl(244, 78, 286, 78, 'rp-struct-bond', 2.4);
      atp += textEl(300, 72, 'O', 'rp-struct-atom', 17);
      atp += lineEl(314, 78, 338, 78, 'rp-struct-bond', 2.4);
      // P1
      atp += textEl(356, 78, 'P', 'rp-struct-atom', 19);
      atp += lineEl(352, 62, 352, 44, 'rp-struct-bond', 2.2);
      atp += lineEl(360, 62, 360, 44, 'rp-struct-bond', 2.2);
      atp += textEl(356, 32, 'O', 'rp-struct-atom', 15);
      atp += lineEl(356, 94, 356, 112, 'rp-struct-bond', 2.2);
      atp += textEl(356, 128, 'O⁻', 'rp-struct-schematic-note', 12);
      // O bridge
      atp += lineEl(370, 78, 394, 78, 'rp-struct-bond', 2.4);
      atp += textEl(406, 72, 'O', 'rp-struct-atom', 17);
      atp += lineEl(420, 78, 444, 78, 'rp-struct-bond', 2.4);
      // P2
      atp += textEl(462, 78, 'P', 'rp-struct-atom', 19);
      atp += lineEl(458, 62, 458, 44, 'rp-struct-bond', 2.2);
      atp += lineEl(466, 62, 466, 44, 'rp-struct-bond', 2.2);
      atp += textEl(462, 32, 'O', 'rp-struct-atom', 15);
      atp += lineEl(462, 94, 462, 112, 'rp-struct-bond', 2.2);
      atp += textEl(462, 128, 'O⁻', 'rp-struct-schematic-note', 12);
      // O bridge
      atp += lineEl(476, 78, 500, 78, 'rp-struct-bond', 2.4);
      atp += textEl(512, 72, 'O', 'rp-struct-atom', 17);
      atp += lineEl(526, 78, 550, 78, 'rp-struct-bond', 2.4);
      // P3 terminal
      atp += textEl(568, 78, 'P', 'rp-struct-atom', 19);
      atp += lineEl(564, 62, 564, 44, 'rp-struct-bond', 2.2);
      atp += lineEl(572, 62, 572, 44, 'rp-struct-bond', 2.2);
      atp += textEl(568, 32, 'O', 'rp-struct-atom', 15);
      atp += lineEl(568, 94, 568, 112, 'rp-struct-bond', 2.2);
      atp += textEl(568, 128, 'O⁻', 'rp-struct-schematic-note', 12);
      atp += lineEl(580, 78, 604, 78, 'rp-struct-bond', 2.2);
      atp += textEl(620, 72, 'O⁻', 'rp-struct-schematic-note', 12);
      atp += textEl(330, 166, '三リン酸鎖（P—O—P—O—P、各PにP=O）', 'rp-struct-schematic-note', 13);
      atp += textEl(330, 190, '生理的pHでは ATP⁴⁻（O⁻ 4個）として存在し、Mg²⁺と錯体をつくる', 'rp-struct-schematic-note', 12);
      return svgOpen(0, 0, 680, 220, label, 'data-kind="schematic" data-nucleotide="atp" data-phosphate-chain="P-O-P-O-P" data-phosphate-charge="4-"') + atp + '</svg>';
    }
    if (kind === 'cyclohexane-hexachloride') {
      // C6H6Cl6 は1,2,3,4,5,6-六置換体の立体異性体群。特定異性体の構造を描いたと誤解させない。
      var hch = '';
      hch += textEl(210, 54, 'C₆H₆Cl₆', 'rp-struct-schematic-text', 24);
      hch += textEl(210, 86, 'ベンゼンへの塩素付加で生じる1,2,3,4,5,6-六置換体', 'rp-struct-schematic-note', 13);
      hch += textEl(210, 110, 'α・β・γ等は立体異性体（γ-異性体＝リンデンを含む）', 'rp-struct-schematic-note', 12);
      hch += textEl(210, 134, '六置換の位置は共通で、特定の1立体異性体を表す図ではない', 'rp-struct-schematic-note', 12);
      return svgOpen(0, 0, 420, 160, label, 'data-kind="schematic" data-isomer-class="hch"') + hch + '</svg>';
    }
    if (kind === 'vinylon') return renderVinylon(spec, label);
    if (kind === 'dna' || kind === 'rna') {
      var isDna = kind === 'dna';
      var bases = isDna ? ['A', 'T', 'G', 'C'] : ['A', 'U', 'G', 'C'];
      var complement = isDna ? { A: 'T', T: 'A', G: 'C', C: 'G' } : { A: 'U', U: 'A', G: 'C', C: 'G' };
      var content = '';
      // 2本の糖—リン酸鎖（模式）と塩基対
      content += lineEl(55, 72, 365, 72, 'rp-struct-bond rp-struct-bond--backbone', 3.2);
      content += lineEl(55, 128, 365, 128, 'rp-struct-bond rp-struct-bond--backbone', 3.2);
      content += textEl(35, 72, '5′', 'rp-struct-schematic-note', 13);
      content += textEl(382, 72, '3′', 'rp-struct-schematic-note', 13);
      content += textEl(35, 128, '3′', 'rp-struct-schematic-note', 13);
      content += textEl(382, 128, '5′', 'rp-struct-schematic-note', 13);
      for (var i = 0; i < 4; i++) {
        var x = 110 + i * 60;
        content += lineEl(x, 78, x, 122, 'rp-struct-bond rp-struct-bond--h', 2.0);
        content += textEl(x, 62, bases[i], 'rp-struct-atom', 17);
        content += textEl(x, 142, complement[bases[i]], 'rp-struct-atom', 17);
      }
      content += textEl(210, 172, isDna ? 'デオキシリボース—リン酸鎖／塩基 A-T, G-C' : 'リボース—リン酸鎖／塩基 A-U, G-C', 'rp-struct-schematic-note', 13);
      return svgOpen(0, 0, 420, 195, label, 'data-kind="schematic" data-sugar="' + esc(kind) + '"') + content + '</svg>';
    }
    if (kind === 'isomaltose') {
      // α-1,6: 左をdonor、右をacceptorとして縦にずらす。
      // donor C5（環頂点）→CH2OH up、donor C1（環頂点）→グリコシドO down
      // →acceptor C6（環外CH2）→acceptor C5（環頂点）。
      // 六員環の頂点定義: index0=右, 1=右下, 2=左下, 3=左,
      // 4=左上, 5=右上。両環ともOはindex5。
      var donorC = ringCoords(6, 140, 130, 90, 0);
      var acceptC = ringCoords(6, 385, 346, 90, 0);
      var donorC1 = donorC[0];       // (230,130)
      var donorC5 = donorC[4];       // (95,52)
      var acceptC5 = acceptC[4];     // (340,268)
      var ch2oh = { x: 95, y: 10 };
      var glyO = { x: 230, y: 220 };
      var acceptC6 = { x: 340, y: 220 };
      var iso = schematicSugarRing(140, 130, 90, 5) + schematicSugarRing(385, 346, 90, 5);
      // donor C5からCH2OHを上向きに
      iso += lineEl(donorC5.x, donorC5.y, ch2oh.x, ch2oh.y + 12, 'rp-struct-bond', 2.4);
      iso += textEl(ch2oh.x, ch2oh.y, 'CH₂OH', 'rp-struct-condensed', 16);
      // donor C1からグリコシドOを下向きに（α-DのC1置換基down）
      iso += lineEl(donorC1.x, donorC1.y, glyO.x, glyO.y - 12, 'rp-struct-bond', 2.4);
      iso += textEl(glyO.x, glyO.y, 'O', 'rp-struct-atom', 19);
      // Oからacceptorの環外C6へ、C6から環頂点C5へ
      iso += lineEl(glyO.x + 12, glyO.y, acceptC6.x - 12, acceptC6.y, 'rp-struct-bond', 2.4);
      iso += textEl(acceptC6.x, acceptC6.y, 'CH₂', 'rp-struct-condensed', 17);
      iso += lineEl(acceptC6.x, acceptC6.y + 12, acceptC5.x, acceptC5.y, 'rp-struct-bond', 2.4);
      iso += textEl(donorC5.x - 14, donorC5.y - 10, 'C5', 'rp-struct-ring-num', 12);
      iso += textEl(donorC1.x + 12, donorC1.y - 10, 'C1', 'rp-struct-ring-num', 12);
      iso += textEl(glyO.x + 18, glyO.y - 60, 'α', 'rp-struct-anomer', 16);
      iso += textEl(acceptC5.x + 18, acceptC5.y + 10, 'C5', 'rp-struct-ring-num', 12);
      iso += textEl(acceptC6.x + 18, acceptC6.y - 10, 'C6', 'rp-struct-ring-num', 12);
      iso += textEl(280, 455, 'α-1,6（donor C1↓—O—acceptor C6—C5）。受容体の還元末端C1はα/βを特定しない。', 'rp-struct-schematic-note', 12);
      return svgOpen(0, 0, 560, 470, label, 'data-kind="schematic" data-sugar="isomaltose" data-linkage="alpha-1,6" data-anomer="alpha" data-exocyclic-c6="1" data-glycosidic="α-1,6" data-donor-c1="230,130" data-donor-c5="95,52" data-donor-ch2oh="95,10" data-glycosidic-o="230,220" data-acceptor-c6="340,220" data-acceptor-c5="340,268"') + iso + '</svg>';
    }
    if (kind === 'sucrose' || kind === 'maltose' || kind === 'lactose' || kind === 'cellobiose' || kind === 'trehalose') {
      var dis = {
        sucrose: { left: 'α-D-グルコース', right: 'β-D-フルクトフラノース', link: 'α-1,2', furanose: true, anomer: true, reducing: 'no' },
        maltose: { left: 'α-D-グルコース', right: 'D-グルコース', link: 'α-1,4', anomer: false, reducing: 'yes' },
        lactose: { left: 'β-D-ガラクトース', right: 'D-グルコース', link: 'β-1,4', anomer: false, reducing: 'yes' },
        cellobiose: { left: 'β-D-グルコース', right: 'β-D-グルコース', link: 'β-1,4', anomer: true, reducing: 'yes' },
        trehalose: { left: 'α-D-グルコース', right: 'α-D-グルコース', link: 'α,α-1,1', anomer: true, reducing: 'no' },
        isomaltose: { left: 'α-D-グルコース', right: 'D-グルコース', link: 'α-1,6', anomer: false, reducing: 'yes' }
      }[kind];
      var isSucrose = kind === 'sucrose';
      var content = schematicSugarRing(100, 101, 65, 1) +
        (dis.furanose ? schematicFuranoseRing() : schematicSugarRing(320, 101, 65, 5)) +
        '<text x="100" y="18" text-anchor="middle" class="rp-struct-schematic-text" font-size="13">' + esc(dis.left) + '</text>' +
        '<text x="320" y="18" text-anchor="middle" class="rp-struct-schematic-text" font-size="13">' + esc(dis.right) + '</text>' +
        lineEl(165, 101, 200, 101, 'rp-struct-bond', 2.6) +
        lineEl(220, 101, 255, 101, 'rp-struct-bond', 2.6) +
        textEl(210, 101, 'O', 'rp-struct-atom', 21) +
        (dis.anomer ? textEl(180, 82, kind === 'trehalose' ? 'α' : (kind === 'cellobiose' ? 'β' : 'α'), 'rp-struct-schematic-note', 14) +
          textEl(240, 82, kind === 'trehalose' ? 'α' : (kind === 'cellobiose' ? 'β' : 'β'), 'rp-struct-schematic-note', 14) : '') +
        textEl(210, 132, dis.link, 'rp-struct-schematic-note', 14) +
        textEl(210, 152, dis.reducing === 'yes' ? '還元性あり' : '非還元性', 'rp-struct-schematic-note', 12);
      return svgOpen(0, 0, 420, 180, label, 'data-kind="schematic" data-sugar="' + esc(kind) +
        '" data-ring-count="2" data-glycosidic="' + esc(dis.link) + '" data-reducing="' + esc(dis.reducing) + '"' +
        (dis.furanose ? ' data-fructose-ring="furanose" data-anomer-glucose="alpha" data-anomer-fructose="beta"' :
          (kind === 'cellobiose' ? ' data-anomer="beta"' : (kind === 'trehalose' ? ' data-anomer="alpha,alpha"' : '')))) + content + '</svg>';
    }
    if (kind.indexOf('protein') === 0) {
      // タンパク質・酵素はアミノ酸配列と重合度で組成が変わるため、
      // 主鎖と側鎖Rの模式図だけを示し、固定の分子式は主張しない。
      var plabel = spec.unitLabel || 'アミノ酸単位 —NH—CH(R)—CO—';
      var pcontent = '';
      pcontent += lineEl(70, 100, 120, 70, 'rp-struct-bond', 2.4);
      pcontent += lineEl(120, 70, 170, 100, 'rp-struct-bond', 2.4);
      pcontent += lineEl(170, 100, 220, 70, 'rp-struct-bond', 2.4);
      pcontent += lineEl(220, 70, 270, 100, 'rp-struct-bond', 2.4);
      pcontent += lineEl(270, 100, 320, 70, 'rp-struct-bond', 2.4);
      pcontent += textEl(95, 78, 'NH', 'rp-struct-atom', 15);
      pcontent += textEl(145, 92, 'CO', 'rp-struct-atom', 15);
      pcontent += textEl(195, 78, 'NH', 'rp-struct-atom', 15);
      pcontent += textEl(245, 92, 'CO', 'rp-struct-atom', 15);
      pcontent += textEl(120, 52, 'R', 'rp-struct-atom', 15);
      pcontent += textEl(220, 52, 'R', 'rp-struct-atom', 15);
      pcontent += textEl(195, 132, plabel, 'rp-struct-schematic-note', 13);
      pcontent += textEl(195, 154, '側鎖R・配列・重合度に依存（組成不定）', 'rp-struct-schematic-note', 12);
      pcontent += lineEl(50, 50, 34, 50, 'rp-struct-bracket', 2.4);
      pcontent += lineEl(34, 50, 34, 140, 'rp-struct-bracket', 2.4);
      pcontent += lineEl(34, 140, 50, 140, 'rp-struct-bracket', 2.4);
      pcontent += lineEl(340, 50, 356, 50, 'rp-struct-bracket', 2.4);
      pcontent += lineEl(356, 50, 356, 140, 'rp-struct-bracket', 2.4);
      pcontent += lineEl(356, 140, 340, 140, 'rp-struct-bracket', 2.4);
      return svgOpen(0, 0, 390, 175, label, 'data-kind="schematic" data-protein="1"') + pcontent + '</svg>';
    }
    // 多糖類: 糖環がグリコシド酸素で連なる模式図。
    // 未知kindを多糖の3環fallbackへ落とすと別物質の図になるため、
    // 明示的に多糖kindだけを通し、それ以外は未対応として描画しない。
    if (!POLYSACCHARIDE_SCHEMATIC_KINDS[kind]) {
      return svgOpen(0, 0, 380, 120, label, 'data-kind="schematic" data-unsupported-schematic="1"') +
        textEl(190, 60, 'この模式図は未対応です', 'rp-struct-atom', 15) + '</svg>';
    }
    var unitLabel = spec.unitLabel || 'グルコース単位';
    var linkLabel = spec.linkLabel || '';
    var content2 = schematicSugarRing(80, 100, 38, 1) +
      schematicSugarRing(190, 100, 38, 1) +
      schematicSugarRing(300, 100, 38, 1) +
      lineEl(118, 100, 130, 100, 'rp-struct-bond', 2.4) +
      textEl(135, 100, 'O', 'rp-struct-atom', 18) +
      lineEl(140, 100, 152, 100, 'rp-struct-bond', 2.4) +
      lineEl(228, 100, 240, 100, 'rp-struct-bond', 2.4) +
      textEl(245, 100, 'O', 'rp-struct-atom', 18) +
      lineEl(250, 100, 262, 100, 'rp-struct-bond', 2.4) +
      '<text x="190" y="18" text-anchor="middle" class="rp-struct-schematic-text" font-size="13">' + esc(unitLabel) + '</text>' +
      lineEl(60, 50, 42, 50, 'rp-struct-bracket', 2.4) +
      lineEl(42, 50, 42, 150, 'rp-struct-bracket', 2.4) +
      lineEl(42, 150, 60, 150, 'rp-struct-bracket', 2.4) +
      lineEl(320, 50, 338, 50, 'rp-struct-bracket', 2.4) +
      lineEl(338, 50, 338, 150, 'rp-struct-bracket', 2.4) +
      lineEl(338, 150, 320, 150, 'rp-struct-bracket', 2.4) +
      '<text x="352" y="146" text-anchor="middle" class="rp-struct-atom" font-size="16">n</text>' +
      (linkLabel ? textEl(190, 168, linkLabel, 'rp-struct-schematic-note', 13) : '');
    return svgOpen(0, 0, 380, 185, label, 'data-kind="schematic" data-sugar="' + esc(kind) +
      '" data-ring-count="3" data-glycosidic="' + esc(linkLabel) + '"') + content2 + '</svg>';
  }

  /* ------------------------------------------------------------------
   * グルコース・フルクトースの投影式
   * ------------------------------------------------------------------ */

  var FISCHER_STEREO = {
    glucose: { c2: 'right', c3: 'left', c4: 'right', c5: 'right' },
    galactose: { c2: 'right', c3: 'left', c4: 'left', c5: 'right' },
    mannose: { c2: 'left', c3: 'left', c4: 'right', c5: 'right' },
    ribose: { c2: 'right', c3: 'right', c4: 'right' },
    deoxyribose: { c2: 'none', c3: 'right', c4: 'right' },
    fructose: { c3: 'left', c4: 'right', c5: 'right' }
  };

  function fischerStereo(spec) {
    var sugar = spec.sugar || 'glucose';
    var base = FISCHER_STEREO[sugar] || FISCHER_STEREO.glucose;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(spec.stereo || {}).forEach(function (k) { out[k] = spec.stereo[k]; });
    return out;
  }

  function renderFischer(spec, label) {
    var sugar = spec.sugar || 'glucose';
    var ketose = !!spec.ketose || sugar === 'fructose';
    var carbons = spec.carbons || (sugar === 'ribose' || sugar === 'deoxyribose' ? 5 : 6);
    var stereo = fischerStereo(spec);
    var W = 380;
    var top = 52;
    var gap = 46;
    var ys = [];
    for (var i = 0; i < carbons; i++) ys.push(top + i * gap);
    var H = ys[carbons - 1] + 78;
    var cxs = 190;
    var out = '';
    // 縦の炭素鎖
    out += lineEl(cxs, ys[0] + 12, cxs, ys[carbons - 1] - 12, 'rp-struct-bond', 2.4);
    // C1（アルドースは CHO、ケトースは CH₂OH）
    out += textEl(cxs, ys[0] - 8, ketose ? 'CH₂OH' : 'CHO', 'rp-struct-atom', 21);
    // C2（ケトースは C=O）
    if (ketose) {
      var c2 = { x: cxs, y: ys[1] };
      var o2 = { x: cxs + 55, y: ys[1] };
      out += textEl(c2.x, c2.y, 'C', 'rp-struct-atom', 21, 'data-carbonyl="C2"');
      out += drawBondLine(c2, o2, 2, 12, 4, 'rp-struct-bond');
      out += textEl(o2.x + 8, o2.y, 'O', 'rp-struct-atom', 20, 'data-el="O"');
    }
    var stereoAttrs = '';
    var start = ketose ? 2 : 1;
    for (var j = start; j < carbons - 1; j++) {
      var y = ys[j];
      var key = 'c' + (j + 1);
      var dir = stereo[key] || (j === 1 ? 'right' : (j % 2 === 0 ? 'right' : 'left'));
      out += lineEl(125, y, 255, y, 'rp-struct-bond', 2.2);
      stereoAttrs += ' data-oh-' + key + '="' + esc(dir) + '"';
      if (dir === 'none') {
        out += textEl(105, y, 'H', 'rp-struct-h', 19);
        out += textEl(275, y, 'H', 'rp-struct-h', 19);
      } else {
        var ohRight = dir === 'right';
        out += textEl(ohRight ? 275 : 105, y, 'OH', 'rp-struct-atom', 20);
        out += textEl(ohRight ? 105 : 275, y, 'H', 'rp-struct-h', 19);
      }
    }
    // 末端の CH₂OH
    out += textEl(cxs, ys[carbons - 1] + 14, 'CH₂OH', 'rp-struct-atom', 21);
    out += textEl(cxs, H - 25, 'フィッシャー投影式', 'rp-struct-projection-note', 13);
    return svgOpen(0, 0, W, H, label, 'data-kind="fischer" data-sugar="' + esc(sugar) +
      '" data-carbons="' + carbons + '"' + stereoAttrs) + out + '</svg>';
  }

  function renderFuranose(spec, label) {
    var anomer = spec.anomer || 'alpha';
    var stereo = spec.stereo || {};
    var W = 470, H = 330;
    var O = { x: 250, y: 78 };
    var C2 = { x: 330, y: 112 };
    var C3 = { x: 300, y: 188 };
    var C4 = { x: 200, y: 193 };
    var C5 = { x: 150, y: 118 };
    var out = '';
    out += lineEl(O.x, O.y, C2.x, C2.y, 'rp-struct-bond', 2.3);
    out += lineEl(C2.x, C2.y, C3.x, C3.y, 'rp-struct-bond', 2.3);
    out += lineEl(C3.x, C3.y, C4.x, C4.y, 'rp-struct-bond rp-struct-bond--front', 4.4);
    out += lineEl(C4.x, C4.y, C5.x, C5.y, 'rp-struct-bond rp-struct-bond--front', 4.4);
    out += lineEl(C5.x, C5.y, O.x, O.y, 'rp-struct-bond', 2.3);
    out += textEl(O.x, O.y, 'O', 'rp-struct-atom', 21, 'data-ring-atom="O"');
    out += textEl(C2.x + 12, C2.y - 14, '2', 'rp-struct-ring-num', 12);
    out += textEl(C3.x + 14, C3.y - 8, '3', 'rp-struct-ring-num', 12);
    out += textEl(C4.x - 18, C4.y - 8, '4', 'rp-struct-ring-num', 12);
    out += textEl(C5.x - 16, C5.y - 12, '5', 'rp-struct-ring-num', 12);

    function sub(x, y, dx, dy, text, cls) {
      var tx = x + dx, ty = y + dy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ax = x + dx / len * 14, ay = y + dy / len * 14;
      var bx = tx - dx / len * 10, by = ty - dy / len * 10;
      return lineEl(ax, ay, bx, by, 'rp-struct-bond', 2.0) + textEl(tx, ty, text, cls || 'rp-struct-atom', 18);
    }

    // C1（C2に結合する CH₂OH）と C6（C5に結合する CH₂OH）
    var c1Up = (stereo.c1ch2oh || (anomer === 'alpha' ? 'up' : 'down')) === 'up';
    if (c1Up) {
      out += lineEl(C2.x, C2.y, 388, 66, 'rp-struct-bond', 2.0);
      out += textEl(408, 56, 'CH₂OH', 'rp-struct-atom', 17);
    } else {
      out += lineEl(C2.x, C2.y, 388, 160, 'rp-struct-bond', 2.0);
      out += textEl(408, 174, 'CH₂OH', 'rp-struct-atom', 17);
    }
    out += lineEl(C5.x, C5.y, 104, 64, 'rp-struct-bond', 2.0);
    out += textEl(78, 52, 'CH₂OH', 'rp-struct-atom', 17);
    out += sub(C5.x, C5.y, 12, 42, 'H', 'rp-struct-h');

    // C2 アノマーOH: αは下、βは上。C2はアノマー炭素でHはもたない。
    var c2Down = (stereo.c2 || (anomer === 'alpha' ? 'down' : 'up')) === 'down';
    out += sub(C2.x, C2.y, 42, c2Down ? 40 : -40, 'OH', 'rp-struct-atom rp-struct-anomer');
    // C3 OH上 / H下（D-フルクトフラノース）
    var c3Up = (stereo.c3 || 'up') === 'up';
    out += sub(C3.x, C3.y, 0, c3Up ? -44 : 44, 'OH', 'rp-struct-atom');
    out += sub(C3.x, C3.y, 16, c3Up ? 38 : -38, 'H', 'rp-struct-h');
    // C4 OH下 / H上
    var c4Down = (stereo.c4 || 'down') === 'down';
    out += sub(C4.x, C4.y, 0, c4Down ? 44 : -44, 'OH', 'rp-struct-atom');
    out += sub(C4.x, C4.y, -16, c4Down ? -38 : 38, 'H', 'rp-struct-h');
    out += textEl(W / 2, 292, 'フルクトフラノース（ハース投影式）', 'rp-struct-projection-note', 13);
    return svgOpen(0, 0, W, H, label, 'data-kind="haworth" data-ring="furanose" data-anomer="' + esc(anomer) +
      '" data-c1ch2oh="' + (c1Up ? 'up' : 'down') + '" data-c2oh="' + (c2Down ? 'down' : 'up') +
      '" data-c3oh="' + (c3Up ? 'up' : 'down') +
      '" data-c4oh="' + (c4Down ? 'down' : 'up') + '" data-c5ch2oh="up"') + out + '</svg>';
  }

  function renderHaworth(spec, label) {
    if (spec.ring === 'furanose') return renderFuranose(spec, label);
    var anomer = spec.anomer || 'alpha';
    var stereo = spec.stereo || {};
    var W = 470, H = 320;
    var O = { x: 270, y: 70 };
    var C1 = { x: 345, y: 105 };
    var C2 = { x: 325, y: 180 };
    var C3 = { x: 238, y: 205 };
    var C4 = { x: 160, y: 180 };
    var C5 = { x: 140, y: 105 };
    var out = '';
    // 環の結合（前側は太線）
    out += lineEl(O.x, O.y, C1.x, C1.y, 'rp-struct-bond', 2.3);
    out += lineEl(C1.x, C1.y, C2.x, C2.y, 'rp-struct-bond', 2.3);
    out += lineEl(C2.x, C2.y, C3.x, C3.y, 'rp-struct-bond rp-struct-bond--front', 4.4);
    out += lineEl(C3.x, C3.y, C4.x, C4.y, 'rp-struct-bond rp-struct-bond--front', 4.4);
    out += lineEl(C4.x, C4.y, C5.x, C5.y, 'rp-struct-bond', 2.3);
    out += lineEl(C5.x, C5.y, O.x, O.y, 'rp-struct-bond', 2.3);
    out += textEl(O.x, O.y, 'O', 'rp-struct-atom', 21, 'data-ring-atom="O"');
    // 環の炭素番号
    out += textEl(C1.x - 18, C1.y - 12, '1', 'rp-struct-ring-num', 12);
    out += textEl(C2.x - 16, C2.y - 13, '2', 'rp-struct-ring-num', 12);
    out += textEl(C3.x, C3.y - 16, '3', 'rp-struct-ring-num', 12);
    out += textEl(C4.x + 16, C4.y - 13, '4', 'rp-struct-ring-num', 12);
    out += textEl(C5.x + 18, C5.y - 12, '5', 'rp-struct-ring-num', 12);

    function sub(x, y, dx, dy, text, cls) {
      var tx = x + dx, ty = y + dy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ax = x + dx / len * 14, ay = y + dy / len * 14;
      var bx = tx - dx / len * 10, by = ty - dy / len * 10;
      return lineEl(ax, ay, bx, by, 'rp-struct-bond', 2.0) + textEl(tx, ty, text, cls || 'rp-struct-atom', 18);
    }

    // C1: αは下、βは上（stereo.c1があれば優先）
    var c1Down = (stereo.c1 || (anomer === 'alpha' ? 'down' : 'up')) === 'down';
    out += sub(C1.x, C1.y, 34, c1Down ? 48 : -48, 'OH', 'rp-struct-atom rp-struct-anomer');
    out += sub(C1.x, C1.y, -22, c1Down ? -40 : 40, 'H', 'rp-struct-h');
    // C2 OH下 / H上（stereoに従う）
    var c2Down = (stereo.c2 || 'down') === 'down';
    out += sub(C2.x, C2.y, 0, c2Down ? 46 : -46, 'OH', 'rp-struct-atom');
    out += sub(C2.x, C2.y, -20, c2Down ? -38 : 38, 'H', 'rp-struct-h');
    // C3 OH上 / H下
    var c3Up = (stereo.c3 || 'up') === 'up';
    out += sub(C3.x, C3.y, 0, c3Up ? -46 : 46, 'OH', 'rp-struct-atom');
    out += sub(C3.x, C3.y, 0, c3Up ? 44 : -44, 'H', 'rp-struct-h');
    // C4 OH下 / H上
    var c4Down = (stereo.c4 || 'down') === 'down';
    out += sub(C4.x, C4.y, 0, c4Down ? 46 : -46, 'OH', 'rp-struct-atom');
    out += sub(C4.x, C4.y, c4Down ? 20 : -20, c4Down ? -38 : 38, 'H', 'rp-struct-h');
    // C5 CH2OH上 / H下
    var c5Up = (stereo.c5ch2oh || 'up') === 'up';
    if (c5Up) {
      out += lineEl(C5.x, C5.y, 108, 62, 'rp-struct-bond', 2.0);
      out += textEl(92, 52, 'CH₂OH', 'rp-struct-atom', 18);
      out += sub(C5.x, C5.y, 14, 40, 'H', 'rp-struct-h');
    } else {
      out += lineEl(C5.x, C5.y, 108, 148, 'rp-struct-bond', 2.0);
      out += textEl(92, 158, 'CH₂OH', 'rp-struct-atom', 18);
      out += sub(C5.x, C5.y, 14, -40, 'H', 'rp-struct-h');
    }
    out += textEl(W / 2, 292, 'ハース投影式', 'rp-struct-projection-note', 13);
    return svgOpen(0, 0, W, H, label, 'data-kind="haworth" data-anomer="' + esc(anomer) + '" data-c1oh="' + (c1Down ? 'down' : 'up') +
      '" data-c2oh="' + (c2Down ? 'down' : 'up') + '" data-c3oh="' + (c3Up ? 'up' : 'down') +
      '" data-c4oh="' + (c4Down ? 'down' : 'up') + '" data-c5ch2oh="' + (c5Up ? 'up' : 'down') + '"') + out + '</svg>';
  }

  /* ------------------------------------------------------------------
   * 構造の分子式・検証
   * ------------------------------------------------------------------ */

  function addCount(counts, el, n) {
    counts[el] = (counts[el] || 0) + n;
  }

  function formulaFromCounts(counts) {
    var order = [];
    if (counts.C) order.push('C');
    if (counts.H) order.push('H');
    Object.keys(counts).sort().forEach(function (el) {
      if (el !== 'C' && el !== 'H' && counts[el]) order.push(el);
    });
    return order.map(function (el) {
      return el + (counts[el] === 1 ? '' : counts[el]);
    }).join('');
  }

  function formulaOfGraph(g) {
    var counts = {};
    g.atoms.forEach(function (a) {
      addCount(counts, a.el, 1);
      if (a.h) addCount(counts, 'H', a.h);
    });
    return formulaFromCounts(counts);
  }

  function formulaFromComposition(comp) {
    if (!comp) return null;
    var counts = {};
    Object.keys(comp).forEach(function (el) { counts[el] = comp[el]; });
    return formulaFromCounts(counts);
  }

  function formulaOfStructure(spec) {
    if (!spec) return null;
    if (isGraphSpec(spec)) return formulaOfGraph(buildStructure(spec));
    if (spec.type === 'ring-sub' || spec.type === 'condensed' || spec.type === 'projection' || spec.type === 'triglyceride') {
      return formulaFromComposition(spec.composition);
    }
    if (spec.type === 'schematic') {
      return spec.composition ? formulaFromComposition(spec.composition) : null;
    }
    if (spec.type === 'polymer') return spec.formulaReference || spec.unitFormula || null;
    return null;
  }

  function unitFormula(formula) {
    if (!formula) return formula;
    var m = String(formula).match(/^\((.+)\)n$/);
    return m ? m[1] : String(formula);
  }

  function formulaMatches(computed, declared) {
    if (!computed || !declared) return false;
    return computed === unitFormula(declared);
  }

  function checkValence(g) {
    var errors = [];
    g.atoms.forEach(function (a, i) {
      // 金属配位結合など、通常の原子価の数え方が当てはまらない原子は明示的に除外する。
      if (a.skipValence || a.ion) return;
      var allowed = VALENCES[a.el];
      if (!allowed) return;
      var sum = 0;
      g.bonds.forEach(function (b) {
        if (b.a === i || b.b === i) {
          if (!b.coordinate) sum += b.order;
        }
      });
      var total = sum + (a.h || 0);
      var charge = a.charge === '+' ? 1 : (a.charge === '-' ? -1 : 0);
      var ok = allowed.some(function (v) { return total === v + charge; });
      if (!ok) {
        errors.push('原子' + i + '(' + a.el + ')の結合価が不正: ' + total +
          '（許容: ' + allowed.map(function (v) { return v + charge; }).join('/') + '）');
      }
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function hasCoordination(spec) {
    return !!(spec && spec.bonds && spec.bonds.some(function (b) { return b.coordinate; }));
  }

  function verificationForSpec(spec, formulaStatus) {
    if (!spec) return { level: 'unknown', short: '未確認', label: '構造データ未確認' };
    if (hasCoordination(spec)) {
      return { level: 'coordination', short: '配位結合（原子価検証対象外）', label: '配位結合を含むため原子価の自動検証対象外（分子式・組成のみ確認）' };
    }
    if (formulaStatus === 'variable') {
      if (spec.type === 'schematic') {
        return { level: 'none', short: '模式図（可変組成）', label: '模式図・可変組成（原子レベルの検証対象外。表示式のみ）' };
      }
      if (spec.type === 'polymer' && !(spec.formulaReference || spec.unitFormula)) {
        return { level: 'none', short: '可変組成（原子検証対象外）', label: '可変組成（原子レベルの検証対象外。表示式のみ）' };
      }
      return { level: 'composition', short: '一般式', label: '一般式の基準単位と登録データの整合' };
    }
    if (isGraphSpec(spec)) {
      return { level: 'atom', short: '原子レベル', label: '原子数・結合価・分子式' };
    }
    if (spec.type === 'ring-sub') {
      return { level: 'composition', short: '分子式整合', label: '環＋置換ラベルの分子式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'projection') {
      return { level: 'composition', short: '投影式', label: '投影式の分子式・立体情報整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'condensed') {
      return { level: 'composition', short: '簡略式', label: '簡略式の分子式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'triglyceride') {
      return { level: 'composition', short: '構造式', label: 'トリグリセリドの分子式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'polymer') {
      return { level: 'composition', short: '重合体', label: '繰り返し単位の一般式整合（描画の見た目は自動検証の対象外）' };
    }
    if (spec.type === 'schematic') {
      return { level: 'composition', short: '模式図', label: '模式図の分子式整合（描画の見た目は自動検証の対象外）' };
    }
    return { level: 'unknown', short: '未確認', label: '構造データ未確認' };
  }

  function validate(compound) {
    var errors = [];
    if (!compound) return { ok: false, errors: ['化合物データがありません'], verification: verificationForSpec(null, 'fixed') };
    if (compound.verified === false) errors.push('出典・構造の確認が未完了');
    var variableFormula = !!compound.formulaVariable;
    var figures = compound.figures && compound.figures.length
      ? compound.figures
      : [{ structure: compound.structure }];
    if (!figures.length || !figures[0].structure) errors.push('構造データがありません');
    var computed = null;
    var formulaStatus = variableFormula ? 'variable' : 'fixed';
    figures.forEach(function (fig, idx) {
      var s = fig.structure;
      if (!s) { errors.push('図' + (idx + 1) + 'の構造データがありません'); return; }
      var f;
      try {
        f = formulaOfStructure(s);
      } catch (e) {
        errors.push('図' + (idx + 1) + ': ' + e.message);
        return;
      }
      if (!computed) computed = f;
      if (variableFormula) {
        var reference = compound.formulaReference || (s.type === 'polymer' ? (s.formulaReference || s.unitFormula) : null);
        if (reference) {
          if (f !== reference) {
            errors.push('図' + (idx + 1) + 'の一般式の基準単位が不一致: ' + f + ' != ' + reference);
          }
        } else if (!compound.formulaDisplay) {
          errors.push('図' + (idx + 1) + ': 可変組成の表示式が未登録');
        }
      } else if (!formulaMatches(f, compound.formula)) {
        errors.push('図' + (idx + 1) + 'の分子式が不一致: ' + f + ' != ' + compound.formula);
      }
      if (isGraphSpec(s)) {
        try {
          var v = checkValence(buildStructure(s));
          if (!v.ok) errors.push.apply(errors, v.errors);
        } catch (e2) {
          errors.push('図' + (idx + 1) + ': ' + e2.message);
        }
      }
    });
    var firstSpec = figures[0] && figures[0].structure;
    return {
      ok: errors.length === 0,
      computed: computed,
      declared: compound.formula,
      formulaStatus: formulaStatus,
      coordination: hasCoordination(firstSpec),
      verification: verificationForSpec(firstSpec, formulaStatus),
      errors: errors
    };
  }

  function validateAll(compounds) {
    var out = {};
    Object.keys(compounds || {}).forEach(function (id) {
      out[id] = validate(compounds[id]);
    });
    return out;
  }

  /* ------------------------------------------------------------------
   * 公開レンダリング
   * ------------------------------------------------------------------ */

  function renderStructure(spec, label, opts) {
    opts = opts || {};
    try {
      if (isGraphSpec(spec)) return renderGraph(buildStructure(spec), label);
      if (spec.type === 'ring-sub') return renderRingSub(spec, label, !!opts.simple);
      if (spec.type === 'condensed') return renderCondensed(spec, label);
      if (spec.type === 'triglyceride') return renderTriglyceride(spec, label);
      if (spec.type === 'polymer') return renderPolymer(spec, label);
      if (spec.type === 'schematic') return renderSchematic(spec, label);
      if (spec.type === 'projection') {
        if (spec.kind === 'fischer') return renderFischer(spec, label);
        if (spec.kind === 'haworth') return renderHaworth(spec, label);
      }
      return '<svg class="rp-struct-svg" viewBox="0 0 360 120" role="img" aria-label="' + esc(label || '構造式') + '"><text x="180" y="60" text-anchor="middle" class="rp-struct-atom" font-size="16">構造データ未登録</text></svg>';
    } catch (e) {
      return '<svg class="rp-struct-svg" viewBox="0 0 360 120" role="img" aria-label="構造式を表示できません" data-error="1"><text x="180" y="60" text-anchor="middle" class="rp-struct-atom" font-size="15">構造式を表示できません</text></svg>';
    }
  }

  function renderFigure(compound, fig, idx, forcedCaption, forcedNote) {
    var name = compound.name || '';
    var figLabel = fig.label ? name + '（' + fig.label + '）' : name;
    var svg = renderStructure(fig.structure, figLabel + 'の構造式', { simple: fig.simple });
    var autoNote = '';
    if (!fig.note && fig.structure) {
      if (fig.structure.type === 'triglyceride') autoNote = 'グリセリン骨格と脂肪酸鎖を簡略化して表示しています。';
      else if (fig.structure.type === 'polymer') autoNote = '繰り返し単位と一般式で表示しています。重合度 n は特定しません。';
      else if (fig.structure.type === 'schematic') autoNote = '模式図です。立体配置の詳細は省略しています。';
    }
    var note = forcedNote || fig.note || autoNote;
    var caption = forcedCaption || fig.caption || fig.label || '';
    var longCondensed = !!(fig.structure && fig.structure.type === 'condensed' &&
      (fig.structure.lines || []).some(function (t) { return t.length > 44; }));
    var figAttrs = 'class="rp-struct-fig rp-struct-fig--zoom' + (fig.structure && fig.structure.skeletal ? ' rp-struct-fig--skeletal' : '') +
      (longCondensed ? ' rp-struct-fig--long' : '') + '" data-fig="' + idx + '"' +
      (longCondensed ? ' tabindex="0" aria-label="長い構造式です。カード内では全体を縮小表示し、拡大ボタンで読めます。"' : '');
    return '<figure ' + figAttrs + '>' +
      '<div class="rp-struct-fig__canvas">' + svg + '</div>' +
      '<div class="rp-struct-fig__bar">' +
      (caption ? '<figcaption class="rp-struct-fig__caption">' + esc(caption) + '</figcaption>' : '<span></span>') +
      '<button type="button" class="rp-struct-fig__zoom-btn" data-zoom="1" aria-haspopup="dialog">拡大</button>' +
      '</div>' +
      (note ? '<p class="rp-struct-fig__note">' + esc(note) + '</p>' : '') +
      '</figure>';
  }

  function renderCompound(compound, opts) {
    opts = opts || {};
    if (!compound) return '';
    var plan = figurePlan(compound);
    if (plan.mode === 'multi') {
      return plan.figures.map(function (fig, idx) { return renderFigure(compound, fig, idx); }).join('') +
        (plan.exception && plan.exception.reason ? '<p class="rp-struct-fig__note">' + esc(plan.exception.reason) + '</p>' : '');
    }
    if (plan.mode === 'dual') {
      return renderFigure(compound, plan.full, 0) + renderFigure(compound, plan.simple, 1);
    }
    if (plan.single) return renderFigure(compound, plan.single, 0);
    return '';
  }

  function formatFormula(plain) {
    if (!plain) return '情報未登録';
    var out = '';
    for (var i = 0; i < plain.length; i++) {
      var ch = plain[i];
      if (/[0-9]/.test(ch) && i > 0 && /[A-Za-z)0-9]/.test(plain[i - 1])) {
        out += SUB_DIGIT[Number(ch)];
      } else if (ch === 'n' && i > 0 && plain[i - 1] === ')') {
        out += 'ₙ';
      } else {
        out += ch;
      }
    }
    return out;
  }

  function buildGroupPreview(groupId, label) {
    if (groupId === 'none') {
      return '<svg class="rp-struct-svg rp-struct-group-svg" viewBox="0 0 220 100" role="img" aria-label="追加なし"><text x="110" y="50" text-anchor="middle" dominant-baseline="middle" class="rp-struct-group-none" font-size="18">追加なし</text></svg>';
    }
    var g = { atoms: [atom('C', 55, 55, 1, { label: 'R' })], bonds: [], mode: 'condensed', width: 220, height: 100 };
    addGroup(g, 0, groupId, 0);
    // 左端は「炭素骨格との結合位置」を表すR。Hは描かない。
    g.atoms[0].label = 'R';
    return renderGraph(g, label || '官能基');
  }

  /*
   * app11 追加: 表示実態と見出しを一致させるための表示計画。
   * figurePlan の exception.type だけで「骨格式」と決めず、実際に描く spec が
   * graph（skeletal）か condensed かを見て分類する。原子数上限で graph が
   * 破棄されている場合も、正本の condensed から作られた graphTooLarge を
   * 結合価検証してから骨格式として描く。作れない場合だけ示性式fallbackにする。
   */
  function skeletalSpecFromGraph(source, layoutChain, keepStereo) {
    if (!source) return null;
    var g = {
      atoms: (source.atoms || []).map(function (a) { return Object.assign({}, a); }),
      bonds: (source.bonds || []).map(function (b) {
        var bond = Object.assign({}, b);
        if (b.ringCenter) bond.ringCenter = { x: b.ringCenter.x, y: b.ringCenter.y };
        return bond;
      }),
      mode: 'condensed',
      skeletal: true,
      width: source.width || 440,
      height: source.height || 320
    };
    // 元graph（carminic-acid / carthamin / heme など）は検証済みの座標をそのまま使う。
    // 新しい正規化は、condensed から作った単純な直鎖脂肪族だけに限定する。
    if (layoutChain === false) return graphAsSpec(g, 'condensed', true);
    if (keepStereo) return graphAsSpec(g, 'condensed', true);

    var carbonIndexes = [];
    g.atoms.forEach(function (a, i) { if (a.el === 'C') carbonIndexes.push(i); });
    if (carbonIndexes.length < 2) return null;
    var carbonSet = new Set(carbonIndexes);
    var carbonAdj = new Map();
    carbonIndexes.forEach(function (i) { carbonAdj.set(i, []); });
    g.bonds.forEach(function (bond) {
      if (carbonSet.has(bond.a) && carbonSet.has(bond.b)) {
        carbonAdj.get(bond.a).push(bond.b);
        carbonAdj.get(bond.b).push(bond.a);
      }
    });

    // 炭素部分グラフが1つのpath（非環・枝分岐なし）のときだけ、全体を一度に配置する。
    var seen = new Set();
    var stack = [carbonIndexes[0]];
    var component = [];
    seen.add(carbonIndexes[0]);
    while (stack.length) {
      var current = stack.pop();
      component.push(current);
      carbonAdj.get(current).forEach(function (next) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      });
    }
    if (component.length !== carbonIndexes.length) return null;
    var maxDegree = Math.max.apply(null, carbonIndexes.map(function (i) { return carbonAdj.get(i).length; }));
    var carbonBondCount = 0;
    g.bonds.forEach(function (bond) { if (carbonSet.has(bond.a) && carbonSet.has(bond.b)) carbonBondCount++; });
    if (maxDegree > 2 || carbonBondCount !== carbonIndexes.length - 1) return null;

    // path の端点から結合をたどり、炭素の並び順を固定する。
    // hetero 枝を持つ端を終点側に回し、枝が炭素鎖の内側へ入らないようにする。
    var endpoints = carbonIndexes.filter(function (i) { return carbonAdj.get(i).length === 1; });
    if (endpoints.length !== 2) return null;
    function heteroNeighbors(i) {
      var count = 0;
      g.bonds.forEach(function (bond) {
        if (bond.a === i && !carbonSet.has(bond.b)) count++;
        else if (bond.b === i && !carbonSet.has(bond.a)) count++;
      });
      return count;
    }
    endpoints.sort(function (a, b) {
      var ha = heteroNeighbors(a);
      var hb = heteroNeighbors(b);
      if (ha !== hb) return ha - hb;
      return g.atoms[a].x - g.atoms[b].x;
    });
    var start = endpoints[0];
    if (start == null) return null;
    var path = [start];
    var previous = null;
    var cursor = start;
    while (path.length < carbonIndexes.length) {
      var next = carbonAdj.get(cursor).filter(function (i) { return i !== previous; })[0];
      if (next == null || path.indexOf(next) !== -1) return null;
      path.push(next);
      previous = cursor;
      cursor = next;
    }

    var sumY = path.reduce(function (sum, i) { return sum + g.atoms[i].y; }, 0);
    var lineY = sumY / path.length;
    var spacing = Math.min(52, 900 / Math.max(1, path.length - 1));
    var startX = 120;
    var first = path[0];
    var last = path[path.length - 1];
    var vx = g.atoms[last].x - g.atoms[first].x;
    var vy = g.atoms[last].y - g.atoms[first].y;
    var pathLength = Math.hypot(vx, vy);
    if (pathLength < 1e-6) return null;
    var targetLength = spacing * (path.length - 1);
    var scale = targetLength / pathLength;
    var angle = -Math.atan2(vy, vx);
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var origin = { x: g.atoms[first].x, y: g.atoms[first].y };
    g.atoms.forEach(function (a) {
      var dx = a.x - origin.x;
      var dy = a.y - origin.y;
      a.x = startX + (dx * cos - dy * sin) * scale;
      a.y = lineY + (dx * sin + dy * cos) * scale;
    });
    var hasDouble = false;
    var doubleAtoms = {};
    g.bonds.forEach(function (bond) {
      if (bond.order === 2 && carbonSet.has(bond.a) && carbonSet.has(bond.b)) {
        hasDouble = true;
        doubleAtoms[bond.a] = true;
        doubleAtoms[bond.b] = true;
      }
    });

    var deltas = new Map();
    path.forEach(function (i, order) {
      var targetY = hasDouble ? lineY : lineY + (order % 2 ? -18 : 18);
      var targetX = startX + order * spacing;
      deltas.set(i, { x: targetX - g.atoms[i].x, y: targetY - g.atoms[i].y });
      g.atoms[i].x = targetX;
      g.atoms[i].y = targetY;
      if (hasDouble) g.atoms[i].vertex = true;
      if (hasDouble && doubleAtoms[i] && !g.atoms[i].label) {
        g.atoms[i].label = labelFor(g.atoms[i], 'condensed');
      }
    });

    // 炭素鎖に結合する hetero 原子（O/Na/S など）は、所属する炭素の移動量だけ
    // まとめて平行移動し、元の結合角・枝の形・ラベル配置を保つ。
    var visited = new Set(path);
    var queue = path.slice();
    while (queue.length) {
      var from = queue.shift();
      var delta = deltas.get(from);
      g.bonds.forEach(function (bond) {
        var next = bond.a === from ? bond.b : (bond.b === from ? bond.a : null);
        if (next == null || visited.has(next)) return;
        visited.add(next);
        deltas.set(next, delta);
        queue.push(next);
      });
    }
    g.atoms.forEach(function (a, i) {
      if (visited.has(i) && path.indexOf(i) === -1) {
        var d = deltas.get(i);
        a.x += d.x;
        a.y += d.y;
      }
    });

    var bounds = graphContentBounds(g);
    g.width = Math.max(1, bounds.maxX - bounds.minX);
    g.height = Math.max(1, bounds.maxY - bounds.minY);
    return graphAsSpec(g, 'condensed', true);
  }

  function hasSpecifiedStereo(compound) {
    var spec = compound && compound.structure;
    if (!spec) return false;
    if (spec.stereo) return true;
    if (spec.type === 'projection') return true;
    var lines = (spec.lines || []).join(' ');
    return /シス|トランス|cis|trans/i.test(lines);
  }

  function skeletalSpecFromCompound(compound, keepStereo) {
    var parsed = condensedGraphFor(compound);
    var source = parsed.graph || parsed.graphTooLarge;
    if (!source) return null;
    var valence = checkValence(source);
    if (!valence.ok) return null;
    return skeletalSpecFromGraph(source, true, keepStereo);
  }

  function structureView(compound) {
    if (!compound || !compound.structure) {
      return { kind: 'missing', caption: '構造データ未整備', note: '構造データが未整備です。式だけを構造式として表示しません。', figures: [] };
    }
    var plan = figurePlan(compound);
    if (!plan) {
      return { kind: 'missing', caption: '構造データ未整備', note: '構造データを確認できませんでした。', figures: [] };
    }
    if (plan.mode === 'multi') {
      return {
        kind: 'projection',
        caption: '投影式',
        note: '立体配置を含む投影式です。',
        figures: (plan.figures || []).map(function (fig) {
          return { structure: fig.structure, label: fig.label || '投影式', note: fig.note || '' };
        })
      };
    }
    if (plan.mode === 'dual' && plan.full && plan.full.structure) {
      return { kind: 'structure', caption: '構造式', note: '', figures: [{ structure: plan.full.structure, label: '' }] };
    }
    var kind = plan.exception && plan.exception.type;
    var single = plan.single && plan.single.structure;
    if (kind === 'atom-limit') {
      var keepStereo = hasSpecifiedStereo(compound);
      var skeletal = null;
      if (isGraphSpec(single)) {
        var graphSource = buildStructure(single);
        if (checkValence(graphSource).ok) skeletal = skeletalSpecFromGraph(graphSource, false, keepStereo);
      } else {
        skeletal = skeletalSpecFromCompound(compound, keepStereo);
      }
      if (skeletal) {
        return {
          kind: 'skeletal',
          caption: '骨格式（水素原子省略）',
          note: '水素原子を省略した炭素骨格です。',
          figures: [{ structure: skeletal, label: '' }]
        };
      }
      if (single) {
        return {
          kind: 'fallback',
          caption: '示性式（結合図未対応）',
          note: '炭素骨格の結合図に対応していないため、示性式のみを表示しています。',
          figures: [{ structure: single, label: '' }]
        };
      }
      return { kind: 'fallback', caption: '示性式（結合図未対応）', note: '結合図にも示性式にも対応していません。', figures: [] };
    }
    if (kind === 'stereo' || kind === 'complex') {
      return {
        kind: 'fallback',
        caption: '示性式（詳細構造なし）',
        note: '詳細構造は未収録です。示性式のみを表示しています。',
        figures: single ? [{ structure: single, label: '' }] : []
      };
    }
    var labels = {
      projection: ['投影式', '立体配置を含む投影式です。'],
      triglyceride: ['油脂の簡略図', 'グリセリン骨格と脂肪酸鎖を簡略化した図です。'],
      schematic: ['模式図', '模式図です。立体配置の詳細は省略しています。'],
      polymer: ['繰り返し単位', '繰り返し単位です。重合度 n は特定しません。']
    };
    if (single && labels[kind]) {
      return {
        kind: kind,
        caption: labels[kind][0],
        note: labels[kind][1],
        figures: [{ structure: single, label: '' }]
      };
    }
    if (single) {
      return { kind: 'structure', caption: '構造図', note: '', figures: [{ structure: single, label: '' }] };
    }
    return { kind: 'missing', caption: '構造データ未整備', note: '構造データが未整備です。', figures: [] };
  }

  return {
    SKELETONS: SKELETONS,
    buildStructure: buildStructure,
    formulaOfStructure: formulaOfStructure,
    formulaOfGraph: formulaOfGraph,
    formulaFromComposition: formulaFromComposition,
    formulaFromCounts: formulaFromCounts,
    formulaMatches: formulaMatches,
    unitFormula: unitFormula,
    validate: validate,
    validateAll: validateAll,
    renderStructure: renderStructure,
    renderCompound: renderCompound,
    figurePlan: figurePlan,
    structureView: structureView,
    skeletalSpecFromCompound: skeletalSpecFromCompound,
    hasSpecifiedStereo: hasSpecifiedStereo,
    figureAudit: figureAudit,
    condensedTextFor: condensedTextFor,
    GRAPH_ATOM_LIMIT: GRAPH_ATOM_LIMIT,
    FIGURE_EXCEPTION_REASONS: FIGURE_EXCEPTION_REASONS,
    condensedGraphFor: condensedGraphFor,
    formatFormula: formatFormula,
    renderGroupPreview: buildGroupPreview,
    renderFunctionalFigure: renderFunctionalFigure,
    svgGeometry: svgGeometry,
    wrapCondensedText: wrapCondensedText,
    chemBreakable: chemBreakable,
    // テスト・ブラウザ検証用（SVGのviewBoxと内容bboxの一致確認）
    _internal: {
      chooseDirection: chooseDirection,
      hDirections: hDirections,
      checkValence: checkValence,
      labelFor: labelFor,
      graphContentBounds: graphContentBounds,
      graphBounds: graphBounds,
      condensedBreakPoints: condensedBreakPoints,
      functionalGraph: functionalGraph
    }
  };
});
