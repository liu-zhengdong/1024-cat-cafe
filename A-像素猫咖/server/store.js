/* 1024 猫咖 · 服务端的库：名册、令牌、店里共同的计数、抽奖记录，以及发名字（名字池和前端是同一份：js/account.js 的 Account.NAMES）。
   数据在 server/data/（不进仓库；环境变量 DATA_DIR 可以换一个目录，压力测试时用）：
   - cats.json：{cats:{名字键:猫}, tokens:{令牌散列:{id,k,exp}}, world:{hung, days:{日期:件数}, tree:[{kind,ci}], eggs:{彩蛋键:几只猫找到}, crystal:{n,gold}}, draws:[...], settings:{...}}
     settings 是组织者在后台改的店里的设置（docs/组织者后台.md"店里的设置"）：{bots 补位的猫（null 按 config.js）, entry 抽奖登记开着没有, notice 店里的公告, noticeAt 公告发布的时间}
     猫身上的 eggs 是它找到过的彩蛋（{键:时间}，计数用，同一个只算一次），tank 是它往吧台大鱼缸里放过几条水晶鱼
     猫身上的 entry 是它的抽奖登记 {real 姓名, emp 工号, contact 联系方式, t 第一次登记, u 最近一次改}
     claims 是组织者发的领回链接 {码的散列:{id, exp}}（docs/组织者后台.md"名册"）
     两只合成一只（docs/登录与进店.md"两只合成一只"）：并进别的猫的，猫身上记 merged {into 并进了谁, t}；留下的那只记 absorbed [并进来的名字]、rev（合过几次）；
     令牌上记 rev（这张令牌打开时那只猫的 rev），比猫的小就不收它交的存档
   - admin.key：后台口令（第一次启动时生成；也可以用环境变量 ADMIN_KEY） */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..'),DATA=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'data');
const DB_FILE=path.join(DATA,'cats.json'),KEY_FILE=path.join(DATA,'admin.key');
const TOKEN_DAYS=90;

// 和前端共用：名字池、抽奖登记的格式
const ACC=vm.runInNewContext(fs.readFileSync(path.join(ROOT,'js/account.js'),'utf8')+';Account',{window:{},localStorage:null,crypto:globalThis.crypto,TextEncoder,console});
const key=s=>String(s||'').normalize('NFKC').trim().toLowerCase(),clean=s=>String(s||'').normalize('NFKC').trim();
const okLook=ACC.okLook;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

/* ---------- 库 ---------- */
const SETTINGS0={bots:null,entry:true,notice:'',noticeAt:0};
const db={cats:{},tokens:{},world:{hung:0,days:{},tree:[]},draws:[],settings:{...SETTINGS0}};
try{const j=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));Object.assign(db,j);db.world={hung:0,days:{},tree:[],...(j.world||{})};db.draws=j.draws||[];db.settings={...SETTINGS0,...(j.settings||{})}}catch(e){}
// 彩蛋、大鱼缸的计数：第一次（旧的库里没有）按名册里每只猫存档里的记录补算一遍，以后跟着联机消息加
// ultimate 是终极彩蛋（全成就）：另外八个这只猫都算过了才算（联机消息、存档补算都一样），免得随手发一条就全店广播
const EGG_KEYS=['planet','ninelives','shark','milk','disco','clock','konami','credits','ultimate'],EGG_REG=EGG_KEYS.filter(k=>k!=='ultimate');
const eggOk=(c,k)=>k!=='ultimate'||EGG_REG.every(x=>c.eggs&&c.eggs[x]);
// 存档里记着的、计数里还没算上的（比如断线的时候找到的）补上：同一只猫同一个彩蛋只算一次，大鱼缸每只猫最多算三条
function syncEggs(c){const g=(c.state&&c.state.g&&c.state.g.eggs)||{},W=db.world,E=c.eggs=c.eggs||{};let ch=false;
  for(const k of EGG_KEYS)if(g[k]&&g[k].at&&!E[k]&&eggOk(c,k)){E[k]=g[k].at;W.eggs[k]=(W.eggs[k]||0)+1;ch=true}
  const tk=g.planet&&Array.isArray(g.planet.tank)?g.planet.tank.slice(0,3):[],had=c.tank||0;if(tk.length>had){W.crystal.n+=tk.length-had;W.crystal.gold+=tk.slice(had).filter(v=>v===1).length;c.tank=tk.length;ch=true}
  return ch}
