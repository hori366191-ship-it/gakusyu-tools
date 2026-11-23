import { BODIES, TAU, orbitalPoint, positionAt } from './bodies.mjs';
import { chartProjection } from './views.mjs';

const element = (name, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const assign = (node, attrs) => {
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, typeof value === 'number' ? value.toFixed(2) : value);
};

export function createOrbitChart(svg, frame, zoom) {
  const guide = element('g', { class: 'chart-guide' });
  const crossX = element('line'), crossY = element('line');
  const bar = element('path'), measure = element('text');
  const paths = element('g', { class: 'chart-paths' });
  const labels = element('g', { class: 'chart-labels' });
  const dots = element('g', { class: 'chart-dots' });
  guide.append(crossX, crossY, bar, measure);
  svg.append(guide, paths, labels, dots);
  const items = BODIES.map((body, i) => {
    const path = i === 0 ? undefined : element('path');
    if (path) {
      path.style.stroke = body.color;
      path.dataset.orbit = body.id;
      paths.append(path);
    }
    const leader = element('line'), label = element('text'), dot = element('circle');
    dot.dataset.marker = body.id;
    dot.style.fill = label.style.fill = body.color;
    label.textContent = body.name;
    assign(dot, { r: i === 0 ? 4.4 : 2.9 });
    labels.append(leader, label);
    dots.append(dot);
    return {
      body, path, leader, label, dot,
      track: path && Array.from({ length: 180 }, (_, k) => orbitalPoint(body, TAU * k / 180)),
    };
  });
  let width = 0, height = 0, bounds, projection;
  let inner = false, last = 0, liveScene = false;

  function frameBounds() {
    const box = frame.getBoundingClientRect(), viewport = svg.getBoundingClientRect();
    return {
      left: box.left - viewport.left, top: box.top - viewport.top,
      width: box.width, height: box.height,
    };
  }

  function size() {
    if (svg.clientWidth === 0 || svg.clientHeight === 0) return;
    width = svg.clientWidth;
    height = svg.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    bounds = frameBounds();
    if (bounds.width < 1 || bounds.height < 1) return;
    projection = chartProjection(bounds.width, bounds.height, inner);
    const [x, y] = projectFlat([0, 0, 0]);
    const r = Math.min(bounds.width, bounds.height) * .47;
    assign(crossX, { x1: x-r, y1: y, x2: x+r, y2: y });
    assign(crossY, { x1: x, y1: y-r, x2: x, y2: y+r });
    const au = inner ? .5 : 10;
    const length = projection.unit * au;
    const bx = bounds.left + 13, by = bounds.top + bounds.height - 8;
    bar.setAttribute('d', `M${bx} ${by-3}v6m0 -3h${length}m0 -3v6`);
    assign(measure, { x: bx, y: by-7 });
    measure.textContent = `${au} AU`;
    if (!liveScene) for (const [i, { path, track }] of items.entries()) {
      if (path) {
        path.style.display = inner && i > 4 ? 'none' : '';
        const points = track.map(point => projectFlat(point).map(n => n.toFixed(2)).join(' '));
        path.setAttribute('d', `M ${points.join(' L ')} Z`);
      }
    }
    update(last);
  }

  function projectFlat(point) {
    const [x, y] = projection.point(point);
    return [x + bounds.left, y + bounds.top];
  }

  function update(days) {
    last = days;
    if (!projection || liveScene) return;
    present(items.map(({ body }) => projectFlat(positionAt(body, days))), { overview: true, opacity: 1 });
  }

  // In 3D mode coordinates come directly from the render camera, not the
  // fallback orbit diagram. Dots and text are screen-size annotations only.
  function present(positions, { overview, opacity, target, moving }) {
    if (!projection) return;
    guide.style.display = overview && !moving ? '' : 'none';
    const [cx, cy] = positions[0] || projectFlat([0, 0, 0]);
    labels.style.opacity = dots.style.opacity = opacity;
    items.forEach(({ body, leader, label, dot }, i) => {
      const mark = positions[i];
      const show = opacity > .015 && mark && (!overview || !inner || i <= 4)
        && (!target || body.id === target)
        && mark[0] >= -6 && mark[0] <= width + 6 && mark[1] >= -6 && mark[1] <= height + 6;
      for (const node of [leader, label, dot]) node.style.display = show ? '' : 'none';
      if (!show) return;
      const [x, y] = mark;
      assign(dot, { cx: x, cy: y });
      let lx, ly, left;
      if (overview && !moving && !inner && i <= 5) {
        // At a true overview scale the inner system is very crowded.
        // Place legible labels away from it, without displacing marker dots.
        left = i <= 2;
        const separation = Math.min(60, Math.max(32, bounds.width * .11));
        lx = cx + separation * (left ? -1 : 1);
        ly = cy + (i % 3 - 1) * 21;
      } else {
        left = x < cx - 4;
        lx = x + (left ? -10 : 10);
        ly = y + (i === 0 ? -11 : -7);
        const x0 = overview ? bounds.left : 0;
        const span = overview ? bounds.width : width;
        const inset = Math.max(53, span * .155);
        if (lx < x0 + inset) { lx = x + 10; left = false; }
        else if (lx > x0 + span - inset) { lx = x - 10; left = true; }
        ly = Math.max(12, Math.min(ly, height - 21));
      }
      assign(label, { x: lx, y: ly + 4, 'text-anchor': left ? 'end' : 'start' });
      assign(leader, { x1: x, y1: y, x2: lx + (left ? 4 : -4), y2: ly });
    });
  }

  function setInner(value) {
    if (inner === value) return;
    inner = value;
    zoom.setAttribute('aria-pressed', String(inner));
    zoom.textContent = inner ? '全軌道を表示' : '内惑星を拡大';
    svg.setAttribute('aria-label', inner
      ? '太陽と内惑星4つの軌道を地球の公転面の真上から拡大表示。印は実寸ではありません。'
      : '太陽と8惑星の軌道を地球の公転面の真上から実際の距離比で表示。印は実寸ではありません。');
    size();
  }
  zoom.addEventListener('click', () => setInner(!inner));
  const observer = new ResizeObserver(size);
  observer.observe(svg);
  observer.observe(frame);
  size();
  return {
    frameBounds, present, inner: () => inner, reset: () => setInner(false),
    useScene() { liveScene = true; paths.style.display = 'none'; },
    useFallback() {
      liveScene = false;
      paths.style.display = '';
      size();
    },
  };
}
