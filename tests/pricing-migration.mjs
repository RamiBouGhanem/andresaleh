import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {programs} from '../src/programs.js';

const directory=mkdtempSync(path.join(os.tmpdir(),'coach-pricing-'));
const originalDirectory=process.env.DATA_DIR, originalLegacy=process.env.LEGACY_DATA_FILE;
let first,second;
try{
 process.env.DATA_DIR=directory;
 process.env.LEGACY_DATA_FILE=path.join(directory,'legacy.json');
 writeFileSync(process.env.LEGACY_DATA_FILE,JSON.stringify({programCatalogVersion:2,programs:programs.map(p=>({...p,status:'published',price:p.id==='muscle-building-home'?95:0})),orders:[],leads:[],views:0}));
 first=await import('../backend/database.js?pricing-test=initial');
 const store=first.readStore();
 assert.equal(store.programs.find(p=>p.id==='muscle-building-gym').price,120);
 assert.equal(store.programs.find(p=>p.id==='prenatal-home').price,140);
 assert.equal(store.programs.find(p=>p.id==='muscle-building-home').price,95);
 store.programs.find(p=>p.id==='muscle-building-gym').price=77;
 first.writeStore(store);first.db.close();first=null;
 second=await import('../backend/database.js?pricing-test=restart');
 assert.equal(second.readStore().programs.find(p=>p.id==='muscle-building-gym').price,77);
 console.log('PASS: temporary prices fill the existing zero-price catalog, preserve custom prices and remain editable after restart');
}finally{
 first?.db.close();second?.db.close();rmSync(directory,{recursive:true,force:true});
 if(originalDirectory===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=originalDirectory;
 if(originalLegacy===undefined)delete process.env.LEGACY_DATA_FILE;else process.env.LEGACY_DATA_FILE=originalLegacy;
}
