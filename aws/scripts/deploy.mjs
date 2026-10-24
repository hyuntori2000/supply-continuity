import {AwsClient} from 'aws4fetch';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(root);
const region='us-east-1',apiId=process.env.DEPLOY_API_ID,name='supply-continuity',fn=name+'-api',table=name+'-data',role=name+'-runtime';
if(!apiId||apiId==='vceh0xmua8')throw new Error('Set DEPLOY_API_ID to a separate API for this app. AWS25 (vceh0xmua8) was released for the team; do not reconnect automatically.');
let credentials;
if(process.env.AWS_ACCESS_KEY_ID)credentials={accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,sessionToken:process.env.AWS_SESSION_TOKEN};
else {execFileSync('stty',['-echo'],{stdio:'inherit'});console.log('Ready for deployment credentials (hidden input).');let input='';for await(const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break;}execFileSync('stty',['echo'],{stdio:'inherit'});credentials=JSON.parse(input);input='';}
const stateDir=path.join(root,'.local');mkdirSync(stateDir,{recursive:true,mode:0o700});const statePath=path.join(stateDir,'deployment.json');let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
const accessPath=path.join(stateDir,'access.json');const access=existsSync(accessPath)?JSON.parse(readFileSync(accessPath,'utf8')):{accessCode:randomBytes(18).toString('base64url')};writeFileSync(accessPath,JSON.stringify(access,null,2)+'\n',{mode:0o600});
const save=()=>writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(service,url,method='GET',body,extra={}){
 const r=await new AwsClient({...credentials,region,service,retries:2}).fetch(url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 if(!r.ok){const error=new Error(`${service} ${method} ${new URL(url).pathname}: ${r.status} ${typeof data==='string'?data.slice(0,1200):`${data.__type||''} ${data.message||data.Message||'request failed'}`}`);error.status=r.status;throw error;}return data;
}
const iam=(Action,params={})=>call('iam','https://iam.amazonaws.com/','POST',new URLSearchParams({Action,Version:'2010-05-08',...params}).toString(),{'Content-Type':'application/x-www-form-urlencoded'});
const ddb=(action,body)=>call('dynamodb',`https://dynamodb.${region}.amazonaws.com/`,'POST',body,{'Content-Type':'application/x-amz-json-1.0','X-Amz-Target':'DynamoDB_20120810.'+action});
const lambda=(url,method='GET',body)=>call('lambda',`https://lambda.${region}.amazonaws.com${url}`,method,body);
const casing=(value,upper)=>Array.isArray(value)?value.map(v=>casing(v,upper)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[(upper?k[0].toUpperCase():k[0].toLowerCase())+k.slice(1),casing(v,upper)])):value;
const gateway=async(url,method='GET',body)=>casing(await call('apigateway',`https://apigateway.${region}.amazonaws.com/v2/apis/${apiId}${url}`,method,body===undefined?undefined:casing(body,false)),true);
const amplify=(url,method='GET',body)=>call('amplify',`https://amplify.${region}.amazonaws.com${url}`,method,body);
const identity=await call('sts',`https://sts.${region}.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15`);const account=identity.match(/<Account>(\d+)<\/Account>/)?.[1];if(!account)throw new Error('Cannot identify AWS account');
state={...state,region,account,apiId,functionName:fn,tableName:table,roleName:role};save();
const fnArn=`arn:aws:lambda:${region}:${account}:function:${fn}`,tableArn=`arn:aws:dynamodb:${region}:${account}:table/${table}`,roleArn=`arn:aws:iam::${account}:role/${role}`;
console.log('Verified account. Preparing dedicated application role and DynamoDB table.');
try{await iam('GetRole',{RoleName:role});}catch(e){if(e.status!==404)throw e;await iam('CreateRole',{RoleName:role,Description:'Supply Continuity demo runtime only',AssumeRolePolicyDocument:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]})});}
await iam('PutRolePolicy',{RoleName:role,PolicyName:'SupplyContinuityRuntime',PolicyDocument:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem','dynamodb:Query','dynamodb:UpdateItem'],Resource:[tableArn,tableArn+'/index/*']},{Effect:'Allow',Action:['bedrock:InvokeModel'],Resource:[`arn:aws:bedrock:${region}::foundation-model/amazon.nova-pro-v1:0`]},{Effect:'Allow',Action:['lambda:InvokeFunction'],Resource:fnArn},{Effect:'Allow',Action:['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],Resource:`arn:aws:logs:${region}:${account}:log-group:/aws/lambda/${fn}:*`}]})});
try{await ddb('DescribeTable',{TableName:table});}catch(e){if(!e.message.includes('ResourceNotFound'))throw e;await ddb('CreateTable',{TableName:table,BillingMode:'PAY_PER_REQUEST',AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'},{AttributeName:'sk',AttributeType:'S'},{AttributeName:'created_at',AttributeType:'S'}],KeySchema:[{AttributeName:'pk',KeyType:'HASH'},{AttributeName:'sk',KeyType:'RANGE'}],GlobalSecondaryIndexes:[{IndexName:'by-created',KeySchema:[{AttributeName:'pk',KeyType:'HASH'},{AttributeName:'created_at',KeyType:'RANGE'}],Projection:{ProjectionType:'ALL'}}]});}
for(let i=0;i<50;i++){if((await ddb('DescribeTable',{TableName:table})).Table.TableStatus==='ACTIVE')break;if(i===49)throw new Error('Table creation timed out');await sleep(2000);}
try{await ddb('UpdateTimeToLive',{TableName:table,TimeToLiveSpecification:{AttributeName:'expires',Enabled:true}});}catch(e){if(!e.message.includes('already enabled'))throw e;}
console.log('Preparing Amplify HTTPS hosting.');
if(!state.appId){const apps=await amplify('/apps');let app=apps.apps?.find(a=>a.name===name+'-demo');if(!app)app=(await amplify('/apps','POST',{name:name+'-demo',platform:'WEB',description:'Supply Continuity standalone frontend; Lambda + DynamoDB + Bedrock backend'})).app;state.appId=app.appId;state.defaultDomain=app.defaultDomain;save();}
try{await amplify(`/apps/${state.appId}/branches/main`);}catch(e){if(e.status!==404)throw e;await amplify(`/apps/${state.appId}/branches`,'POST',{branchName:'main',stage:'PRODUCTION',enableAutoBuild:false,framework:'React'});}
state.siteUrl=`https://main.${state.defaultDomain}`;state.apiUrl=`https://${apiId}.execute-api.${region}.amazonaws.com`;save();
const env={TABLE_NAME:table,DEMO_ACCESS_HASH:createHash('sha256').update(access.accessCode).digest('hex'),ALLOWED_ORIGINS:state.siteUrl,BEDROCK_MODEL_ID:'amazon.nova-pro-v1:0'};
const code={ZipFile:readFileSync(path.join(root,'dist/function.zip')).toString('base64')};
async function waitFunction(){for(let i=0;i<60;i++){const c=await lambda(`/2015-03-31/functions/${fn}/configuration`);if(c.State==='Failed'||c.LastUpdateStatus==='Failed')throw new Error(c.StateReason||c.LastUpdateStatusReason);if(c.State==='Active'&&c.LastUpdateStatus!=='InProgress')return;await sleep(2000);}throw new Error('Lambda did not become active');}
let exists=true;try{await lambda(`/2015-03-31/functions/${fn}/configuration`);}catch(e){if(e.status!==404)throw e;exists=false;}
console.log('Deploying Lambda code with execution-role Bedrock access.');
if(!exists){for(let i=0;i<12;i++){try{await lambda('/2015-03-31/functions','POST',{FunctionName:fn,Runtime:'nodejs22.x',Role:roleArn,Handler:'handler.handler',Code:code,Description:'Supply Continuity API and durable Bedrock job worker',Timeout:180,MemorySize:512,Environment:{Variables:env},Architectures:['arm64']});break;}catch(e){if(!e.message.includes('cannot be assumed')||i===11)throw e;await sleep(5000);}}await waitFunction();}
else{await lambda(`/2015-03-31/functions/${fn}/code`,'PUT',code);await waitFunction();await lambda(`/2015-03-31/functions/${fn}/configuration`,'PUT',{Role:roleArn,Timeout:180,MemorySize:512,Environment:{Variables:env}});await waitFunction();}
await lambda(`/2019-09-25/functions/${fn}/event-invoke-config`,'PUT',{MaximumRetryAttempts:0,MaximumEventAgeInSeconds:300});
// Keep paid AI concurrency bounded while leaving capacity for HTTP requests.
await lambda(`/2017-10-31/functions/${fn}/concurrency`,'PUT',{ReservedConcurrentExecutions:5});
try{await lambda(`/2015-03-31/functions/${fn}/policy`,'POST',{StatementId:`SupplyContinuityApiGateway-${apiId}`,Action:'lambda:InvokeFunction',Principal:'apigateway.amazonaws.com',SourceArn:`arn:aws:execute-api:${region}:${account}:${apiId}/*/*/*`,SourceAccount:account});}catch(e){if(e.status!==409)throw e;}
console.log('Connecting the existing API Gateway routes.');
const integrations=await gateway('/integrations');let integration=(integrations.items||integrations.Items||[]).find(x=>x.IntegrationUri===fnArn);
if(!integration)integration=await gateway('/integrations','POST',{IntegrationType:'AWS_PROXY',IntegrationUri:fnArn,PayloadFormatVersion:'2.0',TimeoutInMillis:30000});
const target='integrations/'+integration.IntegrationId,existing=await gateway('/routes');
for(const routeKey of ['GET /health','GET /api/continuity','POST /api/continuity','GET /api/agent','POST /api/agent','GET /api/cases','POST /api/cases','GET /api/workflow','POST /api/workflow','GET /api/recalls','GET /api/jobs/{id}']){
 const old=(existing.items||existing.Items||[]).find(r=>r.RouteKey===routeKey);if(old){if(old.Target!==target)throw new Error(`Existing route ${routeKey} points to another backend; leaving it unchanged.`);}else await gateway('/routes','POST',{RouteKey:routeKey,Target:target,AuthorizationType:'NONE'});
}
await gateway('','PATCH',{CorsConfiguration:{AllowOrigins:[state.siteUrl],AllowHeaders:['content-type','authorization'],AllowMethods:['GET','POST','OPTIONS'],MaxAge:300}});
await gateway('/stages/%24default','PATCH',{AutoDeploy:true,DefaultRouteSettings:{ThrottlingBurstLimit:10,ThrottlingRateLimit:5}});
console.log('Building frontend for the live AWS API (access code is never bundled).');
execFileSync('npm',['run','build','--prefix','frontend'],{cwd:repo,stdio:'inherit',env:{...process.env,VITE_DATA_MODE:'api',VITE_API_BASE_URL:state.apiUrl,VITE_REQUIRE_LOGIN:'true'}});
const zip=path.join(root,'dist/frontend.zip');if(existsSync(zip))execFileSync('rm',[zip]);execFileSync('zip',['-q','-r',zip,'.'],{cwd:path.join(repo,'frontend/dist')});
const deployment=await amplify(`/apps/${state.appId}/branches/main/deployments`,'POST',{});
const uploaded=await fetch(deployment.zipUploadUrl,{method:'PUT',body:readFileSync(zip)});if(!uploaded.ok)throw new Error(`Frontend upload failed ${uploaded.status}`);
await amplify(`/apps/${state.appId}/branches/main/deployments/start`,'POST',{jobId:deployment.jobId});state.amplifyJobId=deployment.jobId;save();
console.log('Frontend uploaded; waiting for Amplify to publish.');
for(let i=0;i<100;i++){const j=await amplify(`/apps/${state.appId}/branches/main/jobs/${deployment.jobId}`);const status=j.job.summary.status;if(status==='SUCCEED'){state.deployedAt=new Date().toISOString();state.status='deployed';delete state.detachedAt;save();console.log(JSON.stringify({status:'deployed',siteUrl:state.siteUrl,apiUrl:state.apiUrl,accessFile:accessPath,resources:{lambda:fn,dynamoDB:table,amplify:state.appId}}));process.exit(0);}if(['FAILED','CANCELLED'].includes(status))throw new Error(`Amplify ${status}`);await sleep(3000);}
throw new Error('Amplify is still deploying; inspect the saved job ID.');
