import {createApiClient,resolveConfig} from './client';
import {finishJob} from './jobs';
export {readAgentEvents} from './client';
export const apiConfig=resolveConfig(import.meta.env);
export const isDemo=apiConfig.mode==='demo';
const transport=createApiClient(apiConfig);
const request=(path:string,init:RequestInit={})=>{const headers=new Headers(init.headers);const token=sessionStorage.getItem('supply-continuity-access');if(token)headers.set('Authorization',`Bearer ${token}`);return transport(path,{...init,headers});};
export async function apiFetch(path:string,init:RequestInit={}){
 if(isDemo){const {demoRequest}=await import('./demo');return demoRequest(path,init);}
 return finishJob(await request(path,init),request,init.signal||undefined);
}
export async function apiJson(path:string,init:RequestInit={}){return (await apiFetch(path,init)).json();}
