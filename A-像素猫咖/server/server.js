/* 1024 猫咖 · 服务端参考实现：零依赖（Node 18+），一个进程同时发网页、接口和联机。
   node server/server.js            → http://127.0.0.1:1024
   PORT=8080 HOST=0.0.0.0 node server/server.js   → 局域网里别的电脑也能开
   DATA_DIR=/tmp/x node server/server.js          → 换一个数据目录（压力测试时别写进正式名册）；数据目录永远不对外发
   TRUST_PROXY=1 node server/server.js            → 放在反向代理后面时：按代理加在 X-Forwarded-For 最后的那个地址计数（输错后台口令的次数）
   - 账号接口（docs/登录与进店.md）：名字从池子里发、全店唯一；不设密码，这个浏览器记着的令牌就是身份（库里只存散列）；集齐三个章的猫可以登记抽奖。
   - 联机（docs/联机.md）：/ws 上的 WebSocket，见 live.js。
   - 组织者后台（docs/组织者后台.md）：/admin.html 页面 + /api/admin/* 接口，见 admin.js；后台改的店里的设置，店里用 GET /api/settings 取。口令在 server/data/admin.key；开在终端里时启动就打印出来，放在后台（nohup、systemd）时日志里只写口令在哪。
   - 页面要的 config.js：目录里有就发那份；没有就现给一份 {api:'api'}。
   - 部署：deploy.sh 一键启动、装成服务、备份、打离线包，见 docs/部署.md；GET /api/health 给它看活着没有。 */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const S=require('./store'),live=require('./live'),admin=require('./admin')(S,live);
const PORT=+process.env.PORT||1024,HOST=process.env.HOST||'127.0.0.1',BODY_MAX=64*1024,STATE_MAX=48*1024;
const {db,key}=S,TRUST_PROXY=process.env.TRUST_PROXY==='1';
// 来访地址：直连用对面的地址；在可信代理后面，用代理追加在 X-Forwarded-For 末尾的那个（前面的可能是浏览器自己填的，不可信）
const ipOf=req=>{if(TRUST_PROXY){const x=String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean);if(x.length)return x[x.length-1]}return req.socket.remoteAddress||''};

