const NASA = 'https://science.nasa.gov/3d-resources/';
const PHOTOJOURNAL = 'https://science.nasa.gov/photojournal/';
const viking = 'バイキング探査機の観測画像（NASA/JPL/Solar System Simulator・USGS）';
const voyager = 'ボイジャー探査機の画像モザイク（NASA/JPL・USGS）';
const uranian = 'ボイジャー2号の画像モザイク（USGS／Tammy Becker・JPL/Caltech）';
const cassini = 'カッシーニの観測画像モザイク（NASA/JPL・Cassini ISSチーム）';
const cassiniVoyager = 'カッシーニとボイジャーの画像モザイク（NASA/JPL・Space Science Institute）';
const schenk = 'カッシーニの強調色モザイク（NASA/JPL-Caltech・Space Science Institute・Paul Schenk／LPI）';

function map(href, description, partial = false) {
  return { href, partial, coverageMap: partial, note: `画像：${description}。${partial
    ? '欠損をOpenAIの画像生成で補っています。補完部分は実際の観測ではありません。'
    : ''}` };
}

export const MOON_MAPS = Object.freeze({
  moon: map('https://astro4edu.org/resources/media/sM76db43so30/', 'クレメンタインの反射率地図（USGS、IAU OAE公開画像、パブリックドメイン）'),
  phobos: map(`${NASA}mars-phobos/`, viking),
  deimos: map(`${NASA}mars-deimos/`, viking, true),
  io: map('https://www.nasa.gov/image-article/map-of-jovian-moon-io/', 'ボイジャー1号・ガリレオの地表モザイク（NASA/JPL/USGS）。公開画像の緯度帯を使用', true),
  europa: map(`${NASA}jupiter-europa/`, voyager, true),
  ganymede: map(`${NASA}jupiter-ganymede/`, voyager),
  callisto: map(`${NASA}jupiter-callisto/`, voyager, true),
  mimas: map(`${PHOTOJOURNAL}mimas-global-map-june-2017/`, cassini),
  enceladus: map(`${PHOTOJOURNAL}color-maps-of-enceladus-2014/`, schenk),
  tethys: map(`${PHOTOJOURNAL}map-of-tethys/`, cassiniVoyager),
  dione: map(`${PHOTOJOURNAL}map-of-dione-october-2010/`, cassiniVoyager),
  rhea: map('https://astrogeology.usgs.gov/search/map/rhea_cassini_voyager_global_mosaic_417m', `${cassiniVoyager}、PIA14928`),
  titan: map(`${PHOTOJOURNAL}titan-global-map-june-2015/`, 'カッシーニISSで大気を透かしてとらえた地表の明暗（NASA/JPL-Caltech・Space Science Institute）。肉眼で見た色や雲の姿ではありません'),
  iapetus: map(`${PHOTOJOURNAL}color-maps-of-iapetus-2014/`, schenk),
  miranda: map(`${NASA}uranus-miranda/`, uranian, true),
  ariel: map(`${NASA}uranus-ariel/`, uranian, true),
  umbriel: map(`${NASA}uranus-umbriel/`, uranian, true),
  titania: map(`${NASA}uranus-titania/`, uranian, true),
  oberon: map(`${NASA}uranus-oberon/`, `${uranian}のTIFF`, true),
  triton: map(`${PHOTOJOURNAL}map-of-triton/`, 'ボイジャー2号の強調色モザイク（NASA/JPL・Paul Schenk／LPI）', true),
  nereid: {
    href: `${PHOTOJOURNAL}nereid/`, partial: true, label: '参考：ボイジャー2号の観測写真',
    note: '画像：ボイジャー2号の写真では細かな地形を判別できないため、3Dの表面は全体がOpenAIの画像生成による仮の質感です。観測地図ではありません。',
  },
});

export function moonMapNote(id) {
  return MOON_MAPS[id] ?? { note: '表面の画像データはありません。' };
}
