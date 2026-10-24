import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/api/client.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createApiClient,resolveConfig,readAgentEvents}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('defaults are explicit simulation; a backend root enables API mode',()=>{
 assert.equal(resolveConfig({}).mode,'demo');
 assert.equal(resolveConfig({VITE_API_BASE_URL:'https://api.example.com/prod/'}).baseUrl,'https://api.example.com/prod');
 assert.equal(resolveConfig({VITE_API_BASE_URL:'https://api.example.com/prod/'}).mode,'api');
 assert.equal(resolveConfig({VITE_DATA_MODE:'api'}).baseUrl,'');
});
test('rejects embedded credentials, unsafe URLs and exposed build-time secrets',()=>{
 for(const url of ['https://user:password@example.com','//example.com','javascript:alert(1)','https://example.com?token=x','https://example.com#fragment'])assert.throws(()=>resolveConfig({VITE_API_BASE_URL:url}));
 assert.throws(()=>resolveConfig({VITE_AWS_SECRET_ACCESS_KEY:'fake-test-value'}));
 assert.throws(()=>resolveConfig({VITE_DATA_MODE:'typo'}));
});
test('preserves API Gateway stage and explicit cookie policy',async()=>{
 let requested;
 const call=createApiClient(resolveConfig({VITE_API_BASE_URL:'https://api.example.com/prod/',VITE_API_CREDENTIALS:'include'}),async(url,init)=>{requested={url,init};return Response.json({ok:true});});
 await call('/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(requested.url,'https://api.example.com/prod/api/cases');assert.equal(requested.init.credentials,'include');assert.equal(requested.init.body,'{}');
});
test('API errors remain errors; there is no simulation fallback',async()=>{
 const fail=createApiClient(resolveConfig({VITE_DATA_MODE:'api'}),async()=>Response.json({error:'Backend unavailable'},{status:503}));
 await assert.rejects(()=>fail('/api/continuity'),/Backend unavailable/);
 const denied=createApiClient(resolveConfig({VITE_DATA_MODE:'api'}),async()=>new Response('',{status:401}));
 await assert.rejects(()=>denied('/api/continuity'),/authentication/);
});
test('catches hosting HTML rewrites and network/CORS failures',async()=>{
 const html=createApiClient(resolveConfig({VITE_DATA_MODE:'api'}),async()=>new Response('<html/>',{headers:{'content-type':'text/html'}}));
 await assert.rejects(()=>html('/api/continuity'),/web page instead of data/);
 const offline=createApiClient(resolveConfig({VITE_DATA_MODE:'api'}),async()=>{throw new TypeError('Failed to fetch');});
 await assert.rejects(()=>offline('/api/continuity'),/CORS/);
});
test('agent parser preserves fragmented UTF-8 and final event without newline',async()=>{
 const input=new TextEncoder().encode('{"type":"tool_start","name":"검사"}\n{"type":"final","plan":{"allocated":1220}}');
 const stream=new ReadableStream({start(controller){for(let i=0;i<input.length;i+=2)controller.enqueue(input.slice(i,i+2));controller.close();}});
 const events=[];for await(const e of readAgentEvents(new Response(stream)))events.push(e);
 assert.equal(events[0].name,'검사');assert.equal(events[1].plan.allocated,1220);
});
test('agent parser rejects malformed data',async()=>{
 await assert.rejects(async()=>{for await(const e of readAgentEvents(new Response('not json\n')))void e;},/invalid agent event/);
});
