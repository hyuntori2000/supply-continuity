import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8')),{accessCode}=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
const results=[];
async function check(name,path,expected,{method='GET',body,anonymous=false,origin=state.siteUrl}={}){await new Promise(r=>setTimeout(r,300));const r=await fetch(state.apiUrl+path,{method,headers:{...(anonymous?{}:{Authorization:'Bearer '+accessCode}),Origin:origin,'Content-Type':'application/json'},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});results.push({name,expected,status:r.status,passed:r.status===expected});return r;}
const base={closedFacilityIds:[],blockedSupplierIds:[],objective:'continuity',trafficMultiplier:1,enableStoreTransfers:false};
await check('Public health check','/health',200,{anonymous:true});
await check('Unauthenticated data request rejected','/api/continuity',401,{anonymous:true});
await check('Unauthenticated inference rejected','/api/agent',401,{method:'POST',body:{},anonymous:true});
await check('Foreign origin rejected','/api/continuity',403,{origin:'https://not-the-demo.invalid'});
await check('Invalid store rejected','/api/cases',400,{method:'POST',body:{action:'submit',storeId:99,report:'Synthetic validation audit report.'}});
await check('Too-short report rejected','/api/cases',400,{method:'POST',body:{action:'submit',storeId:1,report:'x'}});
await check('Invalid traffic multiplier rejected','/api/continuity',400,{method:'POST',body:{scenario:{...base,trafficMultiplier:0}}});
await check('String cannot enable store transfers','/api/continuity',400,{method:'POST',body:{scenario:{...base,enableStoreTransfers:'true'}}});
await check('Unknown job returns not found','/api/jobs/00000000-0000-0000-0000-000000000000',404);
await check('Negative polling cursor rejected','/api/jobs/00000000-0000-0000-0000-000000000000?after=-1',400);
await check('Oversized inference request rejected','/api/agent',413,{method:'POST',body:'x'.repeat(16001)});
await check('Malformed inference JSON is a client error','/api/agent',400,{method:'POST',body:'{invalid'});
const result={testedAt:new Date().toISOString(),checks:results,passed:results.filter(r=>r.passed).length,total:results.length};writeFileSync(new URL('../.local/http-audit-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
