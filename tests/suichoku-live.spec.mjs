import {test,expect} from '@playwright/test';

const baseURL=process.env.MGL_BASE_URL||'http://127.0.0.1:4173/';
const pageURL=(path)=>new URL(path,baseURL).href;

async function waitForLiveBuild(){
 if(process.env.MGL_EXPECT_LIVE!=='1')return;
 for(let attempt=0;attempt<36;attempt++){
  try{const response=await fetch(pageURL(`games/suichoku.html?release-check=${Date.now()}`));if(response.ok&&(await response.text()).includes('suichoku-live-fix-20261103'))return}catch{}
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

test('math unit chooser places vertical only under geometry and opens the playable game',async({page})=>{
 await waitForLiveBuild();await page.goto(pageURL('math.html?adminTest=1'));
 const units=page.locator('#mathCards .unit-card a');await expect(units).toHaveCount(2);await expect(units.nth(0)).toContainText('計算のきまり');await expect(units.nth(1)).toContainText('四角形・垂直と平行');
 await units.nth(1).click();await expect(page).toHaveURL(/math-geometry\.html/);await expect(page.locator('[data-game-card="suichoku"]')).toHaveCount(1);
 const play=page.locator('[data-game-card="suichoku"] [data-game-play]');await expect(play).toBeEnabled({timeout:10000});await play.click();await expect(page).toHaveURL(/games\/suichoku\.html/);await expect(page.locator('#choices button')).toHaveCount(5);
 await page.goto(pageURL('math-calculation.html?adminTest=1'));await expect(page.locator('[data-game-card="suichoku"]')).toHaveCount(0);
});
