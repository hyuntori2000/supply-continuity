import {stores,facilities,allOffers,trace,incidentQueue,report,optimize,defaults,stressTest,scenarioSchema} from '@/lib/continuity';
const ai={configured:false,model:'Backend not connected'};
// Explicit local simulation. No fake AI response or persisted approval is generated.
export function demoRequest(path:string,init:RequestInit={}):Response{
 const method=init.method||'GET';
 if(method==='GET'&&path==='/api/continuity')return Response.json({stores,facilities,offers:allOffers,impact:trace(),incidents:incidentQueue(),report,initial:optimize(defaults),stress:stressTest(defaults),ai});
 if(method==='GET'&&path==='/api/agent')return Response.json(ai);
 if(method==='GET'&&path==='/api/workflow')return Response.json({events:[],plans:[]});
 if(method==='GET'&&path==='/api/cases')return Response.json({cases:[]});
 if(method==='POST'&&path==='/api/continuity'){
  const scenario=scenarioSchema.parse(JSON.parse(String(init.body)).scenario);
  return Response.json({plan:optimize(scenario),stress:stressTest(scenario),source:'catalog-rules',status:'preview'});
 }
 throw new Error('Connect a backend to run Bedrock, save reports or record decisions. Local simulation never submits these actions.');
}
