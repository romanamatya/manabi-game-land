import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';

const gameIds=['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary'];
const source=await readFile(new URL('../public-game-availability.js',import.meta.url),'utf8');

class Element {
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;this.listeners=new Map();this.attributes={};this.style={cssText:''};this.textContent='';this.className='';this.type='';}
 get firstChild(){return this.children[0]||null}
 get id(){return this.attributes.id||''} set id(value){this.attributes.id=String(value)}
 append(child){child.remove();child.parentElement=this;this.children.push(child);return child}
 insertBefore(child,before){child.remove();child.parentElement=this;const index=before?this.children.indexOf(before):-1;if(index<0)this.children.push(child);else this.children.splice(index,0,child);return child}
 replaceChildren(...children){for(const child of this.children)child.parentElement=null;this.children=[];for(const child of children)this.append(child)}
 setAttribute(name,value){this.attributes[name]=String(value)}
 addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list)}
 remove(){if(!this.parentElement)return;this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null}
 matches(selector){const s=selector.trim();if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.className.split(/\s+/).includes(s.slice(1));if(s==='a[href]')return this.tagName==='A'&&this.attributes.href!==undefined;if(s==='[role="button"]')return this.attributes.role==='button';if(s.startsWith('['))return this.attributes[s.slice(1,-1)]!==undefined;return this.tagName===s.toUpperCase()}
 closest(selector){for(let node=this;node;node=node.parentElement){if(selector.split(',').some(part=>node.matches(part)))return node;}return null}
 click(){this.ownerDocument.dispatch('click',this)}
}
class Document {
 constructor(){this.listeners=new Map();this.body=new Element('body',this)}
 createElement(tag){return new Element(tag,this)}
 addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list)}
 removeEventListener(type,listener){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==listener))}
 getElementById(id){const visit=node=>node.id===id?node:node.children.map(visit).find(Boolean)||null;return visit(this.body)}
 dispatch(type,target){const event={type,target,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true}};for(const listener of this.listeners.get(type)||[]){listener(event);if(event.stopped)break;}if(!event.stopped)for(const listener of target.listeners.get(type)||[])listener(event);return event}
}
function setup(){
 const document=new Document(),window={document};
 vm.runInNewContext(source,{window,document,Promise,setTimeout,clearTimeout});
 const main=document.createElement('main'),answer=document.createElement('button');answer.textContent='回答';main.append(answer);document.body.append(main);
 const header=document.createElement('header'),back=document.createElement('a');back.setAttribute('href','../index.html');back.textContent='戻る';header.append(back);document.body.append(header);
 return{api:window.ManabiGameAvailability,document,answer,back};
}
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function attempt(document,type,target){return document.dispatch(type,target)}

test('all 11 root game pages load the safe availability guard before settings; practice and challenge pages keep their runtime filter',async()=>{
 for(const id of gameIds){
  const html=await readFile(new URL(`../games/${id}.html`,import.meta.url),'utf8');
  const session=html.indexOf('public-firebase-session.js?v=shared-firebase-session-v1'),guard=html.indexOf('public-game-availability.js?v=firebase-session-recovery-v1'),settings=html.indexOf('public-admin-settings.js?v=firebase-session-recovery-v1');
  assert.ok(session>=0,`${id}: shared Firebase session broker is loaded`);assert.ok(guard>session,`${id}: broker loads before the availability guard`);assert.ok(settings>guard,`${id}: guard loads before settings`);
  assert.doesNotMatch(html,/document\.documentElement\.inert\s*=\s*true/);
  if(id!=='keisanSummary')assert.match(html,/challenge120-runtime\.js\?v=availability-guard-v2/,`${id}: challenge mode remains wired`);
 }
 for(const filename of await readdir(new URL('../shared-src/site/games/',import.meta.url))){
  if(!filename.endsWith('.html'))continue;
  const html=await readFile(new URL(`../shared-src/site/games/${filename}`,import.meta.url),'utf8');
  if(filename==='parallelPair.html'){
   assert.match(html,/parallel-ranking\.js/,'stage 3 has a separately gated ranking adapter');
   assert.match(html,/parallel-local\.js/);
   assert.match(html,/economy\.js/,'shared math wallet');assert.match(html,/challenge120-core\.js/,'common challenge state machine');assert.doesNotMatch(html,/social-score-sync\.js|ranking-sync-client\.js/,'does not start global game synchronization');
   continue;
  }
  if(filename==='quadrilateral.html'){
   assert.doesNotMatch(html,/public-firebase-session\.js|public-game-availability\.js|ranking-sync\.js/,'the preview-only game has no Firebase dependency');
   assert.match(html,/challenge120-core\.js/);
   continue;
  }
  if(filename==='suichoku.html'){
   assert.doesNotMatch(html,/public-firebase-session\.js|public-game-availability\.js|social-score-sync\.js/,'early-release game remains outside managed-game availability and campaign sync');
   assert.ok(html.indexOf('economy-core.js')>=0&&html.indexOf('economy.js')>html.indexOf('economy-core.js'),'early-release game uses the shared point wallet');
   assert.match(html,/data-local-challenge-only="true"/);continue;
  }
  const session=html.indexOf('public-firebase-session.js?v=shared-firebase-session-v1'),guard=html.indexOf('public-game-availability.js?v=firebase-session-recovery-v1'),settings=html.indexOf('public-admin-settings.js?v=firebase-session-recovery-v1');
  assert.ok(session>=0,`${filename}: shared site includes the Firebase session broker`);assert.ok(guard>session,`${filename}: shared site loads the broker before the guard`);assert.ok(settings>guard,`${filename}: shared site loads the guard first`);
 }
});

