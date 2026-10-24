// Configure the isolated backend only. Never emit the key or Lambda environment.
import {AwsClient} from 'aws4fetch';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),state=JSON.parse(readFileSync(new URL('.local/deployment.json',root),'utf8'));
if(state.apiId==='vceh0xmua8'||state.functionName!=='supply-continuity-api')throw new Error('Dedicated application required');
const raw=readFileSync(new URL('.local/maps.env',root),'utf8'),key=raw.match(/^\s*GOOGLE_ROUTES_API_KEY\s*=\s*["']?([^\s"']+)["']?\s*$/m)?.[1];
if(!key||!key.startsWith('AIza'))throw new Error('Google key missing from the ignored server configuration file');
let credentials;if(process.env.AWS_ACCESS_KEY_ID)credentials={accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,sessionToken:process.env.AWS_SESSION_TOKEN};else{execFileSync('stty',['-echo'],{stdio:'inherit'});console.log('Ready for AWS credentials (hidden input).');let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break;}execFileSync('stty',['echo'],{stdio:'inherit'});credentials=JSON.parse(input);input='';}
const client=new AwsClient({...credentials,region:state.region,service:'lambda',retries:1}),url=`https://lambda.${state.region}.amazonaws.com/2015-03-31/functions/${state.functionName}/configuration`;
async function call(method='GET',body){const r=await client.fetch(url,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error(`Lambda configuration request failed (${r.status})`);return r.json();}
const before=await call();if(before.LastUpdateStatus==='InProgress')throw new Error('Another update is in progress');
await call('PUT',{RevisionId:before.RevisionId,Environment:{Variables:{...before.Environment?.Variables,GOOGLE_ROUTES_API_KEY:key}}});
for(let i=0;i<30;i++){const after=await call();if(after.LastUpdateStatus==='Successful'){console.log(JSON.stringify({configured:after.Environment?.Variables?.GOOGLE_ROUTES_API_KEY===key,functionName:state.functionName}));process.exit(0);}if(after.LastUpdateStatus==='Failed')throw new Error('Configuration update failed');await new Promise(r=>setTimeout(r,2000));}throw new Error('Configuration update is still pending');
