import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const origin = process.env.CONVERSATION_FIXTURE_ORIGIN ?? 'http://127.0.0.1:5184';
const out = '.local/conversation-ui'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true }), results = [], failures = [];
const check = async (name, run) => { if(process.env.CONV_CHECK_FILTER && !name.includes(process.env.CONV_CHECK_FILTER)) return; try { results.push({ name, status: 'passed', detail: await run() }); console.log(`PASS ${name}`); } catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); } };
const settle = page => page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
async function open(width = 1280, height = 720, query = '') {
  const page = await browser.newPage({ viewport: { width, height } }); page.errors = []; page.requests = [];
  page.on('pageerror', error => page.errors.push(error.message)); page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) page.requests.push(request.url()); });
  await page.goto(`${origin}/src/ui/conversation/fixture.html${query}`); await page.locator('canvas').waitFor({ state:'attached' }); await page.evaluate(() => document.fonts.ready); await settle(page); return page;
}
async function noOverflow(page, context) {
  await settle(page);
  const problems = await page.evaluate(() => {
    const found = [];
    if (document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight) found.push('document');
    for (const e of document.querySelectorAll('.conv-game *')) {
      const style = getComputedStyle(e), r = e.getBoundingClientRect();
      if (style.visibility === 'hidden' || style.display === 'none' || !r.width || !r.height || e.closest('[aria-hidden=true]') || ['svg', 'path', 'CANVAS', 'OPTION'].includes(e.tagName)) continue;
      // A single-line input intentionally exposes its full retained draft through Expand.
      if (e.tagName !== 'INPUT' && (e.clientWidth && e.scrollWidth > e.clientWidth + 1 || e.clientHeight && e.scrollHeight > e.clientHeight + 1)) found.push(`${e.tagName}.${e.className}: ${e.scrollWidth}x${e.scrollHeight}/${e.clientWidth}x${e.clientHeight}`);
      if (['BUTTON', 'TEXTAREA', 'INPUT', 'SELECT'].includes(e.tagName) && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) found.push(`offscreen ${e.textContent}`);
    }
    return found;
  });
  assert.deepEqual(problems, [], context); assert.deepEqual(page.errors, [], `${context}: runtime errors`); assert.deepEqual(page.requests, [], `${context}: no provider/engine calls`);
}
async function readPages(page, label) {
  const previous = page.getByRole('button', { name: `Previous ${label.toLowerCase()} page`, exact: true });
  while (await previous.isEnabled()) await previous.click();
  const chunks = [], next = page.getByRole('button', { name: `Next ${label.toLowerCase()} page`, exact: true });
  for (let i = 0; i < 200; i++) { await settle(page); chunks.push(label === 'Draft' ? await page.getByLabel('Message', { exact: true }).inputValue() : await page.locator('.conv-reader .blackout-page-copy:not(.blackout-measure)').textContent()); await noOverflow(page, `${label} page ${i}`); if (!(await next.isEnabled())) return chunks.join(''); await next.click(); }
  throw new Error('Unexpectedly many text pages');
}
try {
  await check('fixed controls, identities and no overflow at required desktop and enlarged geometry', async () => {
    const sizes = [[1280,720],[1366,768],[1920,1080],[640,360]];
    for (const [width,height] of sizes) {
      const page = await open(width,height); await noOverflow(page, `${width}x${height}`);
      assert.equal(await page.getByRole('tab').count(), 3); assert.equal(await page.getByRole('button', { name: 'Send to Alex', exact: true }).isVisible(), true);
      if (width > 960) assert.equal((await page.locator('.conv-sidebar').boundingBox()).width, 360);
      await page.screenshot({ path: `${out}/layout-${width}x${height}.png` });
      await page.getByRole('button', { name: 'Read report', exact: true }).click(); await noOverflow(page, `reader ${width}`);
      await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.getByRole('button', { name: 'Expand draft', exact: true }).click(); await noOverflow(page, `editor ${width}`);
      await page.getByRole('button', { name: 'Back to conversation', exact: true }).click();
      await page.evaluate(() => window.convFixture.setThreads(current => current.map(t => t.actorId === 'alex' ? { ...t, assignment: { taskId: 'task-a', label: 'Walking to Cooling control', status: 'walking' } } : t)));
      await noOverflow(page, `busy ${width}`);
      if (width === 640) { await page.getByRole('button', { name: 'World', exact: true }).click(); await noOverflow(page, 'enlarged world'); await page.getByRole('button', { name: 'Conversation', exact: true }).click(); }
      await page.close();
    }
    return sizes;
  });
  await check('whole-entry history beyond eight entries and lossless section reader', async () => {
    const page = await open(); const collected = new Set();
    for (let i = 0; i < 30; i++) { await settle(page); for (const id of await page.locator('.conv-history-window > .conv-entry').evaluateAll(entries => entries.map(e => e.dataset.entryId))) collected.add(id); if (!(await page.getByRole('button', { name: 'Older messages', exact: true }).isEnabled())) break; await page.getByRole('button', { name: 'Older messages', exact: true }).click(); }
    assert.equal(collected.size, 15); assert.ok(collected.has('alex-0'));
    while (await page.getByRole('button', { name: 'Newer messages', exact: true }).isEnabled()) await page.getByRole('button', { name: 'Newer messages', exact: true }).click();
    await page.getByRole('button', { name: 'Read report', exact: true }).click(); assert.equal(await readPages(page, 'Message text'), await page.evaluate(() => window.convFixture.longText));
    await page.getByLabel('Section', { exact: true }).selectOption('1'); assert.equal(await readPages(page, 'Message text'), 'Synthetic evidence.\n'.repeat(30)); await page.close(); return { wholeEntries: collected.size, fullText: 'exact', sections: 'exact' };
  });
  await check('per-character drafts, history anchor, late unread and selected-character busy', async () => {
    const page = await open(); await page.getByLabel('Message Alex', { exact: true }).fill('Alex retained draft');
    await page.getByRole('button', { name: 'Older messages', exact: true }).click(); const anchor = await page.locator('.conv-history-window > .conv-entry').first().getAttribute('data-entry-id');
    await page.getByRole('tab', { name: 'Sam · IT', exact: true }).click(); await page.getByLabel('Message Sam', { exact: true }).fill('Sam retained draft');
    await page.evaluate(() => window.convFixture.setThreads(current => current.map(t => t.actorId === 'alex' ? { ...t, busy: true, unread: 1, entries: [...t.entries, { id: 'late-alex', actorId: 'alex', at: 80, kind: 'live', text: 'Alex late reply.', unread: true }] } : t)));
    await settle(page); assert.equal(await page.getByRole('tab', { name: 'Sam · IT', exact: true }).getAttribute('aria-selected'), 'true'); assert.equal(await page.getByRole('button', { name: 'Send to Sam', exact: true }).isEnabled(), true); assert.equal(await page.getByRole('tab', { name: 'Alex · Cooling · 1 unread', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Send to Sam', exact: true }).click(); assert.deepEqual(await page.evaluate(() => window.convFixture.events.filter(e => e.name === 'send')), [{ name: 'send', args: ['sam'] }]);
    await page.getByRole('tab', { name: 'Alex · Cooling · 1 unread', exact: true }).click(); assert.equal(await page.getByLabel('Message Alex', { exact: true }).inputValue(), 'Alex retained draft'); assert.equal(await page.getByRole('button', { name: 'Send to Alex', exact: true }).isEnabled(), false); assert.ok((await page.locator('.conv-history-window > .conv-entry').evaluateAll(entries => entries.map(e => e.dataset.entryId))).includes(anchor)); await page.close(); return { actorCapture: true, retainedAnchor: anchor };
  });
  await check('1600-character measured draft remains lossless across resize and recipients', async () => {
    const page = await open(), text = ('Spacing  α🙂\n' + 'x'.repeat(71)).repeat(30).slice(0,1600); await page.getByLabel('Message Alex', { exact: true }).fill(text); if(await page.getByRole('button', { name: 'Expand draft', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand draft', exact: true }).click(); assert.equal(await readPages(page,'Draft'), text);
    await page.setViewportSize({ width:640,height:360 }); assert.equal(await readPages(page,'Draft'),text); await page.getByRole('button', { name: 'Back to conversation', exact: true }).click(); await page.getByRole('tab', { name:'Sam · IT',exact:true }).click(); await page.getByRole('tab', { name:'Alex · Cooling',exact:true }).click(); assert.equal(await readPages(page,'Draft'),text); await noOverflow(page,'retained draft'); await page.close(); return { characters:text.length, exact:true };
  });
  await check('suggestions and proposals submit exact IDs; rejected and accepted proposals never execute', async () => {
    const page = await open(); await page.getByRole('button',{name:'Check cooling controls',exact:true}).click();
    await page.evaluate(() => window.convFixture.setThreads(current => current.map(t => t.actorId==='alex' ? {...t,entries:[{id:'proposal-entry',actorId:'alex',at:80,kind:'live',text:'I can inspect the controls.',summary:'I can inspect the controls.',sections:[{id:'evidence',label:'Evidence and provenance',text:'Synthetic retained evidence.'}],unread:false,proposals:[{id:'opaque-original-token',label:'Check controls',assignedName:'Jules',status:'ready'}]}]}:t)));
    await settle(page);
    assert.equal(await page.getByRole('button',{name:'Read full message',exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'Check controls · Jules',exact:true}).click();
    await page.setViewportSize({width:640,height:360}); await noOverflow(page,'inline proposal plus evidence reader at enlarged geometry'); assert.equal(await page.getByRole('button',{name:'Check controls · Jules',exact:true}).isVisible(),true);
    for (const status of ['rejected','accepted','sending']) { await page.evaluate(status => window.convFixture.setThreads(current => current.map(t=>t.actorId==='alex'?{...t,entries:t.entries.map(e=>({...e,proposals:e.proposals.map(p=>({...p,status,reason:'Host state'}))}))}:t)),status); await settle(page); assert.equal(await page.getByRole('button',{name:'Check controls · Jules',exact:true}).isEnabled(),false); await noOverflow(page,`proposal ${status} at enlarged geometry`); }
    const calls = await page.evaluate(()=>window.convFixture.events.filter(e=>['proposal','suggestion'].includes(e.name))); assert.deepEqual(calls,[{name:'suggestion',args:['alex-inspect']},{name:'proposal',args:['opaque-original-token']}]); await page.close(); return calls;
  });
  await check('multiple inline proposals stay reachable beside evidence without an authorization modal',async()=>{
    const page=await open(640,360); await page.evaluate(()=>window.convFixture.setThreads(current=>current.map(t=>t.actorId==='alex'?{...t,entries:[{id:'three-proposals',actorId:'alex',at:80,kind:'live',text:'I can check the controls.',summary:'I can check the controls.',sections:[{id:'evidence',label:'Evidence',text:'Synthetic permitted evidence.'}],unread:false,proposals:['Alex','Jules','Sam'].map((assignedName,i)=>({id:`original-${i}`,label:'Check controls',assignedName,status:'ready'}))}]}:t)));
    for(const name of ['Alex','Jules','Sam']) { await settle(page); await noOverflow(page,`multiple proposals ${name}`); await page.getByRole('button',{name:`Check controls · ${name}`,exact:true}).click(); if(name!=='Sam')await page.getByRole('button',{name:'Next proposal',exact:true}).click(); }
    assert.deepEqual(await page.evaluate(()=>window.convFixture.events.filter(e=>e.name==='proposal').map(e=>e.args)),[['original-0'],['original-1'],['original-2']]); await page.getByRole('button',{name:'Read full message',exact:true}).click(); await noOverflow(page,'three proposal reader');await page.close();return {inline:3,modal:false};
  });
  await check('IME and ordinary Enter preserve drafts; explicit send captures the current actor',async()=>{
    const page=await open(),field=page.getByLabel('Message Alex',{exact:true});await field.fill('Draft');await field.dispatchEvent('compositionstart',{data:'文'});await field.dispatchEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true});assert.equal(await page.evaluate(()=>window.convFixture.events.filter(e=>e.name==='send').length),0);await field.dispatchEvent('compositionend',{data:'文'});await field.press('Enter');await settle(page);assert.equal(await page.evaluate(()=>window.convFixture.threads.find(t=>t.actorId==='alex').draft),'Draft\n');assert.equal(await page.evaluate(()=>window.convFixture.events.filter(e=>e.name==='send').length),0);await page.getByRole('button',{name:'Send to Alex',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.convFixture.events.filter(e=>e.name==='send').map(e=>e.args)),[['alex']]);await page.close();return {syntheticComposition:true,newlines:'exact',sendActor:'alex'};
  });
  await check('busy Wait and Stop retain exact actor/task; terminal and reset remain host controlled', async () => {
    const page = await open();
    for (const status of ['walking','checking','working','report_pending','delivered']) { await page.evaluate(status => window.convFixture.setThreads(current=>current.map(t=>t.actorId==='alex'?{...t,assignment:{taskId:'task-original',label:'Accepted host task',status}}:t)),status); await noOverflow(page,`status ${status}`); }
    await page.evaluate(()=>window.convFixture.setThreads(current=>current.map(t=>t.actorId==='alex'?{...t,assignment:{taskId:'task-replacement',label:'Accepted replacement',status:'working'}}:t))); await page.getByRole('button',{name:'Wait',exact:true}).click(); await page.getByRole('button',{name:'Stop current task',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.convFixture.events.filter(e=>['wait','stop'].includes(e.name))),[{name:'wait',args:['alex']},{name:'stop',args:['alex','task-replacement']}]);
    await page.evaluate(()=>window.convFixture.setView(current=>({...current,mission:{...current.mission,status:'success'}}))); await settle(page); assert.equal(await page.getByRole('button',{name:'Check cooling controls',exact:true}).isEnabled(),false); assert.equal(await page.getByRole('button',{name:'Stop current task',exact:true}).isEnabled(),false);
    await page.evaluate(()=>{window.convFixture.setView(current=>({...current,runId:'reset-fixture',mission:{...current.mission,status:'running'}}));window.convFixture.setThreads(current=>current.map(t=>({...t,draft:'',entries:[],busy:false,unread:0,assignment:{taskId:null,label:'Ready',status:'ready'}})));}); await noOverflow(page,'reset'); assert.equal(await page.getByLabel('Message Alex',{exact:true}).inputValue(),''); await page.close(); return { states:5, reset:'host props only' };
  });
  await check('display-only scene rejects movement, selects known equipment and retains objects/listeners', async () => {
    const page = await open(); const initial = await page.evaluate(()=>{const scene=window.convFixture.scene(); window.sceneOriginalObjects=scene.children.list.slice(); return scene.diagnostics();}); assert.equal(initial.commanderVisible,false); assert.equal(initial.displayOnly,true); assert.equal(initial.atlas,true);
    for (const key of ['w','a','s','d','e','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']) await page.keyboard.press(key);
    await page.evaluate(()=>{const scene=window.convFixture.scene(); scene.focusWorld(true); for(const key of ['w','e','ArrowDown'])scene.handleKey(key,true);scene.nudge('n');scene.inspectNearby();for(let i=0;i<100;i++)scene.setView({...scene.state,view:{...scene.state.view,simTime:80+i}}); scene.update(0,100);});
    await page.locator('canvas').click({position:{x:10,y:10}}); const box=await page.locator('canvas').boundingBox(),scale=box.width/320;
    await page.locator('canvas').click({position:{x:(6*16+8)*scale,y:(9*16+8)*scale}}); await settle(page);
    const after=await page.evaluate(()=>({diag:window.convFixture.scene().diagnostics(),same:window.sceneOriginalObjects.every((object,i)=>object===window.convFixture.scene().children.list[i]),events:window.convFixture.events})); assert.equal(after.same,true); assert.equal(after.diag.objects,initial.objects);assert.equal(after.diag.pointerListeners,1);assert.deepEqual(after.diag.position,initial.position); assert.deepEqual(after.events.filter(e=>!['read'].includes(e.name)),[{name:'selectAsset',args:['controller']}]); await noOverflow(page,'scene retained'); await page.close();return {initial,after:after.diag,sameObjects:after.same};
  });
  await check('welcome uses approved guided/practice labels and supplied Menu slot',async()=>{const page=await open(1280,720,'?welcome');await noOverflow(page,'welcome');await page.getByRole('button',{name:'Start guided game',exact:true}).click();await page.getByRole('button',{name:'Menu',exact:true}).click();assert.equal(await page.getByText('Synthetic menu slot. Host supplies save, replay and evidence.',{exact:true}).isVisible(),true);await noOverflow(page,'menu');await page.close();return {guided:true,menu:'caller supplied'};});
} finally { await browser.close(); writeFileSync(`${out}/browser-results.json`,JSON.stringify({synthetic:true,results,failures},null,2)); }
if(failures.length)process.exitCode=1;
