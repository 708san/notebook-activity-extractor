import pdfMake from 'pdfmake/build/pdfmake.js';
import MarkdownIt from 'markdown-it';
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';
import vfs from './font-vfs.generated.js';

pdfMake.addVirtualFileSystem(vfs);
pdfMake.addFonts({
 UD:{normal:'BIZUDPGothic-Regular.ttf',bold:'BIZUDPGothic-Bold.ttf',italics:'BIZUDPGothic-Regular.ttf',bolditalics:'BIZUDPGothic-Bold.ttf'},
 UDCode:{normal:'BIZUDGothic-Regular.ttf',bold:'BIZUDGothic-Regular.ttf',italics:'BIZUDGothic-Regular.ttf',bolditalics:'BIZUDGothic-Regular.ttf'}
});
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const mathDoc=mathjax.document('',{InputJax:new TeX({packages:AllPackages.filter(x=>!['html','autoload','require','configmacros'].includes(x))}),OutputJax:new SVG({fontCache:'none'})});
export function mathSvg(value){
 const node=mathDoc.convert(String(value),{display:true});
 const svg=adaptor.firstChild(node);
 if(!svg||adaptor.kind(svg)!=='svg')throw Error('数式変換失敗');
 const result=adaptor.outerHTML(svg);
 if(/data-mml-node="merror"/.test(result))throw Error('数式構文エラー');
 // MathJax dimensions in ex are normalized using the SVG viewBox.
 return result.replace(/width="[\d.]+ex"/,'width="480"').replace(/height="[\d.]+ex"/,'');
}
const markdown=new MarkdownIt({html:true,linkify:false,breaks:false});
markdown.validateLink=url=>! /^\s*(javascript|vbscript|file):/i.test(url);
markdown.inline.ruler.before('escape','local_math',(state,silent)=>{
 const start=state.pos;
 if(state.src[start]!=='$')return false;
 const delim=state.src.startsWith('$$',start)?'$$':'$';
 let end=state.src.indexOf(delim,start+delim.length);
 if(end<0||end===start+delim.length)return false;
 const value=state.src.slice(start+delim.length,end);
 if(!silent){const token=state.push('local_math','span',0);token.content=value;}
 state.pos=end+delim.length;return true;
});
markdown.renderer.rules.local_math=(tokens,i)=>'<span data-math="'+markdown.utils.escapeHtml(tokens[i].content)+'">'+markdown.utils.escapeHtml(tokens[i].content)+'</span>';
export {pdfMake,markdown};