test('a published game remains interactive in both practice and two-minute challenge modes',async()=>{
 for(const mode of ['practice','challenge120']){
  const {api,document,answer,back}=setup();const gate=api.create(document,{timeoutMs:50});
  assert.equal(await gate.check(()=>Promise.resolve({status:'published'})),'published',mode);
  assert.equal(attempt(document,'click',answer).defaultPrevented,false,mode);
  assert.equal(attempt(document,'click',back).defaultPrevented,false,mode);
 }
});

test('hidden and preparing games block new game actions but preserve the back link in either mode',async()=>{
 for(const status of ['hidden','preparing'])for(const mode of ['practice','challenge120']){
  const {api,document,answer,back}=setup(),gate=api.create(document,{timeoutMs:50});
  assert.equal(await gate.check(()=>Promise.resolve({status})),status,`${status}/${mode}`);
  assert.equal(attempt(document,'click',answer).defaultPrevented,true,`${status}/${mode} answer`);
  assert.equal(attempt(document,'click',back).defaultPrevented,false,`${status}/${mode} back`);
  assert.ok(document.getElementById('publicGameAccessStatus'));
 }
});

test('a delayed Firebase read times out to a usable retry state; late confirmed publication releases controls',async()=>{
 const {api,document,answer,back}=setup(),gate=api.create(document,{timeoutMs:5});let resolveFirst,calls=0;
 const read=()=>++calls===1?new Promise(resolve=>{resolveFirst=resolve}):Promise.resolve({status:'published'});let timeouts=0;
 void gate.check(read,{onTimeout:()=>timeouts++});await tick(12);
 assert.equal(gate.state,'unknown');assert.equal(timeouts,1);assert.equal(attempt(document,'click',answer).defaultPrevented,true);
 assert.equal(attempt(document,'click',back).defaultPrevented,false);
 const status=document.getElementById('publicGameAccessStatus'),retry=status.children.find(node=>node.tagName==='BUTTON');
 assert.ok(retry,'retry is shown after timeout');assert.equal(attempt(document,'click',retry).defaultPrevented,false);
 await tick(0);assert.equal(gate.state,'published');assert.equal(document.getElementById('publicGameAccessStatus'),null);
 assert.equal(attempt(document,'click',answer).defaultPrevented,false);
 resolveFirst({status:'hidden'});await tick(0);assert.equal(gate.state,'published','stale result from the superseded read is ignored');
});

test('a failed public-settings read never unlocks play, while status and navigation stay usable',async()=>{
 const {api,document,answer,back}=setup(),gate=api.create(document,{timeoutMs:50});let calls=0;
 const read=()=>++calls===1?Promise.reject(new Error('offline')):Promise.resolve({status:'published'});let errors=0;
 assert.equal(await gate.check(read,{onError:()=>errors++}),'unknown');assert.equal(errors,1);
 assert.equal(attempt(document,'click',answer).defaultPrevented,true);assert.equal(attempt(document,'click',back).defaultPrevented,false);
 const status=document.getElementById('publicGameAccessStatus');assert.ok(status);assert.match(status.children[0].textContent,/確認できません/);
 const retry=status.children.find(node=>node.tagName==='BUTTON');assert.ok(retry);attempt(document,'click',retry);await tick(0);
 assert.equal(gate.state,'published','retry can recover after a rejected request');assert.equal(attempt(document,'click',answer).defaultPrevented,false);
 const admin=await readFile(new URL('../public-admin-settings.js',import.meta.url),'utf8');assert.match(admin,/if\(generation===dbGeneration\)dbPromise=null/,'failed Firebase initialization can be retried');assert.match(admin,/reset:resetDb/,'timed out reads can reset Firebase initialization for retry');
 const runtime=await readFile(new URL('../challenge120-runtime.js',import.meta.url),'utf8');
 assert.match(runtime,/#publicGameAccessStatus/,'challenge event filter exempts the retry control');
 assert.match(runtime,/!\['training','running'\]\.includes\(s\.phase\)/,'challenge still blocks answers outside active phases');
});

test('missing or malformed settings remain unconfirmed and fail closed; explicit states are honored',async()=>{
 const {api,document,answer}=setup();assert.equal(api.settingStatus(null),'unknown');assert.equal(api.settingStatus({}),'unknown');
 assert.equal(api.settingStatus({status:'unexpected'}),'unknown');assert.equal(api.settingStatus({published:false}),'hidden');assert.equal(api.settingStatus({published:true}),'published');
 const gate=api.create(document,{timeoutMs:50});assert.equal(await gate.check(()=>Promise.resolve(null)),'unknown');
 assert.equal(attempt(document,'click',answer).defaultPrevented,true);
 assert.ok(document.getElementById('publicGameAccessStatus').children.some(node=>node.tagName==='BUTTON'),'unknown settings retain an operable retry');
});

test('read failures distinguish network, authentication, permission, and unknown errors',()=>{
 const {api}=setup();
 assert.equal(api.failureType({code:'unavailable'}),'network');
 assert.equal(api.failureType({code:'auth/operation-not-allowed'}),'authentication');
 assert.equal(api.failureType({code:'permission-denied'}),'permission');
 assert.equal(api.failureType(new Error('other')),'unknown');
});
