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
  ['A Circle B','*circle*'],['Circle & K','circle*'],['Circle-K','circle*'],
  ['Acme & Foods @ LLC','acme*food*'],['Circle *** Market','circ*mark*'],
  ['<b>Circle</b> &nbsp; K https://example.com null','*circle*']
 ]){
  const actual=engine.wildcardWords(raw,'banner');assert.equal(actual,expected,raw);assert.doesNotMatch(actual,/\s|\*\*/);
 }
 for(const raw of ['K','A & B','!!!','LLC @ K','undefined null 5125551212']){
  assert.equal(engine.wildcardWords(raw,'banner'),'');
  assert.equal(engine.createSearchPlan({bannerName:raw,zip:'98407',storeNumber:'7'}).length,0);
 }
 const plan=engine.createSearchPlan({bannerName:'Circle @ K',zip:'98407',storeNumber:'7'});
 assert.equal(plan.find(q=>q.type==='banner-wildcard-zip').fields.banner,'circle*');
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

test('standalone and becomes one wildcard boundary while words containing and are kept',()=>{
 for(const [banner,expected] of [['Bread and Butter','brea*butt*'],['Bread AND Butter','brea*butt*'],['Bread & Butter','brea*butt*'],['Bread and and Butter','brea*butt*'],['Circle and K','circle*'],['Candy and More','cand*more*']]){
  assert.equal(engine.wildcardWords(banner,'banner'),expected);
 }
 assert.equal(engine.wildcardWords('Candy','banner'),'candy*');
 assert.equal(engine.wildcardWords('and','banner'),'');
 const plan=engine.createSearchPlan({bannerName:'Bread and Butter',zip:'98407',storeNumber:'7'});
 assert.equal(plan.find(q=>q.type==='banner-wildcard-zip').fields.banner,'brea*butt*');
 assert.equal(plan.find(q=>q.type==='store-banner').fields.banner,'brea*butt*');
});

test('numbers and removed prefixes keep their wildcard position in banner searches',()=>{
 for(const [raw,expected] of [['7 Eleven','*eleven*'],['7Eleven','*eleven*'],['123 Eleven','*eleven*'],['@ Eleven','*eleven*'],['and Eleven','*eleven*'],['Eleven 123','eleven*'],['Bread 123 Butter','brea*butt*']])assert.equal(engine.wildcardWords(raw,'banner'),expected,raw);
 const plan=engine.createSearchPlan({bannerName:'7 Eleven',zip:'98407',storeNumber:'7'});
 const bannerQueries=plan.filter(q=>q.fields.banner);
 assert.ok(bannerQueries.length);
 bannerQueries.forEach(query=>assert.equal(query.fields.banner,'*eleven*'));
 assert.equal(plan.filter(q=>q.fields.zip).length,1);
});


test('numeric-only brands keep their digits while hashtag store numbers stay separate',()=>{
 for(const bannerName of ['76',' 76 ','76 #00123','123']){
  const expected=bannerName.trim()==='123'?'*123*':'*76*';
  assert.equal(engine.wildcardWords(bannerName,'banner'),expected);
  const plan=engine.createSearchPlan({bannerName,zip:'98407',storeNumber:'123'});
  assert.equal(plan.find(q=>q.type==='banner-wildcard-zip').fields.banner,expected);
  assert.equal(plan.find(q=>q.type==='store-banner').fields.banner,expected);
  assert.equal(plan.filter(q=>q.fields.zip).length,1);
 }
 const storeQuery=engine.createSearchPlan({bannerName:'76 #00123'}).find(q=>q.type==='store-banner');
 assert.equal(storeQuery.fields.storeNumber,'00123');
 assert.equal(storeQuery.fields.banner,'*76*');
 assert.equal(engine.wildcardWords('#00123','banner'),'');
});


