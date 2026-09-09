// Run with Playwright available in NODE_PATH: node tests/audience-browser.cjs
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (!['index.html', 'llm-extractor.js', 'ui.js', 'chat-assistant.js', 'google-calendar.js'].includes(file)) {
    res.writeHead(404).end(); return;
  }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root, file)));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://accounts.google.com/**', route => route.abort());
    let assistantPrompt = '';
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      const body = route.request().postDataJSON();
      let result;
      if (body.systemInstruction) {
        assistantPrompt = body.systemInstruction.parts[0].text;
        result = { reply: '명찰 안내를 확인하세요.', sourceMsgIndexes: [], actions: [], suggestedQuestions: ['기차 시간은?', '다른 준비물은?'] };
      } else {
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
    await page.evaluate(() => localStorage.setItem('dotodo.geminiApiKey', 'fixture-key'));
    await page.reload();
    for (const file of ['trainthon-pc.txt', 'trainthon-mobile.txt']) {
      await page.locator('#fileInput').setInputFiles(path.join(root, 'data', file));
      await page.getByText('AI 정제가 끝났어요.', { exact: true }).waitFor();
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
    assert.deepEqual(errors, []);
    console.log('PASS: both exports, name picker/storage/change/clear, board layers, evidence highlight, assistant identity, mobile layout');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
