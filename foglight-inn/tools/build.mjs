import fs from 'node:fs/promises';
import path from 'node:path';
import {compile} from './compile.mjs';
const core=path.resolve(process.argv[process.argv.indexOf('--core')+1]||'');
const result=await compile(core,{ui:!process.argv.includes('--rules-only')});
const built=result.native.buildAtriaPackageContainer({manifest:result.manifest,sourceFiles:result.files,assetPayloads:result.assets});
if(process.argv.includes('--out')){const out=path.resolve(process.argv[process.argv.indexOf('--out')+1]);await fs.writeFile(out,built.archive,{flag:'wx'});console.log('Built '+out);}
console.log(JSON.stringify({package:built.manifest.name,files:result.files.size,assets:result.assets.size,bytes:built.archive.length}));
