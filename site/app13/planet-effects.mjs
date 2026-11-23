// Shared GLSL for density/lighting; scene geometry remains procedural.

export const saturnRings = /* glsl */`
const float saturnInner = 1.235;
const float saturnOuter = 2.31;
float annulus(float r, float a, float b, float edge) {
  return smoothstep(a-edge,a+edge,r) * (1.-smoothstep(b-edge,b+edge,r));
}
float ringDepth(float r, float edge) {
  float c = annulus(r, saturnInner,1.525,edge);
  float b = annulus(r,1.525,1.949,edge);
  float a = annulus(r,2.025,saturnOuter,edge);
  float cassini = annulus(r,1.949,2.025,edge);
  float encke = annulus(r,2.210,2.219,edge);
  float broad = .5+.5*sin(r*58.+sin(r*17.)*.9);
  float narrow = sin(r*214.+sin(r*61.)*1.4) * (1.-smoothstep(.004,.027,edge));
  float fine = sin(r*568.+sin(r*83.)) * (1.-smoothstep(.0015,.010,edge));
  return max(0.,c*(.17+.10*broad+.031*narrow) + b*(.85+.27*broad+.088*narrow+.044*fine)
    + a*(.43+.19*broad+.07*narrow+.032*fine)*(1.-.92*encke) + cassini*.026);
}`;

export const earthClouds = /* glsl */`
const float cloudRadius = 1.016;
vec3 spinY(vec3 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
}
float cloudsAt(vec3 p, bool detailed) {
  float belt = fbm(p*3.6 + vec3(11.,7.,2.));
  vec3 wind = vec3(noise(p*4.1+8.), noise(p*4.6+19.), noise(p*4.3+3.));
  vec3 q = spinY(p + (wind-.5)*.17, p.y*p.y*1.6);
  float body = fbm(q*vec3(8.,15.,8.)+7.5);
  float sheets = .52*body + .36*belt + .12*noise(q*vec3(4.,24.,4.)+4.7);
  if (detailed) {
    sheets += .09*(noise(q*44.)-.5) + .034*(noise(q*97.)-.5)*(1.-smoothstep(.10,.31,length(fwidth(q))*20.));
  }
  return smoothstep(.456,.653,sheets);
}`;

export const cloudsFragment = noise => /* glsl */`
varying vec3 worldPoint, nView, vView, terrain;
uniform int detailLevel;
uniform vec3 sunPosition;
${noise}
${earthClouds}
void main() {
  vec3 p = normalize(terrain);
  float density = cloudsAt(p, detailLevel > 0);
  if (density < .008) discard;
  vec3 light = normalize(mat3(viewMatrix) * (sunPosition-worldPoint));
  vec3 n = normalize(nView);
  float day = dot(n,light);
  float mu = max(dot(n,normalize(vView)),0.);
  float rim = smoothstep(.0,.23,mu);
  float diffuse = .026 + .82*pow(max(day,0.),.65) + .16*smoothstep(-.15,.18,day);
  vec3 ice = mix(vec3(.47,.57,.66),vec3(.96,.98,1.),smoothstep(.08,.84,density));
  float twilight = day+.035;
  vec3 color = ice*diffuse + vec3(.25,.092,.028)*exp(-220.*twilight*twilight);
  gl_FragColor = vec4(color, density * (.62+.34*density) * rim);
  #include <colorspace_fragment>
}`;

export const earthAirFragment = /* glsl */`
varying vec3 worldPoint;
uniform vec3 planetCenter, sunPosition;
uniform float planetRadius;
uniform int detailLevel;
const float shell = 1.047;
void main() {
  vec3 ro = (cameraPosition - planetCenter) / planetRadius;
  vec3 d = normalize(worldPoint - cameraPosition);
  vec3 sun = normalize(sunPosition-planetCenter);
  float b = dot(ro,d);
  // Using the closest point avoids subtracting two large squared distances.
  vec3 tangent = ro - b*d;
  float impact2 = dot(tangent,tangent);
  float outer = sqrt(max(0.,shell*shell-impact2));
  float end = outer;
  if (impact2 < 1.) end = -sqrt(1.-impact2);
  float begin = max(-outer,b);
  float extent = max(0.,end-begin);
  float count = detailLevel > 0 ? 7. : 4.;
  float stepSize = extent / count;
  float phaseMu = dot(d,sun);
  float rayleigh = .78 + .60*phaseMu*phaseMu;
  float mie = .17 / pow(max(.13,1.25-.97*phaseMu),1.4);
  vec3 glow = vec3(0.);
  for (int i=0; i<7; i++) {
    if (float(i) >= count) break;
    vec3 p = tangent + (begin+(float(i)+.5)*stepSize)*d;
    float h = length(p);
    float mu = dot(p,sun)/h;
    float horizon = sqrt(max(0.,1.-1./(h*h)));
    float lit = smoothstep(-.025,.020,mu+horizon);
    float height = max(0.,h-1.);
    float columns = exp(-height/.011)/(max(0.,mu+horizon)+.066);
    vec3 direct = exp(-vec3(.063,.177,.38)*columns);
    float density = exp(-height/.0085);
    glow += (vec3(.125,.50,1.)*rayleigh*density
      + vec3(1.,.73,.44)*mie*exp(-height/.0045)*.5) * direct * lit * stepSize;
  }
  glow *= smoothstep(0.,.009,extent);
  float weight = clamp(7.4*max(glow.r,max(glow.g,glow.b)),0.,.78);
  vec3 color = min(vec3(1.),glow*7.4/max(weight,.001));
  gl_FragColor = vec4(color,weight);
  #include <colorspace_fragment>
}`;
