import {get,list,put} from './store';
export const listCaseRows=()=>list('CASE',12);
export const getCaseRow=(id:string)=>get('CASE',id);
export const createCaseRow=(row:any)=>put('CASE',row.id,row,true);
export async function updateCaseRow(id:string,extraction:string,status:string,model:string){const row=await getCaseRow(id);if(!row)throw new Error('CASE_NOT_FOUND');await put('CASE',id,{...row,extraction,status,model});}
