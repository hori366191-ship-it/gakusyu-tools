/*
 * app11-3d — 画面制御
 *
 * 役割:
 *   - 共有データ（site/app11）から scene-model / layout3d を作る
 *   - Canvas 2D に投影済みのカードを描く
 *   - ポインタ・キーボード・検索・選択パネルを配線する
 *
 * 公開版は「通常＋大学レベル」の合成表示だけを持つ（層の切替 UI・キー操作はない）。
 *
 * アニメーションループは持たない。入力・選択・リサイズのときだけ 1 フレーム描く。
 */
(function () {
  'use strict';

  var P = window.RP3DProjection;
  var L = window.RP3DLayout;
  var S = window.RP3DScene;
  var R = window.RP3DRenderer;
  var I = window.RP3DInteraction;

  var model = null;
  var layout = null;
  var ctx = null;
  var canvas = null;
  var els = {};
  var frameRequested = 0;
  var searchLockTimer = 0;
  // 公開版は常に通常＋大学レベルの合成。層の切替は持たない（L キーも無効）。
  var COMBINED_LAYER = 'academic';

  var state = {
    layer: COMBINED_LAYER,
    query: '',
    selectedId: null,
    showUnconnectedOnly: false,
    // 下部凡例で選んだ分類。null は全分類。選択・検索はこれを一時的に上書きする。
    region: null,
    camera: null,
    results: [],
    resultIndex: -1,
    plan: null,
    pointerCount: 0,
    // 1本指の既定は回転。ツールバーで「移動」を選ぶとパンになる。
    touchMode: 'rotate',
    // 選択の自動センタリング。userAdjusted が立つと、リサイズでも勝手に寄せ直さない。
    centerRect: null,
    userAdjusted: false,
    structurePlane: null,
    // 選択または単一検索結果のフォーカス固定。{kind:'selection'|'search', id}
    lock: null,
    // プレビュー + イージング遷移と、その間に受けた回転/ズーム入力。
    transition: null,
    pendingInput: null
  };

  function $(id) { return document.getElementById(id); }

  function announce(text) {
    if (els.live) els.live.textContent = text || '';
  }

  function tierLabel(tier) {
    if (tier === 'primary') return '主要経路';
    if (tier === 'secondary') return '補助経路';
    if (tier === 'academic') return '大学レベル';
    return '経路未確認';
  }

  function viewport() {
    var width = Math.max(1, canvas.clientWidth || window.innerWidth);
    var height = Math.max(1, canvas.clientHeight || window.innerHeight);
    return { width: width, height: height, dpr: Math.min(2, window.devicePixelRatio || 1) };
  }

  // 起動時は「対応する最小距離＝最大ズーム」で地図中心へ。中心付近にカードが
  // 無い場合だけ、中心に最も近い実在物質を透明なアンカーにする（選択しない）。
  function makeStartup() {
    var vp = viewport();
    var startup = P.startupCamera(layout.list, layout.center, vp, usableArea(), {
      fov: 52,
      azimuth: -35,
      elevation: 22
    });
    state.startupAnchor = { id: startup.anchorId, anchor: startup.anchor, exactCenter: startup.exactCenter };
    return startup.camera;
  }

  function requestRender() {
    if (frameRequested) return;
    frameRequested = window.requestAnimationFrame(function (timestamp) {
      frameRequested = 0;
      render(timestamp);
    });
  }

  // 遷移の進行。preview 中は from のまま、その後 ease で to へ。
  // 着地後は camera を固定したまま 'fade' へ入り、無関係の物質・経路だけを
  // fadeMs かけて落とす（同じ rAF・同じ transition 状態のまま、追加タイマーなし）。
  function applyCameraTransition(timestamp) {
    var transition = state.transition;
    if (!transition) return;
    var elapsed = (typeof timestamp === 'number' ? timestamp : nowMs()) - transition.startTs;
    var phase = P.transitionPhase(elapsed, transition.previewMs, transition.durationMs);
    if (phase === 'preview') {
      transition.phase = 'preview';
      state.camera = P.cloneCamera(transition.from);
      return;
    }
    var travelEnd = transition.previewMs + transition.durationMs;
    if (!phase && transition.fadeMs > 0 && elapsed < travelEnd + transition.fadeMs) {
      state.camera = P.cloneCamera(transition.to);
      transition.phase = 'fade';
      transition.fadeProgress = P.transitionFade(elapsed - travelEnd, transition.fadeMs);
      return;
    }
    var t = P.transitionProgress(elapsed, transition.previewMs, transition.durationMs);
    state.camera = P.interpolateCamera(transition.from, transition.to, t);
    if (!phase) {
      state.camera = P.cloneCamera(transition.to);
      state.transition = null;
      flushPendingInput();
      return;
    }
    transition.phase = 'travel';
  }

  // ---------------- キーボードパン（短い平滑化） ----------------
  //
  // 押した瞬間の 1 タップと保持中の移動を、OS のキーリピートに依存せず
  // 自前のフレームで滑らかにする。止まったら rAF は予約しない。
  // prefers-reduced-motion では即時移動（タップごとのジャンプ）。
  var panMotion = I.createKeyboardPan();
  var panFrame = 0;
  var reducedMotionQuery = null;

  function prefersReducedMotion() {
    if (!reducedMotionQuery && typeof window.matchMedia === 'function') {
      reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return !!(reducedMotionQuery && reducedMotionQuery.matches);
  }

  function stopPanFrame() {
    if (panFrame) {
      window.cancelAnimationFrame(panFrame);
      panFrame = 0;
    }
  }

  function cancelKeyboardPan() {
    stopPanFrame();
    panMotion.cancel();
  }

  function startPanFrame() {
    if (panFrame || !ctx) return;
    panFrame = window.requestAnimationFrame(panTick);
  }

  function panTick(timestamp) {
    panFrame = 0;
    var delta = panMotion.step(timestamp);
    if (delta.dx || delta.dy) {
      state.camera = P.panCamera(state.camera, delta.dx, delta.dy, viewport());
      state.userAdjusted = true;
      render();
    }
    // active の間だけ次フレームを予約する（アイドルでは回さない）。
    if (delta.active) startPanFrame();
  }

  function keyboardPanPress(key) {
    if (state.lock) return; // フォーカス固定中はパン不可
    interruptFreeTransition();
    // カメラ移動: ←/A でカメラが左へ（内容は右へ）、↑/W でカメラが上へ（内容は下へ）。
    var direction = I.keyboardPanDirectionForKey(key);
    if (!direction) return;
    if (prefersReducedMotion()) {
      state.camera = P.panCamera(
        state.camera,
        direction.x * I.PAN_STEP,
        direction.y * I.PAN_STEP,
        viewport()
      );
      state.userAdjusted = true;
      requestRender();
      return;
    }
    if (panMotion.press(key)) startPanFrame();
  }

  function keyboardPanRelease(key) {
    if (!I.panDirectionForKey(key)) return;
    if (!panMotion.isPressed(key)) return;
    panMotion.release(key);
    if (!prefersReducedMotion()) startPanFrame();
  }

  function rectOf(el) {
    if (!el || el.hidden) return null;
    var r = el.getBoundingClientRect();
    var c = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: r.left - c.left, y: r.top - c.top, width: r.width, height: r.height };
  }

  function exclusions() {
    var list = [];
    [els.head, els.toolbar, els.detail].forEach(function (el) {
      var rect = rectOf(el);
      if (rect) list.push(rect);
    });
    return list;
  }

  function panelRects() {
    return {
      header: els.head && !els.head.hidden ? rectOf(els.head) : null,
      toolbar: els.toolbar && !els.toolbar.hidden ? rectOf(els.toolbar) : null,
      detail: els.detail && !els.detail.hidden ? rectOf(els.detail) : null
    };
  }

  function usableArea() {
    return P.computeUsableViewport(viewport(), panelRects());
  }

  function render(timestamp) {
    if (!ctx || !state.camera) return;
    applyCameraTransition(timestamp);
    var vp = viewport();
    if (canvas.width !== Math.round(vp.width * vp.dpr) || canvas.height !== Math.round(vp.height * vp.dpr)) {
      resizeCanvas(vp);
    }
    var plan = R.planScene({
      model: model,
      layout: layout,
      camera: state.camera,
      viewport: vp,
      layer: state.layer,
      query: state.query,
      selectedId: state.selectedId,
      showUnconnectedOnly: state.showUnconnectedOnly,
      region: state.region,
      exclusions: exclusions(),
      structurePlane: state.structurePlane,
      // 遷移中だけ preview/travel を渡す。着地（または reduced-motion の即時）は
      // 既定の 'final' で、従来どおりの選択分離・検索の文脈表示になる。
      focusPhase: state.transition ? state.transition.phase : 'final',
      focusFade: state.transition && state.transition.phase === 'fade' ? state.transition.fadeProgress : 0,
      focusPivotId: state.lock && state.lock.kind === 'search' ? state.lock.id : null
    });
    R.drawScene(ctx, plan, {});
    state.plan = plan;
    // カード枚数などの診断値は plan（labelCount / drawStats）に残す。
    // 下部は色の凡例なので、描画ごとに DOM は更新しない。
    // 遷移中だけ次フレームを予約する（アイドルでは回さない）。
    if (state.transition) requestRender();
  }

  function resizeCanvas(vp) {
    vp = vp || viewport();
    canvas.width = Math.max(1, Math.round(vp.width * vp.dpr));
    canvas.height = Math.max(1, Math.round(vp.height * vp.dpr));
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  // ---------------- 選択・詳細 ----------------

  function compoundName(id) {
    var c = model.byId[id];
    return c ? c.label || c.name : id;
  }

  function namesOf(ids) {
    return ids.map(compoundName).join(' + ');
  }

  function routeRole(group, id) {
    var asSubstrate = group.substrateIds.indexOf(id) !== -1;
    var asProduct = group.productIds.indexOf(id) !== -1;
    if (asSubstrate && asProduct) return 'both';
    if (asSubstrate) return 'out';
    return 'in';
  }

  // 詳細本文は detail.js（別担当）へ委譲する。未読込・失敗時はここで最小限を描く。
  // 契約: window.RP3DDetail.renderBody(container, compound, model, layer, options)
  // タイトル・ヘッダ・フォーカス・閉じるは app 側が持つ。
  function renderDetailBody(compound) {
    var holder = els.detailBody;
    if (!holder) return;
    holder.innerHTML = '';
    var detail = window.RP3DDetail;
    if (detail && typeof detail.renderBody === 'function') {
      try {
        detail.renderBody(holder, compound, model, state.layer, { academicData: window.RPMapAcademicFacts || null });
        return;
      } catch (error) {
        holder.innerHTML = '';
      }
    }
    renderStructureFallback(holder, compound);
    renderRoutesFallback(holder, compound);
  }

  function renderDetail() {
    var compound = state.selectedId ? model.byId[state.selectedId] : null;
    if (!compound) {
      els.detail.hidden = true;
      els.focus.disabled = true;
      state.structurePlane = null;
      return;
    }
    els.detail.hidden = false;
    els.focus.disabled = false;
    els.detailTitle.textContent = compound.name;
    var routes = model.groupsForCompound(compound.id, state.layer);
    els.detailEyebrow.textContent = compound.hub ? '主要物質 / 選択中' : '選択中';
    els.detailMeta.innerHTML = '';
    var metaBits = [
      compound.formula ? '<strong>' + escapeHtml(compound.formula) + '</strong>' : '',
      escapeHtml(compound.regionName || compound.region),
      escapeHtml(tierLabel(compound.tier)),
      '層: ' + (state.layer === 'academic' ? '通常 + 大学レベル' : '通常'),
      '経路 ' + routes.length + ' グループ'
    ].filter(Boolean);
    els.detailMeta.innerHTML = metaBits.join(' ／ ');

    renderDetailBody(compound);
    state.structurePlane = getStructurePlane(compound);
  }

  function renderStructureFallback(holder, compound) {
    var shared = window.GakusyuOrganicStructure;
    var box = document.createElement('div');
    box.className = 'r3d-detail__structure';
    if (shared && shared.canonical && compound.structure) {
      try {
        var svg = shared.canonical.renderStructure(compound.structure, compound.name);
        if (svg && typeof svg === 'string') {
          box.innerHTML = svg;
          holder.appendChild(box);
          return;
        }
      } catch (error) {
        // 下の示性式へフォールバック
      }
    }
    if (compound.formula) {
      var p = document.createElement('p');
      p.className = 'r3d-route__empty';
      p.textContent = '示性式: ' + compound.formula;
      box.appendChild(p);
      holder.appendChild(box);
    }
  }

  function renderRoutesFallback(holder, compound) {
    var routes = model.groupsForCompound(compound.id, state.layer);
    var section = document.createElement('section');
    section.className = 'r3d-detail__routes';
    var title = document.createElement('h3');
    title.textContent = 'この物質の経路';
    section.appendChild(title);
    if (!routes.length) {
      var empty = document.createElement('p');
      empty.className = 'r3d-route__empty';
      empty.textContent = state.layer === 'academic'
        ? 'この物質に接続する確認済みの反応はありません。'
        : '通常層では確認済みの反応がありません。大学レベル層に切り替えると追加経路が出る場合があります。';
      section.appendChild(empty);
    } else {
      routes.slice(0, 14).forEach(function (group) {
        section.appendChild(renderRoute(group, compound.id));
      });
      if (routes.length > 14) {
        var more = document.createElement('p');
        more.className = 'r3d-route__empty';
        more.textContent = 'ほか ' + (routes.length - 14) + ' グループ（検索や詳細で確認）';
        section.appendChild(more);
      }
    }
    holder.appendChild(section);
  }

  // ---------------- 3D 内の構造式スプライト（選択物質だけ） ----------------
  //
  // 共有の正規構造式 SVG をそのままラスタ化して 1 枚の面として置く。
  // 結合の 3D 座標は発明しない。失敗時は示性式の文字を面にする（代替表示）。
  var structureSprites = Object.create(null);

  function getStructurePlane(compound) {
    if (!compound) return null;
    var cached = structureSprites[compound.id];
    if (cached === false) return null;
    if (cached) return { sprite: cached, screenWidth: 190 };
    structureSprites[compound.id] = false; // 失敗・待機中は再生成しない（成功時だけ差し替え）
    var shared = window.GakusyuOrganicStructure;
    if (!shared || !shared.canonical || typeof document === 'undefined') return null;
    var svg = null;
    if (compound.structure) {
      try {
        svg = shared.canonical.renderStructure(compound.structure, compound.name);
      } catch (error) {
        svg = null;
      }
    }
    if (svg && typeof svg === 'string') {
      rasterizeSvg(compound.id, svg, function (sprite) {
        if (!sprite) return;
        structureSprites[compound.id] = sprite;
        if (state.selectedId === compound.id) {
          state.structurePlane = { sprite: sprite, screenWidth: 190 };
          requestRender();
        }
      });
      return null;
    }
    if (compound.formula) {
      var fallback = formulaSprite(compound.formula);
      if (fallback) {
        structureSprites[compound.id] = fallback;
        return { sprite: fallback, screenWidth: 150 };
      }
    }
    return null;
  }

  function rasterizeSvg(id, svg, done) {
    try {
      var width = 512;
      var height = 384;
      var canvas2 = document.createElement('canvas');
      canvas2.width = width;
      canvas2.height = height;
      var c2 = canvas2.getContext('2d');
      if (!c2) { done(null); return; }
      c2.fillStyle = 'rgba(9,14,22,0.96)';
      c2.fillRect(0, 0, width, height);
      var image = new Image();
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      image.onload = function () {
        try {
          var scale = Math.min((width - 24) / (image.width || width), (height - 24) / (image.height || height));
          var dw = (image.width || width) * scale;
          var dh = (image.height || height) * scale;
          c2.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
          done(canvas2);
        } catch (error) {
          done(null);
        }
      };
      image.onerror = function () { done(null); };
      image.src = url;
    } catch (error) {
      done(null);
    }
  }

  function formulaSprite(formula) {
    try {
      var canvas2 = document.createElement('canvas');
      canvas2.width = 384;
      canvas2.height = 192;
      var c2 = canvas2.getContext('2d');
      if (!c2) return null;
      c2.fillStyle = 'rgba(9,14,22,0.96)';
      c2.fillRect(0, 0, canvas2.width, canvas2.height);
      c2.strokeStyle = 'rgba(127,178,255,0.5)';
      c2.strokeRect(2, 2, canvas2.width - 4, canvas2.height - 4);
      c2.fillStyle = '#e8f0fb';
      c2.font = '600 40px ' + "'Yu Gothic UI','Hiragino Sans','Noto Sans JP',system-ui,sans-serif";
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      c2.fillText(formula, canvas2.width / 2, canvas2.height / 2);
      return canvas2;
    } catch (error) {
      return null;
    }
  }

  function renderRoute(group, id) {
    var role = routeRole(group, id);
    var box = document.createElement('div');
    box.className = 'r3d-route';
    var head = document.createElement('div');
    head.className = 'r3d-route__head';
    var dir = document.createElement('span');
    dir.className = 'r3d-route__dir';
    dir.textContent = role === 'out' ? '→' : (role === 'in' ? '←' : '⇄');
    var type = document.createElement('span');
    type.className = 'r3d-route__type';
    type.textContent = group.typeLabel || '反応';
    head.appendChild(dir);
    head.appendChild(type);
    if (group.academicOnly) {
      var badge = document.createElement('span');
      badge.className = 'r3d-route__academic';
      badge.textContent = '大学レベル追加';
      head.appendChild(badge);
    } else if (group.hasAcademic) {
      var mixed = document.createElement('span');
      mixed.className = 'r3d-route__academic';
      mixed.textContent = '共通グループ';
      head.appendChild(mixed);
    }
    box.appendChild(head);

    var line = document.createElement('p');
    line.className = 'r3d-route__cond';
    var parts = [];
    if (role === 'out' || role === 'both') parts.push('生成物: ' + namesOf(group.productIds));
    if (role === 'in' || role === 'both') parts.push('基質: ' + namesOf(group.substrateIds));
    if (group.size > 1) parts.push('同型 ' + group.size + ' 件');
    line.textContent = parts.join(' / ');
    box.appendChild(line);

    var condition = '';
    for (var i = 0; i < group.members.length; i++) {
      if (group.members[i].conditions) { condition = group.members[i].conditions; break; }
    }
    if (condition) {
      var cond = document.createElement('p');
      cond.className = 'r3d-route__cond';
      cond.textContent = '条件: ' + condition;
      box.appendChild(cond);
    }
    return box;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ---------------- フォーカス固定（選択 / 単一検索結果） ----------------
  //
  // lock 中は「pivot の world 点」を usableRect の中心へ固定する。
  // オービットもズームも pivot を軸にし、パンは全入力で無効。
  // lock 解除時は現在の camera をそのまま使う（向き・倍率・位置を戻さない）。

  function lockPoint() {
    if (!state.lock) return null;
    return layout.points[state.lock.id] || null;
  }

  function syncTouchModeUi() {
    var locked = !!state.lock;
    if (els.touchMove) {
      els.touchMove.disabled = locked;
      els.touchMove.setAttribute('aria-pressed', locked ? 'false' : (state.touchMode === 'move' ? 'true' : 'false'));
    }
    if (els.touchRotate) {
      els.touchRotate.setAttribute('aria-pressed', locked ? 'true' : (state.touchMode === 'rotate' ? 'true' : 'false'));
    }
  }

  var TRANSITION_PREVIEW_MS = 130;
  var TRANSITION_EASE_MS = 430;
  var TRANSITION_RETARGET_MS = 320;
  var TRANSITION_RESET_MS = 520;
  // 着地後、カメラを固定したまま無関係の物質・経路を落とす時間。
  var TRANSITION_FADE_MS = 900;

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  // 現在の角度・距離を保ち、pivot を usableRect の中心へ置く camera。
  function lockedTargetCamera() {
    var point = lockPoint();
    if (!point) return null;
    var vp = viewport();
    var rect = usableArea();
    var base = P.cameraAroundPoint(state.camera, point);
    return {
      camera: P.centerCameraOnPoint(base, point, vp, rect),
      rect: rect
    };
  }

  function startCameraTransition(kind, toCamera, previewMs, durationMs, keepPending, fadeMs) {
    state.transition = {
      kind: kind,
      phase: previewMs > 0 ? 'preview' : 'travel',
      from: P.cloneCamera(state.camera),
      to: P.cloneCamera(toCamera),
      startTs: nowMs(),
      previewMs: previewMs,
      durationMs: durationMs,
      fadeMs: fadeMs == null ? 0 : fadeMs,
      fadeProgress: 0
    };
    if (!keepPending) state.pendingInput = null;
  }

  // 初期位置への遷移はロックではない。最初の明示操作が来たら遷移をやめ、
  // その瞬間の見えているポーズから自由操作を続ける（スナップしない）。
  function interruptFreeTransition() {
    if (state.transition && state.transition.kind === 'reset') {
      state.transition = null;
      state.pendingInput = null;
    }
  }

  function cancelCameraTransition() {
    state.transition = null;
    state.pendingInput = null;
  }

  function enterCameraLock(kind, id, animate) {
    if (!layout.points[id]) return;
    state.lock = { kind: kind, id: id };
    cancelKeyboardPan();
    syncTouchModeUi();
    var target = lockedTargetCamera();
    if (!target) return;
    // 固定に使った実測矩形を保持しておく（解除後のリサイズ判定にも使う）。
    state.centerRect = target.rect;
    if (animate && !prefersReducedMotion()) {
      // 直前のポーズを ~130ms 見せてから、向き・倍率を保ったまま中心へ寄せる。
      // 着地後にカメラを固定したまま、無関係の物質・経路だけを ~900ms かけて落とす。
      startCameraTransition(kind, target.camera, TRANSITION_PREVIEW_MS, TRANSITION_EASE_MS, false, TRANSITION_FADE_MS);
    } else {
      state.camera = target.camera;
      state.centerRect = target.rect;
      cancelCameraTransition();
    }
  }

  function exitCameraLock() {
    if (!state.lock) return;
    state.lock = null;
    // 解除時に古いパン・遷移入力を残さない。camera は今の値をそのまま使う（スナップなし）。
    cancelKeyboardPan();
    cancelCameraTransition();
    syncTouchModeUi();
  }

  // 遷移中の明示的な回転/ズームは、完成後の camera にまとめて適用する（驚かせない）。
  function queueOrbit(dx, dy) {
    if (!state.pendingInput) state.pendingInput = { orbitDx: 0, orbitDy: 0, zoomFactor: 1 };
    state.pendingInput.orbitDx += dx;
    state.pendingInput.orbitDy += dy;
  }

  function queueZoom(factor) {
    if (!state.pendingInput) state.pendingInput = { orbitDx: 0, orbitDy: 0, zoomFactor: 1 };
    state.pendingInput.zoomFactor *= factor;
  }

  function flushPendingInput() {
    var pending = state.pendingInput;
    state.pendingInput = null;
    if (!pending || !state.lock) return;
    var point = lockPoint();
    if (!point) return;
    var vp = viewport();
    var rect = usableArea();
    var cam = state.camera;
    if (pending.orbitDx || pending.orbitDy) {
      cam = P.orbitCameraAroundPoint(cam, point, pending.orbitDx, pending.orbitDy, vp, rect);
    }
    if (pending.zoomFactor !== 1) {
      cam = P.zoomCameraAroundPoint(cam, point, pending.zoomFactor, vp, rect);
    }
    state.camera = cam;
    state.centerRect = rect;
    state.userAdjusted = true;
  }

  function orbitBy(dx, dy) {
    interruptFreeTransition();
    if (state.transition) {
      queueOrbit(dx, dy);
      return;
    }
    if (state.lock) {
      var point = lockPoint();
      if (!point) return;
      var rect = usableArea();
      state.camera = P.orbitCameraAroundPoint(state.camera, point, dx, dy, viewport(), rect);
      state.centerRect = rect;
    } else {
      state.camera = P.orbitCamera(state.camera, dx, dy);
    }
    state.userAdjusted = true;
  }

  function zoomBy(factor) {
    interruptFreeTransition();
    if (state.transition) {
      queueZoom(factor);
      return;
    }
    if (state.lock) {
      var point = lockPoint();
      if (!point) return;
      var rect = usableArea();
      state.camera = P.zoomCameraAroundPoint(state.camera, point, factor, viewport(), rect);
      state.centerRect = rect;
    } else {
      state.camera = P.zoomCamera(state.camera, factor);
    }
    state.userAdjusted = true;
  }

  // 選択物質のアンカーを center へ置く（lock の再計算に集約）。
  function centerSelectedOnScreen() {
    if (!state.selectedId) return false;
    enterCameraLock('selection', state.selectedId, true);
    return !!state.lock;
  }

  // 詳細パネルの高さが確定した後・リサイズ後に、usableRect の変化へ追従する。
  function maybeRecenter() {
    if (!layout) return;
    if (state.transition && state.transition.kind === 'reset') {
      // 初期位置への遷移中にレイアウトが変わったら、新しい初期ポーズへ滑らかに振り直す。
      startCameraTransition('reset', makeStartup(), 0, TRANSITION_RETARGET_MS, true);
      requestRender();
      return;
    }
    if (state.lock) {
      if (pointers.size > 0) return;
      var target = lockedTargetCamera();
      if (!target) return;
      if (state.transition) {
        if (state.transition.phase === 'fade') {
          // 減光中はカメラを固定したまま目標だけ差し替える（減光の時計は進めたまま）。
          state.transition.to = P.cloneCamera(target.camera);
          state.camera = P.cloneCamera(target.camera);
          state.centerRect = target.rect;
        } else {
          // 進行中の遷移は、今の見えているポーズから新しい目標へ滑らかに振り直す。
          startCameraTransition(
            state.transition.kind,
            target.camera,
            0,
            TRANSITION_RETARGET_MS,
            true,
            state.transition.fadeMs
          );
        }
      } else {
        state.camera = target.camera;
        state.centerRect = target.rect;
      }
      requestRender();
      return;
    }
    if (!state.selectedId || pointers.size > 0) return;
    var point = layout.points[state.selectedId];
    if (!point) return;
    var vp = viewport();
    if (state.userAdjusted && state.centerRect) {
      if (!P.isPointCentered(state.camera, point, vp, state.centerRect, 26)) return;
    }
    var rect = usableArea();
    state.camera = P.centerCameraOnPoint(state.camera, point, vp, rect);
    state.centerRect = rect;
    requestRender();
  }

  // 入力中に毎キーで遷移を起こさないよう、少し待ってから単一一致の固定を始める。
  function scheduleSearchLock(delayMs) {
    window.clearTimeout(searchLockTimer);
    searchLockTimer = window.setTimeout(function () {
      searchLockTimer = 0;
      syncSearchLock();
      requestRender();
    }, delayMs);
  }

  function cancelSearchLockTimer() {
    window.clearTimeout(searchLockTimer);
    searchLockTimer = 0;
  }

  // 単一の実一致だけを一時的な pivot にする（選択・詳細・query は変えない）。
  function syncSearchLock() {
    if (state.selectedId) return;
    var query = state.query.trim();
    if (!query) {
      if (state.lock && state.lock.kind === 'search') exitCameraLock();
      return;
    }
    var matches = model.search(query, 2); // 2 件返れば複数一致
    if (matches.length === 1) {
      var id = matches[0].id;
      if (state.lock && state.lock.kind === 'search' && state.lock.id === id) return;
      enterCameraLock('search', id, true);
      requestRender();
      return;
    }
    if (state.lock && state.lock.kind === 'search') exitCameraLock();
  }

  // 検索由来の選択で query が残ると「選択グラフ」と「検索結果」が混ざるため、
  // 選択・選択解除のときに検索表示を閉じる。選択解除後は全物質表示へ戻る。
  function resetSearchState() {
    cancelSearchLockTimer();
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

  function select(id, options) {
    options = options || {};
    if (!id || !model.byId[id]) return;
    cancelKeyboardPan();
    resetSearchState();
    state.selectedId = id;
    state.userAdjusted = false;
    renderDetail();
    // 詳細パネルを表示した後のレイアウトで使える領域を測り、選択点を固定する。
    // 直前のポーズを短く見せてから、向き・倍率を保ったまま中心へ寄せる。
    enterCameraLock('selection', id, true);
    requestRender();
    announce(compoundName(id) + ' を選択しました。' + (options.focus ? '拡大して中心に表示しました。' : ''));
    if (options.focus) focusSelected();
  }

  function clearSelection() {
    cancelKeyboardPan();
    exitCameraLock();
    resetSearchState();
    state.selectedId = null;
    state.structurePlane = null;
    state.centerRect = null;
    state.userAdjusted = false;
    renderDetail();
    requestRender();
    var regionName = state.region ? (regionNamesById[state.region] || state.region) : '';
    announce('選択を解除しました。' + (regionName ? regionName + 'の絞り込みに戻ります。' : ''));
  }

  function focusSelected() {
    if (!state.selectedId) {
      announce('先に物質を選択してください。');
      return;
    }
    cancelKeyboardPan();
    cancelCameraTransition();
    var point = layout.points[state.selectedId];
    if (!point) return;
    var vp = viewport();
    if (state.lock) {
      var base = P.cameraAroundPoint(state.camera, point);
      var focused = P.focusCamera(base, point, Math.max(12, vp.height / 28));
      var rect = usableArea();
      state.camera = P.centerCameraOnPoint(focused, point, vp, rect);
      state.centerRect = rect;
    } else {
      state.camera = P.focusCamera(state.camera, point, Math.max(12, vp.height / 28));
    }
    state.userAdjusted = false;
    requestRender();
    announce(compoundName(state.selectedId) + ' を中心に表示しました。');
  }

  function resetView() {
    cancelKeyboardPan();
    // 明示的な「全体表示 / リセット」は選択・検索・フォーカス固定も解除する。
    exitCameraLock();
    if (state.selectedId) {
      resetSearchState();
      state.selectedId = null;
      state.structurePlane = null;
      renderDetail();
    } else {
      resetSearchState();
    }
    // 起動時とまったく同じ初期化（最大ズーム・地図中心・元の向き）へ、
    // 今の見えているポーズから滑らかに戻す。全体像は手動ズームアウトで見る。
    var target = makeStartup();
    state.userAdjusted = false;
    state.centerRect = null;
    if (prefersReducedMotion()) {
      cancelCameraTransition();
      state.camera = target;
    } else {
      startCameraTransition('reset', target, 0, TRANSITION_RESET_MS, false);
    }
    requestRender();
    announce('初期位置に戻しました。');
  }

  // 層は固定（通常＋大学）。キーボード L などから呼ばれても表示を変えない。
  function setLayer() {
    state.layer = COMBINED_LAYER;
  }

  function openHelp() {
    if (els.help && typeof els.help.showModal === 'function') els.help.showModal();
    else if (els.help) els.help.setAttribute('open', '');
  }

  function closeHelp() {
    if (els.help && typeof els.help.close === 'function') els.help.close();
    else if (els.help) els.help.removeAttribute('open');
  }

  function toggleUnconnected() {
    cancelKeyboardPan();
    state.showUnconnectedOnly = !state.showUnconnectedOnly;
    els.unconnected.setAttribute('aria-pressed', state.showUnconnectedOnly ? 'true' : 'false');
    requestRender();
    announce(state.showUnconnectedOnly ? '未接続の物質を強調しています。' : '未接続の強調を解除しました。');
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
    if (!buttons.length) return;
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-selected', i === index ? 'true' : 'false');
    }
    if (index >= 0 && buttons[index]) {
      els.search.setAttribute('aria-activedescendant', buttons[index].id);
      buttons[index].scrollIntoView({ block: 'nearest' });
    } else {
      els.search.removeAttribute('aria-activedescendant');
    }
  }

  function chooseResult(index) {
    var result = state.results[index];
    if (!result) return;
    state.query = result.compound.label || result.compound.name;
    els.search.value = state.query;
    els.results.hidden = true;
    els.search.setAttribute('aria-expanded', 'false');
    els.searchStatus.textContent = '';
    // 検索結果は「選ぶ＝使える領域の中心へ寄せる」。ズームは変えない。
    select(result.id, { focus: false });
    canvas.focus();
  }

  function closeResults() {
    els.results.hidden = true;
    els.search.setAttribute('aria-expanded', 'false');
  }

  // ---------------- 入力 ----------------

  var drag = {
    mode: 'orbit',
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    moved: false,
    pinching: false,
    suppressTap: false,
    pinchPrev: null
  };
  var pointers = new Map();

  function pointerArray() {
    var out = [];
    pointers.forEach(function (p) { out.push({ x: p.x, y: p.y }); });
    return out;
  }

  function pointerPosition(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    cancelKeyboardPan();
    canvas.focus();
    var pos = pointerPosition(event);
    pointers.set(event.pointerId, pos);
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* 古いブラウザ */ }
    if (pointers.size === 1) {
      // lock 中の 1 本指タッチは常に回転（移動トグルは無効化されている）。
      drag.mode = (state.lock && event.pointerType === 'touch')
        ? 'orbit'
        : I.oneFingerMode(event.pointerType, state.touchMode, event);
      drag.lastX = pos.x;
      drag.lastY = pos.y;
      drag.startX = pos.x;
      drag.startY = pos.y;
      drag.moved = false;
      drag.pinching = false;
      drag.pinchPrev = null;
    } else if (pointers.size === 2) {
      drag.pinching = true;
      drag.moved = true;
      drag.suppressTap = true;
      drag.pinchPrev = pointerArray();
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    var pos = pointerPosition(event);
    var old = pointerArray();
    pointers.set(event.pointerId, pos);

    if (pointers.size >= 2) {
      var current = pointerArray();
      var gesture = I.pinchGesture(drag.pinchPrev || old, current);
      if (gesture) {
        if (state.lock) {
          // lock 中は 2 本指のズームだけ。中点パン・ひねり回転は行わない。
          if (gesture.zoomFactor !== 1) zoomBy(gesture.zoomFactor);
        } else {
          interruptFreeTransition();
          var cam = state.camera;
          if (gesture.zoomFactor !== 1) cam = P.zoomCamera(cam, gesture.zoomFactor);
          if (gesture.panDx || gesture.panDy) cam = P.panCamera(cam, gesture.panDx, gesture.panDy, viewport());
          // 2 本指のひねりでは回転しない（incidental twist を避ける）。両モードとも同じ。
          state.camera = cam;
          state.userAdjusted = true;
        }
        requestRender();
      }
      drag.pinchPrev = current;
      drag.moved = true;
      return;
    }

    var dx = pos.x - drag.lastX;
    var dy = pos.y - drag.lastY;
    if (Math.abs(pos.x - drag.startX) > 4 || Math.abs(pos.y - drag.startY) > 4) drag.moved = true;
    drag.lastX = pos.x;
    drag.lastY = pos.y;
    if (!dx && !dy) return;
    if (drag.mode === 'pan') {
      // lock 中はパン入力（右/Shift ドラッグ）を完全に無視する。
      if (state.lock) return;
      interruptFreeTransition();
      state.camera = P.panCamera(state.camera, dx, dy, viewport());
      state.userAdjusted = true;
    } else {
      orbitBy(dx, dy);
    }
    requestRender();
  }

  // 選択/単一検索の位置合わせ中は、強調されていない背景の物質を誤って選ばない。
  // 空白タップで選択解除もしない（着地までは今の焦点だけを操作対象にする）。
  function focusLockedDuringTransition() {
    return !!(state.transition && state.transition.kind !== 'reset');
  }

  function isFocusTarget(id) {
    return !!(id && state.plan && state.plan.focusIds && state.plan.focusIds[id]);
  }

  function onPointerUp(event) {
    var pos = pointerPosition(event);
    var wasSingle = pointers.size === 1;
    pointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* noop */ }

    if (wasSingle && !drag.moved && !drag.pinching && !drag.suppressTap && state.plan && event.button === 0) {
      var id = R.pickScene(state.plan, pos.x, pos.y);
      if (focusLockedDuringTransition() && !isFocusTarget(id)) {
        // 遷移中の背景タップは無視（新しい選択・解除を起こさない）。
      } else if (id) {
        select(id, { focus: false });
      } else if (state.selectedId) {
        clearSelection();
      }
    }
    if (pointers.size === 1) {
      var remaining = pointerArray()[0];
      drag.mode = state.lock ? 'orbit' : 'pan';
      drag.lastX = remaining.x;
      drag.lastY = remaining.y;
      drag.startX = remaining.x;
      drag.startY = remaining.y;
      drag.moved = false;
      drag.pinching = false;
      drag.pinchPrev = null;
    } else if (pointers.size === 0) {
      drag.pinching = false;
      drag.pinchPrev = null;
      drag.moved = false;
      drag.suppressTap = false;
    }
  }

  function onWheel(event) {
    event.preventDefault();
    cancelKeyboardPan();
    // カーソル位置（canvas ローカル CSS px）を固定したままズームする。
    // カード上ならその物質の world アンカー、そうでなければ視線上の安定した平面点を使う。
    var factor = I.wheelZoomFactor(event.deltaY, event.deltaMode);
    if (state.lock) {
      // lock 中はカーソル位置を使わず、固定した pivot を軸にズームする。
      zoomBy(factor);
    } else {
      interruptFreeTransition();
      var vp = viewport();
      var pos = pointerPosition(event);
      var anchor = null;
      if (state.plan) {
        var id = R.pickScene(state.plan, pos.x, pos.y);
        var point = id ? layout.points[id] : null;
        if (point) anchor = { x: point.x, y: point.y, z: point.z };
      }
      state.camera = P.zoomCameraAtScreen(
        state.camera,
        factor,
        pos.x,
        pos.y,
        vp,
        anchor
      );
      state.userAdjusted = true;
    }
    requestRender();
  }

  function onDoubleClick(event) {
    if (!state.plan) return;
    var pos = pointerPosition(event);
    var id = R.pickScene(state.plan, pos.x, pos.y);
    if (focusLockedDuringTransition() && !isFocusTarget(id)) return;
    if (id) {
      select(id, { focus: false });
      focusSelected();
    }
  }

  function onKeyUp(event) {
    if (!I.shouldHandleKey(event)) return;
    keyboardPanRelease(event.key);
  }

  function onKeyDown(event) {
    if (els.help && els.help.open) return;
    if (!I.shouldHandleKey(event)) return;
    var action = I.actionForKey(event);
    if (!action) return;
    event.preventDefault();
    var vp = viewport();
    switch (action.type) {
      case 'pan':
        // lock 中は矢印/WASD のパンを無効化（進行中の平滑化も enterCameraLock で停止済み）。
        if (state.lock) break;
        if (I.panDirectionForKey(event.key)) {
          // 平滑化中は OS のキーリピートを使わない（保持中の移動は panTick が一定速度で行う）。
          // reduced-motion では即時移動なので、リピートごとに 1 タップ進める。
          if (prefersReducedMotion() || !event.repeat) keyboardPanPress(event.key);
        } else {
          state.camera = P.panCamera(state.camera, action.dx, action.dy, vp);
          state.userAdjusted = true;
          requestRender();
        }
        break;
      case 'orbit':
        cancelKeyboardPan();
        orbitBy(action.dx, action.dy);
        requestRender();
        break;
      case 'zoom':
        cancelKeyboardPan();
        zoomBy(action.factor);
        requestRender();
        break;
      case 'reset':
        resetView();
        break;
      case 'focus':
        focusSelected();
        break;
      case 'layer':
        // 公開版は層の切替を持たない。L は何もしない。
        break;
      case 'unconnected':
        toggleUnconnected();
        break;
      case 'search':
        els.search.focus();
        els.search.select();
        break;
      case 'help':
        openHelp();
        break;
      case 'escape':
        if (state.lock && state.lock.kind === 'search') {
          // 単一検索の一時固定からは 1 回で自由モードへ戻す（query も閉じる）。
          exitCameraLock();
          resetSearchState();
          requestRender();
        } else if (!els.results.hidden) {
          closeResults();
        } else if (state.query) {
          state.query = '';
          els.search.value = '';
          els.searchStatus.textContent = '';
          exitCameraLock();
          requestRender();
        } else if (state.selectedId) {
          clearSelection();
        }
        break;
      default:
        break;
    }
  }

  // ---------------- フォールバック ----------------

  var fallbackSearchReady = false;

  function showFallback(message) {
    els.canvas.hidden = true;
    els.head.hidden = true;
    els.toolbar.hidden = true;
    els.detail.hidden = true;
    els.hint.hidden = true;
    els.fallback.hidden = false;
    els.fallbackMessage.textContent = message || 'Canvas 2D が利用できないため、検索できる一覧で代用しています。';
    if (model && !fallbackSearchReady) {
      fallbackSearchReady = true;
      els.fallbackSearch.addEventListener('input', function () {
        updateFallbackList(els.fallbackSearch.value);
      });
      updateFallbackList('');
    }
    try { els.fallbackSearch.focus(); } catch (error) { /* noop */ }
  }

  function updateFallbackList(query) {
    var list = els.fallbackList;
    list.innerHTML = '';
    if (!model) return;
    var results = query.trim() ? model.search(query, 30) : model.search('', 0);
    if (!query.trim()) {
      var note = document.createElement('li');
      note.textContent = '物質名・示性式で検索してください。例: エタノール、C2H6O。';
      list.appendChild(note);
      return;
    }
    if (!results.length) {
      var empty = document.createElement('li');
      empty.textContent = '一致する物質がありません。';
      list.appendChild(empty);
      return;
    }
    results.forEach(function (result) {
      var li = document.createElement('li');
      var details = document.createElement('details');
      var summary = document.createElement('summary');
      summary.textContent = (result.compound.label || result.compound.name) +
        ' / ' + (result.compound.formula || '') +
        ' / ' + (result.compound.regionName || result.compound.region || '');
      details.appendChild(summary);
      var body = document.createElement('p');
      var routes = model.groupsForCompound(result.id, 'academic');
      body.textContent = (result.compound.name || '') + '。' + tierLabel(result.compound.tier) +
        '。大学レベル層を含む経路 ' + routes.length + ' グループ。' +
        (routes.length ? '（3D表示が使える環境では、この物質を中心に経路を強調できます）' : '');
      details.appendChild(body);
      li.appendChild(details);
      list.appendChild(li);
    });
  }

  // ---------------- タッチ 1 本指モード（移動 / 回転） ----------------

  function setTouchMode(mode) {
    state.touchMode = I.touchMode(mode);
    if (els.touchMove) els.touchMove.setAttribute('aria-pressed', state.touchMode === 'move' ? 'true' : 'false');
    if (els.touchRotate) els.touchRotate.setAttribute('aria-pressed', state.touchMode === 'rotate' ? 'true' : 'false');
    announce(state.touchMode === 'rotate'
      ? '1本指ドラッグ: 回転（上下で見下ろし/見上げ）。2本指は拡大縮小と移動。'
      : '1本指ドラッグ: 移動。2本指は拡大縮小と移動。');
  }

  function wireTouchMode() {
    els.touchMove = $('r3d-touch-move');
    els.touchRotate = $('r3d-touch-rotate');
    if (els.touchMove) {
      els.touchMove.addEventListener('click', function () { setTouchMode('move'); });
    }
    if (els.touchRotate) {
      els.touchRotate.addEventListener('click', function () { setTouchMode('rotate'); });
    }
    setTouchMode(state.touchMode);
  }

  // ---------------- 色の凡例（分類フィルタ） ----------------

  var regionButtons = [];
  var allRegionButton = null;
  var regionNamesById = Object.create(null);

  // 下部の凡例は起動時に 1 回だけ組む。カードの地色 = 物質の分類で、
  // 選択・検索時の一時的な強調色や経路色とは別（操作ダイアログにも記載）。
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

  // 分類の適用。カメラ・選択・検索は変えない（表示の絞り込みだけ）。
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
    var note = state.selectedId
      ? '選択中は、選択した物質と関係する経路を優先しています。'
      : (state.query.trim()
        ? '検索中は一致した物質を全分類から表示します。'
        : '同じボタンをもう一度押すと解除します。');
    announce(name + 'だけを表示しています。' + note);
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
    // 狭い画面ではツールバーを潰さないよう既定で閉じる（summary で開ける）。
    // 開閉でツールバーの高さが変わったら、固定中の選択中心だけは実測に合わせて追従する。
    if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) legend.open = false;
    legend.addEventListener('toggle', function () {
      if (!state.camera) return;
      // 凡例の開閉でツールバーの高さ（＝使える領域）が変わるため、
      // 選択の固定中心も今の実測矩形へ追従させる。
      maybeRecenter();
      requestRender();
    });
  }

  // ---------------- 初期化 ----------------

  function init() {
    canvas = $('r3d-canvas');
    els = {
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
      fallbackList: $('r3d-fallback-list')
    };

    prefersReducedMotion();
    var normalData = window.RPMapData;
    // 2D 用の academic-data.js（座標込み）は読まない。座標を持たない事実データだけを使う。
    var academicData = window.RPMapAcademicFacts;
    var groups = window.RPReactionGroups;
    if (!normalData || !normalData.compounds || !groups) {
      showFallback('共有データを読み込めませんでした。site/app11/data.js と reaction-groups.js の配置を確認してください。');
      return;
    }
    if (!academicData || !Array.isArray(academicData.reactions) || !academicData.reactions.length) {
      showFallback('大学レベルの追加反応データ（academic-facts.js）を読み込めませんでした。');
      return;
    }

    try {
      model = S.createModel(normalData, academicData, groups);
      // 通常データの反応だけをばねに使う（academic の x/y には依存しない）。
      layout = L.buildLayout3D(normalData.compounds, { reactions: normalData.reactions });
    } catch (error) {
      showFallback('共有データの構築に失敗しました。site/app11 のデータを確認してください。');
      return;
    }

    var context = canvas.getContext('2d');
    if (!context) {
      showFallback('Canvas 2D を取得できませんでした。検索できる一覧で代用しています。');
      return;
    }
    ctx = context;
    // 凡例を先に組み、ツールバーの高さを確定させてから起動カメラを決める
    // （凡例もツールバー矩形として中心計算の除外領域に入る）。
    buildLegend(normalData.regions);
    var vp = viewport();
    resizeCanvas(vp);
    // 起動だけ最大ズーム（最小距離）。以後のリサイズで勝手にズームしない。
    state.camera = makeStartup();

    // 配線
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', cancelKeyboardPan);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) cancelKeyboardPan();
    });
    if (reducedMotionQuery && typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', cancelKeyboardPan);
    }

    $('r3d-zoom-in').addEventListener('click', function () {
      zoomBy(0.8);
      requestRender();
    });
    $('r3d-zoom-out').addEventListener('click', function () {
      zoomBy(1.25);
      requestRender();
    });
    $('r3d-reset').addEventListener('click', resetView);
    els.focus.addEventListener('click', focusSelected);
    $('r3d-detail-focus').addEventListener('click', focusSelected);
    $('r3d-clear').addEventListener('click', clearSelection);
    els.unconnected.addEventListener('click', toggleUnconnected);
    $('r3d-help-open').addEventListener('click', openHelp);
    $('r3d-help-close').addEventListener('click', closeHelp);
    wireTouchMode();

    els.search.addEventListener('input', function () {
      cancelKeyboardPan();
      // 選択中に入力した場合は選択を解除し、通常の検索（未選択の暗い点）へ戻す。
      if (state.selectedId) {
        exitCameraLock();
        state.selectedId = null;
        state.structurePlane = null;
        state.centerRect = null;
        state.userAdjusted = false;
        renderDetail();
      }
      state.query = els.search.value;
      updateSearchResults();
      // 入力中は遷移を連発しない。同じ単一一致なら固定を維持し、
      // 変化したときだけ少し待ってから pivot を切り替える。
      var query = state.query.trim();
      var uniqueId = null;
      if (query) {
        var matches = model.search(query, 2);
        if (matches.length === 1) uniqueId = matches[0].id;
      }
      var searchLock = state.lock && state.lock.kind === 'search' ? state.lock : null;
      if (!uniqueId || !searchLock || searchLock.id !== uniqueId) {
        cancelSearchLockTimer();
        if (searchLock && searchLock.id !== uniqueId) exitCameraLock();
        if (uniqueId) scheduleSearchLock(220);
      } else {
        cancelSearchLockTimer();
      }
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
      cancelKeyboardPan();
      if (state.query.trim()) {
        updateSearchResults();
        syncSearchLock();
      }
    });
    document.addEventListener('pointerdown', function (event) {
      if (!els.search.parentNode.contains(event.target)) closeResults();
    });

    var resizeTimer = 0;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        var next = viewport();
        resizeCanvas(next);
        // 画面比が変わっても、勝手にカメラを跳ばさない。必要なときは R（全体表示）。
        // ただし選択中で、ユーザーが動かしていない（または依然中心にある）場合だけ寄せ直す。
        maybeRecenter();
        requestRender();
      }, 80);
    }
    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(onResize);
      observer.observe(canvas);
      // 詳細本文の高さが確定したとき（構造式の描画後など）に使える領域が変わる。
      if (els.detail) observer.observe(els.detail);
      // ヘッダの折り返し（検索状態の表示）やツールバー（凡例の開閉）でも
      // 使える領域が変わる。実測矩形が変わったら固定中心を追従させる。
      if (els.head) observer.observe(els.head);
      if (els.toolbar) observer.observe(els.toolbar);
    }

    render();
    announce('3Dマップを読み込みました。物質 ' + model.compounds.length + ' 件。');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