test('numbered routes remain searchable and keep suite information for ranking',()=>{
 for(const address of ['RT 135 STE A','RTE 135 UNIT A','Route 135 Suite A','State Route 135 STE A','US HWY 135 STE A','SR 135 STE A','CR 135 STE A']){
  assert.equal(engine.addressWildcard(address),'*135*',address);
  const plan=engine.createSearchPlan({address,city:'Austin',zip:'78701'});
  assert.equal(plan.find(q=>q.type==='address-city').fields.address,'*135*');
  assert.equal(plan.find(q=>q.type==='address-zip').fields.address,'*135*');
  assert.equal(engine.normalizeSource({address}).unitKey,'a');
 }
 assert.equal(engine.addressWildcard('5121 RT 135 STE A'),'512*135*');
 assert.equal(engine.addressWildcard('RT 135A STE B'),'*135a*');
 assert.equal(engine.normalizeAddress('RT 135 STE A'),engine.normalizeAddress('Route 135 Suite A'));
 const ranked=engine.consolidateCandidates({address:'RT 135 STE A'},[
  {candidate:{slId:'2',address:'Route 135 Suite B'}},
  {candidate:{slId:'1',address:'Route 135 Suite A'}}
 ]);
 assert.equal(ranked[0].candidate.slId,'1');
 assert.equal(engine.addressWildcard('135 STE A'),'*135*');
});


test('generic business descriptors are omitted from every banner search without changing identity',()=>{
 for(const descriptor of ['store','stores','C STORE','c-store','cstore','convenience stores','pump','pumps','hotel','hotels','motel','motels','dispensary','dispensaries','shop','shops']){
  const bannerName='QUICK STOP '+descriptor+' 5';
  assert.equal(engine.wildcardWords(bannerName,'banner'),'quic*stop*',descriptor);
  const plan=engine.createSearchPlan({bannerName,zip:'46805',storeNumber:'5'});
  assert.ok(plan.some(q=>q.type==='banner-wildcard-zip'));
  assert.ok(plan.some(q=>q.type==='store-banner'));
  plan.filter(q=>q.fields.banner).forEach(q=>assert.equal(q.fields.banner,'quic*stop*'));
 }
 assert.equal(engine.wildcardWords('Quick Shop Stop','banner'),'quic*stop*');
 assert.equal(engine.wildcardWords('Shop Quick Stop','banner'),'*quic*stop*');
 assert.equal(engine.wildcardWords('Shoprite Pumpkins Hotelier','banner'),'shop*pump*hote*');
 assert.equal(engine.wildcardWords('Stores and Shops LLC','banner'),'');
 assert.equal(engine.createSearchPlan({bannerName:'Stores and Shops LLC',zip:'46805'}).length,0);
 const source=engine.normalizeSource({bannerName:'QUICK STOP C STORE 5',address:'651 E STATE BLVD',city:'FORT WAYNE',state:'IN',zip:'46805'});
 assert.equal(source.bannerName,'QUICK STOP C STORE 5');
 assert.equal(source.bannerKey,'quick stop c store 5');
 assert.equal(source.storeNumber,'');
 const cleanPlan=engine.createSearchPlan({bannerName:'Quick Stop Store',zip:'46805'});
 assert.equal(cleanPlan.find(q=>q.type==='banner-exact-zip').fields.banner,'quick stop');
});


test('banner plus state has its own query without requiring a ZIP',()=>{
 const plan=engine.createSearchPlan({bannerName:'QUICK STOP C STORE 5',state:'IN'});
 assert.deepEqual(plan.map(q=>q.type),['banner-state']);
 assert.deepEqual(plan[0].fields,{banner:'quic*stop*',state:'IN'});
 assert.equal(engine.createSearchPlan({bannerName:'Quick Stop'}).some(q=>q.type==='banner-state'),false);
});


