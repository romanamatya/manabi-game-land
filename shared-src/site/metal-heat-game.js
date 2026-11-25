import { GAME, createDeck, questionFromPrompt } from './metal-heat-model.js';
import { startFractionGame } from './fraction-round.js';

const shapeNames={rod:'金ぞくのぼう',plate:'金ぞくの板'};
const board = shape => shape === 'rod'
  ? '<rect x="6" y="34" width="88" height="32" rx="10"/>'
  : '<rect x="6" y="9" width="88" height="82" rx="6"/>';
const dot = ([x,y]) => '<circle class="heat-source" cx="'+x+'" cy="'+y+'" r="4"/>';
const circle = ([x,y],r) => '<circle cx="'+x+'" cy="'+y+'" r="'+r+'"/>';
const svg = (label, content) => '<svg viewBox="0 0 100 100" role="img" aria-label="'+label+'">'+content+'</svg>';
function plateSnapshot(heat, pink, radius) {
  return svg('赤い印が熱する場所', '<defs><clipPath id="plate-clip-'+pink.join('-')+'-'+radius+'">'+board('plate')+
    '</clipPath></defs><g class="ink-blue">'+board('plate')+'</g><g class="ink-pink" clip-path="url(#plate-clip-'+pink.join('-')+'-'+radius+')">'+circle(pink,radius)+'</g>'+dot(heat));
}
function figure(question) {
  const v=question.visual;
  if(!v) return '';
  if(v.kind==='swatches') return '<div class="ink-observation"><span>青色・熱する前</span><span aria-hidden="true">→</span><span>ピンク色・あたたまった部分</span></div>';
  if(v.kind==='predict') return '<p class="heat-caption"><span>赤い印：熱する場所（'+v.where+'）</span><span>青色：熱する前</span><span>ピンク色：あたたまった部分</span></p>';
  const letters=v.sites.map(({xy:[x,y],label})=>'<text x="'+x+'" y="'+y+'" dominant-baseline="central" text-anchor="middle">'+label+'</text>').join('');
  const described=v.sites.map(({xy:[x,y],label})=>label+'は左から'+x+'、上から'+y).join('、');
  return '<div class="metal-board">'+svg(shapeNames[v.shape]+'。赤い熱する印は'+v.where+'。'+described, '<g class="unheated">'+board(v.shape)+'</g>'+dot(v.heat)+letters)+
    '<p class="heat-caption">赤い印：熱する場所（'+v.where+'）</p></div>';
}
function choice(value, question) {
  const v=question.visual;
  if(v?.kind!=='predict') return value;
  const pattern=v.frames[value];
  return '<span class="heat-result" role="img" aria-label="'+value+'">'+
    pattern.map(([pink,r],i)=>plateSnapshot(v.heat,pink,r).replaceAll('plate-clip-','plate-clip-'+question.options.indexOf(value)+'-'+i+'-')).join('<span aria-hidden="true">→</span>')+'</span>';
}
if (window.MANABI_ENV?.preview === true) {
  window.ManabiMetalHeatQuestions = { answer: prompt => questionFromPrompt(prompt).answer };
  startFractionGame(GAME,createDeck,{celebrate:true,requirePublished:true,renderFigure:figure,renderChoice:choice});
}
