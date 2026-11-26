// 설교 리모컨 (propresenter-sermon-remote) — 설교원고 ↔ ProPresenter
// Node 18 이상, 추가 설치 없음. 맥에서 실행합니다.
// Copyright 2026 조성훈 (JO SUNGHUN). PolyForm Noncommercial License 1.0.0 — LICENSE 참고.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { execFile } = require('child_process');

const VERSION = '1.0.1';
const PORT = parseInt(process.env.PORT, 10) || 8080;
const DIR = __dirname;
// 설정·비밀번호·원고를 저장하는 폴더. 맥 앱(dmg)으로 켜면 ~/Library/Application Support/설교 리모컨,
// start.command로 켜면 이 프로그램 폴더입니다.
const APP = process.env.SR_APP === '1';
const DATA = process.env.SR_DATA_DIR || DIR;
fs.mkdirSync(DATA, { recursive: true });
const CONFIG_FILE = path.join(DATA, 'config.json');
const STATE_FILE = path.join(DATA, 'state.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json' };

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
let config = Object.assign({ host: '127.0.0.1', port: 1025 }, readJson(CONFIG_FILE, {}));

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = req => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > 5e6) { no(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', no);
});

async function proxy(req, res, rest) {
  const url = `http://${config.host}:${config.port}/${rest}`;
  const opt = { method: req.method, signal: AbortSignal.timeout(4000), headers: {} };
  if (req.method !== 'GET') {
    opt.body = await readBody(req);
    opt.headers['Content-Type'] = req.headers['content-type'] || 'application/json';
  }
  try {
    const r = await fetch(url, opt);
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch (e) {
    send(res, 502, { error: 'ProPresenter에 연결할 수 없습니다', detail: String(e.cause?.code || e.message) });
  }
}

/* ---------- 구글 계정 연결 (선택, OAuth, 문서 읽기 전용) ---------- */
// 기본은 "링크 공유" 문서 가져오기라서 계정 연결 없이도 쓸 수 있습니다.
// 계정을 연결하려면 각 사용자가 자기 Google Cloud OAuth 클라이언트(데스크톱 앱)를 만들어 준비 화면에 넣습니다.
// (공용 클라이언트를 넣어 배포하지 않습니다. 문서 목록 권한은 구글 심사가 필요한 범위이기 때문입니다. docs/구글-계정-연결.md 참고)
const DEFAULT_CLIENT = { client_id: '', client_secret: '' };
const GOOGLE_FILE = path.join(DATA, 'google.json');
const G = {
  auth: process.env.G_AUTH || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: process.env.G_TOKEN || 'https://oauth2.googleapis.com/token',
  revoke: process.env.G_REVOKE || 'https://oauth2.googleapis.com/revoke',
  api: process.env.G_API || 'https://docs.googleapis.com',
  docs: process.env.G_DOCS || 'https://docs.google.com',
  drive: process.env.G_DRIVE || 'https://www.googleapis.com',
};
const LIST_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';   // 내 문서 목록(이름·수정일)만 읽기
const SCOPE = 'openid email https://www.googleapis.com/auth/documents.readonly ' + LIST_SCOPE;
const canList = () => !!g.refresh_token && (g.scope || '').includes(LIST_SCOPE);
const REDIRECT = `http://127.0.0.1:${PORT}/oauth/callback`;
let g = readJson(GOOGLE_FILE, {}), pending = null, access = null;
const saveG = () => fs.writeFileSync(GOOGLE_FILE, JSON.stringify(g, null, 2), { mode: 0o600 });
const client = () => ({ client_id: g.client_id || DEFAULT_CLIENT.client_id, client_secret: g.client_secret || DEFAULT_CLIENT.client_secret });
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const page = (res, code, text) => send(res, code, `<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:-apple-system,sans-serif;text-align:center;padding:80px 24px;color:#1d1d1f"><h2>${text}</h2><p><a href="/" style="color:#3f7d5c">설교 리모컨으로 돌아가기</a></p>`, 'text/html; charset=utf-8');

async function accessToken() {
  if (!g.refresh_token) return null;
  if (access && access.exp > Date.now() + 60000) return access.token;
  const r = await fetch(G.token, { method: 'POST', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ ...client(), refresh_token: g.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === 'invalid_grant') { delete g.refresh_token; delete g.email; saveG(); }
    throw new Error('구글 계정 연결이 만료되었습니다. 맥에서 다시 연결해 주세요. (구글 클라우드의 게시 상태가 "테스트"이면 7일마다 풀립니다)');
  }
  access = { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
  return access.token;
}

function oauthStart(res) {
  const c = client();
  if (!c.client_id) return page(res, 400, 'OAuth 클라이언트 ID가 아직 입력되지 않았습니다.');
  pending = { state: b64url(crypto.randomBytes(16)), verifier: b64url(crypto.randomBytes(32)) };
  const q = new URLSearchParams({ client_id: c.client_id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', state: pending.state,
    code_challenge: b64url(crypto.createHash('sha256').update(pending.verifier).digest()), code_challenge_method: 'S256' });
  res.writeHead(302, { Location: `${G.auth}?${q}` }); res.end();
}
async function oauthCallback(res, q) {
  if (q.get('error')) return page(res, 400, '연결이 취소되었습니다.');
  if (!pending || q.get('state') !== pending.state) return page(res, 400, '연결 요청이 올바르지 않습니다. 처음부터 다시 시도해 주세요.');
  const verifier = pending.verifier; pending = null;
  const r = await fetch(G.token, { method: 'POST', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ ...client(), code: q.get('code'), code_verifier: verifier, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) return page(res, 502, '구글 계정을 연결하지 못했습니다. (' + String(j.error_description || j.error || r.status).replace(/[<>&]/g, '') + ')');
  g.refresh_token = j.refresh_token; g.scope = j.scope || '';
  try { g.email = JSON.parse(Buffer.from(j.id_token.split('.')[1], 'base64url')).email || ''; } catch { g.email = ''; }
  access = { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
  saveG();
  page(res, 200, '구글 계정이 연결되었습니다.');
}
async function googleDisconnect() {
  if (g.refresh_token) fetch(G.revoke, { method: 'POST', body: new URLSearchParams({ token: g.refresh_token }), signal: AbortSignal.timeout(5000) }).catch(() => {});
  delete g.refresh_token; delete g.email; delete g.scope; access = null; saveG();
}

/* ---------- 접속 비밀번호 ---------- */
// 이 맥(localhost)에서는 비밀번호 없이 쓰고, 아이패드 등 다른 기기는 한 번 로그인해야 합니다.
const AUTH_FILE = path.join(DATA, 'auth.json');
let auth = readJson(AUTH_FILE, null), firstCode = null;
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32);
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const saveAuth = () => fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  auth = { salt, hash: hashPw(pw, salt).toString('hex'), sessions: [] };   // 비밀번호는 해시로만 저장, 바꾸면 기존 로그인은 모두 풀림
  saveAuth();
}
if (!auth?.hash) { firstCode = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); setPassword(firstCode); }
const isAuthed = req => {
  if (isLocal(req)) return true;
  const t = /(?:^|;\s*)sr=([\w-]+)/.exec(req.headers.cookie || '')?.[1];
  return !!t && auth.sessions.includes(sha(t));
};
const fails = new Map();
async function login(req, res) {
  const ip = req.socket.remoteAddress, f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) return send(res, 429, { error: `여러 번 틀렸습니다. ${Math.ceil((f.until - Date.now()) / 60000)}분 뒤에 다시 시도해 주세요.` });
  const b = JSON.parse(await readBody(req));
  if (!crypto.timingSafeEqual(hashPw(b.password || '', auth.salt), Buffer.from(auth.hash, 'hex'))) {
    if (++f.n >= 5) { f.n = 0; f.until = Date.now() + 5 * 60000; }
    fails.set(ip, f);
    return send(res, 401, { error: '비밀번호가 맞지 않습니다.' });
  }
  fails.delete(ip);
  const tok = b64url(crypto.randomBytes(32));
  auth.sessions.push(sha(tok)); if (auth.sessions.length > 50) auth.sessions.shift();
  saveAuth();
  res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `sr=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${86400 * 90}` });
  res.end('{"ok":true}');
}