/* ---------- 账号接口 ---------- */
const bearer=req=>{const m=/^Bearer (.+)$/.exec(req.headers.authorization||'');return m&&S.who(m[1])};
const API={
  // 发几个此刻没有猫用的名字；skip 是上一批，换一批时别再给
  'POST /names/offer':({body})=>{const n=Math.max(1,Math.min(12,Math.floor(+body.n)||6)),skip=Array.isArray(body.skip)?body.skip.filter(x=>typeof x==='string').slice(0,60):[];return[200,{names:S.offer(n,skip)}]},
  // 登记一只猫：名字必须是池子里的、没被占的；到这一刻才真正占下
  'POST /cats':({body})=>{const {name,look}=body;if(!S.ACC.inPool(name))return[400,{err:'name'}];if(!S.okLook(look))return[400,{err:'bad'}];
    const k=key(name);if(db.cats[k])return[409,{err:'taken'}];
    const now=Date.now(),c={id:'c'+crypto.randomBytes(8).toString('hex'),name:S.clean(name),look:{coat:look.coat,collar:look.collar,face:look.face},created:now,last:now,prev:0,state:{}};
    db.cats[k]=c;S.reindex();const token=S.issue(c);S.save();return[200,{cat:S.pub(c),token}]},
  // 打开时取一次：这张令牌从此能交存档（合并过的猫，合之前打开的令牌不收，见下面 /me/merge）
  'GET /me':({me})=>{if(!me)return[401,{err:'auth'}];const c=me.c;c.prev=c.last;c.last=Date.now();me.tk.rev=c.rev||0;S.save();return[200,{cat:S.pub(c)}]},
  'PUT /me/state':({me,body})=>{if(!me)return[401,{err:'auth'}];if(me.stale)return[409,{err:'stale'}];const s=body.state;if(!s||typeof s!=='object'||JSON.stringify(s).length>STATE_MAX)return[400,{err:'bad'}];
    me.c.state={...me.c.state,...s};me.c.last=Date.now();S.syncEggs(me.c);S.save();return[200,{ok:true}]},
  // 登记抽奖：三个章都盖了才收；组织者截止了登记，新登记和修改都不收；改的话第一次登记的时间不变（按工号去重时以最早那次为准）
  'POST /me/entry':({me,body})=>{if(!me)return[401,{err:'auth'}];if(db.settings.entry===false)return[403,{err:'closed'}];const st=(me.c.state&&me.c.state.stamps)||{};if(!(st.ball&&st.inner&&st.site))return[403,{err:'stamps'}];
    const bad=S.ACC.entryWhy(body);if(bad)return[400,{err:'bad',field:bad.field,why:bad.why}];const e=S.ACC.entryClean(body),now=Date.now();
    me.c.entry={real:e.real,emp:e.emp,contact:e.contact,t:(me.c.entry&&me.c.entry.t)||now,u:now};S.save();return[200,{entry:S.pubEntry(me.c)}]},
  // 看过"你被抽中了"，下次不再弹
  'POST /me/prize-seen':({me,body})=>{if(!me)return[401,{err:'auth'}];for(const p of me.c.prizes||[])if(p.no===body.no)p.seen=true;S.save();return[200,{ok:true}]},
  // 店里的设置（组织者在后台改）：补位的猫有多少只、抽奖登记开着没有、店里的公告。不用身份，网页建店之前取一次
  'GET /settings':()=>[200,S.pubSettings()],
  'POST /logout':({me})=>{if(me){delete db.tokens[me.h];live.dropToken(me.h);S.save()}return[200,{ok:true}]},
  // 两只合成一只（docs/登录与进店.md"两只合成一只"）：from 那只的进度并进自己。正开着的两只都断开联机（和双开一样），合之前打开的窗口再存档会被拒
  'POST /me/merge':({me,body})=>{if(!me)return[401,{err:'auth'}];const o=S.who(String(body.from||''));if(!o)return[404,{err:'from'}];
    if(o.c.id!==me.c.id){S.merge(me.c,o.c);live.kick(o.c.id,'elsewhere');live.kick(me.c.id,'elsewhere')}me.tk.rev=me.c.rev||0;S.save();return[200,{cat:S.pub(me.c)}]},
  // 领回链接（组织者在后台发的，docs/登录与进店.md"网站从 http 换成 https 以后"）：一次性的码换一张新令牌
  'POST /claim':({body})=>{const c=S.claimUse(body.code);if(!c)return[404,{err:'claim'}];const token=S.issue(c);S.save();return[200,{cat:S.pub(c),token}]},
  // 健康检查（deploy.sh、监控用）：只给数，不给名字
  'GET /health':()=>[200,{ok:true,cats:Object.keys(db.cats).length,online:live.stats().online,up:Math.round(process.uptime())}]};

