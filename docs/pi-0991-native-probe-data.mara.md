# Pi 0.99.1 offline probe artifacts

Verbatim final fixture sources and observations supporting [the probe report](pi-0991-native-probes.mara.md).
These are repository-only evidence, not a reusable runtime package or a regression suite for the unimplemented workflow extensions.
Each named text block is one file. Result timestamps, generated session IDs, loopback ports and absolute cache paths are observations, not portable expectations.

## harness.mjs

```text
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
export { assert };
export const root=dirname(fileURLToPath(import.meta.url));
const paths=JSON.parse(readFileSync(join(root,'imports.json'),'utf8'));
export const sdk=await import(paths.sdk);
export const ai=await import(paths.ai);
export const systemOne=await import(new URL('./api/typesafe-system-one.js',paths.ai));
export const {Type}=await import(paths.typebox);
export const records=[];
export const clone=x=>JSON.parse(JSON.stringify(x));
export const usage=(input=0)=>({input,output:0,cacheRead:0,cacheWrite:0,totalTokens:input,cost:{input:input/1000,output:0,cacheRead:0,cacheWrite:0,total:input/1000}});
export const result=(text,extra={})=>({content:[{type:'text',text}],details:undefined,...extra});
export const tool=(name,execute,extra={})=>({name,label:name,description:'Synthetic offline probe '+name,parameters:Type.Object({}),execute,...extra});
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function probe(name,fn){
  try {const data=await fn();records.push({name,status:'observed',data});console.log(JSON.stringify(records.at(-1)));}
  catch(error){records.push({name,status:'failed',error:String(error),stack:error.stack});console.error(JSON.stringify(records.at(-1)));process.exitCode=1;}
  writeFileSync(join(root,process.env.PROBE_OUTPUT??'results.json'),JSON.stringify(records,null,2)+'\n');
}
let sequence=0;
export async function setup({extension=()=>{},builtins=false,settings={},excludeTools=[],noTools,provider,sessionManager,sessionStartEvent,cwdOverride,bind=true,builtinStyle=false,noExtensions=false}={}){
 const cwd=cwdOverride??join(root,'workspace','case-'+(++sequence));mkdirSync(cwd,{recursive:true});
 const settingsManager=sdk.SettingsManager.inMemory({compaction:{enabled:false},retry:{enabled:false},...settings});
 const requests=[],queue=[],events=[],extensionEvents=[],errors=[];
 let piRef,ctxRef;
 const chat={id:'physical',name:'Synthetic physical',api:'probe-chat',input:['text'],reasoning:false,contextWindow:100000,maxTokens:2048,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
 const streamSimple=(model,context,options)=>{
  requests.push({model:clone(model),context:clone(context)});
  const s=new ai.AssistantMessageEventStream();
  queueMicrotask(async()=>{
   try {
    const instruction=queue.shift()??{content:[{type:'text',text:'synthetic done'}]};
    const message={role:'assistant',content:instruction.content,api:model.api,provider:model.provider,model:model.id,usage:usage(),stopReason:instruction.content.some(x=>x.type==='toolCall')?'toolUse':'stop',timestamp:Date.now()};
    s.push({type:'start',partial:{...message,content:[],stopReason:'pending'}});
    for(const [i,c] of message.content.entries()){
     if(c.type==='toolCall'){s.push({type:'toolcall_start',contentIndex:i,partial:message});s.push({type:'toolcall_end',contentIndex:i,toolCall:c,partial:message});}
     else{s.push({type:'text_start',contentIndex:i,partial:message});s.push({type:'text_delta',contentIndex:i,delta:c.text,partial:message});s.push({type:'text_end',contentIndex:i,content:c.text,partial:message});}
    }
    s.push({type:'done',reason:message.stopReason,message});s.end();
   }catch(e){s.end();throw e;}
  });return s;
 };
 const modelRuntime=await sdk.ModelRuntime.create({authPath:join(cwd,'auth.json'),modelsPath:null,modelsStorePath:join(cwd,'models-store.json'),refreshOnCreate:false,allowModelNetwork:false});
 modelRuntime.registerProvider('probe',{api:'probe-chat',baseUrl:'http://127.0.0.1:1/unused',apiKey:'synthetic-not-a-credential',models:[chat],streamSimple,...provider});
 const loader=new sdk.DefaultResourceLoader({cwd,agentDir:cwd,settingsManager,noExtensions,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,extensionFactories:[
  ...(builtins?(builtinStyle?[{name:'codemode',builtin:true,replaceable:true,factory:sdk.createCodemodeExtension({mode:'on'})},{name:'tool-search',builtin:true,replaceable:true,factory:sdk.createToolSearchExtension()}]:[sdk.createCodemodeExtension({mode:'on'}),sdk.createToolSearchExtension()]):[]),
  pi=>{
   piRef=pi;
   for(const type of ['session_start','session_shutdown','input','agent_start','agent_end','agent_before_settle','agent_settled','turn_start','turn_end','tool_call','tool_result','message_end','tool_execution_start','tool_execution_end']){
    pi.on(type,(event,ctx)=>{ctxRef=ctx;extensionEvents.push({event:clone(event),sessionId:ctx.sessionManager.getSessionId(),idle:ctx.isIdle(),signal:!!ctx.signal});});
   }
   extension(pi);
  }
 ]});
 await loader.reload();
 const loaded=await sdk.createAgentSession({cwd,agentDir:cwd,settingsManager,resourceLoader:loader,modelRuntime,model:modelRuntime.getModel('probe','physical'),sessionManager:sessionManager??sdk.SessionManager.inMemory(cwd),sessionStartEvent,excludeTools,noTools});
 const {session}=loaded;
 session.subscribe(e=>events.push(clone(e)));
 if(bind)await session.bindExtensions({onError:e=>errors.push(clone(e))});
 return {...loaded,services:{cwd,agentDir:cwd,modelRuntime,settingsManager,resourceLoader:loader,diagnostics:[]},session,modelRuntime,loader,settingsManager,requests,queue,events,extensionEvents,errors,get pi(){return piRef},get ctx(){return ctxRef},
  async call(name,args={}){
    const id='probe-call-'+(requests.length+1);
    queue.push({content:[{type:'toolCall',id,name,arguments:args}]});
    await session.prompt('Synthetic fixture, not a real model request.');
    const msg=session.messages.findLast(m=>m.role==='toolResult'&&m.toolCallId===id);
    assert.ok(msg,'missing synthetic tool result');
    return msg;
  },close(){session.dispose();}
 };
}
```

## tools.mjs

```text
import {sdk,ai,Type,assert,probe,setup,tool,result,clone} from './harness.mjs';
await probe('namespace replacement and explicit exclusion',async()=>{
 const register=pi=>{
  pi.registerTool(tool('bash',async()=>result('managed marker'),{namespace:{name:'jobs',description:'Managed execution'}}));
  pi.registerTool(tool('inspect',async()=>result('inspect marker'),{namespace:{name:'jobs',description:'Managed execution'}}));
 };
 const h=await setup({extension:register});
 try {
  const tools=h.pi.getAllTools().filter(t=>['bash','inspect'].includes(t.name));
  const response=await h.call('bash');
  assert.equal(response.content[0].text,'managed marker');
  const declared=ai.getCurrentTools(h.requests[0].context.messages).filter(t=>['bash','inspect'].includes(t.name));
  return {tools,declared,response,active:h.session.getActiveToolNames()};
 }finally{h.close()}
});
await probe('excluded bash and deferred tools remain excluded through nested API',async()=>{
 const h=await setup({excludeTools:['bash','probe_result'],extension:pi=>{
  pi.registerTool(tool('bash',async()=>result('MUST NOT RUN'),{namespace:{name:'jobs'}}));
  pi.registerTool(tool('probe_result',async()=>result('MUST NOT RUN'),{exposure:'deferred',namespace:{name:'probe'}}));
  pi.registerTool(tool('probe_caller',async(_id,_args,_sig,_update,ctx)=>result(JSON.stringify({tools:ctx.tools.map(t=>t.name),bash:await ctx.executeTool('bash',{command:'no'}),deferred:await ctx.executeTool('probe_result',{})}))));
 }});
 try{return {active:h.session.getActiveToolNames(),all:h.pi.getAllTools().map(t=>({name:t.name,exposure:t.exposure})),response:await h.call('probe_caller')}}finally{h.close()}
});
await probe('inactive deferred vs hidden and native discovery',async()=>{
 const h=await setup({builtins:true,settings:{defaultTools:['+codemode','+tool_search']},extension:pi=>{
  pi.registerTool(tool('probe_deferred',async()=>result('deferred value',{structuredContent:{value:42}}),{exposure:'deferred',namespace:{name:'probe'},outputSchema:Type.Object({value:Type.Number()})}));
  pi.registerTool(tool('probe_hidden',async()=>result('MUST NOT RUN'),{exposure:'hidden',namespace:{name:'probe'}}));
 }});
 try {
  const before=h.session.getActiveToolNames();
  const search=await h.call('tool_search',{query:'probe_deferred'});
  const after=h.session.getActiveToolNames();
  const composition=await h.call('codemode',{code:'const t=ALL_TOOLS.filter(t=>t.name.includes("probe")); return {tools:t,value:await tools.probe_deferred()};'});
  return {before,after,search,composition,errors:h.errors};
 }finally{h.close()}
});
await probe('direct and nested final-result visibility with native codemode',async()=>{
 const h=await setup({builtins:true,settings:{defaultTools:['+codemode']},extension:pi=>{
  pi.registerTool(tool('probe_result',async()=>result('final JOB_A RESULT_A',{structuredContent:{job:'JOB_A',outcome:'RESULT_A'}}),{exposure:'codemode',namespace:{name:'probe'},outputSchema:Type.Object({job:Type.String(),outcome:Type.String()})}));
 }});
 try {
  const out=[];
  for(const code of ['await tools.probe_result(); return "discarded";','const r=await tools.probe_result(); return {job:r.job};','return await tools.probe_result();']){
   const eventsAt=h.extensionEvents.length;
   const response=await h.call('codemode',{code});
   const request=h.requests.at(-1);
   out.push({code,response,providerResults:request.context.messages.filter(m=>m.role==='toolResult'),events:h.extensionEvents.slice(eventsAt).filter(e=>e.event.type==='tool_result')});
  }
  h.session.setActiveToolsByName([...h.session.getActiveToolNames(),'probe_result']);
  const direct=await h.call('probe_result');
  return {out,direct,errors:h.errors};
 }finally{h.close()}
});
```

## classifiers.mjs

