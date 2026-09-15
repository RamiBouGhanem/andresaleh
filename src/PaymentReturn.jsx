import React,{useEffect,useState} from 'react';
import {Check,X,Loader,ArrowRight} from 'lucide-react';
import {api} from './Care';

// This page never trusts the query string a payment provider redirects back
// with (?order=...&cancelled=1) as proof of payment — anyone could type
// that URL by hand. It only shows what it gets from GET /api/orders/:id/status,
// which makes the server re-check the payment directly with the provider
// before saying "paid". If the webhook already confirmed it, this resolves
// on the first check; otherwise it polls for a few seconds.
export default function PaymentReturn(){
 const params=new URLSearchParams(location.search);
 const orderId=params.get('order');
 const cancelled=params.get('cancelled')==='1';
 const [status,setStatus]=useState(cancelled?'cancelled':'checking');
 const [detail,setDetail]=useState(null);
 const [error,setError]=useState('');
 const back=sessionStorage.getItem('coach_checkout_return')||'/member';

 useEffect(()=>{
  if(cancelled||!orderId){if(!orderId&&!cancelled)setError('Missing order reference.');return}
  let stop=false,attempts=0;
  const poll=async()=>{
   try{
    const d=await api('/orders/'+orderId+'/status');
    setDetail(d);
    if(d.status==='paid'){setStatus('paid');return}
    if(['failed','cancelled'].includes(d.status)){setStatus('failed');return}
   }catch(e){setError(e.message)}
   attempts++;
   if(!stop&&attempts<15)setTimeout(poll,2000);
   else if(!stop)setStatus(s=>s==='checking'?'timeout':s);
  };
  poll();
  return()=>{stop=true};
 },[orderId,cancelled]);

 return <main className="member-shell auth-care payment-return">
  {status==='checking'&&<><Loader className="spin"/><h1>Confirming your payment…</h1><p>Please don’t close this page. This can take a few seconds.</p></>}
  {status==='paid'&&<><div className="success-icon"><Check size={28}/></div><h1>Payment confirmed.</h1><p>{detail?.itemTitle?`Access to ${detail.itemTitle} is unlocked.`:'Access has been unlocked.'} Your coach has been notified.</p><a className="primary-btn" href={back}>Continue <ArrowRight size={16}/></a></>}
  {status==='failed'&&<><div className="fail-icon"><X size={28}/></div><h1>Payment didn’t go through.</h1><p>No charge was completed. You can try again or choose a different payment method.</p><a className="primary-btn" href={back}>Back <ArrowRight size={16}/></a></>}
  {status==='cancelled'&&<><h1>Payment cancelled.</h1><p>You closed the payment page before finishing. Nothing was charged.</p><a className="primary-btn" href={back}>Back <ArrowRight size={16}/></a></>}
  {status==='timeout'&&<><h1>Still confirming…</h1><p>This is taking longer than usual. If your card was charged, it will appear shortly — check your member area, or contact your coach with your reference.</p><a className="primary-btn" href={back}>Back <ArrowRight size={16}/></a></>}
  {error&&<p role="alert">{error}</p>}
 </main>;
}
