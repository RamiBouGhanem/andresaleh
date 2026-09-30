import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { programs } from '../src/config.js';
const directory=process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(directory,{recursive:true});
export const db=new DatabaseSync(path.join(directory,'coach.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS store(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',createdAt TEXT NOT NULL,lastLogin TEXT);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,userId TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS resets(hash TEXT PRIMARY KEY,userId TEXT NOT NULL,expires INTEGER NOT NULL);
`);
export function readStore(){const s=JSON.parse(db.prepare('SELECT data FROM store WHERE id=1').get().data);s.notifications||=[];s.orders||=[];return s}
export function writeStore(s){db.prepare('INSERT INTO store(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(s))}
if(!db.prepare('SELECT id FROM store WHERE id=1').get()){
 const legacy=process.env.LEGACY_DATA_FILE||path.resolve('data/store.json');
 const s=fs.existsSync(legacy)?JSON.parse(fs.readFileSync(legacy,'utf8')):{programs:programs.map(p=>({...p,status:'published'})),orders:[],leads:[],views:0};
 s.legacyClients=s.clients||[];s.clients=[];
 s.assignments=[];s.checkins=[];s.messages=[];s.bookings=[];s.transformations=[];s.notifications=[];
 s.services=[{id:'assessment',title:'Post-rehab assessment',duration:60,price:60,description:'Get clear on your goals and leave with a focused plan for what comes next',active:true},{id:'followup',title:'Post-rehab follow-up',duration:45,price:45,description:'Check your progress, sharpen your plan and keep building momentum',active:true},{id:'return-sport',title:'Return-to-sport consultation',duration:60,price:70,description:'Build a confident, step-by-step path back to the sport you love',active:true}];
 writeStore(s);
 console.log(fs.existsSync(legacy)?'Imported legacy store into SQLite. Original JSON preserved.':'Created SQLite database.');
}
// Replace the starter catalog once with the coach's current programs
{
 const s=readStore();let changed=false;
 if(s.programCatalogVersion!==2){s.programs=programs.map(p=>({...p,status:'published'}));s.programCatalogVersion=2;changed=true}
 // Add temporary prices once, preserving existing custom prices and order totals
 if(s.programPricingVersion!==1){
  for(const p of s.programs){const defaults=programs.find(x=>x.id===p.id);if(defaults&&Number(p.price)===0)p.price=defaults.price}
  s.programPricingVersion=1;changed=true;
 }
 for(const order of s.orders||[]){if(!order.paymentMethod){order.paymentMethod=order.provider?'online':'manual';changed=true}}
 const serviceUpdates={
  assessment:['Physiotherapy assessment','Post-rehab assessment','Get clear on your goals and leave with a focused plan for what comes next'],
  followup:['Follow-up physiotherapy','Post-rehab follow-up','Check your progress, sharpen your plan and keep building momentum'],
  'return-sport':['Return-to-sport consultation','Return-to-sport consultation','Build a confident, step-by-step path back to the sport you love']
 };
 for(const service of s.services||[]){
  const update=serviceUpdates[service.id];
  if(update&&service.title===update[0]){service.title=update[1];service.description=update[2];changed=true}
 }
 if(changed)writeStore(s);
}
