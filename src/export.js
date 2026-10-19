import {sourceText} from './core.js';
const encoder=new TextEncoder();
function sid(i){return `report-${String(i).padStart(6,'0')}`;}
function md(source,id,attachments=undefined){return {cell_type:'markdown',id,metadata:{},source, ...(attachments?{attachments}:{})};}
function escFence(text){ const fences=String(text).match(/`{3,}/g)||[];return '`'.repeat(Math.max(3,...fences.map(x=>x.length+1)));}
function safeInline(text){return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g,' ')}
function asLiteral(text,lang='text'){const s=clipped(text),f=escFence(s);return `${f}${lang}\n${s}\n${f}`;}
function clipped(text,n=50000){const s=String(text);return s.length>n?s.slice(0,n)+'\n（表示文字数の上限により省略）':s;}
function snippet(item){
  if(item.type==='code'){
    const f=escFence(item.text);return `${f}python\n${clipped(item.text)}\n${f}`;
  }
  return asLiteral(item.text);
}
function attachOutputs(outputs,index,attachments){
  const lines=[];let n=0;
  for(const output of outputs||[]){
    if(output.kind==='image'){
      const valid=/^[a-zA-Z0-9+/=\r\n]+$/.test(output.base64||'') && output.base64.length<15_000_000;
      if(!valid){lines.push('画像出力：大きすぎるか不正なため除外');continue;}
      const filename=`output-${index}-${n++}.${output.format==='png'?'png':'jpg'}`;
      attachments[filename]={[`image/${output.format}`]:output.base64.replace(/\s/g,'')};
      lines.push(`![保存された実行結果](${`attachment:${filename}`})`);
    }else if(output.kind==='notice'){lines.push(output.text);}else{
      const f=escFence(output.text);lines.push(`${f}text\n${clipped(output.text,12000)}\n${f}`);
    }
  }
  return lines.join('\n\n');
}
function detailsForCell(c){return `**元セル ${c.index+1}（${safeInline(c.id||'IDなし')}）・${c.type}**` +
  `\n\n${snippet(c)}`;}
export function makeReportNotebook(result){
  const cells=[];let seq=0;
  const add=(s,attach)=>cells.push(md(s,sid(++seq),Object.keys(attach||{}).length?attach:undefined));
  const title=result.studentNotebook.cells?.[0] ? clipped(sourceText(result.studentNotebook.cells[0]),140) : '';
  add(`# 活動・成果物抽出レポート\n\n- 提出元: ${safeInline(result.path)}\n- 元ファイル名: ${safeInline(result.name)}\n- 解析: ${result.mode}\n- 元のタイトル: ${safeInline(title.replace(/^#+\s*/,''))}\n- **注意**: 自動抽出は採点結果ではありません。要確認箇所を元のNotebookと照らして確認してください。`);
  if(result.warnings.length)add(`## 確認事項\n\n${result.warnings.map(w=>'- '+safeInline(w)).join('\n')}`);
  add(`## 活動一覧\n\n${result.activities.map(a=>`- ${safeInline(a.id)} ${safeInline(a.label)}：${safeInline(a.title)}（入力欄 ${a.inputs.length}件）`).join('\n')||'活動は検出されませんでした。'}`);
  for(const a of result.activities){
    add(`## ${safeInline(a.id)} ${safeInline(a.label)}：${safeInline(a.title)}${a.recovered?'（構造から復元）':''}\n\n**元教材の指示（原文抜粋）**\n\n${asLiteral(a.instruction||'指示文を特定できませんでした。')}`);
    for(const slot of a.inputs){
      const attach={};const lines=[];
      lines.push(`### ${safeInline(slot.label)}\n\n判定：**${safeInline(slot.status)}**${slot.recovered?'（元の入力欄を復元）':''}`);
      if(!slot.sourceCells.length)lines.push('記入用セルが検出されませんでした。');
      for(const c of slot.sourceCells){
        lines.push(detailsForCell(c));
        if(c.outputs.length)lines.push('**保存済み実行結果**\n\n'+attachOutputs(c.outputs,c.index,attach));
        else if(c.type==='code')lines.push('保存済み実行結果なし');
      }
      add(lines.join('\n\n'),attach);
    }
  }
  if(result.extras.length){
    add('## 指定入力欄以外の変更・追加セル（補助確認）');
    for(const x of result.extras){
      const attach={};let s=`### ${x.kind}：セル ${x.index+1}\n\n所属：${safeInline(x.activityId||'未分類')}\n\n理由：${safeInline(x.reason)}\n\n${detailsForCell(x)}`;
      if(x.outputs.length)s+='\n\n**保存済み実行結果**\n\n'+attachOutputs(x.outputs,x.index,attach);
      add(s,attach);
    }
  }
  add('## 再実行用コード（原文順）\n\n以下は提出されたNotebookのコードセルを**元の順序**で保持したものです。Notebookの見た目を整理するため、ソースを折りたたむメタデータを設定しています。Colab等で表示状態は異なります。\n\n**注意：** このNotebookで「すべて実行」を行う前に、コード内容・依存ライブラリ・外部ファイル・実行順序を確認してください。ブラウザ側でこれらのコードは実行していません。');
  for(const [i,c] of result.studentNotebook.cells.entries()) {
    if(c.cell_type!=='code')continue;
    const copied=JSON.parse(JSON.stringify(c));
    copied.id=sid(++seq);
    // Do not forward active HTML/JavaScript/SVG outputs into an exported grading notebook.
    copied.outputs=(copied.outputs||[]).map(o=>{
      if(!o?.data)return o;
      o.data=Object.fromEntries(Object.entries(o.data).filter(([type])=>
        ['text/plain','image/png','image/jpeg'].includes(type)));
      return o;
    });
    copied.metadata={...copied.metadata,jupyter:{...(copied.metadata?.jupyter||{}),source_hidden:true},activity_extractor:{original_cell_index:i,original_cell_id:c.id||null}};
    cells.push(copied);
  }
  return {cells,metadata:{kernelspec:result.studentNotebook.metadata?.kernelspec||{display_name:'Python 3',language:'python',name:'python3'},
    language_info:result.studentNotebook.metadata?.language_info||{name:'python'},
    activity_extractor:{schema_version:'0.2.0',source_path:result.path,mode:result.mode}},nbformat:4,nbformat_minor:5};
}
export function serializeReport(result){return JSON.stringify(makeReportNotebook(result),null,1)+'\n';}
/** Preserve original path components; reject unsafe archive paths. */
export function safeZipEntryPath(path) {
  if(typeof path!=='string' || !path || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path))
    throw new Error('不正なファイルパスです。');
  const parts=path.replace(/\\/g,'/').split('/');
  if(parts.some(s=>!s || s==='.' || s==='..' || /[\x00-\x1f\x7f]/.test(s)))
    throw new Error('不正なフォルダ名またはファイル名があります。');
  return parts.join('/');
}
/** Add only the suffix to the original filename; preserve all directories. */
export function organizedNotebookPath(sourcePath) {
  const path=safeZipEntryPath(sourcePath);
  if(!/\.ipynb$/i.test(path))throw new Error('Notebook（.ipynb）を指定してください。');
  return path.replace(/(\.ipynb)$/i,'_整理済み$1');
}
const CRC_TABLE=new Uint32Array(256);
for(let n=0;n<256;n++) {let c=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xEDB88320:0);CRC_TABLE[n]=c>>>0;}
function crc32(data){let crc=0xFFFFFFFF;for(const byte of data)crc=(crc>>>8)^CRC_TABLE[(crc^byte)&0xff];return (crc^0xFFFFFFFF)>>>0;}
function set16(v,o,n){v.setUint16(o,n,true);}function set32(v,o,n){v.setUint32(o,n,true);}
export function createZip(entries){
  const locals=[],central=[];let offset=0;
  const seen=new Set();
  for(const {name,data} of entries){
    const relativePath=safeZipEntryPath(name);
    if(seen.has(relativePath))throw new Error(`出力ファイル名が重複しています：${relativePath}`);
    seen.add(relativePath);
    const filename=encoder.encode(relativePath);
    if(filename.length>65535)throw new Error('ZIP内のファイル名が長すぎます。');const content=typeof data==='string'?encoder.encode(data):data;
    const crc=crc32(content);const h=new Uint8Array(30+filename.length),v=new DataView(h.buffer);
    set32(v,0,0x04034b50);set16(v,4,20);set16(v,6,0x0800);set16(v,8,0);set32(v,14,crc);set32(v,18,content.length);set32(v,22,content.length);set16(v,26,filename.length);h.set(filename,30);
    locals.push(h,content);
    const cent=new Uint8Array(46+filename.length),c=new DataView(cent.buffer);
    set32(c,0,0x02014b50);set16(c,4,20);set16(c,6,20);set16(c,8,0x0800);set16(c,10,0);set32(c,16,crc);set32(c,20,content.length);set32(c,24,content.length);set16(c,28,filename.length);set32(c,42,offset);cent.set(filename,46);
    central.push(cent);offset+=h.length+content.length;
  }
  if(entries.length>65535)throw Error('ZIPファイル数が上限を超えました');
  const centralBytes=central.reduce((s,c)=>s+c.length,0);
  const footer=new Uint8Array(22),e=new DataView(footer.buffer);set32(e,0,0x06054b50);set16(e,8,entries.length);set16(e,10,entries.length);set32(e,12,centralBytes);set32(e,16,offset);
  const total=offset+centralBytes+footer.length,all=new Uint8Array(total);let p=0;
  for(const ch of [...locals,...central,footer]){all.set(ch,p);p+=ch.length;}
  return all;
}

/** Single file gives an .ipynb; folder always gives a ZIP, even for one .ipynb. */
export function buildDownload(results, mode) {
  if(!Array.isArray(results) || !results.length)throw new Error('出力対象がありません。');
  if(mode==='single') {
    if(results.length!==1)throw new Error('単一ファイルモードでは1件だけ出力できます。');
    const result=results[0];
    return {name:organizedNotebookPath(result.name),type:'application/x-ipynb+json',data:serializeReport(result)};
  }
  if(mode!=='folder')throw new Error('出力モードが不正です。');
  const entries=results.map(result=>({name:organizedNotebookPath(result.path),data:serializeReport(result)}));
  return {name:'整理済みNotebook一式.zip',type:'application/zip',data:createZip(entries)};
}
