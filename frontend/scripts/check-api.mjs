// Read-only probe of the documented frontend contract. Never prints response bodies.
const base=(process.argv[2]||process.env.VITE_API_BASE_URL||'').replace(/\/+$/,'');
if(!/^https?:\/\//.test(base)){console.error('Usage: npm run check:api -- https://your-backend-root');process.exit(1);}
const results=[];
for(const path of ['/api/continuity','/api/agent','/api/cases','/api/workflow']){
 try{const r=await fetch(base+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});const type=r.headers.get('content-type')||'';const data=type.includes('json')?await r.json():null;const shape=path.endsWith('continuity')?!!data?.initial?.timing&&Array.isArray(data?.stores):path.endsWith('agent')?typeof data?.configured==='boolean':path.endsWith('cases')?Array.isArray(data?.cases):Array.isArray(data?.events);results.push({path,status:r.status,json:type.includes('json'),contractMatches:r.ok&&shape});}
 catch(e){results.push({path,error:e.name,contractMatches:false});}
}
console.log(JSON.stringify({base,results,note:'Checks read-only response shape. Browser CORS, authentication and live inference require separate verification.'},null,2));
if(results.some(r=>!r.contractMatches))process.exitCode=1;
