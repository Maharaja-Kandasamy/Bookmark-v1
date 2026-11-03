const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');
function setup(){
 const dialog={};
 const context={globalThis:{},document:{evaluate:()=>({singleNodeValue:dialog})},XPathResult:{FIRST_ORDERED_NODE_TYPE:1},HTMLInputElement:class{},HTMLTextAreaElement:class{},Event:class{},getComputedStyle:element=>({visibility:element.hidden?'hidden':'visible'})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vendor/manual-match-adapter.js'),'utf8'),context);
 return {A:context.globalThis.PickerManualMatchAdapter,dialog};
}

test('clearing search filters includes unknown filters and retains values cleared by checkbox clicks',()=>{
 const {A,dialog}=setup();const input={value:'keep this work',isConnected:true,dispatchEvent(){}};
 const checkbox={checked:true,click(){this.checked=false;input.value='';}};
 const extra={checked:true,click(){this.checked=false;}};
 const result=A.clearSearchFilters({dialog,fields:[{input,checkbox,value:input.value},{checkbox:extra}]});
 assert.equal(result.ok,true);assert.equal(checkbox.checked,false);assert.equal(extra.checked,false);assert.equal(input.value,'keep this work');
});

test('a selected filter that cannot be unchecked prevents submitting a mixed search',()=>{
 const {A,dialog}=setup();const checkbox={checked:true,disabled:true};
 const result=A.clearSearchFilters({dialog,fields:[{checkbox}]});
 assert.equal(result.ok,false);assert.match(result.diagnostic,/could not be unchecked/);
});

test('shared Search button is preferred and hidden automation buttons are ignored',()=>{
 const {A,dialog}=setup();
 const button=(testid,hidden=false)=>({textContent:'Search',getClientRects:()=>[{}],closest:()=>null,getAttribute:name=>name==='data-testid'?testid:null,hidden});
 const actual=button('search-button'),other=button('other');
 dialog.querySelectorAll=()=>[actual,other,button('search-button',true)];assert.equal(A.findSearchButton(dialog).button,actual);
 dialog.querySelectorAll=()=>[other,button('another')];assert.match(A.findSearchButton(dialog).error,/Multiple/);
});

test('restoration attempts all field values even when a checkbox fails',()=>{
 const {A,dialog}=setup();const one={value:'',isConnected:true,dispatchEvent(){}},two={value:'',isConnected:true,dispatchEvent(){}};
 const broken={checked:false,isConnected:true,click(){throw Error('Detached handler');}};
 const result=A.restoreFields({dialog,fields:[{checkbox:broken,checked:true,input:one,value:'first saved field'},{input:two,value:'second saved field'}]});
 assert.equal(result.ok,false);assert.equal(one.value,'first saved field');assert.equal(two.value,'second saved field');
});


test('a button-run session clears once and keeps the shared Address checkbox selected',()=>{
 const {A,dialog}=setup();const clicks=[];
 const create=name=>{
  const input={value:'original '+name,isConnected:true,dispatchEvent(){},closest:selector=>selector.startsWith('table')?null:group};
  const checkbox={checked:true,isConnected:true,click(){this.checked=!this.checked;clicks.push({name,checked:this.checked});if(!this.checked)input.value='';}};
  const group={querySelectorAll:()=>[checkbox]};return {name,input,checkbox};
 };
 const fields=['Address','City','State','ZIP'].map(create);
 dialog.querySelectorAll=()=>fields.map(f=>f.input);dialog.querySelector=()=>null;
 const session=A.beginSearchSession();assert.equal(session.ok,true);assert.equal(clicks.length,4);
 const address=fields[0];
 for(const location of fields.slice(1)){
  const selected=A.selectSearchFilters(dialog,[{...address,value:'512*pea*'},{...location,value:location.name}],session.profile);
  assert.equal(selected.ok,true);assert.equal(address.checkbox.checked,true);
 }
 assert.equal(clicks.filter(c=>c.name==='Address'&&!c.checked).length,1);
 assert.equal(clicks.filter(c=>c.name==='Address'&&c.checked).length,1);
 assert.equal(A.endSearchSession(session).ok,true);
 fields.forEach(f=>{assert.equal(f.input.value,'original '+f.name);assert.equal(f.checkbox.checked,true);});
 const count=clicks.length;A.endSearchSession(session);assert.equal(clicks.length,count);
});
