const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const context={globalThis:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/bookmark-progress.js'),'utf8'),context);
const progress=context.globalThis.PickerBookmarkProgress.describeProgress;
test('robot progress names the active search, final TD review, completion and stopping',()=>{
 assert.match(progress({status:'waiting',activeQuery:{type:'address-city'},progress:2,total:5}),/Searching address.*2 of 5/);
 assert.equal(progress({status:'waiting',activeQuery:{type:'links'},tdIds:['1','2','3','4','5']}),'Reviewing links for the top 5 matches...');
 assert.equal(progress({status:'completed'}),'Finished');
 assert.equal(progress({status:'cancelled'}),'Stopped');
 assert.equal(progress({status:'incomplete'}),'Needs attention - open results');
});
