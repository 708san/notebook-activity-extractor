import {sourceText} from './core.js';
import {safeZipEntryPath,normalizeOutputSuffix,pathCollisionKey} from './naming.js';
import {createZip} from './export.js';
const text=v=>typeof v==='string'?v:Array.isArray(v)?v.join(''):'';
export function cleanText(s){
 return s.replace(/!\[([^\]]*)\]\((?:data:|attachment:)[\s\S]*?\)/gi,'[画像: $1]')
 .replace(/<img\b[^>]*>/gi,'[画像]')
 .replace(/data:[^\s"'<>]+;base64,[a-z0-9+/=\r\n]+/gi,'[埋め込みデータ]')
 .replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'[非対応の埋め込み要素]')
 .replace(/<\/?(?:details|summary|span|div|font|strong|em|p)\b[^>]*>/gi,'').replace(/<br\s*\/?\s*>/gi,'\n');
}
export function htmlText(s){return cleanText(s.replace(/<\/(?:td|th)>/gi,'\t').replace(/<\/(?:tr|p|div|li)>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');}
export function savedOutputs(cell){
 const items=[];
 for(const o of Array.isArray(cell.outputs)?cell.outputs:[]){
  if(o.output_type==='stream'){items.push({kind:'text',text:text(o.text)});continue;}
  if(o.output_type==='error'){items.push({kind:'text',text:[o.ename,o.evalue,...(Array.isArray(o.traceback)?o.traceback:[])].filter(Boolean).join('\n').replace(/\x1b\[[0-9;]*m/g,'')});continue;}
  const d=o.data||{};let represented=false;
  for(const mime of ['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'])if(d[mime]){items.push({kind:'image',mime,data:text(d[mime])});represented=true;break;}
  if(d['text/html']){items.push({kind:'html',html:text(d['text/html']),text:text(d['text/plain'])||htmlText(text(d['text/html']))});represented=true;}
  else if(d['text/plain']){items.push({kind:'text',text:text(d['text/plain'])});represented=true;}
  if(!represented)items.push({kind:'notice',text:'[静的に再現できない保存済み出力: '+(Object.keys(d).join(', ')||o.output_type||'不明')+']'});
 }
 return items;
}
export function notebookToText(doc){
 return doc.cells.map(c=>{
 const source=sourceText(c);
 const body=c.cell_type==='code'?'[コード]\n'+source:cleanText(source);
 const outputs=savedOutputs(c).map(o=>o.kind==='image'?'[保存済み画像: '+o.mime+']':o.text);
 return body+(outputs.length?'\n\n[実行結果]\n'+outputs.join('\n\n'):'');
 }).join('\n\n')+'\n';
}
export function exportPath(path,ext,suffix=''){
 if(!['txt','pdf'].includes(ext))throw Error('未対応の出力形式');
 const safe=safeZipEntryPath(path);
 if(!/\.ipynb$/i.test(safe))throw Error('Notebookではありません');
 const extra=suffix.trim()?'_'+normalizeOutputSuffix(suffix):'';
 return safeZipEntryPath(safe.replace(/\.ipynb$/i,extra+'.'+ext));
}
export function packExports(entries,mode){
 const seen=new Set();
 for(const e of entries){const k=pathCollisionKey(e.name);if(seen.has(k))throw Error('出力名が重複しています: '+e.name);seen.add(k);}
 if(!entries.length)throw Error('出力がありません');
 if(mode==='single'&&entries.length===1)return {...entries[0],name:entries[0].name.split('/').pop()};
 return {name:'exported_notebooks.zip',type:'application/zip',data:createZip(entries)};
}