if(!db.world.eggs||!db.world.crystal){db.world.eggs={};db.world.crystal={n:0,gold:0};for(const c of Object.values(db.cats)){c.eggs={};c.tank=0;syncEggs(c)}}
const byIdMap=new Map();const reindex=()=>{byIdMap.clear();for(const [k,c] of Object.entries(db.cats))byIdMap.set(c.id,k)};reindex();
const byId=id=>{const k=byIdMap.get(id);return k?db.cats[k]:null};
let saveT=null;
function writeNow(){fs.mkdirSync(DATA,{recursive:true});const tmp=DB_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db));fs.renameSync(tmp,DB_FILE)}
function save(){if(saveT)return;saveT=setTimeout(()=>{saveT=null;writeNow()},200)}
function flush(){if(saveT){clearTimeout(saveT);saveT=null;writeNow()}}

/* ---------- 发名字：此刻没有猫用的 ---------- */
const offer=(n,skip)=>ACC.pick(n,x=>!!db.cats[key(x)],skip);

/* ---------- 令牌 ---------- */
function issue(c){const t=crypto.randomBytes(32).toString('base64url');db.tokens[sha(t)]={id:c.id,k:key(c.name),exp:Date.now()+TOKEN_DAYS*864e5};return t}
// 并进了别的猫的，顺着找到留下的那只（最多跟五层）
const alive=c=>{for(let i=0;c&&c.merged&&i<5;i++)c=byId(c.merged.into);return c&&!c.merged?c:null};
function who(token){if(typeof token!=='string'||!token||token.length>200)return null;const h=sha(token),tk=db.tokens[h];if(!tk)return null;
  if(tk.exp<Date.now()){delete db.tokens[h];save();return null}const c0=db.cats[tk.k];if(!c0||c0.id!==tk.id)return null;const c=alive(c0);if(!c||c.banned)return null;
  tk.exp=Date.now()+TOKEN_DAYS*864e5;return{c,h,tk,stale:(tk.rev||0)<(c.rev||0)}}
// 领回链接：一次性的码，48 小时有效，库里只存散列；同一只猫再发一个，前一个作废
const CLAIM_MS=48*3600e3;
function claimNew(c){const code=crypto.randomBytes(12).toString('base64url'),t=Date.now(),C=db.claims=db.claims||{};
  for(const [h,v] of Object.entries(C))if(v.id===c.id||v.exp<t)delete C[h];C[sha(code)]={id:c.id,exp:t+CLAIM_MS};save();return{code,exp:t+CLAIM_MS}}
function claimUse(code){if(typeof code!=='string'||!code||code.length>64||!db.claims)return null;const h=sha(code),v=db.claims[h];if(!v)return null;
  delete db.claims[h];save();if(v.exp<Date.now())return null;const c=alive(byId(v.id));return c&&!c.banned?c:null}

/* ---------- 两只合成一只：b 的进度并进 a，a 的名字、样子留着（docs/登录与进店.md"两只合成一只"） ----------
   存档 g 里：数取大的，毛线球、挂进橱窗加起来，发现的时间（disc、at）取早的；对象两边的键都留；
   数组：彩蛋的步数（steps）取并集，别的（大鱼缸放过的鱼）取长的；别的（字符串）留 a 的 */
const SUM_G=new Set(['balls','hung']);
function mergeG(a,b,k,at){if(a===undefined)return b;if(b===undefined||b===null)return a;
  if(typeof a==='number'&&typeof b==='number')return at==='g'&&SUM_G.has(k)?a+b:at==='g.disc'||k==='at'?Math.min(a,b):Math.max(a,b);
  if(typeof a==='boolean'||typeof b==='boolean')return a||b;
  if(Array.isArray(a)&&Array.isArray(b))return k==='steps'?[...new Set([...a,...b])].sort((x,y)=>x-y):a.length>=b.length?a:b;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const o={...a},p=at?at+'.'+k:k;for(const kk of Object.keys(b))o[kk]=mergeG(a[kk],b[kk],kk,p);return o}
  return a}
