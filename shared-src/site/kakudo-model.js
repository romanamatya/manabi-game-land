(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ManabiKakudo=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const angles=[30,45,60,90,120,135,150,180,210,225,240,270,300,315,330,360];
const groups=[[0,90],[90,180],[180,270],[270,361]];
const groupOf=n=>groups.findIndex(([a,b])=>n>=a&&n<b);
const shuffle=(a,r=Math.random)=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function options(answer,r=Math.random){const rest=shuffle(angles.filter(n=>n!==answer&&Math.abs(n-answer)>=45&&groupOf(n)!==groupOf(answer)),r),picked=[];for(let g=0;g<4;g++){if(g===groupOf(answer))picked.push(answer);else{const candidate=rest.find(n=>groupOf(n)===g&&!picked.some(x=>Math.abs(x-n)<45));if(candidate===undefined)throw Error('choice-generation-failed');picked.push(candidate)}}return shuffle(picked,r)}
let sequence=0;
function question(r=Math.random){const n=sequence++,angle=angles[n%angles.length],kind=Math.floor(n/angles.length)%2?'match':'read',choices=options(angle,r);return {id:`${kind}-${angle}-${n}`,kind,angle,choices}}
function point(angle,radians){const t=(angle-90)*Math.PI/180;return {x:Number((120+90*Math.cos(t)).toFixed(8)),y:Number((120-90*Math.sin(t)).toFixed(8))}}
function arcPath(angle){if(angle===360)return 'M 120 25 A 95 95 0 1 1 119.9 25';const end=point(angle,0),large=angle>180?1:0;return `M 120 120 L 120 25 A 95 95 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`}
function title(streak){return [{at:5,name:'角度みつけ隊',image:'title_05.png'},{at:10,name:'開きのたんけん家',image:'title_10.png'},{at:15,name:'角度の目利き',image:'title_15.png'},{at:20,name:'角度の名探偵',image:'title_20.png'},{at:25,name:'角度の見きわめ王',image:'title_25.png'}].filter(x=>streak>=x.at).at(-1)||null}
function analyze(rows){const result={read:{answers:0,correct:0},match:{answers:0,correct:0},angles:Object.fromEntries(angles.map(a=>[a,{answers:0,correct:0}])),groups:groups.map((_,i)=>({group:i,answers:0,correct:0}))};for(const row of rows){const c=row.correct===true;result[row.kind].answers++;if(c)result[row.kind].correct++;result.angles[row.angle].answers++;if(c)result.angles[row.angle].correct++;const g=groupOf(row.angle);result.groups[g].answers++;if(c)result.groups[g].correct++}return result}
function validate(){for(const a of angles){for(const kind of ['read','match']){const q={angle:a,kind,choices:options(a,()=>.37)};if(q.choices.length!==4||new Set(q.choices).size!==4||q.choices.filter(n=>n===a).length!==1||new Set(q.choices.map(groupOf)).size!==4)throw Error('invalid-question:'+a+':'+kind)}}return true}
return {angles,groups,groupOf,options,question,point,arcPath,title,analyze,validate};
});
