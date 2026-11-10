// خادم اختبار محلي: يقدّم web/ ويحاكي Supabase (rest → PostgREST، auth → GoTrue مبسّط). للاختبار فقط.
const http = require('http'), fs = require('fs'), path = require('path');
const jwt = require('/tmp/sbjs/node_modules/jsonwebtoken'); const { Pool } = require('/tmp/sbjs/node_modules/pg');
const SECRET = 'local-test-secret-local-test-secret-0123', WEB = '/home/user/rawaj/web';
const pool = new Pool({ host:'/tmp', port:5544, user:'postgres', database:'rawaj_ui' });
const otpLog = [];   // سجل محاولات OTP (بدون الرمز)
const session = u => { const exp = Math.floor(Date.now()/1000) + 3600; return { access_token: jwt.sign({ sub:u.id, role:'authenticated', aud:'authenticated', phone:u.phone, exp }, SECRET), token_type:'bearer', expires_in:3600, expires_at:exp, refresh_token:'r-'+u.id, user:{ id:u.id, phone:u.phone, aud:'authenticated', role:'authenticated', app_metadata:{}, user_metadata:{} } }; };
const send = (res, code, obj) => { res.writeHead(code, { 'content-type':'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/rest/v1/')) {
    if (global.OFFLINE) { req.socket.destroy(); return; }
    const opts = { host:'127.0.0.1', port:3001, path: req.url.replace('/rest/v1', ''), method:req.method, headers:{ ...req.headers } };
    if (!(opts.headers.authorization || '').match(/^Bearer ey/)) delete opts.headers.authorization;
    if (global.EXPIRE) opts.headers.authorization = 'Bearer ' + jwt.sign({ sub:'00000000-0000-0000-0000-000000000000', role:'authenticated', exp:1 }, SECRET);
    const p = http.request(opts, pr => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); }); req.pipe(p); return;
  }
  if (u.pathname.startsWith('/auth/v1/')) {
    const ep = u.pathname.slice(9), b = req.method === 'POST' ? await body(req) : {};
    if (ep === 'otp') { otpLog.push({ at:new Date().toISOString(), phone:b.phone, action:'otp_sent' }); return send(res, 200, {}); }
    if (ep === 'verify') {
      const phone = String(b.phone || '').replace(/^\+/, '');
      if (b.token !== '123456') { otpLog.push({ at:new Date().toISOString(), phone, action:'otp_failed' }); return send(res, 403, { code:403, error_code:'otp_expired', msg:'Token has expired or is invalid' }); }
      let r = await pool.query('select id, phone from auth.users where phone = $1', [phone]);
      if (!r.rows[0]) { try { r = await pool.query("insert into auth.users (id, phone, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id, phone", [phone]); } catch (e) { return send(res, 500, { code:500, error_code:'unexpected_failure', msg:'Database error saving new user' }); } }
      otpLog.push({ at:new Date().toISOString(), phone, action:'login' }); return send(res, 200, session(r.rows[0]));
    }
    if (ep === 'user') { try { const t = jwt.verify((req.headers.authorization || '').slice(7), SECRET); return send(res, 200, { id:t.sub, phone:t.phone, aud:'authenticated', role:'authenticated' }); } catch { return send(res, 401, { code:401, msg:'invalid JWT' }); } }
    if (ep === 'logout') { res.writeHead(204); return res.end(); }
    if (ep === 'token') { const id = String(b.refresh_token || '').slice(2); const r = await pool.query('select id, phone from auth.users where id = $1', [id]); return r.rows[0] ? send(res, 200, session(r.rows[0])) : send(res, 400, { msg:'invalid refresh' }); }
    return send(res, 404, {});
  }
  if (u.pathname === '/__otplog') return send(res, 200, otpLog);
  if (u.pathname === '/__flag') { global[u.searchParams.get('k')] = u.searchParams.get('v') === '1'; return send(res, 200, {}); }
  if (u.pathname.startsWith('/realtime/')) { res.writeHead(404); return res.end(); }
  let f = path.join(WEB, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const ct = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type':ct, 'cache-control':'no-store' }); fs.createReadStream(f).pipe(res);
}).listen(8080, () => console.log('test server on 8080'));
