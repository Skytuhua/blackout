// Extend the sealed master snapshot with conditioned generated art and explicit
// native pixel animation/variants. This import recipe never changes the masters.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decode } from './raster.mjs';
import { sample,cropCell } from './condition.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=JSON.parse(readFileSync(root+'source/sprites.json'));
source.characterGeometry={anchor:{x:6,y:8},feet:{x:6,y:15},dimensions:{width:12,height:16},units:'logical pixels; scenario collision geometry is authoritative'};
const seal=JSON.parse(readFileSync(root+'source/master-seal.json'));
const clone=pixels=>pixels.map(row=>[...row]);
const digest=frame=>createHash('sha256').update(JSON.stringify(frame)).digest('hex');
for(const[name,hash]of Object.entries(seal.frames))assert.equal(digest(source.frames[name]),hash,`approved ${name} unchanged before import`);
const put=(name,pixels,origin)=>{if(!Object.hasOwn(seal.frames,name))source.frames[name]={pixels,origin};};
const original=decode(root+'source/generated-masters-original.png');
const crew=decode(root+'source/generated-crew-original.png');
const environment=decode(root+'source/generated-environment-original.png');
function extract(name,image,file,col,row,w,h,cols=4,rows=4){const crop=cropCell(image,col,row,cols,rows),pixels=sample(image,crop,w,h);put(name,pixels,{kind:'generated-raster-conditioned',file:'source/'+file,crop,method:'3x3 majority nearest palette; alpha threshold192; native untrimmed frame'});return pixels;}
const mirror=pixels=>pixels.map(row=>[...row].reverse());
const flip=pixels=>[...pixels].reverse().map(row=>[...row]);
const turn=pixels=>pixels[0].map((_,x)=>pixels.map(row=>row[x]).reverse());
function variant(name,base,transform,operation){put(name,transform(clone(source.frames[base].pixels)),{kind:'native-pixel-derivation',from:base,operation});}
function pixel(p,x,y,color){if(y>=0&&y<p.length&&x>=0&&x<p[0].length)p[y][x]=color;}
function rect(p,x,y,w,h,color){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)pixel(p,i,j,color);}

// Seam-preserving floor variants: utility grout and a recessed service grate.
variant('floor_1','floor_0',p=>{for(let i=4;i<16;i+=6){pixel(p,i,7,2);pixel(p,i+1,7,4);}return p;},'authored six-pixel seam cadence; no state indication');
const serviceGrate=sample(environment,cropCell(environment,2,2,4,3),12,12);
variant('floor_2','floor_0',p=>{for(let y=0;y<12;y++)for(let x=0;x<12;x++)if(serviceGrate[y][x]>=0)p[y+2][x+2]=serviceGrate[y][x];return p;},'inlay conditioned source/generated-environment-original.png cell2,2 service grate at2,2');
variant('wall_3','wall_2',mirror,'horizontal mirror: northeast bend');
variant('wall_4','wall_2',p=>flip(mirror(p)),'180-degree rotation: southeast bend');
variant('wall_5','wall_2',flip,'vertical mirror: southwest bend');
variant('wall_6','wall_1',p=>{const top=source.frames.wall_0.pixels;for(let y=0;y<6;y++)for(let x=0;x<16;x++)p[y][x]=top[y][x];return p;},'purple T junction with continuous lavender cap');
variant('wall_7','wall_6',p=>{for(let y=10;y<16;y++)for(let x=0;x<16;x++)p[y][x]=source.frames.wall_0.pixels[y-10][x];return p;},'purple cross junction; cap continuity at both edges');
extract('wall_8',environment,'generated-environment-original.png',2,1,16,16,4,3);
extract('wall_9',environment,'generated-environment-original.png',1,2,16,16,4,3);

