import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNotebook} from '../src/core.js';
import {buildDownload,createZip,organizedNotebookPath,safeZipEntryPath} from '../src/export.js';
const m=(id,source)=>({id,cell_type:'markdown',metadata:{},source});
const c=(id,source)=>({id,cell_type:'code',metadata:{},source,outputs:[],execution_count:null});
const lesson={nbformat:4,nbformat_minor:5,metadata:{},cells:[
 m('heading','### 1-1. ワーク：回答する'),
 m('marker','---\n**回答** ＜入力＞'),
 m('answer','回答：'),
 m('end','---'),
 m('next','### 1-2. ワーク：実行する'),
 m('input','---\n**コード** ＜入力＞'),
 c('code','# ここに記入'),
 m('close','---')
]};
const student=structuredClone(lesson);
student.cells[2].source='回答：編集しました';
student.cells[6].source='print("成果物")';
const result=path=>analyzeNotebook(structuredClone(student),lesson,path);
const zipNames=bytes=>{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const names=[];let p=0;
 while(p+30<=bytes.length && view.getUint32(p,true)===0x04034b50){
  const size=view.getUint32(p+18,true),n=view.getUint16(p+26,true),extra=view.getUint16(p+28,true);
  names.push(new TextDecoder().decode(bytes.subarray(p+30,p+30+n)));
  p+=30+n+extra+size;
 }
 return names;
};
test('original names and Japanese directory segments retained',()=>{
 assert.equal(organizedNotebookPath('007_授業.ipynb'),'007_授業_整理済み.ipynb');
 assert.equal(organizedNotebookPath('提出物/001/演習.IPYNB'),'提出物/001/演習_整理済み.IPYNB');
});
test('folder ZIP keeps root and nested directories, including repeated basenames',()=>{
 const download=buildDownload([result('提出物/001/演習.ipynb'),result('提出物/002/演習.ipynb')],'folder');
 assert.equal(download.name,'整理済みNotebook一式.zip');
 assert.deepEqual(zipNames(download.data),['提出物/001/演習_整理済み.ipynb','提出物/002/演習_整理済み.ipynb']);
});
test('one file in folder mode still returns ZIP',()=>{
 const download=buildDownload([result('提出物/001/演習.ipynb')],'folder');
 assert.equal(download.type,'application/zip');
 assert.deepEqual(zipNames(download.data),['提出物/001/演習_整理済み.ipynb']);
});
test('single file keeps original stem and embeds original path metadata',()=>{
 const download=buildDownload([result('007_授業.ipynb')],'single');
 assert.equal(download.name,'007_授業_整理済み.ipynb');
 const output=JSON.parse(download.data);
 assert.equal(output.metadata.activity_extractor.source_path,'007_授業.ipynb');
 assert(output.cells.some(x=>x.cell_type==='code'));
});
test('malicious paths and output collisions are rejected',()=>{
 for(const p of ['../escape.ipynb','root/../escape.ipynb','root/./escape.ipynb','/escape.ipynb','root//escape.ipynb']){
  assert.throws(()=>safeZipEntryPath(p));
 }
 assert.throws(()=>createZip([{name:'a/file.ipynb',data:'1'},{name:'a/file.ipynb',data:'2'}]));
});
test('source object untouched and no identifier rule shown in user interface',()=>{
 const snapshot=JSON.stringify(student);
 buildDownload([result('提出物/001/演習.ipynb')],'folder');
 assert.equal(JSON.stringify(student),snapshot);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert(!html.includes('identityRule'));
 assert(html.includes('ファイル別'));
});
