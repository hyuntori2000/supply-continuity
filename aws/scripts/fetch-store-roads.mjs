import {readFileSync,writeFileSync} from 'node:fs';
const stores=JSON.parse(readFileSync(new URL('../../lib/data/dataset.json',import.meta.url))).tables.stores;
const coordinates=stores.map(s=>`${s.longitude},${s.latitude}`).join(';');
const url=`https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=distance,duration`;
const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error('Routing service '+r.status);const b=await r.json();if(b.code!=='Ok')throw new Error(b.code);
const routes=stores.flatMap((a,i)=>stores.flatMap((z,j)=>i===j||a.chain!==z.chain||b.distances[i][j]==null||b.durations[i][j]==null?[]:[{fromStoreId:a.id,toStoreId:z.id,distanceKm:Math.round(b.distances[i][j]/10)/100,drivingMinutes:Math.round(b.durations[i][j]/6)/10}]));
writeFileSync(new URL('../../lib/data/store-routes.json',import.meta.url),JSON.stringify(routes,null,2)+'\n');writeFileSync(new URL('../../lib/data/store-route-provenance.json',import.meta.url),JSON.stringify({provider:'OSRM public routing service',fetchedAt:new Date().toISOString(),url,routeCount:routes.length,description:'Directed road distances and driving durations between same-chain stores. No live traffic; missing routes are excluded.'},null,2)+'\n');console.log({routes:routes.length});
