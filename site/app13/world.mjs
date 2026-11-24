import * as THREE from 'three';
import { BODIES, RAD, TAU, SCENE_UNITS_PER_AU, orbitalPoint, positionAt, sceneRadii } from './bodies.mjs';
import { cloudsFragment, earthAirFragment, earthClouds, saturnRings } from './planet-effects.mjs';
import { createMoonModels } from './moon-models.mjs';

const noiseSource = /* glsl */`
float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.11,.29,.47));
  p *= 17.;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 g = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(mix(hash(g),hash(g+vec3(1,0,0)),f.x),mix(hash(g+vec3(0,1,0)),hash(g+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(g+vec3(0,0,1)),hash(g+vec3(1,0,1)),f.x),mix(hash(g+vec3(0,1,1)),hash(g+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float n = .52 * noise(p);
  p = p*2.04 + vec3(4.5,2.6,7.9); n += .27 * noise(p);
  p = p*2.06 + vec3(8.3,5.5,1.6); n += .14 * noise(p);
  return n + .07 * noise(p * 2.03 + vec3(3.,7.,1.));
}`;

const surfaceVertex = /* glsl */`
varying vec3 worldPoint, nView, vView, terrain;
varying vec2 mapUV;
void main() {
  mapUV = uv;
  terrain = position;
  worldPoint = (modelMatrix * vec4(position,1.)).xyz;
  nView = normalize(normalMatrix * normal);
  vec4 view = modelViewMatrix * vec4(position,1.);
  vView = -view.xyz;
  gl_Position = projectionMatrix * view;
}`;

