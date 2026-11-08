// Authored pixel masters. Run with node src/game/generate-assets.mjs.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const palette = ['#07111b','#102332','#193747','#254858','#315a68','#497887','#83adba','#dceaf2','#45d5e8','#ca70ea','#f4b860','#f06b79','#12303c','#1d4752','#2b6370','#76aeb6','#3b5363','#5e7480','#1c2934','#687f8a','#303746','#4a5060','#8a758b','#d3ab82'];
const crc = b => { let c = 0xffffffff; for (const v of b) { c ^= v; for (let k=0;k<8;k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t=Buffer.from(type), n=Buffer.alloc(4), sum=Buffer.alloc(4); n.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([n,t,data,sum]); };
function image(name,w,h,draw) {
  const pixels=Buffer.alloc(w*h*4); const rect=(x,y,rw,rh,c) => { const color=palette[c].slice(1).match(/../g).map(v=>parseInt(v,16)); for(let j=y;j<y+rh;j++) for(let i=x;i<x+rw;i++) { if(i<0||j<0||i>=w||j>=h) continue; const p=(j*w+i)*4; pixels.set([...color,255],p); } };
  draw(rect); const header=Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h,4); header[8]=8; header[9]=6; const rows=Buffer.alloc((w*4+1)*h); for(let y=0;y<h;y++) pixels.copy(rows,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
  writeFileSync(`public/assets/${name}.png`,Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
}
image('floor-wall',32,16,r=>{r(0,0,16,16,1);r(0,0,16,1,3);r(0,0,1,16,3);r(3,3,2,2,2);r(12,12,2,2,2);r(16,0,16,16,2);r(16,0,16,3,4);r(16,4,16,2,0);r(18,8,12,5,3);r(18,13,12,1,5);});
image('rack',16,32,r=>{r(1,1,14,30,0);r(2,1,12,29,4);r(3,3,10,26,2);r(4,4,8,3,5);r(4,9,8,3,3);r(4,14,8,3,5);r(4,19,8,3,3);r(4,24,8,3,5);r(2,29,12,2,18);});
image('technician',12,16,r=>{r(4,0,4,1,10);r(3,1,6,3,10);r(3,4,6,2,23);r(2,6,8,6,9);r(0,7,2,4,22);r(10,7,2,4,22);r(3,8,6,1,7);r(3,12,2,4,18);r(7,12,2,4,18);});
image('cooling',32,32,r=>{r(1,1,30,30,0);r(2,2,28,28,4);r(3,3,26,26,3);r(5,5,22,22,2);r(8,8,16,16,0);r(10,7,12,18,5);r(7,10,18,12,5);r(10,10,12,12,3);r(14,8,4,16,6);r(8,14,16,4,6);r(13,13,6,6,1);r(14,14,4,4,15);r(4,27,24,2,18);});
writeFileSync('public/assets/atlas.json',JSON.stringify({ provenance:'Original pixel artwork authored programmatically for Blackout; no external assets.', palette, sampling:'nearest', frames:{ floor:{file:'floor-wall.png',frame:[0,0,16,16],anchor:[8,8],footprint:[16,16]}, wall:{file:'floor-wall.png',frame:[16,0,16,16],anchor:[8,8],footprint:[16,16]}, rack:{file:'rack.png',frame:[0,0,16,32],anchor:[8,16],footprint:[16,32]}, technician:{file:'technician.png',frame:[0,0,12,16],anchor:[6,8],footprint:[12,16]}, cooling:{file:'cooling.png',frame:[0,0,32,32],anchor:[16,16],footprint:[32,32]} }, animation:'Static masters; no frame duration or simulated motion.'},null,2)+'\n');
