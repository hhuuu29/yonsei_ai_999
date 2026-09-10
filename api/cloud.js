'use strict';
const crypto=require('node:crypto');
const {sanitizeSnapshot,googleBody}=require('../snapshot.js');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function issue(status,code){const error=new Error(code);error.status=status;error.code=code;throw error;}
function createHandler(options={}){
  const limits=new Map();
  return async function handler(req,res){
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Vary','Cookie');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    const rawConfig=options.config||{url:process.env.SUPABASE_URL,anonKey:process.env.SUPABASE_ANON_KEY,
      serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY,origin:process.env.APP_ORIGIN||'https://dotodo-ten.vercel.app'};
    const cfg={...rawConfig,url:String(rawConfig.url||'').trim().replace(/\/$/,'')};
    const fetchImpl=options.fetchImpl||fetch;
    const cookie=Object.fromEntries(String(req.headers.cookie||'').split(';').map(v=>{const p=v.trim().indexOf('=');return p<0?['','']:[v.trim().slice(0,p),v.trim().slice(p+1)];}));
    const extraCookies=[];
    function nonceCookie(value,age){
      extraCookies.push('__Host-dotodo_nonce='+value+'; Max-Age='+age+'; Path=/; HttpOnly; Secure; SameSite=Lax');
      res.setHeader('Set-Cookie',extraCookies);
    }
    function sessionCookies(session){
      const suffix='; Path=/; HttpOnly; Secure; SameSite=Lax';
      res.setHeader('Set-Cookie',[
        '__Host-dotodo_access='+(session?.access_token||'')+'; Max-Age='+(session?Math.min(Number(session.expires_in)||3600,86400):0)+suffix,
        '__Host-dotodo_refresh='+(session?.refresh_token||'')+'; Max-Age='+(session?2592000:0)+suffix,...extraCookies
      ]);
    }
    async function sb(path,{method='GET',body,token,admin=false,headers={}}={}){
      const key=admin?cfg.serviceKey:cfg.anonKey;
      const auth=token||(admin&&!key.startsWith('sb_secret_')?key:null);
      const response=await fetchImpl(cfg.url+path,{method,headers:{apikey:key,...(auth?{Authorization:'Bearer '+auth}:{}),
        'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
      if(!response.ok){
        if(response.status===401)issue(401,'LOGIN_REQUIRED');
        if(response.status===429)issue(429,'RATE_LIMIT');
        if(path.startsWith('/auth/')&&response.status<500)issue(400,'AUTH_FAILED');
        issue(502,'STORAGE_FAILED');
      }
      if(response.status===204)return null;
      const raw=await response.text();return raw?JSON.parse(raw):null;
    }
    async function user(){
      const token=cookie['__Host-dotodo_access'];if(!token)issue(401,'LOGIN_REQUIRED');
      const verified=await sb('/auth/v1/user',{token});
      if(!verified||!UUID.test(verified.id))issue(401,'LOGIN_REQUIRED');
      return {id:verified.id,email:verified.email,token};
    }
    function validId(id){if(!UUID.test(id||''))issue(400,'INVALID_INPUT');return id;}
    function title(value){if(typeof value!=='string'||!value.trim()||value.length>120)issue(400,'INVALID_INPUT');return value.trim();}
    function clean(value){return sanitizeSnapshot(value);}
    async function publicShare(token){
      if(!/^[a-zA-Z0-9_-]{43}$/.test(token||''))issue(404,'LINK_UNAVAILABLE');
      const query=new URLSearchParams({select:'id,title,payload,expires_at',token_hash:'eq.'+crypto.createHash('sha256').update(token).digest('hex'),
        revoked_at:'is.null',expires_at:'gt.'+new Date().toISOString(),limit:'1'});
      const rows=await sb('/rest/v1/dotodo_shares?'+query,{admin:true});
      if(!rows?.length)issue(404,'LINK_UNAVAILABLE');
      return {id:rows[0].id,title:rows[0].title,snapshot:clean(rows[0].payload),expiresAt:rows[0].expires_at};
    }
    try{
      if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');issue(405,'METHOD_NOT_ALLOWED');}
      if(req.method==='POST'&&req.headers.origin!==cfg.origin)issue(403,'ORIGIN_DENIED');
      if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url||'')||!cfg.anonKey||!cfg.serviceKey)issue(503,'NOT_CONFIGURED');
      let body=req.method==='GET'?(req.query||{}):req.body;
      if(typeof body==='string'){if(Buffer.byteLength(body)>200000)issue(413,'TOO_LARGE');try{body=JSON.parse(body);}catch{issue(400,'INVALID_INPUT');}}
      if(!body||Buffer.byteLength(JSON.stringify(body))>200000)issue(413,'TOO_LARGE');
      const action=body.action;
      if(req.method==='GET'&&!['session','list','load','links'].includes(action))issue(405,'METHOD_NOT_ALLOWED');
      const rateKey=String(req.headers['x-forwarded-for']||'unknown').split(',')[0]+':'+action;
      const now=Date.now(),bucket=limits.get(rateKey)||{time:now,count:0};
      if(now-bucket.time>60000){bucket.time=now;bucket.count=0;}
      if(++bucket.count>(['google_verify','google_nonce'].includes(action)?6:60))issue(429,'RATE_LIMIT');
      if(limits.size>4096)limits.clear();limits.set(rateKey,bucket);
      if(action==='google_nonce'){
        const nonce=Date.now()+'.'+crypto.randomBytes(32).toString('base64url');
        nonceCookie(nonce,600);
        return res.status(200).json({nonce:crypto.createHash('sha256').update(nonce).digest('hex')});
      }
      if(action==='google_verify'){
        const nonce=cookie['__Host-dotodo_nonce']||'';
        nonceCookie('',0);
        if(!/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(nonce)||Date.now()-Number(nonce.split('.')[0])>600000||Number(nonce.split('.')[0])>Date.now()||typeof body.credential!=='string'||body.credential.length>12000||!body.credential)issue(400,'GOOGLE_LOGIN_FAILED');
        let session;
        try{session=await sb('/auth/v1/token?grant_type=id_token',{method:'POST',body:{provider:'google',id_token:body.credential,nonce}});}
        catch(error){if(error.status===400||error.status===401)issue(400,'GOOGLE_LOGIN_FAILED');throw error;}
        if(!session?.access_token||!session.refresh_token||!session.user)issue(502,'GOOGLE_LOGIN_FAILED');
        sessionCookies(session);return res.status(200).json({user:{id:session.user.id,email:session.user.email}});
      }
      if(action==='refresh'){
        const refreshToken=cookie['__Host-dotodo_refresh'];if(!refreshToken)issue(401,'LOGIN_REQUIRED');
        const session=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refreshToken}});
        if(!session?.access_token||!session.refresh_token)issue(401,'LOGIN_REQUIRED');
        sessionCookies(session);return res.status(200).json({refreshed:true});
      }
      if(action==='logout'){
        // Clear browser credentials even when the upstream is unavailable.
        sessionCookies(null);
        if(cookie['__Host-dotodo_access'])await sb('/auth/v1/logout?scope=local',{method:'POST',token:cookie['__Host-dotodo_access']});
        return res.status(200).json({signedOut:true});
      }
      if(action==='preview')return res.status(200).json(await publicShare(body.token));
      if(action==='import'){
        const share=await publicShare(body.token);
        if(typeof body.googleAccessToken!=='string'||body.googleAccessToken.length>4096||!body.googleAccessToken)issue(400,'INVALID_INPUT');
        let count=0;
        for(let i=0;i<share.snapshot.events.length;i++){
          const eventBody=googleBody(share.snapshot.events[i]);
          eventBody.id=crypto.createHash('sha256').update('dotodo-share:'+share.id+':'+i).digest('hex');
          let response;
          try{response=await fetchImpl('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',
            headers:{Authorization:'Bearer '+body.googleAccessToken,'Content-Type':'application/json'},body:JSON.stringify(eventBody),signal:AbortSignal.timeout(10000)});}
          catch{return res.status(502).json({error:'IMPORT_FAILED',count});}
          if(!response.ok&&response.status!==409)return res.status(response.status===401?401:502).json({error:response.status===401?'GOOGLE_AUTH':'IMPORT_FAILED',count});
          count++;
        }
        return res.status(200).json({count});
      }
      const me=await user();
      if(action==='session')return res.status(200).json({user:{id:me.id,email:me.email}});
      if(action==='list'||action==='links'){
        const table=action==='list'?'dotodo_records':'dotodo_shares';
        const query=new URLSearchParams({select:action==='list'?'id,title,created_at':'id,title,created_at,expires_at,revoked_at',owner_id:'eq.'+me.id,order:'created_at.desc',limit:'100'});
        return res.status(200).json({items:await sb('/rest/v1/'+table+'?'+query,{token:me.token})});
      }
      if(action==='load'){
        const query=new URLSearchParams({select:'id,title,payload',owner_id:'eq.'+me.id,id:'eq.'+validId(body.id),limit:'1'});
        const rows=await sb('/rest/v1/dotodo_records?'+query,{token:me.token});
        if(!rows?.length)issue(404,'NOT_FOUND');
        return res.status(200).json({id:rows[0].id,title:rows[0].title,snapshot:clean(rows[0].payload)});
      }
      if(action==='save'){
        const id=validId(body.id);
        await sb('/rest/v1/dotodo_records',{method:'POST',token:me.token,headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:{id,owner_id:me.id,title:title(body.title),payload:clean(body.snapshot)}});
        return res.status(200).json({id});
      }
      if(action==='share'){
        const payload=clean(body.snapshot);if(!payload.events.length)issue(400,'EMPTY_SHARE');
        const id=validId(body.id);
        const token=crypto.createHmac('sha256',cfg.serviceKey).update('dotodo-share:'+me.id+':'+id).digest('base64url');
        const expiresAt=new Date(Date.now()+7*86400000).toISOString();
        await sb('/rest/v1/dotodo_shares',{method:'POST',token:me.token,headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:{id,owner_id:me.id,title:title(body.title),payload,
          token_hash:crypto.createHash('sha256').update(token).digest('hex'),expires_at:expiresAt}});
        const existing=await sb('/rest/v1/dotodo_shares?'+new URLSearchParams({select:'expires_at',id:'eq.'+id,owner_id:'eq.'+me.id}),{token:me.token});
        if(!existing?.length)issue(404,'NOT_FOUND');
        return res.status(200).json({id,url:cfg.origin+'/share#'+token,expiresAt:existing[0].expires_at});
      }
      if(action==='remove'||action==='revoke'){
        const table=action==='remove'?'dotodo_records':'dotodo_shares';
        const query=new URLSearchParams({id:'eq.'+validId(body.id),owner_id:'eq.'+me.id,select:'id'});
        const rows=await sb('/rest/v1/'+table+'?'+query,{method:action==='remove'?'DELETE':'PATCH',token:me.token,
          headers:{Prefer:'return=representation'},...(action==='revoke'?{body:{revoked_at:new Date().toISOString()}}:{})});
        if(!rows?.length)issue(404,'NOT_FOUND');return res.status(200).json({done:true});
      }
      issue(400,'INVALID_ACTION');
    }catch(error){
      const status=error.code==='VALIDATION'?400:(error.status||502);
      return res.status(status).json({error:error.code==='VALIDATION'?'INVALID_INPUT':error.status?error.code:'SERVICE_UNAVAILABLE'});
    }
  };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
