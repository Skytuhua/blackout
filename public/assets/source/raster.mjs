// Dependency-free PNG I/O and nearest-neighbor assembly. No network/provider calls.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
export const raster=(width,height)=>({width,height,pixels:Buffer.alloc(width*height*4)});
export function decode(path) {
  const b=readFileSync(path),chunks=[];let width,height,type,depth;
  for(let at=8;at<b.length;) {const n=b.readUInt32BE(at),kind=b.toString('ascii',at+4,at+8),data=b.subarray(at+8,at+8+n);if(kind==='IHDR'){width=data.readUInt32BE();height=data.readUInt32BE(4);depth=data[8];type=data[9];}if(kind==='IDAT')chunks.push(data);at+=n+12;}
  if(depth!==8||![2,6].includes(type))throw Error('Expected RGB/RGBA 8-bit source PNG');
  const channels=type===6?4:3,stride=width*channels,raw=inflateSync(Buffer.concat(chunks)),unfiltered=Buffer.alloc(width*height*channels),out=raster(width,height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++) for(let x=0;x<stride;x++){const p=y*stride+x,a=x>=channels?unfiltered[p-channels]:0,b=y?unfiltered[p-stride]:0,c=y&&x>=channels?unfiltered[p-stride-channels]:0;unfiltered[p]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][raw[y*(stride+1)]])&255;}
  for(let p=0;p<width*height;p++){unfiltered.copy(out.pixels,p*4,p*channels,p*channels+3);out.pixels[p*4+3]=channels===4?unfiltered[p*channels+3]:255;}return out;
}
const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),sum=Buffer.alloc(4);n.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,sum]);};
export function encode(path,img){const header=Buffer.alloc(13);header.writeUInt32BE(img.width);header.writeUInt32BE(img.height,4);header[8]=8;header[9]=6;const rows=Buffer.alloc((img.width*4+1)*img.height);for(let y=0;y<img.height;y++)img.pixels.copy(rows,y*(img.width*4+1)+1,y*img.width*4,(y+1)*img.width*4);writeFileSync(path,Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]));}
export function paste(dst,src,x,y,scale=1){for(let sy=0;sy<src.height;sy++)for(let sx=0;sx<src.width;sx++){const p=(sy*src.width+sx)*4;if(!src.pixels[p+3])continue;for(let j=0;j<scale;j++)for(let i=0;i<scale;i++){const xx=x+sx*scale+i,yy=y+sy*scale+j;if(xx>=0&&yy>=0&&xx<dst.width&&yy<dst.height)src.pixels.copy(dst.pixels,(yy*dst.width+xx)*4,p,p+4);}}}
export function indexed(rows,palette){const img=raster(rows[0].length,rows.length);for(let y=0;y<rows.length;y++)for(let x=0;x<rows[y].length;x++){const id=rows[y][x];if(id>=0)img.pixels.set([...Buffer.from(palette[id].slice(1),'hex'),255],(y*img.width+x)*4);}return img;}
export function scale(img,factor){const out=raster(img.width*factor,img.height*factor);paste(out,img,0,0,factor);return out;}