```text
import {sdk,Type,assert,probe,setup,tool,result,clone,usage,sleep} from './harness.mjs';
const modelDef={type:'classifier',id:'classifier',name:'Synthetic classifier',api:'probe-classifier',input:['text'],contextWindow:32000,cost:{input:1,output:0,cacheRead:0,cacheWrite:0}};
const context={state:{},questions:{assessment:{type:'choice',instructions:'Synthetic only',criteria:{yes:'Yes',no:'No'}}}};
const output=model=>({api:model.api,provider:model.provider,model:model.id,answers:{assessment:{type:'choice',choice:'yes',probabilities:{yes:1,no:0},confidence:1}},usage:{input:10,output:0,totalTokens:10,cost:{total:.01}},stopReason:'stop',timestamp:Date.now()});
function classifier(pi,implementation){
 pi.registerProvider('probe-classifier',{baseUrl:'http://127.0.0.1:1/unused',apiKey:'synthetic-not-a-credential',models:[modelDef],classifiers:{'probe-classifier':{classify:implementation??(async model=>output(model))}}});
}
function classify(ctx,options){return ctx.modelRegistry.classify(ctx.modelRegistry.findOfType('classifier','probe-classifier','classifier'),context,options)}
await probe('extension classifier accounting inside tools and idle commands',async()=>{
 let commandResult,seenIdle;
 const h=await setup({builtins:true,settings:{defaultTools:['+codemode']},extension:pi=>{
  classifier(pi);
  pi.registerTool(tool('probe_classify',async(_i,_a,_s,_u,ctx)=>result(JSON.stringify(await classify(ctx)))));
  pi.registerTool(tool('probe_accounted',async(_i,_a,_s,_u,ctx)=>{await classify(ctx);return result('manually attributed',{usage:usage(10)})}));
  pi.registerCommand('probe-review',{description:'Synthetic review',handler:async(_args,ctx)=>{seenIdle={idle:ctx.isIdle(),signal:!!ctx.signal};commandResult=await classify(ctx)}});
 }});
 try {
  const unreported=await h.call('probe_classify');
  const manual=await h.call('probe_accounted');
  const nested=await h.call('codemode',{code:'return await tools.probe_accounted();'});
  const native=await h.call('codemode',{code:'const m=await models.getModelOfType("classifier","probe-classifier","classifier"); return await models.classify(m,{state:{},questions:{assessment:{type:"choice",instructions:"Synthetic only",criteria:{yes:"Yes",no:"No"}}}});'});
  const before=h.session.sessionManager.getEntries().length;
  const eventsAt=h.extensionEvents.length;
  await h.session.prompt('/probe-review');
  const added=h.session.sessionManager.getEntries().slice(before);
  assert.equal(unreported.usage,undefined);
  assert.equal(manual.usage.totalTokens,10);
  assert.equal(nested.usage.totalTokens,10);
  assert.equal(native.usage.totalTokens,10);
  return {unreported,manual,nested,native,commandResult,seenIdle,added,commandEvents:h.extensionEvents.slice(eventsAt),stats:h.session.getSessionStats()};
 }finally{h.close()}
});
await probe('classifier abort is forwarded; ignored signals do not impose a deadline',async()=>{
 const calls=[];
 const h=await setup({extension:pi=>classifier(pi,async(model,ctx,options)=>{
  calls.push({state:ctx.state,hasSignal:!!options.signal});
  if(ctx.state.ignore){await sleep(60);return output(model)}
  if(ctx.state.fail)throw Error('synthetic classifier failure');
  await new Promise((resolve,reject)=>{
   if(options.signal?.aborted)reject(options.signal.reason);
   else options.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
  });return output(model);
 })});
 const keepAlive=setInterval(()=>{},1000);
 try{
  const ctx=h.ctx,m=ctx.modelRegistry.findOfType('classifier','probe-classifier','classifier');
  const failure=await ctx.modelRegistry.classify(m,{...context,state:{fail:true}});
  const t=Date.now();
  const aborted=await ctx.modelRegistry.classify(m,context,{signal:AbortSignal.timeout(25)});
  const abortElapsed=Date.now()-t;
  const t2=Date.now();
  const ignored=await ctx.modelRegistry.classify(m,{...context,state:{ignore:true}},{signal:AbortSignal.timeout(25)});
  assert.equal(failure.stopReason,'error');assert.equal(aborted.stopReason,'aborted');assert.equal(ignored.stopReason,'stop');
  return {failure,aborted,abortElapsed,ignored,ignoreElapsed:Date.now()-t2,calls,events:h.extensionEvents.map(e=>e.event.type)};
 }finally{clearInterval(keepAlive);h.close()}
});
```

## wire.mjs

```text
import http from 'node:http';
import {assert,probe,setup,clone,systemOne} from './harness.mjs';
const received=[];
let classifierMode='ok';
const server=http.createServer(async(req,res)=>{
 let raw='';for await(const data of req)raw+=data;
 const body=JSON.parse(raw);
 received.push({url:req.url,body,headerNames:Object.keys(req.headers),marker:req.headers['x-probe-marker']});
 if(req.url.endsWith('/systemone')){
  if(classifierMode==='stall')return;
  if(classifierMode==='ok'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({answers:{ok:{type:'choice',choice:'yes',probabilities:{yes:1,no:0},confidence:1}},usage:{input_tokens:10,output_tokens:1}}));return;}
  res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'synthetic unavailable'}}));return;
 }
 res.writeHead(200,{'content-type':'text/event-stream'});
 const item={type:'message',id:'msg_1',role:'assistant',status:'completed',content:[{type:'output_text',text:'synthetic loopback reply',annotations:[]}]};
 const response={id:'resp_1',object:'response',created_at:1,status:'completed',model:'physical',output:[item],usage:{input_tokens:10,output_tokens:4,total_tokens:14,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}};
 for(const event of [
  {type:'response.created',response:{...response,status:'in_progress',output:[]}},
  {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
  {type:'response.content_part.added',output_index:0,content_index:0,item_id:item.id,part:{type:'output_text',text:'',annotations:[]}},
  {type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:'synthetic loopback reply'},
  {type:'response.output_text.done',output_index:0,content_index:0,item_id:item.id,text:'synthetic loopback reply'},
  {type:'response.output_item.done',output_index:0,item},
  {type:'response.completed',response}
 ])res.write('data: '+JSON.stringify(event)+'\n\n');
 res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const baseUrl='http://127.0.0.1:'+server.address().port+'/v1';
try{
await probe('actual request identity at public hooks under physical and virtual selections',async()=>{
 const observed=[];
 const h=await setup({extension:pi=>{
  pi.registerProvider('loopback',{baseUrl,api:'openai-responses',apiKey:'synthetic-key',models:[{id:'physical',name:'Loopback fixture',reasoning:false,input:['text'],contextWindow:100000,maxTokens:1024,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]});
  pi.registerVirtualModel({provider:'probe-router',id:'virtual',name:'Synthetic router',route(_request,ctx){return {model:ctx.modelRegistry.find('loopback','physical'),thinkingLevel:'off'}}});
  for(const type of ['before_provider_request','before_provider_headers','provider_stream_event','message_end']){
   pi.on(type,(e,ctx)=>{
    if(type==='message_end'&&e.message.role!=='assistant')return;
    observed.push({type,eventKeys:Object.keys(e),selected:{provider:ctx.model?.provider,id:ctx.model?.id,api:ctx.model?.api},payloadModel:e.payload?.model,streamModel:e.model,streamProvider:e.provider,streamApi:e.api,messageModel:e.message?.model});
    if(type==='before_provider_headers')e.headers['x-probe-marker']='synthetic';
   });
  }
 }});
 try{
  const phases=[];
  for(const [provider,id] of [['loopback','physical'],['probe-router','virtual']]){
   const i=observed.length;
   await h.session.setModel(h.modelRuntime.getModel(provider,id));
   await h.session.prompt('synthetic input');
   const assistant=h.session.messages.findLast(m=>m.role==='assistant');
   assert.equal(assistant.stopReason,'stop',assistant.errorMessage);
   assert.equal(assistant.model,'physical');
   phases.push({selection:h.session.model,hooks:observed.slice(i),assistant});
  }
  return {phases,requests:received.filter(r=>r.url.endsWith('/responses')).map(r=>({url:r.url,model:r.body.model,marker:r.marker})),errors:h.errors};
 }finally{h.close()}
});
await probe('native System One transport retries and cancellation',async()=>{
 const h=await setup({extension:pi=>pi.registerProvider('loopback-classifier',{baseUrl,classifiers:{'typesafe-system-one':systemOne},apiKey:'synthetic-key',models:[{type:'classifier',id:'fixture',name:'Synthetic classifier',api:'typesafe-system-one',input:['text'],contextWindow:32000,cost:{input:1,output:0,cacheRead:0,cacheWrite:0}}]})});
 try{
  const ctx=h.ctx,model=ctx.modelRegistry.findOfType('classifier','loopback-classifier','fixture'),input={state:{synthetic:true},questions:{ok:{type:'choice',instructions:'Fixture',criteria:{yes:'Yes',no:'No'}}}};
  classifierMode='ok';
  const success=await ctx.modelRegistry.classify(model,input);
  assert.equal(success.stopReason,'stop');assert.equal(success.usage.totalTokens,11);
  classifierMode='error';
  const first=await ctx.modelRegistry.classify(model,input);
  const defaultAttempts=received.filter(r=>r.url.endsWith('/systemone')).length-1;
  const noRetry=await ctx.modelRegistry.classify(model,input,{maxRetries:0});
  const noRetryAttempts=received.filter(r=>r.url.endsWith('/systemone')).length-defaultAttempts-1;
  classifierMode='stall';
  const started=Date.now();
  const aborted=await ctx.modelRegistry.classify(model,input,{signal:AbortSignal.timeout(5000)});
  const elapsed=Date.now()-started;
  assert.equal(first.stopReason,'error');assert.equal(noRetry.stopReason,'error');assert.equal(aborted.stopReason,'aborted');
  assert.equal(defaultAttempts,3);assert.equal(noRetryAttempts,1);
  const total=received.filter(r=>r.url.endsWith('/systemone')).length;
  assert.equal(total,6);
  return {success,first,noRetry,aborted,elapsed,defaultAttempts,noRetryAttempts,total,events:h.extensionEvents.map(e=>e.event.type)};
 }finally{h.close()}
});
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
```

## lifecycle.mjs

