import { expect, test } from '@playwright/test';
import { mockPublicVisibility } from './fixtures/public-visibility-browser.mjs';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
const production = process.env.MGL_SHIKAKKE_PRODUCTION === '1';
const prefix = production ? '' : 'preview/';
const game = prefix + 'games/shikakkeSecrets.html';
const viewports = [{ width: 1024, height: 768 }, { width: 1194, height: 834 }, { width: 960, height: 540 }];
const url = path => new URL(path,base).href;

test.use({hasTouch:true,isMobile:true});
test.beforeEach(async ({ page })=>{
  await page.route('https://**/*', route=>route.abort());
  if (production) await mockPublicVisibility(page, { shikakkeSecrets:'published' });
  await page.addInitScript(isProduction=>{
    const scope=isProduction?'':'manabi_public_preview:';
    localStorage.setItem(scope+'mgl_nickname','四角形テスト');
    localStorage.setItem(scope+'mgl_quadrilateral','{"best":37}');
  },production);
});

test('math listing and iPad landscape show five labeled, unmarked shapes without scrolling', async ({ page })=>{
  await page.setViewportSize(viewports[0]);
  await page.goto(url(prefix + 'math-geometry.html'));
  const card=page.locator('[data-game-card="shikakkeSecrets"]');
  await card.getByRole('button',{name:'プレイ',exact:true}).tap();
  await expect(page).toHaveURL(url(game));
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    const shapes=page.locator('#shapes button');
    await expect(shapes).toHaveText(['平行四辺形','台形','ひし形','正方形','長方形']);
    await expect(page.locator('#shapes polygon')).toHaveCount(5);
    await expect(page.locator('#shapes line,#shapes path')).toHaveCount(0);
    await expect(page.locator('#question')).toContainText('必ず');
    for(const loc of [...await shapes.all(),page.locator('#confirm'),page.locator('#tower')]){
      await expect(loc).toBeInViewport({ratio:1});
      const box=await loc.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]))
      .toEqual([viewport.width,viewport.height]);
  }
});

test('touch retry, five full-size award PNGs, points and the 120-second timer work', async ({ page })=>{
  test.setTimeout(120000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(viewports[0]);
  await page.clock.install();
  await page.goto(url(game));
  const confirm=page.locator('#confirm');
  const question=page.locator('#question');
  const choice=id=>page.locator(`[data-shape="${id}"]`);
  const answer=()=>question.evaluate(q=>window.ManabiEconomyCore.shikakkeQuestions.find(x=>x.text===q.textContent).answers);
  const before=await question.textContent();
  const answers=await answer();
  const wrong=['rectangle','rhombus','trapezoid','square'].find(id=>!answers.includes(id));
  await expect(confirm).toBeDisabled();
  await choice(wrong).tap();
  await expect(choice(wrong)).toHaveAttribute('aria-pressed','true');
  await expect(choice(wrong)).toHaveCSS('background-color','rgb(255, 223, 159)');
  await choice(wrong).tap();
  await expect(confirm).toBeDisabled();
  await choice(wrong).tap();
  await confirm.tap();
  await expect(page.locator('#hint')).toContainText('同じ問題');
  await expect(question).toHaveText(before);
  await expect(page.locator('#points')).toHaveText('0');
  const submit=async ()=>{
    for(const id of await answer())await choice(id).tap();
    await confirm.tap();
  };
  const awarded=new Set();
  for(let n=1;n<=25;n++) {
    const previous=await question.textContent();
    await submit();
    await expect(page.locator('#practice-best')).toHaveText(String(n));
    await expect(page.locator('#points')).toHaveText(String(n));
    if([3,5,10,15,25].includes(n)) {
      const badge=page.locator('.mgl-celebration--title .mgl-celebration__art img');
      await expect(badge).toHaveAttribute('src',/_1254\.png$/);
      const asset=await badge.evaluate(async img=>{await img.decode();return [img.getAttribute('src'),img.naturalWidth];});
      awarded.add(asset[0]);
      expect(asset[1]).toBe(1254);
    }
    if(n<25) await expect(question).not.toHaveText(previous);
  }
  expect(awarded.size).toBe(5);
  await expect(page.locator('#tower .earned')).toHaveCount(5);
  for(const badge of await page.locator('#tower img').all()){
    expect(await badge.evaluate(async img=>{await img.decode();return img.naturalWidth;})).toBe(512);
  }
  const start=page.locator('#challenge-start');
  await expect(start).toBeVisible();
  await page.clock.fastForward(120000);
  await expect(start).toBeVisible();
  await start.tap();
  await expect(page.locator('#clock')).toHaveText(/残り (2:00|1:59)/);
  await submit();
  await expect(page.locator('#challenge-best')).toHaveText('26');
  await page.reload();
  await expect(page.locator('#challenge-best')).toHaveText('26');
  await expect(page.locator('#points')).toHaveText('26');
  expect(await page.evaluate(isProduction=>localStorage.getItem((isProduction?'':'manabi_public_preview:')+'mgl_quadrilateral'),production)).toBe('{"best":37}');
  await page.clock.fastForward(120000);
  await expect(page.locator('#challenge-message')).toContainText('時間切れ');
  expect(errors).toEqual([]);
});