const surfaceFragment = /* glsl */`
varying vec3 worldPoint, nView, vView, terrain;
varying vec2 mapUV;
uniform int body;
uniform int detailLevel;
uniform vec3 tint, air;
uniform vec3 planetCenter, axis, sunLocal, sunPosition;
uniform float planetRadius, clock, cloudShift, observationMix;
uniform sampler2D observationMap;
${noiseSource}
${saturnRings}
${earthClouds}

vec3 giantClouds(vec3 p, int id, bool detailed) {
  // The brightest belts and pale zones differ in width and latitude. Wisp
  // distortion is stretched east-west rather than stamped onto equal stripes.
  float lat = asin(clamp(p.y,-1.,1.));
  vec3 q = spinY(p, (.9 + .2 * float(id)) * sin(lat * 10.));
  float broad = fbm(q*vec3(3.,8.,3.)+float(id)*9.3);
  float thread = fbm(q*vec3(5.,32.,5.)+vec3(7.,2.,9.));
  float y = lat + (thread-.5) * .077;
  float bands = .48 + .19*sin(y*22.8 + 1.2*sin(y*6.)) + .105*sin(y*43. + broad*3.6)
    + .06*sin(y*88.) + .26*(broad-.5) + .13*(thread-.5);
  if (detailed) {
    float filaments = noise(q*vec3(12.,91.,12.) + broad*3.);
    bands += (filaments-.5)*.13*(1.-smoothstep(.12,.37,length(fwidth(q))*22.));
  }
  if (id == 6) {
    float hex = cos(atan(p.z,p.x)*6.)*.025;
    float gap = (lat-1.34-hex)/.029;
    float polarJet = exp(-gap*gap);
    vec3 shade = mix(vec3(.46,.32,.187),vec3(.92,.80,.55),clamp(.27+bands*.64,0.,1.));
    shade = mix(shade,vec3(.52,.55,.47),smoothstep(.95,1.45,abs(lat))*.54);
    return shade * (1.-.22*polarJet);
  }
  if (id >= 7) {
    // Keep unmeasured regions close to the measured palette without painting
    // extra storms or a color boundary onto the data.
    vec3 neutral = id == 7 ? vec3(.40,.61,.57) : vec3(.30,.46,.61);
    float contrast = id == 7 ? .055 : .12;
    return neutral * (1. + (bands-.5)*contrast);
  }
  vec3 shade = mix(vec3(.42,.26,.17),vec3(.93,.83,.72),bands);
  float lon = atan(p.z,p.x);
  vec2 spot = vec2(5.*atan(sin(lon-.74),cos(lon-.74)), (p.y+.34)*10.);
  float d = length(spot) + (thread-.5)*.47;
  float vortex = 1. - smoothstep(.39,1.23,d);
  vec3 rust = mix(vec3(.57,.126,.043),vec3(.86,.36,.19), .5+.5*sin(d*24.+atan(spot.y,spot.x)*2.));
  return mix(shade,rust,vortex*.85);
}

float spotDarkening(vec3 p, vec3 center, float size) {
  float d = length(p-normalize(center)) + .011*(noise(p*186.)-.5);
  return .60*(1.-smoothstep(size*.34,size*.80,d)) + .20*(1.-smoothstep(size*.80,size*1.40,d));
}

float ringTransmission(vec3 point) {
  vec3 ray = normalize(sunPosition-point);
  float slope = dot(axis,ray);
  if (abs(slope) < .00001) return 1.;
  float t = -dot(axis,point-planetCenter) / slope;
  vec3 hit = point-planetCenter + t*ray;
  float r = length(hit) / planetRadius;
  float penumbra = clamp(.009 + .014 * t/planetRadius,.009,.08);
  return t > 0. ? exp(-ringDepth(r,penumbra) * (.87 + .30/(abs(slope)+.12))) : 1.;
}

void main() {
  vec3 p = normalize(terrain);
  vec3 n = normalize(nView);
  vec3 view = normalize(vView);
  vec3 light = normalize(mat3(viewMatrix) * (sunPosition-worldPoint));
  float daylight = dot(n,light);
  float facing = clamp(dot(view,n),0.,1.);
  vec3 base;
  float cloudShade = 1.;
  if (body == 0) {
    vec3 flow = p + vec3(0., clock * .010, 0.);
    float cell = fbm(flow*15. + 1.5*vec3(fbm(flow*5.),fbm(flow*6.+7.),fbm(flow*7.+3.)));
    float granules = noise(flow*98.)*.59 + noise(flow*181.)*.41;
    float detail = 1.-smoothstep(.16,.50,length(fwidth(p))*45.);
    float plasma = smoothstep(.18,.80,cell + .19*mix(.5,granules,detail));
    base = mix(vec3(.78,.13,.024),vec3(1.,.76,.35),plasma);
    float spots = max(spotDarkening(p,vec3(-.68,.29,.67),.077),spotDarkening(p,vec3(-.73,.31,.61),.043));
    spots = max(spots,spotDarkening(p,vec3(.33,-.36,-.87),.066));
    base *= (1.-spots) * (.45 + .55*pow(facing,.58));
    base.g *= .77 + .23 * pow(facing,.44);
    gl_FragColor = vec4(base,1.);
    #include <colorspace_fragment>
    return;
  }
  // Three uploads sRGB textures into an sRGB GPU format; samples are linear.
  // Alpha marks coverage, not holes in the planet (e.g. unobserved cloud tops).
  vec4 texel = observationMix > 0. ? texture2D(observationMap,mapUV) : vec4(0.);
  vec3 recorded = texel.rgb;
  float mapMix = observationMix * texel.a;
  bool observed = mapMix > .998;
  if (body == 3) {
    float water = 0.;
    if (!observed) {
      float warp = fbm(p*3.7 + 5.);
      float coast = fbm(p * 2.55 + vec3(11.,15.,2.) + (warp-.5)*.7);
      float land = smoothstep(.49,.513,coast);
      float climate = fbm(p*6.1 + 8.);
      vec3 ocean = mix(vec3(.007,.023,.128),vec3(.022,.127,.315),climate);
      ocean = mix(ocean,vec3(.017,.237,.31), smoothstep(.462,.498,coast) * .67);
      vec3 ground = mix(vec3(.048,.137,.039),vec3(.31,.224,.081),smoothstep(.30,.65,climate + (1.-abs(p.y))*.13));
      base = mix(ocean, ground, land);
      float ice = smoothstep(.866,.977,abs(p.y) + .11 * (climate-.35));
      base = mix(base,vec3(.71,.84,.89),ice);
      water = (1.-land)*(1.-ice);
    } else base = vec3(0.);
    if (observationMix > 0.) {
      float blue = smoothstep(.001,.006,recorded.b - max(recorded.r,recorded.g));
      float sea = blue * (1.-smoothstep(.024,.081,dot(recorded,vec3(.21,.72,.07))));
      vec3 landColor = recorded * vec3(1.26,1.23,1.25);
      vec3 oceanColor = recorded * 1.25 + vec3(.006,.030,.094);
      base = mix(base,mix(landColor, oceanColor, sea),mapMix);
      water = mix(water,sea,mapMix);
    }
    if (detailLevel > 0 && daylight > 0.) {
      float incidence = dot(p,sunLocal);
      float t = sqrt(max(0.,incidence*incidence + cloudRadius*cloudRadius - 1.)) - incidence;
      vec3 over = normalize(p+t*sunLocal);
      cloudShade -= .29*cloudsAt(spinY(over,-cloudShift), false);
    }
    float shine = pow(max(dot(reflect(-light,n),view),0.),52.) * water * smoothstep(-.03,.44,daylight);
    base += vec3(.24,.24,.20) * shine;
  } else if (body == 2) {
    // Venus is an opaque observation + image-generation composite. If the map
    // is still loading, show a neutral cloud deck, not invented shader bands.
    base = mix(vec3(.67,.56,.39), recorded, mapMix);
  } else if (body >= 5) {
    base = observed ? vec3(0.) : giantClouds(p,body,detailLevel > 0);
    vec3 mapColor = body == 5 ? recorded*vec3(1.18,1.13,1.08) : recorded;
    base = mix(base,mapColor,mapMix);
  } else {
    base = tint;
    if (!observed) {
      float coarse = fbm(p*4.4 + float(body)*9.);
      float fine = fbm(p*21. + coarse*3.);
      base *= .48 + .73 * coarse + .62 * fine;
      if (body == 4) {
        float darkRegion = smoothstep(.45,.66,coarse*.92);
        base = mix(base,vec3(.18,.066,.04),darkRegion*.68);
        base = mix(base,vec3(.83,.82,.73),smoothstep(.91,.982,abs(p.y)+.11*(coarse-.4)));
      } else {
        // Cellular depressions and bright rims, generated from neighboring feature points.
        vec3 q = p*13., cell = floor(q), f = fract(q);
        float d = 8.;
        for (int z=-1;z<=1;z++) for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
          vec3 t = vec3(float(x),float(y),float(z));
          vec3 seed = cell+t;
          vec3 point = vec3(hash(seed+13.),hash(seed+9.),hash(seed+5.));
          vec3 diff = t + .15 + .7*point - f;
          d = min(d,dot(diff,diff));
        }
        base *= .72+.32*smoothstep(.04,.16,d)+.15*exp(-100.*abs(d-.18));
      }
    }
    if (observationMix > 0.) {
      vec3 terrainColor = body == 1 ? recorded*vec3(.92,.86,.77) : recorded*vec3(1.25,1.21,1.16);
      base = mix(base, terrainColor, mapMix);
    }
  }
  bool rocky = body == 1 || body == 4;
  float lambert = pow(max(daylight,0.),rocky ? .89 : .72);
  float softness = smoothstep(-.15,.23,daylight);
  if (body == 6 && daylight > 0.) cloudShade *= ringTransmission(worldPoint);
  vec3 radiance = base * ((rocky ? .010 : .021) + (.89*lambert + .095*softness)*cloudShade);
  if (body != 3) radiance += air * pow(1.-facing,3.0) * (.07 + .27*softness);
  gl_FragColor = vec4(radiance,1.);
  #include <colorspace_fragment>
}`;

