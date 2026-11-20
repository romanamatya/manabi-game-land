import { expect, test } from '@playwright/test';
import { mockPublicVisibility } from './fixtures/public-visibility-browser.mjs';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
const production = process.env.MGL_HEIKOU_PAIR_PRODUCTION === '1';
const prefix = production ? '' : 'preview/';
const game = new URL(prefix + 'games/heikouPair.html', base).href;
const viewports = [{width:1024,height:768},{width:1194,height:834},{width:960,height:540}];
const titles = new Map([[3,'01_rookie'],[5,'02_hunter'],[10,'03_master'],[15,'04_tatsujin'],[25,'05_haou']]);
test.use({hasTouch:true,isMobile:true});
test.beforeEach(async ({page}) => {
  await page.route('https://**/*', route=>route.abort());
  if (production) await mockPublicVisibility(page, { heikouPair: null });
  await page.addInitScript(scope=>{
    localStorage.setItem(scope+'mgl_nickname','図形テスト');
    localStorage.setItem(scope+'mgl_profile','{"icon":"rabbit"}');
    if (!scope && !sessionStorage.getItem('heikou-pair-fixture')) {
      sessionStorage.setItem('heikou-pair-fixture','1');
      localStorage.setItem('mgl_parallelPair','{"best":23}');
      localStorage.setItem('mgl_points','7');
    }
  },production ? '' : 'manabi_public_preview:');
});

async function drawing(page) {
  return page.locator('#diagram svg').evaluate(svg=>{
    const coords=line=>['x1','y1','x2','y2'].map(key=>Number(line.getAttribute(key)));
    const candidates=Array.from(svg.querySelectorAll('.hp-line'),coords);
    const vector=([x1,y1,x2,y2])=>[x2-x1,y2-y1];
    const answer=[];
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
      const a=vector(candidates[i]),b=vector(candidates[j]);
      if(Math.abs(a[0]*b[1]-a[1]*b[0])<1e-6)answer.push(i,j);
    }
    const headings=candidates.map(line=>{
      const [x,y]=vector(line);
      return Math.atan2(y,x)*180/Math.PI;
    });
    const spread=Math.max(...headings)-Math.min(...headings);
    const values=Array.from(svg.querySelectorAll('.hp-angle'), label=>Number.parseInt(label.textContent,10));
    const matrix=svg.getScreenCTM();
    const at=(x,y)=>{
      const point=new DOMPoint(x,y).matrixTransform(matrix);
      return {x:point.x,y:point.y};
    };
    const target=candidates.map(([x1,y1,x2,y2])=>at(.82*x1+.18*x2,.82*y1+.18*y2));
    const crossings=candidates.map(([x1,y1,x2,y2])=>at((x1+x2)/2,(y1+y2)/2));
    return {answer,target,crossings,spread,values,signature:svg.innerHTML.replaceAll(/ aria-(?:pressed|disabled)="[^"]+"/g,'')};
  });
}
async function submit(page, geometry, indexes=geometry.answer) {
  for(const i of indexes)await page.touchscreen.tap(geometry.target[i].x,geometry.target[i].y);
  await page.locator('#confirm').tap();
}

