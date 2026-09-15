import express from 'express';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import path from 'node:path';
import {existsSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const {db,readStore,writeStore}=await import('./backend/database.js');
const {providers}=await import('./backend/payments.js');
const app=express(),production=process.env.NODE_ENV==='production',scrypt=promisify(crypto.scrypt);
const adminEmail=process.env.ADMIN_EMAIL||'coach@demo.com',adminPassword=process.env.ADMIN_PASSWORD||'CoachDemo2026!';
if(production&&(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD||adminPassword==='CoachDemo2026!'||adminPassword.length<12))throw new Error('Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 12 characters.');
app.set('trust proxy',1);app.disable('x-powered-by');
app.use((q,r,next)=>{r.set('X-Content-Type-Options','nosniff');r.set('X-Frame-Options','DENY');r.set('Referrer-Policy','same-origin');if(q.path.startsWith('/api'))r.set('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(q.method)&&q.headers.origin){const allowed=process.env.APP_ORIGIN||`${q.protocol}://${q.get('host')}`;if(q.headers.origin!==allowed)return r.status(403).json({message:'Request origin is not allowed.'})}next()});
app.use((q,r,next)=>q.path==='/api/webhooks/stripe'?express.raw({type:'*/*',limit:'1mb'})(q,r,next):express.json({limit:'7mb'})(q,r,next));
const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fail=(msg,status=400)=>{throw Object.assign(new Error(msg),{status})};
const text=(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
const email=v=>{const e=text(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail('Enter a valid email address.');return e};
const number=(v,min,max)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)fail(`Enter a value between ${min} and ${max}.`);return n};
const choice=(v,values)=>{if(!values.includes(v))fail('Invalid status.');return v};
const publicUser=u=>({id:u.id,name:u.name,email:u.email,status:u.status,createdAt:u.createdAt,lastLogin:u.lastLogin});
async function passwordHash(p){if(typeof p!=='string'||p.length<12||p.length>128)fail('Use a password of 12–128 characters.');const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(p,salt,64)).toString('hex')}
async function verify(p,stored){if(typeof p!=='string'||p.length>128)return false;const[salt,digest]=stored.split(':');const actual=await scrypt(p,salt,64);return crypto.timingSafeEqual(actual,Buffer.from(digest,'hex'))}
const adminHash=await passwordHash(adminPassword);
const dummyHash=await passwordHash(crypto.randomBytes(20).toString('hex'));
const attempts=new Map();
function throttle(q,r,next){const key=q.ip;let a=attempts.get(key);if(!a||a.until<Date.now()){a={count:0,until:Date.now()+900000};attempts.set(key,a)}if(++a.count>30)return r.status(429).json({message:'Too many attempts. Try again in 15 minutes.'});next()}
setInterval(()=>{for(const[k,v]of attempts)if(v.until<Date.now())attempts.delete(k);db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());db.prepare('DELETE FROM resets WHERE expires < ?').run(Date.now())},60000).unref();
function cookie(q){return (q.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('coach_session='))?.slice(14)||''}
function session(q){const token=cookie(q);return token?db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash(token),Date.now()):null}
function issue(q,r,userId,role){const old=cookie(q);if(old)db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(old));const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),userId,role,Date.now()+28800000);r.cookie('coach_session',token,{httpOnly:true,secure:production,sameSite:'lax',path:'/',maxAge:28800000})}
function auth(role){return(q,r,next)=>{const s=session(q);if(!s)return r.status(401).json({message:'Please sign in again.'});if(role&&s.role!==role)return r.status(403).json({message:'Access denied.'});if(s.role==='member'){q.user=db.prepare('SELECT * FROM users WHERE id=?').get(s.userId);if(!q.user||q.user.status!=='active')return r.status(403).json({message:'Your account is inactive. Contact the coach.'})}q.session=s;next()}}
const admin=auth('admin'),member=auth('member');
app.get('/api/health',(_q,r)=>r.json({ok:true,database:'sqlite'}));
app.get('/api/session',(q,r)=>{const s=session(q);r.json({role:s?.role||null})});
app.post('/api/logout',(q,r)=>{db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(cookie(q)));r.clearCookie('coach_session',{path:'/'});r.status(204).end()});
app.post('/api/admin/login',throttle,async(q,r)=>{if(!(await verify(q.body.password,adminHash))||text(q.body.email).toLowerCase()!==adminEmail.toLowerCase())fail('Incorrect email or password.',401);issue(q,r,'admin','admin');r.json({ok:true})});
app.post('/api/member/register',throttle,async(q,r)=>{const e=email(q.body.email),name=text(q.body.name,100);if(!name)fail('Enter your name.');const pwd=await passwordHash(q.body.password),uid=id();try{db.prepare('INSERT INTO users(id,email,name,password,createdAt) VALUES(?,?,?,?,?)').run(uid,e,name,pwd,now())}catch(err){if(String(err.message).includes('UNIQUE'))fail('An account already uses that email.',409);throw err}issue(q,r,uid,'member');r.status(201).json({ok:true})});
app.post('/api/member/login',throttle,async(q,r)=>{const u=db.prepare('SELECT * FROM users WHERE email=?').get(email(q.body.email));const ok=await verify(q.body.password,u?.password||dummyHash);if(!ok||!u)fail('Incorrect email or password.',401);if(u.status!=='active')fail('Your account is inactive. Contact the coach.',403);db.prepare('UPDATE users SET lastLogin=? WHERE id=?').run(now(),u.id);issue(q,r,u.id,'member');r.json({ok:true})});
app.post('/api/member/password',member,async(q,r)=>{if(!await verify(q.body.current,q.user.password))fail('Current password is incorrect.');const pwd=await passwordHash(q.body.password);db.prepare('UPDATE users SET password=? WHERE id=?').run(pwd,q.user.id);db.prepare('DELETE FROM sessions WHERE userId=?').run(q.user.id);issue(q,r,q.user.id,'member');r.json({ok:true})});
app.post('/api/member/reset',throttle,async(q,r)=>{const digest=hash(text(q.body.token,100)),reset=db.prepare('SELECT * FROM resets WHERE hash=? AND expires>?').get(digest,Date.now());if(!reset)fail('This reset link is invalid or expired.');const pwd=await passwordHash(q.body.password);db.exec('BEGIN IMMEDIATE');try{const live=db.prepare('SELECT * FROM resets WHERE hash=? AND expires>?').get(digest,Date.now());if(!live)fail('Reset link already used.');db.prepare('UPDATE users SET password=? WHERE id=?').run(pwd,live.userId);db.prepare('DELETE FROM resets WHERE userId=?').run(live.userId);db.prepare('DELETE FROM sessions WHERE userId=?').run(live.userId);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}r.json({ok:true})});
function catalogProgram(p){const{content,...publicFields}=p;return publicFields}
app.get('/api/programs',(_q,r)=>r.json(readStore().programs.filter(p=>p.status==='published').map(catalogProgram)));
app.post('/api/track',(_q,r)=>{const s=readStore();s.views++;writeStore(s);r.status(204).end()});
app.post('/api/leads',throttle,(q,r)=>{const s=readStore(),name=text(q.body.name,100),e=email(q.body.email);if(!name)fail('Name is required.');s.leads.unshift({id:id(),name,email:e,goal:text(q.body.goal),source:'Website',status:'new',createdAt:now()});writeStore(s);r.status(201).json({ok:true})});
app.post('/api/orders',member,(q,r)=>{const s=readStore(),p=s.programs.find(p=>(p.id===q.body.programId||p.title===q.body.program)&&p.status==='published');if(!p)fail('Program not available.',404);const existing=s.orders.find(o=>o.memberId===q.user.id&&o.programId===p.id&&o.status==='pending');if(existing)return r.json({reference:existing.id,message:'Your existing request is awaiting the coach’s review.'});const order={id:id(),memberId:q.user.id,name:q.user.name,email:q.user.email,phone:text(q.body.phone,60),programId:p.id,program:p.title,kind:'program',itemId:p.id,itemTitle:p.title,amount:p.price,status:'pending',createdAt:now()};s.orders.unshift(order);writeStore(s);r.status(201).json({reference:order.id,message:'Your request is saved. Your coach will arrange payment and program access.'})});

