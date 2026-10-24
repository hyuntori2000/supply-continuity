import {z} from 'zod';
import {scenarioSchema} from '../../lib/continuity';
import {createHash,timingSafeEqual} from 'node:crypto';
import * as continuity from '../../app/api/continuity/route';
import * as agent from '../../app/api/agent/route';
import * as cases from '../../app/api/cases/route';
import * as workflow from '../../app/api/workflow/route';
import * as recalls from '../../app/api/recalls/route';
import {awsCall,dynamo,get,item,key,put,table,unpack} from './store';
const routes:Record<string,any>={'/api/continuity':continuity,'/api/agent':agent,'/api/cases':cases,'/api/workflow':workflow,'/api/recalls':recalls};
const json=(body:unknown,status=200)=>Response.json(body,{status});
export function authenticated(header:string|undefined){const expected=process.env.DEMO_ACCESS_HASH;if(!expected||!header?.startsWith('Bearer '))return false;const actual=createHash('sha256').update(header.slice(7)).digest('hex');return expected.length===actual.length&&timingSafeEqual(Buffer.from(expected),Buffer.from(actual));}
function internalRequest(path:string,method:string,body?:string){return new Request('https://supply-continuity.internal'+path,{method,headers:{origin:'https://supply-continuity.internal','content-type':'application/json'},...(method==='GET'?{}:{body})});}
async function dispatch(path:string,method:string,body?:string){const fn=routes[path]?.[method];if(!fn)return json({error:'Unknown route or method'},404);return fn(internalRequest(path,method,body));}
async function startJob(path:string,body:string){
 const id=crypto.randomUUID(),row={id,path,body,status:'queued',created_at:new Date().toISOString(),expires:Math.floor(Date.now()/1000)+86400};await put('JOB',id,row,true);
 try{await awsCall('lambda',`https://lambda.${process.env.AWS_REGION}.amazonaws.com/2015-03-31/functions/${process.env.AWS_LAMBDA_FUNCTION_NAME}/invocations`,{method:'POST',headers:{'Content-Type':'application/json','X-Amz-Invocation-Type':'Event'},body:JSON.stringify({workerJobId:id})});}catch{await put('JOB',id,{...row,status:'failed',error:'Could not start the AI worker. Retry later.'});return json({error:'Could not start the AI worker.'},503);}
 return json({jobId:id,kind:path==='/api/agent'?'agent':'case',pollUrl:`/api/jobs/${id}`},202);
}
async function runJob(id:string){
 const row=await get('JOB',id);if(!row||row.status!=='queued')return;
 try{await dynamo('PutItem',{TableName:table(),Item:item('JOB',id,{...row,status:'running'}),ConditionExpression:'#s = :q',ExpressionAttributeNames:{'#s':'status'},ExpressionAttributeValues:{':q':{S:'queued'}}});}catch(e){if((e as Error).message==='ConditionalCheckFailedException')return;throw e;}
 let seq=0;
 try{
  const response=await dispatch(row.path,'POST',row.body);
  if(!response.ok){const b:any=await response.json();throw new Error(b.error||'AI worker failed.');}
  if(row.path==='/api/agent'){
   const reader=response.body!.getReader(),decoder=new TextDecoder();let pending='',failed=false;
   const record=async(line:string)=>{if(!line.trim())return;const e=JSON.parse(line);if(e.type==='error')failed=true;await put('JOBEVENT#'+id,String(++seq).padStart(6,'0'),{event:e,expires:row.expires});};
   while(true){const {done,value}=await reader.read();pending+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=pending.split('\n');pending=lines.pop()||'';for(const line of lines)await record(line);if(done)break;}if(pending.trim())await record(pending);
   await put('JOB',id,{...row,body:undefined,status:failed?'failed':'completed',eventCount:seq,finished_at:new Date().toISOString(),...(failed?{error:'Bedrock did not complete a verified plan. See the agent event for details.'}:{})});
  }else{await put('JOB',id,{...row,body:undefined,status:'completed',result:await response.json(),finished_at:new Date().toISOString()});}
 }catch(e){console.error(JSON.stringify({jobId:id,error:(e as Error).name}));await put('JOB',id,{...row,body:undefined,status:'failed',error:row.path==='/api/cases'?'Case analysis failed. Check Bedrock permissions and retry.':'AI processing failed. Check the job and server logs before retrying.',finished_at:new Date().toISOString()});}
}
async function pollJob(id:string,after:number){
 const row=await get('JOB',id);if(!row)return json({error:'Job not found'},404);
 const results=await dynamo('Query',{TableName:table(),KeyConditionExpression:'pk = :pk AND sk > :after',ExpressionAttributeValues:{':pk':{S:'JOBEVENT#'+id},':after':{S:String(after).padStart(6,'0')}},ConsistentRead:true,Limit:30});
 const entries=results.Items||[],events=entries.map((i:any)=>unpack(i).event),cursor=entries.length?Number(entries.at(-1).sk.S):after;
 const timeout=['queued','running'].includes(row.status)&&Date.now()-Date.parse(row.created_at)>240000;
 return json({jobId:id,status:timeout?'failed':row.status,events,cursor,result:row.result,error:timeout?'Processing timed out. Review saved plans before retrying.':row.error});
}
export async function handler(event:any){
 // Async worker messages are accepted only through IAM-authorized Lambda Invoke.
 if(event.workerJobId&&!event.requestContext){await runJob(event.workerJobId);return {ok:true};}
 const method=event.requestContext?.http?.method||event.httpMethod||'GET',path=event.rawPath||event.path||'/',headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v])) as Record<string,string>;
 const origin=headers.origin,allowed=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);
 let response:Response;
 try{
  if(origin&&!allowed.includes(origin))response=json({error:'Origin is not allowed'},403);
  else if(method==='OPTIONS')response=new Response(null,{status:204});
  else if(path==='/health'&&method==='GET')response=json({status:'ok',runtime:'AWS Lambda',storage:'Amazon DynamoDB',ai:'Amazon Bedrock',dataset:'synthetic'});
  else if(!authenticated(headers.authorization))response=json({error:'Enter the team demo access code.'},401);
  else{
   const body=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):(event.body||'');
   if(body.length>16000)response=json({error:'Request too large'},413);
   else if(path.startsWith('/api/jobs/')&&method==='GET'){
    const id=path.slice('/api/jobs/'.length),after=Number(event.queryStringParameters?.after||0);
    response=/^[\da-f-]{36}$/.test(id)&&Number.isSafeInteger(after)&&after>=0?await pollJob(id,after):json({error:'Invalid job'},400);
   }else if(method==='POST'&&(path==='/api/agent'||path==='/api/cases'&&JSON.parse(body||'{}').action==='analyze')){
    const schema=path==='/api/agent'?z.object({message:z.string().min(1).max(2000),scenario:scenarioSchema,caseId:z.string().uuid().optional(),source:z.string().min(1).max(8000)}):z.object({action:z.literal('analyze'),id:z.string().uuid()});
    const validated=schema.safeParse(JSON.parse(body));response=validated.success?await startJob(path,JSON.stringify(validated.data)):json({error:'Invalid AI request'},400);
   }else response=await dispatch(path,method,body);
  }
 }catch(e){console.error(JSON.stringify({path,error:(e as Error).name}));response=json({error:'Request failed. Check the request format and server logs.'},500);}
 return {statusCode:response.status,headers:{'content-type':response.headers.get('content-type')||'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...(origin&&allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-headers':'Content-Type,Authorization','access-control-allow-methods':'GET,POST,OPTIONS',vary:'Origin'}:{})},body:await response.text()};
}
