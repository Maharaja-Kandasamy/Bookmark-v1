const test=require('node:test'),assert=require('node:assert/strict');
const {createRunController}=require('../vendor/run-controller');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));

test('Pause during an active search holds remaining queries and preserves paused state',async()=>{
 let release;const calls=[],states=[];
 const runner=createRunController({adapter:query=>{calls.push(query.id);return query.id==='one'?new Promise(resolve=>{release=resolve;}):Promise.resolve({status:'complete',rows:[]});},onState:state=>states.push(state),queryTimeoutMs:200,runTimeoutMs:1000,safetyDelayMs:0});
 const running=runner.start([{id:'one'},{id:'two'}]);await tick();
 runner.pause();release({status:'complete',rows:[]});await tick();
 assert.deepEqual(calls,['one']);assert.equal(states.at(-1).status,'paused');
 runner.resume();assert.equal((await running).status,'completed');assert.deepEqual(calls,['one','two']);
});

test('Pause on the last query prevents early completion and Stop unblocks the pause',async()=>{
 let release,finished=false;
 const runner=createRunController({adapter:()=>new Promise(resolve=>{release=resolve;}),queryTimeoutMs:200,runTimeoutMs:1000,safetyDelayMs:0});
 const running=runner.start([{id:'one'}]).then(result=>{finished=true;return result;});await tick();
 runner.pause();release({status:'complete',rows:[]});await tick();assert.equal(finished,false);
 runner.cancel();assert.equal((await running).status,'cancelled');
});

test('time spent paused does not exhaust the whole-run search budget',async()=>{
 let runner;const calls=[];
 runner=createRunController({adapter:async query=>{calls.push(query.id);if(query.id==='one')runner.pause();return {status:'complete',rows:[]};},queryTimeoutMs:200,runTimeoutMs:100,safetyDelayMs:0});
 const running=runner.start([{id:'one'},{id:'two'}]);
 await new Promise(resolve=>setTimeout(resolve,130));runner.resume();
 assert.equal((await running).status,'completed');assert.deepEqual(calls,['one','two']);
});


test('a rejected search becomes an incomplete observation and the next search still runs',async()=>{
 const runner=createRunController({adapter:async query=>{if(query.id==='bad')throw Error('Page changed');return {status:'complete',rows:[{slId:'1'}]};},safetyDelayMs:0});
 const result=await runner.start([{id:'bad'},{id:'good'}]);
 assert.equal(result.status,'incomplete');assert.equal(result.observations.length,2);assert.match(result.observations[0].diagnostic,/Page changed/);assert.equal(result.observations[1].status,'complete');
});

test('Stop returns promptly even when an adapter ignores its abort signal',async()=>{
 const runner=createRunController({adapter:()=>new Promise(()=>{}),queryTimeoutMs:10000,safetyDelayMs:0});
 const running=runner.start([{id:'slow'}]);await tick();const started=Date.now();runner.cancel();
 assert.equal((await running).status,'cancelled');assert.ok(Date.now()-started<200);
});

test('double-start returns a busy result instead of rejecting',async()=>{
 let release;const runner=createRunController({adapter:()=>new Promise(resolve=>{release=resolve;}),safetyDelayMs:0});
 const first=runner.start([{id:'one'}]);await tick();assert.equal((await runner.start([{id:'two'}])).status,'busy');release({status:'complete',rows:[]});await first;
});
