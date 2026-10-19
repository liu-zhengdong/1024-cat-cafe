/* 1024 猫咖 · 抽奖系统的存盘和接口。设计见 docs/抽奖系统.md，规则在 lotto-core.js。
   数据在数据目录的 lotto.json，和名册 cats.json 分开。每次改动当场写完再回：回了"抽中一等奖"，记录就已经在磁盘上了。
   - 管理员接口挂在后台下面（/api/admin/lotto/*）：后台口令，或者 w3 登录了、工号在白名单里（lotto-config.json 的 admins）。
   - 用户接口在 /api/lotto/*：w3 登录（跳去 w3、回来记一个会话 cookie）、看自己剩几次、刷新（查 codehub、稼先，发该发的次数）、自己抽。
   lotto-config.json（数据目录里，只有部署的人改得了，改完重启）：{w3:{…见 w3.js}, admins:["工号",…], keyLogin:true, sources:{codehub:{…}, jiaxian:{…} 见 lotto-sources.js}}
   没有这个文件：没有 w3、没有自动发次数，后台只认口令，和批 1～3 一样。 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),L=require('./lotto-core');
module.exports=(S,{csv,fmt},deps={})=>{
const FILE=path.join(S.DATA,'lotto.json'),CFG_FILE=path.join(S.DATA,'lotto-config.json');
let st=L.fresh();try{st=L.load(JSON.parse(fs.readFileSync(FILE,'utf8')))}catch(e){if(e.code!=='ENOENT')throw e}
st.sess=st.sess&&typeof st.sess==='object'?st.sess:{};
// 配置写坏了就起不来，免得以为开了 w3、其实没开
let cfg={};try{cfg=JSON.parse(fs.readFileSync(CFG_FILE,'utf8'))}catch(e){if(e.code!=='ENOENT')throw new Error('lotto-config.json 读不了：'+e.message)}
const W3=require('./w3')(cfg.w3,deps),SRC=require('./lotto-sources')(cfg.sources,deps);
const ADMINS=new Set((Array.isArray(cfg.admins)?cfg.admins:[]).map(L.empKey).filter(L.empOk)),KEY_LOGIN=cfg.keyLogin!==false;
// 读坏了不能当空库接着写，那会把原来的记录盖掉：上面除了"文件还没有"，别的错误都直接让服务起不来
function write(){const now=Date.now();for(const [h,v] of Object.entries(st.sess))if(v.exp<now)delete st.sess[h];fs.mkdirSync(S.DATA,{recursive:true});const tmp=FILE+'.tmp',fd=fs.openSync(tmp,'w');try{fs.writeSync(fd,JSON.stringify(st));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,FILE)}
const id=()=>crypto.randomBytes(4).toString('hex');
const rnd=()=>crypto.randomInt(2**47)/2**47;
// 改东西的都走这里：规则说可以才写盘；规则出了错、写盘失败，都把内存退回改之前，免得内存里有、磁盘上没有
function commit(fn){const before=JSON.stringify(st);let r;
  try{r=fn();if(r.err){st=L.load(JSON.parse(before));const {err,...more}=r;return[r.err==='bad'?400:409,{err,...more}]}write()}catch(e){st=L.load(JSON.parse(before));console.error('抽奖没存上',e);return[500,{err:'disk'}]}return[200,r]}
const ERR404=[404,{err:'act'}];

// 给后台看的活动：此刻的状态、每个奖品还剩几个、抽了多少次、多少人有次数
function pubAct(a,now=Date.now()){const ds=st.draws.filter(d=>d.act===a.id),emps=new Set(st.grants.filter(g=>g.act===a.id).map(g=>g.emp));
  return{...a,status:L.statusOf(a,now),prizes:a.prizes.map(p=>({...p,rest:p.stock===null?null:p.stock-p.given})),draws:ds.length,people:emps.size}}
// 进行中的活动（前台、加次数默认用它）：有好几个的话取最后建的
const current=(now=Date.now())=>[...st.acts].reverse().find(a=>L.statusOf(a,now)==='live')||null;
function empView(act,emp){const k=L.empKey(emp);return{emp:k,gh:L.ghOf(st,k),left:L.left(st,act,k),grants:st.grants.filter(g=>g.act===act&&g.emp===k),draws:st.draws.filter(d=>d.act===act&&d.emp===k)}}
function draws(q){const act=q.get('act'),tier=q.get('tier'),emp=L.empKey(q.get('emp')||'');
  return st.draws.filter(d=>d.act===act&&(tier===null||tier===''||d.tier===+tier)&&(!emp||d.emp.includes(emp))).slice().reverse()}
const SRC_N={manual:'管理员加',codehub:'codehub star',jiaxian:'稼先关注',github:'github star'},VIA_N={w3:'自己登录抽',desk:'前台代抽'};
const tierN=t=>t===0?'没中':`${t} 等奖`;
function exportCsv(q){const a=L.findAct(st,q.get('act'));if(!a)return ERR404;const won=q.get('all')!=='1';
  const ds=st.draws.filter(d=>d.act===a.id&&(!won||d.tier>0)).sort((x,y)=>x.t-y.t);
  return{csv:csv([['工号','几等奖','奖品','抽奖时间','怎么抽的'],...ds.map(d=>[d.emp,tierN(d.tier),d.name,fmt(d.t),VIA_N[d.via]||d.via])]),name:`${a.name}-${won?'中奖名单':'全部抽奖记录'}.csv`}}

const R={
  'GET state':()=>{const now=Date.now(),c=current(now);return[200,{acts:st.acts.map(a=>pubAct(a,now)),current:c?c.id:null,github:!!SRC.github}]},
  'POST act':({body})=>commit(()=>L.addAct(st,{name:body.name,start:body.start??null,end:body.end??null},id())),
  'POST act/status':({body})=>commit(()=>L.setStatus(st,body.id,body.to,body.why,Date.now())),
  'POST prize':({body})=>commit(()=>L.addPrize(st,body.act,{tier:body.tier,name:body.name,weight:body.weight,stock:body.stock??null},id())),
  'POST prize/edit':({body})=>{const p={};for(const k of ['tier','name','weight','stock'])if(k in body)p[k]=body[k];return commit(()=>L.editPrize(st,body.act,body.id,p))},
  'POST restock':({body})=>commit(()=>L.restock(st,body.act,body.id,body.n)),
  // 查一个工号：剩几次、发过几笔、抽到过什么
  'GET emp':({url})=>{const q=url.searchParams,act=q.get('act')||(current()||{}).id;if(!L.findAct(st,act))return ERR404;const k=L.empKey(q.get('emp'));if(!L.empOk(k))return[400,{err:'bad'}];return[200,empView(act,k)]},
  // 管理员加次数：src 固定是 manual，why 是原因（关注进群、互动游戏、github star 截图……）
  'POST grant':({body,ip,by})=>commit(()=>L.grant(st,{act:body.act,emp:body.emp,src:'manual',n:body.n,by:'后台 '+(by||ip),why:body.why},Date.now())),
  // 前台代抽：管理员登录的前台电脑上，用户输自己的工号
  'POST draw':({body,ip,by})=>commit(()=>L.draw(st,{act:body.act||(current()||{}).id,emp:body.emp,via:'desk',by:'前台 '+(by||ip)},Date.now(),rnd)),
  // 前台、后台替员工填 GitHub 用户名：{emp, user}
  'POST github':({body,ip,by})=>githubFor(body.emp,body.user,'GitHub · '+(by||ip)),
  'GET draws':({url})=>{const L2=draws(url.searchParams);return[200,{draws:L2.slice(0,500),total:L2.length}]},
  'GET export':({url})=>exportCsv(url.searchParams)};

function handle(method,sub,ctx){const h=R[method+' '+sub];return h?h(ctx):[404,{err:'none'}]}

/* ---------- w3 会话：cookie 里一张随机令牌，库里只存散列，12 小时 ---------- */
const SESS_MS=12*3600e3,sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const cookieOf=(req,k)=>{const m=new RegExp('(?:^|;\\s*)'+k+'=([^;]*)').exec(req.headers.cookie||'');return m?decodeURIComponent(m[1]):''};
const cookie=(k,v,age)=>`${k}=${v}; Max-Age=${age}; Path=${W3.base}; HttpOnly; SameSite=Lax${W3.secure?'; Secure':''}`;
function session(req){const t=cookieOf(req,'lotto_sid');if(!t||t.length>100)return null;const v=st.sess[sha(t)];return v&&v.exp>Date.now()?v:null}
// 后台接口的另一种进法：w3 登录了、工号在白名单里。给回工号（记在"谁加的"里），不是就给 null
const adminBy=req=>{const v=session(req);return v&&ADMINS.has(v.emp)?v.emp:null};
// 登录前在哪儿，登录完回哪儿：只认这几个，不跟着参数跳到别的网站
const BACK={shop:'',desk:'desk.html',admin:'admin.html'},pending=new Map();
const back=(k,hash)=>({redirect:W3.base+(BACK[k]??'')+'#'+hash});

