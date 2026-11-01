import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public-admin-settings.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

class Link{
 constructor(game){this.href=`https://romanamatya.github.io/manabi-game-land/games/${game}.html`;this.attributes={href:this.href};this.classList={values:new Set(),add(value){this.values.add(value)}};}
 setAttribute(name,value){this.attributes[name]=String(value)}
}

test('one hidden or unreadable game does not block a separately confirmed published game link',async()=>{
 const links=[new Link('keisan'),new Link('pref-name')],listeners=new Map(),pending=new Map(),calls=[];
 const document={readyState:'complete',querySelectorAll:selector=>{calls.push('query:'+selector);return links},addEventListener(type,handler){listeners.set(type,handler)}};
 const F={doc:(_db,path)=>{calls.push('doc:'+path);return{path}},getDocFromServer:ref=>{calls.push('get:'+ref.path);return new Promise((resolve,reject)=>pending.set(ref.path.split('/').at(-1),{resolve,reject}))}};
 const window={MANABI_BACKEND_CONFIG:{environment:'productionAdmin/v1',firebase:{projectId:'manabi-game-land'},availabilityEnabled:true,campaignsEnabled:false,announcementsEnabled:false},ManabiFirebaseSession:{open:async()=>{calls.push('open');return{F,db:{}}}}};
 vm.runInNewContext(source,{window,document,location:{href:'https://romanamatya.github.io/manabi-game-land/',pathname:'/'},URL,Promise,Set,Map,alert:()=>{}});
 assert.equal(typeof listeners.get('click'),'function','home availability guard attached its link handler');
 for(let i=0;i<12;i++)await tick();
 assert.deepEqual([...pending.keys()].sort(),['keisan','pref-name']);
 assert.deepEqual(calls.filter(call=>call.startsWith('doc:')).sort(),['doc:productionAdmin/v1/gameSettings/keisan','doc:productionAdmin/v1/gameSettings/pref-name']);
 const handler=listeners.get('click');assert.equal(typeof handler,'function');
 const click=link=>{let prevented=false;handler({target:{closest:()=>link},preventDefault(){prevented=true},stopImmediatePropagation(){}});return prevented};
 pending.get('pref-name').resolve({exists:()=>true,data:()=>({status:'published'})});
 for(let i=0;i<12;i++)await tick();
 assert.equal(click(links[1]),false,'the confirmed published game is navigable while another status is still loading');
 pending.get('keisan').reject(Object.assign(Error('permission'),{code:'permission-denied'}));
 for(let i=0;i<12;i++)await tick();
 assert.equal(click(links[0]),true,'the unreadable game remains blocked');
 assert.equal(links[0].attributes['aria-disabled'],'true');
 assert.equal(links[0].classList.values.has('game-unavailable'),true);
 assert.equal(click(links[1]),false,'the unrelated published game stays navigable');
});

test('management and direct game guards read the same per-game Firestore path',()=>{
 assert.match(source,/session\.F\.doc\(session\.db,settingsRoot\+'\/'\+collection\+'\/'\+id\)/);
 assert.match(source,/read\('gameSettings',id\)/);
 const gamePageSource=source.slice(source.indexOf('const gameId='));
 assert.match(gamePageSource,/readGameSetting=\(\)=>read\('gameSettings',gameId\)/);
});
