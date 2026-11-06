(()=>{
'use strict';
const M=window.ManabiParallel,local=window.ManabiParallelLocal,$=id=>document.getElementById(id),labels=['ア','イ','ウ','エ','オ','カ','キ'];
let question,context,selected=[],phase='ask',timer=null;
function stats(){const s=local.read(),wallet=local.wallet();$('points').textContent=local.balance();$('streak').textContent=s.streak;$('best').textContent=s.best;$('daily').textContent='今日 '+(wallet.daily.date===window.ManabiEconomyCore.dayKey()?(wallet.daily.games.parallelPair||0):0)+'/50pt';$('level').textContent={beginner:'初級',intermediate:'中級',advanced:'上級'}[M.difficulty(s.challenge.unlocked?Math.max(25,s.streak):s.streak)];for(const li of $('tower').children)li.classList.toggle('earned',s.titles.includes(li.dataset.title));$('storage-status').textContent=local.warning()?'この画面を開いている間だけ記録します。':''}
function svg(tag,attrs){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs||{}))n.setAttribute(k,String(v));return n}
function render(){const root=svg('svg',{viewBox:`0 0 ${M.WIDTH} ${M.HEIGHT}`,preserveAspectRatio:'xMidYMid meet',role:'group','aria-label':'7本の直線'});question.lines.forEach((l,i)=>{const g=svg('g',{class:'parallel-choice','data-line':i,role:'button',tabindex:0,'aria-label':`直線 ${labels[i]}`,'aria-pressed':'false'});g.append(svg('line',{class:'parallel-line',x1:l.start.x,y1:l.start.y,x2:l.end.x,y2:l.end.y}));const p=M.at(l,.045),text=svg('text',{x:p.x+12,y:p.y-12,class:'parallel-label'});text.textContent=labels[i];g.append(text);root.append(g)});$('diagram').replaceChildren(root);syncSelection()}
function syncSelection(){document.querySelectorAll('[data-line]').forEach(g=>g.setAttribute('aria-pressed',String(selected.includes(Number(g.dataset.line)))));$('selection-count').textContent=selected.length+' / 2本';$('confirm').disabled=phase!=='ask'||selected.length!==2}
function next(){clearTimeout(timer);if(!local.canPlay()){phase='closed';selected=[];syncSelection();paintGate();stats();return}try{question=M.buildQuestion({streak:local.read().challenge.unlocked?Math.max(25,local.read().streak):local.read().streak,id:window.crypto?.randomUUID?.()||'parallel-'+Date.now()});context=local.begin('parallelPair',question);selected=[];phase='ask';$('feedback').hidden=true;$('hint').textContent='線を2本選んで「決定！」を押そう。';render();stats()}catch(e){console.error(e);$('hint').textContent='問題を準備できませんでした。ページを再読み込みしてください。';phase='error';$('confirm').disabled=true}}
function toggle(index){if(phase!=='ask'||index<0)return;if(!local.canPlay()){next();return;}$('feedback').hidden=true;const at=selected.indexOf(index);if(at>=0)selected.splice(at,1);else if(selected.length<2)selected.push(index);else{$('hint').textContent='選んだ線をタップすると、選び直せるよ。';return}$('hint').textContent=selected.length===2?'この2本でよければ「決定！」を押そう。':'線を2本選んで「決定！」を押そう。';syncSelection()}
$('diagram').addEventListener('click',e=>{if(phase!=='ask')return;const root=$('diagram').querySelector('svg'),matrix=root.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());const scale=Math.hypot(matrix.a,matrix.b),index=M.nearestLine(question.lines,p,22/scale,4/scale);if(index<0){$('hint').textContent='線が交わる所をさけて、線の上をタップしよう。';return}toggle(index)});
$('diagram').addEventListener('keydown',e=>{const g=e.target.closest('[data-line]');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle(Number(g.dataset.line))}});
$('feedback').onclick=()=>{if(phase==='ask')$('feedback').hidden=true};
$('confirm').onclick=async()=>{
 if(phase!=='ask'||selected.length!==2)return;
 phase='checking';syncSelection();const answer=[...selected],ok=M.correct(question,answer);
 await local.answer(context,{selection:answer});stats();if(!context.accepted){next();return;}
 if(ok){phase='correct';const title=context.earnedTitles?.at(-1);if(title)window.ManabiCelebrations?.showTitle(title);else window.ManabiCelebrations?.showCorrect();if(!window.ManabiCelebrations){$('feedback').hidden=false;$('feedback').classList.remove('wrong');$('verdict').textContent=title?title.name+' を獲得！':'正解！';$('explanation').textContent=title?title.at+'問連続正解':'2本の直線は平行だよ。'}timer=setTimeout(next,title?1000:500)}
 else{if(!local.canPlay()){next();return}phase='ask';selected=[];context=local.begin('parallelPair',question);$('feedback').hidden=false;$('feedback').classList.add('wrong');$('verdict').textContent='もう一度！';$('explanation').textContent='線の向きをよく見て、同じ問題にちょうせんしよう。';$('hint').textContent='もう一度、平行な2本を選ぼう。';syncSelection()}
};
for (const title of [...local.titles].reverse()) {
 const row=document.createElement('li'), image=document.createElement('img');
 const label=document.createElement('span'), threshold=document.createElement('small');
 row.dataset.title=title.id;
 image.src=title.image.startsWith('data:')?title.image:'../'+title.image;
 image.alt='';
 label.textContent=title.name;
 threshold.textContent=title.at+'問連続';
 label.append(threshold);
 row.append(image,label);
 $('tower').append(row);
}
function paintGate(){
 const s=local.read(),c=s.challenge,running=c.phase==='running';
 $('challenge-clock').textContent=running?'残り '+window.ManabiChallenge120Core.format(c.deadline-Math.max(Date.now(),c.lastWall)):c.phase==='training'?'時間制限なし':'120秒チャレンジ';
 const closed=!['training','running'].includes(c.phase);$('challenge-gate').hidden=!closed;
 if(!closed)return;
 $('challenge-heading').textContent=c.phase==='ended'?'チャレンジ終了':'平行の王者 達成！';
 $('challenge-message').textContent=c.phase==='ended'?((c.endReason==='timeout'?'時間切れ。':c.endReason==='clock-change'?'時計の変更を確認したため終了。':'もう一度ちょうせんしよう。')+' 今回の最高 '+c.attemptBest+'問・自己ベスト '+s.best+'問'):'開始ボタンを押すまで、時間は減らないよ。25問連続からスタート！';
 $('challenge-start').textContent=c.phase==='ended'?'もう一度120秒チャレンジ':'120秒チャレンジを始める';
}
$('challenge-start').onclick=async()=>{try{$('challenge-start').disabled=true;await local.start();paintGate();next()}finally{$('challenge-start').disabled=false}};
let ticking=false;async function tick(){if(ticking)return;ticking=true;try{await local.tick();if(!local.canPlay()&&phase!=='correct'){clearTimeout(timer);phase='closed';selected=[];syncSelection()}if(phase!=='correct')paintGate();stats()}finally{ticking=false}}
const clockTimer=setInterval(tick,200);window.addEventListener('storage',tick);document.addEventListener('visibilitychange',tick);
window.addEventListener('pagehide',()=>{clearTimeout(timer);void local.tick()});window.addEventListener('pageshow',e=>{if(e.persisted){void tick();next()}});paintGate();next();
})();
