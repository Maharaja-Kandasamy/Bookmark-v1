const engine = require('../vendor/duplicate-engine');
const test = require('node:test');
const assert = require('node:assert/strict');
test('wildcards omit address types, directions and mount variants', () => {
  assert.equal(engine.wildcardWords('125 West Mount Main Road Suite 4', 'address'), '12*ma*');
  assert.equal(engine.wildcardWords('125 W Mt Main Rd Unit 8', 'address'), '12*ma*');
  assert.equal(engine.wildcardWords('Road Mt', 'address'), '');
});
test('business suffixes are removed from wildcard and comparison keys', () => {
  assert.equal(engine.wildcardWords('Acme Foods, Inc. Ltd LLC', 'banner'), 'acme*food*');
  assert.equal(engine.normalizeBanner('Acme L.L.C.'), 'acme');
  assert.equal(engine.normalizeSource({bannerName:'Acme Inc.'}).bannerKey, 'acme');
  const plan = engine.createSearchPlan({bannerName:'Acme Ltd',address:'20 Mount Oak Road',city:'Austin',zip:'78701'});
  assert.equal(plan.find(q=>q.type==='address-city').fields.address,'2*o*');
  assert.equal(plan.find(q=>q.type==='address-zip').fields.address,'2*o*');
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

test('Wren example produces the confirmed primary street search and banner wildcard',()=>{
 const address='5121 N Pearl St #100 23315 Co Hwy 18 Ruston WA';
 assert.equal(engine.wildcardWords(address,'address'),'512*pea*');
 assert.equal(engine.wildcardWords('Wren S Nest Baking Co','banner'),'wren*nest*baki*');
 assert.equal(engine.normalizeBanner('Wren S Nest Baking Co'),engine.normalizeBanner('Wrens Nest Baking'));
 assert.equal(engine.normalizeBanner("Wren's Nest Baking Co"),engine.normalizeBanner('Wrens Nest Baking'));
 const plan=engine.createSearchPlan({bannerName:'Wren S Nest Baking Co',address,city:'Ruston',zip:'98407'});
 assert.equal(plan.find(q=>q.type==='banner-exact-zip').fields.banner,'wren nest baking');
 for(const query of plan.filter(q=>q.fields.address))assert.equal(query.fields.address,'512*pea*');
});

test('house number and street shortening use single wildcards without unit or highway noise',()=>{
 for(const [address,expected] of [
  ['12345 N Pearl Street Suite 100','123*pea*'],
  ['5121 North Pearl St Unit 100','512*pea*'],
  ['5121 N Pearl St 23315 Co Hwy 18','512*pea*'],
  ['123 Pearl Road','12*pea*'],
  ['12 Pearl Road','1*pea*'],
  ['1 Pearl Road','1*pea*'],
  ['5121 Pearl Grove Avenue Apartment A','512*pea*gro*']
 ]){
  const actual=engine.wildcardWords(address,'address');assert.equal(actual,expected,address);
  assert.doesNotMatch(actual,/\s|\*\*/);
 }
});

test('exact full address and unit ranks first while prefix-only house matches stay broad',()=>{
 const source={bannerName:'Wren S Nest Baking Co',address:'5121 N Pearl St #100 23315 Co Hwy 18 Ruston WA',phone:'5125551212'};
 const results=engine.consolidateCandidates(source,[
  {candidate:{slId:'A',bannerName:'Wrens Nest Baking',address:'5121 North Pearl Street Suite 200',phone:'5125551212'}},
  {candidate:{slId:'B',bannerName:'Wrens Nest Baking',address:'5121 North Pearl Street Suite 100'}},
  {candidate:{slId:'C',bannerName:'Wrens Nest Baking',address:'5129 N Pearl St Unit 100'}}
 ]);
 assert.equal(results[0].candidate.slId,'B');
 assert.equal(results[0].exactUnitMatch,true);
 assert.equal(results[0].fieldMatches.unit,true);
 assert.equal(results.find(x=>x.candidate.slId==='A').exactUnitMatch,false);
 assert.equal(results.find(x=>x.candidate.slId==='C').exactUnitMatch,false);
 assert.equal(results.find(x=>x.candidate.slId==='C').fieldMatches.address,undefined);
 assert.equal(engine.splitAddress(source.address).unitKey,'100');
 assert.equal(engine.normalizeAddress(source.address),'5121 n pearl st');
});

test('single-character banner tokens and special characters become clean wildcard separators',()=>{
 for(const [raw,expected] of [
  ['Circle K','circle*'],['Circle S','circle*'],['Circle @ K !!!','circle*'],
  ['A Circle B','circle*'],['Circle & K','circle*'],['Circle-K','circle*'],
  ['Acme & Foods @ LLC','acme*food*'],['Circle *** Market','circ*mark*'],
  ['<b>Circle</b> &nbsp; K https://example.com null','circle*']
 ]){
  const actual=engine.wildcardWords(raw,'banner');assert.equal(actual,expected,raw);assert.doesNotMatch(actual,/\s|\*\*/);
 }
 for(const raw of ['K','A & B','!!!','LLC @ K','undefined null 5125551212']){
  assert.equal(engine.wildcardWords(raw,'banner'),'');
  assert.equal(engine.createSearchPlan({bannerName:raw,zip:'98407',storeNumber:'7'}).length,0);
 }
 const plan=engine.createSearchPlan({bannerName:'Circle @ K',zip:'98407',storeNumber:'7'});
 assert.equal(plan.find(q=>q.type==='banner-exact-zip').fields.banner,'circle');
 assert.equal(plan.find(q=>q.type==='banner-wildcard-zip').fields.banner,'circle*');
 assert.equal(plan.find(q=>q.type==='store-banner').fields.banner,'circle*');
});

test('store number is inferred from a single banner hashtag only when the field is blank',()=>{
 for(const bannerName of ['Circle K #00123','Circle K # 00123','Circle K #00123 #00123']){
  const source=engine.normalizeSource({bannerName,storeNumber:' '});
  assert.equal(source.storeNumber,'00123');assert.equal(source.storeNumberInferred,true);
  const query=engine.createSearchPlan({bannerName}).find(q=>q.type==='store-banner');
  assert.equal(query.fields.storeNumber,'00123');assert.equal(query.fields.banner,'circle*');
 }
 const explicit=engine.normalizeSource({bannerName:'Circle K #00123',storeNumber:'99'});
 assert.equal(explicit.storeNumber,'99');assert.equal(explicit.storeNumberInferred,false);
 assert.equal(engine.normalizeSource({bannerName:'Circle K #123 #456'}).storeNumber,'');
 assert.equal(engine.normalizeSource({bannerName:'Circle K #123A'}).storeNumber,'');
 assert.equal(engine.normalizeSource({bannerName:'Circle K #123',storeNumber:0}).storeNumber,'0');
 assert.equal(engine.normalizeBanner('Circle K #123'),engine.normalizeBanner('Circle K'));
});

test('human-readable match explanations include specific unit conflicts',()=>{
 const source={bannerName:'Wrens Nest Baking',address:'5121 N Pearl St #100'};
 const ranked=engine.consolidateCandidates(source,[{candidate:{slId:'1',bannerName:'Wrens Nest Baking',address:'5121 N Pearl St #100'}},{candidate:{slId:'2',bannerName:'Wrens Nest Baking',address:'5121 N Pearl St #200'}}]);
 assert.match(engine.explainCandidate(source,ranked[0]).summary,/Same address and unit; Same business name/);
 assert.deepEqual(engine.explainCandidate(source,ranked[1]).conflicts,['Different unit: 200 instead of 100']);
});
