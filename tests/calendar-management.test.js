const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../google-calendar.js');
const ok = data => ({ ok: true, status: 200, json: async () => data });

test('조회는 다음 페이지를 끝까지 읽고 취소 항목을 제외한다', async () => {
  const urls = [];
  const rows = await api.listEvents('token', {start:new Date(2026,8,1), end:new Date(2026,9,1)}, async url => {
    urls.push(url);
    return urls.length === 1 ? ok({items:[{id:'a'}], nextPageToken:'next'}) : ok({items:[{id:'b'}, {id:'c',status:'cancelled'}]});
  });
  assert.deepEqual(rows.map(row => row.id), ['a','b']);
  assert.equal(new URL(urls[1]).searchParams.get('pageToken'), 'next');
});

test('수정은 If-Match를 보내고 원격 버전 충돌을 구분한다', async () => {
  await assert.rejects(api.updateEvent('token','a/b',{summary:'변경'},'"v1"', async (url, options) => {
    assert.match(url, /a%2Fb$/);
    assert.equal(options.method,'PATCH');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.equal(options.headers['If-Match'], '"v1"');
    assert.deepEqual(JSON.parse(options.body), {summary:'변경'});
    return {ok:false,status:412,json:async()=>({})};
  }), {code:'CONFLICT'});
});

test('삭제의 204 빈 응답을 성공으로 처리한다', async () => {
  const result = await api.deleteEvent('token','abc','"v1"', async (url, options) => {
    assert.equal(options.method,'DELETE');
    assert.equal(options.headers['If-Match'], '"v1"');
    return {ok:true,status:204,json:async()=>{throw new Error('empty');}};
  });
  assert.equal(result,null);
});

test('401과 권한 부족 403은 서로 다른 오류다', async () => {
  for (const [status,code] of [[401,'AUTH'],[403,'FORBIDDEN']]) {
    await assert.rejects(api.deleteEvent('token','abc','v1',async()=>({ok:false,status,json:async()=>({})})), {code});
  }
});

test('생성 재시도는 같은 ID로 조회해 중복을 막는다', async () => {
  const calls=[];
  const result = await api.createEvent('token',{id:'abc123',summary:'회의'},async(url,options)=>{
    calls.push(options.method);
    return options.method === 'POST' ? {ok:false,status:409,json:async()=>({})} : ok({id:'abc123',summary:'회의'});
  });
  assert.equal(result.id,'abc123');
  assert.deepEqual(calls,['POST','GET']);
});
