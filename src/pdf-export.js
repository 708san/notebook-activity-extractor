import {sourceText} from './core.js';
import {savedOutputs} from './format-export.js';
import {pdfMake, markdown, mathSvg} from './vendor/export-runtime.js';

const palette={ink:'#24364b',muted:'#526477',blue:'#315f9d',line:'#d8e1eb',code:'#f2f5f8'};
const notice=t=>({text:'［'+t+'］',color:palette.muted,fontSize:10,margin:[0,3,0,5]});
const plain=t=>({text:String(t||'').replace(/\t/g,'    '),margin:[0,0,0,5]});
const code=t=>({table:{widths:['*'],body:[[{text:String(t||'').replace(/\t/g,'    '),font:'UDCode',fontSize:10,fillColor:palette.code,margin:[4,4,4,4]}]]},layout:'noBorders',margin:[0,3,0,8]});
const asText=v=>Array.isArray(v)?v.join(''):String(v??'');
const imageTypes=['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'];
const svgText=s=>{const t=asText(s);if(t.trim().startsWith('<svg')||t.trim().startsWith('<?xml'))return t;try{return new TextDecoder().decode(Uint8Array.from(atob(t),c=>c.charCodeAt(0)));}catch{return ''}};
function safeSVG(s){
 const d=new DOMParser().parseFromString(svgText(s),'image/svg+xml');
 const root=d.documentElement;
 if(root.localName!=='svg'||d.querySelector('parsererror'))throw Error('SVG形式不正');
 for(const n of [...root.querySelectorAll('script,foreignObject,iframe,object,embed,style,animate,animateMotion,animateTransform,set,mpath')])n.remove();
 for(const n of [root,...root.querySelectorAll('*')])for(const a of [...n.attributes]){
  const v=a.value.trim();if(/^on/i.test(a.name)||(/(?:^|:)href$/i.test(a.name)&&!v.startsWith('#'))||/url\s*\(\s*['"]?(?!#)/i.test(v)||a.name==='style'&&/url|@import|expression/i.test(v))n.removeAttribute(a.name);
 }
 return new XMLSerializer().serializeToString(root);
}
async function rasterImage(mime,data){
 let url;
 if(mime==='image/svg+xml')url=URL.createObjectURL(new Blob([safeSVG(data)],{type:mime}));
 else {const b=asText(data).replace(/\s/g,'');if(!/^[a-z0-9+/=]+$/i.test(b))throw Error('画像データ不正');url=URL.createObjectURL(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:mime}));}
 try{
  const img=new Image();img.src=url;await img.decode();
  if(!img.naturalWidth||!img.naturalHeight)throw Error('画像サイズ不正');
  const ratio=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return {image:canvas.toDataURL('image/png'),fit:[480,660],alignment:'center',margin:[0,5,0,8]};
 }finally{URL.revokeObjectURL(url);}
}
async function imageNode(src,cell,alt=''){
 try{
  if(src.startsWith('attachment:')){
   const key=decodeURIComponent(src.slice(11));const a=cell.attachments?.[key]||{};
   for(const m of imageTypes)if(a[m])return await rasterImage(m,a[m]);
   return notice('添付画像が見つかりません: '+alt);
  }
  const m=src.match(/^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([\s\S]+)$/i);
  if(m)return await rasterImage(m[1].toLowerCase(),m[2]);
  return notice('外部・未保存画像: '+(alt||src.slice(0,150)));
 }catch(e){return notice('画像を再現できません: '+(alt||e.message));}
}
function inert(html){const t=document.createElement('template');t.innerHTML=html;return t.content;}
const blockTags=new Set(['P','DIV','SECTION','ARTICLE','H1','H2','H3','H4','H5','H6','PRE','TABLE','UL','OL','BLOCKQUOTE','HR','DETAILS','SUMMARY','IMG','FIGURE','FIGCAPTION','MATH']);
const ignored=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','FORM','INPUT','BUTTON','TEXTAREA','SELECT','VIDEO','AUDIO','CANVAS']);
function inline(n,style={}){
 if(n.nodeType===3)return [{text:n.textContent,...style}];
 if(n.nodeType!==1||ignored.has(n.tagName))return [];
 const tag=n.tagName;if(tag==='BR')return [{text:'\n'}];
 if(tag==='IMG')return [{text:'［画像: '+(n.getAttribute('alt')||'')+'］',...style}];
 const s={...style};
 if(['B','STRONG'].includes(tag))s.bold=true;
 if(['I','EM'].includes(tag))s.italics=true;
 if(tag==='CODE')s.font='UDCode';
 if(tag==='A')s.color=palette.blue;
 if(tag==='U')s.decoration='underline';
 if(tag==='DEL'||tag==='S')s.decoration='lineThrough';
 const color=n.getAttribute('color')||n.style?.color||'';if(/^(?:red|#f00|#ff0000|rgb\(255,\s*0,\s*0\))$/i.test(color))s.color='#b42332';
 return [...n.childNodes].flatMap(c=>inline(c,s));
}
async function children(nodes,cell){
 const out=[];let run=[];
 const flush=()=>{if(run.some(x=>x.text.trim()))out.push({text:run,margin:[0,0,0,6]});run=[];};
 for(const n of nodes){
  if(n.nodeType===1&&ignored.has(n.tagName)){flush();out.push(notice('動的な埋め込み要素は再現できません'));continue;}
  if(n.nodeType===1&&blockTags.has(n.tagName)){flush();out.push(...await block(n,cell));}
  else run.push(...inline(n));
 }
 flush();return out;
}
async function block(n,cell){
 const tag=n.tagName;
 if(tag==='IMG')return [await imageNode(n.getAttribute('src')||'',cell,n.getAttribute('alt')||'')];
 if(tag==='PRE')return [code(n.textContent)];
 if(tag==='HR')return [{canvas:[{type:'line',x1:0,y1:0,x2:480,y2:0,lineWidth:.6,lineColor:palette.line}],margin:[0,4,0,7]}];
 if(/^H[1-6]$/.test(tag))return [{text:inline(n),style:'h'+tag[1],headline:true}];
 if(tag==='TABLE'){
  const rows=[...n.querySelectorAll('tr')];const count=Math.max(0,...rows.map(r=>r.cells.length));if(!count)return [];
  const body=rows.map(r=>Array.from({length:count},(_,i)=>({text:r.cells[i]?inline(r.cells[i]):'',bold:r.cells[i]?.tagName==='TH',fillColor:r.cells[i]?.tagName==='TH'?'#e8eef6':undefined,fontSize:10})));
  const headerRows=rows[0]?.querySelector('th')?1:0;
  return [{table:{headerRows,widths:Array(count).fill('*'),body},layout:'lightHorizontalLines',margin:[0,4,0,9]}];
 }
 if(tag==='UL'||tag==='OL'){const list=[];for(const li of [...n.children].filter(x=>x.tagName==='LI')){const content=await children(li.childNodes,cell);list.push({stack:content.length?content:[plain(' ')]});}return list.length?[{[tag==='UL'?'ul':'ol']:list,margin:[0,0,0,6]}]:[];}
 if(tag==='MATH'||n.hasAttribute('data-math')){try{return [{svg:mathSvg(n.getAttribute('data-math')||n.textContent),fit:[470,120],margin:[0,5,0,5]}];}catch{return [plain(n.textContent),notice('数式は原文表示')];}}
 if(tag==='DETAILS')return [{stack:await children(n.childNodes,cell),margin:[10,4,0,7]}];
 if(tag==='SUMMARY')return [{text:inline(n),bold:true,color:palette.blue,margin:[0,2,0,4]}];
 if(tag==='BLOCKQUOTE')return [{stack:await children(n.childNodes,cell),margin:[12,3,0,7],color:palette.muted}];
 // Split paragraphs at embedded images and block elements without losing surrounding text.
 return await children(n.childNodes,cell);
}
async function renderMarkup(src,cell){
 const root=inert(markdown.render(src));
 return await children(root.childNodes,cell);
}
export async function notebookDefinition(doc){
 const content=[];
 for(const cell of doc.cells){
  const src=sourceText(cell);
  if(cell.cell_type==='code'){content.push(code(src));}
  else if(cell.cell_type==='markdown'){content.push(...await renderMarkup(src,cell));}
  else content.push(plain(src));
  const outputs=savedOutputs(cell);
  if(outputs.length)content.push({text:'実行結果',color:palette.muted,fontSize:10,bold:true,margin:[0,2,0,3]});
  for(const o of outputs){
   if(o.kind==='image'){try{content.push(await rasterImage(o.mime,o.data));}catch(e){content.push(notice('保存済み画像を再現できません: '+e.message));}}
   else if(o.kind==='html'){const nodes=await children(inert(o.html).childNodes,cell);content.push(...(nodes.length?nodes:[plain(o.text)]));}
   else content.push(o.kind==='notice'?notice(o.text):code(o.text));
  }
 }
 return {pageSize:'A4',pageMargins:[42,42,42,42],content:content.length?content:[plain('空のNotebook')],defaultStyle:{font:'UD',fontSize:11,lineHeight:1.35,color:palette.ink},styles:{h1:{fontSize:22,bold:true,color:palette.ink,margin:[0,10,0,10]},h2:{fontSize:18,bold:true,color:palette.ink,margin:[0,10,0,7]},h3:{fontSize:15,bold:true,color:palette.blue,margin:[0,9,0,6]},h4:{fontSize:13,bold:true,margin:[0,7,0,5]},h5:{fontSize:12,bold:true},h6:{fontSize:11,bold:true}},footer:(p,total)=>({text:p+' / '+total,alignment:'center',color:palette.muted,fontSize:9,margin:[0,12,0,0]}),pageBreakBefore:(node,following)=>node.headline===true&&!following.length};
}
export async function notebookToPdf(doc){
 const definition=await notebookDefinition(doc);
 return new Promise((resolve,reject)=>{try{pdfMake.createPdf(definition).getBuffer(bytes=>resolve(new Uint8Array(bytes)));}catch(e){reject(e);}});
}