test('US highway designators are omitted while the route number is retained',()=>{
 for(const [address,expected] of [
  ['5121 US 135','512*135*'],['5121 U.S. 135','512*135*'],
  ['5121 US Highway 135','512*135*'],['5121 U.S. HWY 135','512*135*'],
  ['5121 Highway US 135','512*135*'],['5121 Hwy U.S. 135','512*135*'],
  ['5121 N US-135 STE A','512*135*'],['US 135 STE A','*135*'],
  ['U.S. 135','*135*'],['US HWY 135','*135*'],['US-135','*135*'],
  ['12345 US 1','123*1*']
 ]){
  assert.equal(engine.addressWildcard(address),expected,address);
  const plan=engine.createSearchPlan({address,city:'Austin',zip:'78701'});
  for(const type of ['address-city','address-zip'])assert.equal(plan.find(q=>q.type===type).fields.address,expected);
 }
 assert.equal(engine.addressWildcard('5121 Houston Street'),'512*houst*');
 assert.equal(engine.splitAddress('5121 U.S. 135 STE A').unitKey,'a');
});


test('state highway names and codes are omitted only for numbered routes',()=>{
 const states=[['Alabama','AL'],['Alaska','AK'],['Arizona','AZ'],['Arkansas','AR'],['California','CA'],['Colorado','CO'],['Connecticut','CT'],['Delaware','DE'],['Florida','FL'],['Georgia','GA'],['Hawaii','HI'],['Idaho','ID'],['Illinois','IL'],['Indiana','IN'],['Iowa','IA'],['Kansas','KS'],['Kentucky','KY'],['Louisiana','LA'],['Maine','ME'],['Maryland','MD'],['Massachusetts','MA'],['Michigan','MI'],['Minnesota','MN'],['Mississippi','MS'],['Missouri','MO'],['Montana','MT'],['Nebraska','NE'],['Nevada','NV'],['New Hampshire','NH'],['New Jersey','NJ'],['New Mexico','NM'],['New York','NY'],['North Carolina','NC'],['North Dakota','ND'],['Ohio','OH'],['Oklahoma','OK'],['Oregon','OR'],['Pennsylvania','PA'],['Rhode Island','RI'],['South Carolina','SC'],['South Dakota','SD'],['Tennessee','TN'],['Texas','TX'],['Utah','UT'],['Vermont','VT'],['Virginia','VA'],['Washington','WA'],['West Virginia','WV'],['Wisconsin','WI'],['Wyoming','WY'],['District of Columbia','DC']];
 for(const pair of states)for(const label of pair){
  assert.equal(engine.addressWildcard('5121 '+label+' Rout 135'),'512*135*',label);
  assert.equal(engine.addressWildcard(label+' Highway 135 STE A'),'*135*',label);
 }
 for(const label of ['Rout','Route','RT','RTE','State Rout','State Road','SR','County Road','CR','Interstate','I'])assert.equal(engine.addressWildcard('5121 '+label+' 135'),'512*135*',label);
 for(const address of ['5121 IN-135','5121 I.N. Route 135','5121 New York 135','5121 Highway NY 135','5121 North Carolina Highway 135'])assert.equal(engine.addressWildcard(address),'512*135*',address);
 for(const [address,expected] of [['123 Washington Street','12*washingt*'],['123 Indiana Ave','12*india*'],['123 New York Avenue','12*n*yo*'],['123 State Street','12*sta*']])assert.equal(engine.addressWildcard(address),expected,address);
 const plan=engine.createSearchPlan({address:'5121 Indiana Rout 135 STE A',city:'Austin',state:'IN',zip:'78701'});
 for(const type of ['address-city','address-zip'])assert.equal(plan.find(q=>q.type===type).fields.address,'512*135*');
 assert.equal(engine.splitAddress('5121 Indiana Rout 135 STE A').unitKey,'a');
 assert.equal(engine.splitAddress('5121 FL Rout 135 STE A').unitKey,'a');
 assert.equal(engine.splitAddress('5121 Main St FL 2').unitKey,'2');
});


