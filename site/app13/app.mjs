import { BODIES, readingsFor } from './bodies.mjs';
import { createOrbitChart } from './orbit-chart.mjs';
import { detailsFor } from './observations.mjs';
import { moonReadings, moonsOf } from './moons.mjs';
import { moonMemos } from './moon-observations.mjs';

const $ = id => document.getElementById(id);
const learn = $('learn-dialog'), help = $('help-dialog');
const moonDialog = $('moon-dialog'), moonList = $('moon-list');
const moonOpen = $('moon-open'), parentBack = $('parent-back');
const planetById = new Map(BODIES.map(body => [body.id, body]));
const visited = new Set();
const destinations = new Map();
let flight;

const visualSources = {
  mercury: '観測地図：MESSENGERのモノクロ観測。表示色は調整しています。',
  venus: '「あかつき」が紫外線で捉えた雲頂を着色し、観測できなかった部分は画像生成AIで補いました。補完部分は実際の観測ではありません。',
  earth: '観測地図：NASAの2004年7月の合成画像。雲と大気はシミュレーションです。',
  mars: '観測地図：Viking探査機の画像をつないで着色した全球地図です。',
  jupiter: '観測地図：Cassiniが2000年に撮影した雲頂。見た目の色に近づけた合成画像です。',
  saturn: '観測地図：ハッブル宇宙望遠鏡が捉えた雲頂。環に隠れた部分などは生成描画で補っています。',
  uranus: '観測地図：ハッブル宇宙望遠鏡が捉えた雲頂。観測範囲外は生成描画で補っています。',
  neptune: '観測地図：ハッブル宇宙望遠鏡が捉えた雲頂。観測範囲外は生成描画で補っています。',
};
const chart = createOrbitChart($('orbit-chart'), $('chart-frame'), $('inner-zoom'));

function show(dialog) {
  if (dialog.open) return;
  dialog.showModal();
}

function renderDetails(entry) {
  const host = $('learn-details');
  if (!host) return;
  host.replaceChildren();
  if (!entry) return;
  if (!host.hasAttribute('aria-labelledby')) host.setAttribute('aria-labelledby', 'learn-details-title');
  const heading = document.createElement('h3');
  heading.id = 'learn-details-title';
  heading.textContent = '詳しく見る';
  host.append(heading);
  for (const { title, text } of entry.items) {
    const section = document.createElement('section');
    section.className = 'learn-detail';
    const subheading = document.createElement('h4');
    subheading.textContent = title;
    const copy = document.createElement('p');
    copy.textContent = text;
    section.append(subheading, copy);
    host.append(section);
  }
  const note = document.createElement('p');
  note.className = 'learn-detail-source';
  note.append('出典：');
  entry.sources.forEach(({ label, href }, index) => {
    if (index) note.append('、');
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.target = '_blank';
    link.rel = 'noopener';
    note.append(link);
  });
  host.append(note);
}

function openMemo(body, inRange) {
  const parent = planetById.get(body.parentId);
  const memo = parent ? moonMemos[body.id] : body;
  if (inRange && !parent) {
    visited.add(body.id);
    destinations.get(body.id).classList.add('is-visited');
    destinations.get(body.id).setAttribute('aria-label', `${body.name}（観察済み）`);
    $('visited-count').textContent = `${String(visited.size).padStart(2, '0')} / 09`;
  }
  $('learn-kind').textContent = `${body.kind} / ${body.en}`;
  $('learn-title').textContent = body.name;
  $('learn-intro').textContent = memo.intro;
  const visual = $('learn-visual');
  visual.textContent = parent ? '描画：衛星の特徴をもとにコードで描いた近似表現です。観測地図ではありません。'
    : visualSources[body.id] || '描画：天体の見え方をコードで再現したモデルです。';
  if (visualSources[body.id]) {
    const sourceLink = document.createElement('a');
    sourceLink.href = `../credits.html#solar-${body.id}`;
    sourceLink.textContent = '観測画像の出典';
    visual.append(sourceLink);
  }
  const values = (parent ? moonReadings(body, parent.name) : readingsFor(body)).map(([term, value]) => {
    const item = document.createElement('div');
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    item.append(dt, dd);
    return item;
  });
  $('learn-values').replaceChildren(...values);
  $('learn-task').textContent = memo.task;
  $('learn-why').textContent = memo.why;
  $('edge-on').hidden = !flight || body.id !== 'saturn';
  $('edge-on').textContent = flight?.ringEdgeOn() ? '環を斜めから見る →' : '環を横から見る →';
  renderDetails(parent ? memo : detailsFor(body.id));
  const why = $('learn-why')?.closest('details');
  if (why) why.open = false;
  show(learn);
  // showModal はフォーカス移動でスクロールすることがあるため、表示後に先頭へ戻す。
  const scroller = $('learn-scroll') || learn;
  scroller.scrollTop = 0;
  if (scroller !== learn) learn.scrollTop = 0;
}

