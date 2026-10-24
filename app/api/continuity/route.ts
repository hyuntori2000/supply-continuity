import {z} from 'zod';
import {allOffers,stores,facilities,trace,incidentQueue,scenarioSchema,defaults,catalogMatches,optimize,stressTest,report} from '@/lib/continuity';
import {bedrockStatus} from '@/lib/bedrock-continuity';
import {savePlan} from '@/lib/workflow';
export async function GET(){return Response.json({stores,facilities,offers:allOffers,impact:trace(),incidents:incidentQueue(),report,initial:optimize(defaults),stress:stressTest(defaults),ai:bedrockStatus()});}
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});try{const b=z.object({scenario:scenarioSchema}).parse(await req.json());const saved=await savePlan(b.scenario,catalogMatches,'catalog-rules');return Response.json({...saved,stress:stressTest(b.scenario)});}catch{return Response.json({error:'Could not calculate and persist this plan. Check the database migrations.'},{status:400});}}
