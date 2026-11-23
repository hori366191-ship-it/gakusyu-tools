import * as THREE from 'three';
import { SCENE_UNITS_PER_AU, positionAt, sceneRadius } from './bodies.mjs';
import { MOONS, moonOffsetAt, moonOrbitNormal } from './moons.mjs';

const up = new THREE.Vector3(0, 1, 0);
const terrainTypes = ['craters', 'maria', 'rock', 'volcanic', 'fractured', 'mixed', 'haze', 'two-tone'];

const vertex = /* glsl */`
varying vec3 surfacePoint, viewNormal, worldPoint;
void main() {
  surfacePoint = position;
  viewNormal = normalize(normalMatrix * normal);
  worldPoint = (modelMatrix * vec4(position, 1.)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

const fragment = /* glsl */`
varying vec3 surfacePoint, viewNormal, worldPoint;
uniform vec3 tint, sunlight, localLight;
uniform float seed, landmark;
uniform int terrain, quality;

float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.11, .29, .47)) * 17.;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 k = floor(p), u = fract(p);
  u = u*u*(3.-2.*u);
  return mix(mix(mix(hash(k), hash(k+vec3(1,0,0)), u.x),
                 mix(hash(k+vec3(0,1,0)), hash(k+vec3(1,1,0)), u.x), u.y),
             mix(mix(hash(k+vec3(0,0,1)), hash(k+vec3(1,0,1)), u.x),
                 mix(hash(k+vec3(0,1,1)), hash(k+vec3(1,1,1)), u.x), u.y), u.z);
}
float craters(vec3 p, float roughness) {
  float relief = 0.;
  for (int j = 0; j < 36; j++) {
    if (j >= 16 && quality < 2) break;
    float k = float(j) + seed;
    float y = hash(vec3(k,.49,1.91))*2.-1.;
    float a = 6.2831853*hash(vec3(.21,k,2.45));
    vec3 center = vec3(sqrt(1.-y*y)*cos(a), y, sqrt(1.-y*y)*sin(a));
    float radius = .032 + .15 * pow(hash(vec3(3.19,.51,k)), 2.1);
    if (j == 0 && landmark > 0.) { radius = landmark; center = vec3(1.,0.,0.); }
    vec3 delta = p-center;
    float d2 = dot(delta,delta) / (radius*radius) * (.86 + roughness*.28);
    float rim = smoothstep(.58,.89,d2) * (1.-smoothstep(.92,1.24,d2));
    float aspect = dot(delta, localLight) / radius;
    relief += (.10 + .11*aspect) * rim - (.12 + .10*aspect) * (1.-smoothstep(.36,.93,d2));
  }
  return clamp(relief, -.50, .36);
}
void main() {
  vec3 p = normalize(surfacePoint);
  vec3 normal = normalize(viewNormal);
  vec3 light = normalize(mat3(viewMatrix) * (sunlight - worldPoint));
  float day = max(0., dot(normal, light));
  float broad = noise(p*4.3 + seed);
  float grain = noise(p*18. + seed);
  if (quality > 1) grain = mix(grain,noise(p*53. - seed),.35);
  float rocks = .82 + .23 * broad + .17 * grain;
  vec3 albedo = tint * rocks;
  if (terrain == 5 || terrain == 4) {
    vec3 q = p * (terrain == 4 ? vec3(9., 16., 12.) : vec3(17., 7., 12.));
    float seam = abs(noise(q + broad * 2.6 + seed) - .5);
    float lines = (1.-smoothstep(.023,.073,seam)) * smoothstep(.26,.65,broad);
    albedo *= 1. - (terrain == 4 ? .32 : .19) * lines;
  }
  if (terrain == 1) albedo *= mix(.48,1.05,smoothstep(.39,.56,broad + grain*.14));
  if (terrain == 3) {
    float sulfur = smoothstep(.37,.71,broad+grain*.16);
    albedo *= mix(vec3(.63,.30,.10), vec3(1.05,1.04,.84), sulfur);
    albedo = mix(albedo, vec3(.88,.78,.52), smoothstep(.69,.84,grain)*.5);
  }
  if (terrain == 6) {
    float air = sin(p.y * 12. + broad*.4)*.027;
    albedo = tint * (.90 + .12*noise(p*5.+seed) + air);
  }
  if (terrain == 7) albedo *= mix(.15, 1.02, smoothstep(-.22,.21,p.z + (broad-.5)*.42));
  if (terrain != 3 && terrain != 6) {
    float strength = terrain == 4 ? .28 : terrain == 2 && landmark == 0. ? .46 : 1.;
    albedo *= 1. + craters(p,grain) * strength;
  }
  vec3 color = albedo * (.019 + .98*pow(day, .72));
  if (terrain == 6) {
    float rim = 1.-max(0., dot(normal, normalize(mat3(viewMatrix) * (cameraPosition-worldPoint))));
    color += tint * .20 * pow(rim, 2.) * smoothstep(0., .55, day);
  }
  gl_FragColor = vec4(color,1.);
  #include <colorspace_fragment>
}`;

function rockGeometry(body) {
  const geometry = new THREE.SphereGeometry(1, 30, 20);
  const position = geometry.attributes.position;
  const p = new THREE.Vector3();
  const seed = body.id === 'phobos' ? 2.4 : 5.1;
  for (let j = 0; j < position.count; j++) {
    p.fromBufferAttribute(position, j);
    const form = 1 + .063 * Math.sin(5*p.x + 3*p.y + seed) * Math.sin(5*p.z - 2*p.y)
      + .037 * Math.sin(8*p.y + 5*p.z + seed) * Math.cos(6*p.x - 3*p.z);
    position.setXYZ(j, p.x * form, p.y * form, p.z * form);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createMoonModels(scene, planets, sunlight) {
  const sphere = new THREE.SphereGeometry(1, 56, 38);
  const lowSphere = new THREE.SphereGeometry(1, 26, 18);
  const byId = new Map(planets.map(model => [model.body.id, model]));
  const basisUp = new THREE.Vector3();
  const groups = new Map(), rockGeometries = [];
  const models = MOONS.map((body, index) => {
    const parent = byId.get(body.parentId);
    const basis = new THREE.Quaternion();
    if (body.frame === 'equator') {
      // The planets render retrograde spin as a negative rate about the mesh
      // axis. Use the physical spin pole for prograde satellite orbits.
      basisUp.copy(parent.axis).multiplyScalar(parent.body.spin < 0 ? -1 : 1);
      basis.setFromUnitVectors(up, basisUp);
    }
    const axis = new THREE.Vector3().fromArray(moonOrbitNormal(body)).applyQuaternion(basis);
    const radius = sceneRadius(body);
    const shape = body.shape || [1, 1, 1];
    const shapeScale = radius / Math.cbrt(shape[0]*shape[1]*shape[2]);
    const custom = body.shape ? rockGeometry(body) : null;
    if (custom) rockGeometries.push(custom);
    const surface = new THREE.Mesh(custom || lowSphere, new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment,
      uniforms: {
        tint: { value: new THREE.Color(body.color) }, sunlight: { value: sunlight },
        localLight: { value: new THREE.Vector3(1, 0, 0) },
        terrain: { value: terrainTypes.indexOf(body.terrain) }, quality: { value: 0 },
        seed: { value: 5.37 + index * 13.15 }, landmark: { value: body.crater ?? 0 },
      },
    }));
    surface.scale.fromArray(shape).multiplyScalar(shapeScale);
    surface.name = body.id;
    surface.visible = false;
    scene.add(surface);
    const model = { body, parent, basis, axis, radius, custom, surface, au: new THREE.Vector3(),
      viewingRadius: custom ? Math.max(...shape) * shapeScale * 1.04 : radius };
    if (!groups.has(body.parentId)) groups.set(body.parentId, []);
    groups.get(body.parentId).push(model);
    return model;
  });
  const offset = new THREE.Vector3();
  const towardParent = new THREE.Vector3(), across = new THREE.Vector3();
  const attitude = new THREE.Matrix4();
  const inverseAttitude = new THREE.Quaternion();
  let shown = [];
  let activeGroup, level = 0;

  return {
    models,
    positionAt(model, days, out) {
      return out.fromArray(moonOffsetAt(model.body, days)).applyQuaternion(model.basis)
        .add(offset.fromArray(positionAt(model.parent.body, days)));
    },
    place(days, cameraAU, focus) {
      const group = focus?.parent?.body.id ?? focus?.body.id;
      if (group !== activeGroup) {
        for (const { surface } of shown) surface.visible = false;
        activeGroup = group;
        shown = groups.get(group) ?? [];
      }
      for (const model of shown) {
        const { body, parent, surface, axis, basis, custom, au, radius } = model;
        offset.fromArray(moonOffsetAt(body, days)).applyQuaternion(basis);
        au.copy(parent.au).add(offset);
        surface.position.copy(au).sub(cameraAU).multiplyScalar(SCENE_UNITS_PER_AU);
        surface.visible = true;
        const detail = model === focus || surface.position.lengthSq() < (radius * 80) ** 2;
        if (!custom) surface.geometry = detail && level >= 2 ? sphere : lowSphere;
        surface.material.uniforms.quality.value = detail ? level : 0;
        if (body.synchronous) {
          towardParent.copy(offset).normalize().negate();
          across.crossVectors(towardParent, axis).normalize();
          surface.quaternion.setFromRotationMatrix(attitude.makeBasis(towardParent, axis, across));
        }
        if (detail) surface.material.uniforms.localLight.value.subVectors(sunlight, surface.position).normalize()
          .applyQuaternion(inverseAttitude.copy(surface.quaternion).invert());
      }
    },
    setQuality(next) { level = next; },
    dispose() {
      sphere.dispose();
      lowSphere.dispose();
      for (const geometry of rockGeometries) geometry.dispose();
      for (const { surface } of models) { scene.remove(surface); surface.material.dispose(); }
    },
  };
}
