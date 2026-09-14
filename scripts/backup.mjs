import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
if(existsSync('.env'))process.loadEnvFile('.env');
const source=path.join(process.env.DATA_DIR||'data','coach.sqlite');
if(!existsSync(source))throw new Error('Start the application once to create the database.');
const folder=process.env.BACKUP_DIR||'backups';mkdirSync(folder,{recursive:true});
const destination=path.join(folder,`coach-${Date.now()}.sqlite`);
const db=new DatabaseSync(source);await backup(db,destination);db.close();console.log(`Backup saved: ${destination}`);
