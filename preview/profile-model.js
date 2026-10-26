(()=>{
const games=window.ManabiProfileCatalog;
const badges=games.flatMap(g=>g.titles.map(t=>({...t,game:g.id,gameName:g.name})));
const number=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
const read=(storage,key)=>{try{return JSON.parse(storage.getItem(key)||'{}')||{}}catch{return {}}};
function records(storage){return games.map(game=>{const state=game.id==='keisan'?{best:storage.getItem('mgl_best'),points:storage.getItem('mgl_points')}:read(storage,'mgl_'+game.id);return {...game,best:number(state.best),points:number(state.points)}})}
const icons=[
{id:'cat',name:'ねこ',x:502,y:240},{id:'rabbit',name:'うさぎ',x:753,y:240},{id:'penguin',name:'ペンギン',x:1007,y:240},{id:'robot',name:'ロボット',x:1266,y:240},
{id:'explorer',name:'探検ねこ',x:502,y:520,game:'pref-name',at:5,title:'地図のたんけん家'},
{id:'wizard',name:'魔法使いうさぎ',x:753,y:520,game:'keisan',at:10,title:'計算名人'},
{id:'ninja',name:'忍者ペンギン',x:1007,y:520,game:'pref-place',at:10,title:'位置ものしり'},
{id:'king',name:'王様ロボット',x:1266,y:520,game:'alphabet',at:26,title:'アルファベットマスター'}];
icons.slice(0,4).forEach((item,i)=>item.image='assets/avatars/icon_'+String(i+1).padStart(3,'0')+'.png');
icons.push(...(window.ManabiEconomyCore?.catalog||[]).filter(p=>p.kind==='icon').map(p=>({...p,shop:true})));
const frames=[{id:'plain',name:'シンプル'},{id:'star',name:'スター',anyTitle:true},{id:'laurel',name:'月桂樹',game:'pref-name',at:30,title:'日本の達人'},{id:'crown',name:'王冠',game:'alphabet',at:26,title:'アルファベットマスター'}];
frames.push(...(window.ManabiEconomyCore?.catalog||[]).filter(p=>p.kind==='frame').map(p=>({...p,shop:true})));
function available(item,rows){if(item.shop)return window.ManabiEconomy?.snapshot().owned.includes(item.id)===true;return item.anyTitle?rows.some(r=>r.titles.some(t=>r.best>=t.at)):!item.game||rows.some(r=>r.id===item.game&&r.best>=item.at)}
function condition(item){if(item.shop)return item.price===null?'ポイントショップ：価格未定':item.price+'ptで購入';if(item.anyTitle)return 'どれかのゲームで最初の称号を獲得';if(!item.game)return '最初から使える';return games.find(g=>g.id===item.game).name+'「'+(games.find(g=>g.id===item.game).titles.find(t=>t.at===item.at)?.name||item.title)+'」（'+item.at+'問連続）'}
function normalize(value,rows){const raw=value&&typeof value==='object'?value:{};const icon=icons.find(i=>i.id===raw.icon&&available(i,rows))||icons[0],frame=frames.find(i=>i.id===raw.frame&&available(i,rows))||frames[0];const badge=badges.find(b=>b.id===raw.badge&&rows.some(r=>r.id===b.game&&r.best>=b.at));return {icon:icon.id,frame:frame.id,badge:badge?.id||null,volume:typeof raw.volume==='number'&&Number.isFinite(raw.volume)?Math.max(0,Math.min(1,raw.volume)):1,reduceMotion:raw.reduceMotion===true}}
function profile(storage){return normalize(read(storage,'mgl_profile'),records(storage))}
function unlocked(rows){return [...icons.map(i=>({...i,kind:'icon'})),...frames.map(i=>({...i,kind:'frame'}))].filter(i=>(i.game||i.anyTitle)&&available(i,rows))}
function next(row){return row.titles.find(t=>t.at>row.best)||null}
function appearance(storage){const {icon,frame,badge}=profile(storage);return {icon,frame,badge}}
function playerRows(player){const fields={keisan:'bestStreak','pref-name':'prefNameBestStreak','pref-place':'prefPlaceBestStreak',alphabet:'alphabetBestStreak'};return games.map(g=>({...g,best:number(player[fields[g.id]])}))}
function appearanceFor(player){const value=normalize(player.appearance,playerRows(player));const icon=icons.find(i=>i.shop&&i.id===player.appearance?.icon);if(icon)value.icon=icon.id;const frame=frames.find(i=>i.shop&&i.id===player.appearance?.frame);if(frame)value.frame=frame.id;return value}
function subjectPoints(rows){return [{name:'国語',ids:[]},{name:'算数',ids:['keisan']},{name:'社会',ids:['pref-name','pref-place']},{name:'理科',ids:[]},{name:'英語',ids:['alphabet']}].map(s=>{const games=rows.filter(r=>s.ids.includes(r.id));return {...s,games,points:games.reduce((sum,r)=>sum+r.points,0)}})}
window.ManabiProfile={subjectPoints,games,badges,icons,frames,records,available,condition,normalize,profile,unlocked,next,appearance,playerRows,appearanceFor};
})();
