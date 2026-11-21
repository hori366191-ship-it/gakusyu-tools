/*
 * app11/3d 球ビュー — 画面制御
 *
 * 公開版 app.js の DOM 構造・検索・凡例・詳細委譲の考え方を踏襲しつつ、
 * 球ビュー専用に次を差し替える:
 *   - layout3d.js の代わりに sphere-layout.js（Fibonacci 球＋測地分野割当）
 *   - カメラは sphere-camera.js（球の外 / 球の中、パンなし）
 *   - 表示計画は公開 renderer をそのまま使い、sphere-render.js で裏面カリングと
 *     球のガイドだけを外側から加える
 *   - 反応式カードは CSS と equation-fit.js で「初期は収める／明示的拡大」
 *
 * アイドル時のアニメーションループは持たない（入力・遷移中だけ rAF）。
 */
(function () {
  'use strict';

  var P = window.RP3DProjection;
  var C = window.RP3DSphereCamera || null;
  var L = window.RP3DSphereLayout;
  var ST = window.RP3DSphereTerritory || null;
  var SR = window.RP3DSphereRender;
  var S = window.RP3DScene;
  var R = window.RP3DRenderer;
  var I = window.RP3DInteraction;
  var G = window.RP3DSphereInput;
  var DOCK = window.RP3DSphereDock || null;
  var EQ = window.RP3DEquationFit;

  var LAYER = 'academic';
  var REFOCUS_MS = 400;
  var REFOCUS_FADE_MS = 240;
  var REFOCUS_MS_REDUCED = 0;
  var REVEAL_MS = (SR && SR.REVEAL_MS) || 900;

  var model = null;
  var layout = null;
  // 球面の分野テリトリー（起動時に一度だけ構築する）。
  var territory = null;
  var regionIndexById = Object.create(null);
  var ctx = null;
  var canvas = null;
  var els = {};
  var frameRequested = 0;
  var reducedMotionQuery = null;

  var state = {
    mode: 'outside',
    camera: null,
    outsideDistance: null,
    outsideFov: null,
    query: '',
    selectedId: null,
    showUnconnectedOnly: false,
    region: null,
    results: [],
    resultIndex: -1,
    plan: null,
    refocus: null,
    switching: false,
    userAdjusted: false,
    centerRect: null,
    xray: null,
    virtualSignature: '',
    dock: null,
    dockOffset: '',
    dockTop: '',
    dockMaxHeight: '',
    reveal: null
  };

  function $(id) { return document.getElementById(id); }

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function announce(text) {
    if (els.live) els.live.textContent = text || '';
  }

  function prefersReducedMotion() {
    if (!reducedMotionQuery && typeof window.matchMedia === 'function') {
      reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return !!(reducedMotionQuery && reducedMotionQuery.matches);
  }

  function viewport() {
    var width = Math.max(1, canvas.clientWidth || window.innerWidth);
    var height = Math.max(1, canvas.clientHeight || window.innerHeight);
    return { width: width, height: height, dpr: Math.min(2, window.devicePixelRatio || 1) };
  }

  function requestRender() {
    if (frameRequested) return;
    frameRequested = window.requestAnimationFrame(function (timestamp) {
      frameRequested = 0;
      render(timestamp);
    });
  }

  // ---------------- 使える領域（公開版と同じ実測ベース） ----------------

  function rectOf(el) {
    if (!el || el.hidden) return null;
    var box = el.getBoundingClientRect();
    var c = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    return { x: box.left - c.left, y: box.top - c.top, width: box.width, height: box.height };
  }

  function panelRects() {
    return {
      header: els.head ? rectOf(els.head) : null,
      toolbar: els.toolbar ? rectOf(els.toolbar) : null,
      detail: els.detail ? rectOf(els.detail) : null
    };
  }

  function usableArea() {
    return P.computeUsableViewport(viewport(), panelRects());
  }

  // 詳細カードのドックを、detail 自身を除いた「地図の実表示領域」の縦横比で決める。
  // detail の矩形は判定に入れないので、right↔bottom の切替で判定が変わらない。
  // ヘッダ・ツールバー（凡例の開閉を含む）の実測が変われば net 領域も追従する。
  function applyDetailDock() {
    var vp = viewport();
    var headRect = els.head ? rectOf(els.head) : null;
    var toolbarRect = els.toolbar ? rectOf(els.toolbar) : null;
    var net;
    var next;
    var offset;
    if (DOCK) {
      net = DOCK.netMapRect(vp, headRect, toolbarRect);
      next = DOCK.chooseDock(net);
      offset = DOCK.bottomOffset(vp.height, toolbarRect, 10);
    } else {
      var top = headRect ? Math.max(0, headRect.y + headRect.height) : 0;
      var bottom = toolbarRect ? Math.min(vp.height, toolbarRect.y) : vp.height;
      if (!(bottom > top)) { top = 0; bottom = vp.height; }
      net = { x: 0, y: top, width: vp.width, height: Math.max(1, bottom - top) };
      next = net.height > net.width ? 'bottom' : 'right';
      offset = toolbarRect && toolbarRect.height > 0
        ? Math.min(vp.height - 10, vp.height - toolbarRect.y + 10)
        : 10;
    }
    if (state.dock !== next) {
      state.dock = next;
      if (els.app) {
        els.app.classList.toggle('r3d-dock-bottom', next === 'bottom');
        els.app.classList.toggle('r3d-dock-right', next === 'right');
      }
    }
    var offsetCss = Math.round(offset) + 'px';
    if (els.app && state.dockOffset !== offsetCss) {
      state.dockOffset = offsetCss;
      els.app.style.setProperty('--r3d-dock-bottom-offset', offsetCss);
    }
    if (els.app) {
      // right ドックもヘッダ下〜ツールバー上に収める（狭い画面で net が横長のとき）。
      var headBottom = headRect ? headRect.y + headRect.height : 0;
      var topCss = Math.max(0, Math.round(headBottom + 10)) + 'px';
      var maxHeight = toolbarRect
        ? Math.max(96, Math.floor(toolbarRect.y - headBottom - 20))
        : null;
      var maxCss = maxHeight == null ? 'none' : maxHeight + 'px';
      if (state.dockTop !== topCss) {
        state.dockTop = topCss;
        els.app.style.setProperty('--r3d-dock-top-offset', topCss);
      }
      if (state.dockMaxHeight !== maxCss) {
        state.dockMaxHeight = maxCss;
        els.app.style.setProperty('--r3d-dock-right-max-height', maxCss);
      }
    }
    return next;
  }

  function exclusions() {
    var list = [];
    [els.head, els.toolbar, els.detail].forEach(function (el) {
      var rect = rectOf(el);
      if (rect) list.push(rect);
    });
    return list;
  }

  // 選択中の直接グラフ端点。裏半球でも通常カードとして残す対象。
  function selectedKeepIds() {
    if (!state.selectedId || !model) return null;
    var ids = Object.create(null);
    ids[state.selectedId] = true;
    model.groupsForCompound(state.selectedId, LAYER).forEach(function (group) {
      group.substrateIds.concat(group.productIds).forEach(function (id) {
        if (model.byId[id]) ids[id] = true;
      });
    });
    return ids;
  }

  // ---------------- カメラ ----------------

  function setCamera(next) {
    state.camera = next;
    if (next && next.mode === 'outside') {
      state.outsideDistance = next.distance;
      state.outsideFov = next.fov;
    }
  }

  function defaultOutside() {
    var seed = layout.seeds[0];
    var point = seed == null ? null : layout.slots[seed];
    var azimuth = -35;
    var elevation = 18;
    if (point) {
      azimuth = Math.atan2(point.dir.x, point.dir.z) * 180 / Math.PI;
      elevation = Math.asin(point.dir.y) * 180 / Math.PI;
      elevation = Math.max(-60, Math.min(70, elevation));
    }
    return C.createOutsideCamera(layout.center, layout.radius, {
      azimuth: azimuth,
      elevation: elevation,
      distance: C.fitDistance(layout.radius, 50)
    });
  }

  function defaultInside() {
    return C.createInsideCamera(layout.center, layout.radius, { fov: C.DEFAULT_INSIDE_FOV });
  }

  function cancelRefocus() {
    if (state.refocus) state.refocus = null;
  }

  function cancelReveal() {
    if (state.reveal) state.reveal = null;
  }

  // 選択解除の復帰アニメーション。直前に見えていなかった要素だけを
  // fade し、カメラは同じ RAF で from→to を補間する（スナップしない）。
  function updateReveal(timestamp) {
    var reveal = state.reveal;
    if (!reveal) return null;
    var elapsed = timestamp - reveal.startTs;
    var t = Math.max(0, Math.min(1, elapsed / Math.max(1, reveal.duration)));
    if (t >= 1) {
      setCamera(reveal.to);
      state.reveal = null;
      return null;
    }
    setCamera(SR.revealCamera
      ? SR.revealCamera(reveal.from, reveal.to, t)
      : C.interpolateCamera(reveal.from, reveal.to, P.easeInOutCubic(t)));
    reveal.alpha = P.easeInOutCubic ? P.easeInOutCubic(t) : t;
    return reveal.alpha;
  }

  function startRefocus(to, duration, fadeMs) {
    var from = state.camera;
    var reduced = prefersReducedMotion();
    if (reduced || duration <= 0) {
      setCamera(to);
      state.refocus = null;
      return;
    }
    state.refocus = {
      from: from,
      to: to,
      startTs: nowMs(),
      duration: duration,
      fadeMs: fadeMs || 0,
      phase: 'travel',
      fade: 0
    };
  }

  function updateRefocus(timestamp) {
    var refocus = state.refocus;
    if (!refocus) return;
    var elapsed = timestamp - refocus.startTs;
    var t = Math.max(0, Math.min(1, elapsed / refocus.duration));
    var eased = P.easeInOutCubic(t);
    setCamera(C.interpolateCamera(refocus.from, refocus.to, eased));
    if (t < 1) {
      refocus.phase = 'travel';
      refocus.fade = 0;
      return;
    }
    if (refocus.fadeMs > 0 && elapsed < refocus.duration + refocus.fadeMs) {
      refocus.phase = 'fade';
      refocus.fade = Math.max(0, Math.min(1, (elapsed - refocus.duration) / refocus.fadeMs));
      return;
    }
    refocus.phase = 'final';
    refocus.fade = 1;
    state.refocus = null;
  }

  function orbitBy(dx, dy) {
    if (state.switching) return;
    cancelRefocus();
    cancelReveal();
    state.userAdjusted = true;
    setCamera(C.orbitCamera(state.camera, dx, dy));
    requestRender();
  }

  function zoomBy(factor) {
    if (state.switching) return;
    cancelRefocus();
    cancelReveal();
    state.userAdjusted = true;
    // ズームで指の下の面は変わる。古いアンカーを残さない。
    if (gestures) gestures.clearAnchor();
    setCamera(C.zoomCamera(state.camera, factor, { radius: layout.radius }));
    requestRender();
  }

  // 選択点を usableRect の中心に置くカメラ。モードは変えない。
  function framingCamera(point) {
    var vp = viewport();
    var rect = usableArea();
    state.centerRect = rect;
    return C.framePoint(state.camera, point, layout.center, rect, vp, { radius: layout.radius });
  }

  // パネル（詳細・凡例・ヘッダ折り返し）の実測矩形が変わったとき、
  // 選択点のフレーミングと主点オフセットを今の usable 領域へ追従させる。
  function refitForLayout() {
    // ヘッダ・ツールバーの実測が変わったら、usable の中心合わせより先にドックを決める。
    applyDetailDock();
    var rect = usableArea();
    state.centerRect = rect;
    if (gestures) gestures.clearAnchor();
    // 選択解除の復帰中はキャンセルしない。詳細パネルが消えると ResizeObserver が
    // 発火するため、ここで cancelReveal すると 80ms 後にフェードが打ち切られる。
    // 主点の目標だけ現在の usable 領域へ更新して、同じ rAF で補間を続ける。
    if (state.reveal) {
      state.reveal.to = C.withUsableRect(state.reveal.to, rect, viewport());
      return;
    }
    var point = state.selectedId ? layout.points[state.selectedId] : null;
    if (point && !state.userAdjusted) {
      if (state.refocus) {
        state.refocus.to = C.framePoint(state.refocus.to, point, layout.center, rect, viewport(), {
          radius: layout.radius
        });
      } else {
        setCamera(C.framePoint(state.camera, point, layout.center, rect, viewport(), {
          radius: layout.radius
        }));
      }
      return;
    }
    if (!state.userAdjusted) {
      setCamera(C.withUsableRect(state.camera, rect, viewport()));
    }
  }

  // ---------------- 描画 ----------------

  // 凡例の分類 id（例: 'hydrocarbon'）→ 球面レイアウトの regionIndex。
  function activeRegionIndex() {
    if (!state.region) return null;
    var index = regionIndexById[state.region];
    return index == null ? null : index;
  }

  function render(timestamp) {
    if (!ctx || !state.camera) return;
    var ts = typeof timestamp === 'number' ? timestamp : nowMs();
    applyDetailDock();
    updateRefocus(ts);
    updateReveal(ts);
    var vp = viewport();
    if (canvas.width !== Math.round(vp.width * vp.dpr) ||
      canvas.height !== Math.round(vp.height * vp.dpr)) {
      resizeCanvas(vp);
    }
    // 選択中は直接グラフの端点を裏半球でも layout に残し、通常カードとして描く。
    var visible = SR.visibleLayout(model, layout, state.camera, {
      center: layout.center,
      keepIds: selectedKeepIds()
    });
    var refocus = state.refocus;
    var plan = R.planScene({
      model: model,
      layout: visible,
      camera: state.camera,
      viewport: vp,
      layer: LAYER,
      query: state.query,
      selectedId: state.selectedId,
      showUnconnectedOnly: state.showUnconnectedOnly,
      region: state.region,
      exclusions: exclusions(),
      focusPhase: refocus ? refocus.phase : 'final',
      focusFade: refocus ? refocus.fade : 0
    });
    // 分野テリトリーはカード・経路より奥に描く。分類フィルタ中はその分野だけ、
    // 選択中はさらに薄くする（選択グラフは面の上に残る）。
    if (territory && ST && typeof ST.buildFrame === 'function') {
      plan.territory = ST.buildFrame(territory, state.camera, vp, {
        center: layout.center,
        activeRegion: activeRegionIndex(),
        dimmed: !!state.selectedId
      });
    }
    var guides = SR.buildGuideSegments(state.camera, layout.center, layout.radius, vp, {});
    SR.replaceFloorSegments(plan, guides);
    // 選択解除の復帰: 直前に見えていなかったノード・辺だけを fade する。
    if (state.reveal && SR.applyReveal) {
      SR.applyReveal(plan, state.reveal.snapshot, state.reveal.alpha == null ? 1 : state.reveal.alpha);
    }
    // 選択中は、公開 renderer が裏面・画面外で落とした直接グラフを別レイヤで補う。
    state.xray = SR.buildSelectedXray
      ? SR.buildSelectedXray(model, layout, state.camera, plan, {
        selectedId: state.selectedId,
        layer: LAYER,
        viewport: vp,
        center: layout.center,
        exclusions: exclusions(),
        usableRect: usableArea()
      })
      : null;
    if (state.xray && SR.buildXrayHitAreas) SR.buildXrayHitAreas(state.xray);
    syncVirtualCards();
    R.drawScene(ctx, plan, {});
    if (state.xray && SR.drawXray) SR.drawXray(ctx, state.xray, vp);
    state.plan = plan;
    if (state.refocus || state.reveal) requestRender();
  }

  function resizeCanvas(vp) {
    vp = vp || viewport();
    canvas.width = Math.max(1, Math.round(vp.width * vp.dpr));
    canvas.height = Math.max(1, Math.round(vp.height * vp.dpr));
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  // ---------------- 縁の仮想カード（名前・キーボード / ネイティブ操作） ----------------
  //
  // 描画は Canvas（sphere-render.drawXray）。同じ矩形に透明なネイティブ button を
  // 重ね、フォーカス・スクリーンリーダー・Enter/Space をそのまま使えるようにする。
  // 押下は通常の select() を通すので、詳細・再フォーカス・アナウンスは通常カードと同じ。
  function syncVirtualCards() {
    var host = els.virtualCards;
    if (!host) return;
    var list = state.xray && state.xray.virtuals ? state.xray.virtuals : [];
    if (!list.length) {
      if (!host.hidden || (host.childNodes && host.childNodes.length)) {
        host.innerHTML = '';
        host.hidden = true;
      }
      state.virtualSignature = '';
      return;
    }
    var signature = list.map(function (member) {
      var card = member.card;
      return member.id + '@' + Math.round(card.x) + ',' + Math.round(card.y) +
        ',' + Math.round(card.width) + ',' + Math.round(card.height);
    }).join('|');
    if (signature === state.virtualSignature) return;
    state.virtualSignature = signature;
    host.innerHTML = '';
    host.hidden = false;
    list.forEach(function (member) {
      var card = member.card;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'r3d-virtual-card';
      button.style.left = card.x + 'px';
      button.style.top = card.y + 'px';
      button.style.width = card.width + 'px';
      button.style.height = card.height + 'px';
      button.setAttribute('aria-label', member.name + '（' + (member.reasonLabel || '画面の外') +
        '・画面の縁に表示。選ぶと詳細を開いて中心へ寄せます）');
      button.title = member.name;
      button.textContent = member.name;
      button.addEventListener('click', function () {
        select(member.id);
        if (canvas) canvas.focus();
      });
      host.appendChild(button);
    });
  }

  // ---------------- 詳細 ----------------

  function tierLabel(tier) {
    if (tier === 'primary') return '主要経路';
    if (tier === 'secondary') return '補助経路';
    if (tier === 'academic') return '大学レベル';
    return '経路未確認';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function renderDetailFallback(holder, compound) {
    var routes = model.groupsForCompound(compound.id, LAYER);
    holder.innerHTML = '';
    if (compound.formula) {
      var formula = document.createElement('p');
      formula.className = 'rp3d-detail__formula';
      formula.textContent = '示性式: ' + compound.formula;
      holder.appendChild(formula);
    }
    var section = document.createElement('section');
    section.className = 'rp3d-detail__section';
    var heading = document.createElement('h3');
    heading.className = 'rp3d-detail__heading';
    heading.textContent = 'この物質の経路';
    section.appendChild(heading);
    if (!routes.length) {
      var empty = document.createElement('p');
      empty.className = 'rp3d-empty';
      empty.textContent = 'この物質に接続する確認済みの反応はありません。';
      section.appendChild(empty);
    } else {
      routes.forEach(function (group) {
        var line = document.createElement('p');
        line.className = 'rp3d-detail__line';
        line.textContent = group.substrateIds.map(function (id) {
          var item = model.byId[id];
          return item ? item.label : id;
        }).join(' + ') + ' → ' + group.productIds.map(function (id) {
          var item = model.byId[id];
          return item ? item.label : id;
        }).join(' + ');
        section.appendChild(line);
      });
    }
    holder.appendChild(section);
  }

  function renderDetailBody(compound) {
    var holder = els.detailBody;
    if (!holder) return;
    holder.innerHTML = '';
    var detail = window.RP3DDetail;
    if (detail && typeof detail.renderBody === 'function') {
      try {
        detail.renderBody(holder, compound, model, LAYER, {
          academicData: window.RPMapAcademicFacts || null
        });
        if (EQ) EQ.enhanceEquations(holder);
        return;
      } catch (error) {
        holder.innerHTML = '';
      }
    }
    renderDetailFallback(holder, compound);
  }

  function renderDetail() {
    var compound = state.selectedId ? model.byId[state.selectedId] : null;
    if (!compound) {
      els.detail.hidden = true;
      els.focus.disabled = true;
      return;
    }
    els.detail.hidden = false;
    els.focus.disabled = false;
    els.detailTitle.textContent = compound.name;
    var routes = model.groupsForCompound(compound.id, LAYER);
    els.detailEyebrow.textContent = compound.hub ? '主要物質 / 選択中' : '選択中';
    var metaBits = [
      compound.formula ? '<strong>' + escapeHtml(compound.formula) + '</strong>' : '',
      escapeHtml(compound.regionName || compound.region),
      escapeHtml(tierLabel(compound.tier)),
      '経路 ' + routes.length + ' グループ'
    ].filter(Boolean);
    els.detailMeta.innerHTML = metaBits.join(' ／ ');
    renderDetailBody(compound);
  }

  // ---------------- 選択 ----------------

  function compoundName(id) {
    var compound = model.byId[id];
    return compound ? (compound.label || compound.name) : id;
  }

  function resetSearchState() {
    state.query = '';
    state.results = [];
    state.resultIndex = -1;
    if (els.search) {
      els.search.value = '';
      els.search.setAttribute('aria-expanded', 'false');
      els.search.removeAttribute('aria-activedescendant');
    }
    if (els.results) els.results.hidden = true;
    if (els.searchStatus) els.searchStatus.textContent = '';
  }

  function select(id) {
    if (!id || !model.byId[id]) return;
    // 右→下ドックの切替で detail が選択点を隠さないよう、フレーミング前に決める。
    applyDetailDock();
    cancelReveal();
    resetSearchState();
    if (gestures) gestures.clearAnchor();
    state.selectedId = id;
    state.xray = null;
    state.virtualSignature = '';
    state.userAdjusted = false;
    renderDetail();
    var point = layout.points[id];
    if (ctx && point) {
      var target = framingCamera(point);
      startRefocus(target, prefersReducedMotion() ? 0 : REFOCUS_MS, REFOCUS_FADE_MS);
    }
    requestRender();
    announce(compoundName(id) + ' を選択しました。表示領域の中心に寄せています。');
  }

  function clearSelection() {
    if (!state.selectedId) return;
    applyDetailDock();
    cancelRefocus();
    cancelReveal();
    if (gestures) gestures.clearAnchor();
    // 直前に見えていたノード・辺（選択グラフ）を控える。復帰時はこれ以外を fade-in。
    var snapshot = SR.buildRevealSnapshot ? SR.buildRevealSnapshot(state.plan) : null;
    resetSearchState();
    state.selectedId = null;
    state.centerRect = null;
    state.xray = null;
    state.virtualSignature = '';
    state.userAdjusted = false;
    renderDetail();
    // パネルが消えたぶんの主点オフセットを戻す。向き・距離は変えず、
    // 復帰アニメーション中に screenOffset も滑らかに移す（カメラのスナップなし）。
    var from = state.camera;
    var to = C.withUsableRect(state.camera, usableArea(), viewport());
    var duration = SR.revealDuration ? SR.revealDuration(prefersReducedMotion()) : REVEAL_MS;
    if (!(duration > 0)) {
      setCamera(to);
      state.reveal = null;
    } else {
      state.reveal = {
        from: from,
        to: to,
        startTs: nowMs(),
        duration: duration,
        snapshot: snapshot,
        alpha: 0
      };
    }
    requestRender();
    announce('選択を解除しました。ほかの物質と経路を表示しています。');
  }

  function focusSelected() {
    if (!state.selectedId) {
      announce('先に物質を選択してください。');
      return;
    }
    var point = layout.points[state.selectedId];
    if (!point) return;
    applyDetailDock();
    cancelRefocus();
    cancelReveal();
    if (gestures) gestures.clearAnchor();
    state.userAdjusted = false;
    startRefocus(framingCamera(point), REFOCUS_MS, 0);
    requestRender();
    announce(compoundName(state.selectedId) + ' を表示領域の中心に表示しました。');
  }

  // ---------------- モード切替 ----------------

  function syncModeUi() {
    if (els.modeOutside) els.modeOutside.setAttribute('aria-pressed', state.mode === 'outside' ? 'true' : 'false');
    if (els.modeInside) els.modeInside.setAttribute('aria-pressed', state.mode === 'inside' ? 'true' : 'false');
  }

  function setMode(next, options) {
    options = options || {};
    if (next !== 'inside' && next !== 'outside') return;
    if (next === state.mode) return;
    if (state.switching) return;
    applyDetailDock();
    cancelRefocus();
    cancelReveal();
    if (gestures) gestures.clearAnchor();
    var point = state.selectedId ? layout.points[state.selectedId] : null;
    var target = C.switchModeCamera(state.camera, next, {
      center: layout.center,
      radius: layout.radius,
      point: point,
      rect: usableArea(),
      viewport: viewport(),
      distance: next === 'outside'
        ? (state.outsideDistance || C.fitDistance(layout.radius, 50))
        : undefined,
      fov: next === 'inside'
        ? C.DEFAULT_INSIDE_FOV
        : (state.outsideFov ? state.outsideFov * 180 / Math.PI : undefined)
    });
    var timing = C.switchTiming(prefersReducedMotion());
    state.userAdjusted = false;
    if (!timing.fadeOut) {
      state.mode = next;
      setCamera(target);
      syncModeUi();
      requestRender();
      announce(next === 'inside' ? '球の中の表示に切り替えました。' : '球の外の表示に切り替えました。');
      return;
    }
    state.switching = true;
    if (els.fade) els.fade.classList.add('is-on');
    window.setTimeout(function () {
      state.mode = next;
      setCamera(target);
      syncModeUi();
      requestRender();
      window.setTimeout(function () {
        if (els.fade) els.fade.classList.remove('is-on');
        window.setTimeout(function () {
          state.switching = false;
        }, timing.fadeIn);
      }, timing.hold);
      announce(next === 'inside' ? '球の中の表示に切り替えました。' : '球の外の表示に切り替えました。');
    }, timing.fadeOut);
  }

  function toggleMode() {
    setMode(state.mode === 'inside' ? 'outside' : 'inside');
  }

  // ---------------- 検索 ----------------

  function updateSearchResults() {
    var query = state.query.trim();
    state.results = query ? model.search(query, 8) : [];
    state.resultIndex = state.results.length ? 0 : -1;
    els.results.innerHTML = '';
    if (!state.results.length) {
      els.results.hidden = true;
      els.search.setAttribute('aria-expanded', 'false');
      els.searchStatus.textContent = query ? '一致する物質がありません。' : '';
      return;
    }
    state.results.forEach(function (result, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'r3d-result';
      button.id = 'r3d-result-' + index;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === state.resultIndex ? 'true' : 'false');
      var name = document.createElement('span');
      name.className = 'r3d-result__name';
      name.textContent = result.compound.label || result.compound.name;
      var formula = document.createElement('span');
      formula.className = 'r3d-result__formula';
      formula.textContent = result.compound.formula || '';
      var meta = document.createElement('span');
      meta.className = 'r3d-result__meta';
      meta.textContent = result.compound.regionName || result.compound.region || '';
      button.appendChild(name);
      button.appendChild(formula);
      button.appendChild(meta);
      button.addEventListener('click', function () { chooseResult(index); });
      els.results.appendChild(button);
    });
    els.results.hidden = false;
    els.search.setAttribute('aria-expanded', 'true');
    els.searchStatus.textContent = state.results.length + ' 件。矢印キーで選び、Enter で移動。';
    highlightResult(state.resultIndex);
  }

  function highlightResult(index) {
    var buttons = els.results.querySelectorAll('.r3d-result');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-selected', i === index ? 'true' : 'false');
    }
    if (index >= 0 && buttons[index]) {
      els.search.setAttribute('aria-activedescendant', buttons[index].id);
      if (buttons[index].scrollIntoView) buttons[index].scrollIntoView({ block: 'nearest' });
    } else {
      els.search.removeAttribute('aria-activedescendant');
    }
  }

  function chooseResult(index) {
    var result = state.results[index];
    if (!result) return;
    els.results.hidden = true;
    els.search.setAttribute('aria-expanded', 'false');
    els.searchStatus.textContent = '';
    select(result.id);
    canvas.focus();
  }

  function closeResults() {
    els.results.hidden = true;
    els.search.setAttribute('aria-expanded', 'false');
  }

  // ---------------- 入力 ----------------

  var gestures = null;

  function pointerPosition(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function setupGestures() {
    if (!G) return null;
    return G.createGestureController({
      getCamera: function () { return state.camera; },
      setCamera: function (next) {
        setCamera(next);
        requestRender();
      },
      getViewport: viewport,
      getRect: function () { return canvas.getBoundingClientRect(); },
      getCenter: function () { return layout.center; },
      getRadius: function () { return layout.radius; },
      onManipulate: function () {
        cancelRefocus();
        cancelReveal();
        state.userAdjusted = true;
      },
      onPinch: function (factor) { zoomBy(factor); },
      onTap: function (pos) {
        if (!state.plan || state.switching || state.refocus) return;
        // 先に縁の名前付き仮想カードを拾う（通常カードと同じ選択経路へ）。
        var xrayHit = state.xray && SR.pickXray ? SR.pickXray(state.xray, pos.x, pos.y) : null;
        if (xrayHit && xrayHit.type === 'member' && xrayHit.id) {
          select(xrayHit.id);
          return;
        }
        var id = R.pickScene(state.plan, pos.x, pos.y);
        if (id) select(id);
        else if (state.selectedId) clearSelection();
      },
      isInteractive: function () { return !state.switching && !state.refocus; }
    });
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    canvas.focus();
    if (gestures && gestures.pointerDown(event)) {
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* 古いブラウザ */ }
    }
  }

  function onPointerMove(event) {
    if (gestures) gestures.pointerMove(event);
  }

  function onPointerUp(event) {
    if (gestures) gestures.pointerUp(event);
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* noop */ }
  }

  function onPointerCancel(event) {
    if (gestures) gestures.pointerCancel(event);
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* noop */ }
  }

  function onWheel(event) {
    event.preventDefault();
    var factor = I.wheelZoomFactor(event.deltaY, event.deltaMode);
    if (factor === 1) return;
    zoomBy(factor);
  }

  function onDoubleClick(event) {
    if (!state.plan) return;
    var pos = pointerPosition(event);
    var id = R.pickScene(state.plan, pos.x, pos.y);
    if (id) select(id);
  }

  // ---------------- キー ----------------

  function onKeyDown(event) {
    if (event.defaultPrevented) return;
    if (I.shouldHandleKey && !I.shouldHandleKey(event)) return;
    var key = event.key;
    var target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if (key === 'Escape') {
      if (!els.results.hidden) { closeResults(); event.preventDefault(); return; }
      if (state.selectedId) { clearSelection(); event.preventDefault(); return; }
      if (state.query) {
        state.query = '';
        els.search.value = '';
        els.searchStatus.textContent = '';
        requestRender();
        event.preventDefault();
      }
      return;
    }
    if (key === '/' || key === 'F' || key === 'f' || key === 'R' || key === 'r' ||
      key === '0' || key === 'U' || key === 'u' || key === 'I' || key === 'i' ||
      key === '+' || key === '=' || key === '-' || key === '_' ||
      key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
    } else {
      return;
    }

    if (key === '/') { els.search.focus(); return; }
    if (key === 'F' || key === 'f') { focusSelected(); return; }
    if (key === 'I' || key === 'i') { toggleMode(); return; }
    if (key === 'R' || key === 'r' || key === '0') { resetView(); return; }
    if (key === 'U' || key === 'u') { toggleUnconnected(); return; }
    if (key === '+' || key === '=') { zoomBy(0.8); return; }
    if (key === '-' || key === '_') { zoomBy(1.25); return; }
    var step = 26;
    if (key === 'ArrowLeft') { orbitBy(-step, 0); return; }
    if (key === 'ArrowRight') { orbitBy(step, 0); return; }
    if (key === 'ArrowUp') { orbitBy(0, -step); return; }
    if (key === 'ArrowDown') { orbitBy(0, step); return; }
  }

  function toggleUnconnected() {
    state.showUnconnectedOnly = !state.showUnconnectedOnly;
    els.unconnected.setAttribute('aria-pressed', state.showUnconnectedOnly ? 'true' : 'false');
    requestRender();
    announce(state.showUnconnectedOnly ? '未接続の物質を強調しています。' : '未接続の強調を解除しました。');
  }

  function resetView() {
    cancelRefocus();
    cancelReveal();
    if (gestures) gestures.clearAnchor();
    state.selectedId = null;
    state.centerRect = null;
    state.userAdjusted = false;
    state.xray = null;
    state.virtualSignature = '';
    renderDetail();
    resetSearchState();
    var target;
    if (state.mode === 'inside') {
      target = defaultInside();
    } else {
      target = defaultOutside();
    }
    startRefocus(target, prefersReducedMotion() ? 0 : 420, 0);
    requestRender();
    announce('全体表示に戻しました。');
  }

  // ---------------- 凡例（分類フィルタ） ----------------

  var regionButtons = [];
  var allRegionButton = null;
  var regionNamesById = Object.create(null);

  function legendLine(color) {
    var line = document.createElement('span');
    line.className = 'r3d-legend__line';
    line.setAttribute('aria-hidden', 'true');
    line.style.background = color;
    return line;
  }

  function legendButton(className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'r3d-legend__item ' + className;
    return button;
  }

  function syncRegionUi() {
    regionButtons.forEach(function (entry) {
      var active = state.region === entry.id;
      entry.button.setAttribute('aria-pressed', active ? 'true' : 'false');
      entry.button.title = active
        ? 'もう一度押すと全分類に戻す'
        : entry.name + 'だけを表示';
    });
    if (allRegionButton) {
      var allActive = !state.region;
      allRegionButton.setAttribute('aria-pressed', allActive ? 'true' : 'false');
      allRegionButton.title = allActive ? '全分類を表示中' : '全分類に戻す';
    }
  }

  function applyRegion(region) {
    state.region = region || null;
    syncRegionUi();
    requestRender();
  }

  function toggleRegion(id) {
    if (!id) return;
    if (state.region === id) {
      applyRegion(null);
      announce('分類の絞り込みを解除して、すべて表示に戻しました。');
      return;
    }
    applyRegion(id);
    var name = regionNamesById[id] || id;
    announce(name + 'だけを表示しています。同じボタンをもう一度押すと解除します。');
  }

  function buildLegend(regions) {
    var list = $('r3d-legend-list');
    if (!list || !R || typeof R.legendItems !== 'function') return;
    list.textContent = '';
    regionButtons = [];
    allRegionButton = legendButton('r3d-legend__item--all');
    allRegionButton.id = 'r3d-legend-all';
    allRegionButton.textContent = 'すべて';
    allRegionButton.setAttribute('aria-pressed', 'true');
    allRegionButton.setAttribute('aria-label', 'すべての分類を表示');
    allRegionButton.addEventListener('click', function () {
      if (!state.region) return;
      applyRegion(null);
      announce('すべての分類を表示しています。');
    });
    list.appendChild(allRegionButton);

    R.legendItems(regions || []).forEach(function (item) {
      if (item.route) {
        var route = document.createElement('span');
        route.className = 'r3d-legend__item r3d-legend__item--route';
        route.appendChild(document.createTextNode('経路'));
        route.appendChild(legendLine(item.normal));
        route.appendChild(document.createTextNode('通常'));
        route.appendChild(document.createTextNode(' / '));
        route.appendChild(legendLine(item.academic));
        route.appendChild(document.createTextNode('大学'));
        list.appendChild(route);
        return;
      }
      regionNamesById[item.id] = item.name;
      var button = legendButton('r3d-legend__item--region');
      button.setAttribute('data-region', item.id);
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', item.name + 'だけを表示');
      var swatch = document.createElement('span');
      swatch.className = 'r3d-legend__swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.background = item.color;
      button.appendChild(swatch);
      button.appendChild(document.createTextNode(item.name));
      button.addEventListener('click', function () { toggleRegion(item.id); });
      regionButtons.push({ id: item.id, name: item.name, button: button });
      list.appendChild(button);
    });
    syncRegionUi();

    var legend = $('r3d-legend');
    if (!legend) return;
    if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) legend.open = false;
    legend.addEventListener('toggle', function () {
      refitForLayout();
      requestRender();
    });
  }

  // ---------------- フォールバック ----------------

  function showFallback(message) {
    if (els.fallbackMessage) els.fallbackMessage.textContent = message;
    if (els.fallback) els.fallback.hidden = false;
    if (els.hint) els.hint.hidden = true;
  }

  function updateFallbackList(query) {
    if (!els.fallbackList) return;
    var results = query ? model.search(query, 40) : model.compounds.slice(0, 40);
    els.fallbackList.innerHTML = '';
    results.forEach(function (entry) {
      var compound = entry.compound || entry;
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'r3d-btn';
      button.textContent = (compound.label || compound.name) + (compound.formula ? ' / ' + compound.formula : '');
      button.addEventListener('click', function () { select(compound.id); });
      item.appendChild(button);
      els.fallbackList.appendChild(item);
    });
  }

  // ---------------- 初期化 ----------------

  function init() {
    canvas = $('r3d-canvas');
    els = {
      app: $('r3d-app'),
      canvas: canvas,
      head: document.querySelector('.r3d-head'),
      toolbar: $('r3d-controls'),
      detail: $('r3d-detail'),
      detailEyebrow: $('r3d-detail-eyebrow'),
      detailTitle: $('r3d-detail-title'),
      detailMeta: $('r3d-detail-meta'),
      detailBody: $('r3d-detail-body'),
      search: $('r3d-search'),
      searchStatus: $('r3d-search-status'),
      results: $('r3d-results'),
      focus: $('r3d-focus'),
      unconnected: $('r3d-unconnected'),
      hint: document.querySelector('.r3d-hint'),
      live: $('r3d-live'),
      help: $('r3d-help'),
      fallback: $('r3d-fallback'),
      fallbackMessage: $('r3d-fallback-message'),
      fallbackSearch: $('r3d-fallback-search'),
      fallbackList: $('r3d-fallback-list'),
      fade: $('s3d-fade'),
      virtualCards: $('r3d-virtual-cards'),
      modeOutside: $('r3d-mode-outside'),
      modeInside: $('r3d-mode-inside')
    };

    // 初期表示から net 領域の縦横比でドックを決める（detail はまだ hidden）。
    applyDetailDock();
    prefersReducedMotion();
    var normalData = window.RPMapData;
    var academicData = window.RPMapAcademicFacts;
    var groups = window.RPReactionGroups;
    if (!P || !C || !L || !SR || !S || !R || !G) {
      showFallback('必要なスクリプトを読み込めませんでした。');
      return;
    }
    if (!normalData || !normalData.compounds || !groups) {
      showFallback('共有データを読み込めませんでした。site/app11/data.js と reaction-groups.js の配置を確認してください。');
      return;
    }
    if (!academicData || !Array.isArray(academicData.reactions) || !academicData.reactions.length) {
      showFallback('大学レベルの追加反応データ（academic-facts.js）を読み込めませんでした。');
      return;
    }

    regionIndexById = Object.create(null);
    normalData.compounds.forEach(function (compound) {
      if (compound && compound.region && compound.regionIndex != null) {
        regionIndexById[compound.region] = compound.regionIndex;
      }
    });
    try {
      model = S.createModel(normalData, academicData, groups);
      layout = L.buildSphereLayout(normalData.compounds);
    } catch (error) {
      showFallback('共有データの構築に失敗しました。');
      return;
    }
    // 球面テリトリーは起動時に一度だけ構築する（以後は投影と可視判定だけ）。
    // 失敗しても地図・カードは従来どおり動かす（装飾レイヤのため）。
    territory = null;
    if (ST && typeof ST.buildGeometry === 'function') {
      try {
        territory = ST.buildGeometry(layout, { subdivision: ST.DEFAULT_SUBDIVISION });
      } catch (error) {
        territory = null;
      }
    }

    var context = canvas.getContext('2d');
    if (!context) {
      showFallback('Canvas 2D を取得できませんでした。検索できる一覧で代用しています。');
      updateFallbackList('');
      return;
    }
    ctx = context;
    buildLegend(normalData.regions);
    var vp = viewport();
    resizeCanvas(vp);
    setCamera(defaultOutside());
    state.mode = 'outside';
    syncModeUi();

    gestures = setupGestures();
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    document.addEventListener('keydown', onKeyDown);

    $('r3d-zoom-in').addEventListener('click', function () { zoomBy(0.8); });
    $('r3d-zoom-out').addEventListener('click', function () { zoomBy(1.25); });
    $('r3d-reset').addEventListener('click', resetView);
    els.focus.addEventListener('click', focusSelected);
    $('r3d-detail-focus').addEventListener('click', focusSelected);
    $('r3d-clear').addEventListener('click', clearSelection);
    els.unconnected.addEventListener('click', toggleUnconnected);
    $('r3d-help-open').addEventListener('click', function () {
      if (els.help && typeof els.help.showModal === 'function') els.help.showModal();
    });
    $('r3d-help-close').addEventListener('click', function () {
      if (els.help && typeof els.help.close === 'function') els.help.close();
    });
    if (els.modeOutside) els.modeOutside.addEventListener('click', function () { setMode('outside'); });
    if (els.modeInside) els.modeInside.addEventListener('click', function () { setMode('inside'); });

    els.search.addEventListener('input', function () {
      cancelRefocus();
      if (state.selectedId) {
        state.selectedId = null;
        state.centerRect = null;
        state.userAdjusted = false;
        renderDetail();
        setCamera(C.withUsableRect(state.camera, usableArea(), viewport()));
      }
      state.query = els.search.value;
      updateSearchResults();
      requestRender();
    });
    els.search.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (els.results.hidden && state.query.trim()) updateSearchResults();
        if (!state.results.length) return;
        state.resultIndex = I.searchNavigation(state.results, state.resultIndex, event.key === 'ArrowDown' ? 1 : -1);
        highlightResult(state.resultIndex);
      } else if (event.key === 'Enter') {
        if (state.results.length) {
          event.preventDefault();
          chooseResult(state.resultIndex >= 0 ? state.resultIndex : 0);
        }
      } else if (event.key === 'Escape') {
        if (!els.results.hidden) {
          event.preventDefault();
          closeResults();
        } else if (state.query) {
          event.preventDefault();
          state.query = '';
          els.search.value = '';
          els.searchStatus.textContent = '';
          requestRender();
        }
      }
    });
    els.search.addEventListener('focus', function () {
      if (state.query.trim()) updateSearchResults();
    });
    document.addEventListener('pointerdown', function (event) {
      if (!els.search.parentNode.contains(event.target)) closeResults();
    });

    if (els.fallbackSearch) {
      els.fallbackSearch.addEventListener('input', function () {
        updateFallbackList(els.fallbackSearch.value);
      });
    }

    var resizeTimer = 0;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        var next = viewport();
        resizeCanvas(next);
        if (gestures) gestures.clearAnchor();
        refitForLayout();
        requestRender();
      }, 80);
    }
    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(onResize);
      observer.observe(canvas);
      if (els.detail) observer.observe(els.detail);
      if (els.head) observer.observe(els.head);
      if (els.toolbar) observer.observe(els.toolbar);
    }

    render();
    announce('球ビューを読み込みました。物質 ' + model.compounds.length + ' 件、反応グループ ' +
      model.groupCount + ' 件。');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
