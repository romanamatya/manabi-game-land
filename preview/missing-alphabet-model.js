(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MissingAlphabetModel=factory()})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const LETTERS=Object.freeze(Array.from({length:26},(_,i)=>String.fromCharCode(65+i)));
const ID='missingAlphabet';
const clampRandom=rng=>Math.min(.999999999,Math.max(0,Number(rng())||0));
function shuffle(values,rng=Math.random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(clampRandom(rng)*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result;}
function normalizeHistory(value){return Array.isArray(value)?value.filter(x=>x&&typeof x==='object'&&(x.lower===true||x.lower===false)&&Number.isInteger(x.start)&&x.start>=0&&x.start<=22&&Number.isInteger(x.missingIndex)&&x.missingIndex>=0&&x.missingIndex<=3).slice(-32).map(({lower,start,missingIndex})=>({lower,start,missingIndex})):[];}
function questionKey(q){return `${q.lower?'l':'u'}:${q.start}:${q.missingIndex}`;}
function createQuestion(rng=Math.random,history=[]){
 const recent=normalizeHistory(history),last=recent.at(-1),counts=recent.slice(-16),same=(a,b)=>a&&b&&questionKey(a)===questionKey(b);
 let candidates=[];
 for(const lower of [false,true])for(let start=0;start<=22;start++)for(let missingIndex=0;missingIndex<4;missingIndex++)candidates.push({lower,start,missingIndex});
 let eligible=candidates.filter(q=>!same(q,last));
 const recentKeys=new Set(recent.slice(-8).map(questionKey));const unseen=eligible.filter(q=>!recentKeys.has(questionKey(q)));if(unseen.length)eligible=unseen;
 const usage=q=>{const letter=q.start+q.missingIndex;return counts.reduce((n,x)=>n+(x.lower===q.lower?3:0)+(x.missingIndex===q.missingIndex?2:0)+(x.start+x.missingIndex===letter?1:0),0)};
 const min=Math.min(...eligible.map(usage));eligible=eligible.filter(q=>usage(q)===min);const picked=eligible[Math.floor(clampRandom(rng)*eligible.length)];
 const alphabet=picked.lower?LETTERS.map(x=>x.toLowerCase()):LETTERS;
 const answer=alphabet[picked.start+picked.missingIndex];
 const distractors=alphabet.map((letter,index)=>({letter,index,distance:Math.abs(index-(picked.start+picked.missingIndex))})).filter(x=>x.distance>0).sort((a,b)=>a.distance-b.distance||a.index-b.index).slice(0,3).map(x=>x.letter);
 const choices=shuffle([answer,...distractors],rng),correctIndex=choices.indexOf(answer),sequence=Array.from({length:4},(_,i)=>i===picked.missingIndex?'□':alphabet[picked.start+i]);
 return {id:`${picked.lower?'l':'u'}-${picked.start}-${picked.missingIndex}`,lower:picked.lower,start:picked.start,missingIndex:picked.missingIndex,sequence,choices,answer,correctIndex};
}
function canonicalPrompt(value){if(!value||typeof value!=='object'||typeof value.id!=='string'||value.id.length>80||typeof value.lower!=='boolean'||!Number.isInteger(value.start)||value.start<0||value.start>22||!Number.isInteger(value.missingIndex)||value.missingIndex<0||value.missingIndex>3||!Array.isArray(value.sequence)||value.sequence.length!==4||!Array.isArray(value.choices)||value.choices.length!==4||!Number.isInteger(value.correctIndex)||value.correctIndex<0||value.correctIndex>3)throw Error('invalid-question');const alphabet=value.lower?LETTERS.map(x=>x.toLowerCase()):LETTERS,answer=alphabet[value.start+value.missingIndex],sequence=Array.from({length:4},(_,i)=>i===value.missingIndex?'□':alphabet[value.start+i]);if(value.sequence.some((x,i)=>x!==sequence[i])||value.choices.some(x=>typeof x!=='string'||!alphabet.includes(x))||new Set(value.choices).size!==4||value.choices[value.correctIndex]!==answer||value.choices.filter(x=>x===answer).length!==1||value.choices.some(x=>x!==answer&&Math.abs(alphabet.indexOf(x)-alphabet.indexOf(answer))>4)||value.id!==`${value.lower?'l':'u'}-${value.start}-${value.missingIndex}`)throw Error('invalid-question');return {id:value.id,lower:value.lower,start:value.start,missingIndex:value.missingIndex,sequence,choices:[...value.choices],answer,correctIndex:value.correctIndex};}
function correct(prompt,answer){return answer?.choice===prompt.answer;}
return Object.freeze({ID,LETTERS,shuffle,normalizeHistory,questionKey,createQuestion,canonicalPrompt,correct});
});

