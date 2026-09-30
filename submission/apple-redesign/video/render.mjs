import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=import.meta.dirname;
const out=path.join(root,'out');await fs.mkdir(out,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.jsx'),publicDir:path.join(root,'public')});
for(const [id,name] of [['CareThreadPoster','carethread-poster.png'],['Interface','carethread-interface.png']]){
const composition=await selectComposition({serveUrl,id});await renderStill({composition,serveUrl,output:path.join(out,name),imageFormat:'png'});}
const composition=await selectComposition({serveUrl,id:'CareThreadFilm'});
for(const frame of [140,350,620,875,1020,1250,1630,1950])await renderStill({composition,serveUrl,frame,output:path.join(out,`frame-${frame}.png`),imageFormat:'png'});
if(process.argv.includes('--stills'))process.exit(0);
await renderMedia({composition,serveUrl,codec:'h264',outputLocation:path.join(out,'carethread-silent.mp4'),crf:18,concurrency:4,onProgress:({progress})=>{if(Math.floor(progress*100)%10===0)process.stdout.write(`\rRendering ${Math.round(progress*100)}%`);}});
console.log('\nRender complete');
