const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHandler}=require('../api/cloud.js');
const root=path.resolve(__dirname,'..');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const tables={dotodo_records:[],dotodo_shares:[]},google=new Map();
const config={url:'https://test.supabase.co',anonKey:'test-public',serviceKey:'sb_secret_test'};
const ok=(data,status=200)=>({ok:status<400,status,json:async()=>data,text:async()=>data?JSON.stringify(data):''});
const handler=createHandler({config,fetchImpl:async(url,options)=>{
  const address=new URL(url),body=options.body?JSON.parse(options.body):null;
  if(address.host==='www.googleapis.com'){
    assert.equal(body.description.includes('보내지 않을 항목'),false);
    if(google.has(body.id))return ok({},409);google.set(body.id,body);return ok(body);
  }
  const access=(options.headers.Authorization||'').replace('Bearer ','');
  if(address.pathname==='/auth/v1/otp')return ok({});
  if(address.pathname==='/auth/v1/verify'){
    const i=body.email==='owner@example.test'?0:1;
    return ok({access_token:'access'+i,refresh_token:'refresh'+i,expires_in:3600,user:{id:ids[i],email:body.email}});
  }
  if(address.pathname==='/auth/v1/logout')return ok(null,204);
  if(address.pathname==='/auth/v1/token'){
    if(address.searchParams.get('grant_type')!=='id_token')return ok({},401);
    assert.equal(body.provider,'google');assert.ok(body.nonce);
    const i=body.id_token==='owner-credential'?0:1;
    return ok({access_token:'access'+i,refresh_token:'refresh'+i,expires_in:3600,user:{id:ids[i],email:i?'other@example.test':'owner@example.test'}});
  }
  if(address.pathname==='/auth/v1/user'){
    const i=Number(access.slice(-1));return /^access[01]$/.test(access)?ok({id:ids[i],email:i?'other@example.test':'owner@example.test'}):ok({},401);
  }
  const table=address.pathname.split('/').at(-1),rows=tables[table];assert.ok(rows,'unexpected table '+table);
  if(options.method==='POST'){
    assert.equal(body.owner_id,ids[Number(access.slice(-1))]);
    assert.equal(JSON.stringify(body).includes('PRIVATE_SOURCE_MARKER'),false);
    if(!rows.some(row=>row.id===body.id))rows.push({...body,created_at:new Date().toISOString(),revoked_at:null});
    return ok(null,201);
  }
  const matches=rows.filter(row=>Array.from(address.searchParams).every(([key,value])=>{
    if(['select','limit','order'].includes(key))return true;
    if(value==='is.null')return !row[key];
    if(value.startsWith('eq.'))return row[key]===value.slice(3);
    if(value.startsWith('gt.'))return row[key]>value.slice(3);
    throw Error('unhandled filter '+key);
  }));
  if(options.method==='PATCH')matches.forEach(row=>Object.assign(row,body));
  if(options.method==='DELETE')tables[table]=rows.filter(row=>!matches.includes(row));
  return ok(matches);
}});
const files=['index.html','app.css','cloud.css','snapshot.js','cloud-client.js','share.html','share.js','google-calendar.js','calendar-manager.js','ui.js','llm-extractor.js','chat-assistant.js'];
const server=http.createServer(async(req,res)=>{
  const address=new URL(req.url,'http://local');
  if(address.pathname==='/api/cloud'){
    let raw='';for await(const chunk of req)raw+=chunk;
    req.body=raw?JSON.parse(raw):undefined;req.query=Object.fromEntries(address.searchParams);
    res.status=n=>{res.statusCode=n;return res;};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
    return handler(req,res);
  }
  const file=address.pathname==='/'?'index.html':address.pathname==='/share'?'share.html':address.pathname.slice(1);
  if(!files.includes(file))return res.writeHead(404).end();
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root,file)));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    await context.route('https://accounts.google.com/**',route=>route.abort());
    await context.route('**/api/config',route=>route.fulfill({json:{googleClientId:'test.apps.googleusercontent.com'}}));
    await context.addInitScript(()=>{window.google={accounts:{oauth2:{initTokenClient(config){return {requestAccessToken(){config.callback({access_token:'fake-google',expires_in:3600});}};}}}};});
    await context.addInitScript(()=>{
      window.testGoogleCredential='owner-credential';let settings;
      window.google.accounts.id={initialize(value){settings=value;},renderButton(target){
        const button=document.createElement('button');button.textContent='Google 계정으로 계속하기';
        button.onclick=()=>settings.callback({credential:window.testGoogleCredential});target.appendChild(button);
      }};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/gemini',route=>route.fulfill({json:{candidates:[{content:{parts:[{text:JSON.stringify({events:[{title:'가상 회의',confidence:0.95,start:'2026-09-10T09:00:00+09:00',end:'2026-09-10T10:00:00+09:00',audience:'all',sourceMsgIndex:0,checklist:[{text:'노트',audience:'all',sourceMsgIndex:0},{text:'보내지 않을 항목',audience:'all',sourceMsgIndex:0}]}],todos:[],teams:[],summary:'가상 일정입니다.'})}]}}]}}));
    await page.goto(config.origin);
    await page.evaluate(()=>DoToDoUI.processChat('PRIVATE_SOURCE_MARKER\n회의는 9월 10일 오전 9시입니다.','가상 회의.txt'));
    assert.equal(await page.locator('#btnSaveCloud').isDisabled(),false,await page.locator('#chat').innerText());
    await page.locator('#btnSaveCloud').click();
    const dialog=page.getByRole('dialog',{name:'일정을 내 계정에 보관하기'});
    await dialog.getByRole('button',{name:'Google 계정으로 계속하기'}).click();
    const panel=page.locator('.cloud-panel');
    await panel.getByRole('button',{name:'이 내용으로 저장',exact:true}).click();
    await panel.getByText('내 보관함에 저장했어요.').waitFor();
    assert.equal(tables.dotodo_records.length,1);
    assert.equal(await page.evaluate(()=>document.cookie.includes('dotodo_access')),false);
    assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('access0')),false);
    await panel.getByRole('button',{name:'닫기',exact:true}).click();
    await page.locator('#btnShare').click();
    await panel.getByLabel('보내지 않을 항목',{exact:true}).uncheck();
    await panel.getByRole('button',{name:'이 내용으로 공유 링크 만들기'}).click();
    const link=await panel.getByLabel('공유 링크',{exact:true}).inputValue();
    assert.equal(tables.dotodo_shares.length,1);
    assert.equal(tables.dotodo_shares[0].payload.events[0].checklist.length,1);
    const friendContext=await browser.newContext();
    await friendContext.route('https://accounts.google.com/**',route=>route.abort());
    await friendContext.route('**/api/config',route=>route.fulfill({json:{googleClientId:'test.apps.googleusercontent.com'}}));
    await friendContext.addInitScript(()=>{window.google={accounts:{oauth2:{initTokenClient(config){return {requestAccessToken(){config.callback({access_token:'friend-google',expires_in:3600});}};}}}};});
    const friend=await friendContext.newPage();await friend.goto(link);
    await friend.getByRole('heading',{name:'가상 회의',exact:true}).waitFor();
    assert.equal((await friend.locator('body').innerText()).includes('보내지 않을 항목'),false);
    for(let i=0;i<2;i++){
      await friend.getByRole('button',{name:'내 Google 캘린더에 추가'}).click();
      await friend.getByText('1개 일정을 내 Google 캘린더에서 확인할 수 있어요.').waitFor();
    }
    assert.equal(google.size,1);
    await panel.getByRole('button',{name:'공유 링크 관리'}).click();
    page.once('dialog',popup=>popup.accept());await panel.getByRole('button',{name:'링크 해제'}).click();
    await panel.getByText('만료 또는 해제됨').waitFor();
    await friend.reload();await friend.getByText('만료되었거나 해제된 공유 링크예요.').waitFor();
    assert.equal(await friend.getByRole('button',{name:'내 Google 캘린더에 추가'}).isDisabled(),true);
    await page.reload();await page.locator('#openLibrary').click();
    await panel.getByRole('button',{name:'내용 보기'}).click();
    page.once('dialog',popup=>popup.accept());await panel.getByRole('button',{name:'일정판에서 열기'}).click();
    await page.getByText('보관함의 일정과 할 일을 열었어요. 원문 대화는 저장하지 않아 근거를 다시 확인할 수 없어요.').waitFor();
    await page.locator('#openLibrary').click();await panel.getByRole('button',{name:'로그아웃',exact:true}).click();
    await page.evaluate(()=>window.testGoogleCredential='other-credential');
    await panel.getByRole('button',{name:'Google 계정으로 계속하기'}).click();
    await panel.getByText(/아직 저장한 일정이 없어요/).waitFor();
    const denied=await page.evaluate(async id=>{const response=await fetch('/api/cloud?action=load&id='+id);return response.status;},tables.dotodo_records[0].id);
    assert.equal(denied,404);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    if(process.env.DOTODO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DOTODO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DOTODO_SCREENSHOT_DIR,'cloud-mobile.png')});}
    assert.deepEqual(errors,[]);
    console.log('PASS cloud: real handlers with mocked upstream; Google login cookies, save/reload, field exclusion, unauthenticated share, idempotent import, revoke, logout and account isolation');
    await friendContext.close();await context.close();
  }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
