import {AwsClient} from 'aws4fetch';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const action=process.argv[2];if(!['status','pause','resume'].includes(action))throw new Error('Usage: npm run connection -- status|pause|resume');
const stateFile=new URL('../.local/deployment.json',import.meta.url),state=JSON.parse(readFileSync(stateFile,'utf8'));
if(!state.apiId||state.apiId===state.releasedTeamApiId||state.apiId==='vceh0xmua8')throw new Error('Refusing to modify the team API.');
let c;if(process.env.AWS_ACCESS_KEY_ID)c={accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,sessionToken:process.env.AWS_SESSION_TOKEN};else{execFileSync('stty',['-echo'],{stdio:'inherit'});console.log('Ready for AWS credentials (hidden input).');let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break;}execFileSync('stty',['echo'],{stdio:'inherit'});c=JSON.parse(input);}
const client=new AwsClient({...c,region:state.region,service:'apigateway',retries:0}),url=`https://apigateway.${state.region}.amazonaws.com/v2/apis/${state.apiId}`;
async function call(method,body){const r=await client.fetch(url,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(data.message||`AWS ${r.status}`);return data;}
if(action!=='status'){await call('PATCH',{disableExecuteApiEndpoint:action==='pause'});state.status=action==='pause'?'paused':'deployed';state.connectionChangedAt=new Date().toISOString();writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});}
const actual=await call('GET');console.log(JSON.stringify({apiId:state.apiId,connection:actual.disableExecuteApiEndpoint?'paused':'enabled',siteUrl:state.siteUrl,teamApiUnchanged:state.releasedTeamApiId}));
