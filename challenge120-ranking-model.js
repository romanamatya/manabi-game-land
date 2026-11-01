export const CHALLENGE120_SEASON='2026-11-01';
export const CHALLENGE120_CUTOFF_MS=Date.parse('2026-11-01T00:00:00+09:00');
export const CHALLENGE120_PROTOCOL=3;
export const CHALLENGE120_DURATION_MS=120000;
export const CHALLENGE120_GAME_MINIMUMS=Object.freeze({
 keisan:20,'pref-name':47,'pref-place':47,alphabet:26,distribution:25,
 distribution2:25,exchangeAssociation:25,kotowaza:20,
 multiplicationProperties:25,shapeExpressions:25,keisanSummary:30
});
export const CHALLENGE120_GAMES=Object.freeze(Object.keys(CHALLENGE120_GAME_MINIMUMS));

export function validChallenge120Result(value,{now=Date.now()}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 if(value.protocol!==CHALLENGE120_PROTOCOL||value.mode!=='challenge120'||value.season!==CHALLENGE120_SEASON)return false;
 if(!CHALLENGE120_GAMES.includes(value.game)||typeof value.attemptId!=='string'||!/^[-A-Za-z0-9_]{8,64}$/.test(value.attemptId))return false;
 if(!Number.isSafeInteger(value.bestStreak)||value.bestStreak<CHALLENGE120_GAME_MINIMUMS[value.game]||value.bestStreak>1000)return false;
 if(!Number.isSafeInteger(value.startedAt)||!Number.isSafeInteger(value.endedAt)||value.startedAt<CHALLENGE120_CUTOFF_MS||value.endedAt<value.startedAt||value.endedAt>now+30000)return false;
 if(value.endedAt-value.startedAt>CHALLENGE120_DURATION_MS+30000)return false;
 if(!['timeout','wrong-answer'].includes(value.endReason))return false;
 if(value.game==='keisanSummary'&&value.endReason!=='timeout')return false;
 return true;
}

export function rankChallenge120Rows(rows,game){
 const bestByUid=new Map();
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row||row.protocol!==CHALLENGE120_PROTOCOL||row.mode!=='challenge120'||row.season!==CHALLENGE120_SEASON||!CHALLENGE120_GAMES.includes(row.game)||(game&&row.game!==game)||typeof row.uid!=='string'||!Number.isSafeInteger(row.bestStreak)||row.bestStreak<CHALLENGE120_GAME_MINIMUMS[row.game]||row.bestStreak>1000)continue;
  const previous=bestByUid.get(row.uid);
  if(!previous||row.bestStreak>previous.bestStreak)bestByUid.set(row.uid,row);
 }
 return [...bestByUid.values()].sort((a,b)=>b.bestStreak-a.bestStreak||String(a.uid).localeCompare(String(b.uid))).map((row,index,all)=>({...row,rank:all.findIndex(x=>x.bestStreak===row.bestStreak)+1}));
}
