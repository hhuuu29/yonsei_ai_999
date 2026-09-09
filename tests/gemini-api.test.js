const test = require('node:test');
const assert = require('node:assert/strict');

test('서버 키로 Gemini를 호출하고 클라이언트에는 키를 반환하지 않는다', async () => {
  const { createHandler } = require('../api/gemini.js');
  let request;
  const handler = createHandler({ apiKey: 'server-secret', fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"events":[],"todos":[]}' }] } }] }) };
  } });
  const res = response();
  await handler({ method: 'POST', headers: { host: 'example.com', origin: 'https://example.com' }, body: { contents: [{ parts: [{ text: '일정 추출' }] }], generationConfig: { maxOutputTokens: 999999 } } }, res);
  assert.equal(res.code, 200);
  assert.equal(request.options.headers['x-goog-api-key'], 'server-secret');
  assert.equal(JSON.parse(request.options.body).generationConfig.maxOutputTokens, 16384);
  assert.ok(!JSON.stringify(res.body).includes('server-secret'));
});

test('미설정·외부 origin·과대 요청·429를 처리하고 상위 에러 비밀을 숨긴다', async () => {
  const { createHandler } = require('../api/gemini.js');
  const body = { contents: [{ parts: [{ text: 'hi' }] }] };
  const base = { method: 'POST', headers: { host: 'example.com', origin: 'https://example.com' }, body };
  const absent = response();
  await createHandler({ apiKey: '' })(base, absent);
  assert.equal(absent.code, 503);
  let called = false;
  const handler = createHandler({ apiKey: 'secret', fetchImpl: async () => { called = true; return { ok: false, status: 429 }; } });
  const foreign = response();
  await handler({ ...base, headers: { ...base.headers, origin: 'https://evil.example' } }, foreign);
  assert.equal(foreign.code, 403);
  assert.equal(called, false);
  const large = response();
  await handler({ ...base, body: { contents: [{ parts: [{ text: 'x'.repeat(200001) }] }] } }, large);
  assert.equal(large.code, 413);
  const limited = response();
  await handler(base, limited);
  assert.equal(limited.code, 429);
  const failed = response();
  await createHandler({ apiKey: 'secret', fetchImpl: async () => { throw new Error('secret'); } })(base, failed);
  assert.equal(failed.code, 502);
  assert.ok(!JSON.stringify(failed.body).includes('secret'));
});

function response() {
  return { code: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
