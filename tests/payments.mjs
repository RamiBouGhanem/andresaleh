import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {providers} from '../backend/payments.js';

const originalFetch=globalThis.fetch;
const originalWebhook=process.env.STRIPE_WEBHOOK_SECRET;
const order={id:'order-fixture',amount:120,currency:'USD'};
const valid={payment_status:'paid',status:'complete',mode:'payment',amount_total:12000,currency:'usd',client_reference_id:order.id,metadata:{orderId:order.id}};
try{
 for(const [field,value] of [['amount_total',100],['currency','eur'],['client_reference_id','other-order'],['metadata',{orderId:'other-order'}],['status','open'],['mode','subscription']]){
  globalThis.fetch=async()=>({ok:true,json:async()=>({...valid,[field]:value})});
  assert.equal((await providers.stripe.verify({providerRef:'cs_test_fixture123',order})).status,'pending',field+' must not unlock access');
 }
 globalThis.fetch=async()=>({ok:true,json:async()=>valid});
 assert.equal((await providers.stripe.verify({providerRef:'cs_test_fixture123',order})).status,'paid');
 globalThis.fetch=async()=>({ok:true,json:async()=>({status:'expired',payment_status:'unpaid'})});
 assert.equal((await providers.stripe.verify({providerRef:'cs_test_fixture123',order})).status,'failed');
 process.env.STRIPE_WEBHOOK_SECRET='local-test-webhook-secret';
 const raw=JSON.stringify({type:'checkout.session.completed',data:{object:{metadata:{orderId:order.id}}}});
 const timestamp=Math.floor(Date.now()/1000);
 const sign=(t,body)=>`t=${t},v1=${crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex')}`;
 assert.equal(providers.stripe.verifyWebhook(raw,sign(timestamp,raw)).orderId,order.id);
 assert.equal(providers.stripe.verifyWebhook(raw+' ',sign(timestamp,raw)),null);
 assert.equal(providers.stripe.verifyWebhook(raw,sign(timestamp-600,raw)),null);
 assert.equal(providers.whish.configured(),false);
 console.log('PASS: online payment amount, currency, order identity and session checks; webhook signatures and replay window; Whish fail-closed behavior');
}finally{
 globalThis.fetch=originalFetch;
 if(originalWebhook===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=originalWebhook;
}
