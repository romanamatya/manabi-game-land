(()=>{
const letters=Object.freeze('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
function shuffle(values,random=Math.random){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
const groups=['a o e c','b d p q','g q j y','m n h r','i l j t','u v w y','s z x k','f t r l'];
function choices(letter,random=Math.random){const correct=letter.toLowerCase(),near=groups.filter(g=>g.split(' ').includes(correct)).flatMap(g=>g.split(' '));const others=[...new Set([...shuffle(near,random),...shuffle(letters.map(l=>l.toLowerCase()),random)])].filter(l=>l!==correct).slice(0,3);return shuffle([correct,...others],random)}
function normalize(value={}){const number=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;const streak=number(value?.streak);return {points:number(value?.points),streak,best:Math.max(streak,number(value?.best)),queue:Array.isArray(value?.queue)?[...new Set(value.queue.filter(l=>letters.includes(l)))]:[]}}
function result(state,correct){return {...state,points:state.points+(correct?1:0),streak:correct?state.streak+1:0,best:correct?Math.max(state.best,state.streak+1):state.best,queue:correct?state.queue.slice(1):[]}}
window.AlphabetModel={letters,shuffle,choices,normalize,result};
})();
