// Small client-side contract for the four supported admin features.
export const GAME_IDS=Object.freeze(['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary','parallelPair','missingAlphabet']);
export const AUDIT_REASON='管理室からの操作';
export const normalPolicy=()=>({multiplier:1,cap:50,campaignId:null});
export function visibilityStatus(setting){
 if(!setting||typeof setting!=='object')return 'unknown';
 if(['published','preparing','hidden'].includes(setting.status))return setting.status;
 if(setting.published===true)return 'published';
 if(setting.published===false)return 'hidden';
 return 'unknown';
}
export function policyFor(setting,now=Date.now()){
 const c=setting?.campaign;
 return c?.enabled===true&&Number.isSafeInteger(c.startAt)&&Number.isSafeInteger(c.endAt)&&c.startAt<=now&&now<c.endAt?{multiplier:2,cap:50,campaignId:c.id}:normalPolicy();
}
export function checkedInput(action,input){
 if(!['campaign','notice','visibility','visibilityBatch'].includes(action))throw Error('unknown-management-action');
 input={...input,reason:AUDIT_REASON};
 if(action==='campaign'){
  if(!Array.isArray(input.games)||!input.games.length||input.games.some(g=>!GAME_IDS.includes(g))||new Set(input.games).size!==input.games.length)throw Error('invalid-games');
  if(!Number.isSafeInteger(input.startAt)||!Number.isSafeInteger(input.endAt)||input.endAt<=input.startAt)throw Error('invalid-campaign-window');
  if(typeof input.enabled!=='boolean')throw Error('invalid-campaign');
 }
 if(action==='visibility'&&(!GAME_IDS.includes(input.game)||!['published','preparing','hidden'].includes(input.status)))throw Error('invalid-visibility');
 if(action==='visibilityBatch'&&(!Array.isArray(input.games)||!input.games.length||input.games.length>GAME_IDS.length||input.games.some(g=>!GAME_IDS.includes(g)&&!(g==='verticalParallel'&&input.games.length===1))||new Set(input.games).size!==input.games.length||!['published','preparing','hidden'].includes(input.status)))throw Error('invalid-visibility-batch');
 if(action==='notice'&&(typeof input.title!=='string'||input.title.length>80||typeof input.body!=='string'||input.body.length>3000||typeof input.published!=='boolean'||input.published&&!input.title.trim()))throw Error('invalid-notice');
 return input;
}
