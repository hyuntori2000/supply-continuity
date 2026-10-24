import {createApiClient,resolveConfig} from './client';
export {readAgentEvents} from './client';
export const apiConfig=resolveConfig(import.meta.env);
export const isDemo=apiConfig.mode==='demo';
const request=createApiClient(apiConfig);
export async function apiFetch(path:string,init:RequestInit={}){
 if(isDemo){const {demoRequest}=await import('./demo');return demoRequest(path,init);}
 return request(path,init);
}
export async function apiJson(path:string,init:RequestInit={}){return (await apiFetch(path,init)).json();}
