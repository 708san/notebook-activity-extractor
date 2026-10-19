import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeNotebook} from '../src/core.js';
import {makeReportNotebook,buildDownload} from '../src/export.js';
const source=fs.readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
const fixturePath='/mnt/data/第2章第6回_正本.ipynb';
const samplePath='/mnt/data/01_第2章第6回_作業サンプル.ipynb';
const hasReal=fs.existsSync(fixturePath)&&fs.existsSync(samplePath);
const sourceText=c=>Array.isArray(c.source)?c.source.join(''):c.source;
const tiny=(title='### 1-1. ワーク：文章を考える')=>({nbformat:4,nbformat_minor:5,metadata:{},cells:[
  {cell_type:'markdown',id:'title',metadata:{},source:'# 演習'},
  {cell_type:'markdown',id:'heading',metadata:{},source:title},
  {cell_type:'markdown',id:'instruction',metadata:{},source:'**課題**：回答してください。\n\n| 項目 | 指示 |\n| --- | --- |\n| 仮説 | 説明する |\n\n<details><summary>解答例を見る</summary><p><strong>模範</strong>：見本。</p></details>'},
  {cell_type:'markdown',id:'marker',metadata:{},source:'---\n**自分の回答**<font color="red">＜入力＞</font>'},
  {cell_type:'markdown',id:'answer',metadata:{},source:'仮説：'},
  {cell_type:'markdown',id:'end',metadata:{},source:'---'},
]});

test('v0.3: instructions preserve table and emphasis, answers hidden in separate reference',()=>{
 const r=analyzeNotebook(tiny());const a=r.activities[0];
 assert.match(a.instruction,/\| 項目 \| 指示 \|/);
 assert.match(a.instruction,/\*\*課題\*\*/);
 assert.doesNotMatch(a.instruction,/模範/);
 assert.equal(a.instructionSections.references.length,1);
 assert.match(a.instructionSections.references[0].content,/\*\*模範\*\*/);
 const report=makeReportNotebook(r);const joined=report.cells.filter(c=>c.cell_type==='markdown').map(sourceText).join('\n');
 assert.match(joined,/活動別確認一覧/);
 assert.match(joined,/元教材の補足説明・解答例/);
 assert.match(joined,/\| 項目 \| 指示 \|/);
});
test('v0.3: unchanged blank input is not marked complete; results are independent',()=>{
 const r=analyzeNotebook(tiny(),tiny());const s=r.activities[0].inputs[0];
 assert.equal(s.status,'初期状態と同じ');
 assert.deepEqual(s.blankItems,['仮説']);
 assert.equal(s.outputState,'対象外');
});
test('v0.3: unmatched reference cell is reported but not asserted as definitely deleted',()=>{
 const ref=tiny();ref.cells.splice(4,0,{cell_type:'markdown',id:'deleted-example',metadata:{},source:'説明の一部'});
 const r=analyzeNotebook(tiny(),ref);
 assert(r.missingReference.some(c=>c.id==='deleted-example'));
 assert(r.missingReference.every(c=>/可能性|不明/.test(c.kind)));
 const exported=makeReportNotebook(r).cells.map(sourceText).join('\n');
 assert(exported.includes('正本側で対応が見つからなかったセル'));
});
test('v0.3: dangerous HTML cannot become active in task description',()=>{
 const d=tiny();d.cells[2].source='<script>alert(1)</script>\n<iframe src="https://evil.example"></iframe>\n説明';
 const r=analyzeNotebook(d);const t=makeReportNotebook(r).cells.map(sourceText).join('\n');
 assert(!t.includes('<script>'));assert(!t.includes('<iframe'));
});
test('v0.3: folder hierarchy and _整理済み suffix are preserved',()=>{
 const r=analyzeNotebook(tiny(),null,'提出物/001/授業.ipynb');
 const a=buildDownload([r],'single');assert.equal(a.name,'授業_整理済み.ipynb');
 const b=buildDownload([r],'folder');assert.equal(b.name,'整理済みNotebook一式.zip');
 const signature=Buffer.from(b.data).toString('utf8');
 assert(signature.includes('提出物/001/授業_整理済み.ipynb'));
});
test('v0.3: sample lesson structure and output preserved', {skip:!hasReal},()=>{
 const ref=JSON.parse(fs.readFileSync(fixturePath));const stud=JSON.parse(fs.readFileSync(samplePath));
 const r=analyzeNotebook(stud,ref);const report=makeReportNotebook(r);
 assert.equal(r.activities.length,14);
 assert.equal(r.activities.reduce((n,a)=>n+a.inputs.length,0),14);
 assert.equal(report.cells.filter(c=>c.cell_type==='code').length,stud.cells.filter(c=>c.cell_type==='code').length);
 assert(r.activities.find(x=>x.id==='4-5').inputs.some(x=>x.blankItems.length===2));
 assert(r.missingReference.length>0);
 assert(report.cells.some(c=>sourceText(c).includes('| 段階 | 蔵書検索での内容 |')));
 assert(!r.activities.find(x=>x.id==='2-1').instruction.includes('解答例を見る'));
});
