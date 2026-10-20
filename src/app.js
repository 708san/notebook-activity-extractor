import {validateNotebook, analyzeNotebook} from './core.js';
import {buildDownload, organizedNotebookPath} from './export.js';
const $=id=>document.getElementById(id);
let uploadMode='single', displayMode='student', results=[];
const MAX_FILE=35*1024*1024, MAX_TOTAL=160*1024*1024, MAX_COUNT=200;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
function add(parent,child){parent.appendChild(child);return child;}
function status(text,error=false){$('progress').textContent=text;$('progress').classList.toggle('error',error);}
function modeChange(mode){uploadMode=mode;for(const [id,on] of [['singleMode',mode==='single'],['folderMode',mode==='folder']]){
  $(id).classList.toggle('on',on);$(id).setAttribute('aria-pressed',String(on));
} $('submission').hidden=mode!=='single';$('folderInput').hidden=mode!=='folder';
$('submissionHint').textContent=mode==='single'?' .ipynbを1件選択してください。':'フォルダ以下にある.ipynbを再帰的に読み込みます。';}
$('singleMode').addEventListener('click',()=>modeChange('single'));
$('folderMode').addEventListener('click',()=>modeChange('folder'));
function filesToProcess(){const list=[...$(uploadMode==='single'?'submission':'folderInput').files];return list.filter(f=>f.name.toLowerCase().endsWith('.ipynb'));}
async function loadFile(file){if(file.size>MAX_FILE)throw Error('ファイルが35MBの上限を超えています');
 try {return validateNotebook(JSON.parse(await file.text()));}catch(e){throw Error(e instanceof SyntaxError?'NotebookのJSONを読めませんでした':e.message);}}
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function updateFilenamePreview(){
  const display=$('filenamePreview');
  const files=filesToProcess();
  const example=files[0]?.webkitRelativePath || files[0]?.name || '第2章第6回.ipynb';
  try{
    const path=organizedNotebookPath(example, $('outputSuffix').value);
    display.textContent='出力名の例：'+path+(uploadMode==='folder'?'（ZIP内）':'');
    display.classList.remove('error');
  }catch(e){display.textContent=e.message;display.classList.add('error');}
}
$('outputSuffix').addEventListener('input',updateFilenamePreview);
$('submission').addEventListener('change',updateFilenamePreview);
$('folderInput').addEventListener('change',updateFilenamePreview);
$('singleMode').addEventListener('click',updateFilenamePreview);
$('folderMode').addEventListener('click',updateFilenamePreview);
updateFilenamePreview();
$('run').addEventListener('click',async()=>{
 const files=filesToProcess();
 if(!files.length){status('提出Notebook（.ipynb）を選択してください。',true);return;}
 if(files.length>MAX_COUNT||files.reduce((s,f)=>s+f.size,0)>MAX_TOTAL){status('200件または合計160MBの上限を超えています。',true);return;}
 $('run').disabled=true;results=[];$('results').hidden=true;const errors=[];const referenceFile=$('reference').files[0];
 let reference=null;
 try{
   if(referenceFile){status('原本を解析中…');reference=await loadFile(referenceFile);}
   for(const [index,file] of files.entries()){
     status(`${index+1}/${files.length}件を解析中：${file.name}`);await nextFrame();
     try{const notebook=await loadFile(file);const path=file.webkitRelativePath||file.name;
       const report=analyzeNotebook(notebook,reference,path);results.push(report);
     }catch(e){errors.push(`${file.webkitRelativePath||file.name}：${e.message}`);}
   }
   if(!results.length){status('有効なNotebookがありません。'+errors.join(' / '),true);return;}
   $('results').hidden=false;
   $('summary').textContent=`${results.length}件のNotebook、${results.reduce((s,r)=>s+r.activities.length,0)}件の活動を解析しました。`;
   $('alerts').replaceChildren();for(const message of errors)add($('alerts'),el('p','alert',message));
   for(const r of results)for(const message of r.warnings)add($('alerts'),el('p','alert',`${r.path}：${message}`));
   status(`${results.length}件の解析が完了しました。${errors.length?`失敗 ${errors.length}件。`:''}`);render();
 }catch(e){status(`解析エラー：${e.message}`,true);}
 finally{$('run').disabled=false;}
});
function switchView(v){displayMode=v;for(const [id,on] of [['byStudent',v==='student'],['byActivity',v==='activity']]){
 $(id).classList.toggle('on',on);$(id).setAttribute('aria-pressed',String(on));
 }render();}
