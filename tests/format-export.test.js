import test from 'node:test';
import assert from 'node:assert/strict';
import {notebookToText,exportPath,packExports,savedOutputs} from '../src/format-export.js';
const nb={nbformat:4,metadata:{secret:'PRIVATE'},cells:[
{cell_type:'markdown',id:'hidden-id',metadata:{hidden:true},source:['# 教材\n','回答：日本語\n','![図](attachment:sample.png)']},
{cell_type:'code',source:['print(3)'],execution_count:17,outputs:[{output_type:'stream',text:['3\n']},{output_type:'display_data',data:{'image/png':'AAAA','text/plain':'<Figure>'}},{output_type:'execute_result',data:{'text/html':'<table><tr><td>売上</td></tr></table>'}}]}
]};
test('TXT preserves cells and outputs but strips notebook metadata',()=>{
 const t=notebookToText(nb);assert.match(t,/教材[\s\S]*回答：日本語[\s\S]*print\(3\)[\s\S]*3[\s\S]*売上/);
 assert.match(t,/\[保存済み画像: image\/png\]/);assert.doesNotMatch(t,/PRIVATE|hidden-id|execution_count|AAAA|attachment:sample/);
});
test('safe names preserve hierarchy and Unicode',()=>{
 assert.equal(exportPath('提出/生徒/授業.ipynb','pdf','確認'),'提出/生徒/授業_確認.pdf');
 assert.equal(exportPath('授業.ipynb','txt'),'授業.txt');
 assert.throws(()=>exportPath('../授業.ipynb','pdf'));assert.throws(()=>exportPath('授業.ipynb','txt','a/b'));
});
test('single one format or ZIP for folder and combined formats',()=>{
 const a={name:'授業.txt',data:'本文',type:'text/plain'},b={name:'授業.pdf',data:new Uint8Array([1,2]),type:'application/pdf'};
 assert.equal(packExports([a],'single').name,'授業.txt');
 const zip=packExports([a,b],'single');assert.equal(zip.name,'exported_notebooks.zip');assert.deepEqual([...zip.data.slice(0,4)],[80,75,3,4]);
 assert.equal(packExports([a],'folder').name,'exported_notebooks.zip');assert.throws(()=>packExports([a,a],'folder'));
});
test('unsupported output explicitly marked',()=>assert.match(savedOutputs({outputs:[{output_type:'display_data',data:{'application/vnd.jupyter.widget-view+json':{}}}]})[0].text,/再現できない/));
