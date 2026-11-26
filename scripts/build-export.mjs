import {mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const files=[
 ['bizudpgothic','BIZUDPGothic-Regular.ttf','0753da0963c2fa25c5b5990d13f51842cb34e50d'],
 ['bizudpgothic','BIZUDPGothic-Bold.ttf','8cfe34552b6106d0a686b376b8047ca562a74847'],
 ['bizudgothic','BIZUDGothic-Regular.ttf','dd215603417e88b118d9e69fc1296e50bc764d34'],
 ['bizudpgothic','OFL.txt','4df8604ddf1c71f3976116927dab08aada51cfd1']
];
await mkdir('src/vendor',{recursive:true});
const vfs={};
for(const [dir,name,sha] of files){
 const response=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/'+dir+'/'+name);
 if(!response.ok)throw Error('Font download failed: '+name+' '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 const actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(actual!==sha)throw Error('Font revision mismatch: '+name);
 await writeFile('src/vendor/'+name,bytes);
 if(name.endsWith('.ttf'))vfs[name]=bytes.toString('base64');
}
await writeFile('scripts/font-vfs.generated.js','export default '+JSON.stringify(vfs)+';\n');
try{
 await build({entryPoints:['scripts/export-runtime.mjs'],bundle:true,platform:'browser',format:'esm',minify:true,legalComments:'linked',outfile:'src/vendor/export-runtime.js'});
}finally{await rm('scripts/font-vfs.generated.js',{force:true});}
