const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/config.js');

test('공개 설정은 서비스 OAuth ID만 반환하고 미설정·잘못된 값을 숨긴다', () => {
  const saved = process.env.GOOGLE_CLIENT_ID;
  try {
    for (const [input, expected] of [
      ['123-demo.apps.googleusercontent.com', '123-demo.apps.googleusercontent.com'],
      ['', ''],
      ['not-a-client-id', '']
    ]) {
      process.env.GOOGLE_CLIENT_ID = input;
      const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, json(body) { this.body=body; } };
      handler({method:'GET'},res);
      assert.equal(res.code,200);
      assert.deepEqual(res.body,{googleClientId:expected});
      assert.equal(res.headers['Cache-Control'],'no-store');
    }
  } finally {
    if (saved === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = saved;
  }
});
