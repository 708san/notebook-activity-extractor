import {validateNotebook, analyzeNotebook} from './core.js';
import {buildDownload} from './export.js';
const $=id=>document.getElementById(id);
let uploadMode='single', displayMode='student', processedMode='single', results=[];
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
$('run').addEventListener('click',async()=>{
 const files=filesToProcess();
 if(!files.length){status('提出Notebook（.ipynb）を選択してください。',true);return;}
 if(files.length>MAX_COUNT||files.reduce((s,f)=>s+f.size,0)>MAX_TOTAL){status('200件または合計160MBの上限を超えています。',true);return;}
 $('run').disabled=true;results=[];$('results').hidden=true;const selectedMode=uploadMode;const errors=[];const referenceFile=$('reference').files[0];
 let reference=null;
 try{
   if(referenceFile){status('正本を解析中…');reference=await loadFile(referenceFile);}
   for(const [index,file] of files.entries()){
     status(`${index+1}/${files.length}件を解析中：${file.name}`);await nextFrame();
     try{const notebook=await loadFile(file);const path=file.webkitRelativePath||file.name;
       const report=analyzeNotebook(notebook,reference,path);results.push(report);
     }catch(e){errors.push(`${file.webkitRelativePath||file.name}：${e.message}`);}
   }
   if(!results.length){status('有効なNotebookがありません。'+errors.join(' / '),true);return;}
   processedMode=selectedMode;$('results').hidden=false;
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
function sourceBlock(parent,source,type){const pre=add(parent,el('pre','cell-source',source));if(type==='code')pre.setAttribute('aria-label','生徒のコード');return pre;}
function showOutput(parent,outputs){for(const out of outputs||[]){
 if(out.kind==='image'){
   if(!/^[A-Za-z0-9+/=\s]+$/.test(out.base64)||out.base64.length>15_000_000){add(parent,el('p','helper','画像出力を表示できません。'));continue;}
   const img=el('img','output-img');img.alt='Notebookに保存された画像出力';img.src=`data:image/${out.format};base64,${out.base64.replace(/\s/g,'')}`;add(parent,img);
 }else add(parent,el('pre','cell-output',out.text));
}}
function showSlot(parent,slot){const container=add(parent,el('div','slot'));const head=add(container,el('div','slot-head'));
 add(head,el('strong','',slot.label));add(head,el('span','chip '+(slot.status==='変更検出'?'changed':slot.status==='回答未検出'?'warn':''),slot.status));
 if(!slot.sourceCells.length)add(container,el('p','helper','記入用セルが検出されません。'));
 for(const c of slot.sourceCells){add(container,el('div','cell-meta',`セル ${c.index+1} · ${c.type} · ID: ${c.id||'なし'}`));sourceBlock(container,c.text,c.type);
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
 if(a.instruction){const d=add(block,el('details'));add(d,el('summary','','活動の指示（原文から抽出）'));add(d,el('div','instruction',a.instruction));}
 if(!a.inputs.length)add(block,el('p','helper','指定入力欄が見つかりません。'));
 for(const s of a.inputs)showSlot(block,s);
 if(includeExtras)addExtras(block,r,r.extras.filter(x=>x.activityId===a.id));
}
function studentCard(root,r){const card=add(root,el('section','card'));const header=add(card,el('div','card-header'));const namebox=add(header,el('div'));
 add(namebox,el('h3','',r.name));add(namebox,el('p','',r.path));add(header,el('span','chip',r.mode));
 const body=add(card,el('div','card-body'));
 for(const a of r.activities)showActivity(body,r,a);
 addExtras(body,r,r.extras);if(!r.activities.length)add(body,el('div','empty','認識可能な活動がありません。'));
}
function activityCards(root,visible){const ids=new Map();for(const r of visible)for(const a of r.activities){if(!ids.has(a.id))ids.set(a.id,[]);ids.get(a.id).push([r,a]);}
 for(const [id,items] of ids){const card=add(root,el('section','card'));const header=add(card,el('div','card-header'));
 add(header,el('h3','',`${id} ${items[0][1].title}`));add(header,el('span','chip',`${items.length}件`));
 const body=add(card,el('div','card-body'));for(const [r,a] of items){const mini=add(body,el('div','activity'));
 add(mini,el('h3','',r.name));add(mini,el('p','helper',r.path));
 if(a.instruction && mini===body.firstChild){const d=add(mini,el('details'));add(d,el('summary','','元の指示を確認'));add(d,el('div','instruction',a.instruction));}
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
  const {name,type,data}=buildDownload(results,processedMode);
  downloadBytes(data,name,type);
 }catch(e){status('出力に失敗しました：'+e.message,true);}
});
