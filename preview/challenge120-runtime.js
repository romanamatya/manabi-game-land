(()=>{
'use strict';
if(window.MANABI_ENV?.preview!==true||window.MANABI_BACKEND_CONFIG?.challenge120Enabled!==true)return;
const C=window.ManabiChallenge120Core,storage=window.manabiStorage,game=location.pathname.match(/\/games\/([^/]+)\.html$/)?.[1],test=new URL(location.href).searchParams.has('adminTest');if(!C||!storage||!C.highest[game])return;
const key='mgl_challenge120_v1:'+game,season='preview-local-120-v1',lock='manabi-preview-challenge120-'+game;
let anchorWall=Date.now(),anchorMono=performance.now(),panel,overlay,working=false,serial=Promise.resolve();
const read=()=>{try{const s=JSON.parse(storage.getItem(key)||'null');if(s?.protocol===2&&s.game===game)return s;}catch{}return C.fresh(game);};
const save=s=>storage.setItem(key,JSON.stringify(s));
function earned(){const r=window.ManabiProfile?.records(storage).find(r=>r.id===game);return r?.best>=C.highest[game];}
function current(){let s=read();s=C.unlock(s,earned());const time=C.clock(s,Date.now(),performance.now()-anchorMono,anchorWall);return C.settle(s,time.now,time.rollback);}
function transaction(fn){const run=()=>{const s=current(),r=fn(s);save(r.state||r);return r;};const promise=navigator.locks?navigator.locks.request(lock,run):Promise.reject(Error('cross-tab-lock-required'));return promise;}
function text(tag,value){const n=document.createElement(tag);n.textContent=value;return n;}
function publishLocal(s){if(test||s.phase!=='ended')return;const k='mgl_challenge120_local_board_v1';let rows=[];try{rows=JSON.parse(storage.getItem(k)||'[]');if(!Array.isArray(rows))rows=[];}catch{}const uid=storage.getItem('localPlayerId')||'this-device';const old=rows.find(r=>r.uid===uid&&r.game===game&&r.season===s.season);if((old?.best||0)>=(s.bests[s.season]||0))return;const row={protocol:2,mode:'challenge120',season:s.season,game,uid,nickname:storage.getItem('mgl_nickname')||'プレイヤー',best:s.bests[s.season]||0,appearance:window.ManabiProfile?.appearance(storage)||{},at:s.endedAt};rows=rows.filter(r=>!(r.uid===uid&&r.game===game&&r.season===s.season));rows.push(row);storage.setItem(k,JSON.stringify(rows));window.dispatchEvent(new Event('manabi-local-record-change'));}
function paint(s=current()){
 if(!document.body||document.readyState==='loading')return;if(!panel){panel=document.createElement('aside');panel.id='challenge120Status';panel.setAttribute('aria-label','2分間チャレンジ');(document.querySelector('.stats')||document.body).append(panel);overlay=document.createElement('section');overlay.id='challenge120Gate';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.hidden=true;document.body.append(overlay);}
 panel.replaceChildren();const phase=s.phase;const label=phase==='running'?'2分間 '+C.format(s.deadline-Math.max(Date.now(),s.lastWall)):phase==='training'?'練習：時間制限なし':'2分間チャレンジ';panel.append(text('strong',label));if(phase==='running'){panel.append(text('small','連続 '+s.streak+' / 今回最高 '+s.attemptBest));const counter=document.getElementById('streak');if(counter)counter.textContent=s.streak;}const stats=document.querySelector('.stats');if(stats&&panel.parentElement!==stats)stats.append(panel);const note=text('small','端末内記録・共有ランキング未接続');panel.append(note);
 if(phase==='training'){overlay.hidden=true;return;}
 if(phase==='running'){overlay.hidden=true;return;}
 const stamp=phase+':'+s.attemptId+':'+s.unlocked;if(overlay.dataset.stamp===stamp)return;overlay.dataset.stamp=stamp;overlay.replaceChildren(text('h2',phase==='ended'?'2分間チャレンジ終了':'最高称号達成！'));
 if(phase==='ended'){overlay.append(text('p','今回の最高：'+s.attemptBest+'問連続'),text('p','2分間の自己ベスト：'+(s.bests[season]||0)+'問連続'));if(s.endReason==='clock-change')overlay.append(text('p','時計の変更を検出したため終了しました。'));publishLocal(s);}
 overlay.append(text('p','練習・旧ランキングの記録は、この記録には合算しません。'));
 const b=text('button',phase==='ended'?'もう一度2分間チャレンジ':'2分間チャレンジ開始');b.type='button';b.onclick=async()=>{if(working)return;working=true;b.disabled=true;try{await serial;await transaction(st=>C.start(st,Date.now(),crypto.randomUUID(),season));location.reload();}catch(e){b.disabled=false;working=false;overlay.append(text('p','開始できません。別のタブの挑戦を確認してください。'));}};overlay.append(b);const home=text('a','ゲーム選択へ戻る');home.href='../'+(game==='kotowaza'?'japanese':game==='alphabet'?'language':game.startsWith('pref-')?'social':'math')+'.html';overlay.append(home);overlay.hidden=false;
}
function tick(){if(working)return;if(read().phase!=='running'){paint();return;}serial=serial.then(()=>transaction(s=>s)).then(s=>paint(s)).catch(()=>{});}
window.ManabiChallenge120={
 issue(id,questionId){if(id!==game)return null;const s=current();return C.issue(s,questionId);},
 async record(token,correct){let result;serial=serial.then(async()=>{result=await transaction(s=>C.answer(s,token,correct,Math.max(Date.now(),s.lastWall)));paint(result.state);});await serial;return result?.accepted===true;},
 accepts(token){const s=current();return token?.mode==='practice'?s.phase==='training'&&!s.attemptId:token?.mode==='challenge'&&s.phase==='running'&&token.attemptId===s.attemptId&&Date.now()<s.deadline;},
 state:()=>current()
};
for(const type of ['click','pointerdown','keydown'])document.addEventListener(type,e=>{if(e.target.closest?.('#challenge120Gate,#challenge120Status,header,a,dialog'))return;const s=current();if(!['training','running'].includes(s.phase)){e.preventDefault();e.stopImmediatePropagation();paint(s);}},true);
const init=()=>{let s=current();if(!storage.getItem(key)&&s.phase==='training'){const raw=game==='keisan'?Number(storage.getItem('mgl_keisan_practice_streak')||0):(()=>{try{return JSON.parse(storage.getItem('mgl_'+game)||'{}').streak||0}catch{return 0}})();s.practiceStreak=Math.min(raw,C.highest[game]-1);}save(s);paint(s);setInterval(tick,200);};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.addEventListener('storage',()=>paint());window.addEventListener('pageshow',tick);document.addEventListener('visibilitychange',tick);window.addEventListener('pagehide',()=>{const s=current();save(s);});
})();
