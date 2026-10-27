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

test('provided banner rules distinguish equivalent formatting from review decisions',()=>{
 for(const [a,b,want] of [
 ['Alex And Erics Grocery','Alex & Erics Grocery','exact'],
 ['J M J Food Mart','JMJ Food Mart','exact'],
 ['Mc Donald Spirits','McDonald Spirits','exact'],
 ['Marcella S Pizzeria','Marcellas Pizzeria','exact'],
 ['Swarthmore Co-Op','Swarthmore Co Op','exact'],
 ['AmericInn Motel','Americ Inn Motel','exact'],
 ['Bubbas Bbq','Bubbas BBQ','exact'],
 ['Fratellis Pizza & Pasta Inc','Fratellis Pizza & Pasta','partial'],
 ['Meat Shop The','The Meat Shop','partial'],
 ['5 Star Grocery','Five Star Grocery','none'],
 ['Solsberry Mini Mart','Mini Mart','partial']
 ])assert.equal(compare(a,b,0),want,a);
});
test('provided address abbreviations preserve named streets and numeric identities',()=>{
 for(const [a,b,want] of [
 ['5303 Ave N','5303 Avenue N','exact'],
 ['1570 W Ln Rd','1570 W Lane Rd','exact'],
 ['108 Ctr St','108 Center St','exact'],
 ['2781 Euclid Hts Blvd','2781 Euclid Heights Blvd','exact'],
 ['1601 Pk Loop Dr','1601 Park Loop Dr','exact'],
 ['1510 Big Lk Rd','1510 Big Lake Rd','exact'],
 ['1341SE Moreland Ave','1341 SE Moreland Ave','exact'],
 ['1641Algonquin Rd','1641 Algonquin Rd','exact'],
 ['128 Main St W','128 W Main St','exact'],
 ['8954 County Rd E','8954 Co Rd E','exact'],
 ['E 2578 Cty Rd S','E 2578 Co Rd S','exact'],
 ['2171 N Hwy 151','2171 Hwy 151 N','exact'],
 ['12 First Street','12 1st St','exact'],
 ['12 Farm To Market 123','12 FM 123','exact'],
 ['12 State Highway 5','12 St Hwy 5','exact'],
 ['12 Interstate 95','12 I 95','exact'],
 ['108 Center St','900 Center Rd','partial'],
 ['11435 South St','900 South Rd','partial'],
 ['108 Center St','900 Park St','none'],
 ['5303 Avenue N','900 Avenue S','none'],
 ['12 1/2 Main St','12 1 2 Main St','partial']
 ])assert.equal(compare(a,b,2),want,JSON.stringify([a,b]));
});

test('postal comparison restores leading zeros and preserves ZIP+4 digits',()=>{
 for(const [a,b,want] of [
 ['987','00987','exact'],['1234','01234','exact'],
 ['987-7678','00987-7678','exact'],['9877678','00987-7678','exact'],
 ['98407','98407','exact'],['12347678','01234-7678','exact'],
 ['009877678','00987-7678','exact'],['987-0078','00987-0078','exact'],
 ['987','00987-7678','partial'],['00987-7678','987','partial'],
 ['987-7678','00987-7679','none'],['987','00988','none'],
 ['987-078','00987-0078','none'],['','00987',null]
 ])assert.equal(compare(a,b,5),want,JSON.stringify([a,b]));
});
