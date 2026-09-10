// Test-only dependency: @electric-sql/pglite@0.3.14 in NODE_PATH or .vercel/qa-deps.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let PGlite;
try{({PGlite}=require('@electric-sql/pglite'));}catch{({PGlite}=require('../.vercel/qa-deps/node_modules/@electric-sql/pglite'));}
(async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/schemas/10_personal_library.sql'),'utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
    const record='33333333-3333-4333-8333-333333333333',share='44444444-4444-4444-8444-444444444444';
    await db.query('insert into dotodo_records(id,owner_id,title,payload) values ($1,auth.uid(),$2,$3)',[record,'내 일정',{events:[],todos:[]}]);
    await db.query('insert into dotodo_shares(id,owner_id,title,payload,token_hash,expires_at) values ($1,auth.uid(),$2,$3,$4,now()+interval \'7 days\')',[share,'공유',{events:[],todos:[]},'a'.repeat(64)]);
    assert.equal((await db.query('select * from dotodo_records')).rows.length,1);
    await assert.rejects(db.query("update dotodo_shares set title='변조' where id=$1",[share]),/permission denied/);
    await db.exec(`set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';`);
    assert.equal((await db.query('select * from dotodo_records')).rows.length,0);
    assert.equal((await db.query('delete from dotodo_records where id=$1 returning id',[record])).rows.length,0);
    assert.equal((await db.query('update dotodo_shares set revoked_at=now() where id=$1 returning id',[share])).rows.length,0);
    await assert.rejects(db.query('insert into dotodo_records(id,owner_id,title,payload) values ($1,$2,$3,$4)',[
      '55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','남의 소유자',{events:[],todos:[]}]),/row-level security/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from dotodo_shares'),/permission denied/);
    await assert.rejects(db.query('select * from dotodo_records'),/permission denied/);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
    await db.query('update dotodo_shares set revoked_at=now() where id=$1',[share]);
    await assert.rejects(db.query('update dotodo_shares set revoked_at=null where id=$1',[share]),/row-level security/);
    await db.exec('reset role; set role service_role;');
    assert.equal((await db.query('select * from dotodo_shares where token_hash=$1 and revoked_at is null and expires_at>now()',['a'.repeat(64)])).rows.length,0);
    console.log('PASS PostgreSQL RLS: ownership, cross-account read/delete/revoke denial, forged owner denial, anonymous denial, immutable snapshots and irreversible revoke');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
