// Failure-path tests of the delivered asset contract and custody, offline only.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validate } from '../source/validate.mjs';
import { decode,encode } from '../source/raster.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const json=path=>JSON.parse(readFileSync(root+path));
let passed=0;
function corrupt(path,mutate,reason){const bytes=readFileSync(root+path);try{const value=JSON.parse(bytes);mutate(value);writeFileSync(root+path,JSON.stringify(value));assert.throws(()=>validate(),reason);passed++;console.log('PASS rejected '+reason);}finally{writeFileSync(root+path,bytes);}}
const result=validate();passed++;console.log('PASS complete atlas baseline');
function corruptRaster(mutate,reason){const path=root+'facility-v2.png',bytes=readFileSync(path);try{const img=decode(path);mutate(img);encode(path,img);assert.throws(()=>validate(),reason);passed++;console.log('PASS rejected '+reason);}finally{writeFileSync(path,bytes);}}
corruptRaster(img=>img.pixels.set([1,2,3,255],(2*512+2)*4),/off-palette/);
corruptRaster(img=>img.pixels[(2*512+2)*4+3]=128,/binary alpha/);
corruptRaster(img=>img.pixels.set([5,12,32,255],(511*512+511)*4),/outside named frame/);
corrupt('facility-v2.json',v=>delete v.frames.rack,/111 contracted names/);
corrupt('facility-v2.json',v=>v.frames.commander_s_idle.anchor.y=15,/anchor/);
corrupt('facility-v2.json',v=>v.frames.fan_0.durationMs=250,/animation clock/);
corrupt('facility-v2.json',v=>v.frames.rack.frame.x=v.frames.cooling.frame.x,/editable-source pixel|frame gap overlap/);
corrupt('source/sprites.json',v=>v.frames.rack.pixels[10][5]=21,/editable-source pixel/);
corrupt('source/provenance.json',v=>v.files[0].sha256='0'.repeat(64),/source hash/);
corrupt('source/provenance.json',v=>v.generations[0].original='unretained.png',/retained original generation/);
const originalPath=root+'source/generated-masters-original.png',original=readFileSync(originalPath);
try{const corrupted=Buffer.from(original);corrupted[corrupted.length-1]^=1;writeFileSync(originalPath,corrupted);assert.throws(()=>validate(),/source hash/);passed++;console.log('PASS rejected modified original generated raster');}finally{writeFileSync(originalPath,original);}
const src=json('source/sprites.json');
for(const who of ['commander','facilities','electrical'])for(const direction of ['n','e','s','w']){
  const sig=pose=>createHash('sha256').update(JSON.stringify(src.frames[`${who}_${direction}_${pose}`].pixels)).digest('hex');
  assert.notEqual(sig('walk0'),sig('walk1'),`${who} ${direction} distinct walk poses`);
  assert.notEqual(sig('work0'),sig('work1'),`${who} ${direction} distinct work poses`);
  for(const pose of ['idle','walk0','walk1','work0','work1'])assert.ok(src.frames[`${who}_${direction}_${pose}`].pixels[15].some(color=>color>=0),`${who} ${direction} ${pose} feet baseline15`);
}
passed++;console.log('PASS all 60 crew frames have fixed feet baseline and distinct paired animation');
for(const who of ['commander','facilities','electrical'])assert.equal(new Set(['n','e','s','w'].map(direction=>JSON.stringify(src.frames[`${who}_${direction}_idle`].pixels))).size,4,`${who} distinct directional silhouettes`);
passed++;console.log('PASS all three crew identities have four distinct directional silhouettes');
for(const family of ['fan','generator']){const frames=Object.entries(src.frames).filter(([name])=>name.startsWith(family+'_'));assert.equal(new Set(frames.map(([,frame])=>JSON.stringify(frame.pixels))).size,frames.length,`${family} frames must visibly differ`);}
passed++;console.log('PASS four unique fan and three unique mechanical generator frames');
assert.ok(!src.frames.rack.pixels.flat().some(id=>[7,20,21,22,25].includes(id)),'rack chassis must not bake cyan/red/yellow operation signals');passed++;console.log('PASS rack chassis has neutral indicator sockets');
validate();passed++;console.log('PASS restored baseline after corruption probes');
console.log(JSON.stringify({checks:passed,atlas:result.frames,paidCalls:0,runtimeIntegration:'not exercised',visualAcceptance:'not asserted'},null,2));
