import { MODE_ORDER } from './content.mjs';

export const HWO_DURATION = 45;
export const CAMERA_TARGET = Object.freeze([0, 0, 2.5]);
export const PLANET_POSITION = Object.freeze([2.25, .45, 9.5]);
export const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
export const fract = value => value - Math.floor(value);
export const ease = value => 1 - (1 - clamp01(value)) ** 3;
export const normalizeMode = value => MODE_ORDER.includes(value) ? value : MODE_ORDER[0];
export const isKnownMode = value => MODE_ORDER.includes(value);

export function normalizeHWOTime(value) {
  return Number.isFinite(value) ? Math.min(HWO_DURATION, Math.max(0, value)) : 0;
}
export function formatHWOTime(value) {
  const total = Math.floor(normalizeHWOTime(value));
  return `T+ ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function sampleHWOState(value, mode = MODE_ORDER[0]) {
  const time = normalizeHWOTime(value);
  const progress = time / HWO_DURATION;
  const selectedMode = normalizeMode(mode);
  const mirrorDeployment = selectedMode === 'mirror-deploy' ? ease(progress * 1.12) : 1;
  const suppression = selectedMode === 'starlight-suppression' ? ease(progress * 1.25) : selectedMode === 'mirror-deploy' ? .15 : .78;
  const starshadeDeployment = selectedMode === 'mirror-deploy' || selectedMode === 'starlight-suppression' ? ease(clamp01(progress * 1.5 - .12)) : .82;
  const imaging = selectedMode === 'direct-imaging' ? ease(progress * 1.18) : .72;
  const spectrum = selectedMode === 'spectroscopy' || selectedMode === 'biosignature' ? clamp01(progress * 1.1) : .3;
  const planetReveal = selectedMode === 'direct-imaging' ? ease(progress * 1.5) : selectedMode === 'spectroscopy' || selectedMode === 'biosignature' ? .86 : .42;
  const active = MODE_ORDER.indexOf(selectedMode);
  return {
    mode: selectedMode, time, duration: HWO_DURATION, progress, active,
    mirrorDeployment, suppression, starshadeDeployment, imaging, spectrum, planetReveal,
    planetPosition: [...PLANET_POSITION],
    planetRotation: progress * Math.PI * 2,
    photonPhase: fract(progress * 4 + .12),
    weights: {
      mirror: selectedMode === 'mirror-deploy' ? 1.7 : .7,
      suppression: selectedMode === 'starlight-suppression' ? 1.65 : .5,
      imaging: selectedMode === 'direct-imaging' ? 1.65 : .5,
      spectroscopy: ['spectroscopy', 'biosignature'].includes(selectedMode) ? 1.7 : .3,
      biosignature: selectedMode === 'biosignature' ? 1.7 : .2,
    },
    educational: true,
  };
}

export function advanceHWOTime(time, deltaSeconds, rate = 1) {
  if (!Number.isFinite(deltaSeconds) || !Number.isFinite(rate) || deltaSeconds < 0 || rate <= 0) return normalizeHWOTime(time);
  return fract((normalizeHWOTime(time) + deltaSeconds * rate) / HWO_DURATION) * HWO_DURATION;
}
