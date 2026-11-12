const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { startServer } = require('../server.cjs');

const root = path.join(__dirname, '..');
const post = (service, route, body) => fetch(service.base + route, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('fresh data can stream every configured work alias from the original videos', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-aliases-'));
  const service = await startServer({ dataDir: data });
  try {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(root, 'runtime/enhancement-config.js'), 'utf8'), context);
    const aliases = require('../assets/work-animation-aliases.json');
    for (const name of context.PetEnhancementConfig.workSlots.flat()) {
      const response = await fetch(service.base + '/thumb/main/' + encodeURIComponent(name + '.webm'));
      assert.equal(response.status, 200, name);
      const source = fs.readFileSync(path.join(root, 'assets/webm', aliases[name] + '.webm'));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), source, name);
    }
    const director = require('../runtime/enhancement-core.js');
    assert.equal(director.sceneAt(context.PetEnhancementConfig.scenes, 7).id, '晨起');
    assert.equal(director.sceneAt(context.PetEnhancementConfig.scenes, 23).id, '准备睡觉');
  } finally {
    service.close();
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('session index hides an unrecoverable Codex task but allows a saved task to open', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-thread-index-'));
  const home = path.join(data, 'codex');
  fs.mkdirSync(home);
  const saved = '11111111-1111-4111-8111-111111111111';
  const missing = '22222222-2222-4222-8222-222222222222';
  const rollout = path.join(home, 'saved.jsonl');
  fs.writeFileSync(rollout, '{}\n');
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, source TEXT, title TEXT, name TEXT, rollout_path TEXT)');
  db.prepare('INSERT INTO threads VALUES (?,?,?,?,?)').run(saved, 'vscode', 'Saved task', 'Saved task', rollout);
  db.close();
  const priorHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  let service;
  const opened = [];
  try {
    service = await startServer({ dataDir: path.join(data, 'pet'), defaultMode: 'connected',
      hooksAdapter: { inspect: async () => ({ ready: false }), install() {} },
      onOpenThread: async id => opened.push(id) });
    for (const session_id of [missing, saved]) {
      const event = await post(service, '/hook', { session_id, hook_event_name: 'UserPromptSubmit' });
      await event.text();
    }
    const state = await fetch(service.base + '/work-status').then(r => r.json());
    assert.deepEqual(state.items.map(item => item.sessionId), [saved]);
    const blocked = await post(service, '/work/open', { id: missing });
    assert.notEqual(blocked.status, 200);
    await blocked.text();
    const allowed = await post(service, '/work/open', { id: saved });
    assert.equal(allowed.status, 200);
    await allowed.text();
    assert.deepEqual(opened, [saved]);
  } finally {
    service?.close();
    if (priorHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = priorHome;
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('share text generates a draft via a mock provider without writing chat history', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-draft-'));
  const provider = http.createServer((request, response) => {
    request.resume();
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '这是草稿。' } }] }));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  let service;
  try {
    service = await startServer({ dataDir: data, protect: value => value, unprotect: value => value });
    const config = await fetch(service.base + '/api/settings', { method: 'PUT', body: JSON.stringify({
      baseUrl: 'http://127.0.0.1:' + provider.address().port + '/v1',
      model: 'fixture', apiKey: 'fixture-key',
    }) });
    assert.equal(config.status, 200);
    await config.text();
    const draft = await post(service, '/video-draft', { shareText: '一只小鲸鱼 https://v.douyin.com/example/' });
    assert.deepEqual(await draft.json(), { ok: true, reply: '这是草稿。', basis: '基于分享文案' });
    const chat = await fetch(service.base + '/chat').then(r => r.json());
    assert.deepEqual(chat.messages, []);
  } finally {
    service?.close();
    provider.close();
    fs.rmSync(data, { recursive: true, force: true });
  }
});