/* ---------- GitHub star：员工填用户名，查到 star 了就绑上这个工号、发 1 次（docs/抽奖系统.md"GitHub star"） ---------- */
const lastRefresh=new Map(),REFRESH_GAP=+process.env.LOTTO_REFRESH_GAP_MS||10e3;   // 环境变量只给测试用
// 同一个工号 10 秒内只查一次外面的接口（刷新、填 GitHub 用户名共用）
function tooSoon(emp){const t=lastRefresh.get(emp)||0;if(Date.now()-t<REFRESH_GAP)return[429,{err:'soon',wait:Math.ceil((REFRESH_GAP-Date.now()+t)/1000)}];lastRefresh.set(emp,Date.now());return null}
// 给回 [状态, {left, got 这次发了没有, dup 这个活动已经发过, no 没 star, user}]；taken 用户名被别的工号用了，bound 这个工号已经绑了别的用户名，gh 没查成
async function githubFor(emp,user,by){if(!SRC.github)return[404,{err:'github'}];const a=current();if(!a)return[409,{err:'act'}];
  const pre=L.ghCan(st,emp,user);if(pre.err)return[pre.err==='bad'?400:409,pre];
  if(st.grants.some(g=>g.act===a.id&&g.emp===L.empKey(emp)&&g.src==='github'))return[200,{left:L.left(st,a.id,emp),got:false,dup:true,user:pre.user}];
  const soon=tooSoon(L.empKey(emp));if(soon)return soon;
  let ok;try{ok=await SRC.github(pre.user)}catch(e){console.error(`查 github 没成（${emp} / ${pre.user}）：${e.message}`);return[502,{err:'gh'}]}
  if(!ok)return[200,{left:L.left(st,a.id,emp),got:false,no:true,user:pre.user}];
  // 查的这一会儿里别人可能抢先绑了这个用户名：绑和发放放在同一次提交里，绑不上就都不算
  const r=commit(()=>{const b=L.ghBind(st,emp,pre.user);if(b.err)return b;const g=L.grant(st,{act:a.id,emp,src:'github',by},Date.now());return g.err?g:{...g,user:b.user}});
  return r[0]===200?[200,{left:r[1].left,got:!r[1].dup,dup:!!r[1].dup,user:pre.user}]:r}

