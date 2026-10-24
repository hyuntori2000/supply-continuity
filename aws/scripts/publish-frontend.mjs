import {AwsClient} from 'aws4fetch';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(root),stateFile=path.join(root,'.local/deployment.json'),state=JSON.parse(readFileSync(stateFile,'utf8'));
if(!state.appId||!state.apiId||state.apiId==='vceh0xmua8')throw new Error('An isolated app deployment is required.');
let c;if(process.env.AWS_ACCESS_KEY_ID)c={accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,sessionToken:process.env.AWS_SESSION_TOKEN};else{execFileSync('stty',['-echo'],{stdio:'inherit'});console.log('Ready for AWS credentials (hidden input).');let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break;}execFileSync('stty',['echo'],{stdio:'inherit'});c=JSON.parse(input);input='';}
const client=new AwsClient({...c,region:state.region,service:'amplify',retries:1});
async function call(suffix,method='GET',body){const r=await client.fetch(`https://amplify.${state.region}.amazonaws.com/apps/${state.appId}/branches/main${suffix}`,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(`${r.status}: ${data.message||'Amplify request failed'}`);return data;}
execFileSync('npm',['run','build','--prefix','frontend'],{cwd:repo,stdio:'inherit',env:{...process.env,VITE_DATA_MODE:'api',VITE_API_BASE_URL:state.apiUrl,VITE_REQUIRE_LOGIN:'true'}});
const zip=path.join(root,'dist/frontend.zip');if(existsSync(zip))unlinkSync(zip);execFileSync('zip',['-q','-r',zip,'.'],{cwd:path.join(repo,'frontend/dist')});
const deployment=await call('/deployments','POST',{});const upload=await fetch(deployment.zipUploadUrl,{method:'PUT',body:readFileSync(zip)});if(!upload.ok)throw new Error(`Upload failed ${upload.status}`);await call('/deployments/start','POST',{jobId:deployment.jobId});console.log('Frontend uploaded. Backend, routes and data unchanged.');
for(let i=0;i<80;i++){const job=await call('/jobs/'+deployment.jobId);const status=job.job.summary.status;if(status==='SUCCEED'){state.amplifyJobId=deployment.jobId;state.frontendUpdatedAt=new Date().toISOString();writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({status:'published',siteUrl:state.siteUrl,jobId:deployment.jobId}));process.exit(0);}if(['FAILED','CANCELLED'].includes(status))throw new Error('Amplify deployment '+status);await new Promise(r=>setTimeout(r,3000));}throw new Error('Deployment still in progress. Inspect Amplify before retrying.');
