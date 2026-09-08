// Offline contract checks: no installations, credentials, real histories or network.
import assert from 'node:assert/strict';
import {harnessCapabilities} from '../src/capabilities.js';
import {usageObservation} from '../src/observations.js';
import {mergeSnapshotEntries,outboxInternals} from '../src/server-outbox.js';
import {createClinePlugin} from '../integrations/cline/plugin.js';
const now=Date.now();
const report={method:'Synthetic contract fixtures; not installed-harness E2E',capabilities:harnessCapabilities};
const outbox=outboxInternals.emptyOutbox();
const plugin=createClinePlugin({now:()=>now,connectionImpl:async()=>({}),workerImpl:async()=>{},queueImpl:async(entries,options)=>{
  assert.equal(options.upload,false);mergeSnapshotEntries(outbox,entries);
}});
const context=(id,input,model)=>({assistantMessage:{role:'assistant',id,createdAt:now-60_000,metrics:{inputTokens:input,outputTokens:0},modelInfo:{id:model,provider:'fixture'}}});
await plugin.hooks.afterModel(context('a',100,'model-a'));
await plugin.hooks.afterModel(context('b',200,'model-b'));
await plugin.hooks.afterModel(context('a',100,'model-a'));
report.clineModelSwitch={expected:300,actual:Object.values(outbox.days).reduce((n,d)=>n+d.input_tokens,0),requests:Object.values(outbox.days).reduce((n,d)=>n+d.request_count,0)};
assert.equal(report.clineModelSwitch.actual,300);
assert.equal(report.clineModelSwitch.requests,2);
const imported=outboxInternals.emptyOutbox();
const observation=usageObservation({id:'import-1',timestamp:new Date(now-60_000).toISOString(),usage_semantics:'exclusive-delta',usage:{input_tokens:123}},{harness:'gemini-cli',now});
mergeSnapshotEntries(imported,[observation,observation]);
report.manualCloudImport={expected:123,actual:Object.values(imported.days)[0].input_tokens,replayAddsTokens:false};
assert.equal(report.manualCloudImport.actual,123);
console.log(JSON.stringify(report,null,2));
