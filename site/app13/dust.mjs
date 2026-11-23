import * as THREE from 'three';
import { GRAIN_COUNTS, STREAK_ALPHA_FLOOR, grainLayout, wrapOffset } from './dust-field.mjs';

/**
 * 接近中に横を抜ける塵と小石。
 *
 * カメラは原点固定で、天体側が cameraAU 基準の相対座標に置かれる。だから塵も
 * 「カメラ原点のカメラ相対座標」に置き、メッシュは無回転でシーン直下にぶら下げる
 * （カメラの回転に引きずられない）。カメラが +ΔAU 動くと世界は -ΔAU*1000 動くので、
 * 呼び出し側は shift = -ΔAU * SCENE_UNITS_PER_AU を渡す。
 *
 * 筋は「フレーム間の移動量」を画面空間で伸ばして作る。ポストプロセスは使わない。
 * 前フレームの位置は世界座標で p - shift（このフィールドが丸ごと shift 滑ったため）で、
 * それを前フレームの view-projection 行列で投影する。現在のカメラ回転との差分近似は
 * 使わない。前後で粒のいる周期セルが変わる場合や近平面・背後をまたぐ場合は筋を出さない。
 */

const LAYERS = [
  {
    name: 'near', half: 6, seed: 7741, uniformBox: true,
    size: [1.2, 2.9], tone: [.35, 1], alpha: [.22, .44], rocks: 32, rockSize: [5, 12],
  },
  {
    name: 'mid', half: 90, seed: 15583, uniformBox: true,
    size: [1, 2.2], tone: [.3, 1], alpha: [.14, .3], rocks: 0, rockSize: [4, 10],
  },
  {
    name: 'far', half: 9000, seed: 20231, uniformBox: true,
    size: [1, 2], tone: [.25, .9], alpha: [.16, .36], rocks: 0, rockSize: [3, 8],
  },
];

const quadPositions = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
const quadIndex = [0, 1, 2, 0, 2, 3];
const maxStreakPx = 48;

const vertexShader = /* glsl */`
  attribute vec3 aBase;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aKind;
  attribute float aSeed;
  attribute float aTone;
  uniform vec3 uAnchor;
  uniform vec3 uShift;
  uniform mat4 uPrevViewProjection;
  uniform float uHalf;
  uniform vec2 uResolution;
  uniform float uMaxStreak;
  uniform float uStreak;
  uniform float uRatio;
  varying vec2 vQuad;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying float vTone;
  varying float vStretch;
  void main() {
    float span = uHalf * 2.;
    vec3 p = mod(aBase + uAnchor + uHalf, span) - uHalf;
    // Fade across the outer ~28% of the box (0.72..1.02 of uHalf) so a grain that
    // wraps to the opposite face never pops in at full alpha. The field is laid
    // out uniformly over the whole box, so a wider ramp keeps the fade invisible
    // while still hiding the wrap boundary.
    float edge = 1. - smoothstep(uHalf * .72, uHalf * 1.02, max(abs(p.x), max(abs(p.y), abs(p.z))));
    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p, 1.);
    float w0 = max(c0.w, 1e-3);
    vec2 n0 = c0.xy / w0;
    // This grain sat at p - uShift in the previous frame (the field slid by the
    // whole shift), seen through the previous frame's view-projection.
    vec3 pPrev = p - uShift;
    vec4 c1 = uPrevViewProjection * vec4(pPrev, 1.);
    float w1 = max(c1.w, 1e-3);
    vec2 n1 = c1.xy / w1;
    // Screen-space motion of the grain centre this frame, in CSS px.
    vec2 axis = (n0 - n1) * uResolution * .5;
    float raw = length(axis);
    raw = raw >= 0. && raw < 1e7 ? raw : 0.;
    // Only stretch when the previous position is the same periodic image and
    // both frames saw the grain in front of the camera inside the clip range.
    // Otherwise a wrap across the cell would fake a screen-wide streak.
    vec3 cell = step(abs(pPrev), vec3(uHalf));
    float inCell = cell.x * cell.y * cell.z;
    float inFront = step(1e-3, min(c0.w, c1.w));
    float z0 = c0.z / w0, z1 = c1.z / w1;
    float inRange = step(-1., z0) * step(z0, 1.) * step(-1., z1) * step(z1, 1.);
    float valid = inCell * inFront * inRange;
    // Per-grain fade measured in screen space: the faster a grain whips past
    // the camera, the fainter it gets, so only the calm streaks stay bright.
    // Observation (uStreak 0) keeps the plain dots undimmed.
    float screenFade = mix(1., max(.35, 1. / (1. + pow(raw / 600., 1.5))), step(1e-3, uStreak) * valid);
    float lengthPx = min(raw, uMaxStreak) * uStreak * valid;
    vec2 dir = raw > 1e-4 ? axis / raw : vec2(1., 0.);
    vec2 perp = vec2(-dir.y, dir.x);
    float radius = max(aSize * .5, .5 / max(uRatio, 1.));
    float stretch = clamp(lengthPx / max(radius * 4., 1.), 0., 1.);
    // Head leads along the motion; the tail trails behind it.
    vec2 offsetPx = perp * (position.y * radius)
      + dir * (position.x * (radius + lengthPx * .5) - lengthPx * .5);
    vQuad = position.xy;
    vAlpha = aAlpha * edge * screenFade;
    vKind = aKind;
    vSeed = aSeed;
    vTone = aTone;
    vStretch = stretch;
    gl_Position = vec4(n0 + offsetPx * (2. / uResolution), c0.z / w0, 1.);
  }`;