```text
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {sdk,assert,probe,setup,tool,result,clone,root,sleep} from './harness.mjs';
const staleAttempt=fn=>{try{return {value:fn()}}catch(e){return {error:String(e)}}};
await probe('reload invalidates captured APIs without changing session identity',async()=>{
 const h=await setup();
 try{
  const oldPi=h.pi,oldCtx=h.ctx,id=oldCtx.sessionManager.getSessionId();
  await h.session.reload();
  const check=staleAttempt(()=>oldPi.appendEntry('probe-stale',{ignored:true}));
  assert.ok(check.error?.includes('stale'));
  assert.equal(h.ctx.sessionManager.getSessionId(),id);
  return {id,events:h.extensionEvents.filter(e=>e.event.type.startsWith('session_')),append:check,oldIdle:staleAttempt(()=>oldCtx.isIdle())};
 }finally{h.close()}
});
await probe('new resume fork and quit distinguish lifecycle reasons and fresh callbacks',async()=>{
 const cwd=join(root,'workspace','runtime');mkdirSync(cwd,{recursive:true});
 const instances=[];
 const factory=async({cwd,sessionManager,sessionStartEvent})=>{
  const h=await setup({cwdOverride:cwd,sessionManager,sessionStartEvent,bind:false});
  instances.push(h);return {...h,diagnostics:[]};
 };
 const runtime=await sdk.createAgentSessionRuntime(factory,{cwd,agentDir:cwd,sessionManager:sdk.SessionManager.create(cwd,join(cwd,'sessions'))});
 try{
  runtime.setRebindSession(session=>session.bindExtensions({}));
  await runtime.session.bindExtensions({});
  const initial=instances[0];
  await runtime.session.prompt('Synthetic first user for persistence');
  const initialFile=runtime.session.sessionFile,id=runtime.session.sessionManager.getSessionId();
  const callbacks=[];
  await runtime.newSession({withSession:async ctx=>{callbacks.push(ctx.sessionManager.getSessionId());await ctx.sendMessage({customType:'probe-fresh',content:'fresh synthetic',display:false},{deliverAs:'nextTurn'})}});
  const afterNew={id:runtime.session.sessionManager.getSessionId(),oldWrite:staleAttempt(()=>initial.pi.appendEntry('probe-stale',{}))};
  await runtime.switchSession(initialFile,{withSession:async ctx=>{callbacks.push(ctx.sessionManager.getSessionId())}});
  assert.equal(runtime.session.sessionManager.getSessionId(),id);
  const user=runtime.session.sessionManager.getBranch().find(e=>e.type==='message'&&e.message.role==='user');
  await runtime.fork(user.id,{position:'at',withSession:async ctx=>{callbacks.push(ctx.sessionManager.getSessionId())}});
  const forkId=runtime.session.sessionManager.getSessionId();
  assert.notEqual(forkId,id);
  await runtime.dispose();
  return {id,afterNew,forkId,callbacks,events:instances.flatMap(h=>h.extensionEvents.filter(e=>e.event.type.startsWith('session_')))};
 }finally{await runtime.dispose()}
});
await probe('nested foreground cancellation and completed inner tool signal lifetime',async()=>{
 let started,signalRef,aborted=false;
 const ready=new Promise(r=>started=r);
 const h=await setup({builtins:true,settings:{defaultTools:['+codemode']},extension:pi=>{
  pi.registerTool(tool('probe_block',async(_i,_a,signal)=>{signalRef=signal;started();await new Promise(r=>signal.addEventListener('abort',()=>{aborted=true;r()},{once:true}));return result('aborted')},{exposure:'codemode'}));
 }});
 try{
  const call=h.call('codemode',{code:'return await tools.probe_block();'});
  await ready;await h.session.abort();await call;
  assert.equal(aborted,true);
  return {aborted,signalAborted:signalRef.aborted,events:h.extensionEvents.filter(e=>['tool_result','tool_execution_end','agent_before_settle','agent_settled'].includes(e.event.type))};
 }finally{h.close()}
});
await probe('inner tool completion is not automatic background ownership',async()=>{
 let savedSignal,gotAbort=false,started,hold;
 const ready=new Promise(r=>started=r);
 const holdReady=new Promise(r=>hold=r);
 const h=await setup({builtins:true,settings:{defaultTools:['+codemode']},extension:pi=>{
  pi.registerTool(tool('probe_handoff',async(_i,_a,signal)=>{savedSignal=signal;signal.addEventListener('abort',()=>{gotAbort=true},{once:true});started();return result('synthetic handed-off marker')},{exposure:'codemode'}));
  pi.registerTool(tool('probe_hold',async(_i,_a,signal)=>{hold();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return result('cancelled wait')},{exposure:'codemode'}));
 }});
 try{
  const call=h.call('codemode',{code:'await tools.probe_handoff(); return await tools.probe_hold();'});
  await ready;await holdReady;await h.session.abort();await call;
  return {completedInnerSignalAborted:savedSignal.aborted,completedInnerGotAbort:gotAbort,events:h.extensionEvents.filter(e=>e.event.type==='tool_result')};
 }finally{h.close()}
});
await probe('turn events distinguish input source but do not label goal ownership',async()=>{
 const h=await setup();
 try{
  await h.session.prompt('Synthetic user run');
  const settledAfter=async action=>{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('settlement timeout'))},2000);const off=h.session.subscribe(e=>{if(e.type==='agent_settled'){clearTimeout(timer);off();resolve()}});action()})};
  await settledAfter(()=>h.pi.sendUserMessage('Synthetic extension run'));
  await settledAfter(()=>h.pi.sendMessage({customType:'probe-continuation',content:'Synthetic custom run',display:false},{triggerTurn:true}));
  return {events:h.extensionEvents.filter(e=>['input','agent_start','turn_start','turn_end','agent_before_settle','agent_settled'].includes(e.event.type)).map(e=>({type:e.event.type,keys:Object.keys(e.event),source:e.event.source,text:e.event.text,turnIndex:e.event.turnIndex,customTypes:e.event.context?.contextMessages?.filter(m=>m.role==='custom').map(m=>m.customType)}))};
 }finally{h.close()}
});
```

## additional.mjs

```text
import {sdk,Type,assert,probe,setup,tool,result,clone,sleep} from './harness.mjs';
await probe('namespaces do not qualify registration keys',async()=>{
 const h=await setup({extension:pi=>{
  pi.registerTool(tool('inspect',async()=>result('alpha'),{namespace:{name:'alpha'}}));
  pi.registerTool(tool('inspect',async()=>result('beta'),{namespace:{name:'beta'}}));
 }});
 try{
  const matches=h.pi.getAllTools().filter(t=>t.name==='inspect');
  const response=await h.call('inspect');
  assert.equal(matches.length,1);assert.equal(response.content[0].text,'beta');
  return {matches,response,errors:h.errors};
 }finally{h.close()}
});
await probe('negative defaultTools and active-set removal do not exclude deferred calls',async()=>{
 const rows=[];
 for(const settings of [{},{defaultTools:['-probe_deferred']}]){
  const h=await setup({settings,extension:pi=>{
   pi.registerTool(tool('probe_deferred',async()=>result('reachable'),{exposure:'deferred'}));
   pi.registerTool(tool('probe_caller',async(_i,_a,_s,_u,ctx)=>result(JSON.stringify(await ctx.executeTool('probe_deferred',{})))));
  }});
  try{
   const before=await h.call('probe_caller');
   h.pi.setActiveTools(h.pi.getActiveTools().filter(n=>n!=='probe_deferred'));
   const after=await h.call('probe_caller');
   rows.push({settings,before,after});
  }finally{h.close()}
 }
 return rows;
});
await probe('nested schema errors blocking and result redaction use native hooks',async()=>{
 let count=0;
 const h=await setup({builtins:true,settings:{defaultTools:['+codemode']},extension:pi=>{
  pi.registerTool(tool('probe_guarded',async()=>{count++;return result('secret',{structuredContent:{secret:42}})},{parameters:Type.Object({allow:Type.Boolean()}),outputSchema:Type.Object({secret:Type.Number()}),exposure:'codemode'}));
  pi.on('tool_call',e=>{if(e.toolName==='probe_guarded'&&!e.input.allow)return {block:true,reason:'synthetic blocker'}});
  pi.on('tool_result',e=>{if(e.toolName==='probe_guarded'&&!e.isError)return {content:[{type:'text',text:'redacted'}]}});
 }});
 try{
  const schema=await h.call('codemode',{code:'return await tools.probe_guarded({});'});
  const blocked=await h.call('codemode',{code:'return await tools.probe_guarded({allow:false});'});
  const redacted=await h.call('codemode',{code:'return await tools.probe_guarded({allow:true});'});
  assert.equal(count,1);
  const text=JSON.stringify(redacted.content);
  assert.ok(text.includes('redacted'));assert.ok(!text.includes('secret'));
  return {schema,blocked,redacted,count};
 }finally{h.close()}
});
await probe('direct tool signals can remain tied to the run after the tool returns',async()=>{
 let saved,gotAbort=false,hold;
 const ready=new Promise(r=>hold=r);
 const h=await setup({extension:pi=>{
  pi.registerTool(tool('probe_handoff',async(_i,_a,signal)=>{saved=signal;signal.addEventListener('abort',()=>{gotAbort=true},{once:true});return result('synthetic running')},{executionMode:'sequential'}));
  pi.registerTool(tool('probe_hold',async(_i,_a,signal)=>{hold();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return result('wait cancelled')},{executionMode:'sequential'}));
 }});
 try{
  h.queue.push({content:[{type:'toolCall',id:'first',name:'probe_handoff',arguments:{}},{type:'toolCall',id:'second',name:'probe_hold',arguments:{}}]});
  const p=h.session.prompt('synthetic direct cancellation');
  await ready;await h.session.abort();await p;
  return {completedDirectSignalAborted:saved.aborted,completedDirectGotAbort:gotAbort};
 }finally{h.close()}
});
await probe('classifier response survives reload but stale API refuses application',async()=>{
 let finish,start,applied,callSignal;
 const started=new Promise(r=>start=r);
 const h=await setup({extension:pi=>{
  pi.registerProvider('late',{baseUrl:'http://127.0.0.1:1/unused',apiKey:'synthetic',models:[{type:'classifier',id:'late',name:'Late fixture',api:'late',input:['text'],contextWindow:100,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}],classifiers:{late:{classify:async(model,_context,options)=>{
   callSignal=options.signal;start();await new Promise(r=>finish=r);
   return {api:model.api,provider:model.provider,model:model.id,answers:{},stopReason:'stop',timestamp:Date.now()};
  }}}});
  pi.registerCommand('late-review',{description:'Synthetic late result',handler:async(_args,ctx)=>{
   const value=await ctx.modelRegistry.classify(ctx.modelRegistry.findOfType('classifier','late','late'),{state:{},questions:{}},{signal:ctx.signal});
   try{pi.appendEntry('late-value',value);applied='WRITTEN'}catch(e){applied=String(e)}
  }});
 }});
 try{
  const command=h.session.prompt('/late-review');
  await started;
  const idleDuring=h.ctx.isIdle();
  const eventsDuring=h.extensionEvents.map(e=>e.event.type);
  await h.session.reload();
  finish();await command;
  assert.ok(applied.includes('stale'));
  assert.ok(!h.session.sessionManager.getEntries().some(e=>e.type==='custom'&&e.customType==='late-value'));
  return {callHadSignal:!!callSignal,idleDuring,eventsDuring,applied};
 }finally{h.close()}
});
```

## exposure.mjs