/* ---------- 用户接口 /api/lotto/*（w3 登录以后自己抽） ---------- */
function me(req){const v=session(req),a=current();
  return{w3:W3.enabled,sources:SRC.on,github:!!SRC.github,act:a?{id:a.id,name:a.name}:null,
    me:v?{emp:v.emp,name:v.name||'',admin:ADMINS.has(v.emp),gh:L.ghOf(st,v.emp),...(a?{left:L.left(st,a.id,v.emp),draws:st.draws.filter(d=>d.act===a.id&&d.emp===v.emp),got:Object.fromEntries([...SRC.on,...(SRC.github?['github']:[])].map(k=>[k,st.grants.some(g=>g.act===a.id&&g.emp===v.emp&&g.src===k)]))}:{})}:null}}
const U={
  'GET me':({req})=>[200,me(req)],
  'GET w3/login':({url})=>{if(!W3.enabled)return[404,{err:'w3'}];const state=W3.newState(),now=Date.now();
    for(const [k,v] of pending)if(v.exp<now)pending.delete(k);if(pending.size>5000)return[429,{err:'busy'}];
    pending.set(state,{back:url.searchParams.get('back')||'shop',exp:now+600e3});return{redirect:W3.loginUrl(state),cookies:[cookie('lotto_st',state,600)]}},
  // w3 带着 code 回来：state 要和发出去的、cookie 里的都对上；换出工号，记一个会话
  'GET w3/callback':async({req,url})=>{if(!W3.enabled)return[404,{err:'w3'}];const q=url.searchParams,state=q.get('state')||'',p=pending.get(state);
    const clear=cookie('lotto_st','',0);if(!p||cookieOf(req,'lotto_st')!==state)return{...back('shop','lotto-err=state'),cookies:[clear]};pending.delete(state);
    let who;try{who=await W3.identify(q.get('code')||'')}catch(e){console.error('w3 登录没成：'+e.message);return{...back(p.back,'lotto-err=w3'),cookies:[clear]}}
    const emp=L.empKey(who.emp);if(!L.empOk(emp)){console.error('w3 给的工号格式不对：'+who.emp);return{...back(p.back,'lotto-err=emp'),cookies:[clear]}}
    const t=crypto.randomBytes(32).toString('base64url');st.sess[sha(t)]={emp,name:String(who.name||'').slice(0,20),exp:Date.now()+SESS_MS};
    try{write()}catch(e){console.error('会话没存上',e);return{...back(p.back,'lotto-err=disk'),cookies:[clear]}}
    return{...back(p.back,'lotto=in'),cookies:[clear,cookie('lotto_sid',t,SESS_MS/1000)]}},
  'POST logout':({req})=>{const t=cookieOf(req,'lotto_sid');if(t){delete st.sess[sha(t)];try{write()}catch(e){}}return[200,{ok:true},{'Set-Cookie':cookie('lotto_sid','',0)}]},
  // 刷新：查这个工号在 codehub、稼先上 star / 关注了没有，查到了、这个活动里还没发过，就发 1 次。查失败的那一个给 0 次，说"稍后再试"
  'POST refresh':async({req})=>{const v=session(req);if(!v)return[401,{err:'auth'}];const a=current();if(!a)return[409,{err:'act'}];
    const soon=tooSoon(v.emp);if(soon)return soon;
    // 绑过 GitHub 用户名的，刷新时也查一下 GitHub（新的活动里还没发过的话）
    const gh=SRC.github&&L.ghOf(st,v.emp),todo=[...SRC.on,...(gh?['github']:[])].filter(k=>!st.grants.some(g=>g.act===a.id&&g.emp===v.emp&&g.src===k)),got=[],no=[],fail=[];
    const res=await Promise.all(todo.map(k=>(k==='github'?SRC.github(gh):SRC.check(k,v.emp)).then(ok=>[k,ok],e=>{console.error(`查 ${k} 没成（${v.emp}）：${e.message}`);return[k,null]})));
    for(const [k,ok] of res){if(ok===null){fail.push(k);continue}if(!ok){no.push(k);continue}
      // 查的这一会儿里别的窗口可能已经发过了：grant 自己会去重（回 dup），不会多发
      const r=commit(()=>L.grant(st,{act:a.id,emp:v.emp,src:k,by:'自动'},Date.now()));if(r[0]===200&&!r[1].dup)got.push(k);else if(r[0]!==200)fail.push(k)}
    return[200,{left:L.left(st,a.id,v.emp),got,no,fail}]},
  'POST draw':({req})=>{const v=session(req);if(!v)return[401,{err:'auth'}];const a=current();if(!a)return[409,{err:'act'}];
    return commit(()=>L.draw(st,{act:a.id,emp:v.emp,via:'w3',by:v.emp},Date.now(),rnd))},
  // 填 GitHub 用户名：{user}
  'POST github':({req,body})=>{const v=session(req);if(!v)return[401,{err:'auth'}];return githubFor(v.emp,body.user,'自动 · GitHub')}};
function user(method,sub,ctx){const h=U[method+' '+sub];return h?h(ctx):[404,{err:'none'}]}
return{handle,user,adminBy,keyLogin:KEY_LOGIN,current,SRC_N}};
