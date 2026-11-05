import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real page controller and storage together without browser globals.
function harness(){
 class Node{
  constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';this.classes=new Set();this.classList={toggle:(s,on)=>on?this.classes.add(s):this.classes.delete(s),remove:s=>this.classes.delete(s),add:s=>this.classes.add(s)};}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=nodes}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='data-line')this.dataset.line=String(v)}
  addEventListener(k,fn){this.listeners[k]=fn}
  closest(){return this}
  querySelector(){return this.children[0]}
 }
 const ids=Object.fromEntries(['points','streak','best','daily','level','storage-status','tower','diagram','confirm','feedback','hint','verdict','explanation','selection-count'].map(id=>[id,new Node()]));
 const document={getElementById:id=>ids[id],createElement:t=>new Node(t),createElementNS:(_ns,t)=>new Node(t),querySelectorAll:()=>ids.diagram.children[0]?.children||[]};
 const values=new Map(),timers=[],events={},effects=[];
 const window={crypto:{randomUUID:()=>String(Math.random())},addEventListener:(k,fn)=>events[k]=fn,ManabiCelebrations:{showCorrect:()=>effects.push(null),showTitle:t=>effects.push(t.at)}};
 const ctx=vm.createContext({window,globalThis:window,document,Math,Date,JSON,Number,Map,Set,structuredClone,navigator:{},console,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t},clearTimeout:t=>{if(t)t.cancelled=true}});
 for(const name of ['parallel-model.js','economy-core.js','parallel-local.js','parallel-game.js'])vm.runInContext(fs.readFileSync(new URL('../shared-src/site/'+name,import.meta.url),'utf8'),ctx);
 const lines=()=>ids.diagram.children[0].children.map(g=>{const l=g.children[0].attrs;return {start:{x:+l.x1,y:+l.y1},end:{x:+l.x2,y:+l.y2}}});
 const key=i=>ids.diagram.listeners.keydown({target:ids.diagram.children[0].children[i],key:'Enter',preventDefault(){}});
 return {ids,window,values,timers,effects,events,key,lines};
}
test('page controller: 27 consecutive answers, title delays, selection/retry and redraw stay consistent',async()=>{
 const h=harness(),{ids}=h,M=h.window.ManabiParallel;
 assert.equal(ids.tower.children.length,5);assert.equal(ids.confirm.disabled,true);
 let pair=M.inspect(h.lines()).pairs[0];h.key(pair[0]);assert.equal(ids.confirm.disabled,true);h.key(pair[0]);assert.equal(ids['selection-count'].textContent,'0 / 2本');
 const wrong=[0,1,2,3,4,5,6].find(i=>!pair.includes(i));h.key(pair[0]);h.key(wrong);h.key(pair[1]);assert.equal(ids['selection-count'].textContent,'2 / 2本');
 const before=JSON.stringify(h.lines());await ids.confirm.onclick();assert.equal(JSON.stringify(h.lines()),before);assert.equal(ids.streak.textContent,0);assert.equal(ids.confirm.disabled,true);assert.equal(ids.feedback.hidden,false);
 for(let n=1;n<=27;n++){
  assert.equal(h.lines().length,7);pair=M.inspect(h.lines()).pairs[0];h.key(pair[0]);h.key(pair[1]);assert.equal(ids.confirm.disabled,false);
  await ids.confirm.onclick();assert.equal(ids.streak.textContent,n);assert.equal(ids.confirm.disabled,true);
  const isTitle=[3,5,10,15,25].includes(n),timer=h.timers.at(-1);assert.equal(timer.ms,isTitle?1000:500);assert.equal(h.effects.at(-1),isTitle?n:null);
  const saved=JSON.parse(h.values.get('manabi_parallel_stage1:v1'));assert.equal(saved.titles.length,[3,5,10,15,25].filter(x=>x<=n).length);
  timer.fn();assert.equal(ids.confirm.disabled,true);assert.equal(ids.feedback.hidden,true);assert.equal(ids.level.textContent,n<5?'初級':n<15?'中級':'上級');
 }
 assert.deepEqual(h.effects.filter(n=>n!==null),[3,5,10,15,25]);assert.equal(ids.tower.children.filter(n=>n.classes.has('earned')).length,5);
 pair=M.inspect(h.lines()).pairs[0];h.key(pair[0]);h.key(pair[1]);await ids.confirm.onclick();h.events.pagehide();assert.equal(h.timers.at(-1).cancelled,true);
});