function showMoonControls(body) {
  if (moonDialog.open) moonDialog.close();
  const moons = moonsOf(body?.id);
  const parent = planetById.get(body?.parentId);
  moonOpen.hidden = moons.length === 0;
  parentBack.hidden = !parent;
  if (moons.length) {
    moonOpen.textContent = moons.length === 1 ? `${moons[0].name}を見る` : `衛星（${moons.length}）`;
    if (moons.length > 1) moonOpen.setAttribute('aria-haspopup', 'dialog');
    else moonOpen.removeAttribute('aria-haspopup');
  }
  if (parent) parentBack.textContent = `${parent.name}に戻る`;
}

for (const body of BODIES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.dataset.body = body.id;
  const dot = document.createElement('span'), title = document.createElement('strong'), en = document.createElement('small');
  dot.className = 'planet-dot';
  dot.style.setProperty('--planet', body.color);
  dot.setAttribute('aria-hidden', 'true');
  title.textContent = body.name;
  en.textContent = body.en;
  en.setAttribute('aria-hidden', 'true');
  button.append(dot, title, en);
  button.addEventListener('click', () => {
    if (flight) flight.travelTo(body.id);
    else openMemo(body, true);
  });
  destinations.set(body.id, button);
  $('destination-list').append(button);
}

$('help-open').addEventListener('click', () => show(help));
$('overview-back').addEventListener('click', () => flight?.overview());
moonOpen.addEventListener('click', () => {
  const planet = flight?.observation();
  const moons = moonsOf(planet?.id);
  if (moons.length === 1) { flight.travelTo(moons[0].id); return; }
  if (!moons.length) return;
  $('moon-title').textContent = `${planet.name}の衛星`;
  moonList.replaceChildren(...moons.map(moon => {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'chip';
    choice.textContent = moon.name;
    choice.dataset.moon = moon.id;
    choice.addEventListener('click', () => {
      moonDialog.close();
      flight?.travelTo(moon.id);
    });
    return choice;
  }));
  show(moonDialog);
});
parentBack.addEventListener('click', () => {
  const parent = flight?.observation()?.parentId;
  if (parent) flight.travelTo(parent);
});
$('change-target').addEventListener('click', () => { learn.close(); flight?.overview(); });
$('inspect').addEventListener('click', () => {
  const target = flight?.observation();
  if (target) openMemo(target, true);
});
$('edge-on').addEventListener('click', () => {
  learn.close();
  flight?.travelTo('saturn', !flight.ringEdgeOn());
});

function fallback() {
  flight = undefined;
  showMoonControls();
  $('mission').dataset.mode = 'fallback';
  $('load-status').hidden = false;
  $('load-status').textContent = '3Dを開始できません。カードから観察メモを開けます。';
  $('quality-status').textContent = '軌道図・観察メモ';
  $('flight-status').textContent = '太陽系・真上';
  $('radar').hidden = true;
  $('edge-on').hidden = true;
  $('overview-back').hidden = true;
  chart.useFallback();
  for (const id of ['pause', 'time-rate']) $(id).disabled = true;
  for (const card of destinations.values()) card.disabled = false;
}

try {
  const { createViewer } = await import('./viewer.mjs');
  flight = createViewer($, chart, fallback, showMoonControls);
  $('load-status').hidden = true;
  for (const card of destinations.values()) card.disabled = false;
} catch (error) {
  console.warn('Solar Explorer: 3D unavailable', error);
  fallback();
}
