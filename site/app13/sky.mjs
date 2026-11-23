import * as THREE from 'three';

export function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const gaussianVertex = /* glsl */`
attribute vec3 center;
attribute vec3 axisA;
attribute vec3 axisB;
attribute vec3 axisC;
attribute vec4 pigment;
varying vec2 vKernel;
varying vec4 vPigment;
// Perspective Jacobian of (f*x/-z, f*y/-z) at the 3D mean.
vec2 projectAxis(vec3 a, vec3 p, vec2 f) {
  float d = -p.z;
  return (a.xy + p.xy * (a.z / d)) * f / d;
}
void main() {
  vec3 p = (modelViewMatrix * vec4(center, 1.)).xyz;
  vKernel = position.xy;
  vPigment = pigment;
  if (p.z > -360.) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec2 f = vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
  mat3 view = mat3(modelViewMatrix);
  vec2 a = projectAxis(view * axisA, p, f);
  vec2 b = projectAxis(view * axisB, p, f);
  vec2 c = projectAxis(view * axisC, p, f);
  // Project Σ = A Aᵀ, then use a Cholesky factor to place a 3σ quad.
  float xx = a.x*a.x + b.x*b.x + c.x*c.x + 1.e-9;
  float xy = a.x*a.y + b.x*b.y + c.x*c.y;
  float yy = a.y*a.y + b.y*b.y + c.y*c.y + 1.e-9;
  float sx = sqrt(xx), shear = xy / sx;
  vec2 shift = vec2(sx*vKernel.x, shear*vKernel.x + sqrt(max(yy-shear*shear, 1.e-9))*vKernel.y);
  gl_Position = projectionMatrix * vec4(p, 1.);
  gl_Position.xy += shift * gl_Position.w;
}`;

const gaussianFragment = /* glsl */`
varying vec2 vKernel;
varying vec4 vPigment;
void main() {
  float squared = dot(vKernel, vKernel);
  if (squared > 9.) discard;
  gl_FragColor = vec4(vPigment.rgb, vPigment.a * exp(-.5 * squared) * (1. - smoothstep(7.1, 9., squared)));
  #include <colorspace_fragment>
}`;

