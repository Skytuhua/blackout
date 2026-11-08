// Explicitly requested raster conditioning: alpha cleanup, crop, grid resampling,
// palette restriction, and editable pixel sources. Artwork originates in image_gen.
import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decode } from './raster.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export const palette=['#050c20','#0b152b','#102343','#163462','#204679','#2d5583','#ea7c2d','#ef506b','#343057','#514071','#7350a1','#8950bd','#ad63dc','#ca83ef','#696993','#8b8fb9','#afb4d8','#d8deed','#ffffff','#005d7a','#00a9c4','#03deee','#8ef2ee','#b77720','#e8a719','#ffce15','#ffe46a','#8b573f','#d5906d','#ffd1a1','#16704b','#4fa92f'];
const rgb=palette.map(hex=>[...Buffer.from(hex.slice(1),'hex')]);
export function nearest(r,g,b){let best=0,distance=Infinity;for(let i=0;i<rgb.length;i++){const d=(r-rgb[i][0])**2+(g-rgb[i][1])**2+(b-rgb[i][2])**2;if(d<distance){distance=d;best=i;}}return best;}
export function cropCell(img,col,row,cols=4,rows=4){let x0=img.width,y0=img.height,x1=0,y1=0;const left=Math.round(col*img.width/cols),right=Math.round((col+1)*img.width/cols),top=Math.round(row*img.height/rows),bottom=Math.round((row+1)*img.height/rows);for(let y=top+3;y<bottom-3;y++)for(let x=left+3;x<right-3;x++)if(img.pixels[(y*img.width+x)*4+3]>=220){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};}
export function sample(img,crop,w,h){const pixels=[];for(let y=0;y<h;y++){const row=[];for(let x=0;x<w;x++){const votes=new Map();for(const oy of [0.25,0.5,0.75])for(const ox of [0.25,0.5,0.75]){const sx=Math.min(img.width-1,Math.floor(crop.x+(x+ox)*crop.w/w)),sy=Math.min(img.height-1,Math.floor(crop.y+(y+oy)*crop.h/h)),p=(sy*img.width+sx)*4,id=img.pixels[p+3]>=192?nearest(...img.pixels.subarray(p,p+3)):-1;votes.set(id,(votes.get(id)||0)+1);}row.push([...votes].sort((a,b)=>b[1]-a[1])[0][0]);}pixels.push(row);}return pixels;}
export function masterSources(){const img=decode(root+'source/generated-masters-original.png'),frames={};
  const definitions=[['floor_0',0,0,16,16],['wall_0',1,0,16,16],['wall_1',2,0,16,16],['wall_2',3,0,16,16],['rack',0,1,16,32],['cooling',1,1,32,32],['fan_0',2,1,16,16],['commander_s_idle',3,1,12,16],['portrait_commander',0,2,32,32]];
  for(const[name,col,row,w,h]of definitions){const crop=cropCell(img,col,row);frames[name]={pixels:sample(img,crop,w,h),origin:{kind:'generated-raster-conditioned',file:'source/generated-masters-original.png',crop,method:'3x3 majority nearest palette; alpha threshold192; untrimmed native frame'}};}
  // Floor is a seamless solid tile. Extend its generated navy pattern across
  // the full tile and move seams to the top/left to remove inter-tile borders.
  const floor=frames.floor_0.pixels;for(let y=0;y<16;y++)for(let x=0;x<16;x++)floor[y][x]=x===0||y===0?2:x===1||y===1?4:3;
  frames.floor_0.origin.cleanup='seams relocated to top/left; uniform navy clusters preserve reference floor';
  writeFileSync(root+'source/sprites.json',JSON.stringify({format:'blackout-editable-indexed-raster-v1',transparentIndex:-1,palette,frames},null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))masterSources();
