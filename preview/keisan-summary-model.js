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
  [`色紙が${a*n}まいあります。そこに${b}まい足してから、${n}人で同じ数ずつ分けます。1人分のまい数を表す式はどれ？`,`(${a*n}＋${b})÷${n}`,[`${a*n}＋${b}÷${n}`,`${a*n}÷${n}＋${b}`],(a*n+b)/n],
  [`${a}こ入りの箱が${n}箱と、${b}こ入りの箱が${n}箱あります。全部の数を、1組分を先に計算して求める式はどれ？`,`(${a}＋${b})×${n}`,[`${a}＋${b}×${n}`,`${a}×${n}＋${b}`],(a+b)*n]
 ];
 const [prompt,correct,wrong,value]=scenes[scene%scenes.length];return {prompt,correct,wrong,value,scene:scene%scenes.length};
}
function make(kind,{r=Math.random,models={}}={}){
 const a=int(12,75,r),b=int(2,9,r),n=int(3,9,r),id=kind+'-'+a+'-'+b+'-'+n+'-'+int(0,999999,r);let q={id,kind,label:NAMES[kind],stages:[]};
 if(kind==='order'){
  const x=int(2,9,r),y=int(2,9,r),z=int(2,8,r),w=int(2,Math.min(9,x+y*z),r),bracket=r()<.5;
  const sequence=bracket?[[`(${x}＋${y})×${z}＋${w}`,'0','0','2'],[`${x+y}×${z}＋${w}`,'0','1','2'],[`${(x+y)*z}＋${w}`,'0','1','2']]:[[`${x}＋${y}×${z}－${w}`,'1','0','2'],[`${x}＋${y*z}－${w}`,'0','1','2'],[`${x+y*z}－${w}`,'0','1','2']];
  q.order=true;q.steps=sequence.map(([expr,index])=>({expr,index:Number(index)}));q.steps=q.steps.map(s=>{const tokens=s.expr.match(/\d+|[＋－×÷]/g);let ops=[];for(let i=0;i<tokens.length;i++)if(/[＋－×÷]/.test(tokens[i]))ops.push({text:tokens[i-1]+tokens[i]+tokens[i+1],index:ops.length});return {...s,ops}});q.result=bracket?(x+y)*z+w:x+y*z-w;q.explanation='かっこの中を先に計算。次にかけ算・わり算、その後にたし算・ひき算を左から計算する。';return q;
 }
 if(kind==='distribution'){const k=int(1,5,r),sign=r()<.5?1:-1,m=int(2,9,r),number=100+sign*k,symbol=sign===1?'＋':'－';q.stages=[stage(`${number}×${m} を100を使った式に変えると？`,`(100${symbol}${k})×${m}`,[`100${symbol}${k}×${m}`,`100×${m}${symbol}${k}`],r),stage(`100×${m}${symbol}${k}×${m} ＝ □`,number*m,[100*m+sign*k,number+m,number*m+m],r)];q.explanation=`${number}は100${symbol}${k}。100にも${k}にも${m}をかける。答えは${number*m}。`;}
 if(kind==='factor'){const raw=pick(models.new.factorQuestions,r),correct=models.new.factorAnswer(raw).replaceAll('+','＋').replaceAll('-','－');q.stages=[stage(models.new.formatFactor(raw)+' をまとめると？',correct,[`(${raw.a}${raw.op==='+'?'＋':'－'}${raw.b})＋${raw.c}`,`${raw.a}${raw.op==='+'?'＋':'－'}${raw.b}×${raw.c}`],r),stage(correct+' ＝ □',models.new.factorValue(raw),[models.new.factorValue(raw)+raw.c,models.new.factorValue(raw)-raw.c,raw.a+raw.b+raw.c],r)];q.explanation='共通してかけている数を見つけ、かっこにまとめる。';}
 if(kind==='exchange'){const raw=pick(models.exchange,r);q.stages=[{prompt:raw.question+'\n先に計算して'+raw.target+'を作れる組み合わせを選ぼう。',options:shuffle(raw.choices,r),correct:raw.choices[raw.correct]}];q.explanation=raw.solution;}
 if(kind==='multiply'){const raw=pick(models.multiply,r);q.stages=[stage(raw.original+'\n'+raw.prompt,raw.answer,raw.choices.filter(x=>x!==raw.answer),r)];q.explanation=raw.explanation;}
 if(kind==='shape'){const raw=pick(models.shape,r);q.diagram=raw;q.stages=[{prompt:'青の式＋赤の式の順で、囲み方に合う式を選ぼう。',options:shuffle(raw.choices,r),correct:raw.answer}];q.explanation=raw.explanation;}
 if(kind==='word'){const raw=words(a,b,n,int(0,6,r));q.stages=[stage(raw.prompt,raw.correct,raw.wrong,r)];q.word=raw;q.explanation='1組分や、先に求める数をかっこで表す。正しい式は '+raw.correct+'。';}
 if(!q.stages.length)throw Error('unknown-kind');return q;
}
return {GAME,KINDS,NAMES,TITLES,shuffle,bag,make,words};
});