test('Address searches combine the same cleaned address with city, state, and ZIP separately',()=>{
 const plan=engine.createSearchPlan({address:'5121 IN Rout 135 STE A',city:'Austin',state:'TX',zip:'987-7678'});
 const addressQueries=plan.filter(q=>q.type.startsWith('address-'));
 assert.deepEqual(addressQueries.map(q=>q.type),['address-city','address-state','address-zip']);
 assert.deepEqual(addressQueries.map(q=>q.fields),[{address:'512*135*',city:'Austin'},{address:'512*135*',state:'TX'},{address:'512*135*',zip:'009*'}]);
 const stateOnly=engine.createSearchPlan({address:'RT 135 STE A',state:' IN '});
 assert.deepEqual(stateOnly.map(q=>q.fields),[{address:'*135*',state:'IN'}]);
});


test('Store search extracts main banner patterns without a brand-name list',()=>{
 for(const [bannerName,address,expected] of [
  ['QUICK STOP C STORE 5','','quic*stop*'],
  ['Store Name: QUICK STOP C STORE #5','','quic*stop*'],
  ['<b>Banner:</b> Quick Stop LLC #5','','quic*stop*'],
  ['QuickStopCStore5','','quic*stop*'],
  ['Business Name: NorthStarFoodsLLC #5','','nort*star*food*'],
  ['QUICK STOP C STORE 5 651 East State Blvd Fort Wayne IN','651 E State Blvd','quic*stop*'],
  ['NewRiver Shop #5 12 North Main Road Suite 2','12 N Main Rd Ste 2','new*rive*'],
  ['7Eleven Store #5','','*eleven*'],
  ['76 Store #5','','*76*'],
  ['Shoprite Pumpkins Hotelier','','shop*pump*hote*']
 ]){
  const raw={bannerName,address,storeNumber:'5'};
  assert.equal(engine.storeBannerWildcard(raw),expected,bannerName);
  assert.equal(engine.createSearchPlan(raw).find(q=>q.type==='store-banner').fields.banner,expected,bannerName);
  assert.equal(raw.bannerName,bannerName);
 }
 assert.equal(engine.storeBannerWildcard({bannerName:'Store LLC #5'}),'');
 const differentAddress={bannerName:'North Star 651 East State Blvd',address:'99 Oak Road'};
 assert.match(engine.storeBannerWildcard(differentAddress),/stat/);
});


test('building-only addresses preserve their full identifier and enable all address combinations',()=>{
 for(const address of ['BLDG 5207','Building 5207','BLDG. #5207','BLDG5207','Building No. 5207']){
  assert.equal(engine.addressWildcard(address),'*5207*',address);
  assert.equal(engine.normalizeAddress(address),'building 5207',address);
  assert.equal(engine.splitAddress(address).unitKey,'');
  const plan=engine.createSearchPlan({address,city:'Austin',state:'TX',zip:'78701'}).filter(q=>q.type.startsWith('address-'));
  assert.equal(plan.length,3);plan.forEach(q=>assert.equal(q.fields.address,'*5207*'));
 }
 assert.equal(engine.addressWildcard('BLDG 005207'),'*005207*');
 assert.equal(engine.addressWildcard('BLDG 5207A'),'*5207a*');
 assert.equal(engine.addressWildcard('123 Main St BLDG 5207'),'12*ma*');
 assert.equal(engine.splitAddress('123 Main St BLDG 5207').unitKey,'5207');
 assert.equal(engine.addressWildcard('5207'),'*5207*');
});

test('building identifiers match exactly and cannot match a longer building number by prefix',()=>{
 const source={bannerName:'Acme',address:'BLDG 5207',city:'Austin',state:'TX',zip:'78701'};
 const results=engine.consolidateCandidates(source,[
  {candidate:{...source,slId:'1',address:'Building 5207'}},
  {candidate:{...source,slId:'2',address:'BLDG 52070'}},
  {candidate:{...source,slId:'3',address:'5207 Main St'}}
 ]);
 assert.equal(results.find(r=>r.candidate.slId==='1').fieldMatches.address,true);
 for(const id of ['2','3'])assert.equal(results.find(r=>r.candidate.slId===id).fieldMatches.address,undefined);
});