test('the new math route and all visual elements fit three landscape WebKit viewports', async ({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(viewports[0]);
  await page.goto(new URL(prefix+'index.html',base).href);
  await page.locator('a[href="math.html"]').click();
  await page.getByRole('link',{name:/四角形・垂直と平行/}).click();
  const card=page.locator('[data-game-card="heikouPair"]');
  await expect(card.getByText('NEW',{exact:true})).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(card.getByRole('link',{name:'ランキング'})).toHaveCount(0);
  await card.getByRole('button',{name:'プレイ',exact:true}).click();
  await expect(page).toHaveURL(game);
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    for(const id of ['diagram','level','confirm','points','challenge-best','tower','player']){
      await expect(page.locator('#'+id)).toBeInViewport({ratio:1});
    }
    expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]))
      .toEqual([viewport.width,viewport.height]);
    const confirm=page.getByRole('button',{name:'決定！',exact:true});
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveCSS('min-width','220px');
    await expect(confirm).toHaveCSS('min-height',viewport.height<=580 ? '44px' : '54px');
    await expect(confirm).toHaveCSS('font-size',viewport.height<=580 ? '22px' : '25px');
    await expect(confirm).toHaveCSS('background-color','rgb(201, 214, 230)');
    const button=await confirm.boundingBox();
    const hint=await page.locator('#hint').boundingBox();
    const diagram=await page.locator('#diagram').boundingBox();
    expect(hint.x+hint.width).toBeLessThanOrEqual(button.x);
    expect(diagram.y+diagram.height).toBeLessThanOrEqual(button.y);
    await expect(page.locator('.hp-angle')).toHaveCount(4);
    await expect(page.locator('.hp-letter')).toHaveText([...'ABCD']);
    for(const img of await page.locator('#tower img').all()){
      await expect(img).toBeInViewport({ratio:1});
      expect(await img.evaluate(async img=>{
        await img.decode();return [img.naturalWidth,img.naturalHeight,getComputedStyle(img).objectFit];
      })).toEqual([512,512,'contain']);
    }
    const collision=await page.locator('#diagram svg').evaluate(svg=>{
      const boxes=Array.from(svg.querySelectorAll('text'),item=>item.getBBox());
      return boxes.some((a,i)=>a.x<0||a.y<0||a.x+a.width>880||a.y+a.height>430||
        boxes.slice(i+1).some(b=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height));
    });
    expect(collision).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('touch selection, retry, all title images and timed play persist in the browser', async ({page})=>{
  test.setTimeout(100000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(viewports[0]);
  await page.clock.install();
  await page.goto(game);
  const confirm=page.locator('#confirm'),selected=page.locator('[data-line][aria-pressed="true"]');
  const q=await drawing(page);
  expect(q.answer).toHaveLength(2);
  for(const p of q.crossings)await page.touchscreen.tap(p.x,p.y);
  await expect(selected).toHaveCount(0);
  const first=q.target[q.answer[0]];
  await page.touchscreen.tap(first.x,first.y);
  await expect(selected).toHaveCount(1);
  await expect(selected.locator('line')).toHaveCSS('stroke','rgb(190, 80, 0)');
  await expect(confirm).toBeDisabled();
  await page.touchscreen.tap(first.x,first.y);
  await expect(selected).toHaveCount(0);
  for(const i of [q.answer[0],[0,1,2,3].find(i=>!q.answer.includes(i))]){
    await page.touchscreen.tap(q.target[i].x,q.target[i].y);
  }
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveCSS('background-color','rgb(66, 107, 217)');
  await expect(confirm).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(confirm).toHaveCSS('border-radius','12px');
  await expect(confirm).toHaveCSS('font-weight','850');
  await expect(confirm).toHaveCSS('box-shadow','rgb(41, 78, 174) 0px 4px 0px 0px');
  await confirm.tap();
  await expect(page.locator('#hint')).toContainText('同じ図');
  expect((await drawing(page)).signature).toBe(q.signature);
  const initialPoints=production ? 7 : 0;
  await expect(page.locator('#points')).toHaveText(String(initialPoints));
  for(let n=1;n<=25;n++){
    await expect(page.locator('[data-line][aria-disabled="false"]')).toHaveCount(4);
    if(n<=4) await expect(page.locator('#level')).toHaveText(['初級','中級','中級','上級'][n-1]);
    const next=await drawing(page);
    expect(next.spread).toBeLessThanOrEqual(8.000001);
    expect(new Set(next.values).size).toBe(4);
    expect(next.values.filter((value,i)=>next.values.slice(i+1).includes(180-value))).toHaveLength(2);
    await submit(page,next);
    await expect(page.locator('#practice-best')).toHaveText(String(n));
    await expect(page.locator('#points')).toHaveText(String(initialPoints+n));
    if(titles.has(n)){
      const badge=page.locator('.mgl-celebration--title .mgl-celebration__art img');
      await expect(badge).toHaveAttribute('src',new RegExp(titles.get(n)+'_512\\.png$'));
      expect(await badge.evaluate(async img=>{await img.decode();return img.naturalWidth;})).toBe(512);
    }
  }
  const start=page.locator('#challenge-start');
  await expect(start).toBeVisible();
  await expect(page.locator('#tower .earned')).toHaveCount(5);
  await page.clock.fastForward(120000);
  await expect(start).toHaveText('120秒チャレンジを始める');
  await start.tap();
  await expect(page.locator('#clock')).toHaveText(/残り (2:00|1:59)/);
  await submit(page,await drawing(page));
  await expect(page.locator('#challenge-best')).toHaveText('26');
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+5000)));
  await page.reload();
  await expect(page.locator('#practice-best')).toHaveText('25');
  await expect(page.locator('#challenge-best')).toHaveText('26');
  await expect(page.locator('#points')).toHaveText(String(initialPoints+26));
  if (production) expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mgl_parallelPair')).best)).toBe(23);
  await expect(page.locator('#clock')).toContainText('残り');
  await page.clock.fastForward(120000);
  await expect(page.locator('#challenge-message')).toContainText('時間切れ');
  expect(errors).toEqual([]);
});
