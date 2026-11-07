import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const out='.local/ui-01'; mkdirSync(out,{recursive:true});
const origin=process.env.UI_FIXTURE_ORIGIN??'http://127.0.0.1:5174';
const failures=[];
async function check(name,run) { try { await run(); console.log(`${name}: passed`); } catch(error) { failures.push(`${name}: ${error.message}`); } }
const browser=await chromium.launch({headless:true});
try {
  for (const [name,width,height] of [['desktop',1440,900],['mobile',375,812]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto(`${origin}/src/ui/fixture.html`);
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
  await page.setContent(`<html><head><style>body{background:#102332;color:#dceaf2;font:16px sans-serif}main{display:flex;gap:36px}section{display:grid;gap:14px;align-content:start}img{image-rendering:pixelated}div{height:100px;display:flex;align-items:start;gap:24px}</style></head><body><h1>Authored masters: native and 3x</h1><main>${['floor-wall','rack','technician','cooling'].map(n=>`<section><h2>${n}</h2><div><img src="${origin}/assets/${n}.png"><img src="${origin}/assets/${n}.png" style="width:${{ 'floor-wall':96,rack:48,technician:36,cooling:96}[n]}px"></div></section>`).join('')}</main></body></html>`);
  await page.locator('img').last().evaluate(e=>e.decode());
  const dimensions=await page.locator('img').evaluateAll(imgs=>imgs.filter((_,i)=>i%2===0).map(i=>[i.naturalWidth,i.naturalHeight]));
  assert.deepEqual(dimensions,[[32,16],[16,32],[12,16],[32,32]]);
  await page.screenshot({path:`${out}/masters-native-3x.png`});
  console.log('masters: four PNG dimensions and native/3x capture');
  await page.close();
  await check('Global actions remain reachable with original site target',async()=>{
    const p=await browser.newPage();
    try {
      await p.goto(`${origin}/src/ui/fixture.html?case=site`);
      for(const action of ['pause batch','resume batch','set batch ceiling','verify recovery']) assert.equal(await p.getByRole('button',{name:`Dispatch ${action}`,exact:true}).count(),1);
      await p.getByRole('button',{name:'Dispatch pause batch',exact:true}).click();
      assert.match(await p.locator('body').innerText(),/Intent .*"action":"pause_batch".*"targetId":"site"/);
    } finally { await p.close(); }
  });
  await check('Scene redraw destroys old objects and keeps input zones bounded',async()=>{
    const p=await browser.newPage();
    try {
      const sceneResponse=p.waitForResponse(response=>new URL(response.url()).pathname==='/src/game/FacilityScene.ts');
      await p.goto(`${origin}/src/ui/fixture.html`); await p.locator('canvas').waitFor();
      const sceneUrl=(await sceneResponse).url();
      await p.evaluate(async url=>{ const {FacilityScene}=await import(url); const original=FacilityScene.prototype.setView; FacilityScene.prototype.setView=function(view){ window.reviewScene=this; return original.call(this,view); }; },sceneUrl);
      await p.getByRole('button',{name:'Cooling 01 cooling'}).click();
      await p.waitForFunction(()=>Boolean(window.reviewScene));
      const counts=await p.evaluate(async()=>{
        const scene=window.reviewScene; await new Promise(requestAnimationFrame);
        const oldZone=scene.children.getChildren().find(child=>child.type==='Zone');
        for(let i=0;i<20;i++) scene.setView(scene.state);
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return {registered:scene.input._list.length,displayed:scene.children.getChildren().filter(child=>child.type==='Zone').length,oldRetained:Boolean(oldZone.scene)};
      });
      assert.equal(counts.registered,counts.displayed); assert.equal(counts.oldRetained,false);
    } finally { await p.close(); }
  });
  await check('Terminal view blocks gameplay dispatch and coworker calls',async()=>{
    const p=await browser.newPage();
    try {
      await p.goto(`${origin}/src/ui/fixture.html?case=terminal`);
      await p.getByRole('button',{name:'Cooling 01 cooling'}).click(); await p.getByLabel('Technician').selectOption('alex');
      assert.equal(await p.getByRole('button',{name:'Dispatch inspect'}).isDisabled(),true);
      await p.getByLabel('Recipient').selectOption('alex'); await p.getByLabel('Message',{exact:true}).fill('Inspect the evidence');
      assert.equal(await p.getByRole('button',{name:'Send message',exact:true}).isDisabled(),true);
    } finally { await p.close(); }
  });
  await check('Cancellation cannot dispatch an obsolete selected task',async()=>{
    const p=await browser.newPage();
    try {
      await p.goto(`${origin}/src/ui/fixture.html?case=cancel`);
      await p.getByRole('button',{name:'Cooling 01 cooling'}).click(); await p.getByRole('combobox',{name:/^Task/}).selectOption('task-fixture');
      assert.equal(await p.getByRole('button',{name:'Dispatch cancel task'}).isDisabled(),false);
      await p.getByRole('button',{name:'Complete fixture task'}).click();
      assert.equal(await p.getByRole('button',{name:'Dispatch cancel task'}).isDisabled(),true);
    } finally { await p.close(); }
  });
  assert.deepEqual(failures,[]);
} finally { await browser.close(); }