```text
import {sdk,ai,Type,assert,probe,setup,tool,result} from './harness.mjs';
await probe('SDK native builtins enabled absent and explicitly disabled',async()=>{
 const rows=[];
 for(const config of [
  {builtins:false},
  {builtins:true,builtinStyle:true,settings:{defaultTools:['+codemode','+tool_search']}},
  {builtins:true,builtinStyle:true,noExtensions:true,settings:{defaultTools:['+codemode','+tool_search']}},
  {builtins:true,builtinStyle:true,settings:{extensions:['-builtin:codemode','-builtin:tool-search'],defaultTools:['+codemode','+tool_search']}}
 ]){
  const h=await setup({...config,extension:pi=>pi.registerTool(tool('probe_direct',async()=>result('direct works'),{namespace:{name:'probe'}}))});
  try{
   const native=h.pi.getAllTools().filter(t=>['codemode','tool_search'].includes(t.name)).map(t=>t.name);
   const direct=await h.call('probe_direct');assert.equal(direct.isError,false);
   rows.push({config,native,active:h.session.getActiveToolNames(),direct});
  }finally{h.close()}
 }
 assert.equal(rows[0].native.length,0);assert.equal(rows[1].native.length,2);assert.equal(rows[2].native.length,0);assert.equal(rows[3].native.length,0);
 return rows;
});
await probe('explicit exclusion survives dynamic re-registration and activation',async()=>{
 let count=0;
 const h=await setup({excludeTools:['probe_excluded'],extension:pi=>{
  pi.registerTool(tool('probe_excluded',async()=>{count++;return result('NOT EXPECTED')},{exposure:'deferred'}));
  pi.registerTool(tool('probe_caller',async(_i,_a,_s,_u,ctx)=>result(JSON.stringify(await ctx.executeTool('probe_excluded',{})))));
 }});
 try{
  h.pi.registerTool(tool('probe_excluded',async()=>{count++;return result('NOT EXPECTED')},{exposure:'direct'}));
  h.pi.setActiveTools([...h.pi.getActiveTools(),'probe_excluded']);
  const response=await h.call('probe_caller');
  assert.equal(count,0);assert.ok(JSON.parse(response.content[0].text).isError);
  return {count,response,active:h.pi.getActiveTools(),all:h.pi.getAllTools().map(t=>t.name)};
 }finally{h.close()}
});
await probe('structured error is visible directly but remains data to codemode',async()=>{
 const h=await setup({builtins:true,settings:{defaultTools:['+codemode']},extension:pi=>pi.registerTool(tool('probe_error',async()=>result('synthetic refusal',{isError:true,structuredContent:{status:'error',reason:'synthetic refusal'}}),{outputSchema:Type.Object({status:Type.String(),reason:Type.String()})}))});
 try{
  const direct=await h.call('probe_error');
  const nested=await h.call('codemode',{code:'return await tools.probe_error();'});
  assert.equal(direct.isError,true);
  return {direct,nested};
 }finally{h.close()}
});
```

## tools-results.json