extract('infra_0',environment,'generated-environment-original.png',0,0,16,16,4,3);
variant('infra_1','infra_0',turn,'90-degree cyan conduit rotation');
extract('infra_2',environment,'generated-environment-original.png',1,0,16,16,4,3);
variant('infra_3','infra_2',mirror,'cyan elbow horizontal mirror');
variant('infra_4','infra_2',flip,'cyan elbow vertical mirror');
variant('infra_5','infra_2',p=>flip(mirror(p)),'cyan elbow 180-degree rotation');
extract('infra_6',environment,'generated-environment-original.png',2,0,16,16,4,3);
extract('infra_7',environment,'generated-environment-original.png',3,0,16,16,4,3);
variant('infra_8','infra_7',turn,'90-degree electrical cable-tray rotation');
extract('infra_9',environment,'generated-environment-original.png',0,1,16,16,4,3);
extract('fixture_0',environment,'generated-environment-original.png',3,1,16,16,4,3);
const bayBlank=sample(environment,cropCell(environment,3,2,4,3),16,16);
const letters={A:['01110','11011','11011','11111','11011','11011','11011'],B:['11110','11011','11011','11110','11011','11011','11110'],C:['01111','11000','11000','11000','11000','11000','01111']};
for(const[i,letter]of ['A','B','C'].entries()){const p=clone(bayBlank);for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(letters[letter][y][x]==='1')pixel(p,x+6,y+5,17);put('fixture_'+(i+1),p,{kind:'generated-raster-and-native-lettering',file:'source/generated-environment-original.png',crop:cropCell(environment,3,2,4,3),operation:`conditioned bay plate; authored small pixel ${letter}; detailed text belongs to DOM`});}
extract('fixture_4',environment,'generated-environment-original.png',0,2,16,16,4,3);
extract('fixture_5',environment,'generated-environment-original.png',1,1,16,16,4,3);

extract('ups',original,'generated-masters-original.png',0,3,16,32);
extract('controller',original,'generated-masters-original.png',1,3,16,16);
variant('distribution','controller',p=>{rect(p,3,4,6,6,14);rect(p,4,5,4,4,0);rect(p,5,6,2,2,15);for(const y of [4,7,10]){rect(p,10,y,3,2,0);pixel(p,11,y,16);}rect(p,4,12,4,1,0);return p;},'separate breaker bank, recessed meter and three neutral toggle sockets');
extract('generator_0',original,'generated-masters-original.png',2,3,32,32);
// Top terminal windows are unlit gray, never pre-baked readiness lights.
for(let y=0;y<7;y++)for(let x=0;x<32;x++)if((x<7||x>24)&&[24,25,26].includes(source.frames.generator_0.pixels[y][x]))source.frames.generator_0.pixels[y][x]=16;
source.frames.generator_0.origin.cleanup='terminal windows neutralized to gray; yellow is chassis paint only';
for(let phase=1;phase<3;phase++)variant(`generator_${phase}`,'generator_0',p=>{for(let y=24;y<29;y++)for(let x=4;x<28;x++){const id=p[y][x];if([0,8,9,10,11,12,14,15,16].includes(id)&&p[y][x]>=0)p[y][x]=((x+phase+y)%4<2)?8:14;}for(let y=11;y<20;y+=4)pixel(p,19+phase,y,15);return p;},`mechanical belt/grille phase ${phase}; no indicator changes; animation only when observed operating`);
extract('cart',original,'generated-masters-original.png',3,3,16,16);
for(const[i,who]of ['facilities','electrical','it'].entries())extract('portrait_'+who,original,'generated-masters-original.png',i+1,2,32,32);

// Preserve the approved fan_0 exactly. Rotate only its inner rotor sample; the
// square casing and all mounting pixels remain steady across the whole loop.
for(let phase=1;phase<4;phase++)variant(`fan_${phase}`,'fan_0',p=>{const base=source.frames.fan_0.pixels,angle=phase*Math.PI/8,cos=Math.cos(angle),sin=Math.sin(angle);for(let y=3;y<=12;y++)for(let x=3;x<=12;x++){const dx=x-7.5,dy=y-7.5;if(dx*dx+dy*dy>21)continue;const sx=Math.round(7.5+dx*cos+dy*sin),sy=Math.round(7.5-dx*sin+dy*cos);p[y][x]=sx>=3&&sx<=12&&sy>=3&&sy<=12?base[sy][sx]:0;}return p;},`native rotor nearest rotation ${phase*22.5} degrees; unaltered casing`);

