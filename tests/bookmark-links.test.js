const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {globalThis:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/bookmark-links.js'),'utf8'),context);
const Links=context.globalThis.PickerBookmarkLinks;
function input(label) {
 return {getClientRects:()=>[{}],closest:()=>null,getAttribute:()=>null,ownerDocument:{getElementById:()=>null},labels:[{textContent:label}],parentElement:{querySelectorAll:()=>[]}};
}
test('TD Links field recognizes Tdlinx_store_code across case and separator variations',()=>{
 for(const label of ['Tdlinx_store_code','TDLINX_STORE_CODE','TDLINX Store Code']){
  const td=input(label),store=input('Store Number');
  assert.equal(Links.findTdField({querySelectorAll:()=>[store,td]}).input,td);
 }
});
test('duplicate Tdlinx_store_code fields remain ambiguous',()=>{
 assert.match(Links.findTdField({querySelectorAll:()=>[input('Tdlinx_store_code'),input('TDLINX Store Code')]}).error,/Multiple TDLINX_STORE_CODE fields/);
});


test('TD store-code field takes priority over a source SL_ID field',()=>{
 const source=input('SL_ID'),td=input('TDLINX_STORE_CODE');
 assert.equal(Links.findTdField({querySelectorAll:()=>[source,td]}).input,td);
});

test('TD discovery uses the nearby label when GSRS duplicate IDs leave input.labels empty',()=>{
 const td=input('');td.labels=[];
 const checkbox={getClientRects:()=>[{}],closest:()=>null};
 const group={querySelectorAll:selector=>selector.includes('label')?[{getAttribute:()=>null,textContent:'TDLINX_STORE_CODE'}]:selector==='input[type="checkbox"]'?[checkbox]:[td]};
 td.closest=selector=>selector.includes('horizontalPanelMM')?group:null;
 const found=Links.findTdField({querySelectorAll:()=>[td]});
 assert.equal(found.input,td);assert.equal(found.checkbox,checkbox);
});

test('ranked TD search uses the existing form without a separate Links control',async()=>{
 const td=input('TDLINX_STORE_CODE');td.value='original';
 const checkbox={checked:false,disabled:false,getClientRects:()=>[{}],closest:()=>null,click(){this.checked=!this.checked;}};
 const group={querySelectorAll:selector=>selector==='input[type="checkbox"]'?[checkbox]:selector.includes('label')?[]:[td]};
 td.closest=selector=>selector.includes('horizontalPanelMM')?group:null;
 const dialog={querySelectorAll:()=>[td]},button={};
 let cleared=0,submitted=0,restored=0;
 const local={globalThis:{PickerManualMatchAdapter:{
  findDialog:()=>dialog,captureFields:()=>({dialog}),findSearchButton:()=>({button}),
  clearSearchFilters:()=>{cleared++;checkbox.checked=false;return {ok:true};},
  setInputValue:(input,value)=>{input.value=value;},
  submitAndWait:async(d,b)=>{assert.equal(d,dialog);assert.equal(b,button);assert.equal(checkbox.checked,true);assert.equal(td.value,'0067788,7867788');submitted++;return {status:'complete',rows:[]};},
  restoreFields:()=>{restored++;td.value='original';checkbox.checked=false;}
 }}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/bookmark-links.js'),'utf8'),local);
 const result=await local.globalThis.PickerBookmarkLinks.execute(['0067788','7867788']);
 assert.equal(result.status,'complete');assert.equal(cleared,1);assert.equal(submitted,1);assert.equal(restored,1);assert.equal(td.value,'original');
});

test('a source SL_ID field is never used instead of a missing TD store-code field',()=>{
 assert.match(Links.findTdField({querySelectorAll:()=>[input('SL_ID')]}).error,/TDLINX_STORE_CODE field not found/);
});