/* ---------- 静态文件 ---------- */
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.md':'text/markdown; charset=utf-8','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function serveFile(req,res,p){if(p==='/')p='/index.html';let f;try{f=path.join(S.ROOT,decodeURIComponent(p))}catch(e){res.writeHead(400);return res.end()}
  if(!f.startsWith(S.ROOT+path.sep)||f.startsWith(__dirname)||f===S.DATA||f.startsWith(S.DATA+path.sep)){res.writeHead(404);return res.end()}
  // 没有 config.js 就现给一份；接口地址写相对的 api，放在反向代理的子路径下（/cat/）也能用
  if(p==='/config.js'&&!fs.existsSync(f)){res.writeHead(200,{'Content-Type':MIME['.js'],'Cache-Control':'no-cache'});return res.end("window.CAT1024_CONFIG={api:'api'};")}
  fs.stat(f,(e,st)=>{if(e||!st.isFile()){res.writeHead(404);return res.end('not found')}
    // 不缓存，但带上修改时间：没改过的文件（字体一百多 KB）浏览器问一声就用自己手里的。
    // 网页本身（几十 KB）每次都整份发：回 304 的话，浏览器会接着用上一次存下的响应头——前面的 nginx 改过头（比如去掉了原网站的 CSP），打开过的浏览器也还按旧的来
    const html=path.extname(f)==='.html',lm=st.mtime.toUTCString(),ims=req.headers['if-modified-since'];
    if(!html&&ims&&Date.parse(ims)>=Math.floor(st.mtimeMs/1000)*1000){res.writeHead(304,{'Last-Modified':lm,'Cache-Control':'no-cache'});return res.end()}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache',...(html?{}:{'Last-Modified':lm}),'X-Content-Type-Options':'nosniff'});fs.createReadStream(f).pipe(res)})}

/* ---------- 搬家页：网站从 http 换成 https 以后，把 http 那一侧记着的令牌带过来（docs/登录与进店.md"网站从 http 换成 https 以后"） ----------
   nginx 单独转这一页，带上 X-Forwarded-Proto、X-Original-URI（deploy.sh 生成的那一段）。猫咖挂在根上、前面的代理不改路径的，只要 X-Forwarded-Proto。
   - https 上来的：302 回一模一样的 http 地址。Chrome 把 http 自动升级成 https 以后，又被送回同一个 http 地址，就退回 http 去开；地址多一个参数它就再升级一次。
   - 一分钟内第二次从 https 来：网站开了 HSTS（或者 http 那边没放行），浏览器去不了 http，再送就来回打转。不搬了，回店里，什么也不带。
   - http 上来的、不经过 nginx 的：发 move.html 本身。 */
function move(req,res){const h=req.headers,uri=String(h['x-original-uri']||req.url),host=String(h.host||'');
  if(h['x-forwarded-proto']!=='https'||!/^\/[!-~]*$/.test(uri)||!/^[\w.:[\]-]+$/.test(host))return serveFile(req,res,'/move.html');
  const at=uri.split('?')[0],again=/(^|;\s*)cat1024_mv=1(;|$)/.test(h.cookie||'');
  res.writeHead(302,{'Cache-Control':'no-store',...(again?{Location:'./#move=','Set-Cookie':`cat1024_mv=; Max-Age=0; Path=${at}; Secure`}:
    {Location:'http://'+host+uri,'Set-Cookie':`cat1024_mv=1; Max-Age=60; Path=${at}; Secure; HttpOnly; SameSite=Lax`})});res.end()}

// 回给浏览器：[状态, JSON, 另外的响应头]、{csv, name} 一份 CSV、{redirect, cookies} 一次跳转（抽奖的 w3 登录用）
function reply(res,out){if(out&&out.redirect){res.writeHead(302,{Location:out.redirect,'Cache-Control':'no-store',...(out.cookies?{'Set-Cookie':out.cookies}:{})});return res.end()}
  if(out&&out.csv!=null){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(out.name),'Cache-Control':'no-store'});return res.end(out.csv)}
  res.writeHead(out[0],{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(out[2]||{})});res.end(JSON.stringify(out[1]))}
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x'),ip=ipOf(req);
  if(!u.pathname.startsWith('/api/'))return u.pathname==='/move.html'?move(req,res):serveFile(req,res,u.pathname);
  // /api/lotto/* 是抽奖的用户接口（server/lotto.js，docs/抽奖系统.md）：w3 登录、自己抽；有的要等外面的接口，回的是 Promise
  const sub=u.pathname.slice(4),isAdmin=sub.startsWith('/admin/'),isLotto=sub.startsWith('/lotto/'),h=isAdmin||isLotto?null:API[req.method+' '+sub];
  if(!isAdmin&&!isLotto&&!h){res.writeHead(404,{'Content-Type':'application/json'});return res.end('{"err":"none"}')}
  let raw='',big=false;req.on('data',d=>{raw+=d;if(raw.length>BODY_MAX){big=true;req.destroy()}});
  req.on('end',()=>{if(big)return;let body={};if(raw){try{body=JSON.parse(raw)}catch(e){res.writeHead(400);return res.end('{"err":"bad"}')}}
    let out;try{out=isAdmin?admin.handle(req.method,sub.slice(6),{body,ip,req,url:u}):isLotto?admin.lotto.user(req.method,sub.slice(7),{body:body&&typeof body==='object'?body:{},ip,req,url:u}):h({body,ip,me:bearer(req)})}catch(e){console.error(e);out=[500,{err:'server'}]}
    Promise.resolve(out).then(o=>reply(res,o),e=>{console.error(e);reply(res,[500,{err:'server'}])})})});
server.on('upgrade',(req,socket,head)=>{if(new URL(req.url,'http://x').pathname==='/ws')live.upgrade(req,socket,head);else socket.destroy()});
// 口令只在开在终端里时打出来：放在后台时日志进文件或 journald，共用的服务器上别的账号可能读得到
server.listen(PORT,HOST,()=>{const base=`http://${HOST==='0.0.0.0'?'localhost':HOST}:${PORT}`,where=process.env.ADMIN_KEY?'环境变量 ADMIN_KEY':path.join(S.DATA,'admin.key');
  console.log(`1024 猫咖营业中：${base}\n组织者后台：${base}/admin.html  口令：${process.stdout.isTTY?admin.KEY:'见 '+where}`)});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{S.flush();process.exit(0)});