function merge(a,b){const sa=a.state||{},sb=b.state||{},W=db.world,t=Date.now(),st={};
  for(const k of new Set([...Object.keys(sa.stamps||{}),...Object.keys(sb.stamps||{})]))st[k]=!!((sa.stamps||{})[k]||(sb.stamps||{})[k]);
  a.state={...sb,...sa,g:mergeG(sa.g||{},sb.g||{},'g',''),stamps:st,visits:(+sa.visits||0)+(+sb.visits||0),arrived:sa.arrived||sb.arrived?1:0,pos:sa.arrived?sa.pos:sb.pos};
  // 服务端记的彩蛋：b 有、a 没有的挪过来（店里的计数 b 已经算过一次）；两只都有的，店里"几只猫找到"减掉一只
  const E=a.eggs=a.eggs||{};for(const [k,v] of Object.entries(b.eggs||{})){if(E[k]){E[k]=Math.min(E[k],v);if(W.eggs&&W.eggs[k]>0)W.eggs[k]--}else E[k]=v}
  a.tank=Math.max(a.tank||0,b.tank||0);a.hangs=(a.hangs||0)+(b.hangs||0);a.created=Math.min(a.created||t,b.created||t);
  if(!a.entry&&b.entry){a.entry=b.entry;delete b.entry}
  const nos=new Set((a.prizes||[]).map(p=>p.no));for(const p of b.prizes||[])if(!nos.has(p.no))(a.prizes=a.prizes||[]).push(p);
  a.absorbed=[...(a.absorbed||[]),b.name,...(b.absorbed||[])];a.rev=(a.rev||0)+1;a.last=t;b.merged={into:a.id,t};
  syncEggs(a);save()}
function revoke(id){for(const [h,t] of Object.entries(db.tokens))if(t.id===id)delete db.tokens[h];save()}
// 改名：名册按名字键存，令牌里也记着名字键
function rename(c,name){const k0=key(c.name),k1=key(name);delete db.cats[k0];c.name=clean(name);db.cats[k1]=c;for(const t of Object.values(db.tokens))if(t.id===c.id)t.k=k1;reindex();save()}

/* ---------- 给前端看的猫 ---------- */
const pubEntry=c=>c.entry?{real:c.entry.real,emp:c.entry.emp,contact:c.entry.contact,t:c.entry.t}:null;
const pub=c=>({id:c.id,name:c.name,look:c.look,created:c.created,last:c.last,prev:c.prev,state:c.state||{},prizes:(c.prizes||[]).filter(p=>!p.seen).map(({no,code,how,t})=>({no,code,how,t})),entry:pubEntry(c)});
const today=(t=Date.now())=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};

/* ---------- 店里的设置：后台改（admin.js），店里每只猫都看得到（GET /api/settings、联机的 welcome 和 cfg） ---------- */
const BOTS_MAX=150,NOTICE_MAX=60;
const pubSettings=()=>{const g=db.settings;return{bots:g.bots,entry:g.entry!==false,notice:g.notice||'',noticeAt:g.noticeAt||0}};
// 只改给了的几项；哪一项不对，整个不改，返回那一项的名字。公告去掉换行和控制字符，字变了才算新发布
function setSettings(b){const g=db.settings,next={};
  if('bots' in b){const n=b.bots;if(n!==null&&!(Number.isInteger(n)&&n>=0&&n<=BOTS_MAX))return'bots';next.bots=n}
  if('entry' in b){if(typeof b.entry!=='boolean')return'entry';next.entry=b.entry}
  if('notice' in b){if(typeof b.notice!=='string')return'notice';const t=b.notice.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim();
    if([...t].length>NOTICE_MAX)return'notice';if(t!==g.notice){next.notice=t;next.noticeAt=t?Date.now():0}}
  Object.assign(g,next);save();return null}

/* ---------- 后台口令 ---------- */
function adminKey(){if(process.env.ADMIN_KEY)return process.env.ADMIN_KEY;try{const k=fs.readFileSync(KEY_FILE,'utf8').trim();if(k)return k}catch(e){}
  const k=crypto.randomBytes(12).toString('base64url');fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(KEY_FILE,k+'\n',{mode:0o600});return k}

module.exports={ROOT,DATA,ACC,EGG_KEYS,eggOk,syncEggs,db,key,clean,okLook,sha,byId,reindex,save,flush,offer,issue,who,revoke,rename,claimNew,claimUse,merge,alive,pub,pubEntry,today,pubSettings,setSettings,adminKey};
