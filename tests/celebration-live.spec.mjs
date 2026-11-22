import {test,expect} from '@playwright/test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mockPublicVisibility} from './fixtures/public-visibility-browser.mjs';

const fixture={};
for (const file of ['distribution-model.js','kotowaza-data.js']) vm.runInNewContext(readFileSync(file,'utf8'),fixture);
const queues={distribution:fixture.ManabiDistribution.ids,kotowaza:fixture.ManabiKotowazaData.map(q=>q.id)};
const base='http://127.0.0.1:4173/';
const awardAt={keisan:3, alphabet:1, 'pref-name':1, 'pref-place':1, kotowaza:3,
 distribution:5, distribution2:5, exchangeAssociation:5, keisanSummary:5};
test.use({hasTouch:true,isMobile:true});
test.setTimeout(9500);
test.beforeEach(async ({page})=>{
 await page.route('https://**/*', route=>route.abort());
 await mockPublicVisibility(page);
 await page.route(/\/summary-management\.js(?:\?|$)/, route=>route.fulfill({
  contentType:'text/javascript',
  body:'window.ManabiSummaryManagement={ready:async()=>({published:true,policy:{multiplier:1,cap:50}})};',
 }));
 await page.setViewportSize({width:1024,height:768});
});

async function solve(page,id) {
 const button=(text,region='#choices')=>page.locator(region).getByRole('button',{name:String(text),exact:true}).first();
 switch (id) {
 case 'alphabet': return button('小文字 '+(await page.locator('#letter').textContent()).toLowerCase()).tap();
 case 'pref-name': return button('東京都').tap();
 case 'pref-place': {
  await page.locator('[data-pref="東京都"]').first().dispatchEvent('click');
  const confirm=page.locator('#confirm');
  if (!await confirm.isEnabled()) {
   const path=page.locator('[data-pref="東京都"]').first();
   await path.tap();
  }
  return confirm.tap();
 }
 case 'kotowaza': {
  const text=await page.evaluate(()=>window.ManabiKotowazaData.find(q=>q.scene===document.querySelector('#scene').textContent).answer);
  return page.locator('#choices button').filter({hasText:text}).first().tap();
 }
 case 'distribution': {
  await page.locator('#choices button[data-value="'+await page.evaluate(()=>Number(document.querySelector('#scene').textContent.split('×')[0])-100)+'"]').tap();
  await page.locator('#choices button[data-value="distributed"]').tap();
  return;
 }
 case 'distribution2': {
  const tokens=await page.evaluate(()=>{
   const text=document.querySelector('#question').textContent;
   const q=window.ManabiMathNew.factorQuestions.find(item=>window.ManabiMathNew.formatFactor(item)===text);
   return window.ManabiMathNew.factorAnswer(q).match(/\d+|[()+−+×-]/g).map(value=>value==='+'?'＋':value==='-'?'－':value);
  });
  for (const value of tokens) await button(value,'#area').tap();
  return button('答え合わせ','#area').tap();
 }
 case 'exchangeAssociation': return button(await page.evaluate(()=>{
  const {pendingQuestionId}=JSON.parse(window.manabiStorage.getItem('mgl_exchangeAssociation'));
  const q=window.ManabiMathNew.exchangeQuestions().find(item=>item.id===pendingQuestionId);
  return q.choices[q.correct];
 }),'#area').tap();
 case 'keisan': {
  const steps=await page.evaluate(()=>{
   const model=window.ManabiKeisanQuestions;
   let state=current;
   const result=[];
   while(state.o.length){
    const i=model.priority(state);
    result.push(i);state=model.reduce(state,i);
   }
   return result;
  });
  for(const i of steps)await page.locator('#work button').nth(i).tap();
  return;
 }
 case 'keisanSummary': {
  await expect(page.locator('#choices button').first()).toBeEnabled();
  const correct=await page.evaluate(()=>{
   const {q,stage}=JSON.parse(window.manabiStorage.getItem('mgl_keisanSummary')).current;
   return q.stages[stage].correct;
  });
  return button(correct).tap();
 }
 }
}
for(const [id,threshold] of Object.entries(awardAt))for(const award of [false,true]){
 test(id+' '+(award?'new title':'ordinary correct answer'),async({page})=>{
  const start=award?threshold-1:threshold===1?1:0;
  await page.addInitScript(({id,start,queue})=>{
   const key=id==='keisan'?'mgl_best':id.startsWith('pref-')?'mq_'+id.replace('-','_'):'mgl_'+id;
   const state={schema:1,revision:0,streak:start,best:start,queue:['東京都'],position:0};
   if(id==='keisanSummary')Object.assign(state,{highestEarned:false,phase:'training',bag:['word'],lastKind:'',current:null,challenge:null,best120:0,pending:[]});
   if(queue)state.queue=queue;
   if(id==='alphabet')delete state.queue;
   localStorage.setItem('manabi_preview_test:'+key,id==='keisan'?String(start):JSON.stringify(state));
  },{id,start,queue:queues[id]});
  await page.goto(base+'games/'+id+'.html?adminTest=1');
  await expect(page.locator('.mgl-celebration')).toHaveCount(1);
  if(id==='keisan'&&award)for(let i=0;i<2;i++){
   await solve(page,id);
   await expect(page.locator('.mgl-celebration--correct')).toBeVisible();
   await expect(page.locator('#work button')).toHaveCount(3);
  }
  await solve(page,id);
  const effect=page.locator('.mgl-celebration--'+(award?'title':'correct'));
  await expect(effect).toBeVisible();
  await expect(effect).toContainText(award?'新しい称号を獲得！':'正解！');
  if(award){
   await expect(effect.locator('.mgl-celebration__art')).toBeVisible();
   await expect(effect.locator('.mgl-celebration__text')).toHaveCount(0);
  }
  await expect(effect).toBeHidden();
 });
}
