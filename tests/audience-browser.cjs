// Run with Playwright available in NODE_PATH: node tests/audience-browser.cjs
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (!['index.html', 'app.css', 'llm-extractor.js', 'ui.js', 'chat-assistant.js', 'google-calendar.js', 'data/trainthon-pc.txt'].includes(file)) {
    res.writeHead(404).end(); return;
  }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root, file)));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const downloads = [];
    page.on('download', download => downloads.push(download));
    await page.route('**/api/config', route => route.fulfill({ json: { googleClientId: 'service-client.apps.googleusercontent.com' } }));
    await page.addInitScript(() => {
      window.google = { accounts: { oauth2: { initTokenClient(options) {
        window.calendarOAuthOptions = options;
        return { requestAccessToken() { window.calendarOAuthRequested = true; } };
      } } } };
    });
    let calendarPosts = 0;
    await page.route('https://www.googleapis.com/calendar/v3/**', route => {
      if (route.request().method() === 'POST') calendarPosts++;
      return route.fulfill({ json: route.request().method() === 'POST' ? { id: 'created', htmlLink: 'https://calendar.google.com/calendar/r' } : { items: [] } });
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://accounts.google.com/**', route => route.abort());
    let assistantPrompt = '';
    let extractionGate = null;
    await page.route('**/api/gemini', async route => {
      assert.equal(route.request().headers()['x-goog-api-key'], undefined);
      const body = route.request().postDataJSON();
      let result;
      if (body.systemInstruction) {
        assistantPrompt = body.systemInstruction.parts[0].text;
        result = { reply: '명찰 안내를 확인하세요.', sourceMsgIndexes: [], actions: [], suggestedQuestions: ['기차 시간은?', '다른 준비물은?'] };
      } else {
        if (extractionGate) await extractionGate;
        const prompt = body.contents[0].parts[0].text;
        const messages = JSON.parse(prompt.split('\n메시지:\n')[1].split('\n\n룰 파서 후보:')[0]);
        const badge = messages.findIndex(m => m.text.includes('[명찰 지참 대상]'));
        const hoodie = messages.findIndex(m => m.text.includes('대상자: 강지민'));
        const latest = messages.findIndex(m => m.text.includes('명찰은 짐이'));
        // Hand-checked fixture from the source; this tests integration, not live model accuracy.
        result = { events: [{ title: '서울역 집합', start: '2026-09-09T08:30:00+09:00', end: '2026-09-09T08:57:00+09:00',
          audience: 'all', sourceMsgIndex: latest, checklist: [
            { text: '명찰 지참 대상: 기차 안 배부로 변경', audience: ['신현우', '강다영'], sourceMsgIndex: latest, audienceSourceMsgIndexes: [badge] },
            { text: '후드집업 수령 대상', audience: ['강지민', '이지연', '김준서', '이지상'], sourceMsgIndex: hoodie }
          ] }], todos: [], teams: [], summary: '일정을 정리했어요.' };
      }
      await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] } });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    assert.equal(await page.locator('#googleClientIdInput').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('dotodo.geminiApiKey')), null);
    await page.reload();
    await page.route('**/data/trainthon-pc.txt', route => route.fulfill({ status: 404, body: '' }));
    await page.getByRole('button', { name: '데모: 트레인톤 단톡방 불러오기', exact: true }).click();
    await page.getByText('데모 파일을 불러오지 못했어요. 다시 눌러주세요.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '데모: 트레인톤 단톡방 불러오기', exact: true }).isEnabled(), true);
    await page.unroute('**/data/trainthon-pc.txt');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = await page.locator('.compose .att, .compose .in, .compose .send').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
      assert.deepEqual(heights, [44, 44, 44]);
      if (process.env.DOTODO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.DOTODO_SCREENSHOT_DIR, 'welcome-' + width + '.png') });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const file of ['trainthon-pc.txt', 'trainthon-mobile.txt']) {
      let release;
      extractionGate = new Promise(resolve => { release = resolve; });
      if (file === 'trainthon-pc.txt') {
        await page.getByRole('button', { name: '데모: 트레인톤 단톡방 불러오기', exact: true }).click();
      } else {
        await page.locator('#fileInput').setInputFiles(path.join(root, 'data', file));
      }
      await page.getByText(`${file === 'trainthon-pc.txt' ? 36 : 26}개 메시지 읽는 중…`, { exact: true }).waitFor();
      assert.equal(await page.locator('#extractionLoading i').count(), 3);
      release();
      extractionGate = null;
      await page.getByText('AI 정제가 끝났어요.', { exact: true }).waitFor();
      assert.equal(await page.locator('#extractionLoading').count(), 0);
      await page.getByText('이 방에서 당신은 누구예요?', { exact: true }).waitFor();
      assert.ok(await page.locator('.identity-chips button').count() > 0);
      await page.locator('#identityName').fill('신현우');
      await page.locator('.identity-form').getByRole('button', { name: '선택', exact: true }).click();
      const mine = page.locator('[data-audience-layer="나에게 해당"]');
      const other = page.locator('[data-audience-layer="전체 공지"]');
      assert.match(await mine.innerText(), /명찰 지참 대상/);
      assert.doesNotMatch(await mine.innerText(), /후드집업 수령 대상/);
      assert.match(await other.innerText(), /후드집업 수령 대상/);
      await mine.locator('.board-checklist summary').click();
      assert.ok(await mine.locator('mark.my-name').count() >= 1);
      assert.equal(await page.locator('#identityButton').innerText(), '나: 신현우');
      if (process.env.DOTODO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.DOTODO_SCREENSHOT_DIR, 'result-' + file + '.png') });
      assert.equal(await page.evaluate(() => localStorage.getItem('dotodo.userName')), '신현우');
    }
    await page.locator('#composerInput').fill('나는 무엇을 챙겨?');
    await page.locator('#sendButton').click();
    await page.getByText('명찰 안내를 확인하세요.', { exact: true }).waitFor();
    assert.match(assistantPrompt, /사용자 이름: 신현우/);
    await page.locator('#identityButton').click();
    await page.getByRole('button', { name: '이름 없이 전체 보기', exact: true }).click();
    assert.equal(await page.locator('.audience-layer').count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#openBoard').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#closeBoard').click();
    await page.locator('#identityButton').click();
    await page.locator('.identity-chips button').first().click();
    const selected = await page.locator('#identityButton').innerText();
    await page.reload();
    assert.equal(await page.locator('#identityButton').innerText(), selected);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: '데모: 트레인톤 단톡방 불러오기', exact: true }).click();
    await page.getByText('AI 정제가 끝났어요.', { exact: true }).waitFor();
    await page.locator('#board input[type=checkbox]').first().check();
    await page.locator('#btnGoogle').click();
    assert.equal(await page.evaluate(() => window.calendarOAuthOptions.client_id), 'service-client.apps.googleusercontent.com');
    assert.equal(calendarPosts, 0);
    assert.equal(await page.locator('#btnGoogle').isDisabled(), true);
    await page.evaluate(() => window.calendarOAuthOptions.callback({ access_token: 'fixture-token', expires_in: 3600 }));
    await page.getByText('1개를 Google Calendar에 추가했어요.', { exact: true }).waitFor();
    assert.equal(calendarPosts, 1);
    assert.equal(downloads.length, 0);
    await page.reload();
    await page.getByRole('button', { name: '데모: 트레인톤 단톡방 불러오기', exact: true }).click();
    await page.getByText('AI 정제가 끝났어요.', { exact: true }).waitFor();
    await page.locator('#board input[type=checkbox]').first().check();
    await page.locator('#btnGoogle').click();
    await page.evaluate(() => window.calendarOAuthOptions.error_callback({ type: 'popup_closed' }));
    await page.getByText('Google 연결이 취소됐어요. 다시 누르면 계정을 연결할 수 있어요.', { exact: true }).waitFor();
    assert.equal(calendarPosts, 1);
    assert.equal(downloads.length, 0);
    await page.reload();
    await page.route('**/api/gemini', route => route.fulfill({ status: 429, body: '{}' }));
    await page.getByRole('button', { name: '데모: 트레인톤 단톡방 불러오기', exact: true }).click();
    await page.getByText('잠시 후 다시 시도', { exact: true }).waitFor();
    assert.equal(await page.locator('#extractionLoading').count(), 0);
    assert.ok(await page.locator('#chat .event-stack .ev').count() > 0);
    assert.deepEqual(errors, []);
    console.log('PASS: demo fetch/retry, 44px composer, extraction loading/success/429 fallback, both exports, identity, board layers, evidence, mobile');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