function makeStars() {
  const rng = randomSequence(99811);
  const positions = [], colors = [], sizes = [];
  const tones = ['#a6bafa', '#e4e9ff', '#ffd9bc', '#b3dfe9'].map(hex => new THREE.Color(hex));
  for (let i = 0; i < 4400; i++) {
    const y = rng() * 2 - 1, az = rng() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    positions.push(4300 * r * Math.cos(az), 4300 * y, 4300 * r * Math.sin(az));
    const color = tones[Math.floor(rng() * tones.length)], bright = rng();
    const strength = .06 + .88 * bright ** 4;
    colors.push(color.r * strength, color.g * strength, color.b * strength);
    sizes.push(.9 + 2.75 * bright ** 10 + (i % 181 === 0 ? 3.1 : 0));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('pigment', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { ratio: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 pigment; attribute float size; uniform float ratio;
      varying vec3 light; varying float bright;
      void main() {
        light = pigment; bright = step(4., size);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        gl_PointSize = max(1.5, size * ratio);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 light; varying float bright;
      void main() {
        vec2 p = abs(gl_PointCoord * 2. - 1.);
        float core = exp(-4.4 * dot(p,p));
        float glint = exp(-24. * min(p.x,p.y) - 2.8 * max(p.x,p.y));
        gl_FragColor = vec4(light, max(core, bright * glint) * .97);
        #include <colorspace_fragment>
      }`,
  });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  stars.renderOrder = -15;
  return stars;
}

export function makeSky(initialDirection) {
  const group = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  const fields = [
    [initialDirection.clone(), .45, '#b36a9e', '#946bd1', '#3d89bc'],
    [new THREE.Vector3(-.57, .46, -.67).normalize(), -.29, '#7898df', '#4aa6bb', '#464d99'],
    [new THREE.Vector3(.01, -.42, 1).normalize(), .34, '#a26f94', '#d3917c', '#604da4'],
    [new THREE.Vector3(-.95, -.25, .16).normalize(), -.41, '#6c75bc', '#5e8ba9', '#454d83'],
  ].map(([forward, slope, a, b, c]) => {
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const vertical = new THREE.Vector3().crossVectors(right, forward);
    return { forward, slope, right, vertical, tones: [a, b, c].map(hex => new THREE.Color(hex)) };
  });

  const fieldTexture = new THREE.Mesh(new THREE.SphereGeometry(4950, 22, 14), new THREE.ShaderMaterial({
    depthWrite: false, side: THREE.BackSide,
    uniforms: {
      intensity: { value: .25 },
      field: { value: fields.map(f => f.forward.clone().addScaledVector(f.vertical, .17).normalize()) },
      tint: { value: fields.map(f => f.tones[1]) },
    },
    vertexShader: /* glsl */`varying vec3 dir; void main() { dir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      varying vec3 dir;
      uniform float intensity;
      uniform vec3 field[4], tint[4];
      void main() {
        vec3 n = normalize(dir);
        vec3 light = vec3(.00135,.00215,.006);
        for (int i=0; i<4; i++) {
          float angle = max(dot(n,field[i]),0.);
          float cloud = pow(angle, 18.) * (.65 + .35 * sin(10.*n.x+3.*sin(8.*n.z)));
          light += tint[i] * cloud * intensity * .072;
        }
        gl_FragColor = vec4(light, 1.);
        #include <colorspace_fragment>
      }`,
  }));
  fieldTexture.frustumCulled = false;
  fieldTexture.renderOrder = -30;
  group.add(fieldTexture);

  const stars = makeStars();
  group.add(stars);
  const rng = randomSequence(914516);
  const samples = [];
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(.000001, rng()))) * Math.cos(Math.PI * 2 * rng());
  const basis = (f, x, y, z) => f.forward.clone().multiplyScalar(z).addScaledVector(f.right, x).addScaledVector(f.vertical, y);
  for (let i = 0; i < 1280; i++) {
    const f = fields[i % 8 < 5 ? 0 : i % 8 - 4];
    const t = rng() * 2 - 1;
    const branch = Math.floor(rng() * 3);
    const thread = i % 5 < 2;
    const x = t * 1300 + normal() * (thread ? 20 : 48);
    const ridge = Math.sin(t * 3.6 + branch * .63) * (branch ? 154 : 223);
    const lanes = thread ? 156 * Math.sin(t * 2.2 + 1.4) + 62 * branch - 140 : branch * 75;
    const y = f.slope * x + ridge + 185 + lanes + normal() * (thread ? 23 : branch === 2 ? 87 : 46);
    const z = 2380 + normal() * 265 + branch * 135;
    const scale = (thread ? 18 + rng() * 58 : 42 + rng() * 116) * (branch === 2 ? 1.16 : 1);
    const theta = Math.atan(f.slope + .6 * Math.cos(t * 3.6 + branch * .6)) + normal() * .22;
    const bend = (rng() * 2 - 1) * .85;
    const ca = Math.cos(theta), sa = Math.sin(theta), cb = Math.cos(bend), sb = Math.sin(bend);
    const color = f.tones[branch].clone().lerp(f.tones[(branch + 1) % 3], rng() * .41);
    let alpha = (.018 + .061 * rng() ** 2) * (1 - .66 * Math.abs(t) ** 2);
    if (thread) {
      color.lerp(new THREE.Color(branch === 2 ? '#79cbd9' : branch === 1 ? '#c8a6ff' : '#ffaca3'), .54);
      alpha *= 1.6;
    }
    if (i % 11 === 0) { color.lerp(new THREE.Color('#ffd7d3'), .45); alpha *= 1.24; }
    samples.push({
      center: basis(f, x, y, z),
      a: basis(f, ca * cb, sa * cb, sb).multiplyScalar(scale * (1.12 + rng() * .9)),
      b: basis(f, -sa, ca, 0).multiplyScalar(scale * (.25 + rng() * .44)),
      c: basis(f, -ca * sb, -sa * sb, cb).multiplyScalar(scale * (.45 + rng())),
      color, alpha, depth: 0,
    });
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-3,-3,0, 3,-3,0, 3,3,0, -3,3,0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const attributes = Object.fromEntries([['center', 3], ['axisA', 3], ['axisB', 3], ['axisC', 3], ['pigment', 4]].map(([key, stride]) =>
    [key, new THREE.InstancedBufferAttribute(new Float32Array(stride * samples.length), stride).setUsage(THREE.DynamicDrawUsage)]));
  Object.entries(attributes).forEach(([key, attr]) => geometry.setAttribute(key, attr));
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexShader: gaussianVertex, fragmentShader: gaussianFragment,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;
  group.add(mesh);
  // Draw gas before stars so faint background stars stay legible through the stylized haze.
  const counts = [0, 350, 720, 1280];
  const compensation = [0, 2.75, 1.65, 1];
  const viewDirection = new THREE.Vector3(), lastDirection = new THREE.Vector3();
  let quality = -1;
  let ordered = [];
  return {
    group,
    setQuality(level, pixelRatio) {
      stars.material.uniforms.ratio.value = Math.min(1.6, pixelRatio);
      if (quality === level) return;
      quality = level;
      ordered = samples.slice(0, counts[level]);
      fieldTexture.material.uniforms.intensity.value = level === 0 ? 1.3 : .26;
      mesh.visible = level !== 0;
      geometry.instanceCount = ordered.length;
      lastDirection.set(0, 0, 0);
    },
    update(camera) {
      group.position.copy(camera.position);
      if (!ordered.length) return;
      camera.getWorldDirection(viewDirection);
      if (lastDirection.dot(viewDirection) > .9996) return;
      lastDirection.copy(viewDirection);
      for (const splat of ordered) splat.depth = splat.center.dot(viewDirection);
      ordered.sort((a, b) => b.depth - a.depth);
      ordered.forEach(({ center, a, b, c, color, alpha }, index) => {
        attributes.center.setXYZ(index, center.x, center.y, center.z);
        attributes.axisA.setXYZ(index, a.x, a.y, a.z);
        attributes.axisB.setXYZ(index, b.x, b.y, b.z);
        attributes.axisC.setXYZ(index, c.x, c.y, c.z);
        attributes.pigment.setXYZW(index, color.r, color.g, color.b, alpha * compensation[quality]);
      });
      Object.values(attributes).forEach(attr => { attr.needsUpdate = true; });
    },
  };
}
