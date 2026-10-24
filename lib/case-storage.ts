import {env} from 'cloudflare:workers';
const db=()=>{if(!env.DB)throw new Error('DATABASE_UNAVAILABLE');return env.DB;};
export async function listCaseRows(){return (await db().prepare('SELECT * FROM intake_cases ORDER BY created_at DESC LIMIT 12').all()).results;}
export async function getCaseRow(id:string){return db().prepare('SELECT * FROM intake_cases WHERE id=?').bind(id).first();}
export async function createCaseRow(row:{id:string;store_id:number;store_name:string;report:string;status:string;created_at:string}){await db().prepare('INSERT INTO intake_cases (id,store_id,store_name,report,status,created_at) VALUES (?,?,?,?,?,?)').bind(row.id,row.store_id,row.store_name,row.report,row.status,row.created_at).run();}
export async function updateCaseRow(id:string,extraction:string,status:string,model:string){await db().prepare('UPDATE intake_cases SET extraction=?,status=?,model=? WHERE id=?').bind(extraction,status,model,id).run();}
