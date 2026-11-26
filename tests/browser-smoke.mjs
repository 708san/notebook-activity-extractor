import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'notebook-tools-'));
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
const url='http://127.0.0.1:8765/';
let browser;
try{
 for(let i=0;i<30;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(!req.url().startsWith(url)&&!req.url().startsWith('blob:')&&!req.url().startsWith('data:'))external.push(req.url());});
 await page.goto(url);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
 const nb={nbformat:4,nbformat_minor:5,metadata:{secret:'DO_NOT_EXPORT'},cells:[
 {cell_type:'markdown',id:'title',metadata:{},source:'# 日本語教材'},
 {cell_type:'markdown',id:'activity',metadata:{},source:'### 1-1. ワーク：確認'},
 {cell_type:'markdown',id:'task',metadata:{},source:'表と数式 $x^2$ を確認。\n\n|項目|値|\n|---|---|\n|売上|100|'},
 {cell_type:'markdown',id:'mark',metadata:{},source:'---\n＜入力＞ 回答'},
 {cell_type:'markdown',id:'answer',metadata:{},source:'生徒の回答：保存しました。'},
 {cell_type:'code',id:'code',metadata:{},source:'print("実行成功")',execution_count:2,outputs:[{output_type:'stream',name:'stdout',text:'実行成功\n'},{output_type:'display_data',metadata:{},data:{'image/png':png}},{output_type:'display_data',metadata:{},data:{'text/html':'<table><tr><th>分類</th><th>結果</th></tr><tr><td>犬</td><td>猫</td></tr></table>'}}]},
 {cell_type:'markdown',id:'end',metadata:{},source:'---'}
 ]};
 const payload={name:'授業.ipynb',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(nb))};
 await page.locator('#submission').setInputFiles(payload);
 await page.locator('#load').click();
 await page.locator('#modePanel').waitFor({state:'visible'});
 await page.locator('#run').click();await page.locator('#results').waitFor({state:'visible'});
 assert.match(await page.locator('#resultList').innerText(),/生徒の回答/);
 await page.locator('#exportMode').click();await page.locator('#formatPdf').uncheck();
 await page.locator('#convert').click();
 await page.getByRole('button',{name:'ダウンロード：授業.txt',exact:true}).waitFor();
 let event=page.waitForEvent('download');await page.getByRole('button',{name:'ダウンロード：授業.txt',exact:true}).click();let download=await event;
 await download.saveAs(join(dir,'out.txt'));const txt=await readFile(join(dir,'out.txt'),'utf8');assert.match(txt,/生徒の回答/);assert.match(txt,/実行成功/);assert.doesNotMatch(txt,/DO_NOT_EXPORT|iVBORw0/);
 await page.locator('#formatPdf').check();
 await page.locator('#convert').click();
 await page.getByRole('button',{name:'ダウンロード：exported_notebooks.zip',exact:true}).waitFor({timeout:120000});
 event=page.waitForEvent('download');await page.getByRole('button',{name:'ダウンロード：exported_notebooks.zip',exact:true}).click();download=await event;
 await download.saveAs(join(dir,'out.zip'));
 execFileSync('unzip',['-o',join(dir,'out.zip'),'-d',dir]);
 const pdf=await readFile(join(dir,'授業.pdf'));assert.equal(pdf.subarray(0,4).toString(),'%PDF');
 const extracted=execFileSync('pdftotext',[join(dir,'授業.pdf'),'-'],{encoding:'utf8'}).replace(/\s/g,'');
 assert.match(extracted,/日本語教材/);assert.match(extracted,/生徒の回答/);assert.match(extracted,/実行成功/);assert.match(extracted,/分類/);
 assert.doesNotMatch(extracted,/DO_NOT_EXPORT/);
 assert.match(execFileSync('pdffonts',[join(dir,'授業.pdf')],{encoding:'utf8'}),/BIZUD/);
 await page.locator('#formatTxt').uncheck();await page.locator('#convert').click();
 await page.getByRole('button',{name:'ダウンロード：授業.pdf',exact:true}).waitFor({timeout:120000});
 await page.locator('#extractMode').click();assert.equal(await page.locator('#results').isVisible(),true);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('browser smoke: extraction, TXT, PDF, both formats, Japanese extraction, local requests passed');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
