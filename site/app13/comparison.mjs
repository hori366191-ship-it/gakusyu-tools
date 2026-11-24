import * as THREE from 'three';
import { COMPARISON_NAME } from './comparison-layout.mjs';

// A display-only Earth for size comparison. It lives in its own group, is
// never added to the world's body/moon arrays, and never feeds orbits, time,
// visits or the chart markers. The caller positions it on the camera's right
// at the target's depth, so both spheres share one scale.
const vertexShader = /* glsl */`
varying vec2 mapUV;
varying vec3 viewNormal, worldPoint;
void main() {
  mapUV = uv;
  viewNormal = normalize(normalMatrix * normal);
  worldPoint = (modelMatrix * vec4(position, 1.)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

const fragmentShader = /* glsl */`
varying vec2 mapUV;
varying vec3 viewNormal, worldPoint;
uniform sampler2D surfaceMap;
uniform bool hasSurfaceMap;
uniform vec3 tint, sunPosition;
uniform float opacity;
void main() {
  vec3 normal = normalize(viewNormal);
  vec3 view = normalize(mat3(viewMatrix) * (-worldPoint));
  vec3 light = normalize(mat3(viewMatrix) * (sunPosition - worldPoint));
  float day = max(dot(normal, light), 0.);
  float rim = pow(1. - clamp(dot(normal, view), 0., 1.), 2.4);
  vec3 albedo = hasSurfaceMap ? texture2D(surfaceMap, mapUV).rgb : tint;
  vec3 color = albedo * (.10 + .92 * pow(day, .75)) + vec3(.18, .38, .85) * rim * (.16 + .42 * day);
  float alpha = opacity * (.38 + .34 * day + .38 * rim);
  gl_FragColor = vec4(color, clamp(alpha, 0., .94));
  #include <colorspace_fragment>
}`;

export function createEarthComparison({ radius, polarRadius, axis, spin, sunPosition, anisotropy = 4 }) {
  const group = new THREE.Group();
  group.name = COMPARISON_NAME;
  group.visible = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: {
      surfaceMap: { value: null }, hasSurfaceMap: { value: false },
      tint: { value: new THREE.Color('#75b5ff') }, sunPosition: { value: sunPosition },
      opacity: { value: 0 },
    },
    vertexShader, fragmentShader,
  }));
  // Display-only overlay: never let a foreground planet or ring swallow it.
  // World bodies keep their normal occlusion because only this mesh opts out.
  mesh.material.depthTest = false;
  mesh.scale.set(radius, polarRadius > 0 ? polarRadius : radius, radius);
  mesh.name = COMPARISON_NAME;
  mesh.renderOrder = 10;
  group.add(mesh);

  let texture, requested = false, disposed = false;
  function loadMap() {
    if (requested) return;
    requested = true;
    // The 1024 map is the smallest shipped Earth texture; it is only fetched
    // the first time the comparison is shown, then cached for the session.
    new THREE.TextureLoader().load(new URL('./textures/earth-1024.webp', import.meta.url).href, loaded => {
      if (disposed) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.wrapS = THREE.RepeatWrapping;
      loaded.anisotropy = Math.min(4, anisotropy);
      texture = loaded;
      mesh.material.uniforms.surfaceMap.value = loaded;
      mesh.material.uniforms.hasSurfaceMap.value = true;
    });
  }

  const right = new THREE.Vector3();
  return {
    group, mesh,
    prepare: loadMap,
    // targetPosition is a camera-relative scene point; camera is at the origin.
    place(targetPosition, camera, offset, opacity) {
      loadMap();
      right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      group.position.copy(targetPosition).addScaledVector(right, offset);
      mesh.quaternion.copy(axis);
      if (spin) mesh.rotateY(spin());
      mesh.material.uniforms.opacity.value = opacity;
      group.visible = opacity > .004;
    },
    hide() { group.visible = false; },
    dispose() {
      disposed = true;
      texture?.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
      group.removeFromParent();
    },
  };
}
