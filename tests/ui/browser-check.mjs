import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const out='.local/ui-01'; mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  for (const [name,width,height] of [['desktop',1440,900],['mobile',375,812]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5174/src/ui/fixture.html');
    await page.locator('canvas').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} horizontal overflow`);
    await page.getByRole('button',{name:'Cooling 01 cooling'}).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('heading',{name:'Cooling 01'}).count(),1);
    assert.equal(await page.getByText('not_ready').count(),1);
    assert.equal(await page.getByRole('button',{name:'Dispatch inspect'}).isDisabled(),true);
    await page.getByLabel('Technician').selectOption('alex');
    await page.getByRole('button',{name:'Dispatch inspect'}).click();
    assert.match(await page.locator('body').innerText(),/Intent .*"action":"inspect".*"technicianId":"alex"/);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
    console.log(`${name}: selection, observed evidence, dispatch, no overflow, no page errors`);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:960,height:500},deviceScaleFactor:1});
  await page.setContent(`<html><head><style>body{background:#102332;color:#dceaf2;font:16px sans-serif}main{display:flex;gap:36px}section{display:grid;gap:14px;align-content:start}img{image-rendering:pixelated}div{height:100px;display:flex;align-items:start;gap:24px}</style></head><body><h1>Authored masters: native and 3x</h1><main>${['floor-wall','rack','technician','cooling'].map(n=>`<section><h2>${n}</h2><div><img src="http://127.0.0.1:5174/assets/${n}.png"><img src="http://127.0.0.1:5174/assets/${n}.png" style="width:${{ 'floor-wall':96,rack:48,technician:36,cooling:96}[n]}px"></div></section>`).join('')}</main></body></html>`);
  await page.locator('img').last().evaluate(e=>e.decode());
  const dimensions=await page.locator('img').evaluateAll(imgs=>imgs.filter((_,i)=>i%2===0).map(i=>[i.naturalWidth,i.naturalHeight]));
  assert.deepEqual(dimensions,[[32,16],[16,32],[12,16],[32,32]]);
  await page.screenshot({path:`${out}/masters-native-3x.png`});
  console.log('masters: four PNG dimensions and native/3x capture');
  await page.close();
} finally { await browser.close(); }
