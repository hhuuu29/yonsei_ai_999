const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const allowed = ['index.html','app.css','cloud.css','snapshot.js','cloud-client.js','ui.js','llm-extractor.js','chat-assistant.js','google-calendar.js','calendar-manager.js'];
const server = http.createServer((req,res)=>{
  const file = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (!allowed.includes(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root,file)));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://accounts.google.com/**',route=>route.abort());
    await page.route('**/api/config',route=>route.fulfill({json:{googleClientId:'test.apps.googleusercontent.com'}}));
    await page.addInitScript(()=>{
      window.google={accounts:{oauth2:{initTokenClient(config){return {requestAccessToken(){config.callback({access_token:'test',expires_in:3600});}};}}}};
    });
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    let rows=[{id:'fixture',etag:'"v1"',summary:'디자인 회의',organizer:{self:true},start:{dateTime:today+'T09:00:00+09:00'},end:{dateTime:today+'T10:00:00+09:00'}}];
    let patches=0,deletes=0,posts=0,conflict=false,failCreate=true;
    await page.route('https://www.googleapis.com/calendar/v3/**',async route=>{
      const req=route.request(), method=req.method();
      if(method==='GET') return route.fulfill({json:{items:rows}});
      if(method==='PATCH') {
        patches++;
        assert.equal(req.headers()['if-match'],'"v1"');
        if(conflict) return route.fulfill({status:412,json:{}});
        rows[0]={...rows[0],...req.postDataJSON()}; return route.fulfill({json:rows[0]});
      }
      if(method==='POST') {
        posts++;
        if(failCreate){failCreate=false;return route.abort();}
        const body=req.postDataJSON(); rows.push({...body,etag:'"v1"'}); return route.fulfill({json:rows.at(-1)});
      }
      if(method==='DELETE'){deletes++;rows=rows.filter(row=>!req.url().endsWith(row.id));return route.fulfill({status:204});}
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.locator('#openCalendar').count(),1, await page.locator('body').innerText());
    await page.getByRole('button',{name:'캘린더',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'내 캘린더'});
    await dialog.getByRole('button',{name:'Google 연결 · 새로고침'}).click();
    await dialog.getByRole('button',{name:/디자인 회의/}).click();
    await dialog.getByLabel('제목',{exact:true}).fill('변경된 회의');
    await dialog.getByRole('button',{name:'Google에 저장'}).click();
    await dialog.getByRole('button',{name:/변경된 회의/}).waitFor();
    assert.equal(patches,1);
    conflict=true;
    await dialog.getByRole('button',{name:/변경된 회의/}).click();
    await dialog.getByLabel('제목',{exact:true}).fill('덮어쓰면 안 됨');
    await dialog.getByRole('button',{name:'Google에 저장'}).click();
    await dialog.getByText(/다른 곳에서 일정이 변경됐어요/).waitFor();
    assert.equal(rows[0].summary,'변경된 회의');
    await dialog.getByRole('button',{name:'취소',exact:true}).click();
    await dialog.getByRole('button',{name:'+ 일정 만들기',exact:true}).click();
    await dialog.getByLabel('제목',{exact:true}).fill('새 약속');
    await dialog.getByRole('button',{name:'Google에 저장'}).click();
    await dialog.getByText(/완료 여부를 확인하지 못했어요/).waitFor();
    assert.equal(await dialog.getByLabel('제목',{exact:true}).isDisabled(),true);
    await dialog.getByRole('button',{name:'Google에 저장'}).click();
    await dialog.getByRole('button',{name:/새 약속/}).waitFor();
    assert.equal(posts,2); assert.equal(rows.length,2);
    await dialog.getByRole('button',{name:/새 약속/}).click();
    page.once('dialog',popup=>popup.dismiss());
    await dialog.getByRole('button',{name:'일정 삭제'}).click();
    assert.equal(deletes,0);
    page.once('dialog',popup=>popup.accept());
    await dialog.getByRole('button',{name:'일정 삭제'}).click();
    await dialog.getByText('Google 캘린더에서 삭제했어요.').waitFor();
    assert.equal(deletes,1); assert.equal(rows.length,1);
    await dialog.getByRole('button',{name:'+ 일정 만들기',exact:true}).click();
    await dialog.getByLabel('제목',{exact:true}).fill('하루 일정');
    await dialog.getByLabel('하루 종일',{exact:true}).check();
    await dialog.getByRole('button',{name:'Google에 저장'}).click();
    await dialog.getByRole('button',{name:/하루 일정/}).waitFor();
    assert.equal(rows.at(-1).start.date,today);
    assert.ok(rows.at(-1).end.date>today);
    rows[0].attendees=[{email:'guest@example.test'}];
    await dialog.getByRole('button',{name:'Google 연결 · 새로고침'}).click();
    await dialog.getByRole('button',{name:/변경된 회의/}).click();
    await dialog.getByText(/참석자가 있는 일정/).waitFor();
    assert.equal(await dialog.getByRole('button',{name:'Google에 저장'}).count(),0);
    await dialog.locator('.cm-editor').getByRole('button',{name:'닫기',exact:true}).click();
    if(process.env.DOTODO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DOTODO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DOTODO_SCREENSHOT_DIR,'calendar-desktop.png')});}
    await page.setViewportSize({width:390,height:844});
    assert.equal(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    if(process.env.DOTODO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DOTODO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DOTODO_SCREENSHOT_DIR,'calendar-mobile.png')});}
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'openCalendar');
    // A fresh browser session must handle declined consent without calendar reads/writes.
    await page.reload();
    await page.evaluate(()=>{window.google.accounts.oauth2.initTokenClient=config=>({requestAccessToken(){config.error_callback({type:'popup_closed'});}});});
    await page.getByRole('button',{name:'캘린더',exact:true}).click();
    await dialog.getByRole('button',{name:'Google 연결 · 새로고침'}).click();
    await dialog.getByText(/Google 연결을 완료하지 못했어요/).waitFor();
    assert.equal(await dialog.getByRole('button',{name:'+ 일정 만들기',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('Calendar browser: read, edit, conflict, create retry, delete cancel/confirm, mobile and focus passed');
  } finally {if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
