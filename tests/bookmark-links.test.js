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
 assert.match(Links.findTdField({querySelectorAll:()=>[input('Tdlinx_store_code'),input('TDLINX Store Code')]}).error,/Multiple TD fields/);
});
