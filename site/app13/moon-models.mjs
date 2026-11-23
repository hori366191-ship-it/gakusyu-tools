import * as THREE from 'three';
import { SCENE_UNITS_PER_AU, positionAt, sceneRadius } from './bodies.mjs';
import { MOONS, moonOffsetAt, moonOrbitNormal } from './moons.mjs';
import { MOON_MAPS } from './moon-maps.mjs';

const up = new THREE.Vector3(0, 1, 0);
const vertex = /* glsl */`
varying vec3 viewNormal, worldPoint;
varying vec2 mapUV;
void main() {
  mapUV = uv;
  viewNormal = normalize(normalMatrix * normal);
  worldPoint = (modelMatrix * vec4(position, 1.)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

const fragment = /* glsl */`
varying vec3 viewNormal, worldPoint;
varying vec2 mapUV;
uniform vec3 tint, sunlight;
uniform sampler2D surfaceMap;
uniform bool hasSurfaceMap;
void main() {
  vec3 normal = normalize(viewNormal);
  vec3 light = normalize(mat3(viewMatrix) * (sunlight - worldPoint));
  float day = max(0., dot(normal, light));
  vec3 albedo = hasSurfaceMap ? texture2D(surfaceMap, mapUV).rgb : tint * .76;
  vec3 color = albedo * (.019 + .98*pow(day, .72));
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
  const models = MOONS.map(body => {
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
        surfaceMap: { value: null }, hasSurfaceMap: { value: false },
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
  let shown = [];
  let activeGroup, level = 0;
  const loader = new THREE.TextureLoader();
  let mapTarget, mapTexture, request = 0, disposed = false;

  function showMap(focus) {
    const target = focus?.parent && MOON_MAPS[focus.body.id] ? focus : undefined;
    if (target === mapTarget) return;
    if (mapTarget) {
      const { uniforms } = mapTarget.surface.material;
      uniforms.hasSurfaceMap.value = false;
      uniforms.surfaceMap.value = null;
    }
    mapTexture?.dispose();
    mapTexture = undefined;
    mapTarget = target;
    const token = ++request;
    if (!target) return;
    loader.load(new URL(`./textures/moons/${target.body.id}.webp`, import.meta.url).href, texture => {
      if (disposed || token !== request) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      mapTexture = texture;
      const { uniforms } = target.surface.material;
      uniforms.surfaceMap.value = texture;
      uniforms.hasSurfaceMap.value = true;
    });
  }

  return {
    models,
    positionAt(model, days, out) {
      return out.fromArray(moonOffsetAt(model.body, days)).applyQuaternion(model.basis)
        .add(offset.fromArray(positionAt(model.parent.body, days)));
    },
    place(days, cameraAU, focus) {
      showMap(focus);
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
        if (body.synchronous) {
          towardParent.copy(offset).normalize().negate();
          across.crossVectors(towardParent, axis).normalize();
          surface.quaternion.setFromRotationMatrix(attitude.makeBasis(towardParent, axis, across));
        }
      }
    },
    setQuality(next) { level = next; },
    dispose() {
      disposed = true;
      showMap();
      sphere.dispose();
      lowSphere.dispose();
      for (const geometry of rockGeometries) geometry.dispose();
      for (const { surface } of models) { scene.remove(surface); surface.material.dispose(); }
    },
  };
}
