const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../vendor/gsrs-table-adapter');
test('stable source table takes priority over a positional XPath that may point at results',()=>{
 const source={headers:['RS_ID','RS_STORE_NAME','RS_PA_LINE1'],rows:[['SRC','Client Store','12 Main St']]};
 const root={querySelectorAll:()=>[source],evaluate(){throw Error('Should use the stable source table');}};
 assert.equal(A.extractFromDocument(root,'retailSync').source.slId,'SRC');
});
test('the positional XPath cannot turn the results table into a client source',()=>{
 const resultTable={closest:()=>({})};
 const root={querySelectorAll:()=>[],defaultView:{XPathResult:{FIRST_ORDERED_NODE_TYPE:1}},evaluate:()=>({singleNodeValue:resultTable})};
 assert.equal(A.extractFromDocument(root,'retailSync').error,'source-table-not-found');
});

test('the selected client row is used while candidates come only from the results table',()=>{
 const source={headers:['RS_ID','RS_STORE_NAME'],rows:[['OTHER','Another client'],['SRC','Selected client']],selectedIndexes:[1]};
 const results={headers:['RS_ID','RS_STORE_NAME'],rows:[['0067788','A candidate']]};
 const root={querySelectorAll:selector=>selector.includes('manual-match-search-table')?[results]:[source]};
 const found=A.extractFromDocument(root,'retailSync');
 assert.equal(found.source.slId,'SRC');assert.equal(found.sourceRowCount,2);
 assert.deepEqual(found.candidates.map(row=>row.slId),['0067788']);
});

test('multiple selected client rows stop extraction instead of choosing one',()=>{
 const source={headers:['RS_ID','RS_STORE_NAME'],rows:[['ONE','Client one'],['TWO','Client two']],selectedIndexes:[0,1]};
 assert.equal(A.extractFromDocument({querySelectorAll:()=>[source]},'retailSync').error,'multiple-highlighted-rows');
});
