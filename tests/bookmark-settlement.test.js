const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(onClick=()=>{}){
 let live=true,observer;
 const table={textContent:'old result',querySelectorAll:()=>[],contains:node=>node===table,parentElement:{}};
 const dialog={textContent:'No results',querySelector:selector=>selector.includes('manual-match-search-table')?table:null};
 const signal={aborted:false,listeners:new Set(),addEventListener(_name,fn){this.listeners.add(fn);},removeEventListener(_name,fn){this.listeners.delete(fn);},abort(){this.aborted=true;[...this.listeners].forEach(fn=>fn());}};
 const context={globalThis:{},document:{evaluate:()=>({singleNodeValue:live?dialog:null})},XPathResult:{FIRST_ORDERED_NODE_TYPE:1},setTimeout,clearTimeout,setInterval,clearInterval,MutationObserver:class{constructor(fn){this.fn=fn;observer=this;}observe(){this.connected=true;}disconnect(){this.connected=false;}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vendor/manual-match-adapter.js'),'utf8'),context);
 const A=context.globalThis.PickerManualMatchAdapter;
 const search={disabled:false,click:()=>onClick({table,search,mutate(){observer.fn([{target:table}]);}})};
 return {A,dialog,search,signal,observer:()=>observer,close:()=>{live=false;}};
}

test('stale empty results do not count as a completed search without a new response',async()=>{
 const f=setup();const result=await f.A.submitAndWait(f.dialog,f.search,{stableMs:1,timeoutMs:35,signal:f.signal});
 assert.equal(result.status,'incomplete');assert.match(result.diagnostic,/did not stabilize/);assert.equal(f.observer().connected,false);assert.equal(f.signal.listeners.size,0);
});

test('synchronous search exceptions resolve locally and clean all watchers',async()=>{
 const f=setup(()=>{throw Error('Search button failed');});
 const result=await f.A.submitAndWait(f.dialog,f.search,{timeoutMs:10000,signal:f.signal});
 assert.equal(result.status,'incomplete');assert.match(result.diagnostic,/Search button failed/);assert.equal(f.observer().connected,false);assert.equal(f.signal.listeners.size,0);
});

test('an unchanged result can complete after observed response activity',async()=>{
 const f=setup(({mutate})=>{setTimeout(mutate,2);});
 const result=await f.A.submitAndWait(f.dialog,f.search,{stableMs:5,timeoutMs:500,signal:f.signal});
 assert.equal(result.status,'complete');assert.equal(f.observer().connected,false);assert.equal(f.signal.listeners.size,0);
});

test('Stop disconnects result observers and abort listeners immediately',async()=>{
 const f=setup();const pending=f.A.submitAndWait(f.dialog,f.search,{timeoutMs:10000,signal:f.signal});f.signal.abort();
 assert.equal((await pending).status,'incomplete');assert.equal(f.observer().connected,false);assert.equal(f.signal.listeners.size,0);
});

test('a source-check exception is a recoverable result rather than an uncaught timer error',async()=>{
 const f=setup();const result=await f.A.submitAndWait(f.dialog,f.search,{timeoutMs:10000,isCurrent(){throw Error('Source disappeared');}});
 assert.equal(result.status,'incomplete');assert.match(result.diagnostic,/Source disappeared/);assert.equal(f.observer().connected,false);
});
