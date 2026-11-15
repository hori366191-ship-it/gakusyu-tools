/**
 * 有機反応マップ（site/app11）— 12分類一般図の配置検査
 *
 * 実行:
 *   node scripts/app11/check-class-map-layout.cjs            # 正本 class-map.json を検査
 *   node scripts/app11/check-class-map-layout.cjs --json     # 指標だけを JSON で出す
 *
 * 見るもの（app11-class-map.test.cjs と同じ規則を、正本そのものに対して行う）:
 *   - ノードが枠内・相互に非重複
 *   - 変換線が枠内、端点が分類の辺、ノード貫通・交差・重なりなし
 *   - ラベル矩形が枠内、ノード・線・他ラベルと衝突しない
 *   - 旧配置（frame 4116,1526 1930x782）との面積・辺長・余白の比較
 *   - 直前版（frame 1580x690 / 辺総長2950）からの辺長短縮の比較
 * 座標を詰めるときの確認用。data.js の再生成は build-map-data.cjs が行う。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'site-src', 'app11');
const G = require('./geometry.cjs');

const OLD = {
  area: { x: 4110, y: 1520, w: 1942, h: 794 },
  frame: { x: 4116, y: 1526, w: 1930, h: 782 },
  nodeBox: 1650 * 640,
  edgeLength: 3575
};
// 直前版（frame 1580x690 / 辺総長 2950）。今回の圧縮はここからの短縮で評価する。
const PREV = {
  frame: { w: 1580, h: 690 },
  edgeLength: 2950
};
// 一般図の外にある具体図（styrene/vinyl chloride/PVC/caprolactam/nylon6）の右端と、
// 分野見出しの棚の下端。frame はここから離す。
const NEIGHBOR = { right: 4103.5, shelfBottom: 1512 };
const MIN_GAP = 60;
const CANVAS = { x: 0, y: 0, w: 6052, h: 2314 };

function p(pt) { return { x: pt[0], y: pt[1] }; }

function edgeSegments(edge) {
  return G.polylineSegments(edge.points.map(p));
}

function labelBox(edge) {
  const lines = [edge.label, edge.conditions].filter(Boolean);
  const w = Math.max(...lines.map((text) => G.textWidth(text, 10.5))) + 4;
  const h = 12 * lines.length + 4;
  const x = edge.labelPos.anchor === 'middle'
    ? edge.labelPos.x - w / 2
    : edge.labelPos.anchor === 'end' ? edge.labelPos.x - w : edge.labelPos.x;
  return { x, y: edge.labelPos.y - 10, w, h };
}

function inspect(cm) {
  const frame = cm.frame;
  const nodes = new Map(cm.nodes.map((n) => [n.id, n]));
  const problems = [];
  const fail = (msg) => problems.push(msg);

  // ノード
  cm.nodes.forEach((a) => {
    if (a.x < frame.x || a.y < frame.y ||
      a.x + a.w > frame.x + frame.w || a.y + a.h > frame.y + frame.h) {
      fail('ノードが枠外: ' + a.id);
    }
    if (G.textWidth(a.name, 14) + 12 > a.w) fail('分類名が収まらない: ' + a.id);
  });
  for (let i = 0; i < cm.nodes.length; i += 1) {
    for (let j = i + 1; j < cm.nodes.length; j += 1) {
      if (G.rectsOverlap(cm.nodes[i], cm.nodes[j])) {
        fail('ノードが重なる: ' + cm.nodes[i].id + ' / ' + cm.nodes[j].id);
      }
    }
  }

  // 変換線
  const edges = cm.edges.map((e) => ({ ...e, segs: edgeSegments(e) }));
  let edgeLength = 0;
  edges.forEach((e) => {
    edgeLength += G.polylineLength(e.points.map(p));
    e.points.forEach((pt) => {
      if (pt[0] < frame.x || pt[0] > frame.x + frame.w ||
        pt[1] < frame.y || pt[1] > frame.y + frame.h) {
        fail('変換線が枠外: ' + e.id);
      }
    });
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) { fail('端点の分類が未定義: ' + e.id); return; }
    if (G.distPointRect(p(e.points[0]), from) > 0.01) fail('始点が分類の辺にない: ' + e.id);
    if (G.distPointRect(p(e.points[e.points.length - 1]), to) > 0.01) fail('終点が分類の辺にない: ' + e.id);
    cm.nodes.forEach((n) => {
      const inner = { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 };
      e.segs.forEach((s) => {
        if (G.segmentRect(s.a, s.b, inner)) fail('変換線が貫通: ' + e.id + ' / ' + n.id);
      });
    });
  });
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i];
      const b = edges[j];
      a.segs.forEach((sa) => b.segs.forEach((sb) => {
        if (G.segSegIntersection(sa.a, sa.b, sb.a, sb.b)) fail('線の交差: ' + a.id + ' / ' + b.id);
        if (G.collinearOverlap(sa.a, sa.b, sb.a, sb.b) > 0.1) fail('線の重なり: ' + a.id + ' / ' + b.id);
      }));
    }
  }

  // ラベル
  const boxes = edges.map((e) => ({ id: e.id, ...labelBox(e) }));
  boxes.forEach((b) => {
    if (b.x < frame.x || b.y < frame.y ||
      b.x + b.w > frame.x + frame.w || b.y + b.h > frame.y + frame.h) {
      fail('ラベルが枠外: ' + b.id);
    }
    cm.nodes.forEach((n) => {
      if (G.rectsOverlap(b, n)) fail('ラベルとノード: ' + b.id + ' / ' + n.id);
      const textBox = { x: n.x + 8, y: n.y + 8, w: n.w - 16, h: n.h - 16 };
      if (G.rectsOverlap(b, textBox)) fail('ラベルと分類名: ' + b.id + ' / ' + n.id);
    });
    edges.forEach((e) => {
      e.segs.forEach((s) => {
        if (G.segmentRect(s.a, s.b, b)) fail('ラベルと線: ' + b.id + ' / ' + e.id);
      });
    });
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (G.rectsOverlap(boxes[i], boxes[j])) fail('ラベル同士: ' + boxes[i].id + ' / ' + boxes[j].id);
    }
  }
  // 矢印の先端は分類名の矩形に入らない
  edges.forEach((e) => {
    const to = nodes.get(e.to);
    const tip = p(e.points[e.points.length - 1]);
    const textBox = { x: to.x + 8, y: to.y + 8, w: to.w - 16, h: to.h - 16 };
    if (G.pointInRect(tip, textBox)) fail('矢印が分類名へ入る: ' + e.id);
  });

  // 見出し（HTML overlay: frame.x+28, frame.y+24, 250x40）とノード・線の衝突
  const heading = { x: frame.x + 28, y: frame.y + 24, w: 250, h: 40 };
  cm.nodes.forEach((n) => {
    if (G.rectsOverlap(heading, n)) fail('見出しとノード: ' + n.id);
  });
  edges.forEach((e) => {
    e.segs.forEach((s) => {
      if (G.segmentRect(s.a, s.b, heading)) fail('見出しと変換線: ' + e.id);
      if (G.segmentRect(s.a, s.b, { x: heading.x - 6, y: heading.y - 6, w: heading.w + 12, h: heading.h + 12 })) {
        fail('見出しの余白と変換線: ' + e.id);
      }
    });
  });

  // 枠の外側（具体図・棚）との距離
  const leftGap = frame.x - NEIGHBOR.right;
  const topGap = frame.y - NEIGHBOR.shelfBottom;
  if (leftGap < MIN_GAP) fail('左の具体図との間隔: ' + leftGap.toFixed(1));
  if (topGap < MIN_GAP) fail('上の棚との間隔: ' + topGap.toFixed(1));

  const xs = cm.nodes.map((n) => n.x).concat(cm.nodes.map((n) => n.x + n.w));
  const ys = cm.nodes.map((n) => n.y).concat(cm.nodes.map((n) => n.y + n.h));
  const nodeBox = { x: Math.min(...xs), y: Math.min(...ys) };
  nodeBox.w = Math.max(...xs) - nodeBox.x;
  nodeBox.h = Math.max(...ys) - nodeBox.y;

  return {
    problems,
    metrics: {
      frame,
      area: cm.area,
      frameArea: frame.w * frame.h,
      oldFrameArea: OLD.frame.w * OLD.frame.h,
      frameAreaRatio: (frame.w * frame.h) / (OLD.frame.w * OLD.frame.h),
      edgeLength,
      oldEdgeLength: OLD.edgeLength,
      edgeLengthRatio: edgeLength / OLD.edgeLength,
      prevEdgeLength: PREV.edgeLength,
      prevEdgeLengthRatio: edgeLength / PREV.edgeLength,
      prevFrameAreaRatio: (frame.w * frame.h) / (PREV.frame.w * PREV.frame.h),
      nodeBox,
      margins: {
        left: nodeBox.x - frame.x,
        top: nodeBox.y - frame.y,
        right: frame.x + frame.w - (nodeBox.x + nodeBox.w),
        bottom: frame.y + frame.h - (nodeBox.y + nodeBox.h)
      },
      neighborGap: { left: leftGap, top: topGap },
      canvas: CANVAS,
      inCanvas: frame.x >= CANVAS.x && frame.y >= CANVAS.y &&
        frame.x + frame.w <= CANVAS.x + CANVAS.w && frame.y + frame.h <= CANVAS.y + CANVAS.h
    }
  };
}

function main() {
  const arg = process.argv.find((a) => a.startsWith('--file='));
  const file = arg ? path.resolve(arg.slice('--file='.length)) : path.join(SRC, 'class-map.json');
  const cm = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = inspect(cm);
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const m = result.metrics;
    const pad = (v) => (Math.round(v * 10) / 10).toFixed(1);
    console.log('frame   ' + [m.frame.x, m.frame.y, m.frame.w, m.frame.h].join(', ') +
      '  area ' + m.frameArea + ' (' + pad(m.frameAreaRatio * 100) + '% of old)');
    console.log('area    ' + [m.area.x, m.area.y, m.area.w, m.area.h].join(', '));
    console.log('nodes   ' + [m.nodeBox.x, m.nodeBox.y, m.nodeBox.w, m.nodeBox.h].join(', ') +
      '  margins L' + pad(m.margins.left) + ' T' + pad(m.margins.top) +
      ' R' + pad(m.margins.right) + ' B' + pad(m.margins.bottom));
    console.log('edges   length ' + pad(m.edgeLength) + ' (' + pad(m.edgeLengthRatio * 100) + '% of old, ' +
      pad(m.prevEdgeLengthRatio * 100) + '% of prev ' + m.prevEdgeLength + ')');
    console.log('gaps    left ' + pad(m.neighborGap.left) + '  top ' + pad(m.neighborGap.top) +
      '  canvas ' + (m.inCanvas ? 'ok' : 'OUT'));
    if (result.problems.length) {
      console.log('\nNG ' + result.problems.length);
      result.problems.forEach((msg) => console.log(' - ' + msg));
      process.exitCode = 1;
    } else {
      console.log('\nOK');
    }
  }
}

if (require.main === module) main();

module.exports = { inspect, labelBox, OLD, NEIGHBOR, MIN_GAP, CANVAS };
