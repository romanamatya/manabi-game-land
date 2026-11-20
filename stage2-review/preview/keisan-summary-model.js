(function(r,f){if(typeof module==='object'&&module.exports)module.exports=f();else r.ManabiSummaryModel=f()})(globalThis,()=>{
'use strict';
const GAME='keisanSummary',KINDS=['order','distribution','factor','exchange','multiply','shape','word'];
const NAMES={order:'計算のきまり',distribution:'分配のきまり①',factor:'分配のきまり②',exchange:'交換・結合のきまり',multiply:'かけ算のせいしつ',shape:'図形と式',word:'文章問題と式'};
const TITLES=[{at:5,name:'計算の見習い'},{at:10,name:'計算のひらめき者'},{at:15,name:'計算の使い手'},{at:20,name:'計算の達人'},{at:30,name:'計算のきまりマスター'}];
const shuffle=(a,r=Math.random)=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pick=(a,r)=>a[Math.floor(r()*a.length)],int=(a,b,r)=>a+Math.floor(r()*(b-a+1));
function bag(last='',r=Math.random){const a=shuffle(KINDS,r);if(a[0]===last)[a[0],a[1]]=[a[1],a[0]];return a}
function choices(correct,wrong,r){return shuffle([...new Set([String(correct),...wrong.map(String)])].slice(0,3),r)}
function stage(prompt,correct,wrong,r){const options=choices(correct,wrong,r);if(options.length!==3)throw Error('three-options-required');return {prompt,options,correct:String(correct)}}
function words(a,b,n,scene){
 const scenes=[
  [`1本${a}円のえん筆と、1こ${b}円のキャップを1組にして${n}組買います。全部の代金を表す式はどれ？`,`(${a}＋${b})×${n}`,[`${a}＋${b}×${n}`,`${a}×${n}＋${b}`],(a+b)*n],
  [`1こ${a}円のおかしと、1こ${b}円のふくろを1組にして${n}組用意します。全部の代金を表す式はどれ？`,`(${a}＋${b})×${n}`,[`${a}＋${b}×${n}`,`${a}×${n}＋${b}`],(a+b)*n],
  [`1ふくろにあめが${a}こ入っています。それぞれのふくろから${b}こずつ取り出しました。${n}ふくろに残ったあめの数を表す式はどれ？`,`(${a}－${b})×${n}`,[`${a}－${b}×${n}`,`${a}×${n}－${b}`],(a-b)*n],
  [`赤いシールを1人に${a}まい、青いシールを1人に${b}まいずつ、${n}人に配ります。全部のまい数を表す式はどれ？`,`(${a}＋${b})×${n}`,[`${a}＋${b}×${n}`,`${a}×${n}＋${b}`],(a+b)*n],
  [`${a*n}円持っています。1こ${b}円のおかしを${n}こ買いました。残りのお金を表す式はどれ？`,`${a*n}－${b}×${n}`,[`(${a*n}－${b})×${n}`,`${a*n}×${n}－${b}`],(a-b)*n],
  [`色紙が${a*n}まいあります。そこに${b*n}まい足してから、${n}人で同じ数ずつ分けます。1人分のまい数を表す式はどれ？`,`(${a*n}＋${b*n})÷${n}`,[`${a*n}＋${b*n}÷${n}`,`${a*n}÷${n}＋${b*n}`],a+b],
  [`${a}こ入りの箱が${n}箱と、${b}こ入りの箱が${n}箱あります。全部の数を、1組分を先に計算して求める式はどれ？`,`(${a}＋${b})×${n}`,[`${a}＋${b}×${n}`,`${a}×${n}＋${b}`],(a+b)*n]
 ];
 const [prompt,correct,wrong,value]=scenes[scene%scenes.length];return {prompt,correct,wrong,value,scene:scene%scenes.length};
}
function bind(host){return {order:host.ManabiKeisanQuestions,distribution:host.ManabiDistribution,new:host.ManabiMathNew,multiplication:host.ManabiMultiplication,concepts:host.ManabiMathConcepts,exchange:host.ManabiMathNew.exchangeQuestions(),multiply:host.ManabiMultiplication.multiplication(),shape:host.ManabiMathConcepts.shapes()};}
function nextSource(kind,models,session,r){const saved=session[kind]||(session[kind]={queue:[]});let raw;
 if(kind==='order')return models.order.generate();
 if(kind==='distribution'){if(!saved.queue.length)saved.queue=models.distribution.deck(r,saved.last);const id=saved.queue.shift();saved.last=id;return {...models.distribution.question(id),id};}
 if(kind==='factor'){if(!saved.queue.length)saved.queue=models.new.shuffle(models.new.factorQuestions,r).map(q=>q.id);const id=saved.queue.shift();return models.new.factorQuestions.find(q=>q.id===id);}
 if(kind==='exchange'){if(!saved.queue.length)saved.queue=models.new.shuffleQuestionDeck(models.exchange,saved.lastType||'',r).map(q=>q.id);const id=saved.queue.shift();raw=models.exchange.find(q=>q.id===id);saved.lastType=raw.type;return raw;}
 const pool=kind==='multiply'?models.multiply:models.shape,engine=kind==='multiply'?models.multiplication:models.concepts;
 if(!saved.queue.length)saved.queue=engine.deck(pool,saved.lastType,saved.recentBases||[]);const id=saved.queue.shift();raw=pool.find(q=>q.id===id);saved.lastType=raw.type;if(kind==='multiply')saved.recentBases=[...(saved.recentBases||[]),[Math.min(raw.a,raw.b),Math.max(raw.a,raw.b)].join('×')].slice(-5);return raw;
}
function make(kind,{r=Math.random,models={},sourceState={}}={}){
 if(kind==='word'){const scene=int(0,6,r),n=int(3,9,r),ranges=[[[30,40,45,50,55,60,70,75],[10,15,20,25]],[[30,40,45,50,55,60,70,75],[10,15,20,25]],[[12,15,18,20,24,30],[2,3,4,5,6]],[[2,3,4,5,6],[1,2,3,4]],[[50,60,70,80,90,100],[10,15,20,25]],[[3,4,5,6,8,10,12],[1,2,3,4,5]],[[6,8,10,12],[3,4,5,6]]],a=pick(ranges[scene][0],r),b=pick(ranges[scene][1].filter(value=>value!==a),r),raw=words(a,b,n,scene);return {sourceVersion:2,id:'word-'+a+'-'+b+'-'+n+'-'+raw.scene,kind,label:NAMES[kind],word:raw,stages:[{...stage(raw.prompt,raw.correct,raw.wrong,r),input:'choice'}],explanation:'正しい式は '+raw.correct+'。先に求める数や1組分を、かっこで表そう。'};}
 if(!KINDS.includes(kind))throw Error('unknown-kind');
 const raw=nextSource(kind,models,sourceState,r),q={sourceVersion:2,id:raw.id||'order-'+JSON.stringify(raw),kind,label:NAMES[kind],raw,stages:[]};
 if(kind==='order'){
  q.order=true;q.steps=[];let current=models.order.clone(raw);
  while(current.o.length){q.steps.push({state:models.order.clone(current),expr:models.order.parts(current).map(p=>p[1]).join(''),index:models.order.priority(current),ops:current.o.map((op,index)=>({index,text:current.n[index]+models.order.signs[op]+current.n[index+1]}))});current=models.order.reduce(current,models.order.priority(current));}
  q.result=current.n[0];q.explanation='（ ）の中、×・÷、＋・－の順に、同じ順番なら左から計算する。';return q;
 }
 if(kind==='distribution'){
  q.stages=['split','calculate'].map((name,index)=>({input:'source-choice',sourceStage:name,scene:index===0?raw.n+'×'+raw.m:models.distribution.splitText(raw.n-100,raw.m),prompt:index===0?'100を使った正しい式はどれ？':'正しい計算のしかたと答えはどれ？',options:models.distribution.choices(raw,name,r)}));
  q.explanation='正しい計算：'+models.distribution.method(raw,'distributed').text;return q;
 }
 if(kind==='factor'){
  q.stages=[{input:'tokens',scene:models.new.formatFactor(raw),prompt:'式をまとめよう',tokenRows:[[raw.a,raw.b,raw.c].sort((a,b)=>a-b).map(String),['＋','－','×','÷'],['(',')']]}];q.explanation='まとめた式：'+models.new.factorAnswer(raw);return q;
 }
 if(kind==='exchange'){
  const saved=sourceState.exchange,p=models.new.randomizedChoiceOrder(raw,saved.counts||[0,0,0],saved.lastSlot??-1,r);saved.counts=p.counts;saved.lastSlot=p.position;
  q.stages=[{input:'source-choice',scene:raw.question,prompt:'計算しやすい式を選ぼう',options:p.order.map(value=>({value,text:raw.choices[value]}))}];q.explanation=raw.solution;return q;
 }
 if(kind==='multiply'||kind==='shape'){
  q.diagram=raw;q.diagramKind=kind;const options=shuffle(raw.choices,r).map(value=>({value,text:String(value)+(raw.unit||'')}));
  q.stages=[{input:'source-choice',scene:kind==='shape'?'青の式 ＋ 赤の式 の順で選ぼう。':'もとの式 → 新しい式',prompt:raw.prompt,options}];q.explanation='正しい答え：'+raw.answer+(raw.unit||'')+'。'+raw.explanation;return q;
 }
}
function check(q,index,value,models,firstAnswer){
 if(q.kind==='order')return value===models.order.priority(q.steps[index].state);
 if(q.kind==='distribution'){const state={queue:[q.raw.id],position:0,cycle:0,stage:'calculate',firstAnswer:index===0?value:firstAnswer,streak:0,best:0,points:0};return models.distribution.finish(state,index===0?'distributed':value).correct;}
 if(q.kind==='factor')return Array.isArray(value)&&models.new.correctFactor(q.raw,value);
 if(q.kind==='exchange')return value===q.raw.correct;
 if(q.kind==='multiply'||q.kind==='shape')return value===q.raw.answer;
 return value===q.stages[index].correct;
}
function upgradeSaved(s){if(s.current?.q?.sourceVersion!==2)s.current=null;return s;}
return {GAME,KINDS,NAMES,TITLES,shuffle,bag,bind,nextSource,make,check,upgradeSaved,words};
});

