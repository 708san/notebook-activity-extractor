import {sourceText} from './core.js';
import {organizedNotebookPath, safeZipEntryPath, normalizeOutputSuffix, pathCollisionKey} from './naming.js';
export {organizedNotebookPath, safeZipEntryPath, normalizeOutputSuffix} from './naming.js';
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
function detailsForCell(c){return `**提出Notebook：セル ${c.index+1}（ID: ${safeInline(c.id||'なし')}）・${c.type}**` +
  `\n\n${snippet(c)}`;}
function assessmentActivity(a){return a.inputs.length>0 || (a.extras||[]).length>0;}
function summaryTable(activities) {
  const rows=['| 活動 | 記入・変更 | 保存済み実行結果 | 確認 |','| --- | --- | --- | --- |'];
  for(const a of activities.filter(assessmentActivity)) {
    const states=a.inputs.map(s=>s.status);
    const change=states.includes('変更検出')?'変更検出':states.includes('回答未検出')?'回答未検出':
      states.includes('記入候補')?'記入候補':states.length?'初期状態と同じ':'追加セルのみ';
    const missing=a.inputs.flatMap(s=>s.blankItems||[]);
    const out=a.inputs.some(s=>s.outputState==='保存済み結果あり')?'保存済みあり':
      a.inputs.some(s=>s.outputState?.startsWith('実行結果未保存'))?'未保存（実行状況不明）':'対象外';
    const caution=[missing.length?'空欄候補 '+missing.length+'件':null,a.recovered?'活動を復元':null].filter(Boolean).join('、')||'—';
    rows.push(`| ${safeInline(a.id+' '+a.title).replace(/\|/g,'\\|')} | ${change} | ${out} | ${caution} |`);
  }
  return rows.length===2 ? '評価対象の入力欄は見つかりませんでした。' : rows.join('\n');
}
export function makeReportNotebook(result){
  const cells=[];let seq=0;
  const add=(s,attach)=>cells.push(md(s,sid(++seq),Object.keys(attach||{}).length?attach:undefined));
  const title=result.studentNotebook.cells?.[0] ? clipped(sourceText(result.studentNotebook.cells[0]),140) : '';
  add(`# 活動・成果物抽出レポート\n\n- 提出元: ${safeInline(result.path)}\n- 解析: ${result.mode}\n- 元のタイトル: ${safeInline(title.replace(/^#+\s*/,''))}\n- **注意**: 自動抽出は採点・完了判定ではありません。空欄や未保存の表示は元Notebookで確認してください。`);
  if(result.warnings.length)add(`## 確認事項\n\n${result.warnings.map(w=>'- '+safeInline(w)).join('\n')}`);
  add(`## 活動別確認一覧\n\n${summaryTable(result.activities)}\n\n「変更検出」は正答・完了を意味しません。実行結果の「未保存」は未実行とは限りません。`);
  const assessment=result.activities.filter(assessmentActivity);
  const informational=result.activities.filter(a=>!assessmentActivity(a));
  for(const a of assessment){
    const sections=a.instructionSections || {main:a.instruction,supplement:[],references:[]};
    let head=`## ${safeInline(a.id)} ${safeInline(a.label)}：${safeInline(a.title)}${a.recovered?'（構造から復元）':''}`;
    if(sections.main)head+=`\n\n### 活動の指示（元教材）\n\n${sections.main}`;
    else head+='\n\n指示文を特定できませんでした。';
    add(head);
    for(const slot of a.inputs){
      const attach={};const lines=[];
      lines.push(`### ${safeInline(slot.label)}\n\n- 変更：**${safeInline(slot.status)}**${slot.recovered?'（入力欄を復元）':''}\n- 記入の目安：${safeInline(slot.evidenceState||'判定対象外')}\n- 実行結果：${safeInline(slot.outputState||'対象外')}`);
      if(slot.blankItems?.length)lines.push(`**空欄候補**：${slot.blankItems.map(safeInline).join('、')}（自動判定のため確認が必要）`);
      if(!slot.sourceCells.length)lines.push('記入用セルが検出されませんでした。');
      for(const c of slot.sourceCells){
        lines.push(detailsForCell(c));
        if(c.outputs.length)lines.push('**保存済み実行結果**\n\n'+attachOutputs(c.outputs,c.index,attach));
        else if(c.type==='code')lines.push('保存済み実行結果なし（実行したかどうかは不明）');
      }
      add(lines.join('\n\n'),attach);
    }
    const extras=result.extras.filter(x=>x.activityId===a.id);
    if(extras.length)add(`### 指定入力欄以外の変更・追加セル\n\n${extras.map(x=>`- 提出セル ${x.index+1}：${safeInline(x.reason)}`).join('\n')}\n\n詳細は後半の「その他の変更・要確認」を参照してください。`);
  }
  if(informational.length){
    add(`## 入力欄のない活動（参考）\n\n${informational.map(a=>'- '+safeInline(a.id+' '+a.label+'：'+a.title)).join('\n')}\n\n採点用の通常表示からは省き、元Notebookのコードは再実行用として保持しています。`);
  }
  const related=result.missingReference||[];
  if(result.extras.length||related.length){
    add('## その他の変更・要確認\n\n入力欄の外にあった変更や、原本との対応を確認できなかったセルです。削除候補は削除が確定したことを意味しません。');
    for(const x of result.extras){
      const attach={};let ss=`### ${safeInline(x.kind)}：提出セル ${x.index+1}\n\n所属活動：${safeInline(x.activityId||'未分類')}\n\n理由：${safeInline(x.reason)}\n\n${detailsForCell(x)}`;
      if(x.outputs.length)ss+='\n\n**保存済み実行結果**\n\n'+attachOutputs(x.outputs,x.index,attach);
      add(ss,attach);
    }
    if(related.length){
      add(`### 原本側で対応が見つからなかったセル（${related.length}件）\n\n`+related.map(x=>`- **原本セル ${x.index+1}**（ID: ${safeInline(x.id||'なし')}、活動 ${safeInline(x.activityId||'未分類')}）：${safeInline(x.kind)}${x.preview?'／'+safeInline(x.preview.slice(0,90)):''}`).join('\n'));
    }
  }
  const supplements=[];
  for(const a of result.activities){
    const ins=a.instructionSections;
    if(!ins?.supplement?.length && !ins?.references?.length)continue;
    let section=`### ${safeInline(a.id)} ${safeInline(a.title)}`;
    for(const extra of (ins.supplement||[]))section+=`\n\n**補足説明（元教材セル ${extra.sourceIndex+1}）**\n\n${extra.text}`;
    for(const ref of (ins.references||[]))section+=`\n\n**${safeInline(ref.kind)}：${safeInline(ref.label)}（元教材セル ${ref.sourceIndex+1}）**\n\n${ref.content}`;
    supplements.push(section);
  }
  if(supplements.length){
    add('## 元教材の補足説明・解答例（参照用）\n\n採点時に必要な場合だけ、この章を参照してください。以下は生徒の回答ではありません。');
    for(const txt of supplements)add(txt);
  }
  add('## 再実行用コード（提出Notebookの順序）\n\n以下は提出されたNotebookのコードセルを元の順序で保持したものです。ソースを折りたたむ設定を付けていますが、Colab等での表示状態は異なります。\n\n**注意：** 「すべて実行」の前にコード内容・ライブラリ・外部ファイル・実行順序を確認してください。アプリ内で提出コードは実行していません。');
  for(const [i,c] of result.studentNotebook.cells.entries()){
    if(c.cell_type!=='code')continue;
    const copied=JSON.parse(JSON.stringify(c));
    copied.id=sid(++seq);
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
    activity_extractor:{schema_version:'0.4.0',source_path:result.path,mode:result.mode}},nbformat:4,nbformat_minor:5};
}
export function serializeReport(result){return JSON.stringify(makeReportNotebook(result),null,1)+'\n';}
export function safeFileName(name){return safeZipEntryPath(name);}
export function safeZipPath(name){return safeZipEntryPath(name);}
export function buildDownload(results,uploadMode='single',extraSuffix=''){
  if(!results.length)throw Error('出力するNotebookがありません。');
  const suffix=normalizeOutputSuffix(extraSuffix);
  const seen=new Set(),entries=[];
  for(const r of results){
    const path=organizedNotebookPath(r.path,suffix);
    const collision=pathCollisionKey(path);
    if(seen.has(collision))throw Error('OS間で同名になる提出物があります：'+path);
    seen.add(collision);
    entries.push({name:path,data:serializeReport(r)});
  }
  if(uploadMode==='single' && entries.length===1){
    return {name:entries[0].name.split('/').pop(),type:'application/x-ipynb+json',data:entries[0].data};
  }
  return {name:'organized_notebooks.zip',type:'application/zip',data:createZip(entries)};
}
const CRC_TABLE=new Uint32Array(256);
for(let n=0;n<256;n++) {let c=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xEDB88320:0);CRC_TABLE[n]=c>>>0;}
function crc32(data){let crc=0xFFFFFFFF;for(const byte of data)crc=(crc>>>8)^CRC_TABLE[(crc^byte)&0xff];return (crc^0xFFFFFFFF)>>>0;}
function set16(v,o,n){v.setUint16(o,n,true);}function set32(v,o,n){v.setUint32(o,n,true);}
export function createZip(entries){
  const locals=[],central=[],usedPaths=new Set();let offset=0;
  for(const {name,data} of entries){
    const safeName=safeZipEntryPath(name);const key=pathCollisionKey(safeName);
    if(usedPaths.has(key))throw Error('ZIP内で出力パスが重複します：'+safeName);
    usedPaths.add(key);
    const filename=encoder.encode(safeName);const content=typeof data==='string'?encoder.encode(data):data;
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