test('unusable street addresses search one clear number with leading and trailing wildcards',()=>{
 for(const raw of ['5207','#5207','Unit 5207','Room 5207','Warehouse 5207','Unknown address 5207','Unknown5207','5207 Unknown','5207 Not Available','BLDG 5207 STE 2','5207 STE 2']){
  assert.equal(engine.addressWildcard(raw),'*5207*',raw);
  const queries=engine.createSearchPlan({address:raw,city:'Austin',state:'TX',zip:'78701'}).filter(q=>q.type.startsWith('address-'));
  assert.equal(queries.length,3);queries.forEach(q=>assert.equal(q.fields.address,'*5207*'));
 }
 assert.equal(engine.addressWildcard('005207'),'*005207*');
 assert.equal(engine.addressWildcard('123 Main St #5207'),'12*ma*');
 assert.equal(engine.addressWildcard('5121 US Hwy 135'),'512*135*');
 assert.equal(engine.addressWildcard('Reference 5207 / 9001'),'');
 assert.equal(engine.addressWildcard('Unknown address'),'');
});

test('unit-only number searches never claim an exact full address and unit match',()=>{
 const results=engine.consolidateCandidates({bannerName:'Acme',address:'Unit 5207'},[{candidate:{slId:'1',bannerName:'Acme',address:'Unit 5207'}}]);
 assert.equal(results[0].exactUnitMatch,false);assert.equal(results[0].fieldMatches.unit,undefined);
});


test('Banner checks include cleaned banner plus city without requiring a ZIP',()=>{
 const plan=engine.createSearchPlan({bannerName:'QUICK STOP C STORE #5',city:'  Fort   Wayne  ',zip:'46805'});
 assert.deepEqual(plan.find(q=>q.type==='banner-city').fields,{banner:'quic*stop*',city:'Fort Wayne'});
 const noZip=engine.createSearchPlan({bannerName:'Quick Stop',city:'Fort Wayne'});
 assert.deepEqual(noZip.map(q=>q.type),['banner-city']);assert.deepEqual(noZip[0].fields,{banner:'quic*stop*',city:'Fort Wayne'});
 assert.equal(engine.createSearchPlan({bannerName:'Quick Stop',zip:'46805'}).some(q=>q.type==='banner-city'),false);
});


test('copied ZIP dash variations normalize before ZIP and search planning',()=>{
 for(const dash of ['-','\u2010','\u2011','\u2012','\u2013','\u2014','\u2015','\u2212','\uFE58','\uFE63','\uFF0D']){
  const zip=' 987 '+dash+' 7678 ';
  assert.equal(engine.normalizePostal(zip),'00987-7678');
  assert.equal(engine.normalizeZip(zip),'00987');
  assert.equal(engine.createZip3(zip),'009*');
  const plan=engine.createSearchPlan({bannerName:'Quick Stop C Store 5',address:'651 E State Blvd',city:'Fort Wayne',state:'IN',zip});
  plan.filter(q=>q.fields.zip).forEach(q=>assert.equal(q.fields.zip,'009*'));
  assert.deepEqual(plan.find(q=>q.type==='banner-city').fields,{banner:'quic*stop*',city:'Fort Wayne'});
  assert.equal(engine.normalizePostal('987'+dash+'78'),'');
 }
});


test('abbreviation evidence matches complete phrases inside names without declaring direct duplicates',()=>{
 for(const [short,long] of [['BW3','Buffalo Wild Wings'],['VFW','Veterans of Foreign Wars'],['AAFES','Army & Air Force Exchange Services'],['AL','American Legion'],['KOC','Knights of Columbus']]){
  const [result]=engine.consolidateCandidates({bannerName:short+' Post 125'},[{candidate:{slId:'10',bannerName:long+' Post 125'}}]);
  assert.equal(result.fieldMatches.bannerAbbreviation,true,short);
  assert.equal(result.directMatch,false,short);
 }
 const [different]=engine.consolidateCandidates({bannerName:'AL Market'},[{candidate:{slId:'11',bannerName:'American Legion Post 125'}}]);
 assert.equal(different?.fieldMatches.bannerAbbreviation,undefined);
 assert.equal(engine.wildcardWords('BW3 #125','banner'),'bw3*');
});

