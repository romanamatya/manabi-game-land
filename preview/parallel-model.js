(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ManabiParallel=factory()})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const WIDTH=1200,HEIGHT=680,MARGIN=36;
const DIRECTIONS=[[1,0],[4,1],[2,1],[1,1],[1,2],[1,4],[0,1],[-1,4],[-1,2],[-1,1],[-2,1],[-4,1]];
const ADVANCED=[[1,0],[5,1],[5,2],[1,1],[2,5],[1,5],[0,1],[-1,5],[-2,5],[-1,1],[-5,2],[-5,1]];
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const direction=line=>sub(line.end,line.start);
const length=v=>Math.hypot(v.x,v.y);
const at=(line,t)=>({x:line.start.x+(line.end.x-line.start.x)*t,y:line.start.y+(line.end.y-line.start.y)*t});
const randomInt=(random,n)=>Math.floor(Math.max(0,Math.min(.999999999,Number(random())||0))*n);
function shuffle(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(random,i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function difficulty(streak){return streak<5?'beginner':streak<15?'intermediate':'advanced'}
function parallel(a,b){return cross(direction(a),direction(b))===0}
function coincident(a,b){return parallel(a,b)&&cross(sub(b.start,a.start),direction(a))===0}
function distance(p,line){const d=direction(line),v=sub(p,line.start),t=Math.max(0,Math.min(1,(v.x*d.x+v.y*d.y)/(d.x*d.x+d.y*d.y)));return length(sub(p,at(line,t)))}
function intersection(a,b){const r=direction(a),s=direction(b),den=cross(r,s);if(den===0)return null;const v=sub(b.start,a.start),t=cross(v,s)/den,u=cross(v,r)/den;return t>.025&&t<.975&&u>.025&&u<.975?at(a,t):null}
function angleGap(a,b){const r=direction(a),s=direction(b);return Math.asin(Math.min(1,Math.abs(cross(r,s))/(length(r)*length(s))))*180/Math.PI}
// Always inspect the 21 pairs, using the actual integer SVG endpoints, never a cached angle/answer index.
function inspect(lines){if(!Array.isArray(lines)||lines.length!==7)throw Error('seven-lines-required');const pairs=[];let checked=0;for(let i=0;i<7;i++)for(let j=i+1;j<7;j++){checked++;if(parallel(lines[i],lines[j])){if(coincident(lines[i],lines[j]))throw Error('coincident-lines');pairs.push([i,j])}}return {checked,pairs}}
function validateQuestion(q){
 if(!q||!['beginner','intermediate','advanced'].includes(q.level)||!Array.isArray(q.lines)||q.lines.length!==7)throw Error('invalid-parallel-question');
 for(const l of q.lines){for(const p of [l.start,l.end])if(!p||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<MARGIN||p.x>WIDTH-MARGIN||p.y<MARGIN||p.y>HEIGHT-MARGIN)throw Error('invalid-endpoint');if(length(direction(l))<450)throw Error('short-line')}
 const result=inspect(q.lines);if(result.checked!==21||result.pairs.length!==1)throw Error('parallel-answer-not-unique');
 const [a,b]=result.pairs[0],r=direction(q.lines[a]);if(Math.abs(cross(sub(q.lines[b].start,q.lines[a].start),r))/length(r)<105)throw Error('parallel-lines-too-close');
 const crossings=[];
 for(let i=0;i<7;i++)for(let j=i+1;j<7;j++){
  const x=q.lines[i],y=q.lines[j];if(!parallel(x,y)&&angleGap(x,y)<(q.level==='advanced'?10:12))throw Error('directions-too-close');
  const p=intersection(x,y);if(p){if(crossings.some(c=>length(sub(p,c))<42))throw Error('crowded-intersections');crossings.push(p)}
  if([x.start,x.end].some(p=>distance(p,y)<22)||[y.start,y.end].some(p=>distance(p,x)<22))throw Error('crowded-endpoints');
 }
 if(crossings.length<5||Math.max(...crossings.map(p=>p.x))-Math.min(...crossings.map(p=>p.x))<380||Math.max(...crossings.map(p=>p.y))-Math.min(...crossings.map(p=>p.y))<190)throw Error('insufficient-intersection-spread');
 // Every line must have a continuous easy-to-tap run of >= 112 diagram units.
 for(let i=0;i<7;i++){let run=0,best=0;for(let k=2;k<=98;k++){const p=at(q.lines[i],k/100);if(q.lines.every((l,j)=>j===i||distance(p,l)>=32)){run++;best=Math.max(best,run)}else run=0}if(best*length(direction(q.lines[i]))/100<112)throw Error('no-clear-tap-run')}
 const target=direction(q.lines[a]);if(q.level==='beginner'&&target.x!==0&&target.y!==0)throw Error('beginner-needs-axis');if(q.level!=='beginner'&&(target.x===0||target.y===0))throw Error('diagonal-required');
 return result;
}
function makeLine([dx,dy],random){const c={x:200+randomInt(random,801),y:135+randomInt(random,411)};let lo=-Infinity,hi=Infinity;for(const [v,p,max] of [[dx,c.x,WIDTH],[dy,c.y,HEIGHT]]){if(v===0)continue;const a=(MARGIN-p)/v,b=(max-MARGIN-p)/v;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b))}lo=Math.ceil(lo);hi=Math.floor(hi);return {start:{x:c.x+dx*lo,y:c.y+dy*lo},end:{x:c.x+dx*hi,y:c.y+dy*hi}}}
// Filled with known validated layouts; even fallback layouts pass the same runtime validation.
const FALLBACKS={"beginner":[{"start":{"x":36,"y":238},"end":{"x":442,"y":644}},{"start":{"x":691,"y":36},"end":{"x":691,"y":644}},{"start":{"x":1163,"y":489},"end":{"x":543,"y":644}},{"start":{"x":289,"y":36},"end":{"x":289,"y":644}},{"start":{"x":36,"y":322},"end":{"x":1164,"y":322}},{"start":{"x":930,"y":38},"end":{"x":779,"y":642}},{"start":{"x":623,"y":36},"end":{"x":319,"y":644}}],"intermediate":[{"start":{"x":338,"y":38},"end":{"x":489,"y":642}},{"start":{"x":1013,"y":37},"end":{"x":862,"y":641}},{"start":{"x":831,"y":36},"end":{"x":527,"y":644}},{"start":{"x":1164,"y":276},"end":{"x":428,"y":644}},{"start":{"x":768,"y":37},"end":{"x":919,"y":641}},{"start":{"x":1164,"y":97},"end":{"x":36,"y":379}},{"start":{"x":1164,"y":188},"end":{"x":708,"y":644}}],"advanced":[{"start":{"x":1161,"y":175},"end":{"x":36,"y":625}},{"start":{"x":245,"y":36},"end":{"x":245,"y":644}},{"start":{"x":40,"y":58},"end":{"x":1160,"y":282}},{"start":{"x":1164,"y":134},"end":{"x":654,"y":644}},{"start":{"x":1014,"y":36},"end":{"x":39,"y":426}},{"start":{"x":1161,"y":435},"end":{"x":116,"y":644}},{"start":{"x":735,"y":36},"end":{"x":977,"y":641}}]};
function buildQuestion({streak=0,random=Math.random,id='parallel-'+Date.now(),maxAttempts=1600}={}){
 const level=difficulty(streak),pool=level==='advanced'?ADVANCED:DIRECTIONS;
 for(let attempt=0;attempt<maxAttempts;attempt++){
  const target=level==='beginner'?(randomInt(random,2)?[0,1]:[1,0]):pool.filter(d=>d[0]!==0&&d[1]!==0)[randomInt(random,pool.length-2)];
  const rest=shuffle(pool.filter(d=>cross({x:d[0],y:d[1]},{x:target[0],y:target[1]})!==0),random).slice(0,5);
  const q={id,level,lines:shuffle([target,target,...rest].map(d=>makeLine(d,random)),random)};
  try{validateQuestion(q);return q}catch{}
 }
 if(FALLBACKS[level]){const q={id,level,lines:structuredClone(FALLBACKS[level])};validateQuestion(q);return q}
 throw Error('parallel-generation-exhausted');
}
function correct(q,selection){const result=inspect(q.lines);if(result.pairs.length!==1)throw Error('parallel-answer-not-unique');return Array.isArray(selection)&&selection.length===2&&selection.every(i=>Number.isInteger(i)&&i>=0&&i<7)&&selection[0]!==selection[1]&&parallel(q.lines[selection[0]],q.lines[selection[1]])}
// A tie at a crossing is deliberately ignored instead of selecting by SVG paint order.
function nearestLine(lines,p,maxDistance=26,ambiguity=5){const ranked=lines.map((l,i)=>({i,d:distance(p,l)})).sort((a,b)=>a.d-b.d);return ranked[0].d<=maxDistance&&ranked[1].d-ranked[0].d>ambiguity?ranked[0].i:-1}
return {WIDTH,HEIGHT,MARGIN,direction,cross,parallel,coincident,distance,intersection,angleGap,at,difficulty,inspect,validateQuestion,buildQuestion,correct,nearestLine,FALLBACKS};
});
