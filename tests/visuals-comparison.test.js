const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../gsrs-highlighter.js'),'utf8').split("const style=document.createElement('style');")[0];
const context={window:{},document:{querySelectorAll:()=>[{closest:()=>null,getClientRects:()=>[{}]}]},console};
vm.createContext(context);vm.runInContext(src+'globalThis.rules={compare,header};})();',context);
const {compare,header}=context.rules;
test('RS and SL prefixes map the same fields with punctuation or whitespace',()=>{
 for(const name of ['RS STORE NAME','SL STORE NAME','RS_STORE_NAME','SL_STORE_NAME','SL PA LINE1'])assert.equal(header(name),name.includes('LINE1')?'PALINE1':'STORENAME');
});
test('phone comparisons preserve digits and compare the last seven plus separate area code',()=>{
 for(const [p,c,area,want] of [
  ['(212) 555-0123','5550123','212','exact'],
  ['+1 (212) 555-0123','555-0123','212','exact'],
  ['2125550123','5550123','646','partial'],
  ['2125550123','5550123','','partial'],
  ['5550123','555-0123','','exact'],
  ['2125550123 ext 456','5550123','212','exact'],
  ['2125550123','5550124','212','none'],
  ['2120550123','550123','212','none'],
  ['','5550123','212',null]
 ])assert.equal(compare(p,c,7,{childArea:area}),want,JSON.stringify([p,c,area]));
 assert.equal(compare('2125550123','5550123',8,{childArea:'646'}),'partial');
});
test('addresses tolerate business prefixes and missing street words without hiding numeric differences',()=>{
 for(const [p,c,want] of [
  ['100 Mount Pleasant Road Suite 2','100 Mt Pleasant Rd Ste 2','exact'],
  ['100 Main Road #2','100 Main Rd Suite 2','exact'],
  ['100 Mt Pleasant Rd Suite 2','900 Mount Pleasant Road Suite 7','partial'],
  ['123 Main Rd','123 Main Highway','partial'],
  ['123 Road','900 Rd','none'],
  ['123 Highway','900 Hwy','none'],
  ['123 Oak Rd','123 Pine Rd','none'],
  ['123 Highway 69','900 Hwy 69','partial'],
  ['123 Main Rd','123 Mainrd','none'],
  ['circleK 123 main rout','123 main St','partial'],
  ['Circle K 123 Main Street','123 Main St','partial'],
  ['123 Old Main Road','123 Main Rd','partial'],
  ['123 Main Street','123 Main St','exact'],
  ['123 Main St','124 Main St','partial'],
  ['1003 Main St','1007 Main St','partial'],
  ['1003 Main St','9007 Main St','partial'],
  ['1003 Main St','1013 Main St','partial'],
  ['1003 Main St','1014 Main St','partial'],
  ['1013 Main St','1003 Main St','partial'],
  ['999 Main St','1003 Main St','partial'],
  ['1003 Main St','9787 Main St','partial'],
  ['123 Main St','1234 Main St','partial'],
  ['105- 109 Main St','107 Main Street','partial'],
  ['107 Main St','105–109 Main St','partial'],
  ['105-109 Main St','110 Main St','partial'],
  ['105-109 Main St','108-112 Main St','partial'],
  ['105-109 Main St','205-209 Main St','partial'],
  ['105-109 Main St','107 Oak St','none'],
  ['123 North Main St','123 Main St','partial'],
  ['123 Main St','123 N Main St','partial'],
  ['123 N Main St','123 North Main St','exact'],
  ['123 N Main St','123 S Main St','partial'],
  ['123 Main St','123 Oak St','none'],
  ['875 Highway 69 N','875 Hwy 70 North','none'],
  ['123 Main St Suite 2','123 Main St Suite 3','partial'],
  ['123 Main St Suite 2','123 Main St','partial'],
  ['Circle K 123 Main Rd','Circle K 123 Oak Rd','none']
 ])assert.equal(compare(p,c,2),want,JSON.stringify([p,c]));
});