````text
[
  {
    "name": "namespace replacement and explicit exclusion",
    "status": "observed",
    "data": {
      "tools": [
        {
          "name": "bash",
          "description": "Synthetic offline probe bash",
          "parameters": {
            "type": "object",
            "properties": {}
          },
          "exposure": "direct",
          "namespace": {
            "name": "jobs",
            "description": "Managed execution"
          },
          "sourceInfo": {
            "path": "<inline:1>",
            "source": "inline",
            "scope": "temporary",
            "origin": "top-level"
          }
        },
        {
          "name": "inspect",
          "description": "Synthetic offline probe inspect",
          "parameters": {
            "type": "object",
            "properties": {}
          },
          "exposure": "direct",
          "namespace": {
            "name": "jobs",
            "description": "Managed execution"
          },
          "sourceInfo": {
            "path": "<inline:1>",
            "source": "inline",
            "scope": "temporary",
            "origin": "top-level"
          }
        }
      ],
      "declared": [
        {
          "name": "bash",
          "description": "Synthetic offline probe bash",
          "parameters": {
            "type": "object",
            "properties": {}
          }
        },
        {
          "name": "inspect",
          "description": "Synthetic offline probe inspect",
          "parameters": {
            "type": "object",
            "properties": {}
          }
        }
      ],
      "response": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "bash",
        "content": [
          {
            "type": "text",
            "text": "managed marker"
          }
        ],
        "isError": false,
        "timestamp": 1790765683601
      },
      "active": [
        "read",
        "bash",
        "edit",
        "write",
        "inspect"
      ]
    }
  },
  {
    "name": "excluded bash and deferred tools remain excluded through nested API",
    "status": "observed",
    "data": {
      "active": [
        "read",
        "edit",
        "write",
        "probe_caller"
      ],
      "all": [
        {
          "name": "read",
          "exposure": "direct"
        },
        {
          "name": "powershell",
          "exposure": "direct"
        },
        {
          "name": "edit",
          "exposure": "direct"
        },
        {
          "name": "write",
          "exposure": "direct"
        },
        {
          "name": "grep",
          "exposure": "direct"
        },
        {
          "name": "find",
          "exposure": "direct"
        },
        {
          "name": "ls",
          "exposure": "direct"
        },
        {
          "name": "probe_caller",
          "exposure": "direct"
        }
      ],
      "response": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "probe_caller",
        "content": [
          {
            "type": "text",
            "text": "{\"tools\":[\"read\",\"edit\",\"write\",\"probe_caller\"],\"bash\":{\"toolCall\":{\"type\":\"toolCall\",\"id\":\"probe-call-1/1\",\"name\":\"bash\",\"arguments\":{\"command\":\"no\"}},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"Tool bash not found\"}],\"details\":{}},\"isError\":true},\"deferred\":{\"toolCall\":{\"type\":\"toolCall\",\"id\":\"probe-call-1/2\",\"name\":\"probe_result\",\"arguments\":{}},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"Tool probe_result not found\"}],\"details\":{}},\"isError\":true}}"
          }
        ],
        "isError": false,
        "timestamp": 1790765683607,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-1/1",
              "name": "bash",
              "status": "error",
              "arguments": {
                "command": "no"
              },
              "durationMs": 0,
              "error": "Tool bash not found"
            },
            {
              "id": "probe-call-1/2",
              "name": "probe_result",
              "status": "error",
              "arguments": {},
              "durationMs": 0,
              "error": "Tool probe_result not found"
            }
          ],
          "complete": true
        }
      }
    }
  },
  {
    "name": "inactive deferred vs hidden and native discovery",
    "status": "observed",
    "data": {
      "before": [
        "read",
        "bash",
        "edit",
        "write",
        "codemode",
        "tool_search"
      ],
      "after": [
        "read",
        "bash",
        "edit",
        "write",
        "codemode",
        "tool_search",
        "probe_deferred"
      ],
      "search": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "tool_search",
        "content": [
          {
            "type": "text",
            "text": "Loaded 1 tool. They are available from your next call:\n- probe_deferred: Synthetic offline probe probe_deferred"
          }
        ],
        "details": {
          "loaded": [
            "probe_deferred"
          ]
        },
        "isError": false,
        "timestamp": 1790765683614
      },
      "composition": {
        "role": "toolResult",
        "toolCallId": "probe-call-3",
        "toolName": "codemode",
        "content": [
          {
            "type": "text",
            "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
          },
          {
            "type": "text",
            "text": "{\"tools\":[{\"name\":\"probe_deferred\",\"description\":\"Synthetic offline probe probe_deferred\\n\\ncodemode tool declaration:\\n```ts\\ndeclare const tools: { probe_deferred(args: { [key: string]: unknown; }): Promise<{ value: number; }>; };\\n```\"}],\"value\":{\"value\":42}}"
          }
        ],
        "details": {
          "calls": [
            {
              "id": "probe-call-3/1",
              "name": "probe_deferred",
              "args": "",
              "status": "ok",
              "durationMs": 0.2396580000000199
            }
          ]
        },
        "isError": false,
        "timestamp": 1790765683652,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-3/1",
              "name": "probe_deferred",
              "status": "ok",
              "arguments": {},
              "durationMs": 0
            }
          ],
          "complete": true
        }
      },
      "errors": []
    }
  },
  {
    "name": "direct and nested final-result visibility with native codemode",
    "status": "observed",
    "data": {
      "out": [
        {
          "code": "await tools.probe_result(); return \"discarded\";",
          "response": {
            "role": "toolResult",
            "toolCallId": "probe-call-1",
            "toolName": "codemode",
            "content": [
              {
                "type": "text",
                "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
              },
              {
                "type": "text",
                "text": "discarded"
              }
            ],
            "details": {
              "calls": [
                {
                  "id": "probe-call-1/1",
                  "name": "probe_result",
                  "args": "",
                  "status": "ok",
                  "durationMs": 0.17630900000000338
                }
              ]
            },
            "isError": false,
            "timestamp": 1790765683678,
            "nestedCalls": {
              "calls": [
                {
                  "id": "probe-call-1/1",
                  "name": "probe_result",
                  "status": "ok",
                  "arguments": {},
                  "durationMs": 0
                }
              ],
              "complete": true
            }
          },
          "providerResults": [
            {
              "role": "toolResult",
              "toolCallId": "probe-call-1",
              "toolName": "codemode",
              "content": [
                {
                  "type": "text",
                  "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                },
                {
                  "type": "text",
                  "text": "discarded"
                }
              ],
              "details": {
                "calls": [
                  {
                    "id": "probe-call-1/1",
                    "name": "probe_result",
                    "args": "",
                    "status": "ok",
                    "durationMs": 0.17630900000000338
                  }
                ]
              },
              "isError": false,
              "timestamp": 1790765683678,
              "nestedCalls": {
                "calls": [
                  {
                    "id": "probe-call-1/1",
                    "name": "probe_result",
                    "status": "ok",
                    "arguments": {},
                    "durationMs": 0
                  }
                ],
                "complete": true
              }
            }
          ],
          "events": [
            {
              "event": {
                "type": "tool_result",
                "toolName": "probe_result",
                "toolCallId": "probe-call-1/1",
                "parentToolCallId": "probe-call-1",
                "input": {},
                "content": [
                  {
                    "type": "text",
                    "text": "final JOB_A RESULT_A"
                  }
                ],
                "structuredContent": {
                  "job": "JOB_A",
                  "outcome": "RESULT_A"
                },
                "isError": false
              },
              "sessionId": "01a0f1f3-d3c8-745d-ba0e-ddf8978b464a",
              "idle": false,
              "signal": true
            },
            {
              "event": {
                "type": "tool_result",
                "toolName": "codemode",
                "toolCallId": "probe-call-1",
                "input": {
                  "code": "await tools.probe_result(); return \"discarded\";"
                },
                "content": [
                  {
                    "type": "text",
                    "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                  },
                  {
                    "type": "text",
                    "text": "discarded"
                  }
                ],
                "details": {
                  "calls": [
                    {
                      "id": "probe-call-1/1",
                      "name": "probe_result",
                      "args": "",
                      "status": "ok",
                      "durationMs": 0.17630900000000338
                    }
                  ]
                },
                "isError": false
              },
              "sessionId": "01a0f1f3-d3c8-745d-ba0e-ddf8978b464a",
              "idle": false,
              "signal": true
            }
          ]
        },
        {
          "code": "const r=await tools.probe_result(); return {job:r.job};",
          "response": {
            "role": "toolResult",
            "toolCallId": "probe-call-3",
            "toolName": "codemode",
            "content": [
              {
                "type": "text",
                "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
              },
              {
                "type": "text",
                "text": "{\"job\":\"JOB_A\"}"
              }
            ],
            "details": {
              "calls": [
                {
                  "id": "probe-call-3/1",
                  "name": "probe_result",
                  "args": "",
                  "status": "ok",
                  "durationMs": 0.13325900000000956
                }
              ]
            },
            "isError": false,
            "timestamp": 1790765683699,
            "nestedCalls": {
              "calls": [
                {
                  "id": "probe-call-3/1",
                  "name": "probe_result",
                  "status": "ok",
                  "arguments": {},
                  "durationMs": 0
                }
              ],
              "complete": true
            }
          },
          "providerResults": [
            {
              "role": "toolResult",
              "toolCallId": "probe-call-1",
              "toolName": "codemode",
              "content": [
                {
                  "type": "text",
                  "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                },
                {
                  "type": "text",
                  "text": "discarded"
                }
              ],
              "details": {
                "calls": [
                  {
                    "id": "probe-call-1/1",
                    "name": "probe_result",
                    "args": "",
                    "status": "ok",
                    "durationMs": 0.17630900000000338
                  }
                ]
              },
              "isError": false,
              "timestamp": 1790765683678,
              "nestedCalls": {
                "calls": [
                  {
                    "id": "probe-call-1/1",
                    "name": "probe_result",
                    "status": "ok",
                    "arguments": {},
                    "durationMs": 0
                  }
                ],
                "complete": true
              }
            },
            {
              "role": "toolResult",
              "toolCallId": "probe-call-3",
              "toolName": "codemode",
              "content": [
                {
                  "type": "text",
                  "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                },
                {
                  "type": "text",
                  "text": "{\"job\":\"JOB_A\"}"
                }
              ],
              "details": {
                "calls": [
                  {
                    "id": "probe-call-3/1",
                    "name": "probe_result",
                    "args": "",
                    "status": "ok",
                    "durationMs": 0.13325900000000956
                  }
                ]
              },
              "isError": false,
              "timestamp": 1790765683699,
              "nestedCalls": {
                "calls": [
                  {
                    "id": "probe-call-3/1",
                    "name": "probe_result",
                    "status": "ok",
                    "arguments": {},
                    "durationMs": 0
                  }
                ],
                "complete": true
              }
            }
          ],
          "events": [
            {
              "event": {
                "type": "tool_result",
                "toolName": "probe_result",
                "toolCallId": "probe-call-3/1",
                "parentToolCallId": "probe-call-3",
                "input": {},
                "content": [
                  {
                    "type": "text",
                    "text": "final JOB_A RESULT_A"
                  }
                ],
                "structuredContent": {
                  "job": "JOB_A",
                  "outcome": "RESULT_A"
                },
                "isError": false
              },
              "sessionId": "01a0f1f3-d3c8-745d-ba0e-ddf8978b464a",
              "idle": false,
              "signal": true
            },
            {
              "event": {
                "type": "tool_result",
                "toolName": "codemode",
                "toolCallId": "probe-call-3",
                "input": {
                  "code": "const r=await tools.probe_result(); return {job:r.job};"
                },
                "content": [
                  {
                    "type": "text",
                    "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                  },
                  {
                    "type": "text",
                    "text": "{\"job\":\"JOB_A\"}"
                  }
                ],
                "details": {
                  "calls": [
                    {
                      "id": "probe-call-3/1",
                      "name": "probe_result",
                      "args": "",
                      "status": "ok",
                      "durationMs": 0.13325900000000956
                    }
                  ]
                },
                "isError": false
              },
              "sessionId": "01a0f1f3-d3c8-745d-ba0e-ddf8978b464a",
              "idle": false,
              "signal": true
            }
          ]
        },
        {
          "code": "return await tools.probe_result();",
          "response": {
            "role": "toolResult",
            "toolCallId": "probe-call-5",
            "toolName": "codemode",
            "content": [
              {
                "type": "text",
                "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
              },
              {
                "type": "text",
                "text": "{\"job\":\"JOB_A\",\"outcome\":\"RESULT_A\"}"
              }
            ],
            "details": {
              "calls": [
                {
                  "id": "probe-call-5/1",
                  "name": "probe_result",
                  "args": "",
                  "status": "ok",
                  "durationMs": 0.15512899999998808
                }
              ]
            },
            "isError": false,
            "timestamp": 1790765683720,
            "nestedCalls": {
              "calls": [
                {
                  "id": "probe-call-5/1",
                  "name": "probe_result",
                  "status": "ok",
                  "arguments": {},
                  "durationMs": 0
                }
              ],
              "complete": true
            }
          },
          "providerResults": [
            {
              "role": "toolResult",
              "toolCallId": "probe-call-1",
              "toolName": "codemode",
              "content": [
                {
                  "type": "text",
                  "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                },
                {
                  "type": "text",
                  "text": "discarded"
                }
              ],
              "details": {
                "calls": [
                  {
                    "id": "probe-call-1/1",
                    "name": "probe_result",
                    "args": "",
                    "status": "ok",
                    "durationMs": 0.17630900000000338
                  }
                ]
              },
              "isError": false,
              "timestamp": 1790765683678,
              "nestedCalls": {
                "calls": [
                  {
                    "id": "probe-call-1/1",
                    "name": "probe_result",
                    "status": "ok",
                    "arguments": {},
                    "durationMs": 0
                  }
                ],
                "complete": true
              }
            },
            {
              "role": "toolResult",
              "toolCallId": "probe-call-3",
              "toolName": "codemode",
              "content": [
                {
                  "type": "text",
                  "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                },
                {
                  "type": "text",
                  "text": "{\"job\":\"JOB_A\"}"
                }
              ],
              "details": {
                "calls": [
                  {
                    "id": "probe-call-3/1",
                    "name": "probe_result",
                    "args": "",
                    "status": "ok",
                    "durationMs": 0.13325900000000956
                  }
                ]
              },
              "isError": false,
              "timestamp": 1790765683699,
              "nestedCalls": {
                "calls": [
                  {
                    "id": "probe-call-3/1",
                    "name": "probe_result",
                    "status": "ok",
                    "arguments": {},
                    "durationMs": 0
                  }
                ],
                "complete": true
              }
            },
            {
              "role": "toolResult",
              "toolCallId": "probe-call-5",
              "toolName": "codemode",
              "content": [
                {
                  "type": "text",
                  "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                },
                {
                  "type": "text",
                  "text": "{\"job\":\"JOB_A\",\"outcome\":\"RESULT_A\"}"
                }
              ],
              "details": {
                "calls": [
                  {
                    "id": "probe-call-5/1",
                    "name": "probe_result",
                    "args": "",
                    "status": "ok",
                    "durationMs": 0.15512899999998808
                  }
                ]
              },
              "isError": false,
              "timestamp": 1790765683720,
              "nestedCalls": {
                "calls": [
                  {
                    "id": "probe-call-5/1",
                    "name": "probe_result",
                    "status": "ok",
                    "arguments": {},
                    "durationMs": 0
                  }
                ],
                "complete": true
              }
            }
          ],
          "events": [
            {
              "event": {
                "type": "tool_result",
                "toolName": "probe_result",
                "toolCallId": "probe-call-5/1",
                "parentToolCallId": "probe-call-5",
                "input": {},
                "content": [
                  {
                    "type": "text",
                    "text": "final JOB_A RESULT_A"
                  }
                ],
                "structuredContent": {
                  "job": "JOB_A",
                  "outcome": "RESULT_A"
                },
                "isError": false
              },
              "sessionId": "01a0f1f3-d3c8-745d-ba0e-ddf8978b464a",
              "idle": false,
              "signal": true
            },
            {
              "event": {
                "type": "tool_result",
                "toolName": "codemode",
                "toolCallId": "probe-call-5",
                "input": {
                  "code": "return await tools.probe_result();"
                },
                "content": [
                  {
                    "type": "text",
                    "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
                  },
                  {
                    "type": "text",
                    "text": "{\"job\":\"JOB_A\",\"outcome\":\"RESULT_A\"}"
                  }
                ],
                "details": {
                  "calls": [
                    {
                      "id": "probe-call-5/1",
                      "name": "probe_result",
                      "args": "",
                      "status": "ok",
                      "durationMs": 0.15512899999998808
                    }
                  ]
                },
                "isError": false
              },
              "sessionId": "01a0f1f3-d3c8-745d-ba0e-ddf8978b464a",
              "idle": false,
              "signal": true
            }
          ]
        }
      ],
      "direct": {
        "role": "toolResult",
        "toolCallId": "probe-call-7",
        "toolName": "probe_result",
        "content": [
          {
            "type": "text",
            "text": "final JOB_A RESULT_A"
          }
        ],
        "isError": false,
        "timestamp": 1790765683722
      },
      "errors": []
    }
  }
]
````

## classifiers-results.json

```text
[
  {
    "name": "extension classifier accounting inside tools and idle commands",
    "status": "observed",
    "data": {
      "unreported": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "probe_classify",
        "content": [
          {
            "type": "text",
            "text": "{\"api\":\"probe-classifier\",\"provider\":\"probe-classifier\",\"model\":\"classifier\",\"answers\":{\"assessment\":{\"type\":\"choice\",\"choice\":\"yes\",\"probabilities\":{\"yes\":1,\"no\":0},\"confidence\":1}},\"usage\":{\"input\":10,\"output\":0,\"totalTokens\":10,\"cost\":{\"total\":0.01}},\"stopReason\":\"stop\",\"timestamp\":1790765684004}"
          }
        ],
        "isError": false,
        "timestamp": 1790765684004
      },
      "manual": {
        "role": "toolResult",
        "toolCallId": "probe-call-3",
        "toolName": "probe_accounted",
        "content": [
          {
            "type": "text",
            "text": "manually attributed"
          }
        ],
        "usage": {
          "input": 10,
          "output": 0,
          "cacheRead": 0,
          "cacheWrite": 0,
          "totalTokens": 10,
          "cost": {
            "input": 0.01,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0,
            "total": 0.01
          }
        },
        "isError": false,
        "timestamp": 1790765684007
      },
      "nested": {
        "role": "toolResult",
        "toolCallId": "probe-call-5",
        "toolName": "codemode",
        "content": [
          {
            "type": "text",
            "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
          },
          {
            "type": "text",
            "text": "manually attributed"
          }
        ],
        "details": {
          "calls": [
            {
              "id": "probe-call-5/1",
              "name": "probe_accounted",
              "args": "",
              "status": "ok",
              "durationMs": 0.7286849999999845
            }
          ]
        },
        "usage": {
          "input": 10,
          "output": 0,
          "cacheRead": 0,
          "cacheWrite": 0,
          "totalTokens": 10,
          "cost": {
            "input": 0.01,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0,
            "total": 0.01
          }
        },
        "isError": false,
        "timestamp": 1790765684048,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-5/1",
              "name": "probe_accounted",
              "status": "ok",
              "arguments": {},
              "durationMs": 0
            }
          ],
          "complete": true
        }
      },
      "native": {
        "role": "toolResult",
        "toolCallId": "probe-call-7",
        "toolName": "codemode",
        "content": [
          {
            "type": "text",
            "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
          },
          {
            "type": "text",
            "text": "{\"api\":\"probe-classifier\",\"provider\":\"probe-classifier\",\"model\":\"classifier\",\"answers\":{\"assessment\":{\"type\":\"choice\",\"choice\":\"yes\",\"probabilities\":{\"yes\":1,\"no\":0},\"confidence\":1}},\"usage\":{\"input\":10,\"output\":0,\"totalTokens\":10,\"cost\":{\"total\":0.01}},\"stopReason\":\"stop\",\"timestamp\":1790765684071}"
          }
        ],
        "details": {
          "calls": [
            {
              "id": "probe-call-7/models.classify/1",
              "name": "models.classify",
              "args": "probe-classifier/classifier",
              "status": "ok",
              "durationMs": 0.14077899999995225,
              "cost": 0.01
            }
          ]
        },
        "usage": {
          "input": 10,
          "output": 0,
          "totalTokens": 10,
          "cost": {
            "total": 0.01
          }
        },
        "isError": false,
        "timestamp": 1790765684072
      },
      "commandResult": {
        "api": "probe-classifier",
        "provider": "probe-classifier",
        "model": "classifier",
        "answers": {
          "assessment": {
            "type": "choice",
            "choice": "yes",
            "probabilities": {
              "yes": 1,
              "no": 0
            },
            "confidence": 1
          }
        },
        "usage": {
          "input": 10,
          "output": 0,
          "totalTokens": 10,
          "cost": {
            "total": 0.01
          }
        },
        "stopReason": "stop",
        "timestamp": 1790765684073
      },
      "seenIdle": {
        "idle": true,
        "signal": false
      },
      "added": [],
      "commandEvents": [],
      "stats": {
        "sessionId": "01a0f1f3-d51b-757e-b929-e01adc79ad8a",
        "userMessages": 4,
        "assistantMessages": 8,
        "toolCalls": 4,
        "toolResults": 4,
        "totalMessages": 17,
        "tokens": {
          "input": 30,
          "output": 0,
          "cacheRead": null,
          "cacheWrite": null,
          "total": null
        },
        "cost": 0.03,
        "contextUsage": {
          "tokens": 3965,
          "contextWindow": 100000,
          "percent": 3.965
        }
      }
    }
  },
  {
    "name": "classifier abort is forwarded; ignored signals do not impose a deadline",
    "status": "observed",
    "data": {
      "failure": {
        "api": "probe-classifier",
        "provider": "probe-classifier",
        "model": "classifier",
        "answers": {},
        "stopReason": "error",
        "errorMessage": "synthetic classifier failure",
        "timestamp": 1790765684079
      },
      "aborted": {
        "api": "probe-classifier",
        "provider": "probe-classifier",
        "model": "classifier",
        "answers": {},
        "stopReason": "aborted",
        "errorMessage": "The operation was aborted due to timeout",
        "timestamp": 1790765684104
      },
      "abortElapsed": 25,
      "ignored": {
        "api": "probe-classifier",
        "provider": "probe-classifier",
        "model": "classifier",
        "answers": {
          "assessment": {
            "type": "choice",
            "choice": "yes",
            "probabilities": {
              "yes": 1,
              "no": 0
            },
            "confidence": 1
          }
        },
        "usage": {
          "input": 10,
          "output": 0,
          "totalTokens": 10,
          "cost": {
            "total": 0.01
          }
        },
        "stopReason": "stop",
        "timestamp": 1790765684165
      },
      "ignoreElapsed": 61,
      "calls": [
        {
          "state": {
            "fail": true
          },
          "hasSignal": false
        },
        {
          "state": {},
          "hasSignal": true
        },
        {
          "state": {
            "ignore": true
          },
          "hasSignal": true
        }
      ],
      "events": [
        "session_start"
      ]
    }
  }
]
```

## wire-results.json

```text
[
  {
    "name": "actual request identity at public hooks under physical and virtual selections",
    "status": "observed",
    "data": {
      "phases": [
        {
          "selection": {
            "id": "physical",
            "name": "Loopback fixture",
            "reasoning": false,
            "input": [
              "text"
            ],
            "contextWindow": 100000,
            "maxTokens": 1024,
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "api": "openai-responses",
            "provider": "loopback",
            "baseUrl": "http://127.0.0.1:45955/v1"
          },
          "hooks": [
            {
              "type": "before_provider_headers",
              "eventKeys": [
                "type",
                "headers"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              }
            },
            {
              "type": "before_provider_request",
              "eventKeys": [
                "type",
                "payload"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "payloadModel": "physical"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "message_end",
              "eventKeys": [
                "type",
                "message"
              ],
              "selected": {
                "provider": "loopback",
                "id": "physical",
                "api": "openai-responses"
              },
              "messageModel": "physical"
            }
          ],
          "assistant": {
            "role": "assistant",
            "content": [
              {
                "type": "text",
                "text": "synthetic loopback reply",
                "textSignature": "{\"v\":1,\"id\":\"msg_1\"}"
              }
            ],
            "api": "openai-responses",
            "provider": "loopback",
            "model": "physical",
            "usage": {
              "input": 10,
              "output": 4,
              "cacheRead": 0,
              "cacheWrite": 0,
              "reasoning": 0,
              "totalTokens": 14,
              "cost": {
                "input": 0,
                "output": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "total": 0
              }
            },
            "stopReason": "stop",
            "timestamp": 1790765685635,
            "responseId": "resp_1",
            "rawStopReason": "completed",
            "thinkingLevel": "off"
          }
        },
        {
          "selection": {
            "id": "virtual",
            "name": "Synthetic router",
            "api": "pi-virtual",
            "provider": "probe-router",
            "baseUrl": "",
            "reasoning": false,
            "thinkingLevelMap": {
              "off": "off",
              "minimal": null,
              "low": null,
              "medium": null,
              "high": null,
              "xhigh": null,
              "max": null
            },
            "input": [
              "text",
              "image"
            ],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 0,
            "maxTokens": 0
          },
          "hooks": [
            {
              "type": "before_provider_headers",
              "eventKeys": [
                "type",
                "headers"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              }
            },
            {
              "type": "before_provider_request",
              "eventKeys": [
                "type",
                "payload"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "payloadModel": "physical"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "provider_stream_event",
              "eventKeys": [
                "data",
                "type",
                "provider",
                "api",
                "model"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "streamModel": "physical",
              "streamProvider": "loopback",
              "streamApi": "openai-responses"
            },
            {
              "type": "message_end",
              "eventKeys": [
                "type",
                "message"
              ],
              "selected": {
                "provider": "probe-router",
                "id": "virtual",
                "api": "pi-virtual"
              },
              "messageModel": "physical"
            }
          ],
          "assistant": {
            "role": "assistant",
            "content": [
              {
                "type": "text",
                "text": "synthetic loopback reply",
                "textSignature": "{\"v\":1,\"id\":\"msg_1\"}"
              }
            ],
            "api": "openai-responses",
            "provider": "loopback",
            "model": "physical",
            "usage": {
              "input": 10,
              "output": 4,
              "cacheRead": 0,
              "cacheWrite": 0,
              "reasoning": 0,
              "totalTokens": 14,
              "cost": {
                "input": 0,
                "output": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "total": 0
              }
            },
            "stopReason": "stop",
            "timestamp": 1790765685653,
            "responseId": "resp_1",
            "rawStopReason": "completed",
            "thinkingLevel": "off"
          }
        }
      ],
      "requests": [
        {
          "url": "/v1/responses",
          "model": "physical",
          "marker": "synthetic"
        },
        {
          "url": "/v1/responses",
          "model": "physical",
          "marker": "synthetic"
        }
      ],
      "errors": []
    }
  },
  {
    "name": "native System One transport retries and cancellation",
    "status": "observed",
    "data": {
      "success": {
        "api": "typesafe-system-one",
        "provider": "loopback-classifier",
        "model": "fixture",
        "answers": {
          "ok": {
            "type": "choice",
            "choice": "yes",
            "probabilities": {
              "yes": 1,
              "no": 0
            },
            "confidence": 1
          }
        },
        "stopReason": "stop",
        "timestamp": 1790765685660,
        "usage": {
          "input": 10,
          "output": 1,
          "cacheRead": 0,
          "cacheWrite": 0,
          "totalTokens": 11,
          "cost": {
            "input": 0.000009999999999999999,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0,
            "total": 0.000009999999999999999
          }
        }
      },
      "first": {
        "api": "typesafe-system-one",
        "provider": "loopback-classifier",
        "model": "fixture",
        "answers": {},
        "stopReason": "error",
        "timestamp": 1790765685662,
        "errorMessage": "System One API error (503): {\"error\":{\"message\":\"synthetic unavailable\"}}"
      },
      "noRetry": {
        "api": "typesafe-system-one",
        "provider": "loopback-classifier",
        "model": "fixture",
        "answers": {},
        "stopReason": "error",
        "timestamp": 1790765688656,
        "errorMessage": "System One API error (503): {\"error\":{\"message\":\"synthetic unavailable\"}}"
      },
      "aborted": {
        "api": "typesafe-system-one",
        "provider": "loopback-classifier",
        "model": "fixture",
        "answers": {},
        "stopReason": "aborted",
        "timestamp": 1790765688657,
        "errorMessage": "Request aborted"
      },
      "elapsed": 5001,
      "defaultAttempts": 3,
      "noRetryAttempts": 1,
      "total": 6,
      "events": [
        "session_start"
      ]
    }
  }
]
```

## lifecycle-results.json

```text
[
  {
    "name": "reload invalidates captured APIs without changing session identity",
    "status": "observed",
    "data": {
      "id": "01a0f1f3-d6dc-7129-a00b-62887f2e7ee9",
      "events": [
        {
          "event": {
            "type": "session_start",
            "reason": "startup"
          },
          "sessionId": "01a0f1f3-d6dc-7129-a00b-62887f2e7ee9",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_shutdown",
            "reason": "reload"
          },
          "sessionId": "01a0f1f3-d6dc-7129-a00b-62887f2e7ee9",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_start",
            "reason": "reload"
          },
          "sessionId": "01a0f1f3-d6dc-7129-a00b-62887f2e7ee9",
          "idle": true,
          "signal": false
        }
      ],
      "append": {
        "error": "Error: This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload()."
      },
      "oldIdle": {
        "error": "Error: This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload()."
      }
    }
  },
  {
    "name": "new resume fork and quit distinguish lifecycle reasons and fresh callbacks",
    "status": "observed",
    "data": {
      "id": "01a0f1f3-d6e1-7129-a00b-628b79c97dc8",
      "afterNew": {
        "id": "01a0f1f3-d6e8-7129-a00b-628d33020cb3",
        "oldWrite": {
          "error": "Error: This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload()."
        }
      },
      "forkId": "01a0f1f3-d6ee-7129-a00b-628f59adb6cc",
      "callbacks": [
        "01a0f1f3-d6e8-7129-a00b-628d33020cb3",
        "01a0f1f3-d6e1-7129-a00b-628b79c97dc8",
        "01a0f1f3-d6ee-7129-a00b-628f59adb6cc"
      ],
      "events": [
        {
          "event": {
            "type": "session_start",
            "reason": "startup"
          },
          "sessionId": "01a0f1f3-d6e1-7129-a00b-628b79c97dc8",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_shutdown",
            "reason": "new",
            "targetSessionFile": "/home/araketski/.cache/pi-0991-native-probes.8H9PXQ/workspace/runtime/sessions/2026-09-30T10-54-44-456Z_01a0f1f3-d6e8-7129-a00b-628d33020cb3.jsonl"
          },
          "sessionId": "01a0f1f3-d6e1-7129-a00b-628b79c97dc8",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_start",
            "reason": "new",
            "previousSessionFile": "/home/araketski/.cache/pi-0991-native-probes.8H9PXQ/workspace/runtime/sessions/2026-09-30T10-54-44-449Z_01a0f1f3-d6e1-7129-a00b-628b79c97dc8.jsonl"
          },
          "sessionId": "01a0f1f3-d6e8-7129-a00b-628d33020cb3",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_shutdown",
            "reason": "resume",
            "targetSessionFile": "/home/araketski/.cache/pi-0991-native-probes.8H9PXQ/workspace/runtime/sessions/2026-09-30T10-54-44-449Z_01a0f1f3-d6e1-7129-a00b-628b79c97dc8.jsonl"
          },
          "sessionId": "01a0f1f3-d6e8-7129-a00b-628d33020cb3",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_start",
            "reason": "resume",
            "previousSessionFile": "/home/araketski/.cache/pi-0991-native-probes.8H9PXQ/workspace/runtime/sessions/2026-09-30T10-54-44-456Z_01a0f1f3-d6e8-7129-a00b-628d33020cb3.jsonl"
          },
          "sessionId": "01a0f1f3-d6e1-7129-a00b-628b79c97dc8",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_shutdown",
            "reason": "fork",
            "targetSessionFile": "/home/araketski/.cache/pi-0991-native-probes.8H9PXQ/workspace/runtime/sessions/2026-09-30T10-54-44-462Z_01a0f1f3-d6ee-7129-a00b-628f59adb6cc.jsonl"
          },
          "sessionId": "01a0f1f3-d6e1-7129-a00b-628b79c97dc8",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_start",
            "reason": "fork",
            "previousSessionFile": "/home/araketski/.cache/pi-0991-native-probes.8H9PXQ/workspace/runtime/sessions/2026-09-30T10-54-44-449Z_01a0f1f3-d6e1-7129-a00b-628b79c97dc8.jsonl"
          },
          "sessionId": "01a0f1f3-d6ee-7129-a00b-628f59adb6cc",
          "idle": true,
          "signal": false
        },
        {
          "event": {
            "type": "session_shutdown",
            "reason": "quit"
          },
          "sessionId": "01a0f1f3-d6ee-7129-a00b-628f59adb6cc",
          "idle": true,
          "signal": false
        }
      ]
    }
  },
  {
    "name": "nested foreground cancellation and completed inner tool signal lifetime",
    "status": "observed",
    "data": {
      "aborted": true,
      "signalAborted": true,
      "events": [
        {
          "event": {
            "type": "tool_result",
            "toolName": "probe_block",
            "toolCallId": "probe-call-1/1",
            "parentToolCallId": "probe-call-1",
            "input": {},
            "content": [
              {
                "type": "text",
                "text": "aborted"
              }
            ],
            "isError": false
          },
          "sessionId": "01a0f1f3-d6f4-7129-a00b-629199c76f44",
          "idle": false,
          "signal": true
        },
        {
          "event": {
            "type": "tool_execution_end",
            "toolCallId": "probe-call-1/1",
            "toolName": "probe_block",
            "result": {
              "content": [
                {
                  "type": "text",
                  "text": "aborted"
                }
              ]
            },
            "isError": false,
            "parentToolCallId": "probe-call-1"
          },
          "sessionId": "01a0f1f3-d6f4-7129-a00b-629199c76f44",
          "idle": false,
          "signal": true
        },
        {
          "event": {
            "type": "tool_result",
            "toolName": "codemode",
            "toolCallId": "probe-call-1",
            "input": {
              "code": "return await tools.probe_block();"
            },
            "content": [
              {
                "type": "text",
                "text": "Script failed\nWall time 0.0 seconds\nOutput:\n"
              },
              {
                "type": "text",
                "text": "Script error:\nScript aborted: This operation was aborted\n\nTool calls made before the failure (they are not undone): probe_block (ok)"
              }
            ],
            "details": {
              "calls": [
                {
                  "id": "probe-call-1/1",
                  "name": "probe_block",
                  "args": "",
                  "status": "ok",
                  "durationMs": 1.131853000000035
                }
              ]
            },
            "isError": true
          },
          "sessionId": "01a0f1f3-d6f4-7129-a00b-629199c76f44",
          "idle": false,
          "signal": true
        },
        {
          "event": {
            "type": "tool_execution_end",
            "toolCallId": "probe-call-1",
            "toolName": "codemode",
            "result": {
              "content": [
                {
                  "type": "text",
                  "text": "Script failed\nWall time 0.0 seconds\nOutput:\n"
                },
                {
                  "type": "text",
                  "text": "Script error:\nScript aborted: This operation was aborted\n\nTool calls made before the failure (they are not undone): probe_block (ok)"
                }
              ],
              "details": {
                "calls": [
                  {
                    "id": "probe-call-1/1",
                    "name": "probe_block",
                    "args": "",
                    "status": "ok",
                    "durationMs": 1.131853000000035
                  }
                ]
              },
              "isError": true
            },
            "isError": true
          },
          "sessionId": "01a0f1f3-d6f4-7129-a00b-629199c76f44",
          "idle": false,
          "signal": true
        },
        {
          "event": {
            "type": "agent_settled"
          },
          "sessionId": "01a0f1f3-d6f4-7129-a00b-629199c76f44",
          "idle": true,
          "signal": false
        }
      ]
    }
  },
  {
    "name": "inner tool completion is not automatic background ownership",
    "status": "observed",
    "data": {
      "completedInnerSignalAborted": false,
      "completedInnerGotAbort": false,
      "events": [
        {
          "event": {
            "type": "tool_result",
            "toolName": "probe_handoff",
            "toolCallId": "probe-call-1/1",
            "parentToolCallId": "probe-call-1",
            "input": {},
            "content": [
              {
                "type": "text",
                "text": "synthetic handed-off marker"
              }
            ],
            "isError": false
          },
          "sessionId": "01a0f1f3-d721-7129-a00b-62920a889fa5",
          "idle": false,
          "signal": true
        },
        {
          "event": {
            "type": "tool_result",
            "toolName": "probe_hold",
            "toolCallId": "probe-call-1/2",
            "parentToolCallId": "probe-call-1",
            "input": {},
            "content": [
              {
                "type": "text",
                "text": "cancelled wait"
              }
            ],
            "isError": false
          },
          "sessionId": "01a0f1f3-d721-7129-a00b-62920a889fa5",
          "idle": false,
          "signal": true
        },
        {
          "event": {
            "type": "tool_result",
            "toolName": "codemode",
            "toolCallId": "probe-call-1",
            "input": {
              "code": "await tools.probe_handoff(); return await tools.probe_hold();"
            },
            "content": [
              {
                "type": "text",
                "text": "Script failed\nWall time 0.0 seconds\nOutput:\n"
              },
              {
                "type": "text",
                "text": "Script error:\nScript aborted: This operation was aborted\n\nTool calls made before the failure (they are not undone): probe_handoff (ok), probe_hold (ok)"
              }
            ],
            "details": {
              "calls": [
                {
                  "id": "probe-call-1/1",
                  "name": "probe_handoff",
                  "args": "",
                  "status": "ok",
                  "durationMs": 0.31469800000002124
                },
                {
                  "id": "probe-call-1/2",
                  "name": "probe_hold",
                  "args": "",
                  "status": "ok",
                  "durationMs": 0.29131799999998975
                }
              ]
            },
            "isError": true
          },
          "sessionId": "01a0f1f3-d721-7129-a00b-62920a889fa5",
          "idle": false,
          "signal": true
        }
      ]
    }
  },
  {
    "name": "turn events distinguish input source but do not label goal ownership",
    "status": "observed",
    "data": {
      "events": [
        {
          "type": "input",
          "keys": [
            "type",
            "text",
            "source"
          ],
          "source": "interactive",
          "text": "Synthetic user run"
        },
        {
          "type": "agent_start",
          "keys": [
            "type"
          ]
        },
        {
          "type": "turn_start",
          "keys": [
            "type",
            "turnIndex",
            "timestamp"
          ],
          "turnIndex": 0
        },
        {
          "type": "turn_end",
          "keys": [
            "type",
            "turnIndex",
            "message",
            "toolResults",
            "messageEntryId",
            "toolResultEntryIds",
            "outcome",
            "entries",
            "continue",
            "context"
          ],
          "turnIndex": 0,
          "customTypes": []
        },
        {
          "type": "agent_before_settle",
          "keys": [
            "type",
            "outcome",
            "entries",
            "continue",
            "context"
          ],
          "customTypes": []
        },
        {
          "type": "agent_settled",
          "keys": [
            "type"
          ]
        },
        {
          "type": "input",
          "keys": [
            "type",
            "text",
            "source"
          ],
          "source": "extension",
          "text": "Synthetic extension run"
        },
        {
          "type": "agent_start",
          "keys": [
            "type"
          ]
        },
        {
          "type": "turn_start",
          "keys": [
            "type",
            "turnIndex",
            "timestamp"
          ],
          "turnIndex": 0
        },
        {
          "type": "turn_end",
          "keys": [
            "type",
            "turnIndex",
            "message",
            "toolResults",
            "messageEntryId",
            "toolResultEntryIds",
            "outcome",
            "entries",
            "continue",
            "context"
          ],
          "turnIndex": 0,
          "customTypes": []
        },
        {
          "type": "agent_before_settle",
          "keys": [
            "type",
            "outcome",
            "entries",
            "continue",
            "context"
          ],
          "customTypes": []
        },
        {
          "type": "agent_settled",
          "keys": [
            "type"
          ]
        },
        {
          "type": "agent_start",
          "keys": [
            "type"
          ]
        },
        {
          "type": "turn_start",
          "keys": [
            "type",
            "turnIndex",
            "timestamp"
          ],
          "turnIndex": 0
        },
        {
          "type": "turn_end",
          "keys": [
            "type",
            "turnIndex",
            "message",
            "toolResults",
            "messageEntryId",
            "toolResultEntryIds",
            "outcome",
            "entries",
            "continue",
            "context"
          ],
          "turnIndex": 0,
          "customTypes": [
            "probe-continuation"
          ]
        },
        {
          "type": "agent_before_settle",
          "keys": [
            "type",
            "outcome",
            "entries",
            "continue",
            "context"
          ],
          "customTypes": [
            "probe-continuation"
          ]
        },
        {
          "type": "agent_settled",
          "keys": [
            "type"
          ]
        }
      ]
    }
  }
]
```

## additional-results.json

```text
[
  {
    "name": "namespaces do not qualify registration keys",
    "status": "observed",
    "data": {
      "matches": [
        {
          "name": "inspect",
          "description": "Synthetic offline probe inspect",
          "parameters": {
            "type": "object",
            "properties": {}
          },
          "exposure": "direct",
          "namespace": {
            "name": "beta"
          },
          "sourceInfo": {
            "path": "<inline:1>",
            "source": "inline",
            "scope": "temporary",
            "origin": "top-level"
          }
        }
      ],
      "response": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "inspect",
        "content": [
          {
            "type": "text",
            "text": "beta"
          }
        ],
        "isError": false,
        "timestamp": 1790765684834
      },
      "errors": []
    }
  },
  {
    "name": "negative defaultTools and active-set removal do not exclude deferred calls",
    "status": "observed",
    "data": [
      {
        "settings": {},
        "before": {
          "role": "toolResult",
          "toolCallId": "probe-call-1",
          "toolName": "probe_caller",
          "content": [
            {
              "type": "text",
              "text": "{\"toolCall\":{\"type\":\"toolCall\",\"id\":\"probe-call-1/1\",\"name\":\"probe_deferred\",\"arguments\":{}},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"reachable\"}]},\"isError\":false}"
            }
          ],
          "isError": false,
          "timestamp": 1790765684840,
          "nestedCalls": {
            "calls": [
              {
                "id": "probe-call-1/1",
                "name": "probe_deferred",
                "status": "ok",
                "arguments": {},
                "durationMs": 0
              }
            ],
            "complete": true
          }
        },
        "after": {
          "role": "toolResult",
          "toolCallId": "probe-call-3",
          "toolName": "probe_caller",
          "content": [
            {
              "type": "text",
              "text": "{\"toolCall\":{\"type\":\"toolCall\",\"id\":\"probe-call-3/1\",\"name\":\"probe_deferred\",\"arguments\":{}},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"reachable\"}]},\"isError\":false}"
            }
          ],
          "isError": false,
          "timestamp": 1790765684842,
          "nestedCalls": {
            "calls": [
              {
                "id": "probe-call-3/1",
                "name": "probe_deferred",
                "status": "ok",
                "arguments": {},
                "durationMs": 0
              }
            ],
            "complete": true
          }
        }
      },
      {
        "settings": {
          "defaultTools": [
            "-probe_deferred"
          ]
        },
        "before": {
          "role": "toolResult",
          "toolCallId": "probe-call-1",
          "toolName": "probe_caller",
          "content": [
            {
              "type": "text",
              "text": "{\"toolCall\":{\"type\":\"toolCall\",\"id\":\"probe-call-1/1\",\"name\":\"probe_deferred\",\"arguments\":{}},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"reachable\"}]},\"isError\":false}"
            }
          ],
          "isError": false,
          "timestamp": 1790765684847,
          "nestedCalls": {
            "calls": [
              {
                "id": "probe-call-1/1",
                "name": "probe_deferred",
                "status": "ok",
                "arguments": {},
                "durationMs": 0
              }
            ],
            "complete": true
          }
        },
        "after": {
          "role": "toolResult",
          "toolCallId": "probe-call-3",
          "toolName": "probe_caller",
          "content": [
            {
              "type": "text",
              "text": "{\"toolCall\":{\"type\":\"toolCall\",\"id\":\"probe-call-3/1\",\"name\":\"probe_deferred\",\"arguments\":{}},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"reachable\"}]},\"isError\":false}"
            }
          ],
          "isError": false,
          "timestamp": 1790765684849,
          "nestedCalls": {
            "calls": [
              {
                "id": "probe-call-3/1",
                "name": "probe_deferred",
                "status": "ok",
                "arguments": {},
                "durationMs": 0
              }
            ],
            "complete": true
          }
        }
      }
    ]
  },
  {
    "name": "nested schema errors blocking and result redaction use native hooks",
    "status": "observed",
    "data": {
      "schema": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "codemode",
        "content": [
          {
            "type": "text",
            "text": "Script failed\nWall time 0.0 seconds\nOutput:\n"
          },
          {
            "type": "text",
            "text": "Script error:\nError: Validation failed for tool \"probe_guarded\":\n  - allow: must have required properties allow\n\nReceived arguments:\n{}\n\nTool calls made before the failure (they are not undone): probe_guarded (error)"
          }
        ],
        "details": {
          "calls": [
            {
              "id": "probe-call-1/1",
              "name": "probe_guarded",
              "args": "{}",
              "status": "error",
              "durationMs": 0.9248939999999948,
              "error": "Validation failed for tool \"probe_guarded\":\n  - allow: must have required properties allow\n\nReceived arguments:\n{}"
            }
          ]
        },
        "isError": true,
        "timestamp": 1790765684895,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-1/1",
              "name": "probe_guarded",
              "status": "error",
              "arguments": {},
              "durationMs": 1,
              "error": "Validation failed for tool \"probe_guarded\":\n  - allow: must have required properties allow\n\nReceived arguments:\n{}"
            }
          ],
          "complete": true
        }
      },
      "blocked": {
        "role": "toolResult",
        "toolCallId": "probe-call-3",
        "toolName": "codemode",
        "content": [
          {
            "type": "text",
            "text": "Script failed\nWall time 0.0 seconds\nOutput:\n"
          },
          {
            "type": "text",
            "text": "Script error:\nError: synthetic blocker\n\nTool calls made before the failure (they are not undone): probe_guarded (error)"
          }
        ],
        "details": {
          "calls": [
            {
              "id": "probe-call-3/1",
              "name": "probe_guarded",
              "args": "{\"allow\":false}",
              "status": "error",
              "durationMs": 0.20457899999996698,
              "error": "synthetic blocker"
            }
          ]
        },
        "isError": true,
        "timestamp": 1790765684917,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-3/1",
              "name": "probe_guarded",
              "status": "error",
              "arguments": {
                "allow": false
              },
              "durationMs": 0,
              "error": "synthetic blocker"
            }
          ],
          "complete": true
        }
      },
      "redacted": {
        "role": "toolResult",
        "toolCallId": "probe-call-5",
        "toolName": "codemode",
        "content": [
          {
            "type": "text",
            "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
          },
          {
            "type": "text",
            "text": "redacted"
          }
        ],
        "details": {
          "calls": [
            {
              "id": "probe-call-5/1",
              "name": "probe_guarded",
              "args": "{\"allow\":true}",
              "status": "ok",
              "durationMs": 0.2845380000000546
            }
          ]
        },
        "isError": false,
        "timestamp": 1790765684940,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-5/1",
              "name": "probe_guarded",
              "status": "ok",
              "arguments": {
                "allow": true
              },
              "durationMs": 0
            }
          ],
          "complete": true
        }
      },
      "count": 1
    }
  },
  {
    "name": "direct tool signals can remain tied to the run after the tool returns",
    "status": "observed",
    "data": {
      "completedDirectSignalAborted": true,
      "completedDirectGotAbort": true
    }
  },
  {
    "name": "classifier response survives reload but stale API refuses application",
    "status": "observed",
    "data": {
      "callHadSignal": false,
      "idleDuring": true,
      "eventsDuring": [
        "session_start"
      ],
      "applied": "Error: This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload()."
    }
  }
]
```

## exposure-results.json

```text
[
  {
    "name": "SDK native builtins enabled absent and explicitly disabled",
    "status": "observed",
    "data": [
      {
        "config": {
          "builtins": false
        },
        "native": [],
        "active": [
          "read",
          "bash",
          "edit",
          "write",
          "probe_direct"
        ],
        "direct": {
          "role": "toolResult",
          "toolCallId": "probe-call-1",
          "toolName": "probe_direct",
          "content": [
            {
              "type": "text",
              "text": "direct works"
            }
          ],
          "isError": false,
          "timestamp": 1790765685239
        }
      },
      {
        "config": {
          "builtins": true,
          "builtinStyle": true,
          "settings": {
            "defaultTools": [
              "+codemode",
              "+tool_search"
            ]
          }
        },
        "native": [
          "codemode",
          "tool_search"
        ],
        "active": [
          "read",
          "bash",
          "edit",
          "write",
          "codemode",
          "tool_search",
          "probe_direct"
        ],
        "direct": {
          "role": "toolResult",
          "toolCallId": "probe-call-1",
          "toolName": "probe_direct",
          "content": [
            {
              "type": "text",
              "text": "direct works"
            }
          ],
          "isError": false,
          "timestamp": 1790765685247
        }
      },
      {
        "config": {
          "builtins": true,
          "builtinStyle": true,
          "noExtensions": true,
          "settings": {
            "defaultTools": [
              "+codemode",
              "+tool_search"
            ]
          }
        },
        "native": [],
        "active": [
          "read",
          "bash",
          "edit",
          "write",
          "probe_direct"
        ],
        "direct": {
          "role": "toolResult",
          "toolCallId": "probe-call-1",
          "toolName": "probe_direct",
          "content": [
            {
              "type": "text",
              "text": "direct works"
            }
          ],
          "isError": false,
          "timestamp": 1790765685252
        }
      },
      {
        "config": {
          "builtins": true,
          "builtinStyle": true,
          "settings": {
            "extensions": [
              "-builtin:codemode",
              "-builtin:tool-search"
            ],
            "defaultTools": [
              "+codemode",
              "+tool_search"
            ]
          }
        },
        "native": [],
        "active": [
          "read",
          "bash",
          "edit",
          "write",
          "probe_direct"
        ],
        "direct": {
          "role": "toolResult",
          "toolCallId": "probe-call-1",
          "toolName": "probe_direct",
          "content": [
            {
              "type": "text",
              "text": "direct works"
            }
          ],
          "isError": false,
          "timestamp": 1790765685256
        }
      }
    ]
  },
  {
    "name": "explicit exclusion survives dynamic re-registration and activation",
    "status": "observed",
    "data": {
      "count": 0,
      "response": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "probe_caller",
        "content": [
          {
            "type": "text",
            "text": "{\"toolCall\":{\"type\":\"toolCall\",\"id\":\"probe-call-1/1\",\"name\":\"probe_excluded\",\"arguments\":{}},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"Tool probe_excluded not found\"}],\"details\":{}},\"isError\":true}"
          }
        ],
        "isError": false,
        "timestamp": 1790765685262,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-1/1",
              "name": "probe_excluded",
              "status": "error",
              "arguments": {},
              "durationMs": 0,
              "error": "Tool probe_excluded not found"
            }
          ],
          "complete": true
        }
      },
      "active": [
        "read",
        "bash",
        "edit",
        "write",
        "probe_caller"
      ],
      "all": [
        "read",
        "bash",
        "powershell",
        "edit",
        "write",
        "grep",
        "find",
        "ls",
        "probe_caller"
      ]
    }
  },
  {
    "name": "structured error is visible directly but remains data to codemode",
    "status": "observed",
    "data": {
      "direct": {
        "role": "toolResult",
        "toolCallId": "probe-call-1",
        "toolName": "probe_error",
        "content": [
          {
            "type": "text",
            "text": "synthetic refusal"
          }
        ],
        "isError": true,
        "timestamp": 1790765685267
      },
      "nested": {
        "role": "toolResult",
        "toolCallId": "probe-call-3",
        "toolName": "codemode",
        "content": [
          {
            "type": "text",
            "text": "Script completed\nWall time 0.0 seconds\nOutput:\n"
          },
          {
            "type": "text",
            "text": "{\"status\":\"error\",\"reason\":\"synthetic refusal\"}"
          }
        ],
        "details": {
          "calls": [
            {
              "id": "probe-call-3/1",
              "name": "probe_error",
              "args": "",
              "status": "error",
              "durationMs": 0.2717180000000212,
              "error": "synthetic refusal"
            }
          ]
        },
        "isError": false,
        "timestamp": 1790765685308,
        "nestedCalls": {
          "calls": [
            {
              "id": "probe-call-3/1",
              "name": "probe_error",
              "status": "error",
              "arguments": {},
              "durationMs": 0,
              "error": "synthetic refusal"
            }
          ],
          "complete": true
        }
      }
    }
  }
]
```
