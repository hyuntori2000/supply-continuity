import {AwsClient} from 'aws4fetch';
export const table=()=>process.env.TABLE_NAME!;
export async function awsCall(service:string,url:string,init:RequestInit={}){
 const client=new AwsClient({accessKeyId:process.env.AWS_ACCESS_KEY_ID!,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY!,sessionToken:process.env.AWS_SESSION_TOKEN,region:process.env.AWS_REGION||'us-east-1',service,retries:2});
 const r=await client.fetch(url,{...init,signal:init.signal||AbortSignal.timeout(15000)});
 if(!r.ok){const b:any=await r.json().catch(()=>({}));const e=new Error(b.__type?.split('#').pop()||b.message||`AWS_${r.status}`);throw e;}
 return r;
}
export async function dynamo(action:string,body:unknown):Promise<any>{return (await awsCall('dynamodb',`https://dynamodb.${process.env.AWS_REGION||'us-east-1'}.amazonaws.com/`,{method:'POST',headers:{'Content-Type':'application/x-amz-json-1.0','X-Amz-Target':`DynamoDB_20120810.${action}`},body:JSON.stringify(body)})).json();}
export const key=(kind:string,id:string)=>({pk:{S:kind},sk:{S:id}});
export function item(kind:string,id:string,data:any){return {...key(kind,id),data:{S:JSON.stringify(data)},...(data.created_at?{created_at:{S:data.created_at}}:{}),...(data.status?{status:{S:data.status}}:{}),...(data.expires?{expires:{N:String(data.expires)}}:{})};}
export const unpack=(i:any)=>i?JSON.parse(i.data.S):null;
export async function get(kind:string,id:string){return unpack((await dynamo('GetItem',{TableName:table(),Key:key(kind,id),ConsistentRead:true})).Item);}
export async function put(kind:string,id:string,data:any,onlyNew=false){return dynamo('PutItem',{TableName:table(),Item:item(kind,id,data),...(onlyNew?{ConditionExpression:'attribute_not_exists(pk)'}:{})});}
export async function list(kind:string,limit:number){const r=await dynamo('Query',{TableName:table(),IndexName:'by-created',KeyConditionExpression:'pk = :pk',ExpressionAttributeValues:{':pk':{S:kind}},ScanIndexForward:false,Limit:limit});return (r.Items||[]).map(unpack);}
