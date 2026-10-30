// Shared management contract. No credentials, answers or learning-event collection.
export const GAME_IDS=Object.freeze(['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions']);
export const normalPolicy=()=>({multiplier:1,cap:50,campaignId:null});
export function policyFor(setting,now=Date.now()){
 const c=setting?.campaign;
 return c?.enabled===true&&(!c.endAt||c.endAt>now)?{multiplier:2,cap:100,campaignId:c.id}:normalPolicy();
}
export function checkedInput(action,input){
 if(!['visibility','campaign','notice','reset','rankingBackup'].includes(action))throw Error('unknown-management-action');
 if(typeof input.reason!=='string'||input.reason.trim().length<2||input.reason.length>300)throw Error('invalid-reason');
 if(action!=='notice'&&!GAME_IDS.includes(input.game))throw Error('unknown-game');
 if(action==='visibility'&&typeof input.published!=='boolean')throw Error('invalid-visibility');
 if(action==='campaign'&&(typeof input.enabled!=='boolean'||input.endAt!=null&&(!Number.isSafeInteger(input.endAt)||input.endAt<=Date.now())))throw Error('invalid-campaign');
 if(action==='notice'&&(typeof input.title!=='string'||input.title.length>80||typeof input.body!=='string'||input.body.length>3000||typeof input.published!=='boolean'||input.published&&!input.title.trim()))throw Error('invalid-notice');
 return input;
}
export function rankingRows(players,game){return players.filter(p=>Number.isSafeInteger(p.best?.[game])&&p.best[game]>0).map(p=>({uid:p.uid,nickname:p.nickname,best:p.best[game]})).sort((a,b)=>b.best-a.best||a.nickname.localeCompare(b.nickname,'ja'));}