$('byStudent').addEventListener('click',()=>switchView('student'));
$('byActivity').addEventListener('click',()=>switchView('activity'));
$('search').addEventListener('input',render);
// Render a small safe subset of Markdown with DOM nodes only (no innerHTML or remote assets).
function appendInline(parent,raw){
 const pieces=String(raw).split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
 for(const part of pieces){if(!part)continue;
   if(part.startsWith('**')&&part.endsWith('**'))add(parent,el('strong','',part.slice(2,-2)));
   else if(part.startsWith('`')&&part.endsWith('`'))add(parent,el('code','',part.slice(1,-1)));
   else parent.appendChild(document.createTextNode(part));
 }
}
function appendMarkdown(parent,raw){
 const lines=String(raw).replace(/\r/g,'').split('\n');let i=0;
 while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
   if(/^\s*(`{3,}|~{3,})/.test(line)){
     const mark=line.trim().slice(0,3);const values=[];i++;
     while(i<lines.length&&!lines[i].trim().startsWith(mark))values.push(lines[i++]);
     if(i<lines.length)i++;add(parent,el('pre','cell-source',values.join('\n')));continue;
   }
   if(/^\s*\|.*\|\s*$/.test(line) && /^\s*\|\s*:?-{2,}/.test(lines[i+1]||'')){
     const table=add(parent,el('table','instruction-table'));
     const cols=t=>t.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
     const head=add(table,el('thead'));const tr=add(head,el('tr'));
     for(const txt of cols(lines[i]))appendInline(add(tr,el('th')),txt);
     i+=2;const body=add(table,el('tbody'));
     while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){
       const row=add(body,el('tr'));for(const txt of cols(lines[i++]))appendInline(add(row,el('td')),txt);
     }continue;
   }
   if(/^\s*#{1,5}\s+/.test(line)){
     const t=line.match(/^\s*(#{1,5})\s+(.*)$/);appendInline(add(parent,el('h4','')),t[2]);i++;continue;
   }
   if(/^\s*>/.test(line)){
     const block=add(parent,el('blockquote','instruction-quote'));
     while(i<lines.length&&/^\s*>/.test(lines[i])){
       appendInline(add(block,el('p','')),lines[i++].replace(/^\s*>\s?/,''));
     }continue;
   }
   if(/^\s*(?:[-*]\s+|\d+[.]\s+)/.test(line)){
     const ordered=/^\s*\d+[.]\s+/.test(line),list=add(parent,el(ordered?'ol':'ul','instruction-list'));
     while(i<lines.length&&/^\s*(?:[-*]\s+|\d+[.]\s+)/.test(lines[i])){
       appendInline(add(list,el('li','')),lines[i++].replace(/^\s*(?:[-*]|\d+[.])\s+/,''));
     }continue;
   }
   const paragraph=[];
   while(i<lines.length && lines[i].trim() && !/^\s*(?:\|.*\||#{1,5}\s+|>|[-*]\s+|\d+[.]\s+|`{3,}|~{3,})/.test(lines[i]))paragraph.push(lines[i++]);
   if(!paragraph.length){appendInline(add(parent,el('p','')),lines[i++]);continue;}
   appendInline(add(parent,el('p','')),paragraph.join(' '));
 }
}
function activitySummary(parent,activities){
 const relevant=activities.filter(a=>a.inputs.length||(a.extras||[]).length);
 if(!relevant.length)return;
 const d=add(parent,el('details','activity-overview'));add(d,el('summary','',`活動別の確認一覧（${relevant.length}活動）`));
 const table=add(d,el('table','instruction-table'));const tr=add(add(table,el('thead')),el('tr'));
 for(const h of ['活動','変更・記入','保存済み結果','要確認'])add(tr,el('th','',h));
 const body=add(table,el('tbody'));
 for(const a of relevant){
   const statuses=a.inputs.map(x=>x.status);const warnings=a.inputs.flatMap(x=>x.blankItems||[]);
   const change=statuses.includes('変更検出')?'変更あり':statuses.includes('記入候補')?'記入候補':statuses.includes('回答未検出')?'回答未検出':'初期状態または追加';
   const output=a.inputs.some(x=>x.outputState==='保存済み結果あり')?'あり':a.inputs.some(x=>x.outputState?.startsWith('実行結果未保存'))?'未保存':'対象外';
   const row=add(body,el('tr'));for(const v of [a.id+' '+a.title,change,output,warnings.length?`空欄候補 ${warnings.length}件`:'—'])add(row,el('td','',v));
 }
}
function sourceBlock(parent,source,type){const pre=add(parent,el('pre','cell-source',source));if(type==='code')pre.setAttribute('aria-label','生徒のコード');return pre;}
function showOutput(parent,outputs){for(const out of outputs||[]){
 if(out.kind==='image'){
   if(!/^[A-Za-z0-9+/=\s]+$/.test(out.base64)||out.base64.length>15_000_000){add(parent,el('p','helper','画像出力を表示できません。'));continue;}
   const img=el('img','output-img');img.alt='Notebookに保存された画像出力';img.src=`data:image/${out.format};base64,${out.base64.replace(/\s/g,'')}`;add(parent,img);
 }else add(parent,el('pre','cell-output',out.text));
}}
function showSlot(parent,slot){const container=add(parent,el('div','slot'));const head=add(container,el('div','slot-head'));
 add(head,el('strong','',slot.label));add(head,el('span','chip '+(slot.status==='変更検出'?'changed':slot.status==='回答未検出'?'warn':''),slot.status));
 add(container,el('p','helper',`記入の目安：${slot.evidenceState||'判定対象外'} / 実行結果：${slot.outputState||'対象外'}`));
 if(slot.blankItems?.length)add(container,el('p','helper',`空欄候補：${slot.blankItems.join('、')}（要確認）`));
 if(!slot.sourceCells.length)add(container,el('p','helper','記入用セルが検出されません。'));
 for(const c of slot.sourceCells){add(container,el('div','cell-meta',`提出セル ${c.index+1} · ${c.type} · ID: ${c.id||'なし'}`));sourceBlock(container,c.text,c.type);
 if(c.outputs.length){const d=add(container,el('details'));add(d,el('summary','','保存済みの実行結果を見る'));showOutput(d,c.outputs);}
 else if(c.type==='code')add(container,el('div','helper','実行結果は保存されていません'));}
}
function addExtras(parent,r,items){if(!items.length)return;const d=add(parent,el('details'));add(d,el('summary','',`その他の変更・追加セル ${items.length}件（確認・割り当て修正）`));
 for(const x of items){const row=add(d,el('div','extra'));add(row,el('p','',`${x.kind}: セル ${x.index+1} / ${x.reason}`));
 const label=add(row,el('label','helper','活動の割り当て： '));const sel=add(label,el('select'));
 add(sel,el('option','',`未分類`)).value='';for(const a of r.activities)add(sel,el('option','',`${a.id} ${a.title}`)).value=a.id;
 sel.value=x.activityId||'';sel.addEventListener('change',()=>{x.activityId=sel.value||null;render();});
 sourceBlock(row,x.text,x.type);if(x.outputs?.length)showOutput(row,x.outputs);}
}
function showActivity(parent,r,a,includeExtras=false){const block=add(parent,el('div','activity'));add(block,el('h3','',`${a.id} ${a.label}：${a.title}${a.recovered?'（復元）':''}`));
 if(a.instruction){const d=add(block,el('details'));add(d,el('summary','','活動の指示（元教材の書式を保持）'));appendMarkdown(add(d,el('div','instruction')),a.instruction);}
 const ins=a.instructionSections;if(ins&&(ins.supplement?.length||ins.references?.length)){const d=add(block,el('details'));add(d,el('summary','','元教材の補足・解答例（参考）'));
 for(const extra of ins.supplement||[])appendMarkdown(add(d,el('div','instruction')),extra.text);
 for(const ref of ins.references||[]){add(d,el('h4','',ref.label));appendMarkdown(add(d,el('div','instruction')),ref.content);}}
 if(!a.inputs.length)add(block,el('p','helper','指定入力欄が見つかりません。'));
 for(const s of a.inputs)showSlot(block,s);
 if(includeExtras)addExtras(block,r,r.extras.filter(x=>x.activityId===a.id));
}
function addMissingReference(parent,items){
 if(!items?.length)return;
 const d=add(parent,el('details'));add(d,el('summary','',`原本側の削除・対応不明セル ${items.length}件（確認）`));
 for(const x of items){const row=add(d,el('div','extra'));add(row,el('p','',`原本セル ${x.index+1} / 活動 ${x.activityId||'未分類'} / ${x.kind}`));
 if(x.preview)add(row,el('pre','cell-source',x.preview));}
}
function studentCard(root,r){const card=add(root,el('section','card'));const header=add(card,el('div','card-header'));const namebox=add(header,el('div'));
 add(namebox,el('h3','',r.name));add(namebox,el('p','',r.path));add(header,el('span','chip',r.mode));
 const body=add(card,el('div','card-body'));
 activitySummary(body,r.activities);
 for(const a of r.activities.filter(x=>x.inputs.length||(x.extras||[]).length))showActivity(body,r,a);
 const note=r.activities.filter(x=>!x.inputs.length&&!(x.extras||[]).length);
 if(note.length){const d=add(body,el('details'));add(d,el('summary','',`入力欄のない活動（参考）${note.length}件`));
 for(const a of note)add(d,el('p','',`${a.id} ${a.title}`));}
 addExtras(body,r,r.extras);addMissingReference(body,r.missingReference);if(!r.activities.length)add(body,el('div','empty','認識可能な活動がありません。'));
}
function activityCards(root,visible){const ids=new Map();for(const r of visible)for(const a of r.activities){if(!ids.has(a.id))ids.set(a.id,[]);ids.get(a.id).push([r,a]);}
 for(const [id,items] of ids){const card=add(root,el('section','card'));const header=add(card,el('div','card-header'));
 add(header,el('h3','',`${id} ${items[0][1].title}`));add(header,el('span','chip',`${items.length}件`));
 const body=add(card,el('div','card-body'));for(const [r,a] of items){const mini=add(body,el('div','activity'));
 add(mini,el('h3','',r.name));add(mini,el('p','helper',r.path));
 if(a.instruction && mini===body.firstChild){const d=add(mini,el('details'));add(d,el('summary','','元の指示を確認'));appendMarkdown(add(d,el('div','instruction')),a.instruction);}
 for(const s of a.inputs)showSlot(mini,s);
 addExtras(mini,r,r.extras.filter(x=>x.activityId===id));
 }}
}
function render(){if(!results.length)return;const root=$('resultList');root.replaceChildren();
 const q=$('search').value.trim().toLowerCase();const filtered=results.filter(r=>{
 if(!q)return true;return `${r.name} ${r.path} ${r.activities.map(a=>`${a.id} ${a.title} ${a.inputs.map(s=>s.sourceCells.map(c=>c.text).join(' '))}`).join(' ')}`.toLowerCase().includes(q);
 });
 if(!filtered.length){add(root,el('div','empty','一致する提出物がありません。'));return;}
 if(displayMode==='student')for(const r of filtered)studentCard(root,r);else activityCards(root,filtered);
}
function downloadBytes(bytes,name,type){const blob=new Blob([bytes],{type});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('download').addEventListener('click',()=>{
 if(!results.length)return;
 try{
  const {name,type,data}=buildDownload(results,uploadMode,$('outputSuffix').value);
  downloadBytes(data,name,type);
 }catch(e){status('出力に失敗しました：'+e.message,true);}
});
