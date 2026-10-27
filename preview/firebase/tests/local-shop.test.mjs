import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const [coreSource,economySource]=await Promise.all(['../../economy-core.js','../../economy.js'].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
async function setup(testing=false){
 const values=new Map(),context={URL,structuredClone,Event,setInterval:()=>0,location:{href:'https://romanamatya.github.io/manabi-game-land/preview/shop.html'+(testing?'?adminTest=1':'')},navigator:{locks:{request:async(_,fn)=>fn()}},document:{body:{dataset:{}},readyState:'loading',addEventListener:()=>{}},MANABI_ENV:{preview:true},MANABI_SPARK_CONFIG:{playerSyncEnabled:false},addEventListener:()=>{},dispatchEvent:()=>true};
 context.window=context;context.ManabiPlayerSyncReady=Promise.resolve(null);context.manabiStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};vm.createContext(context);vm.runInContext(coreSource,context);const w=context.ManabiEconomyCore.initial();w.balances.math=200;values.set('mgl_economy_v1',JSON.stringify(w));vm.runInContext(economySource,context);return {context,values};
}
test('configuration-wait preview shop retains its existing local purchase behavior',async()=>{const {context,values}=await setup();await context.ManabiEconomy.buy('frame-01','math');const w=JSON.parse(values.get('mgl_economy_v1'));assert.equal(w.balances.math,150);assert.ok(w.owned.includes('frame-01'));assert.equal(values.has('mgl_profile'),false)});
test('adminTest purchase never changes normal wallet or ownership',async()=>{const {context,values}=await setup(true);const old=values.get('mgl_economy_v1');await assert.rejects(context.ManabiEconomy.buy('frame-01','math'));assert.equal(values.get('mgl_economy_v1'),old)});