test('single letter search tokens become wildcard boundaries while numeric identities remain usable',()=>{
 assert.equal(engine.wildcardWords('Circle K','banner'),'circle*');
 assert.equal(engine.wildcardWords('Alpha X Market','banner'),'alph*mark*');
 assert.equal(engine.addressWildcard('123 X Main Street'),'12*ma*');
 assert.equal(engine.addressWildcard('123 Main X Street'),'12*ma*');
 assert.equal(engine.addressWildcard('BLDG 5207'),'*5207*');
 assert.equal(engine.wildcardWords('76','banner'),'*76*');
});


test('7-11 brand aliases share case-insensitive search and ranking identity',()=>{
 const aliases=['7-11','7–11','7/11','7 Eleven','7 ELEVEN','7Eleven','Seven Eleven','SEVEN-ELEVEN'];
 for(const bannerName of aliases){
  assert.equal(engine.normalizeBanner(bannerName),engine.normalizeBanner('7 eleven'),bannerName);
  assert.equal(engine.wildcardWords(bannerName,'banner'),'*eleven*',bannerName);
  const plan=engine.createSearchPlan({bannerName:bannerName+' #00125',city:'Austin',state:'TX',zip:'78701'});
  assert.ok(plan.some(q=>q.type==='banner-city'));
  for(const query of plan.filter(q=>q.fields.banner)) assert.equal(query.fields.banner,'*eleven*');
  const [ranked]=engine.consolidateCandidates({bannerName:bannerName+' #00125',city:'AUSTIN'},[{candidate:{slId:'77',bannerName:'7 eleven',storeNumber:'00125',city:'austin'}}]);
  assert.equal(ranked.fieldMatches.bannerName,true);
  assert.equal(ranked.fieldMatches.city,true);
  assert.equal(ranked.directMatch,true);
 }
 for(const unrelated of ['711','17-11','7-110','ABC7-11','Store 711'])assert.notEqual(engine.normalizeBanner(unrelated),engine.normalizeBanner('7 Eleven'));
 const [ranked]=engine.consolidateCandidates({bannerName:'7-11'},[{candidate:{slId:'78',bannerName:'7 ELEVEN'}}]);
 assert.equal(ranked.fieldMatches.bannerName,true);assert.equal(ranked.directMatch,false);
 assert.equal(engine.normalizeSource({address:'123 MAIN ST',city:'Austin',state:'TX'}).addressKey,engine.normalizeSource({address:'123 main st',city:'austin',state:'tx'}).addressKey);
});


test('PO Box searches use only the complete box number with wildcard boundaries',()=>{
 for(const address of ['PO Box 12121','P.O. BOX #12121','P O Box 12121','Post Office Box 12121','POBOX 12121','PO Box 00121 Austin TX 78701']){
  const expected=address.includes('00121')?'*00121*':'*12121*';
  assert.equal(engine.addressWildcard(address),expected,address);
  const searches=engine.createSearchPlan({address,city:'Austin',state:'TX',zip:'78701'}).filter(q=>q.fields.address);
  assert.equal(searches.length,3);searches.forEach(q=>assert.equal(q.fields.address,expected));
 }
 assert.equal(engine.addressWildcard('123 Box Street'),'12*b*');
});

test('native Banner plus City runs before ZIP checks so an earlier timeout cannot skip it',()=>{
 const plan=engine.createSearchPlan({bannerName:'Quick Stop',city:'Fort Wayne',zip:'46805'});
 assert.equal(plan[0].type,'banner-city');
 assert.deepEqual(plan[0].fields,{banner:'quic*stop*',city:'Fort Wayne'});
});