const fragmentShader = /* glsl */`
  uniform float uTime;
  varying vec2 vQuad;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying float vTone;
  varying float vStretch;
  void main() {
    vec2 q = vQuad;
    float shape;
    float tint = 1.;
    if (vKind > .5) {
      // Pebbles: an irregular polygon silhouette plus a faint rim, turning slowly.
      float spin = uTime * (.32 + .5 * vSeed) * (vSeed > .5 ? 1. : -1.);
      float c = cos(spin), s = sin(spin);
      q = mat2(c, -s, s, c) * q;
      float angle = atan(q.y, q.x);
      float noise = sin(angle * 3. + vSeed * 6.2832) * .5
        + sin(angle * 5. - vSeed * 9.4248) * .3
        + sin(angle * 2. + vSeed * 3.1416) * .2;
      float rim = .72 + .2 * noise;
      float r = length(q);
      float body = 1. - smoothstep(rim * .86, rim, r);
      float halo = smoothstep(rim * .7, rim * 1.06, r) * (1. - smoothstep(rim * 1.06, rim * 1.34, r));
      shape = body + halo * .85;
      tint = .72 + .28 * vTone;
    } else {
      float d = q.y * q.y + q.x * q.x * mix(1., .12, vStretch);
      shape = exp(-3.4 * d) * (1. - smoothstep(.9, 1., length(q)));
    }
    float taper = mix(1., smoothstep(-1., -.3, vQuad.x), vStretch);
    float alpha = vAlpha * shape * taper * mix(1., ${STREAK_ALPHA_FLOOR.toFixed(2)}, vStretch);
    if (alpha < .002) discard;
    gl_FragColor = vec4(vec3(.62, .68, .82) * tint * (.9 + .2 * vTone), alpha);
    #include <colorspace_fragment>
  }`;

function makeLayer(spec) {
  const layout = grainLayout(GRAIN_COUNTS[spec.name][3], spec.half, spec.seed, {
    uniformBox: spec.uniformBox, radius: spec.radius, bias: spec.bias, logRadius: spec.logRadius,
    size: spec.size, tone: spec.tone, rocks: spec.rocks, rockSize: spec.rockSize,
  });
  const total = layout.sizes.length;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(quadPositions, 3));
  geometry.setIndex(quadIndex);
  geometry.setAttribute('aBase', new THREE.InstancedBufferAttribute(layout.positions, 3));
  geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(layout.sizes, 1));
  geometry.setAttribute('aKind', new THREE.InstancedBufferAttribute(layout.kinds, 1));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(layout.seeds, 1));
  geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(layout.tones, 1));
  const alphas = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const blend = .55 * layout.tones[i] + .45 * layout.seeds[i];
    const alpha = spec.alpha[0] + (spec.alpha[1] - spec.alpha[0]) * blend;
    // Pebbles read a little denser than the dust around them.
    alphas[i] = layout.kinds[i] > .5 ? Math.min(1, alpha * 1.45) : alpha;
  }
  geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphas, 1));
  geometry.instanceCount = total;
  const uniforms = {
    uAnchor: { value: new THREE.Vector3() },
    uShift: { value: new THREE.Vector3() },
    uPrevViewProjection: { value: new THREE.Matrix4() },
    uHalf: { value: spec.half },
    uResolution: { value: new THREE.Vector2(1280, 800) },
    uMaxStreak: { value: maxStreakPx },
    uStreak: { value: 0 },
    uRatio: { value: 1 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  return { spec, geometry, material, mesh, total, anchor: new THREE.Vector3() };
}

/**
 * 塵と小石の3層（near / mid / far）を作る。戻り値の update を毎フレーム呼ぶ。
 */
export function makeDust(scene) {
  const layers = LAYERS.map(makeLayer);
  layers.forEach(layer => scene.add(layer.mesh));
  let quality = -1;
  let lastTime, spinTime = 0;

  const applyQuality = level => {
    quality = level;
    layers.forEach(layer => {
      const count = Math.min(layer.total, GRAIN_COUNTS[layer.spec.name][level] ?? 0);
      layer.geometry.instanceCount = count;
      layer.mesh.visible = count > 0;
    });
  };

  return {
    setQuality(level) {
      if (level === quality) return;
      applyQuality(THREE.MathUtils.clamp(Math.round(level), 0, 3));
    },
    setSize(width, height) {
      const w = Math.max(1, width), h = Math.max(1, height);
      layers.forEach(layer => layer.material.uniforms.uResolution.value.set(w, h));
    },
    update({ shift, prevViewProjection, streak = 0, reduced = false, time = 0, pixelRatio = 1 }) {
      if (lastTime !== undefined && !reduced) {
        spinTime += Math.min(.1, Math.max(0, (time - lastTime) / 1000));
      }
      lastTime = time;
      const amount = Number.isFinite(streak) ? Math.min(1, Math.max(0, streak)) : 0;
      const exposure = reduced ? 0 : amount;
      layers.forEach(layer => {
        const u = layer.material.uniforms;
        if (shift) {
          layer.anchor.add(shift);
          const span = layer.spec.half * 2;
          layer.anchor.set(
            wrapOffset(layer.anchor.x + layer.spec.half, span) - layer.spec.half,
            wrapOffset(layer.anchor.y + layer.spec.half, span) - layer.spec.half,
            wrapOffset(layer.anchor.z + layer.spec.half, span) - layer.spec.half,
          );
          u.uShift.value.copy(shift);
        } else {
          u.uShift.value.set(0, 0, 0);
        }
        if (prevViewProjection) u.uPrevViewProjection.value.copy(prevViewProjection);
        u.uAnchor.value.copy(layer.anchor);
        u.uStreak.value = exposure;
        u.uRatio.value = pixelRatio || 1;
        u.uTime.value = spinTime;
      });
    },
    dispose() {
      layers.forEach(layer => {
        scene.remove(layer.mesh);
        layer.geometry.dispose();
        layer.material.dispose();
      });
    },
  };
}
