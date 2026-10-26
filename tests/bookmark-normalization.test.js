const engine = require('../vendor/duplicate-engine');
const test = require('node:test');
const assert = require('node:assert/strict');
test('wildcards omit address types, directions and mount variants', () => {
  assert.equal(engine.wildcardWords('125 West Mount Main Road Suite 4', 'address'), '125*main*');
  assert.equal(engine.wildcardWords('125 W Mt Main Rd Unit 8', 'address'), '125*main*');
  assert.equal(engine.wildcardWords('Road Mt', 'address'), '');
});
test('business suffixes are removed from wildcard and comparison keys', () => {
  assert.equal(engine.wildcardWords('Acme Foods, Inc. Ltd LLC', 'banner'), 'acme*food*');
  assert.equal(engine.normalizeBanner('Acme L.L.C.'), 'acme');
  assert.equal(engine.normalizeSource({bannerName:'Acme Inc.'}).bannerKey, 'acme');
  const plan = engine.createSearchPlan({bannerName:'Acme Ltd',address:'20 Mount Oak Road',city:'Austin',zip:'78701'});
  assert.equal(plan.find(q=>q.type==='address-city').fields.address,'20*oak*');
  assert.equal(plan.find(q=>q.type==='address-zip').fields.address,'20*oak*');
  assert.equal(plan.find(q=>q.type==='banner-wildcard-zip').fields.banner,'acme*');
});

test('consolidation preserves each record status and fills missing status from later searches', () => {
 const results=engine.consolidateCandidates({bannerName:'Acme'},[
  {candidate:{slId:'A',bannerName:'Acme'}},
  {candidate:{slId:'B',bannerName:'Acme',storeStatus:'Closed'}},
  {candidate:{slId:'A',bannerName:'Acme',storeStatus:'Open'}}
 ]);
 assert.equal(results.find(x=>x.candidate.slId==='A').candidate.storeStatus,'Open');
 assert.equal(results.find(x=>x.candidate.slId==='B').candidate.storeStatus,'Closed');
});

test('ZIP base is padded before ZIP3 search, including short ZIP+4 inputs', () => {
 for(const [input,expected] of [['987','00987'],['987-7678','00987'],['00987-7678','00987'],['1234','01234'],['7','00007'],['78701','78701'],['78701-1234','78701'],['009877678','00987'],[' 987 -7678 ','00987']]){
  assert.equal(engine.normalizeZip(input),expected,input);
  assert.equal(engine.normalizeSource({zip:input}).zip,expected,input);
  assert.equal(engine.createZip3(input),expected.slice(0,3)+'*',input);
  const searches=engine.createSearchPlan({bannerName:'Acme',address:'12 Main Road',city:'Austin',zip:input}).filter(q=>q.fields.zip);
  assert.equal(searches.length,3);
  searches.forEach(q=>assert.equal(q.fields.zip,expected.slice(0,3)+'*'));
 }
 for(const input of ['',null,undefined,'-7678']){assert.equal(engine.normalizeZip(input),'');assert.equal(engine.createZip3(input),'');}
});

test('matching ZIP evidence compares the corrected five-digit bases', () => {
 const [result]=engine.consolidateCandidates({zip:'987-7678'},[{candidate:{slId:'A',zip:'00987'}}]);
 assert.equal(result.fieldMatches.zip,true);
});

test('compact ZIP+4 restores missing leading zeros before splitting the base', () => {
 for (const [input,postal,base,zip3] of [
  ['9877678','00987-7678','00987','009*'],
  ['09877678','00987-7678','00987','009*'],
  ['009877678','00987-7678','00987','009*'],
  ['987-7678','00987-7678','00987','009*'],
  ['123456','00012-3456','00012','000*'],
  ['123456789','12345-6789','12345','123*']
 ]) {
  assert.equal(engine.normalizePostal(input),postal);
  assert.equal(engine.normalizeZip(input),base);
  assert.equal(engine.createZip3(input),zip3);
 }
 for (const invalid of ['1234567890','987-78','abc987','987-76789','12345-6789-0']) {
  assert.equal(engine.normalizePostal(invalid),'');
  assert.equal(engine.createZip3(invalid),'');
 }
});

test('top TD list takes ranked unique IDs and preserves leading zeros',()=>{
 const ranked=['7867788','0067788','7867788','1234567','7654321','2345678','9999999'].map(slId=>({candidate:{slId}}));
 assert.deepEqual(engine.getTopTdIds(ranked),['7867788','0067788','1234567','7654321','2345678']);
 assert.deepEqual(engine.getTopTdIds([{candidate:{slId:'not-a-td'}},{candidate:{slId:'0000012'}}]),['0000012']);
});
