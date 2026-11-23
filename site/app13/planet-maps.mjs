import * as THREE from 'three';
import { MAP_LEVELS, preferredMapSize } from './texture-policy.mjs';

export function makePlanetMaps(models, maxTextureSize, anisotropy) {
  const loader = new THREE.TextureLoader();
  const eye = new THREE.Vector3(), projected = new THREE.Vector3(), offset = new THREE.Vector3();
  const entries = models.filter(model => MAP_LEVELS[model.body.id]).map(model => ({
    model, previewSize: MAP_LEVELS[model.body.id][0], requestedPreview: false, angular: 0, size: 0, blend: 0,
  }));
  const failed = new Set();
  let detail, pending, desired, stopped = false;
  let nextSurvey = 0;

  function load(entry, size, ready) {
    const key = `${entry.model.body.id}-${size}`;
    loader.load(new URL(`./textures/${key}.webp`, import.meta.url).href, texture => {
      if (stopped) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(4, anisotropy);
      texture.needsUpdate = true;
      ready(texture);
    }, undefined, () => {
      failed.add(key);
      if (!stopped) ready(null);
    });
  }

  function assign(entry, texture) {
    entry.model.surface.material.uniforms.observationMap.value = texture || null;
    if (!texture) entry.blend = 0;
  }

  function requestPreview(entry) {
    if (entry.requestedPreview || entry.previewSize > maxTextureSize) return;
    entry.requestedPreview = true;
    load(entry, entry.previewSize, texture => {
      entry.preview = texture;
      entry.previewFinished = true;
      if (detail?.entry !== entry) assign(entry, texture);
    });
  }

  function survey(camera, quality, coarse, focus) {
    camera.getWorldDirection(eye);
    for (const entry of entries) {
      const { model } = entry;
      if (model !== focus) { entry.angular = entry.size = 0; continue; }
      offset.subVectors(model.position, camera.position);
      const ratio = model.radius / offset.length();
      projected.copy(model.position).project(camera);
      const extent = Math.min(.7, ratio * 2.8);
      const visible = offset.dot(eye) > 0 && Math.abs(projected.y) < 1 + extent
        && Math.abs(projected.x) < 1 + extent / camera.aspect;
      entry.angular = visible ? ratio : 0;
      const held = detail?.entry === entry || desired?.entry === entry;
      entry.size = preferredMapSize(model.body.id, entry.angular * (held ? 1.12 : 1), quality, coarse, maxTextureSize);
      if (entry.size) requestPreview(entry);
    }
    const eligible = entries.filter(entry => entry.size > entry.previewSize
      && !failed.has(`${entry.model.body.id}-${entry.size}`));
    const best = eligible.sort((a, b) => b.angular - a.angular)[0];
    desired = best && { entry: best, size: best.size };
    if (detail && (!desired || detail.entry !== desired.entry || detail.size !== desired.size)) {
      assign(detail.entry, detail.entry.preview);
      detail.texture.dispose();
      detail = undefined;
    }
    if (!desired || detail || pending || !desired.entry.previewFinished) return;
    pending = desired;
    const request = pending;
    load(request.entry, request.size, texture => {
      pending = undefined;
      if (!texture) return;
      if (desired?.entry !== request.entry || desired.size !== request.size) { texture.dispose(); return; }
      detail = { ...request, texture };
      assign(request.entry, texture);
    });
  }

  return {
    update(time, dt, camera, quality, coarse, focus) {
      if (time >= nextSurvey) {
        nextSurvey = time + 190;
        survey(camera, quality, coarse, focus);
      }
      for (const entry of entries) {
        const { uniforms } = entry.model.surface.material;
        if (uniforms.observationMap.value) entry.blend = Math.min(1, entry.blend + dt * 3.7);
        uniforms.observationMix.value = entry.blend;
      }
    },
    dispose() {
      stopped = true;
      detail?.texture.dispose();
      for (const entry of entries) entry.preview?.dispose();
    },
  };
}