// ---- Online payments (Visa via Stripe, Visa/Whish wallet via Whish Pay) ----
// grantOrderAccess never trusts anything the browser says — callers only
// invoke it after a provider's own API has confirmed payment. It is
// idempotent: calling it twice for the same order does nothing the second
// time, which matters because both a webhook and a status poll can race.
function grantOrderAccess(order){
 const s=readStore();
 const o=s.orders.find(x=>x.id===order.id);
 if(!o||o.status==='paid')return o;
 o.status='paid';o.paidAt=now();
 let grantedTitle=o.itemTitle||o.program;
 if((o.kind||'program')==='program'){
  if(!s.assignments.some(a=>a.memberId===o.memberId&&a.programId===(o.itemId||o.programId)))s.assignments.push({id:id(),memberId:o.memberId,programId:o.itemId||o.programId,createdAt:now()});
 }else if(o.kind==='service'){
  const svc=s.services.find(x=>x.id===o.itemId);
  grantedTitle=svc?.title||o.itemTitle;
  s.bookings.unshift({id:id(),memberId:o.memberId,name:o.name,serviceId:o.itemId,title:grantedTitle,duration:svc?.duration||0,price:o.amount,requestedAt:o.requestedAt,status:'requested',notes:o.notes||'',createdAt:now(),orderId:o.id});
 }
 s.notifications.unshift({id:id(),type:'payment',memberId:o.memberId,memberName:o.name,itemTitle:grantedTitle,amount:o.amount,provider:o.provider||'manual',kind:o.kind||'program',createdAt:now(),read:false});
 writeStore(s);
 return o;
}
app.post('/api/checkout',member,async(q,r)=>{
 const s=readStore(),kind=choice(q.body.kind,['program','service']),providerName=choice(q.body.provider,['stripe','whish']);
 let item,amount,title;
 if(kind==='program'){item=s.programs.find(p=>p.id===q.body.itemId&&p.status==='published');if(!item)fail('Program not available.',404);amount=item.price;title=item.title}
 else{item=s.services.find(x=>x.id===q.body.itemId&&x.active);if(!item)fail('Session type not available.',404);amount=item.price;title=item.title}
 let requestedAt=null;
 if(kind==='service'){const t=Date.parse(q.body.requestedAt);if(!Number.isFinite(t)||t<Date.now()||t>Date.now()+180*86400000)fail('Choose a service time in the future, within six months.');requestedAt=new Date(t).toISOString()}
 const provider=providers[providerName];
 if(!provider||!provider.configured())fail(`${providerName==='stripe'?'Card payment (Stripe)':'Whish'} is not connected yet. Add its API keys in .env.`,503);
 const orderId=id();
 const order={id:orderId,memberId:q.user.id,name:q.user.name,email:q.user.email,phone:text(q.body.phone,60),kind,itemId:item.id,itemTitle:title,amount,currency:'USD',status:'awaiting_payment',provider:providerName,providerRef:'',requestedAt,notes:text(q.body.notes,500),createdAt:now()};
 s.orders.unshift(order);writeStore(s);
 try{
  const{checkoutUrl,providerRef}=await provider.createCheckout({orderId,amount,currency:'USD',description:title,customer:{name:q.user.name,email:q.user.email}});
  const s2=readStore(),o2=s2.orders.find(x=>x.id===orderId);o2.providerRef=providerRef;writeStore(s2);
  r.status(201).json({orderId,checkoutUrl});
 }catch(e){
  const s2=readStore(),o2=s2.orders.find(x=>x.id===orderId);if(o2){o2.status='failed';writeStore(s2)}
  fail(e.message||'Could not start checkout.',502);
 }
});
app.get('/api/orders/:id/status',member,async(q,r)=>{
 const s=readStore();let o=s.orders.find(x=>x.id===q.params.id&&x.memberId===q.user.id);
 if(!o)fail('Not found.',404);
 if(o.status==='awaiting_payment'&&o.providerRef&&providers[o.provider]){
  try{
   const result=await providers[o.provider].verify({providerRef:o.providerRef});
   if(result.status==='paid')o=grantOrderAccess(o);
   else if(result.status==='failed'){const s2=readStore(),o2=s2.orders.find(x=>x.id===o.id);if(o2){o2.status='failed';writeStore(s2);o=o2}}
  }catch{/* provider unreachable right now — leave pending, client can poll again */}
 }
 r.json({status:o.status,kind:o.kind||'program',itemTitle:o.itemTitle||o.program});
});
app.post('/api/webhooks/stripe',async(q,r)=>{
 const raw=Buffer.isBuffer(q.body)?q.body.toString('utf8'):'';
 const orderId=providers.stripe.verifyWebhook(raw,q.headers['stripe-signature']);
 if(!orderId)return r.status(400).end();
 const s=readStore(),o=s.orders.find(x=>x.id===orderId);
 if(o&&o.status==='awaiting_payment'&&o.providerRef){try{const result=await providers.stripe.verify({providerRef:o.providerRef});if(result.status==='paid')grantOrderAccess(o)}catch{}}
 r.status(200).json({ok:true});
});
app.post('/api/webhooks/whish',async(q,r)=>{
 // We do not trust this payload's claimed status (we can't yet verify Whish's
 // signature scheme without their merchant docs) — it only tells us which
 // order to re-check directly against Whish's own status API.
 const orderId=text(q.body?.externalId||q.body?.orderId,100);
 if(orderId){
  const s=readStore(),o=s.orders.find(x=>x.id===orderId);
  if(o&&o.status==='awaiting_payment'&&o.providerRef){try{const result=await providers.whish.verify({providerRef:o.providerRef});if(result.status==='paid')grantOrderAccess(o)}catch{}}
 }
 r.status(200).json({ok:true});
});
app.get('/api/member/dashboard',member,(q,r)=>{const s=readStore(),uid=q.user.id;r.json({user:publicUser(q.user),assignments:s.assignments.filter(a=>a.memberId===uid).map(a=>({...a,program:s.programs.find(p=>p.id===a.programId)||{title:'Archived program'}})),checkins:s.checkins.filter(c=>c.memberId===uid),messages:s.messages.filter(m=>m.memberId===uid),bookings:s.bookings.filter(b=>b.memberId===uid),orders:s.orders.filter(o=>o.memberId===uid)})});
app.post('/api/member/checkins',member,(q,r)=>{const s=readStore();const c={id:id(),memberId:q.user.id,createdAt:now(),weight:q.body.weight===''?null:number(q.body.weight,20,400),completed:number(q.body.completed,0,30),planned:number(q.body.planned,1,30),notes:text(q.body.notes),reply:''};if(c.completed>c.planned)fail('Completed sessions cannot exceed planned sessions.');s.checkins.unshift(c);writeStore(s);r.status(201).json(c)});
app.post('/api/member/messages',member,(q,r)=>{const body=text(q.body.body);if(!body)fail('Enter a message.');const s=readStore();s.messages.push({id:id(),memberId:q.user.id,from:'member',body,createdAt:now()});writeStore(s);r.status(201).json({ok:true})});
app.get('/api/services',(_q,r)=>r.json(readStore().services.filter(s=>s.active)));
app.get('/api/payment-providers',(_q,r)=>r.json({stripe:providers.stripe.configured(),whish:providers.whish.configured()}));
app.post('/api/bookings',member,(q,r)=>{const s=readStore(),service=s.services.find(x=>x.id===q.body.serviceId&&x.active),time=Date.parse(q.body.requestedAt);if(!service||!Number.isFinite(time)||time<Date.now()||time>Date.now()+180*86400000)fail('Choose a service and a future date within six months.');const b={id:id(),memberId:q.user.id,name:q.user.name,serviceId:service.id,title:service.title,duration:service.duration,price:service.price,requestedAt:new Date(time).toISOString(),status:'requested',notes:text(q.body.notes,500),createdAt:now()};s.bookings.unshift(b);writeStore(s);r.status(201).json(b)});
app.patch('/api/member/bookings/:id',member,(q,r)=>{const s=readStore(),b=s.bookings.find(x=>x.id===q.params.id&&x.memberId===q.user.id);if(!b)fail('Not found.',404);if(!['requested','confirmed'].includes(b.status))fail('This appointment cannot be cancelled.');b.status='cancelled';writeStore(s);r.json(b)});
app.get('/api/transformations',(_q,r)=>r.json(readStore().transformations.filter(t=>t.published&&t.consent).map(({consent,...t})=>t)));
app.get('/api/admin/dashboard',admin,(_q,r)=>{const s=readStore(),users=db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();const clients=users.map(u=>{const c=s.checkins.find(x=>x.memberId===u.id);return {...publicUser(u),program:s.assignments.filter(a=>a.memberId===u.id).map(a=>s.programs.find(p=>p.id===a.programId)?.title).filter(Boolean).join(', ')||'Not assigned',progress:0,compliance:c?Math.round(c.completed/c.planned*100):0,nextCheckIn:c?c.createdAt.slice(0,10):'No check-in yet'}});const programs=s.programs.map(p=>({...p,sales:s.orders.filter(o=>o.programId===p.id&&o.status==='paid').length}));r.json({...s,programs,clients,stats:{revenue:s.orders.filter(o=>o.status==='paid').reduce((n,o)=>n+o.amount,0),orders:s.orders.length,clients:clients.filter(c=>c.status==='active').length,leads:s.leads.filter(l=>l.status==='new').length,views:s.views,unreadNotifications:s.notifications.filter(n=>!n.read).length}})});
function programInput(x){const title=text(x.title,120);if(!title)fail('Title is required.');return{title,tag:text(x.tag,40),subtitle:text(x.subtitle,150),duration:text(x.duration,50),level:text(x.level,50),price:number(x.price,0,100000),status:choice(x.status,['draft','published']),description:text(x.description,5000),features:Array.isArray(x.features)?x.features.slice(0,30).map(f=>text(f,250)):[],content:text(x.content,30000)}}
app.post('/api/admin/programs',admin,(q,r)=>{const s=readStore(),p={id:id(),...programInput(q.body)};s.programs.unshift(p);writeStore(s);r.status(201).json(p)});
app.put('/api/admin/programs/:id',admin,(q,r)=>{const s=readStore(),p=s.programs.find(p=>p.id===q.params.id);if(!p)fail('Not found.',404);Object.assign(p,programInput(q.body));writeStore(s);r.json(p)});
app.delete('/api/admin/programs/:id',admin,(q,r)=>{const s=readStore();if(s.assignments.some(a=>a.programId===q.params.id))fail('This program is assigned to a member. Set it to draft to remove it from sale.');s.programs=s.programs.filter(p=>p.id!==q.params.id);writeStore(s);r.status(204).end()});
app.patch('/api/admin/orders/:id',admin,(q,r)=>{const s=readStore(),x=s.orders.find(i=>i.id===q.params.id);if(!x)fail('Not found.',404);const value=choice(q.body.status,['pending','awaiting_payment','paid','cancelled','refunded','failed']);if(value==='paid'&&x.status!=='paid')return r.json(grantOrderAccess(x));x.status=value;writeStore(s);r.json(x)});
app.patch('/api/admin/leads/:id',admin,(q,r)=>{const s=readStore(),x=s.leads.find(i=>i.id===q.params.id);if(!x)fail('Not found.',404);x.status=choice(q.body.status,['new','contacted','qualified','converted','closed']);writeStore(s);r.json(x)});
app.patch('/api/admin/notifications/:id',admin,(q,r)=>{const s=readStore(),x=s.notifications.find(n=>n.id===q.params.id);if(!x)fail('Not found.',404);x.read=true;writeStore(s);r.json(x)});
app.post('/api/admin/notifications/read-all',admin,(q,r)=>{const s=readStore();s.notifications.forEach(n=>n.read=true);writeStore(s);r.json({ok:true})});
app.patch('/api/admin/members/:id',admin,(q,r)=>{const status=choice(q.body.status,['active','inactive']);db.prepare('UPDATE users SET status=? WHERE id=?').run(status,q.params.id);if(status==='inactive')db.prepare('DELETE FROM sessions WHERE userId=?').run(q.params.id);r.json({ok:true})});
app.post('/api/admin/members/:id/reset',admin,(q,r)=>{if(!db.prepare('SELECT id FROM users WHERE id=?').get(q.params.id))fail('Not found.',404);const token=crypto.randomBytes(32).toString('hex');db.prepare('DELETE FROM resets WHERE userId=?').run(q.params.id);db.prepare('INSERT INTO resets VALUES(?,?,?)').run(hash(token),q.params.id,Date.now()+1800000);r.json({path:`/member?reset=${token}`})});
app.post('/api/admin/assignments',admin,(q,r)=>{const s=readStore();if(!db.prepare('SELECT id FROM users WHERE id=?').get(q.body.memberId)||!s.programs.some(p=>p.id===q.body.programId))fail('Choose a member and a program.');if(!s.assignments.some(a=>a.memberId===q.body.memberId&&a.programId===q.body.programId))s.assignments.push({id:id(),memberId:q.body.memberId,programId:q.body.programId,createdAt:now()});writeStore(s);r.json({ok:true})});
app.delete('/api/admin/assignments/:id',admin,(q,r)=>{const s=readStore();s.assignments=s.assignments.filter(a=>a.id!==q.params.id);writeStore(s);r.status(204).end()});
app.post('/api/admin/messages',admin,(q,r)=>{const s=readStore(),body=text(q.body.body);if(!body||!db.prepare('SELECT id FROM users WHERE id=?').get(q.body.memberId))fail('Select a member and enter a message.');s.messages.push({id:id(),memberId:q.body.memberId,from:'coach',body,createdAt:now()});writeStore(s);r.json({ok:true})});
app.patch('/api/admin/checkins/:id',admin,(q,r)=>{const s=readStore(),c=s.checkins.find(c=>c.id===q.params.id);if(!c)fail('Not found.',404);c.reply=text(q.body.reply);writeStore(s);r.json(c)});
app.patch('/api/admin/bookings/:id',admin,(q,r)=>{const s=readStore(),b=s.bookings.find(b=>b.id===q.params.id);if(!b)fail('Not found.',404);const status=choice(q.body.status,['requested','confirmed','completed','cancelled']);if(status==='confirmed'){const start=Date.parse(b.requestedAt),end=start+b.duration*60000;if(start<Date.now())fail('Cannot confirm an appointment in the past.');if(s.bookings.some(other=>other.id!==b.id&&other.status==='confirmed'&&Date.parse(other.requestedAt)<end&&Date.parse(other.requestedAt)+other.duration*60000>start))fail('Another confirmed appointment overlaps this time.',409)}b.status=status;writeStore(s);r.json(b)});
app.post('/api/admin/services',admin,(q,r)=>{const s=readStore(),x=q.body,title=text(x.title,120);if(!title)fail('Title is required.');const v={id:x.id||id(),title,duration:number(x.duration,15,180),price:number(x.price,0,10000),description:text(x.description),active:x.active===true};const i=s.services.findIndex(a=>a.id===v.id);if(i<0)s.services.push(v);else s.services[i]=v;writeStore(s);r.json(v)});
function image(value){if(!value)return '';if(typeof value!=='string'||value.length>2800000||!/^data:image\/(png|jpeg|webp);base64,/.test(value))fail('Use a JPEG, PNG or WebP image under 2 MB.');const b=Buffer.from(value.split(',')[1],'base64');if(!(b[0]===255&&b[1]===216)&&!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&!(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'))fail('Invalid image.');return value}
app.post('/api/admin/transformations',admin,(q,r)=>{const s=readStore(),x=q.body,t={id:x.id||id(),name:text(x.name,100),title:text(x.title,150),story:text(x.story,2500),duration:text(x.duration,100),before:image(x.before),after:image(x.after),consent:x.consent===true,published:x.published===true};if(!t.name||!t.title)fail('Name and title are required.');if(t.published&&(!t.consent||!t.before||!t.after))fail('Before/after photos and recorded permission are required to publish.');const i=s.transformations.findIndex(a=>a.id===t.id);if(i<0)s.transformations.push(t);else s.transformations[i]=t;writeStore(s);r.json({ok:true})});
app.delete('/api/admin/transformations/:id',admin,(q,r)=>{const s=readStore();s.transformations=s.transformations.filter(t=>t.id!==q.params.id);writeStore(s);r.status(204).end()});
app.use('/api',(_q,r)=>r.status(404).json({message:'API route not found.'}));
app.use(express.static(path.resolve('dist')));app.get('/{*path}',(_q,r)=>r.sendFile(path.resolve('dist/index.html')));
app.use((e,_q,r,_next)=>{if(!e.status)console.error(e);r.status(e.status||500).json({message:e.status?e.message:'Server error. Please try again.'})});
const server=app.listen(process.env.PORT||10000,()=>console.log(`Coach platform ready on port ${process.env.PORT||10000}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
