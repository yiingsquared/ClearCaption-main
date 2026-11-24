import test from 'node:test';
import assert from 'node:assert/strict';
import { localDB } from '../server/local-db.mjs';
import { handleAPI } from '../server/api.mjs';
import { escapeHTML } from '../web/shared/icons.js';

function setup(t) {
  const DB = localDB(); t.after(() => DB.close());
  const request = async (path, { method = 'GET', body, token, roomToken, ip = 'test' } = {}) => {
    const headers = { 'Content-Type':'application/json', 'CF-Connecting-IP':ip };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (roomToken) headers['X-Room-Token'] = roomToken;
    const result = await handleAPI(new Request(`https://test.example${path}`, { method, headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { DB });
    return { status: result.status, data: await result.json() };
  };
  const register = async (email = 'teacher@example.test') => (await request('/api/auth/register', {
    method:'POST', body:{email,password:'correct-horse-24',name:'Test teacher'},
  })).data;
  return { DB, request, register };
}

test('accounts hash passwords and tokens; login and logout enforce authentication', async t => {
  const { DB, request, register } = setup(t);
  const account = await register();
  assert.equal(account.token.length,64);
  assert.equal(account.user.email,'teacher@example.test');
  const stored = await DB.prepare('SELECT * FROM users').first();
  assert.notEqual(stored.password,'correct-horse-24'); assert.equal(stored.password.length,64);
  const tokenRow = await DB.prepare('SELECT * FROM tokens').first(); assert.notEqual(tokenRow.hash,account.token);
  assert.equal((await request('/api/auth/me')).status,401);
  assert.equal((await request('/api/auth/me',{token:account.token})).data.user.id,account.user.id);
  const bad = await request('/api/auth/login',{method:'POST',body:{email:'teacher@example.test',password:'wrong-password'}});
  assert.equal(bad.status,401);
  const good = await request('/api/auth/login',{method:'POST',body:{email:'TEACHER@example.test',password:'correct-horse-24'}});
  assert.equal(good.status,200);
  await request('/api/auth/logout',{method:'POST',body:{},token:good.data.token});
  assert.equal((await request('/api/auth/me',{token:good.data.token})).status,401);
});

test('only the presenter publishes; guests read by room token and cannot join after ending', async t => {
  const { request, register } = setup(t);
  const a = await register(), b = await register('other@example.test');
  const result = await request('/api/rooms',{method:'POST',token:a.token,body:{title:'Inheritance',language:'en',demo:true}});
  assert.equal(result.status,201); const room = result.data.room;
  assert.match(room.code,/^[A-Z2-9]{6}$/); assert.equal(room.owner,undefined);
  assert.equal((await request(`/api/rooms/${room.id}`)).status,403);
  assert.equal((await request(`/api/rooms/${room.id}`,{token:b.token})).status,403);
  const joined = await request('/api/rooms/join',{method:'POST',body:{code:room.code}});
  assert.equal(joined.status,200); const roomToken = joined.data.token;
  const entry = {id:crypto.randomUUID(),text:'A dog is an animal.',translations:{zh:'狗是一种动物。'},time:12000};
  assert.equal((await request(`/api/rooms/${room.id}/segments`,{method:'POST',roomToken,body:entry})).status,403);
  assert.equal((await request(`/api/rooms/${room.id}/segments`,{method:'POST',token:a.token,body:entry})).status,200);
  await request(`/api/rooms/${room.id}/segments`,{method:'POST',token:a.token,body:{...entry,text:'A Dog is an Animal.'}});
  const view = (await request(`/api/rooms/${room.id}`,{roomToken})).data;
  assert.equal(view.entries.length,1); assert.equal(view.entries[0].text,'A Dog is an Animal.');
  await request(`/api/rooms/${room.id}/end`,{method:'POST',token:a.token,body:{}});
  assert.equal((await request('/api/rooms/join',{method:'POST',body:{code:room.code}})).status,404);
  assert.equal((await request(`/api/rooms/${room.id}/segments`,{method:'POST',token:a.token,body:entry})).status,410);
  assert.equal((await request(`/api/rooms/${room.id}`,{roomToken})).data.entries.length,1);
});

test('saved text belongs to its account; updates and deletion cannot cross account boundaries', async t => {
  const { request, register } = setup(t);
  const a = await register(), b = await register('student@example.test');
  const record = {id:crypto.randomUUID(),title:'Test lesson',language:'en',notesLanguage:'fr',notes:'# Notes',created:Date.now(),duration:30000,
    entries:[{id:crypto.randomUUID(),text:'Original content',time:0,translations:{zh:'内容'}}]};
  assert.equal((await request('/api/sessions',{method:'POST',token:a.token,body:record})).status,200);
  assert.equal((await request('/api/sessions',{token:a.token})).data.sessions.length,1);
  assert.equal((await request('/api/sessions',{token:b.token})).data.sessions.length,0);
  assert.equal((await request('/api/sessions',{method:'POST',token:b.token,body:record})).status,403);
  await request(`/api/sessions/${record.id}`,{method:'DELETE',token:b.token});
  assert.equal((await request('/api/sessions',{token:a.token})).data.sessions.length,1);
  await request('/api/sessions',{method:'POST',token:a.token,body:{...record,notes:'Edited notes'}});
  assert.equal((await request('/api/sessions',{token:a.token})).data.sessions[0].notes,'Edited notes');
  await request(`/api/sessions/${record.id}`,{method:'DELETE',token:a.token});
  assert.equal((await request('/api/sessions',{token:a.token})).data.sessions.length,0);
});

test('AI cannot be silently substituted with samples; only three languages are accepted', async t => {
  const { request, register } = setup(t), a = await register();
  assert.equal((await request('/api/config')).data.aiReady,false);
  assert.equal((await request('/api/realtime/token',{method:'POST',body:{language:'en'}})).status,401);
  for (const [path,body] of [['/api/realtime/token',{language:'en'}],['/api/translate',{language:'fr',text:'Hello'}],['/api/notes',{language:'zh',transcript:'A transcript.'}]]) {
    const result = await request(path,{method:'POST',token:a.token,body});
    assert.equal(result.status,503); assert.equal(result.data.error,'AI_NOT_CONFIGURED');
  }
  assert.equal((await request('/api/realtime/token',{method:'POST',token:a.token,body:{language:'ja'}})).data.error,'INVALID_LANGUAGE');
});

test('expired credentials, malformed text and room-ID collisions are rejected', async t => {
  const { DB, request, register } = setup(t); const a = await register();
  const room = async title => (await request('/api/rooms',{method:'POST',token:a.token,body:{title,language:'en'}})).data.room;
  const one = await room('One'), two = await room('Two');
  const entry = {id:crypto.randomUUID(),text:'Text',time:0};
  await request(`/api/rooms/${one.id}/segments`,{method:'POST',token:a.token,body:entry});
  assert.equal((await request(`/api/rooms/${two.id}/segments`,{method:'POST',token:a.token,body:entry})).status,403);
  assert.equal((await request(`/api/rooms/${one.id}/segments`,{method:'POST',token:a.token,body:{...entry,time:-5}})).status,400);
  assert.equal(escapeHTML('<img onerror="x"> &'), '&lt;img onerror=&quot;x&quot;&gt; &amp;');
  await DB.prepare('UPDATE tokens SET expires=0').run();
  assert.equal((await request('/api/auth/me',{token:a.token})).status,401);
});

test('join-code guessing is rate limited', async t => {
  const { request } = setup(t);
  let result;
  for(let i=0;i<31;i++) result=await request('/api/rooms/join',{method:'POST',body:{code:'ABCDEF'}});
  assert.equal(result.status,429); assert.equal(result.data.error,'RATE_LIMITED');
});
