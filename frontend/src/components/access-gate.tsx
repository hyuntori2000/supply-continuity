import {useState,type ReactNode} from 'react';
import {apiConfig} from '../api/runtime';
import {createApiClient} from '../api/client';
export function AccessGate({children}:{children:ReactNode}){
 const required=import.meta.env.VITE_REQUIRE_LOGIN==='true'&&apiConfig.mode==='api';
 const [ready,setReady]=useState(!required),[code,setCode]=useState(()=>sessionStorage.getItem('supply-continuity-access')||''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(ready)return <>{children}</>;
 return <main className="access-screen"><form className="access-card" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await createApiClient(apiConfig)('/api/agent',{headers:{Authorization:`Bearer ${code.trim()}`}});sessionStorage.setItem('supply-continuity-access',code.trim());setReady(true);}catch(e){setError(e instanceof Error?e.message:'Could not sign in.');}finally{setBusy(false);}}}>
 <span className="access-eyebrow">SUPPLY CONTINUITY · AWS DEMO</span><h1>Keep food moving.<br/>Keep people safe.</h1><p>Enter your team access code to investigate incidents, run the Bedrock response agent and review recovery plans.</p><label htmlFor="demo-access">Team access code</label><input id="demo-access" type="password" autoComplete="current-password" required value={code} onChange={e=>setCode(e.target.value)} placeholder="Enter access code"/><button type="submit" disabled={busy}>{busy?'Connecting to AWS…':'Open dashboard'}</button>{error&&<p role="alert">{error}</p>}<small>Amazon Bedrock · AWS Lambda · Amazon DynamoDB<br/>Synthetic incidents and inventory for demonstration.</small>
 </form></main>;
}
