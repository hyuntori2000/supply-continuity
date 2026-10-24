/** Adapt durable AWS jobs to the existing JSON/NDJSON interface without changing the dashboard. */
export async function finishJob(initial:Response,request:(path:string,init?:RequestInit)=>Promise<Response>,signal?:AbortSignal):Promise<Response>{
 if(initial.status!==202)return initial;
 const job=await initial.json();if(typeof job.jobId!=='string'||!/^[-a-f\d]{36}$/.test(job.jobId))throw new Error('Invalid job identifier.');
 const deadline=Date.now()+240000;let cursor=0;
 const poll=async()=>{if(signal?.aborted)throw new Error('Request cancelled.');if(Date.now()>deadline)throw new Error('AI processing timed out. Check saved plans before retrying.');const r=await request(`/api/jobs/${job.jobId}?after=${cursor}`,{signal});const data=await r.json();cursor=data.cursor;return data;};
 const delay=()=>new Promise<void>(resolve=>setTimeout(resolve,1500));
 if(job.kind==='agent'){
  const enc=new TextEncoder();let cancelled=false;
  return new Response(new ReadableStream({async start(controller){try{while(!cancelled){const data=await poll();for(const e of data.events||[])controller.enqueue(enc.encode(JSON.stringify(e)+'\n'));if(data.status==='completed')break;if(data.status==='failed'){if(!(data.events||[]).some((e:any)=>e.type==='error'))controller.enqueue(enc.encode(JSON.stringify({type:'error',message:data.error||'AI job failed.'})+'\n'));break;}await delay();}if(!cancelled)controller.close();}catch(e){if(!cancelled)controller.error(e);}},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/x-ndjson'}});
 }
 while(true){const data=await poll();if(data.status==='completed')return Response.json(data.result);if(data.status==='failed')throw new Error(data.error||'Case analysis failed.');await delay();}
}
