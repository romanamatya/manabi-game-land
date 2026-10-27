// Pure merge logic shared by the browser and Emulator tests. No Firebase credentials.
export const SUBJECTS=['japanese','math','social','science','english'];
export const GAMES=['keisan','pref-name','pref-place','alphabet','kotowaza','distribution'];
export const FIELDS={keisan:'bestStreak','pref-name':'prefNameBestStreak','pref-place':'prefPlaceBestStreak',alphabet:'alphabetBestStreak',kotowaza:'kotowazaBestStreak',distribution:'distributionBestStreak'};
export const zero=()=>Object.fromEntries(SUBJECTS.map(s=>[s,0]));
export const number=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;
export const union=(...lists)=>[...new Set(lists.flat().filter(x=>typeof x==='string'))].sort();
export const error=code=>Object.assign(new Error(code),{code});
export const read=(storage,key,fallback={})=>{try{return JSON.parse(storage.getItem(key)||'null')??fallback}catch{return fallback}};
export const cleanAppearance=p=>JSON.parse(JSON.stringify(Object.fromEntries(['icon','frame','badge','subjectIcons','subjectFrames','limitedOwned','limitedFramesOwned','volume','reduceMotion'].filter(k=>p?.[k]!==undefined).map(k=>[k,p[k]]))));
export function capture(storage,core,catalog){
 const wallet=read(storage,'mgl_economy_v1',core.initial()),best={};
 for(const game of GAMES){const main=game==='keisan'?{best:storage.getItem('mgl_best')}:read(storage,'mgl_'+game),old=game==='pref-name'?read(storage,'mq_pref_name'):game==='pref-place'?read(storage,'mq_pref_place'):{};best[game]=Math.max(number(main.best),number(old.best));}
 const titles=union(read(storage,'mgl_sync_titles_v2',[]),catalog.flatMap(g=>g.titles.filter(t=>best[g.id]>=t.at).map(t=>t.id)));
 const rewards=[...(core.limitedRewards||[]),...(core.limitedFrames||[]),...(core.titleFrameRewards||[])].filter(r=>best[r.game]>=r.at).map(r=>r.id);
 return {nickname:storage.getItem('mgl_nickname')||'',balances:Object.fromEntries(SUBJECTS.map(s=>[s,number(wallet.balances?.[s])])),best,titles,owned:union(wallet.owned||[],read(storage,'mgl_limited_icons_v1',[]),read(storage,'mgl_limited_frames_v1',[]),rewards),appearance:cleanAppearance(read(storage,'mgl_profile'))};
}
export function mergeBest(a={},b={}){return Object.fromEntries(GAMES.map(g=>[g,Math.max(number(a[g]),number(b[g]))]));}
export function mergePlayer(remote,local,ledger,meta,catalog,core){
 if(remote.status!=='active')throw error('player-suspended');
 const delta=Object.fromEntries(SUBJECTS.map(s=>[s,number(meta.earned[s])-number(ledger?.earned?.[s])]));
 if(SUBJECTS.some(s=>delta[s]<0))throw error('sync-ledger-conflict');
 const best=mergeBest(remote.best,local.best),titles=union(remote.titles||[],local.titles,catalog.flatMap(g=>g.titles.filter(t=>best[g.id]>=t.at).map(t=>t.id)));
 const rewards=[...(core.limitedRewards||[]),...(core.limitedFrames||[]),...(core.titleFrameRewards||[])].filter(r=>best[r.game]>=r.at).map(r=>r.id);
 const appearanceConflict=meta.appearanceDirty&&number(remote.appearanceRevision)!==number(meta.appearanceBase);
 const appearance=meta.appearanceDirty&&!appearanceConflict?local.appearance:remote.appearance;
 return {player:{...remote,balances:Object.fromEntries(SUBJECTS.map(s=>[s,number(remote.balances[s])+delta[s]])),best,titles,owned:union(remote.owned||[],rewards),appearance,appearanceRevision:number(remote.appearanceRevision)+(meta.appearanceDirty&&!appearanceConflict?1:0)},appearanceConflict};
}
export function localBalances(remote,ledger,earned){return Object.fromEntries(SUBJECTS.map(s=>[s,number(remote.balances[s])+Math.max(0,number(earned[s])-number(ledger?.earned?.[s]))]));}

export function observeBalances(meta,balances){
 const next=structuredClone(meta);
 for(const s of SUBJECTS)next.earned[s]=number(next.earned[s])+Math.max(0,number(balances[s])-number(next.seenBalances?.[s]));
 next.seenBalances=Object.fromEntries(SUBJECTS.map(s=>[s,number(balances[s])]));return next;
}
