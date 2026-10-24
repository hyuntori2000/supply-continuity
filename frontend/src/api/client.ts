export type ApiConfig={mode:'demo'|'api';baseUrl:string;credentials:RequestCredentials};

export function resolveConfig(env:Record<string,string|undefined>):ApiConfig{
 const baseUrl=(env.VITE_API_BASE_URL||'').trim().replace(/\/+$/,'');
 const mode=env.VITE_DATA_MODE||(baseUrl?'api':'demo');
 if(mode!=='api'&&mode!=='demo')throw new Error('VITE_DATA_MODE must be demo or api.');
 if(baseUrl){
  const relative=baseUrl.startsWith('/')&&!baseUrl.startsWith('//');
  const url=new URL(baseUrl,'https://frontend.invalid');
  if((!relative&&!/^https?:\/\//.test(baseUrl))||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('VITE_API_BASE_URL must be an HTTP(S) URL or a path prefix without credentials, query or fragment.');
 }
 const credentials=env.VITE_API_CREDENTIALS||'omit';
 if(!['omit','same-origin','include'].includes(credentials))throw new Error('Invalid VITE_API_CREDENTIALS.');
 for(const [key,value] of Object.entries(env))if(key.startsWith('VITE_')&&value&&/SECRET|TOKEN|ACCESS_KEY|PASSWORD|API_KEY|BEARER/i.test(key))throw new Error('Do not put secrets in VITE_ variables; they are public browser configuration.');
 return {mode,baseUrl,credentials:credentials as RequestCredentials};
}

export function createApiClient(config:ApiConfig,fetcher:typeof fetch=fetch){
 return async function request(path:string,init:RequestInit={}):Promise<Response>{
  if(!path.startsWith('/api/'))throw new Error('Only application API paths are supported.');
  const url=config.baseUrl+path;
  let response:Response;
  try{response=await fetcher(url,{...init,credentials:config.credentials,signal:init.signal||AbortSignal.timeout(150000)});}
  catch(error){
   if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))throw new Error('The backend request timed out. Check its status before retrying a saved action.');
   throw new Error('Could not reach the backend. Check the API URL, HTTPS and allowed frontend origin (CORS).');
  }
  const type=response.headers.get('content-type')||'';
  if(!response.ok){
   let message='';
   if(type.includes('json')){const body=await response.json().catch(()=>null);if(typeof body?.error==='string')message=body.error;}
   throw new Error(message||`Backend request failed (${response.status}). ${response.status===401||response.status===403?'Check backend access and authentication.':'Check the API endpoint and server logs.'}`);
  }
  if(!type.includes('application/json')&&!type.includes('application/x-ndjson'))throw new Error('The API returned a web page instead of data. Check the backend URL and hosting rewrite rules.');
  return response;
 };
}

/** Handles split chunks and a final JSON record without a trailing newline. */
export async function* readAgentEvents(response:Response):AsyncGenerator<any>{
 if(!response.body)throw new Error('The backend returned an empty agent response.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
 try{
  while(true){
   const {done,value}=await reader.read();pending+=decoder.decode(value||new Uint8Array(),{stream:!done});
   const lines=pending.split('\n');pending=lines.pop()||'';
   if(done&&pending.trim()){lines.push(pending);pending='';}
   for(const line of lines){if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{throw new Error('The backend sent an invalid agent event.');}if(!event||typeof event.type!=='string')throw new Error('The backend sent an invalid agent event.');yield event;}
   if(done)break;
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
