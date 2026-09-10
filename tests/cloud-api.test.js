const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../api/cloud.js');
const {sanitizeSnapshot}=require('../snapshot.js');
const crypto=require('node:crypto');
const userId='11111111-1111-4111-8111-111111111111';
const shareId='22222222-2222-4222-8222-222222222222';
const event={title:'회의',start:'2026-09-10T09:00:00+09:00',end:'2026-09-10T10:00:00+09:00',location:'서울',checklist:['노트']};
const snapshot={events:[event],todos:[{text:'자료 준비',done:false}]};
const config={url:'https://example.supabase.co',anonKey:'public',serviceKey:'sb_secret_test',origin:'https://dotodo.test'};
const ok=(data,status=200)=>({ok:status<400,status,json:async()=>data,text:async()=>JSON.stringify(data)});
async function call(handler,body,method='POST',cookie='__Host-dotodo_access=user-token',origin=config.origin){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await handler({method,headers:{origin,cookie},body,query:method==='GET'?body:{}},res);return res;
}
test('사본은 허용된 필드만 저장하고 원문·키·대상을 제거한다',()=>{
  const clean=sanitizeSnapshot({...snapshot,raw:'private',apiKey:'secret',events:[{...event,sourceText:'private',attendees:['secret'],audience:['홍길동']}]});
  assert.deepEqual(clean,snapshot);
  assert.throws(()=>sanitizeSnapshot({events:[{...event,end:event.start}],todos:[]}));
  assert.throws(()=>sanitizeSnapshot({events:[{...event,start:'2026-02-30'}],todos:[]}));
});
test('설정 없음은 503이며 인증정보나 상위 오류를 노출하지 않는다',async()=>{
  const res=await call(createHandler({config:{},fetchImpl:()=>{throw Error('secret');}}),{action:'session'},'GET');
  assert.equal(res.code,503);assert.equal(JSON.stringify(res.body).includes('secret'),false);
});
test('다른 Origin의 쓰기와 비로그인 저장을 거절한다',async()=>{
  const handler=createHandler({config,fetchImpl:()=>{throw Error('must not call');}});
  assert.equal((await call(handler,{action:'save',snapshot},'POST','','https://evil.test')).code,403);
  assert.equal((await call(handler,{action:'save',snapshot},'POST','')).code,401);
});
test('이메일 인증은 HttpOnly Secure 쿠키에만 세션을 담는다',async()=>{
  const handler=createHandler({config,fetchImpl:async()=>ok({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600,user:{id:userId,email:'me@example.test'}})});
  const res=await call(handler,{action:'verify',email:'me@example.test',code:'123456'},'POST','');
  assert.equal(res.code,200);
  assert.equal(JSON.stringify(res.body).includes('private-'),false);
  assert.match(res.headers['Set-Cookie'][0],/HttpOnly; Secure; SameSite=Lax/);
});
test('사용자 ID는 요청 본문이 아닌 검증된 로그인에서 가져온다',async()=>{
  const requests=[];
  const handler=createHandler({config,fetchImpl:async(url,options)=>{
    requests.push({url,options});
    return url.endsWith('/user')?ok({id:userId,email:'me@example.test'}):ok([{id:shareId}]);
  }});
  const res=await call(handler,{action:'save',id:shareId,title:'내 일정',snapshot,owner_id:'attacker'});
  assert.equal(res.code,200);
  const saved=JSON.parse(requests[1].options.body);
  assert.equal(saved.owner_id,userId);
  assert.equal(requests[1].options.headers.Authorization,'Bearer user-token');
});
test('공유 조회는 해시·만료·해제 조건을 적용하고 공개 사본만 반환한다',async()=>{
  const token='a'.repeat(43);let lookup;
  const handler=createHandler({config,fetchImpl:async(url)=>{
    lookup=new URL(url);return ok([{id:shareId,title:'공유',payload:snapshot,expires_at:'2099-01-01T00:00:00Z',owner_id:'private-owner'}]);
  }});
  const res=await call(handler,{action:'preview',token},'POST','');
  assert.equal(res.code,200);
  assert.equal(lookup.searchParams.get('token_hash'),'eq.'+crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(lookup.searchParams.get('revoked_at'),'is.null');
  assert.match(lookup.searchParams.get('expires_at'),/^gt\./);
  assert.equal('owner_id' in res.body,false);
  assert.deepEqual(res.body.snapshot,snapshot);
});
test('해제된 링크로는 Google 등록 요청을 보내지 않는다',async()=>{
  let count=0;
  const handler=createHandler({config,fetchImpl:async()=>{count++;return ok([]);}});
  const res=await call(handler,{action:'import',token:'a'.repeat(43),googleAccessToken:'google-token'},'POST','');
  assert.equal(res.code,404);assert.equal(count,1);
});
test('공유 등록 재시도는 일정별 고정 ID로 중복을 막고 원문을 보내지 않는다',async()=>{
  const ids=[];
  const handler=createHandler({config,fetchImpl:async(url,options)=>{
    if(url.includes('supabase'))return ok([{id:shareId,title:'공유',payload:snapshot,expires_at:'2099-01-01T00:00:00Z'}]);
    const body=JSON.parse(options.body); ids.push(body.id);assert.equal(body.description,'챙길 것\n• 노트');
    return ok({},409);
  }});
  for(let i=0;i<2;i++){
    const res=await call(handler,{action:'import',token:'a'.repeat(43),googleAccessToken:'google-token'},'POST','');
    assert.equal(res.code,200);assert.equal(res.body.count,1);
  }
  assert.equal(ids[0],ids[1]);assert.match(ids[0],/^[0-9a-f]{64}$/);
});

test('공유 생성 재시도는 같은 링크를 반환하고 토큰 원문을 DB에 저장하지 않는다',async()=>{
  const writes=[];
  const handler=createHandler({config,fetchImpl:async(url,options)=>{
    if(url.endsWith('/user'))return ok({id:userId,email:'me@example.test'});
    if(options.method==='POST'){writes.push(JSON.parse(options.body));assert.match(options.headers.Prefer,/ignore-duplicates/);return ok(null,201);}
    return ok([{expires_at:'2099-01-01T00:00:00Z'}]);
  }});
  const a=await call(handler,{action:'share',id:shareId,title:'공유',snapshot});
  const b=await call(handler,{action:'share',id:shareId,title:'공유',snapshot});
  assert.equal(a.code,200);assert.equal(a.body.url,b.body.url);
  const token=new URL(a.body.url).hash.slice(1);
  assert.equal(writes[0].token_hash,crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(JSON.stringify(writes).includes(token),false);
});

test('갱신은 서버 쿠키만 교체하며 탈취한 본문 사용자 ID를 신뢰하지 않는다',async()=>{
  const handler=createHandler({config,fetchImpl:async(url,options)=>{
    assert.match(url,/grant_type=refresh_token/);
    assert.equal(JSON.parse(options.body).refresh_token,'cookie-refresh');
    return ok({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600});
  }});
  const res=await call(handler,{action:'refresh',refresh_token:'ignored'},'POST','__Host-dotodo_refresh=cookie-refresh');
  assert.equal(res.code,200);assert.deepEqual(res.body,{refreshed:true});
  assert.match(res.headers['Set-Cookie'][1],/new-refresh/);
});

test('잘못된 액세스 토큰은 사용자 조회 실패 후 저장 요청 없이 거절된다',async()=>{
  let count=0;
  const handler=createHandler({config,fetchImpl:async()=>{count++;return ok({},401);}});
  const res=await call(handler,{action:'save',id:shareId,title:'사본',snapshot});
  assert.equal(res.code,401);assert.equal(count,1);
});

test('큰 요청과 GET을 이용한 상태 변경은 거절한다',async()=>{
  const handler=createHandler({config,fetchImpl:()=>{throw Error('must not run');}});
  assert.equal((await call(handler,{action:'save',padding:'a'.repeat(200001)})).code,413);
  assert.equal((await call(handler,{action:'logout'},'GET')).code,405);
});
