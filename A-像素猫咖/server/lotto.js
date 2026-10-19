/* 1024 猫咖 · 抽奖系统的存盘和接口。设计见 docs/抽奖系统.md，规则在 lotto-core.js。
   数据在数据目录的 lotto.json，和名册 cats.json 分开。每次改动当场写完再回：回了"抽中一等奖"，记录就已经在磁盘上了。
   管理员接口挂在后台下面（/api/admin/lotto/*），先沿用后台口令；w3 接好以后换成 w3 + 白名单。 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),L=require('./lotto-core');
module.exports=(S,{csv,fmt})=>{
const FILE=path.join(S.DATA,'lotto.json');
let st=L.fresh();try{st=L.load(JSON.parse(fs.readFileSync(FILE,'utf8')))}catch(e){if(e.code!=='ENOENT')throw e}
// 读坏了不能当空库接着写，那会把原来的记录盖掉：上面除了"文件还没有"，别的错误都直接让服务起不来
function write(){fs.mkdirSync(S.DATA,{recursive:true});const tmp=FILE+'.tmp',fd=fs.openSync(tmp,'w');try{fs.writeSync(fd,JSON.stringify(st));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,FILE)}
const id=()=>crypto.randomBytes(4).toString('hex');
const rnd=()=>crypto.randomInt(2**47)/2**47;
// 改东西的都走这里：规则说可以才写盘；规则出了错、写盘失败，都把内存退回改之前，免得内存里有、磁盘上没有
function commit(fn){const before=JSON.stringify(st);let r;
  try{r=fn();if(r.err)return[r.err==='bad'?400:409,{err:r.err}];write()}catch(e){st=L.load(JSON.parse(before));console.error('抽奖没存上',e);return[500,{err:'disk'}]}return[200,r]}
const ERR404=[404,{err:'act'}];

// 给后台看的活动：此刻的状态、每个奖品还剩几个、抽了多少次、多少人有次数
function pubAct(a,now=Date.now()){const ds=st.draws.filter(d=>d.act===a.id),emps=new Set(st.grants.filter(g=>g.act===a.id).map(g=>g.emp));
  return{...a,status:L.statusOf(a,now),prizes:a.prizes.map(p=>({...p,rest:p.stock===null?null:p.stock-p.given})),draws:ds.length,people:emps.size}}
// 进行中的活动（前台、加次数默认用它）：有好几个的话取最后建的
const current=(now=Date.now())=>[...st.acts].reverse().find(a=>L.statusOf(a,now)==='live')||null;
function empView(act,emp){const k=L.empKey(emp);return{emp:k,left:L.left(st,act,k),grants:st.grants.filter(g=>g.act===act&&g.emp===k),draws:st.draws.filter(d=>d.act===act&&d.emp===k)}}
function draws(q){const act=q.get('act'),tier=q.get('tier'),emp=L.empKey(q.get('emp')||'');
  return st.draws.filter(d=>d.act===act&&(tier===null||tier===''||d.tier===+tier)&&(!emp||d.emp.includes(emp))).slice().reverse()}
const SRC_N={manual:'管理员加',codehub:'codehub star',jiaxian:'稼先关注',github:'github star'},VIA_N={w3:'自己登录抽',desk:'前台代抽'};
const tierN=t=>t===0?'没中':`${t} 等奖`;
function exportCsv(q){const a=L.findAct(st,q.get('act'));if(!a)return ERR404;const won=q.get('all')!=='1';
  const ds=st.draws.filter(d=>d.act===a.id&&(!won||d.tier>0)).sort((x,y)=>x.t-y.t);
  return{csv:csv([['工号','几等奖','奖品','抽奖时间','怎么抽的'],...ds.map(d=>[d.emp,tierN(d.tier),d.name,fmt(d.t),VIA_N[d.via]||d.via])]),name:`${a.name}-${won?'中奖名单':'全部抽奖记录'}.csv`}}

const R={
  'GET state':()=>{const now=Date.now(),c=current(now);return[200,{acts:st.acts.map(a=>pubAct(a,now)),current:c?c.id:null}]},
  'POST act':({body})=>commit(()=>L.addAct(st,{name:body.name,start:body.start??null,end:body.end??null},id())),
  'POST act/status':({body})=>commit(()=>L.setStatus(st,body.id,body.to,body.why,Date.now())),
  'POST prize':({body})=>commit(()=>L.addPrize(st,body.act,{tier:body.tier,name:body.name,weight:body.weight,stock:body.stock??null},id())),
  'POST prize/edit':({body})=>{const p={};for(const k of ['tier','name','weight','stock'])if(k in body)p[k]=body[k];return commit(()=>L.editPrize(st,body.act,body.id,p))},
  'POST restock':({body})=>commit(()=>L.restock(st,body.act,body.id,body.n)),
  // 查一个工号：剩几次、发过几笔、抽到过什么
  'GET emp':({url})=>{const q=url.searchParams,act=q.get('act')||(current()||{}).id;if(!L.findAct(st,act))return ERR404;const k=L.empKey(q.get('emp'));if(!L.empOk(k))return[400,{err:'bad'}];return[200,empView(act,k)]},
  // 管理员加次数：src 固定是 manual，why 是原因（关注进群、互动游戏、github star 截图……）
  'POST grant':({body,ip})=>commit(()=>L.grant(st,{act:body.act,emp:body.emp,src:'manual',n:body.n,by:'后台 '+ip,why:body.why},Date.now())),
  // 前台代抽：管理员登录的前台电脑上，用户输自己的工号
  'POST draw':({body,ip})=>commit(()=>L.draw(st,{act:body.act||(current()||{}).id,emp:body.emp,via:'desk',by:'前台 '+ip},Date.now(),rnd)),
  'GET draws':({url})=>{const L2=draws(url.searchParams);return[200,{draws:L2.slice(0,500),total:L2.length}]},
  'GET export':({url})=>exportCsv(url.searchParams)};

function handle(method,sub,ctx){const h=R[method+' '+sub];return h?h(ctx):[404,{err:'none'}]}
return{handle,current,SRC_N}};