/* ---------- 내 구글 문서 목록 (최근 수정 순, 이름 검색) ---------- */
async function listDocs(res, query) {
  if (!g.refresh_token) return send(res, 400, { error: '구글 계정이 연결되어 있지 않습니다.' });
  if (!canList()) return send(res, 400, { error: '문서 목록 권한이 없습니다. 맥에서 구글 계정 연결을 해제한 뒤 다시 연결하고, 권한 화면에서 모든 항목을 허용해 주세요.' });
  try {
    const tok = await accessToken();
    let q = "mimeType='application/vnd.google-apps.document' and trashed=false";
    if (query) q += ` and name contains '${query.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const p = new URLSearchParams({ q, orderBy: 'modifiedTime desc', pageSize: '40', fields: 'files(id,name,modifiedTime)',
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    const r = await fetch(`${G.drive}/drive/v3/files?${p}`, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const em = j.error?.message || '';
      return send(res, 502, { error: /has not been used|disabled/i.test(em) ? 'Google Cloud 프로젝트에서 Google Drive API를 "사용"으로 켜 주세요. (라이브러리 → Google Drive API)' : '문서 목록을 가져오지 못했습니다. (' + r.status + ')' });
    }
    send(res, 200, { files: j.files || [] });
  } catch (e) { send(res, 502, { error: e.message }); }
}

/* ---------- 구글 문서 가져오기 ---------- */
// 형광펜 색 → 이름. 원고에서 형광펜을 칠한 부분은 {{색: 문구}} 자막 표시로 바뀝니다.
function hiColor(run) {
  const c = run.textStyle?.backgroundColor?.color?.rgbColor; if (!c) return '';
  const r = c.red || 0, g = c.green || 0, b = c.blue || 0, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx === 0 || d / mx < 0.15) return '';                       // 흰색·회색·검정은 형광펜으로 보지 않음
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h < 15 || h >= 345 ? '빨강' : h < 45 ? '주황' : h < 70 ? '노랑' : h < 160 ? '초록' : h < 200 ? '하늘' : h < 255 ? '파랑' : h < 290 ? '보라' : '분홍';
}
function docToText(content) {
  const paras = [];                                               // { head, segs:[{c,t}] }
  const walk = els => {
    for (const el of els || []) {
      if (el.paragraph) {
        const segs = [];
        for (const e of el.paragraph.elements || []) {
          const t = e.textRun?.content; if (!t) continue;
          const c = hiColor(e.textRun), last = segs[segs.length - 1];
          if (last && last.c === c) last.t += t; else segs.push({ c, t });
        }
        if (segs.length) segs[segs.length - 1].t = segs[segs.length - 1].t.replace(/\n+$/, '');
        paras.push({ head: /^(TITLE|HEADING_\d)$/.test(el.paragraph.paragraphStyle?.namedStyleType || ''), segs: segs.filter(x => x.t) });
      } else if (el.table) {
        for (const row of el.table.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
      }
    }
  };
  walk(content);
  const out = [];
  const whole = p => { const v = p.segs.filter(x => x.t.trim()); return v.length && v[0].c && v.every(x => x.c === v[0].c) ? v[0].c : ''; };
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i], w = whole(p);
    const plain = q => q.segs.map(x => x.t).join('').trim().replace(/\u000b/g, '⏎');
    if (w && !p.head) {                                           // 통째로 칠한 문단이 이어지면 한 자막으로 묶음 (성경 주소 + 본문)
      const lines = [plain(p)];
      while (i + 1 < paras.length && whole(paras[i + 1]) === w && !paras[i + 1].head) lines.push(plain(paras[++i]));
      out.push(`{{${w}: ${lines.join('⏎')}}}`);
      continue;
    }
    let t = p.segs.map(x => {
      if (!x.c || !x.t.trim()) return x.t.replace(/\u000b/g, '\n');
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(x.t);
      return `${m[1]}{{${x.c}: ${m[2].replace(/\u000b/g, '⏎')}}}${m[3]}`;
    }).join('');
    if (p.head && t.trim()) t = '# ' + t.replace(/\n/g, ' ');
    out.push(t);
  }
  return out.join('\n');
}
async function fetchDoc(res, link, wantTab) {
  const m = /docs\.google\.com\/document\/d\/([\w-]+)/.exec(link || '');
  if (!m) return send(res, 400, { error: '구글 문서 주소가 아닙니다. 주소창의 https://docs.google.com/document/d/… 주소를 그대로 붙여 넣어 주세요.' });
  wantTab = wantTab || /[?&#]tab=(t\.[\w-]+)/.exec(link)?.[1] || '';   // 주소에 탭이 지정되어 있으면 그 탭
  let why = '';
  try {                                   // 1) 연결된 계정으로 (비공개 문서도 가능, 형광펜 → 자막 인식)
    const tok = await accessToken();
    if (tok) {
      const r = await fetch(`${G.api}/v1/documents/${m[1]}?includeTabsContent=true`, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json(), flat = [];
        const walk = (a, depth) => { for (const t of a || []) { flat.push({ t, depth }); walk(t.childTabs, depth + 1); } };
        walk(d.tabs, 0);
        const tab = (flat.find(x => x.t.tabProperties?.tabId === wantTab) || flat[0])?.t;
        return send(res, 200, { via: 'account', title: d.title || '', tab: tab?.tabProperties?.title || '', tabId: tab?.tabProperties?.tabId || '', tabs: flat.length,
          tabList: flat.map(x => ({ id: x.t.tabProperties?.tabId || '', title: x.t.tabProperties?.title || '', depth: x.depth })),
          text: docToText(tab?.documentTab?.body?.content || d.body?.content) });
      }
      const e = await r.json().catch(() => ({})), em = e.error?.message || '';
      why = /has not been used|disabled/i.test(em) ? 'Google Cloud 프로젝트에서 Google Docs API를 "사용"으로 켜 주세요. '
        : (r.status === 403 || r.status === 404) ? `연결된 계정(${g.email || '구글'})으로는 이 문서를 열 수 없습니다. ` : `Google Docs 오류 ${r.status}. `;
    }
  } catch (e) { why = e.message + ' '; }
  // 2) 링크 공유 문서 (기본 방식): 지정한 탭 또는 첫 번째 탭(t.0) → 안 되면 문서 전체
  //    구글의 공식 기능이 아닌 내보내기 주소를 쓰므로, 구글이 바꾸면 동작이 달라질 수 있습니다.
  const tq = encodeURIComponent(wantTab || 't.0');
  for (const q of [`format=md&tab=${tq}`, `format=txt&tab=${tq}`, 'format=md', 'format=txt']) {
    try {
      const r = await fetch(`${G.docs}/document/d/${m[1]}/export?${q}`, { signal: AbortSignal.timeout(10000) });
      const type = r.headers.get('content-type') || '';
      if (r.ok && !type.includes('text/html'))
        return send(res, 200, { via: 'link', md: q.includes('md'), firstTab: q.includes('tab='), chosen: !!wantTab, text: (await r.text()).replace(/^﻿/, '') });
    } catch {}
  }
  send(res, 502, { error: why + (g.refresh_token ? '문서 주소와 권한을 확인해 주세요.' : '문서를 가져오지 못했습니다. 구글 문서의 "공유" → 일반 액세스를 "링크가 있는 모든 사용자 - 뷰어"로 바꿔 주세요.') });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    if (p === '/api/version') return send(res, 200, { version: VERSION });
    if (p === '/api/auth/status') return send(res, 200, { local: isLocal(req), authed: isAuthed(req), version: VERSION });
    if (p === '/api/login' && req.method === 'POST') return login(req, res);
    if (p === '/api/auth/password') {
      if (!isLocal(req)) return send(res, 403, { error: '비밀번호는 서버가 켜진 맥에서만 바꿀 수 있습니다.' });
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      const pw = String(JSON.parse(await readBody(req)).password || '');
      if (pw.length < 4) return send(res, 400, { error: '비밀번호는 4자 이상으로 정해 주세요.' });
      setPassword(pw); firstCode = null; return send(res, 200, { ok: true });
    }
    if (p === '/api/info') {        // 이 맥에서만: 아이패드 접속 주소와 처음 비밀번호
      if (!isLocal(req)) return send(res, 403, { error: 'forbidden' });
      return send(res, 200, { addresses: lanAddresses(), port: PORT, firstCode, app: APP, data: DATA });
    }
    if (p === '/api/shutdown') {    // 이 맥에서만: 서버 끄기
      if (!isLocal(req) || req.method !== 'POST') return send(res, 403, { error: 'forbidden' });
      send(res, 200, { ok: true });
      return setTimeout(() => process.exit(0), 300);
    }
    if ((p.startsWith('/api/') || p.startsWith('/pp/')) && !isAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'X-Auth': 'required', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ error: '비밀번호가 필요합니다.' }));
    }
    if (p.startsWith('/pp/')) return proxy(req, res, p.slice(4) + u.search);
    if (p === '/api/config') {
      if (req.method === 'POST') {
        const b = JSON.parse(await readBody(req));
        config = { host: String(b.host || '127.0.0.1').trim(), port: parseInt(b.port, 10) || 1025 };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      }
      return send(res, 200, config);
    }
    if (p === '/api/state') {
      if (req.method === 'POST') { fs.writeFileSync(STATE_FILE, await readBody(req)); return send(res, 200, { ok: true }); }
      return send(res, 200, readJson(STATE_FILE, {}));
    }
    if (p === '/api/doc') return fetchDoc(res, u.searchParams.get('url'), u.searchParams.get('tab'));
    if (p === '/api/google/status') return send(res, 200, { configured: !!client().client_id, connected: !!g.refresh_token, email: g.email || '', local: isLocal(req), canList: canList() });
    if (p === '/api/google/docs') return listDocs(res, u.searchParams.get('q') || '');
    if (p === '/oauth/callback') return oauthCallback(res, u.searchParams);
    if (p === '/oauth/start' || p === '/api/google/credentials' || p === '/api/google/disconnect') {
      // 계정 연결·해제는 이 맥에서만 (같은 와이파이의 다른 기기가 바꾸지 못하게)
      if (!isLocal(req)) return send(res, 403, { error: '계정 연결은 서버가 켜진 맥에서만 할 수 있습니다.' });
      if (p === '/oauth/start') return oauthStart(res);
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      if (p === '/api/google/disconnect') { await googleDisconnect(); return send(res, 200, { ok: true }); }
      const b = JSON.parse(await readBody(req));
      g.client_id = String(b.client_id || '').trim(); g.client_secret = String(b.client_secret || '').trim();
      saveG(); return send(res, 200, { ok: true });
    }
    const file = path.normalize(path.join(DIR, 'public', p === '/' ? 'index.html' : p));
    if (!file.startsWith(path.join(DIR, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'not found' });
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) { send(res, 500, { error: String(e.message) }); }
});
const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${PORT}`);
// 맥 앱으로 켰을 때는 터미널 창이 없으므로 알림창으로 알려 줍니다.
const alertMac = text => { if (APP) execFile('osascript', ['-e', `display alert "설교 리모컨" message ${JSON.stringify(text)}`], () => process.exit(1)); else process.exit(1); };
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    if (APP) return alertMac(`포트 ${PORT}번을 이미 다른 프로그램이 쓰고 있어서 켜지 못했습니다. 터미널로 켠 설교 리모컨(start.command)이 켜져 있다면 먼저 꺼 주세요.`);
    console.log(`\n포트 ${PORT}번을 이미 다른 프로그램이 쓰고 있습니다.`);
    console.log('설교 리모컨 창이 이미 하나 켜져 있는지 확인해 주세요. (Dock의 터미널 창들)');
    console.log(`다른 번호로 켜려면 터미널에서:  PORT=8090 node server.js\n`);
  } else { console.log('\n서버를 켜지 못했습니다: ' + e.message + '\n'); return alertMac('서버를 켜지 못했습니다: ' + e.message); }
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n설교 리모컨 v${VERSION} 서버가 켜졌습니다.\n아이패드 사파리에서 아래 주소로 접속하세요:\n`);
  for (const a of lanAddresses()) console.log('   ' + a);
  console.log(`\n(이 맥에서 확인: http://localhost:${PORT})`);
  console.log(firstCode ? `\n접속 비밀번호: ${firstCode}\n(처음 만들어진 비밀번호입니다. 이 맥에서 위 localhost 주소를 열면 바꿀 수 있습니다.)`
    : '\n접속 비밀번호가 설정되어 있습니다. 잊었다면 이 맥에서 위 localhost 주소를 열어 새로 정하세요.');
  console.log(APP ? '\n끌 때는 준비 화면 맨 위의 "설교 리모컨 끄기"를 누르세요.\n' : '\n이 창을 닫거나 Control + C를 누르면 꺼집니다.\n');
  if (APP) execFile('open', [`http://localhost:${PORT}`], () => {});   // 맥 앱: 준비 화면을 바로 엽니다
});
