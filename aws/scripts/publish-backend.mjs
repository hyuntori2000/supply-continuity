// Update only the existing app's Lambda code; preserve permissions, environment and data.
import {AwsClient} from 'aws4fetch';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),state=JSON.parse(readFileSync(new URL('.local/deployment.json',root),'utf8'));
if(state.apiId==='vceh0xmua8'||state.functionName!=='supply-continuity-api')throw new Error('Dedicated application deployment required.');
let credentials;if(process.env.AWS_ACCESS_KEY_ID)credentials={accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,sessionToken:process.env.AWS_SESSION_TOKEN};else{execFileSync('stty',['-echo'],{stdio:'inherit'});console.log('Ready for AWS credentials (hidden input).');let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break;}execFileSync('stty',['echo'],{stdio:'inherit'});credentials=JSON.parse(input);input='';}
const client=new AwsClient({...credentials,region:state.region,service:'lambda',retries:1});
const base=`https://lambda.${state.region}.amazonaws.com/2015-03-31/functions/${state.functionName}`;
async function call(suffix='',method='GET',body){const r=await client.fetch(base+suffix,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(`${r.status}: ${data.message||'Lambda request failed'}`);return data;}
const before=await call();if(before.Configuration.LastUpdateStatus==='InProgress')throw new Error('Another Lambda update is in progress.');
const backup=await fetch(before.Code.Location);if(!backup.ok)throw new Error('Unable to back up deployed code.');writeFileSync(new URL('.local/previous-function.zip',root),Buffer.from(await backup.arrayBuffer()),{mode:0o600});
await call('/code','PUT',{ZipFile:readFileSync(new URL('dist/function.zip',root)).toString('base64'),RevisionId:before.Configuration.RevisionId});
for(let i=0;i<60;i++){const status=await call('/configuration');if(status.LastUpdateStatus==='Successful'){console.log(JSON.stringify({status:'updated',functionName:state.functionName,codeSha256:status.CodeSha256}));process.exit(0);}if(status.LastUpdateStatus==='Failed')throw new Error('Lambda update failed.');await new Promise(r=>setTimeout(r,2000));}throw new Error('Lambda update still in progress.');
