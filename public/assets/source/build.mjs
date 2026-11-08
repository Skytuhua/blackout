// Rebuild exports strictly from the human-editable indexed sprite source.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { raster,indexed,paste,encode,scale } from './raster.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const json=path=>JSON.parse(readFileSync(root+path));
const save=(path,value)=>writeFileSync(root+path,JSON.stringify(value,null,2)+'\n');
const hash=path=>createHash('sha256').update(readFileSync(root+path)).digest('hex');
const source=json('source/sprites.json'),atlas=raster(512,512),frames={};
mkdirSync(root+'review',{recursive:true});
const names=Object.keys(source.frames);
for(const[name,item]of Object.entries(source.frames)){const i=names.indexOf(name),img=indexed(item.pixels,source.palette),x=(i%15)*34+2,y=Math.floor(i/15)*34+2;paste(atlas,img,x,y);const character=/^(commander|facilities|electrical)_/.test(name),layer=name.startsWith('floor_')?'floor':name.startsWith('wall_')?'wall':name.startsWith('infra_')?'infrastructure':name.startsWith('fixture_')?'fixture':name.startsWith('portrait_')?'portrait':name.startsWith('badge_')?'badge':character?'character':name.startsWith('fan_')?'subpart':'equipment';frames[name]={frame:{x,y,w:img.width,h:img.height},anchor:character?{x:6,y:8}:{x:0,y:0},footprint:['wall','equipment'].includes(layer)?{width:img.width,height:img.height}:null,layer,durationMs:/_(walk[01])$|^fan_/.test(name)?167:/_(work[01])$|^generator_/.test(name)?250:0,source:'source/sprites.json#'+name};}
encode(root+'facility-v2.png',atlas);
save('facility-v2.json',{meta:{image:'facility-v2.png',width:512,height:512,palette:source.palette,provenance:'source/provenance.json'},frames});

// Small raster labels belong to review artifacts only. Runtime text remains DOM.
const glyphs={A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['011','100','100','100','011'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['011','100','101','101','011'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],J:['001','001','001','101','010'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['101','111','111','101','101'],N:['101','111','111','111','101'],O:['010','101','101','101','010'],P:['110','101','110','100','100'],Q:['010','101','101','111','011'],R:['110','101','110','101','101'],S:['011','100','010','001','110'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['101','101','111','111','101'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],'0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],'3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],'6':['011','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','110'],'_':['000','000','000','000','111']};
function label(img,text,x,y){for(const c of text.toUpperCase()){const glyph=glyphs[c];if(glyph)for(let j=0;j<5;j++)for(let i=0;i<3;i++)if(glyph[j][i]==='1')img.pixels.set([175,180,216,255],((y+j)*img.width+x+i)*4);x+=4;}}
function sheet(list,stem,columns=8){const img=raster(columns*64,Math.ceil(list.length/columns)*58);for(let i=0;i<list.length;i++){const name=list[i],tile=indexed(source.frames[name].pixels,source.palette),x=(i%columns)*64,y=Math.floor(i/columns)*58;paste(img,tile,x+Math.floor((64-tile.width)/2),y+2);for(let j=0;j<name.length;j+=15)label(img,name.slice(j,j+15),x+2,y+36+Math.floor(j/15)*7);}encode(root+`review/${stem}-native.png`,img);encode(root+`review/${stem}-3x.png`,scale(img,3));}
const masters=['floor_0','wall_0','wall_1','wall_2','rack','cooling','fan_0','commander_s_idle','portrait_commander'];
sheet(masters,'masters');sheet(names,'atlas-contact');
const animated=names.filter(name=>/_(walk[01]|work[01])$|^fan_|^generator_/.test(name));
if(names.length===111){
  const groups=[{label:'FAN 167MS',names:[0,1,2,3].map(i=>`fan_${i}`)},{label:'GENERATOR 250MS',names:[0,1,2].map(i=>`generator_${i}`)}];
  for(const who of ['commander','facilities','electrical'])for(const dir of ['n','e','s','w'])groups.push({label:`${who}_${dir}`,names:['idle','walk0','walk1','work0','work1'].map(pose=>`${who}_${dir}_${pose}`)});
  const strip=raster(320,groups.length*44+14);
  ['FRAME0','FRAME1','FRAME2','FRAME3','FRAME4'].forEach((text,i)=>label(strip,text,112+i*40,2));
  groups.forEach((group,row)=>{const y=14+row*44;label(strip,group.label,2,y+8);group.names.forEach((name,i)=>{const tile=indexed(source.frames[name].pixels,source.palette);paste(strip,tile,112+i*40,y);});});
  encode(root+'review/animation-strip-native.png',strip);encode(root+'review/animation-strip-3x.png',scale(strip,3));
}else if(animated.length)sheet(animated,'animation-strip');
const provenance=json('source/provenance.json');
provenance.files=provenance.files.map(item=>({...item,sha256:hash(item.path)}));save('source/provenance.json',provenance);
const artifacts=['facility-v2.png','facility-v2.json','source/sprites.json','source/provenance.json','review/masters-native.png','review/masters-3x.png','review/atlas-contact-native.png','review/atlas-contact-3x.png',...(animated.length?['review/animation-strip-native.png','review/animation-strip-3x.png']:[]),'source/master-seal.json','source/condition.mjs','source/complete.mjs','source/raster.mjs','source/build.mjs','source/validate.mjs','review/validation-checks.mjs','source/README.md','source/master-prompt.txt','source/crew-prompt.txt','source/environment-prompt.txt','source/generated-masters-original.png','source/generated-crew-original.png','source/generated-environment-original.png'];
save('review/hashes.json',{algorithm:'SHA-256',files:artifacts.map(path=>({path,sha256:hash(path)}))});
console.log(`Built ${names.length} sprites from editable source; nearest-neighbor contact sheets and custody hashes exported.`);
