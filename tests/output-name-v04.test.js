import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {organizedNotebookPath,normalizeOutputSuffix,safeZipEntryPath,pathCollisionKey} from '../src/naming.js';
import {buildDownload,createZip} from '../src/export.js';
import {analyzeNotebook} from '../src/core.js';

const m=(id,source)=>({id,cell_type:'markdown',metadata:{},source});
const reference={nbformat:4,nbformat_minor:5,metadata:{},cells:[
 m('h','### 1-1. ワーク：課題'),m('marker','---\n**回答** ＜入力＞'),
 m('answer','回答：'),m('end','---')
]};
const submission=structuredClone(reference);
submission.cells[2].source='回答：記入しました';
const result=path=>analyzeNotebook(structuredClone(submission),reference,path);

test('default and custom suffix, uppercase extension',()=>{
 assert.equal(organizedNotebookPath('授業.ipynb'),'授業_organized.ipynb');
 assert.equal(organizedNotebookPath('提出物/001/授業.IPYNB','review'),'提出物/001/授業_review.IPYNB');
 assert.equal(normalizeOutputSuffix('  '),'organized');
 assert.equal(normalizeOutputSuffix(' 採点用 '),'採点用');
});
test('do not silently truncate filenames or rename arbitrary data',()=>{
 assert.throws(()=>organizedNotebookPath('テスト'.repeat(90)+'.ipynb'),/255バイト/);
 assert.throws(()=>organizedNotebookPath('foo.csv'),/Notebook/);
 for(const suffix of ['../x','a/b','CON','PRN.txt','name.', 'bad:name','x'.repeat(81)]){
   assert.throws(()=>normalizeOutputSuffix(suffix));
 }
});
test('NFD names become NFC names',()=>{
 assert.equal(organizedNotebookPath('提出物/か\u3099く/授業.ipynb'),'提出物/がく/授業_organized.ipynb');
 assert.equal(pathCollisionKey('ABC/授業.ipynb'),pathCollisionKey('abc/授業.ipynb'));
});
test('folder ZIP preserves hierarchy and UTF-8 filename flag',()=>{
 const resultBytes=buildDownload([result('提出物/001/授業.ipynb'),result('提出物/002/授業.ipynb')],'folder','review');
 assert.equal(resultBytes.name,'organized_notebooks.zip');
 const bytes=resultBytes.data;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 assert.equal(view.getUint32(0,true),0x04034b50);
 assert.equal(view.getUint16(6,true)&0x0800,0x0800);
 const n=view.getUint16(26,true);
 assert.equal(new TextDecoder().decode(bytes.subarray(30,30+n)),'提出物/001/授業_review.ipynb');
});
test('single file preserves source metadata and uses suffix',()=>{
 const snapshot=JSON.stringify(submission);
 const d=buildDownload([result('001_授業.ipynb')],'single','添削');
 assert.equal(d.name,'001_授業_添削.ipynb');
 assert.equal(JSON.parse(d.data).metadata.activity_extractor.source_path,'001_授業.ipynb');
 assert.equal(JSON.stringify(submission),snapshot);
});
test('canonical equivalent and case-insensitive ZIP collisions are rejected',()=>{
 assert.throws(()=>buildDownload([result('提出物/か\u3099く/授業.ipynb'),result('提出物/がく/授業.ipynb')],'folder'),/同名/);
 assert.throws(()=>createZip([{name:'a/ABC.ipynb',data:'1'},{name:'a/abc.ipynb',data:'2'}]),/重複/);
});
test('reject traversal and reserved Windows paths',()=>{
 for(const path of ['../a.ipynb','/a.ipynb','a//b.ipynb','a/./b.ipynb','a/CON/read.ipynb','a/file .ipynb/','C:/a.ipynb']){
   assert.throws(()=>safeZipEntryPath(path));
 }
});
test('input UI explains original and includes output suffix',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert(html.includes('原本（生徒が編集する前の、該当コマの教材）'));
 assert(html.includes('id="outputSuffix"'));
 assert(!html.includes('正本'));
});
