/* 1024 猫咖 · 抽奖系统的规则：次数、按库存抽、活动状态。设计见 docs/抽奖系统.md。
   只改传进来的 state，不读写文件、不碰网络；此刻的时间 now、随机数 rnd（返回 [0,1)）都从外面传，测试好控制。
   state = {acts:[{id, name, status, start, end, endWhy, prizes:[{id, tier, name, weight, stock, given}]}], grants:[{act, emp, src, n, by, why, t}], draws:[{act, emp, prize, tier, name, via, by, t}]}
   每个改东西的函数都回 {err} 或者结果；回了 err 的，state 一点没动。 */
const SRC=['manual','codehub','jiaxian','github'],STATUS=['draft','live','paused','ended'],WHY=['done','early','abort'],VIA=['w3','desk'];
const NEXT={draft:['live'],live:['paused','ended'],paused:['live','ended'],ended:[]};
// 工号：和集章登记一样，去掉空格、转大写以后一样就是同一个人（js/account.js 的 empKey）；格式也一样，字母、数字、- _，2～32 位
const empKey=emp=>String(emp==null?'':emp).normalize('NFKC').replace(/\s+/g,'').toUpperCase();
const empOk=k=>/^[A-Z0-9_-]{2,32}$/.test(k);
const int=v=>Number.isInteger(v);
const str=(v,max)=>typeof v==='string'&&v.trim().length>=1&&v.trim().length<=max;

const fresh=()=>({acts:[],grants:[],draws:[]});
// 读库：缺的补上；认不出的状态当 paused（不让抽，后台看得见、能改）
function load(j){const s={...fresh(),...(j&&typeof j==='object'?j:{})};for(const k of ['acts','grants','draws'])if(!Array.isArray(s[k]))s[k]=[];
  for(const a of s.acts){if(!STATUS.includes(a.status))a.status='paused';if(!Array.isArray(a.prizes))a.prizes=[]}return s}

const findAct=(s,id)=>s.acts.find(a=>a.id===id)||null;
// 此刻的状态：进行中、暂停的，过了结束时间就当作结束
const statusOf=(a,now)=>a.status!=='ended'&&a.end&&now>=a.end?'ended':a.status;

// 剩几次 = 这个活动里发给这个工号的 − 抽过的
function left(s,actId,emp){const k=empKey(emp);let n=0;
  for(const g of s.grants)if(g.act===actId&&g.emp===k)n+=g.n;
  for(const d of s.draws)if(d.act===actId&&d.emp===k)n--;
  return n}

/* ---------- 活动和奖品 ---------- */
function addAct(s,{name,start=null,end=null},id){if(!str(name,40))return{err:'bad'};
  if((start!=null&&!int(start))||(end!=null&&!int(end))||(start!=null&&end!=null&&end<=start))return{err:'bad'};
  const a={id,name:name.trim(),status:'draft',start,end,endWhy:null,prizes:[]};s.acts.push(a);return{act:a}}

// 改状态：只认 NEXT 里的变法；结束要带一个原因
function setStatus(s,id,to,why,now){const a=findAct(s,id);if(!a)return{err:'act'};const from=statusOf(a,now);
  if(!NEXT[from]||!NEXT[from].includes(to))return{err:'bad'};if(to==='ended'&&!WHY.includes(why))return{err:'bad'};
  a.status=to;if(to==='ended')a.endWhy=why;return{act:a}}

// tier 是第几等奖（0 留给"谢谢参与"）；stock 是 null 就是不限
const prizeWhy=p=>!p||!int(p.tier)||p.tier<0||p.tier>9||!str(p.name,30)||!(typeof p.weight==='number'&&p.weight>0&&p.weight<=1e6)||!(p.stock===null||(int(p.stock)&&p.stock>=0&&p.stock<=1e5));
function addPrize(s,id,p,pid){const a=findAct(s,id);if(!a)return{err:'act'};if(prizeWhy(p))return{err:'bad'};
  const x={id:pid,tier:p.tier,name:p.name.trim(),weight:p.weight,stock:p.stock,given:0};a.prizes.push(x);return{prize:x}}
// 改奖品：库存不能改到比已经发出去的少
function editPrize(s,id,pid,p){const a=findAct(s,id),x=a&&a.prizes.find(q=>q.id===pid);if(!x)return{err:'act'};const y={...x,...p};
  if(prizeWhy(y)||(y.stock!==null&&y.stock<x.given))return{err:'bad'};Object.assign(x,{tier:y.tier,name:y.name.trim(),weight:y.weight,stock:y.stock});return{prize:x}}
// 补货：库存 += n
function restock(s,id,pid,n){const a=findAct(s,id),x=a&&a.prizes.find(q=>q.id===pid);if(!x)return{err:'act'};
  if(!int(n)||n<1||n>1e5||x.stock===null)return{err:'bad'};x.stock+=n;return{prize:x}}

/* ---------- 次数 ---------- */
// manual：管理员加或减，减到不少于已经抽掉的；codehub、jiaxian、github：同一个活动、同一个工号只发一笔 1 次，再来回 dup
function grant(s,{act,emp,src,n,by='',why=''},now){const a=findAct(s,act);if(!a||statusOf(a,now)==='ended')return{err:'act'};
  const k=empKey(emp);if(!empOk(k)||!SRC.includes(src))return{err:'bad'};
  if(src==='manual'){if(!int(n)||n===0||Math.abs(n)>1000)return{err:'bad'};if(left(s,act,k)+n<0)return{err:'none'}}
  else{if(s.grants.some(g=>g.act===act&&g.emp===k&&g.src===src))return{dup:true,left:left(s,act,k)};n=1}
  const g={act,emp:k,src,n,by:String(by),why:String(why).trim().slice(0,60),t:now};s.grants.push(g);return{grant:g,left:left(s,act,k)}}

/* ---------- 抽 ---------- */
// 从有权重、还有库存的奖品里按权重抽；库存 0 的退出，剩下的权重自然归一
function pick(prizes,rnd){const pool=prizes.filter(p=>p.weight>0&&(p.stock===null||p.given<p.stock));if(!pool.length)return null;
  let r=rnd()*pool.reduce((t,p)=>t+p.weight,0);for(const p of pool){r-=p.weight;if(r<0)return p}return pool[pool.length-1]}
// 一次抽奖从头到尾是同步的：查活动、查时间、查次数、抽、扣库存、记一笔，中间不让出去，同一个进程里两次抽奖不会交错
function draw(s,{act,emp,via,by=''},now,rnd){const a=findAct(s,act);if(!a)return{err:'act'};
  if(a.status==='live'&&((a.start&&now<a.start)||(a.end&&now>=a.end)))return{err:'time'};if(a.status!=='live')return{err:'act'};
  const k=empKey(emp);if(!empOk(k)||!VIA.includes(via))return{err:'bad'};if(left(s,act,k)<1)return{err:'none'};
  const p=pick(a.prizes,rnd);if(!p)return{err:'empty'};
  p.given++;const d={act,emp:k,prize:p.id,tier:p.tier,name:p.name,via,by:String(by),t:now};s.draws.push(d);return{draw:d,left:left(s,act,k)}}

module.exports={SRC,STATUS,WHY,empKey,empOk,fresh,load,findAct,statusOf,left,addAct,setStatus,addPrize,editPrize,restock,grant,pick,draw};
