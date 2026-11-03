import {test,expect} from '@playwright/test';

const baseURL=process.env.MGL_BASE_URL||'http://127.0.0.1:4173/';
const pageURL=(path)=>new URL(path,baseURL).href;
const blockFirebaseApi=page=>page.route(/https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com\//,route=>route.abort());

async function waitForLiveBuild(){
 if(process.env.MGL_EXPECT_LIVE!=='1')return;
 for(let attempt=0;attempt<36;attempt++){
  try{const response=await fetch(pageURL(`games/suichoku.html?release-check=${Date.now()}`));const html=response.ok?await response.text():'';if(html.includes('suichoku-live-fix-20261103')&&html.includes('celebration-effects.js?v=shared-celebration-1'))return}catch{}
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 throw Error('GitHub Pages has not published the expected vertical-game revision');
}

async function perpendicularChoice(page){
 return page.locator('#diagram svg').evaluate(svg=>{
  const reference=svg.querySelector('.reference'),rx=Number(reference.getAttribute('x2'))-Number(reference.getAttribute('x1')),ry=Number(reference.getAttribute('y2'))-Number(reference.getAttribute('y1'));
  return [...svg.querySelectorAll('.candidate')].map(group=>{const line=group.querySelector('.candidate-line'),dx=Number(line.getAttribute('x2'))-Number(line.getAttribute('x1')),dy=Number(line.getAttribute('y2'))-Number(line.getAttribute('y1'));return {choice:Number(group.dataset.choice),dot:Math.abs(rx*dx+ry*dy)}}).sort((a,b)=>a.dot-b.dot)[0].choice;
 });
}
async function tapCandidate(page,choice){
 const point=await page.locator('#diagram svg').evaluate((svg,index)=>{const line=svg.querySelector(`.candidate[data-choice="${index}"] .candidate-line`),x=(Number(line.getAttribute('x1'))+Number(line.getAttribute('x2')))/2,y=(Number(line.getAttribute('y1'))+Number(line.getAttribute('y2')))/2,p=new DOMPoint(x,y).matrixTransform(line.getScreenCTM());return {x:p.x,y:p.y}},choice);
 await page.mouse.click(point.x,point.y);
}

test('public page renders titles and completes ten correct answers, including reload persistence',async({page})=>{
 await waitForLiveBuild();await page.goto(pageURL('games/suichoku.html?adminTest=1'));
 await expect(page.locator('#question')).not.toHaveText('読み込み中…');await expect(page.locator('#choices button')).toHaveCount(5);await expect(page.locator('#diagram .candidate')).toHaveCount(5);
 const expected=['title_25.png','title_20.png','title_15.png','title_10.png','title_05.png'];await expect(page.locator('#tower > li')).toHaveCount(5);
 for(let i=0;i<5;i++){const row=page.locator('#tower > li').nth(i);await expect(row.locator('img')).toHaveCount(1);await expect(row.locator('img')).toHaveAttribute('src',new RegExp(expected[i]+'$'))}
 for(let streak=1;streak<=10;streak++){
  const choice=await perpendicularChoice(page);await tapCandidate(page,choice);await expect(page.locator('#verdict')).toHaveText('正解！');await expect(page.locator('#streak')).toHaveText(String(streak));
  if(streak<10)await expect(page.locator('#feedback')).toBeHidden({timeout:3000});
 }
 await expect.poll(()=>page.evaluate(()=>JSON.parse(window.manabiStorage.getItem('mgl_suichoku')).best)).toBe(10);
 await page.reload();await expect(page.locator('#best')).toHaveText('10');await expect(page.locator('#choices button')).toHaveCount(5);
});

test('wrong answer is shown once and the next-question control recovers play',async({page})=>{
 await waitForLiveBuild();await page.goto(pageURL('games/suichoku.html?adminTest=1'));await expect(page.locator('#choices button')).toHaveCount(5);
 const correct=await perpendicularChoice(page),wrong=(correct+1)%5;await tapCandidate(page,wrong);await expect(page.locator('#verdict')).toHaveText('不正解');await expect(page.locator('#next')).toBeVisible();
 await tapCandidate(page,wrong);await expect.poll(()=>page.evaluate(()=>JSON.parse(window.manabiStorage.getItem('mgl_suichoku')).history.length)).toBe(1);
 await page.locator('#next').click();await expect(page.locator('#choices button')).toHaveCount(5);await expect(page.locator('#feedback')).toBeHidden();
});

test('shared celebration uses fireworks for a normal answer and only the title card at a milestone',async({page})=>{
 await waitForLiveBuild();await page.setViewportSize({width:1194,height:834});await page.goto(pageURL('games/suichoku.html?adminTest=1'));await expect(page.locator('#choices button')).toHaveCount(5);
 for(let streak=1;streak<=5;streak++){
  await tapCandidate(page,await perpendicularChoice(page));await expect(page.locator('#verdict')).toHaveText('正解！');
  const effect=page.locator('.mgl-celebration');
  await expect(page.locator('#feedback')).toBeVisible();
  if(streak===1){await expect(effect).toHaveClass(/mgl-celebration--correct/);await expect(effect).toContainText('正解！');await expect(effect.locator('.mgl-celebration__particle')).toHaveCount(38);const box=await effect.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(1194);expect(box.y+box.height).toBeLessThanOrEqual(834);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);await expect(effect).toBeHidden({timeout:1500});}
  if(streak===5){await expect(effect).toHaveClass(/mgl-celebration--title/);await expect(effect).toContainText('新しい称号を獲得！');await expect(effect).toContainText('垂直みつけ隊');await expect(effect.locator('.mgl-celebration__title-card')).toHaveCount(1);await expect(effect.locator('.mgl-celebration__text')).toHaveCount(0);await expect(effect.locator('.mgl-celebration__art img, .mgl-celebration__art svg')).toHaveCount(1);await expect(effect).toBeHidden({timeout:1800});}
  if(streak<5)await expect(page.locator('#feedback')).toBeHidden({timeout:1500});
 }
 expect(await page.locator('audio').count()).toBe(0);
});

test('shared effect module loads on each game in the current production code list without touching Firebase',async({page})=>{
 const gameIds=['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','suichoku'];
 await blockFirebaseApi(page);
 for(const id of gameIds){
  await page.goto(pageURL(`games/${id}.html?adminTest=1`),{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>typeof window.ManabiCelebrations?.showCorrect)).toBe('function');
  await page.evaluate(()=>window.ManabiCelebrations.showCorrect());
  const effect=page.locator('.mgl-celebration');await expect(effect).toBeVisible();await expect(effect).toContainText('正解！');await expect(effect).toBeHidden({timeout:1500});
 }
});

test('shared celebration leaves the active 120-second challenge timer and answer record running',async({page})=>{
 await blockFirebaseApi(page);
 await page.addInitScript(()=>{const now=Date.now(),prefix='manabi_preview_test:';localStorage.setItem(prefix+'mgl_suichoku',JSON.stringify({best:25,streak:25,history:[]}));localStorage.setItem(prefix+'mgl_challenge120_v1:suichoku',JSON.stringify({protocol:2,game:'suichoku',phase:'running',unlocked:true,practiceStreak:25,attemptId:'smoke-attempt',season:'production-120-v1',startedAt:now-1000,deadline:now+120000,lastWall:now-1000,streak:25,attemptBest:25,bests:{},sequence:0,claimed:[]}));});
 await page.goto(pageURL('games/suichoku.html?adminTest=1'));await expect(page.locator('#challenge120Status')).toContainText('2分間');
 const timerBefore=await page.locator('#challenge120Status strong').textContent();await page.waitForTimeout(1200);const timerAfter=await page.locator('#challenge120Status strong').textContent();expect(timerAfter).not.toBe(timerBefore);
 await tapCandidate(page,await perpendicularChoice(page));await expect(page.locator('#challenge120Status')).toContainText('連続 26 / 今回最高 26');await expect(page.locator('.mgl-celebration--correct')).toBeVisible();
});

test('math unit chooser places vertical only under geometry and opens the playable game',async({page})=>{
 await waitForLiveBuild();await page.goto(pageURL('math.html?adminTest=1'));
 const units=page.locator('#mathCards .unit-card a');await expect(units).toHaveCount(2);await expect(units.nth(0)).toContainText('計算のきまり');await expect(units.nth(1)).toContainText('四角形・垂直と平行');
 await units.nth(1).click();await expect(page).toHaveURL(/math-geometry\.html/);await expect(page.locator('[data-game-card="suichoku"]')).toHaveCount(1);
 const play=page.locator('[data-game-card="suichoku"] [data-game-play]');await expect(play).toBeEnabled({timeout:10000});await play.click();await expect(page).toHaveURL(/games\/suichoku\.html/);await expect(page.locator('#choices button')).toHaveCount(5);
 await page.goto(pageURL('math-calculation.html?adminTest=1'));await expect(page.locator('[data-game-card="suichoku"]')).toHaveCount(0);
});

test('iPad landscape geometry card stays compact and opens the shared ranking',async({page})=>{
 await page.setViewportSize({width:1194,height:834});await page.goto(pageURL('math-geometry.html?adminTest=1'));
 const card=page.locator('[data-game-card="suichoku"]'),rank=card.locator('[data-game-ranking]');await expect(card).toBeVisible();await expect(rank).toHaveAttribute('href',/ranking\.html\?game=suichoku/);
 const size=await card.boundingBox();expect(size.height).toBeLessThan(220);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight)).toBe(true);
});
