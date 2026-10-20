/** Browser/Node compatible; no network, eval, Python execution, or third-party dependencies. */
export const LABELS = new Set(['復習', '導入', '解説', '確認', '実行', 'ワーク', '共有']);
export const MAX_CELLS = 2500;
const structureCache = new WeakMap();

export function sourceText(cell) {
  const s = cell?.source ?? '';
  return typeof s === 'string' ? s : Array.isArray(s) ? s.filter(x => typeof x === 'string').join('') : '';
}
export function validateNotebook(json) {
  if (!json || typeof json !== 'object' || Number(json.nbformat) !== 4 || !Array.isArray(json.cells)) {
    throw new Error('Jupyter Notebook 4.x（cells配列）ではありません。');
  }
  if (json.cells.length > MAX_CELLS) throw new Error(`セル数が上限の${MAX_CELLS}件を超えています。`);
  if (!json.cells.every(c => c && ['markdown', 'code', 'raw'].includes(c.cell_type) &&
      (typeof c.source === 'string' || Array.isArray(c.source)))) {
    throw new Error('不正なcell_typeまたはsourceを検出しました。');
  }
  return json;
}
function cellsOf(doc) {
  return doc.cells.map((c, i) => ({ index:i, cell:c, id:typeof c.id === 'string'?c.id:null,
    type:c.cell_type, text:sourceText(c) }));
}
function safeLines(source) {
  const lines = String(source).split(/\r?\n/);
  let fence = null;
  return lines.map(line => {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      const mark = m[1][0];
      if (!fence) fence = [mark, m[1].length];
      else if (mark === fence[0] && m[1].length >= fence[1]) fence = null;
      return null;
    }
    return fence ? null : line;
  });
}
function structuralLines(source) { return safeLines(source).filter(l => l !== null); }
export function isDivider(source) {
  const first = structuralLines(source).find(x => x.trim() !== '');
  return !!first && /^\s{0,3}-{3,}\s*(?:$|\n)/.test(first);
}
function heading(source) {
  for (const line of safeLines(source)) {
    if (line === null || !line.trim()) continue;
    const match = line.match(/^\s{0,3}(#{1,4})(?:\s+|$)(.*)$/);
    return match ? { level:match[1].length, raw:match[2].trim() } : null;
  }
  return null;
}
export function cleanText(source, limit=1800) {
  return String(source).replace(/!\[[^\]]*\]\(data:[^)]+\)/gi, '[埋め込み画像]')
    .replace(/<img\b[^>]*>/gi, '[画像]')
    .replace(/data:image\/[^;\s]+;base64,[a-z\d+/=]+/gi, '[埋め込み画像]')
    .replace(/<[^>]*>/g, '').replace(/\r/g,'').slice(0, limit).trim();
}
function inputLabel(source) {
  const text = String(source).replace(/<[^>]*>/g, '').replace(/---/g,'')
    .replace(/\*\*/g,'').replace(/＜入力＞|<入力>/g,'').trim();
  return text.split('\n').find(Boolean)?.trim() || '入力欄';
}
function activityHeading(source) {
  const h = heading(source);
  if (!h || h.level !== 3) return null;
  const normalized = h.raw.replace(/\*\*/g,'');
  const m = normalized.match(/^(\d+\s*[-－–]\s*\d+)\s*[.．]\s*(復習|導入|解説|確認|実行|ワーク|共有)\s*[：:]\s*(.+)$/);
  if (!m || !LABELS.has(m[2])) return null;
  return { id:m[1].replace(/\s/g,'').replace(/[－–]/g,'-'), label:m[2], title:m[3].trim(), heading:normalized };
}
function exampleHead(h) { return h?.level===4 && /^(?:\*\*)?(?:プログラム例|プロンプト例)(?:\*\*)?$/.test(h.raw.replace(/\s/g,'')); }
function minMeaningful(s) {
  return cleanText(s, 1800).replace(/\s+/g,' ').trim();
}
// Keep source Markdown structure (tables, emphasis, lists) for notebook export.
// Untrusted HTML and remote images are not copied as active content.
function safeInstructionMarkdown(input) {
  let s=String(input);
  s=s.replace(/<(script|style|iframe|object|svg|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'[安全のため省略した埋め込み要素]');
  s=s.replace(/!\[([^\]]*)\]\((?:data:|https?:|attachment:)[\s\S]*?\)/gi, (_,alt)=>`[図・画像${alt?`：${alt}`:''}（元教材を参照）]`);
  s=s.replace(/<img\b[^>]*>/gi,'[図・画像（元教材を参照）]');
  s=s.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p\s*>/gi,'\n\n').replace(/<p\b[^>]*>/gi,'');
  s=s.replace(/<strong\b[^>]*>/gi,'**').replace(/<\/strong\s*>/gi,'**');
  s=s.replace(/<em\b[^>]*>/gi,'*').replace(/<\/em\s*>/gi,'*');
  s=s.replace(/<font\b[^>]*>/gi,'').replace(/<\/font\s*>/gi,'');
  s=s.replace(/<\/?(?:span|div|summary|details)\b[^>]*>/gi,'');
  s=s.replace(/<[^>]*>/g, tag=>tag.replace(/</g,'&lt;').replace(/>/g,'&gt;'));
  s=s.replace(/\]\(\s*(?:javascript|data|vbscript)\s*:/gi,'](unsafe-link:');
  return s.replace(/\r/g,'').trim();
}
function separateInstruction(source) {
  const references=[];
  const withoutDetails=String(source).replace(/<details\b[^>]*>[\s\S]*?<\/details\s*>/gi, section=>{
    const match=section.match(/<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i);
    const label=(match?.[1]||'補足').replace(/<[^>]*>/g,'').trim();
    const kind=/解答例|回答例|模範/.test(label)?'解答例':/ヒント/.test(label)?'ヒント':'解説・参考';
    const rest=section.replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/i,'').replace(/<\/?details\b[^>]*>/gi,'');
    const content=safeInstructionMarkdown(rest);
    if(content) references.push({kind,label,content});
    return '';
  });
  return {text:safeInstructionMarkdown(withoutDetails),references};
}
function instructionsFor(activity, rows) {
  const main=[],supplement=[],references=[];
  for (const i of activity.instructionIndices) {
    const s=rows[i]?.text||'';
    if (/^\s*---\s*$/.test(s) || s.includes('＜入力＞'))continue;
    const part=separateInstruction(s);
    references.push(...part.references.map(r=>({...r,sourceIndex:i})));
    if(!part.text || /^\s*####\s*$/.test(part.text))continue;
    // The first non-example instruction is the main task; subsequent cells are preserved separately.
    const item={text:part.text,sourceIndex:i};
    if(!main.length)main.push(item);else supplement.push(item);
  }
  return {main:main.map(x=>x.text).join('\n\n'),supplement,references};
}
export function parseStructure(notebook) {
  if (structureCache.has(notebook)) return structureCache.get(notebook);
  validateNotebook(notebook);
  const rows=cellsOf(notebook);
  const activities=[];
  let current=null, slot=null, sample=false;
  for (const row of rows) {
    const h = row.type==='markdown' ? heading(row.text) : null;
    const a = row.type==='markdown' ? activityHeading(row.text) : null;
    if (h?.level<=3) {
      if (slot) {slot.openEnd=true;slot=null;}
      if (current) current.endIndex=row.index;
      current=null;sample=false;
      if (a) {
        current={...a,startIndex:row.index,endIndex:rows.length,headingCellId:row.id,inputs:[],
          instructionIndices:[],sampleIndices:[],otherIndices:[]};
        activities.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (h?.level===4) {
      if (slot) {slot.openEnd=true;slot=null;}
      sample=exampleHead(h);
      current.otherIndices.push(row.index);
      continue;
    }
    if (row.type==='markdown' && structuralLines(row.text).some(line => line.includes('＜入力＞') || line.includes('<入力>'))) {
      if (slot) slot.openEnd=true;
      slot={label:inputLabel(row.text),markerIndex:row.index,sourceIndices:[],closeIndex:null,openEnd:false};
      current.inputs.push(slot);sample=false;
      continue;
    }
    if (slot && row.type==='markdown' && isDivider(row.text)) {
      slot.closeIndex=row.index;slot=null;
      const rest=cleanText(row.text,200);
      if (rest.replace(/^---\s*/, '').trim()) current.otherIndices.push(row.index);
      continue;
    }
    if (slot) {slot.sourceIndices.push(row.index);continue;}
    if (sample) {current.sampleIndices.push(row.index);continue;}
    current.otherIndices.push(row.index);
    if (row.type==='markdown') current.instructionIndices.push(row.index);
  }
  if (slot) slot.openEnd=true;
  for (const a of activities) {const ins=instructionsFor(a,rows);a.instruction=ins.main;a.instructionSections=ins;}
  const result={rows,activities}; structureCache.set(notebook,result);return result;
}
function keyNormalized(text) {
  return String(text).replace(/data:image\/[^;\s]+;base64,[a-z\d+/=]+/gi, '[image]')
    .replace(/[\t\r ]+/g,' ').trim();
}
function matchString(s) { return keyNormalized(s).slice(0,1800); }
function dice(s,t) {
  if(s===t) return 1;
  if(!s || !t) return 0;
  const grams=x=>{const out=new Map(); const q=x.slice(0,1400);for(let i=0;i+2<q.length;i++){
    const g=q.slice(i,i+3);out.set(g,(out.get(g)||0)+1);
  }return out;};
  const a=grams(s), b=grams(t);let common=0,total=0;
  for(const v of a.values())total+=v;for(const v of b.values())total+=v;
  for(const [k,v] of a) common+=Math.min(v,b.get(k)||0);
  return total?2*common/total:0;
}
function pushMap(map, key, val) {if(key!=null){if(!map.has(key))map.set(key,[]);map.get(key).push(val);}}
export function alignCells(reference, submission) {
  const a=reference.rows,b=submission.rows;
  const usedA=new Set(),usedB=new Set(),pairs=[];
  const ids=new Map(), contents=new Map();
  for(const x of a) {pushMap(ids,x.id,x);pushMap(contents,`${x.type}:${keyNormalized(x.text)}`,x);}
  const seenB=new Map(); for(const x of b) pushMap(seenB,x.id,x);
  const put=(x,y,kind,confidence)=>{usedA.add(x.index);usedB.add(y.index);pairs.push({ref:x.index,sub:y.index,kind,confidence});};
  for(const y of b) {
    if(y.id && ids.get(y.id)?.length===1 && seenB.get(y.id)?.length===1){const x=ids.get(y.id)[0];
      if(x.type===y.type && !usedA.has(x.index))put(x,y,'id',1);
    }
  }
  for(const y of b) {
    if(usedB.has(y.index))continue;
    const group=(contents.get(`${y.type}:${keyNormalized(y.text)}`)||[]).filter(x=>!usedA.has(x.index));
    if(!group.length)continue;
    const expected=(y.index/Math.max(1,b.length-1))*Math.max(1,a.length-1);
    group.sort((x1,x2)=>Math.abs(x1.index-expected)-Math.abs(x2.index-expected));
    put(group[0],y,'exact',group.length>1 ? 0.85 : 0.98);
  }
  // Fuzzy matching is restricted to +/-12 cells near the nearest confirmed anchor.
  // Anchor lookup is binary-search based, and candidate enumeration has constant width.
  const anchors=[...pairs].sort((p,q)=>p.sub-q.sub);
  function insertAnchor(pair){
    let lo=0,hi=anchors.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(anchors[mid].sub<pair.sub)lo=mid+1;else hi=mid;}
    anchors.splice(lo,0,pair);
  }
  for(const y of b) {
    if(usedB.has(y.index) || !y.text.trim())continue;
    let lo=0,hi=anchors.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(anchors[mid].sub<y.index)lo=mid+1;else hi=mid;}
    const left=lo>0?anchors[lo-1]:null,right=lo<anchors.length?anchors[lo]:null;
    const expected=left&&right&&left.sub!==right.sub
      ? left.ref + (y.index-left.sub)*(right.ref-left.ref)/(right.sub-left.sub)
      : left ? left.ref+y.index-left.sub : right ? right.ref+y.index-right.sub
      : y.index*a.length/Math.max(1,b.length);
    const target=Math.max(0,Math.min(a.length-1,expected));
    const candidates=[];
    for(let i=Math.max(0,Math.floor(target)-12);i<=Math.min(a.length-1,Math.ceil(target)+12);i++){
      const x=a[i];if(!usedA.has(x.index) && x.type===y.type)candidates.push(x);
    }
    if(!candidates.length)continue;
    const subStr=matchString(y.text);
    const scores=candidates.map(x=>({x,raw:dice(matchString(x.text),subStr)}))
      .map(x=>({...x,score:0.91*x.raw+0.09*(1-Math.abs(x.x.index-target)/13)}))
      .sort((p,q)=>q.score-p.score);
    if(scores[0]?.raw>=0.60 && scores[0].score-(scores[1]?.score||0)>=0.045) {
      put(scores[0].x,y,'fuzzy',Math.min(0.84,scores[0].score));
      insertAnchor(pairs[pairs.length-1]);
    }
  }
  return {pairs,refToSub:new Map(pairs.map(p=>[p.ref,p.sub])),subToRef:new Map(pairs.map(p=>[p.sub,p.ref])),
    unmatchedRef:a.filter(x=>!usedA.has(x.index)).map(x=>x.index),
    unmatchedSub:b.filter(x=>!usedB.has(x.index)).map(x=>x.index)};
}
export function assessCompatibility(reference, submission, alignment) {
  if(!reference) return {usable:false,reason:'原本なし'};
  const refActivities=new Map(reference.activities.map(a=>[a.id,a]));
  const aMatch=submission.activities.filter(a=>{
    const ref=refActivities.get(a.id);
    return ref && a.label===ref.label && dice(matchString(a.title),matchString(ref.title))>=0.56;
  }).length;
  const matchRatio=aMatch/Math.max(1,Math.min(reference.activities.length,submission.activities.length));
  const reliable=alignment.pairs.filter(p=>p.kind==='id'||p.kind==='exact').length;
  const matchCells=reliable/Math.max(1,Math.min(reference.rows.length,submission.rows.length));
  const sameTitle=sourceText(reference.rows[0]?.cell).trim()===sourceText(submission.rows[0]?.cell).trim();
  const usable=matchRatio>=0.35 || matchCells>=0.18 || (sameTitle && reliable>=3);
  return {usable,activityOverlap:aMatch,activityRatio:matchRatio,cellRatio:matchCells,
    reason:usable?'原本との共通構造を確認':'原本と提出物の共通構造が不足'};
}
function hasSavedOutputs(cell) {return !!(Array.isArray(cell?.outputs) && cell.outputs.length);}
export function outputSummary(cell) {
  const out=[];
  for(const o of (cell?.outputs || [])) {
    if(!o || typeof o!=='object')continue;
    if(o.output_type==='stream') {out.push({kind:'text',text:sourceText({source:o.text||''}).slice(0,30000)});continue;}
    if(o.output_type==='error') {out.push({kind:'error',text:[o.ename,o.evalue,...(o.traceback||[])].join('\n').slice(0,30000)});continue;}
    const data=o.data||{};
    if(data['text/plain'])out.push({kind:'text',text:sourceText({source:data['text/plain']}).slice(0,30000)});
    if(data['image/png'])out.push({kind:'image',format:'png',base64:sourceText({source:data['image/png']})});
    else if(data['image/jpeg'])out.push({kind:'image',format:'jpeg',base64:sourceText({source:data['image/jpeg']})});
    else if(!data['text/plain'] && data['text/html']) out.push({kind:'notice',text:'HTML表示結果（安全のため非表示）'});
  }
  return out;
}
function isEmptyTemplate(rows) {
  if(!rows.length)return true;
  return rows.every(r=>{
    const s=r.text.trim(); if(!s)return true;
    if(r.type==='code')return s.split(/\n/).every(line=>!line.trim() || line.trim().startsWith('#'));
    return s.split(/\n/).every(line=>{
      const t=line.replace(/^[-*]\s*/, '').trim();
      return !t || /^(?:[^：:]{1,90}[：:]\s*|ここに.{0,30}(?:書き|入力).*)$/.test(t);
    });
  });
}
function annotateInput(input, student, reference, alignment) {
  const indices=[...new Set(input.sourceIndices)].sort((a,b)=>a-b);
  const rows=indices.map(i=>student.rows[i]).filter(Boolean);
  const hasOutputs=rows.some(r=>hasSavedOutputs(r.cell));
  let status = isEmptyTemplate(rows) ? '回答未検出' : '記入候補';
  let hasChange=null;
  if(reference && alignment) {
    const comparisons=rows.map(r=>{
      const refIndex=alignment.subToRef.get(r.index);
      return refIndex===undefined?true:keyNormalized(r.text)!==keyNormalized(reference.rows[refIndex]?.text||'');
    });
    hasChange=comparisons.some(Boolean);
    if(rows.length && hasChange)status='変更検出';
    else if(rows.length && !hasChange)status='初期状態と同じ';
  }
  // A status of "changed" is not equivalent to a complete answer.
  const codeCount=rows.filter(r=>r.type==='code').length;
  const outputState=codeCount ? (hasOutputs?'保存済み結果あり':'実行結果未保存（実行の有無は不明）') : '対象外';
  const blankItems=[];let filledItems=0;
  for (const r of rows.filter(x=>x.type==='markdown')) {
    const lines=r.text.split(/\r?\n/);
    for(let i=0;i<lines.length;i++) {
      const m=lines[i].match(/^\s*(?:[-*]\s*)?(?:\d+[.．]\s*)?([^\n：:]{2,95})[：:]\s*(.*)$/);
      if(!m)continue;
      let answer=m[2].trim();
      if(!answer){const next=lines[i+1]?.trim()||'';if(next && !/^\s*(?:[-*]\s*)?[^：:]{2,95}[：:]/.test(next))answer=next;}
      if(answer)filledItems++;else blankItems.push(m[1].trim());
    }
  }
  const evidenceState=blankItems.length && filledItems ? '一部に空欄候補あり' : blankItems.length ? '空欄候補あり' :
      (status==='回答未検出'?'回答未検出':'回答候補あり（完了判定ではありません）');
  return {...input, sourceIndices:indices, status, hasChange, hasSavedOutputs:hasOutputs,
    evidenceState, blankItems, outputState,
    sourceCells:rows.map(r=>({index:r.index,id:r.id,type:r.type,text:r.text,outputs:outputSummary(r.cell)}))};
}
function guessActivityForIndex(idx, activities) {
  return activities.find(a=>idx>a.startIndex && idx<a.endIndex);
}
function restoreReferenceInputs(student, reference, alignment, studentActivities) {
  for(const a of reference.activities) {
    const candidate=studentActivities.find(x=>x.id===a.id);
    if(!candidate)continue;
    for(const refInput of a.inputs) {
      const already=candidate.inputs.find(x=>x.label===refInput.label);
      const located=refInput.sourceIndices.map(i=>alignment.refToSub.get(i)).filter(i=>i!==undefined);
      const start=alignment.refToSub.get(refInput.markerIndex);
      const end=refInput.closeIndex===null ? undefined : alignment.refToSub.get(refInput.closeIndex);
      let indices=[...located];
      if(start!==undefined && end!==undefined && start<end && end-start<=120) {
        indices=student.rows.slice(start+1,end).filter(r=>r.type!=='raw' &&
          !activityHeading(r.text) && !(r.type==='markdown'&&isDivider(r.text))).map(r=>r.index);
      }
      if(already) {
        for(const i of indices) if(i>candidate.startIndex && i<candidate.endIndex && !already.sourceIndices.includes(i))already.sourceIndices.push(i);
      } else if(indices.length) {
        candidate.inputs.push({label:refInput.label,markerIndex:start??null,sourceIndices:indices,
          closeIndex:end??null,recovered:true});
      } else if(start!==undefined && end!==undefined) {
        candidate.inputs.push({label:refInput.label,markerIndex:start,sourceIndices:[],closeIndex:end,recovered:true});
      }
    }
  }
}
export function analyzeNotebook(rawStudent, rawReference=null, path='submission.ipynb') {
  const student=parseStructure(rawStudent);
  const reference=rawReference?parseStructure(rawReference):null;
  let alignment=reference?alignCells(reference,student):null;
  const compatibility=reference?assessCompatibility(reference,student,alignment):{usable:false,reason:'原本なし'};
  const warnings=[];
  if(reference&&!compatibility.usable){warnings.push('原本との適合性が低いため、差分解析を適用していません。'); alignment=null;}
  if(!student.activities.length)warnings.push('認識できる活動見出しがありません。未分類セルを確認してください。');
  const activities=student.activities.map(a=>({...a,inputs:a.inputs.map(s=>({...s,sourceIndices:[...s.sourceIndices]}))}));
  if(alignment)restoreReferenceInputs(student,reference,alignment,activities);
  const covered=new Set();
  for(const a of activities)for(const slot of a.inputs)for(const i of slot.sourceIndices)covered.add(i);
  for(const a of activities) {
    const refActivity=reference?.activities.find(x=>x.id===a.id);
    if(refActivity && alignment){
      a.instruction=refActivity.instruction || a.instruction;
      a.instructionSections=refActivity.instructionSections || a.instructionSections;
    }
    a.inputs=a.inputs.map(s=>annotateInput(s,student,alignment?reference:null,alignment));
    a.extras=[];
  }
  const extras=[];
  if(alignment) {
    for(const r of student.rows) {
      const a=guessActivityForIndex(r.index,activities);
      if(covered.has(r.index) || r.type==='raw' || (r.type==='markdown'&&activityHeading(r.text)))continue;
      const refidx=alignment.subToRef.get(r.index);
      if(refidx!==undefined) {
        const refrow=reference.rows[refidx];
        if(keyNormalized(refrow.text)!==keyNormalized(r.text)) {
          const item={kind:'C',index:r.index,id:r.id,type:r.type,text:r.text,reason:'指定入力欄以外の既存セルを変更',activityId:a?.id||null,outputs:outputSummary(r.cell)};
          extras.push(item);if(a)a.extras.push(item);
        }
      } else if(r.text.trim() && !(r.type==='markdown'&&isDivider(r.text))) {
        const sample=a?.sampleIndices.includes(r.index);
        const item={kind: sample?'C':'B',index:r.index,id:r.id,type:r.type,text:r.text,
          reason:sample?'例示範囲内の追加セル':'追加セル（活動との関係は位置から推定）',activityId:a?.id||null,outputs:outputSummary(r.cell)};
        extras.push(item);if(a)a.extras.push(item);
      }
    }
  }
  // If headings have been edited/deleted, use successfully matched cells to recover the activity label.
  if(alignment)for(const refActivity of reference.activities) {
    if(activities.some(a=>a.id===refActivity.id))continue;
    const indices=alignment.pairs.filter(p=>p.ref>=refActivity.startIndex && p.ref<refActivity.endIndex).map(p=>p.sub).sort((a,b)=>a-b);
    if(!indices.length)continue;
    const recovered={...refActivity,startIndex:Math.min(...indices),endIndex:Math.max(...indices)+1,
      instruction:refActivity.instruction,instructionSections:refActivity.instructionSections,recovered:true,inputs:[],extras:[]};
    for(const s of refActivity.inputs) {
      const found=s.sourceIndices.map(idx=>alignment.refToSub.get(idx)).filter(i=>i!==undefined);
      if(found.length) recovered.inputs.push(annotateInput({...s,sourceIndices:found,recovered:true},student,reference,alignment));
    }
    activities.push(recovered);warnings.push(`活動 ${refActivity.id} は見出しを照合できず、対応セルから復元しました。`);
  }
  activities.sort((a,b)=>a.startIndex-b.startIndex);
  const missingReference=[];
  if(alignment){
    const pairs=alignment.pairs.slice().sort((a,b)=>a.ref-b.ref);
    for (const idx of alignment.unmatchedRef) {
      const r=reference.rows[idx];
      const owner=reference.activities.find(a=>idx>a.startIndex && idx<a.endIndex);
      const prev=[...pairs].reverse().find(p=>p.ref<idx);
      const next=pairs.find(p=>p.ref>idx);
      const strong=!!(prev&&next&&next.sub>prev.sub&&next.sub-prev.sub<=2 && next.ref-prev.ref>1);
      missingReference.push({index:idx,id:r.id,type:r.type,preview:cleanText(r.text,350),
        activityId:owner?.id||null,kind:strong?'削除の可能性が高い':'削除・対応不明（要確認）'});
    }
  }
  const sourceFile=String(path).replace(/\\/g,'/');
  return {path:sourceFile,name:sourceFile.split('/').pop(),mode:alignment?'原本あり':'原本なし',
    compatibility,warnings,activities,extras,
    missingReference,cellCount:student.rows.length,unmatchedCount:alignment?alignment.unmatchedSub.length:null,
    studentNotebook:rawStudent};
}