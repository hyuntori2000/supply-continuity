import {AwsClient} from 'aws4fetch';
import {execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
let c;
if(process.env.AWS_ACCESS_KEY_ID)c={accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,sessionToken:process.env.AWS_SESSION_TOKEN};
else {execFileSync('stty',['-echo'],{stdio:'inherit'});console.log('Ready for AWS credentials (hidden input).');let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break;}execFileSync('stty',['echo'],{stdio:'inherit'});c=JSON.parse(input);input='';}
const client=new AwsClient({...c,region:'us-east-1',service:'apigateway',retries:0});
async function call(path,method='GET',body){const r=await client.fetch('https://apigateway.us-east-1.amazonaws.com/v2'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(`${r.status} ${data.message||'API setup failed'}`);return data;}
const stateUrl=new URL('../.local/isolated-api.json',import.meta.url);let api;
if(existsSync(stateUrl)){const saved=JSON.parse(readFileSync(stateUrl,'utf8'));api=await call('/apis/'+saved.apiId);}
else {api=await call('/apis','POST',{name:'supply-continuity-isolated',description:'Independent Supply Continuity demo. Team AWS25 is not modified.',protocolType:'HTTP',tags:{Application:'SupplyContinuity',Purpose:'IsolatedDemo'}});mkdirSync(new URL('../.local/',import.meta.url),{recursive:true,mode:0o700});writeFileSync(stateUrl,JSON.stringify(api,null,2)+'\n',{mode:0o600});}
const stages=await call('/apis/'+api.apiId+'/stages');if(!stages.items?.some(s=>s.stageName==='$default'))await call('/apis/'+api.apiId+'/stages','POST',{stageName:'$default',autoDeploy:true});
console.log(JSON.stringify({isolatedApiId:api.apiId,teamApiUnchanged:'vceh0xmua8'}));
process.env.DEPLOY_API_ID=api.apiId;process.env.AWS_ACCESS_KEY_ID=c.accessKeyId;process.env.AWS_SECRET_ACCESS_KEY=c.secretAccessKey;if(c.sessionToken)process.env.AWS_SESSION_TOKEN=c.sessionToken;
await import('./deploy.mjs');
