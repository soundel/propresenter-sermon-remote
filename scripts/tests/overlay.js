// 유튜브(OBS) 자막 시험 (개발자용) — 가짜 ProPresenter + 헤드리스 크롬. 실제 ProPresenter에는 아무것도 보내지 않습니다.
//   bash scripts/tests/run.sh 가 함께 실행합니다. 따로: node scripts/tests/overlay.js
// 확인하는 것: 키가 틀리면 거부 · 자막 띄움/교체/내림 · 틀 없는 색은 유튜브에만 · 슬라이드·지우기 때 내림 ·
//             빠른 연타 후 남지 않음 · 디자인 바로 반영 · 서버가 꺼졌다 켜져도 다시 연결
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..'), PORT = 8092, PP = 51998, CDP = 9336;
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-ov-'));
fs.writeFileSync(path.join(T, 'config.json'), JSON.stringify({ host: '127.0.0.1', port: PP }));
const LAN = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal)?.address;
const procs = [];
const startServer = () => { const p = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, SR_DATA_DIR: T, PORT }, stdio: 'ignore' }); procs.push(p); return p; };
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { cond ? pass++ : fail++; console.log((cond ? '  ✔ ' : '  ✘ ') + name + (cond ? '' : '  ' + extra)); };

async function page(url) {                         // 새 탭을 열고 그 탭에서 JS를 실행하는 함수를 돌려줌
  const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURI(url)}`, { method: 'PUT' })).json();
  const s = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => s.onopen = r);
  let id = 0; const w = new Map(); s.onmessage = e => { const m = JSON.parse(e.data); if (w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } };
  const cdp = (m, p = {}) => new Promise(r => { const n = ++id; w.set(n, r); s.send(JSON.stringify({ id: n, method: m, params: p })); });
  const ev = async e => (await cdp('Runtime.evaluate', { expression: `(async()=>{${e}})()`, awaitPromise: true, returnByValue: true })).result.result?.value;
  ev.id = t.id; return ev;
}

(async () => {
  procs.push(spawn(process.execPath, [path.join(__dirname, 'mock-pp-log.js')], { stdio: 'ignore' }));
  let srv = startServer(); await sleep(1200);
  const key = JSON.parse(fs.readFileSync(path.join(T, 'overlay.json'), 'utf8')).key;
  const L = `http://127.0.0.1:${PORT}`, R = LAN ? `http://${LAN}:${PORT}` : null;
  const st = async () => (await (await fetch(`${L}/api/overlay/state`)).json()).state;

  console.log('1) 키 확인 (다른 기기에서 접속한 것처럼: ' + (R || '네트워크 없음 — 건너뜀') + ')');
  if (R) {
    for (const p of ['/overlay', '/overlay.html', '/api/overlay/state', '/api/overlay/events'])
      for (const k of ['', '?key=wrong-key-1234567890']) ok((await fetch(R + p + k)).status === 403, `${p}${k ? ' 틀린 키' : ' 키 없음'} → 403`);
    ok((await fetch(`${R}/overlay?key=${key}`)).status === 200, '/overlay 맞는 키 → 200');
    ok((await fetch(`${R}/api/overlay/state?key=${key}`)).status === 200, '/api/overlay/state 맞는 키 → 200');
    ok((await fetch(`${R}/api/overlay?key=${key}`, { method: 'POST', body: '{"show":true,"body":"x"}' })).status === 401, '자막 바꾸기(POST)는 키만으로는 거부 → 401');
    ok((await st()).show === false, '거부된 요청은 자막을 바꾸지 않음');
  }
  const info = await (await fetch(`${L}/api/info`)).json();
  ok(info.overlay?.local.endsWith('/overlay?key=' + key), '/api/info에 OBS 주소 포함');

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + path.join(T, 'chrome'), 'about:blank'], { stdio: 'ignore' });
  procs.push(chrome);
  for (let i = 0; i < 40; i++) { await sleep(250); try { await fetch(`http://127.0.0.1:${CDP}/json/version`); break; } catch {} }
  const ov = await page(`${R || L}/overlay?key=${key}`);      // OBS 대신: 키로 여는 오버레이
  const ui = await page(`${L}/`);                              // 설교 화면
  await sleep(2500);
  const look = () => ov(`const b=document.getElementById('box'),w=document.getElementById('wrap');return {on:document.getElementById('stage').classList.contains('on'),op:getComputedStyle(b).opacity,ref:document.getElementById('ref').textContent,body:document.getElementById('body').textContent,fs:b.style.getPropertyValue('--fs'),band:b.classList.contains('band'),top:w.classList.contains('top')}`);
  await ui(`S.subs={'기본':{uuid:'L',also:'R'},'파랑':{uuid:'V',ref:'A'}}; S.pres={uuid:'P',name:'시험',slides:[{text:'1'},{text:'2'}],loaded:1};
    S.ov=ovNorm({on:true}); S.ov.text={...S.ov.text,size:60,band:'none',pos:'bottom'}; S.ov.verse={...S.ov.verse,size:48,band:'half',pos:'top'}; save();
    $('text').value="{{양쪽 자막}}\\n{{파랑: 마 16:15 / 너희는 나를 누구라 하느냐}}\\n{{보라: 요 3:16 / 유튜브에만 뜨는 자막}}\\n[[1]]\\n{{다시 기본}}\\n[[지움]]"; startPreach();`);
  await sleep(1200);
  const cues = await ui(`return cues.map(c=>c.sub?'자막':c.subClear?'내림':c.clear?'지움':'슬라이드')`);
  console.log('2) 한 단계씩 (1.5초 간격) — 원고 단계:', cues.join(' → '));
  const expect = [
    ['양쪽 자막 띄움', s => s.show && s.body === '양쪽 자막' && !s.first],
    ['자막 내림', s => !s.show],
    ['성경 구절: 주소 + 본문', s => s.show && s.first === '마 16:15' && s.body === '너희는 나를 누구라 하느냐'],
    ['자막 내림', s => !s.show],
    ['틀 없는 색(보라)은 유튜브에만', s => s.show && s.first === '요 3:16'],
    ['자막 내림', s => !s.show],
    ['슬라이드', s => !s.show],
    ['다시 기본 자막', s => s.show && s.body === '다시 기본'],
    ['자막 내림', s => !s.show],
    ['지움', s => !s.show],
  ];
  for (let i = 0; i < cues.length; i++) {
    await ui(`go(1)`); await sleep(1500);
    const s = await st(), d = await look();
    const kindOk = !s.show || (s.first ? s.kind === 'verse' && d.fs === '48px' && d.band && d.top : s.kind === 'text' && d.fs === '60px' && !d.band && !d.top);
    ok(expect[i][1](s) && d.on === !!s.show && (!s.show || d.body === s.body) && kindOk, `${i + 1}. ${expect[i][0]}` + (s.show ? ` — ${s.kind === 'verse' ? '성경 구절 디자인(위·띠·48)' : '일반 자막 디자인(아래·띠 없음·60)'}` : ''), JSON.stringify({ s, d }));
  }
  const toastShown = await ui(`return !$('toast').classList.contains('hidden') ? $('toast').textContent : ''`);
  ok(!toastShown, '오류 알림 없음', toastShown);

  console.log('3) 자막을 띄운 채 슬라이드로 → 자막 내림, 자막·슬라이드 지우기 → 내림');
  await ui(`fire(0)`); await sleep(800); ok((await st()).show, '자막 뜸');
  await ui(`fire(6)`); await sleep(800); ok(!(await st()).show, '슬라이드를 띄우니 유튜브 자막도 내려감');
  await ui(`fire(2)`); await sleep(800); ok((await st()).show, '자막 뜸');
  await ui(`fire(2)`); await ui(`fire(4)`); await sleep(1200);
  ok((await st()).first === '요 3:16' && (await look()).body === '유튜브에만 뜨는 자막', '다른 자막으로 바로 바꾸기');
  await ui(`fire(0)`); await sleep(1200);
  { const d = await look(); ok(d.body === '양쪽 자막' && !d.top && !d.band && d.fs === '60px', '성경 구절 → 일반 자막으로 바꾸면 모양도 바뀜', JSON.stringify(d)); }
  await ui(`doClear()`); await sleep(800); ok(!(await st()).show && !(await look()).on, '"자막·슬라이드 지우기"로 내려감');

  console.log('4) 빠른 연타');
  for (const gap of [150, 30, 0]) {
    await ui(`cur=-1; mark();`);
    for (let i = 0; i < cues.length; i++) { await ui(`go(1)`); if (gap) await sleep(gap); }
    await sleep(3000);
    const s = await st(), d = await look(), pp = await (await fetch(`http://127.0.0.1:${PP}/state`)).json();
    ok(!s.show && !d.on && pp.active.length === 0, `${gap}ms 간격: 유튜브·무대 자막 모두 남지 않음`, JSON.stringify({ s, d, active: pp.active }));
  }

  console.log('5) 디자인 바꾸기 → 오버레이에 바로');
  await ui(`S.ov.text.pos='top'; S.ov.text.size=80; S.ov.text.band='half'; save();`); await ui(`fire(0)`); await sleep(1200);
  const d5 = await ov(`const w=document.getElementById('wrap'),b=document.getElementById('box');return {top:w.classList.contains('top'),band:b.classList.contains('band'),fs:b.style.getPropertyValue('--fs')}`);
  ok(d5.top && d5.band && d5.fs === '80px', '일반 자막 디자인 바꾸기: 위 · 반투명 띠 · 글자 80', JSON.stringify(d5));
  const sv = (await (await fetch(`${L}/api/overlay/state`)).json()).design;
  ok(sv.verse.size === 48 && sv.text.size === 80, '성경 구절 디자인은 그대로 (서버에 따로 저장)', JSON.stringify(sv));
  const long = '그러므로 우리가 믿음으로 의롭다 하심을 받았으니 우리 주 예수 그리스도로 말미암아 하나님과 화평을 누리자 또한 그로 말미암아 우리가 믿음으로 서 있는 이 은혜에 들어감을 얻었으며 하나님의 영광을 바라고 즐거워하느니라 다만 이뿐 아니라 우리가 환난 중에도 즐거워하나니 이는 환난은 인내를, 인내는 연단을, 연단은 소망을 이루는 줄 앎이로다';
  await fetch(`${L}/api/overlay`, { method: 'POST', body: JSON.stringify({ show: true, body: long }) }); await sleep(800);
  const d6 = await ov(`const b=document.getElementById('box');return {h:b.scrollHeight,fs:parseFloat(b.style.getPropertyValue('--fs'))}`);
  ok(d6.fs < 80 && d6.h <= 1080 * 0.42 + 2, `긴 글은 글자를 줄여 맞춤 (${d6.fs}px, 높이 ${d6.h}px)`);
  await ui(`S.ov.on=false; save(); ovSend({show:false})`); await sleep(800);
  ok(!(await look()).on, '유튜브 자막 끄기 → 내려감');

  console.log('6) 서버가 꺼졌다 켜져도 다시 연결');
  srv.kill(); await sleep(2500);
  srv = startServer(); await sleep(5000);
  await ui(`S.ov.on=true; save();`); await sleep(800);
  await fetch(`${L}/api/overlay`, { method: 'POST', body: JSON.stringify({ show: true, first: '시 23:1', body: '여호와는 나의 목자시니' }) }); await sleep(1000);
  const d7 = await look(), clients = (await (await fetch(`${L}/api/overlay/state`)).json()).clients;
  ok(d7.on && d7.body === '여호와는 나의 목자시니', '다시 연결되어 새 자막이 뜸', JSON.stringify({ d7, clients }));

  console.log('7) 풀스크린 배경 그림·영상 불러오기');
  const up = (name, buf, base = L) => fetch(`${base}/api/overlay/media`, { method: 'POST', headers: { 'X-Filename': encodeURIComponent(name) }, body: buf });
  const png = fs.readFileSync(path.join(ROOT, 'public', 'icon-192.png'));
  let r = await up('하늘 배경.png', png); const img = (await r.json()).name;
  ok(r.status === 200 && img === '하늘 배경.png', '그림 불러오기', img);
  ok((await (await up('하늘 배경.png', png)).json()).name === '하늘 배경 (2).png', '같은 이름이면 (2)를 붙임');
  ok((await up('악성.sh', Buffer.from('x'))).status === 400, '그림·영상이 아닌 파일은 거부');
  if (R) ok((await up('몰래.png', png, R)).status === 401, '로그인하지 않은 기기는 불러오기 거부');
  const list = (await (await fetch(`${L}/api/overlay/media`)).json()).files.map(f => f.name);
  ok(list.includes('하늘 배경.png') && list.length === 2, '목록', JSON.stringify(list));
  if (R) {
    ok((await fetch(`${R}/overlay-media/${encodeURIComponent(img)}`)).status === 403, '배경 파일: 키 없이 다른 기기 → 403');
    ok((await fetch(`${R}/overlay-media/${encodeURIComponent(img)}?key=${key}`)).status === 200, '배경 파일: 맞는 키 → 200');
  }
  ok((await fetch(`${L}/overlay-media/..%2Fconfig.json`)).status === 404 && (await fetch(`${L}/overlay-media/%2E%2E%2Foverlay.json`)).status === 404, '폴더 밖 파일은 못 읽음');
  let vid = '';
  try {
    require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', path.join(T, 'v.mp4')]);
    r = await up('예배 영상.mp4', fs.readFileSync(path.join(T, 'v.mp4'))); vid = (await r.json()).name;
    const rr = await fetch(`${L}/overlay-media/${encodeURIComponent(vid)}`, { headers: { Range: 'bytes=0-99' } });
    ok(rr.status === 206 && (await rr.arrayBuffer()).byteLength === 100, '영상 일부분(Range) 요청 → 206');
  } catch (e) { console.log('  (ffmpeg가 없어 영상 시험은 건너뜀)'); }
  await ui(`S.ov.on=true; S.ov.verse={...S.ov.verse,mode:'full',bg:${JSON.stringify(img)},bgDim:40,band:'half',bandAlpha:30}; S.ov.text={...S.ov.text,mode:'lower',band:'half',bandAlpha:80}; save();`);
  await sleep(800);
  const full = () => ov(`const v=document.getElementById('bgVid'),i=document.getElementById('bgImg'),b=document.getElementById('box');return {full:document.getElementById('stage').classList.contains('full'),on:document.getElementById('stage').classList.contains('on'),img:i.classList.contains('on')?decodeURIComponent(i.src):'',vid:v.classList.contains('on')?decodeURIComponent(v.src):'',ready:v.readyState,paused:v.paused,err:v.error&&v.error.code+' '+v.error.message,net:v.networkState,can:v.canPlayType('video/mp4; codecs="avc1.640028"'),ba:b.style.getPropertyValue('--ba'),dim:document.getElementById('dim').style.getPropertyValue('--dim'),wrap:document.getElementById('wrap').className}`);
  await ui(`fire(2)`); await sleep(1200);
  let f = await full();
  ok(f.on && f.full && f.img.includes('하늘 배경.png') && f.img.includes('key=') && f.ba === '0.3' && f.dim === '0.4' && f.wrap.startsWith('full'), '성경 구절 → 풀스크린 + 배경 그림 + 띠 진하기 30% + 어둡게 40%', JSON.stringify(f));
  await ui(`fire(0)`); await sleep(1200); f = await full();
  ok(f.on && !f.full && f.ba === '0.8', '일반 자막 → 하단 자막 + 띠 진하기 80% (풀스크린에서 바로 바뀜)', JSON.stringify(f));
  if (vid) {
    await fetch(`http://127.0.0.1:${CDP}/json/activate/${ov.id}`);   // OBS처럼 자막 화면을 앞에 (뒤에 숨은 탭은 크롬이 영상 불러오기를 미룸)
    await ui(`S.ov.verse.bg=${JSON.stringify(vid)}; save();`); await ui(`fire(2)`); await sleep(2500); f = await full();
    ok(f.full && f.vid.includes('예배 영상.mp4') && f.ready >= 2 && !f.paused, '배경 영상이 재생됨', JSON.stringify(f));
    await ov(`window.loads=0; document.getElementById('bgVid').addEventListener('loadstart', () => loads++)`);
    await ui(`fire(4)`); await sleep(1200); const n1 = await ov(`return loads`), f4 = await full();
    ok(n1 === 0 && f4.vid.includes('예배 영상.mp4') && !f4.paused, '같은 배경의 다른 성경 구절: 영상을 다시 불러오지 않고 이어서 재생', JSON.stringify({ n1, f4 }));
    await ui(`fire(3)`); await sleep(1500); f = await full();
    ok(!f.on && f.paused, '자막을 내리면 영상도 멈춤', JSON.stringify(f));
  }
  await fetch(`${L}/api/overlay/media?name=${encodeURIComponent('하늘 배경 (2).png')}`, { method: 'DELETE' });
  ok(!(await (await fetch(`${L}/api/overlay/media`)).json()).files.some(x => x.name === '하늘 배경 (2).png'), '배경 지우기');

  console.log(fail ? `✘ ${fail}개 실패 (${pass}개 통과)` : `✔ 유튜브 자막 시험 ${pass}개 모두 통과`);
  for (const p of procs) p.kill();
  await sleep(500); try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 5 }); } catch {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); for (const p of procs) p.kill(); process.exit(1); });
