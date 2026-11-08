import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { inflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(resolve(root, path));
const expected = {};
for (const [prefix, count] of [['floor',3],['wall',10],['infra',10],['fixture',6]]) for(let i=0;i<count;i++) expected[`${prefix}_${i}`]=[16,16];
Object.assign(expected, {rack:[16,32],cooling:[32,32],ups:[16,32],controller:[16,16],distribution:[16,16],cart:[16,16]});
for(let i=0;i<4;i++) expected[`fan_${i}`]=[16,16];
for(let i=0;i<3;i++) expected[`generator_${i}`]=[32,32];
for(const who of ['commander','facilities','electrical']) for(const direction of ['n','e','s','w']) for(const pose of ['idle','walk0','walk1','work0','work1']) expected[`${who}_${direction}_${pose}`]=[12,16];
for(const who of ['commander','facilities','electrical','it']) expected[`portrait_${who}`]=[32,32];
for(const state of ['unknown','stale','active','warning','failed']) expected[`badge_${state}`]=[8,8];

function png(bytes) {
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature');
  let width,height,depth,type; const chunks=[];
  for(let at=8;at<bytes.length;) {const length=bytes.readUInt32BE(at), kind=bytes.toString('ascii',at+4,at+8), data=bytes.subarray(at+8,at+8+length); if(kind==='IHDR'){width=data.readUInt32BE();height=data.readUInt32BE(4);depth=data[8];type=data[9];} if(kind==='IDAT')chunks.push(data); at+=length+12;}
  assert.equal(depth,8); assert.equal(type,6,'runtime must be RGBA PNG');
  const raw=inflateSync(Buffer.concat(chunks)), stride=width*4, pixels=Buffer.alloc(width*height*4);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++) {const filter=raw[y*(stride+1)]; for(let x=0;x<stride;x++){const index=y*stride+x,a=x>=4?pixels[index-4]:0,b=y?pixels[index-stride]:0,c=y&&x>=4?pixels[index-stride-4]:0; pixels[index]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
  return {width,height,pixels};
}

export function validate({masters=false}={}) {
  assert.ok(existsSync(resolve(root,'facility-v2.png')),'missing facility-v2.png: new raster atlas has not been delivered');
  const atlas=png(read('facility-v2.png')), manifest=JSON.parse(read('facility-v2.json')), source=JSON.parse(read('source/sprites.json'));
  assert.deepEqual([atlas.width,atlas.height],[512,512]);
  assert.deepEqual([manifest.meta.width,manifest.meta.height],[512,512]);
  assert.equal(manifest.meta.image,'facility-v2.png');
  assert.equal(manifest.meta.palette.length,32); assert.equal(new Set(manifest.meta.palette).size,32);
  assert.deepEqual(manifest.meta.palette,source.palette,'source palette custody');
  const names=Object.keys(manifest.frames);
  if(!masters) assert.deepEqual(names.sort(),Object.keys(expected).sort(),'exactly the 111 contracted names');
  else for(const name of ['floor_0','wall_0','wall_1','rack','cooling','fan_0','commander_s_idle','portrait_commander']) assert.ok(names.includes(name),`missing master ${name}`);
  const used=new Set(), occupied=new Map(), bodies=new Set(); let opaque=0;
  for(let p=0;p<atlas.pixels.length;p+=4){const a=atlas.pixels[p+3];assert.ok(a===0||a===255,'binary alpha');if(a){used.add('#'+atlas.pixels.subarray(p,p+3).toString('hex'));opaque++;}else assert.equal(atlas.pixels.readUInt32BE(p),0,'transparent pixels must have zero RGB');}
  for(const color of used)assert.ok(source.palette.includes(color),`off-palette ${color}`);
  for(const [name,sprite] of Object.entries(manifest.frames)) {
    const {x,y,w,h}=sprite.frame;assert.deepEqual([w,h],expected[name],`${name} native dimensions`);
    assert.ok(x>=2&&y>=2&&x+w<=510&&y+h<=510,`${name} padding and atlas bounds`);
    const character=/^(commander|facilities|electrical)_/.test(name);
    assert.deepEqual(sprite.anchor,character?{x:6,y:8}:{x:0,y:0},`${name} anchor`);
    assert.equal(sprite.durationMs,/_(walk[01])$|^fan_/.test(name)?167:/_(work[01])$|^generator_/.test(name)?250:0,`${name} animation clock`);
    assert.equal(sprite.source,'source/sprites.json#'+name);
    assert.ok(sprite.layer&&Object.hasOwn(sprite,'footprint'));
    assert.ok(source.frames[name]?.origin,'explicit source origin');
    const rows=source.frames[name].pixels;assert.equal(rows.length,h);
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)bodies.add(yy*512+xx);
    let coverage=0;
    for(let sy=0;sy<h;sy++) {assert.equal(rows[sy].length,w);for(let sx=0;sx<w;sx++){const id=rows[sy][sx], offset=((y+sy)*512+x+sx)*4;const want=id<0?[0,0,0,0]:[...Buffer.from(source.palette[id].slice(1),'hex'),255];assert.deepEqual([...atlas.pixels.subarray(offset,offset+4)],want,`${name} editable-source pixel ${sx},${sy}`);if(id>=0)coverage++;}}
    assert.ok(coverage>=w*h*0.14,`${name} recognizable nonempty coverage`);
    for(let yy=y-1;yy<=y+h;yy++) for(let xx=x-1;xx<=x+w;xx++){const id=yy*512+xx;if(occupied.has(id))assert.fail(`frame gap overlap: ${name} and ${occupied.get(id)}`);occupied.set(id,name);if(xx<x||xx>=x+w||yy<y||yy>=y+h)assert.equal(atlas.pixels[id*4+3],0,`${name} empty padding`);}
  }
  for(let p=0;p<atlas.pixels.length;p+=4)if(atlas.pixels[p+3])assert.ok(bodies.has(p/4),'opaque pixel outside named frame');
  const seal=JSON.parse(read('source/master-seal.json'));
  for(const[name,hash]of Object.entries(seal.frames))assert.equal(sha(Buffer.from(JSON.stringify(source.frames[name]))),hash,`${name} approved master preservation`);
  for(const[path,hash]of Object.entries(seal.review))assert.equal(sha(read(path)),hash,`${path} approved contact sheet preservation`);
  const custody=JSON.parse(read('source/provenance.json'));
  assert.equal(custody.mode,'built-in image_gen');assert.equal(custody.baseCommit,'8b1f4242bbdf38db0633f8fca39bf555bc2d20da');
  assert.ok(custody.generations.length>=1,'actual generated raster provenance');
  for(const file of custody.files){assert.ok(!relative(root,resolve(root,file.path)).startsWith('..'),'custody path must remain project-local');assert.equal(sha(read(file.path)),file.sha256,`${file.path} source hash`);}
  for(const run of custody.generations){assert.ok(custody.files.some(file=>file.path===run.original),'retained original generation');assert.ok(custody.files.some(file=>file.path===run.prompt),'exact prompt retained');}
  const hashes=JSON.parse(read('review/hashes.json'));
  for(const file of hashes.files)assert.equal(sha(read(file.path)),file.sha256,`${file.path} deliverable hash`);
  const report={stage:masters?'masters':'complete',frames:names.length,width:512,height:512,rgba:true,binaryAlpha:true,paletteColors:used.size,opaquePixels:opaque,sourcePixelMatch:true,paddingPx:2,custodyFiles:custody.files.length,hashedDeliverables:hashes.files.length,visualAcceptance:'not asserted',runtimeIntegration:'not exercised by asset validation'};
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {try{console.log(JSON.stringify(validate({masters:process.argv.includes('--masters')}),null,2));}catch(error){console.error('ASSET VALIDATION FAILED:',error.message);process.exitCode=1;}}
