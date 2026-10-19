import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {analyzeNotebook,parseStructure,validateNotebook,alignCells} from '../src/core.js';
import {makeReportNotebook,createZip,serializeReport} from '../src/export.js';
const basePath='/mnt/data/３次_6コマ_演習ノートブックQC版.ipynb';
const rulePath='/mnt/data/ノートブックルール最新版ルール.ipynb';
const hasRealFixture=fs.existsSync(basePath)&&fs.existsSync(rulePath);
const realTest=hasRealFixture?test:test.skip;
const base=hasRealFixture?JSON.parse(fs.readFileSync(basePath)):null;
const rule=hasRealFixture?JSON.parse(fs.readFileSync(rulePath)):null;
const clone=x=>structuredClone(x);
const text=c=>Array.isArray(c.source)?c.source.join(''):c.source;

realTest('real lesson: detects activity headings, 14 inputs, and delimiters',()=>{
  const s=parseStructure(base);
  assert.equal(s.rows.length,148);
  assert.equal(s.activities.find(a=>a.id==='4-6').inputs.length,3);
  const n=s.activities.reduce((sum,a)=>sum+a.inputs.length,0);
  assert.equal(n,14);
  assert.equal(s.activities.find(a=>a.id==='4-2').inputs[0].sourceIndices.length,1);
  assert.equal(s.activities.find(a=>a.id==='4-2').inputs[0].sourceIndices[0],71);
  assert(!s.activities.find(a=>a.id==='4-2').inputs[0].sourceIndices.includes(73));
});
realTest('actual rule notebook can parse without crashes',()=>{
  const s=parseStructure(rule);assert.equal(s.rows.length,156);
});
realTest('baseline absent: activities and blank templates without false modified claim',()=>{
  const result=analyzeNotebook(base,null,'submission.ipynb');
  assert.equal(result.mode,'正本なし');
  assert.equal(result.activities.find(a=>a.id==='2-1').inputs[0].status,'回答未検出');
  assert.equal(result.activities.find(a=>a.id==='4-6').inputs[1].status,'記入候補');
});
realTest('baseline present: changed cell, inserted code, moved cell, unchanged input',()=>{
  const student=clone(base);
  student.cells[28].source='誰の課題か：図書館の利用者\n\n成功条件：5冊に入る';
  student.cells.splice(72,0,{cell_type:'code',id:'new-code-one',source:'print("test")',metadata:{},execution_count:null,outputs:[]});
  const moved=student.cells.splice(20,1)[0];student.cells.splice(23,0,moved);
  const result=analyzeNotebook(student,base,'01_submission.ipynb');
  assert.equal(result.mode,'正本あり');
  assert.equal(result.activities.find(a=>a.id==='2-1').inputs[0].status,'変更検出');
  const slot=result.activities.find(a=>a.id==='4-2').inputs[0];
  assert(slot.sourceCells.some(c=>c.id==='new-code-one'));
  assert.equal(result.activities.find(a=>a.id==='4-3').inputs[0].status,'初期状態と同じ');
});
realTest('all cell IDs changed but stable structure should still match',()=>{
  const student=clone(base);student.cells.forEach((c,i)=>{c.id=`changed-${i}`;});
  student.cells[28].source='誰の課題か：生徒が使う';
  const result=analyzeNotebook(student,base);
  assert.equal(result.mode,'正本あり');
  assert.equal(result.activities.find(a=>a.id==='2-1').inputs[0].status,'変更検出');
});
realTest('deleted heading can recover original activity with baseline',()=>{
  const student=clone(base);
  student.cells.splice(65,1);
  const result=analyzeNotebook(student,base);
  assert(result.activities.some(a=>a.id==='4-2'));
  assert(result.warnings.some(w=>w.includes('4-2')));
});
realTest('rejects a different lesson as incompatible reference',()=>{
  const other=clone(base);
  other.cells.forEach((c,i)=>{c.id=`other-${i}`;c.source=i===0?'# unrelated':`### random-${i}\ncompletely different content ${i}`;});
  const result=analyzeNotebook(other,base);
  assert.equal(result.mode,'正本なし');
  assert(result.warnings.some(w=>w.includes('適合性')));
});
realTest('saved execution outputs kept in report, no auto execute',()=>{
  const student=clone(base);
  student.cells[58].outputs=[{output_type:'stream',name:'stdout',text:['実行済みです\n']}];
  student.cells[58].execution_count=1;
  const result=analyzeNotebook(student,base);
  const report=makeReportNotebook(result);
  assert.equal(report.nbformat,4);
  assert(report.cells.some(c=>c.cell_type==='markdown'&&text(c).includes('実行済みです')));
  assert(report.cells.some(c=>c.cell_type==='code' && c.outputs?.[0]?.text?.[0]==='実行済みです\n'));
  assert.equal(report.cells.filter(c=>c.cell_type==='code').length,base.cells.filter(c=>c.cell_type==='code').length);
  assert.deepEqual(base.cells[58].outputs,[]); // original remains unchanged
});
realTest('image output preserved as markdown attachment',()=>{
  const student=clone(base);student.cells[58].outputs=[{output_type:'display_data',data:{'image/png':'aGVsbG8='},metadata:{}}];
  const report=makeReportNotebook(analyzeNotebook(student,base));
  assert(report.cells.some(c=>c.attachments && Object.keys(c.attachments).length));
});
realTest('Notebook export must not mutate submitted notebook',()=>{
  const student=clone(base);const before=JSON.stringify(student);
  serializeReport(analyzeNotebook(student,base));
  assert.equal(JSON.stringify(student),before);
});
realTest('ZIP built in-browser has local/central/end-of-directory records',()=>{
 const zip=createZip([{name:'生徒01_採点.ipynb',data:'{}'},{name:'生徒02_採点.ipynb',data:'{}'}]);
 const view=new DataView(zip.buffer);
 assert.equal(view.getUint32(0,true),0x04034b50);
 assert.equal(view.getUint32(zip.length-22,true),0x06054b50);
 assert.equal(view.getUint16(zip.length-12,true),2);
});
realTest('invalid notebook rejected with clear error',()=>assert.throws(()=>validateNotebook({cells:[]})));
realTest('same section numbers but different lessons are not equivalent',()=>{
 const source=clone(base),other=clone(base);
 other.cells.forEach((c,i)=>{c.id=`different-${i}`;
 const h=text(c).match(/^(### \d+-\d+\. (?:復習|導入|解説|確認|実行|ワーク|共有)：)/);
 c.source=h ? `${h[1]}完全に別の学習目的 ${i}` : `これは別の教材独自の内容 ${i}`;});
 const r=analyzeNotebook(other,source);
 assert.equal(r.mode,'正本なし');
});
realTest('untrusted markdown is fenced in generated report',()=>{
 const student=clone(base);student.cells[28].source='<script>alert("example")</script>\n誰の課題か：生徒';
 const result=analyzeNotebook(student,base);
 const report=makeReportNotebook(result);
 const content=report.cells.map(c=>text(c)).join('\n');
 assert(content.includes('```text\n<script>alert'));
 assert(!content.includes('元のタイトル: <script>'));
});
