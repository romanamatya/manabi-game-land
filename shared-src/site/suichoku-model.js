(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ManabiSuichoku=factory()})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const BASE_ANGLES=Object.freeze([0,15,-15,30,-30]),DELTAS=Object.freeze([-30,-15,0,15,30]),LABELS=Object.freeze(['ア','イ','ウ','エ','オ']),MODES=Object.freeze(['cross','tee','gap']);
const clampRandom=random=>Math.min(0.999999999999,Math.max(0,Number(random())||0));
function shuffle(values,random=Math.random){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(clampRandom(random)*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function vector(degrees){const r=degrees*Math.PI/180;return {x:Math.cos(r),y:Math.sin(r)}}
function dot(a,b){return a.x*b.x+a.y*b.y}
function add(a,b,scale=1){return {x:a.x+b.x*scale,y:a.y+b.y*scale}}
function makeCandidate(delta,index,station,mode,sign,baselineAngle){
 const base=vector(baselineAngle),normal={x:-base.y,y:base.x},direction=vector(baselineAngle+90+delta),offset=mode==='gap'?sign*160:0;
 const origin=add(add({x:900,y:600},base,station),normal,offset),intersectionParameter=-offset/dot(direction,normal),intersection=add(origin,direction,intersectionParameter);
 let start,end,extension=null;
 if(mode==='tee'){start=intersection;end=add(intersection,direction,210)}
 else{start=add(origin,direction,-105);end=add(origin,direction,105);if(mode==='gap')extension=intersectionParameter<0?{start:intersection,end:start}:{start:end,end:intersection};}
 return {index,label:LABELS[index],delta,angle:baselineAngle+90+delta,station,mode,sign,direction,intersection,start,end,extension,dot:dot(base,direction)};
}
function validateQuestion(q){
 if(!q||typeof q.id!=='string'||!q.id||!BASE_ANGLES.includes(q.baselineAngle)||!Array.isArray(q.candidates)||q.candidates.length!==5||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>4)throw Error('invalid-suichoku-question');
 const indices=new Set(),labels=new Set(),deltas=new Set(),stations=new Set();
 for(const c of q.candidates){if(!Number.isInteger(c.index)||c.index<0||c.index>4||indices.has(c.index)||c.label!==LABELS[c.index]||labels.has(c.label)||!DELTAS.includes(c.delta)||deltas.has(c.delta)||!MODES.includes(c.mode)||!Number.isFinite(c.station)||stations.has(c.station)||![-1,1].includes(c.sign))throw Error('invalid-suichoku-candidate');indices.add(c.index);labels.add(c.label);deltas.add(c.delta);stations.add(c.station);}
 const perpendicular=q.candidates.filter(c=>Math.abs(dot(vector(q.baselineAngle),vector(q.baselineAngle+90+c.delta)))<1e-9);
 if(perpendicular.length!==1||perpendicular[0].index!==q.correctIndex)throw Error('suichoku-answer-not-unique');
 return true;
}
function buildQuestion({random=Math.random,id=null}={}){
 const baselineAngle=BASE_ANGLES[Math.floor(clampRandom(random)*BASE_ANGLES.length)],slots=shuffle([-560,-280,0,280,560],random),modes=shuffle(['cross','cross','tee','tee','gap'],random),deltas=shuffle(DELTAS,random),candidates=deltas.map((delta,index)=>makeCandidate(delta,index,slots[index],modes[index],clampRandom(random)<.5?-1:1,baselineAngle));
 const q={id:id||`sq-${Date.now().toString(36)}-${Math.floor(clampRandom(random)*1e12).toString(36)}`,baselineAngle,candidates,correctIndex:candidates.findIndex(c=>Math.abs(c.dot)<1e-9)};validateQuestion(q);return q;
}
function analysis(rows){const byAngle={},byMode={},wrong={};for(const r of rows||[]){if(r?.final!==true)continue;for(const [map,key]of [[byAngle,String(r.baselineAngle)+'°'],[byMode,r.mode]]){const x=map[key]||{answers:0,correct:0};x.answers++;if(r.correct===true)x.correct++;map[key]=x}if(r.correct!==true){const key=String(r.selectedLabel||'不明');wrong[key]=(wrong[key]||0)+1}}const pct=x=>x.answers?Math.round(x.correct*1000/x.answers)/10:null;return {answers:Object.values(byAngle).reduce((n,x)=>n+x.answers,0),byAngle:Object.fromEntries(Object.entries(byAngle).map(([k,v])=>[k,{...v,rate:pct(v)}])),byMode:Object.fromEntries(Object.entries(byMode).map(([k,v])=>[k,{...v,rate:pct(v)}])),wrong};}
return {BASE_ANGLES,DELTAS,LABELS,MODES,vector,dot,shuffle,makeCandidate,validateQuestion,buildQuestion,analysis};
});