for(const[row,who]of ['commander','facilities','electrical'].entries())for(const[col,direction]of ['n','e','s','w'].entries()){
  const idle=`${who}_${direction}_idle`;
  if(!Object.hasOwn(seal.frames,idle))extract(idle,crew,'generated-crew-original.png',col,row,12,16,4,3);
  for(let phase=0;phase<2;phase++){
    variant(`${who}_${direction}_walk${phase}`,idle,p=>{
      // Native authored leg geometry, rather than shifting the entire sprite.
      // All poses retain the same cap/face and feet baseline y=15.
      rect(p,0,12,12,4,-1);
      if(direction==='n'||direction==='s'){
        rect(p,2,12,3,3,0);rect(p,7,12,3,3,0);rect(p,3,12,2,2,15);rect(p,7,12,2,2,15);
        const long=phase?7:2,short=phase?2:7;rect(p,long,14,3,2,0);rect(p,long+1,14,2,1,15);rect(p,long,15,3,1,2);rect(p,short,14,3,1,2);
      }else{
        const forward=(direction==='e')!==Boolean(phase);rect(p,3,12,5,1,15);rect(p,forward?7:2,13,3,2,15);rect(p,forward?2:6,14,3,1,15);rect(p,forward?7:1,15,4,1,2);rect(p,forward?1:7,14,4,1,2);
      }
      const armX=direction==='w'?1:10;pixel(p,armX,phase?10:9,29);pixel(p,armX,phase?9:10,0);return p;
    },`authored alternating leg and counter-swing arm pose ${phase}; fixed 6,8 anchor/feet baseline15`);
    variant(`${who}_${direction}_work${phase}`,idle,p=>{
      const left=direction==='w',handX=left?1:10,toolX=left?0:11,handY=phase?10:9;
      rect(p,handX-1,8,2,4,0);pixel(p,handX,handY,29);pixel(p,handX,handY-1,29);pixel(p,toolX,handY,16);pixel(p,toolX,handY-1,16);pixel(p,toolX,handY-2,17);pixel(p,left?1:10,handY-2,14);return p;
    },`authored hand/tool work phase ${phase}; metal tool only, no sparks, no inferred task completion`);
  }
}

// Small symbolic overlays are explicitly authored on the native 8px grid. The
// renderer chooses these only from permitted observation freshness/state.
const badge=(name,rows,color)=>put('badge_'+name,rows.map(row=>[...row].map(c=>c==='.'?-1:c==='#'?0:c==='!'?17:color)),{kind:'authored-native-pixel-symbol',operation:`8x8 ${name} observation overlay; no state baked into chassis`});
badge('unknown',['..####..','.oooooo.','#oo!!oo#','#oooo!o#','#ooo!oo#','#oooooo#','.oo!ooo.','..####..'],16);
badge('stale',['..####..','.oooooo.','#oo!ooo#','#oo!ooo#','#oo!!!o#','#oooooo#','.oooooo.','..####..'],15);
badge('active',['...#....','..#o#...','..#oo#..','..#ooo#.','..#ooo#.','..#oo#..','..#o#...','...#....'],21);
badge('warning',['...##...','..#oo#..','..#!!#..','.#o!!o#.','.#o!!o#.','#oooooo#','#oo!!oo#','########'],25);
badge('failed',['..####..','.oooooo.','#o!oo!o#','#oo!!oo#','#oo!!oo#','#o!oo!o#','.oooooo.','..####..'],7);

for(const[name,hash]of Object.entries(seal.frames))assert.equal(digest(source.frames[name]),hash,`approved ${name} unchanged after import`);
const text=JSON.stringify(source,null,2).replace(/\[\s+(-?\d+(?:,\s+-?\d+)+)\s+\]/g,(_,numbers)=>'['+numbers.replace(/\s+/g,' ')+']');
writeFileSync(root+'source/sprites.json',text+'\n');
const provenance=JSON.parse(readFileSync(root+'source/provenance.json'));
for(const[id,original,prompt,img]of [['crew-01','generated-crew-original.png','crew-prompt.txt',crew],['environment-01','generated-environment-original.png','environment-prompt.txt',environment]]){
  if(!provenance.generations.some(item=>item.id===id))provenance.generations.push({id,original:'source/'+original,prompt:'source/'+prompt,tool:'image_gen.imagegen',transparentBackground:true,actualDimensions:{width:img.width,height:img.height}});
  for(const path of ['source/'+original,'source/'+prompt])if(!provenance.files.some(item=>item.path===path))provenance.files.push({path,sha256:createHash('sha256').update(readFileSync(root+path)).digest('hex')});
}
for(const run of provenance.generations)run.inputReferences=run.id==='masters-01'?provenance.references.map(item=>item.file):run.id==='crew-01'?[...provenance.references.map(item=>item.file),'source/generated-masters-original.png']:['source/generated-masters-original.png',provenance.references[1].file];
provenance.conditioning='Three generated source sheets; thresholded transparent edges, explicit crops, majority palette sampling, disclosed native cleanup. Additional wall/conduit rotations, alternate floors, signs, observed-state badges, character limb poses and mechanical animation are authored native pixel derivations. Nine approved masters are sealed and unchanged.';
provenance.failedAttempts=[{asset:'crew turnaround',result:'connection failed: error sending request',artifactProduced:false,handling:'retry built-in succeeded; no CLI/API fallback'}];
writeFileSync(root+'source/provenance.json',JSON.stringify(provenance,null,2)+'\n');
console.log(`Completed ${Object.keys(source.frames).length} native frames; all nine master records unchanged.`);
