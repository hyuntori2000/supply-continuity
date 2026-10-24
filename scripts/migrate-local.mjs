import './sites-env.mjs';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
// Vite and production previews use the same local persistence directory.
const config='dist/server/wrangler.json';
if(!fs.existsSync(config))throw new Error('Run npm run build before npm run db:local.');
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
const args=['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config',config,'--persist-to','.wrangler/state'];
function sql(command){const r=spawnSync(process.execPath,[...args,'--command',command,'--json'],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);return JSON.parse(r.stdout);}
sql('CREATE TABLE IF NOT EXISTS local_schema_migrations (name TEXT PRIMARY KEY)');
const applied=new Set(sql('SELECT name FROM local_schema_migrations')[0].results.map(r=>r.name));
for(const e of journal.entries){if(applied.has(e.tag))continue;const content=fs.readFileSync(`drizzle/${e.tag}.sql`,'utf8');for(const statement of content.split('--> statement-breakpoint'))if(statement.trim())sql(statement.replace(/CREATE TABLE /g,'CREATE TABLE IF NOT EXISTS ').replace(/CREATE UNIQUE INDEX /g,'CREATE UNIQUE INDEX IF NOT EXISTS '));sql(`INSERT INTO local_schema_migrations(name) VALUES ('${e.tag}')`);console.log(`Applied ${e.tag}`);}
console.log('Local schema ready.');