const airFragment = /* glsl */`
varying vec3 worldPoint, nView, vView;
uniform vec3 tint, sunPosition;
uniform float power;
void main() {
  vec3 toSun = normalize(mat3(viewMatrix) * (sunPosition-worldPoint));
  vec3 n = normalize(nView);
  float facing = abs(dot(n,normalize(vView)));
  float glow = pow(1.-facing,4.5) * (.14 + .86*smoothstep(-.38,.62,dot(n,toSun)));
  gl_FragColor = vec4(tint,glow*power);
  #include <colorspace_fragment>
}`;

function rings(body, radius, sunPosition) {
  const saturn = body.id === 'saturn';
  const ring = new THREE.Mesh(new THREE.RingGeometry(saturn ? 1.21 : 1.53, saturn ? 2.34 : 2.03, 192, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    uniforms: { saturn: { value: Number(saturn) }, sunPosition: { value: sunPosition } },
    vertexShader: /* glsl */`
      varying vec3 localPoint, toSun;
      varying float opening;
      uniform vec3 sunPosition;
      void main() {
        localPoint = position;
        vec3 origin = modelMatrix[3].xyz;
        vec3 light = sunPosition-origin;
        toSun = normalize(vec3(dot(light,modelMatrix[0].xyz),dot(light,modelMatrix[1].xyz),dot(light,modelMatrix[2].xyz)));
        opening = abs(dot(normalize(cameraPosition-origin),normalize(modelMatrix[2].xyz)));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 localPoint, toSun;
      varying float opening;
      uniform int saturn;
      ${saturnRings}
      void main() {
        float r = length(localPoint.xy);
        vec3 light = normalize(toSun);
        float polarScale = saturn == 1 ? .902 : .977;
        vec3 shape = vec3(1.,1.,1./polarScale);
        vec3 towardSun = normalize(light*shape);
        float ray = dot(localPoint,-towardSun);
        float shadow = mix(1.,smoothstep(.97,1.04,length(localPoint+ray*towardSun)),step(0.,ray));
        float grit = .5+.5*sin(r*178.+2.1*sin(r*37.));
        vec3 color;
        float alpha;
        if (saturn == 1) {
          float width = clamp(fwidth(r)*.70,.001,.022);
          float tau = ringDepth(r,width);
          alpha = 1. - exp(-tau / max(.35,opening));
          float innerWarm = annulus(r,1.49,1.90,.043);
          float bands = .32+.21*sin(r*36.5)+.09*grit+.28*innerWarm;
          color = mix(vec3(.36,.25,.148),vec3(.89,.79,.62),bands);
          // The unlit side transmits light through thinner parts of the ring.
          float sunFacing = step(0.,light.z*(gl_FrontFacing ? 1. : -1.));
          color *= mix(.69+.10*exp(-tau),.98,sunFacing);
        } else {
          alpha = .17*smoothstep(.70,.97,grit) + .26*(1.-smoothstep(.013,.05,abs(r-1.91)));
          color = vec3(.25,.36,.42);
        }
        gl_FragColor = vec4(color*(.15+.85*shadow),alpha);
        #include <colorspace_fragment>
      }`,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(radius);
  ring.renderOrder = 2;
  return ring;
}

function corona() {
  return new THREE.Mesh(new THREE.PlaneGeometry(135, 135), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { clock: { value: 0 }, close: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 v; void main() { v = uv*2.-1.; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      varying vec2 v;
      uniform float clock, close;
      void main() {
        float r = length(v);
        float a = atan(v.y,v.x);
        float rays = .55 + .2*sin(a*7. + .2*sin(clock*.31)) + .14*sin(a*17.+1.1) + .09*sin(a*29.-r*13.);
        float glow = .56*exp(-13.*max(r-.205,0.)) + .30*exp(-5.7*max(r-.20,0.))*rays;
        glow *= 1. - close*.28;
        gl_FragColor = vec4(1.,mix(.19,.52,exp(-9.*max(r-.21,0.))),.08,glow*smoothstep(0.,.20,r)*(1.-smoothstep(.78,1.,r)));
        #include <colorspace_fragment>
      }`,
  }));
}

const atmosphere = {
  venus: ['#fac08b', .52, 1.041], earth: ['#428dff', .69, 1.047],
  mars: ['#e28563', .36, 1.032], jupiter: ['#f5c2a1', .34, 1.019],
  saturn: ['#f9d995', .38, 1.022], uranus: ['#6ee5ed', .49, 1.034], neptune: ['#568dff', .49, 1.034],
};

export function createWorld(scene) {
  const sphere = new THREE.SphereGeometry(1, 56, 38);
  const lowSphere = new THREE.SphereGeometry(1, 30, 20);
  const sunPosition = new THREE.Vector3();
  const tracks = new THREE.Group();
  scene.add(tracks);
  const halo = corona();
  halo.renderOrder = -5;
  scene.add(halo);
  const models = BODIES.map((body, index) => {
    const [radius, polarRadius] = sceneRadii(body);
    const root = new THREE.Group();
    const axial = new THREE.Group();
    const orbitalNormal = new THREE.Vector3(0, 1, 0);
    if (body.a) {
      const peri = new THREE.Vector3().fromArray(orbitalPoint(body, 0));
      const next = new THREE.Vector3().fromArray(orbitalPoint(body, Math.PI / 2));
      orbitalNormal.crossVectors(peri, next).normalize();
      const points = Array.from({ length: 512 }, (_, i) => new THREE.Vector3()
        .fromArray(orbitalPoint(body, i * TAU / 512)).multiplyScalar(SCENE_UNITS_PER_AU));
      tracks.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
        color: body.color, transparent: true, opacity: .63, depthWrite: false,
      })));
    }
    axial.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), orbitalNormal);
    axial.rotateY(index * .53 + .4);
    axial.rotateZ(Math.min(body.tilt, 180 - body.tilt) * RAD);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(axial.quaternion);
    const params = atmosphere[body.id];
    const earth = body.id === 'earth';
    const surface = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
      uniforms: {
        body: { value: index }, clock: { value: 0 }, detailLevel: { value: 2 },
        tint: { value: new THREE.Color(body.color) },
        air: { value: new THREE.Color(params?.[0] || '#000000') },
        planetCenter: { value: root.position }, planetRadius: { value: radius }, axis: { value: axis },
        sunPosition: { value: sunPosition },
        observationMap: { value: null }, observationMix: { value: 0 },
        sunLocal: { value: new THREE.Vector3(1, 0, 0) }, cloudShift: { value: 0 },
      },
      vertexShader: surfaceVertex, fragmentShader: surfaceFragment,
    }));
    surface.scale.set(radius, polarRadius, radius);
    axial.add(surface);
    let haze;
    if (params) {
      haze = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
        depthWrite: false, transparent: true, side: earth ? THREE.FrontSide : THREE.BackSide, blending: THREE.AdditiveBlending,
        uniforms: {
          tint: { value: new THREE.Color(params[0]) }, power: { value: params[1] },
          planetCenter: { value: root.position }, planetRadius: { value: radius }, detailLevel: { value: 2 },
          sunPosition: { value: sunPosition },
        },
        vertexShader: surfaceVertex, fragmentShader: earth ? earthAirFragment : airFragment,
      }));
      haze.scale.copy(surface.scale).multiplyScalar(params[2]);
      haze.renderOrder = 3;
      axial.add(haze);
    }
    let clouds;
    if (earth) {
      clouds = new THREE.Mesh(sphere, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { detailLevel: { value: 2 }, sunPosition: { value: sunPosition } },
        vertexShader: surfaceVertex, fragmentShader: cloudsFragment(noiseSource),
      }));
      clouds.scale.copy(surface.scale).multiplyScalar(1.016);
      clouds.renderOrder = 1;
      axial.add(clouds);
    }
    if (body.id === 'saturn' || body.id === 'uranus') axial.add(rings(body, radius, sunPosition));
    root.add(axial);
    scene.add(root);
    return { body, root, axial, surface, haze, clouds, axis, radius, position: root.position, au: new THREE.Vector3() };
  });
  const haloOffset = new THREE.Vector3();
  const moons = createMoonModels(scene, models, sunPosition);
  const targets = new Map([...models, ...moons.models].map(model => [model.body.id, model]));
  const localAxis = new THREE.Vector3(0, 1, 0), inverseTilt = new THREE.Quaternion();
  const sunRadius = models[0].radius;
  halo.scale.setScalar(sunRadius / 15);
  return {
    models,
    sunPosition,
    target: id => targets.get(id),
    positionAt(model, days, out) {
      return model.parent ? moons.positionAt(model, days, out) : out.fromArray(positionAt(model.body, days));
    },
    place(days, spinDays, cameraAU, orbitOpacity, focus) {
      sunPosition.copy(cameraAU).multiplyScalar(-SCENE_UNITS_PER_AU);
      tracks.position.copy(sunPosition);
      tracks.visible = orbitOpacity > .007;
      for (const track of tracks.children) track.material.opacity = .63 * orbitOpacity;
      for (const model of models) {
        // The physical camera moves in heliocentric AU. Use its position as
        // the rendering origin so a near-surface view doesn't lose precision.
        model.au.fromArray(positionAt(model.body, days));
        model.position.copy(model.au).sub(cameraAU).multiplyScalar(SCENE_UNITS_PER_AU);
        const largeEnough = model.radius * 155 > model.position.length();
        if (model.haze) model.haze.visible = largeEnough;
        if (model.clouds) model.clouds.visible = largeEnough;
        const spin = .6 + (spinDays % Math.abs(model.body.spin)) / model.body.spin * TAU;
        const exhibitionOffset = model.body.id === 'jupiter' ? -.65 : model.body.id === 'neptune' ? .60 : 0;
        model.surface.rotation.y = spin + exhibitionOffset;
        if (model.clouds) {
          const drift = (spinDays * .058 + .21) % TAU;
          model.clouds.rotation.y = spin + drift;
          const { cloudShift, sunLocal } = model.surface.material.uniforms;
          cloudShift.value = drift;
          sunLocal.value.subVectors(sunPosition, model.position).normalize()
            .applyQuaternion(inverseTilt.copy(model.axial.quaternion).invert())
            .applyAxisAngle(localAxis, -spin);
        }
      }
      moons.place(days, cameraAU, focus);
    },
    updateEffects(time, camera) {
      models[0].surface.material.uniforms.clock.value = time;
      camera.getWorldDirection(haloOffset);
      halo.position.copy(sunPosition).addScaledVector(haloOffset, sunRadius / 15);
      halo.quaternion.copy(camera.quaternion);
      halo.material.uniforms.clock.value = time;
      const sunDistance = camera.position.distanceTo(sunPosition) / sunRadius;
      halo.material.uniforms.close.value = 1 - THREE.MathUtils.smoothstep(sunDistance, 1.7, 7.7);
      halo.visible = sunDistance < 18.7;
    },
    setQuality(level) {
      moons.setQuality(level);
      models.forEach(model => {
        model.surface.geometry = level >= 2 ? sphere : lowSphere;
        for (const layer of [model.surface, model.haze, model.clouds]) {
          if (!layer) continue;
          layer.geometry = model.surface.geometry;
          layer.material.uniforms.detailLevel.value = level;
        }
      });
    },
    disposeMoons() { moons.dispose(); },
  };
}
