'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(value) { this.x = value.x; this.y = value.y; this.z = value.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(value) { this.x += value.x; this.y += value.y; this.z += value.z; return this; }
  sub(value) { this.x -= value.x; this.y -= value.y; this.z -= value.z; return this; }
  addScaledVector(value, scale) { this.x += value.x * scale; this.y += value.y * scale; this.z += value.z * scale; return this; }
  multiplyScalar(scale) { this.x *= scale; this.y *= scale; this.z *= scale; return this; }
  normalize() { const length = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / length); }
  crossVectors(a, b) { this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); return this; }
  lerp(value, amount) { this.x += (value.x - this.x) * amount; this.y += (value.y - this.y) * amount; this.z += (value.z - this.z) * amount; return this; }
  toArray() { return [this.x, this.y, this.z]; }
  setScalar(value) { this.x = value; this.y = value; this.z = value; return this; }
}

class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
  copy(value) { Object.assign(this, value); return this; }
  identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
  setFromUnitVectors() { return this; }
  setFromRotationMatrix() { return this; }
}

class Matrix4 {
  makeBasis() { return this; }
}

class Color {
  constructor(value = 0xffffff) { this.value = value; }
  set(value) { this.value = value; return this; }
  setRGB(r, g, b) { this.value = [r, g, b]; return this; }
  copy(value) { this.value = value.value; return this; }
  lerp() { return this; }
  lerpColors() { return this; }
}

class Object3D {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.matrix = {};
    this.userData = {};
  }
  add(...objects) { this.children.push(...objects); return this; }
  updateMatrix() { return this; }
  updateMatrixWorld() { return this; }
  localToWorld(vector) { return vector.clone(); }
  traverse(callback) { callback(this); this.children.forEach(child => child.traverse?.(callback)); }
}

class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
}

class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instanceMatrix = { setUsage() {}, needsUpdate: false };
    this.instanceColor = { needsUpdate: false };
    this.isInstancedMesh = true;
  }
  setMatrixAt() {}
  setColorAt() {}
}

class LOD extends Object3D {
  constructor() { super(); this.levels = []; this.isLOD = true; }
  addLevel(object, distance) { this.levels.push({ object, distance }); this.add(object); }
}

class Curve {
  constructor(points) { this.points = points; }
  getPoint(t) {
    const scaled = Math.max(0, Math.min(.999999, t)) * (this.points.length - 1);
    const index = Math.floor(scaled);
    return this.points[index].clone().lerp(this.points[Math.min(index + 1, this.points.length - 1)], scaled - index);
  }
  getTangent(t) { return this.getPoint(Math.min(1, t + .001)).sub(this.getPoint(Math.max(0, t - .001))).normalize(); }
}

class Geometry {
  dispose() {}
}

class Material {
  constructor(options = {}) {
    Object.assign(this, options);
    this.color = options.color instanceof Color ? options.color : new Color(options.color ?? 0xffffff);
    this.emissive = options.emissive instanceof Color ? options.emissive : new Color(options.emissive ?? 0x000000);
    this.uniforms = options.uniforms || {};
  }
  dispose() {}
}

const geometryNames = ['SphereGeometry', 'CylinderGeometry', 'TorusGeometry', 'TubeGeometry', 'ConeGeometry', 'CapsuleGeometry', 'IcosahedronGeometry', 'OctahedronGeometry', 'CircleGeometry', 'RingGeometry', 'BoxGeometry', 'PlaneGeometry'];
const materialNames = ['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'ShaderMaterial', 'PointsMaterial', 'LineBasicMaterial'];
const THREE = {
  Vector3, Quaternion, Matrix4, Color, Object3D, Mesh, InstancedMesh, LOD,
  Group: Object3D,
  CatmullRomCurve3: Curve,
  DynamicDrawUsage: 1,
  DoubleSide: 2,
  AdditiveBlending: 2,
  MathUtils: {
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    lerp: (a, b, amount) => a + (b - a) * amount,
  },
};
for (const name of geometryNames) THREE[name] = class extends Geometry {};
for (const name of materialNames) THREE[name] = class extends Material {};

function loadRuntimeModel(appRoot, modelFile, factoryName, globals) {
  const source = fs.readFileSync(path.join(appRoot, modelFile), 'utf8')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '')
    .replace(/^export\s+/gm, '');
  const context = vm.createContext({ THREE, ...globals });
  vm.runInContext(`${source}\nthis.api = { ${factoryName}, MODEL_STATS };`, context);
  return context.api;
}

module.exports = { loadRuntimeModel };
