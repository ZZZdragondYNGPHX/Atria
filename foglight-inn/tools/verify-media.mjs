import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require(path.resolve(process.argv[process.argv.indexOf('--sharp')+1]));
const hash=b=>createHash('sha256').update(b).digest('hex'),images=[];
for(const name of (await fs.readdir('media/images')).filter(n=>n.endsWith('.webp')&&n!=='inn-night.webp').sort()){
 const id=name.slice(0,-5),png='media/images/'+id+'.png',webp='media/images/'+name,bytes=await fs.readFile(webp),source=await fs.readFile(png),meta=await sharp(source).metadata(),character=['zhou','lin','xu','shen'].includes(id);
 assert(bytes.length<2*1024*1024);let alpha=null;
 if(character){const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});let clear=0,solid=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]>=250)solid++;}assert(data[3]===0&&clear>info.width*info.height*.2&&solid>info.width*info.height*.1);alpha={transparentPixels:clear,solidPixels:solid,total:info.width*info.height};}
 images.push({id,producer:'OpenAI built-in image_gen',date:'2026-10-15',png,webp,width:meta.width,height:meta.height,characterStyle:character?'2D anime, adult':null,alpha,pngSha256:hash(source),webpSha256:hash(bytes)});
}
assert.equal(images.length,27);const audio=JSON.parse(await fs.readFile('media/audio/sources.json','utf8'));assert.equal(audio.length,19);
for(const a of audio){assert.equal(hash(await fs.readFile(a.file)),a.sha256);assert(a.peak<=.5&&a.duration>0);assert.equal(a.license,'CC0-1.0');}
await fs.writeFile('media/image-sources.json',JSON.stringify(images,null,2));
console.log(JSON.stringify({images:images.length,trueTransparentCharacters:images.filter(i=>i.alpha).map(i=>({id:i.id,...i.alpha})),audio:audio.length,maxAudioPeak:Math.max(...audio.map(a=>a.peak))}));
