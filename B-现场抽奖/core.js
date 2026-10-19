/* 1024 现场抽奖 · 规则（设计见 README.md）：按权重从有库存的奖品里抽、谢谢惠顾发图鉴卡、中奖登记工号、同工号提醒、作废放回。
   只改传进来的 state，不读写文件；时间 now、随机数 rnd（返回 [0,1)）从外面传。回了 {err} 的，state 一点没动。
   state = {open, note, card:{stock, given}, prizes:[{id, tier, name, weight, stock, given}], draws:[{no, t, prize, tier, name, card, emp, et, void}]} */
const TIERS=[0,1,2,3];   // 0 是谢谢惠顾
const int=v=>Number.isInteger(v);
const str=(v,max)=>typeof v==='string'&&v.trim().length>=1&&v.trim().length<=max;
// 工号：去掉空格、转大写；字母、数字、- _，2～32 位（和猫咖的集章登记一样）
const empKey=e=>String(e==null?'':e).normalize('NFKC').replace(/\s+/g,'').toUpperCase();
const empOk=k=>/^[A-Z0-9_-]{2,32}$/.test(k);

const fresh=()=>({open:true,note:'',card:{stock:0,given:0},prizes:[],draws:[]});
// 读库：缺的补上；认不出等级的奖品不进抽奖（权重当 0），后台看得见、能改
function load(j){const s={...fresh(),...(j&&typeof j==='object'&&!Array.isArray(j)?j:{})};
  if(!Array.isArray(s.prizes))s.prizes=[];if(!Array.isArray(s.draws))s.draws=[];
  s.card={stock:int(s.card&&s.card.stock)?s.card.stock:0,given:int(s.card&&s.card.given)?s.card.given:0};
  for(const p of s.prizes)if(!TIERS.includes(p.tier))p.weight=0;return s}

const rest=p=>p.stock===null?null:p.stock-p.given;
const live=p=>p.weight>0&&(p.stock===null||p.given<p.stock);
const winOf=s=>s.draws.find(d=>d.tier>0&&!d.void&&!d.emp)||null;   // 中了奖还没登记的那一次

/* ---------- 奖品 ---------- */
const prizeBad=p=>!p||!TIERS.includes(p.tier)||!str(p.name,30)||!(typeof p.weight==='number'&&p.weight>=0&&p.weight<=1e6)||!(p.stock===null||(int(p.stock)&&p.stock>=0&&p.stock<=1e5));
// 新加（没有 id 的）或者改；改库存不能少于已经发出去的
function setPrize(s,p,newId){const x=p&&p.id?s.prizes.find(q=>q.id===p.id):null;if(p&&p.id&&!x)return{err:'none'};
  const y={tier:p.tier,name:typeof p.name==='string'?p.name.trim():p.name,weight:p.weight,stock:p.stock===undefined?null:p.stock};if(prizeBad(y))return{err:'bad'};
  if(x){if(y.stock!==null&&y.stock<x.given)return{err:'bad'};Object.assign(x,y);return{prize:x}}
  const n={id:newId,...y,given:0};s.prizes.push(n);return{prize:n}}
function delPrize(s,id){const i=s.prizes.findIndex(q=>q.id===id);if(i<0)return{err:'none'};if(s.prizes[i].given>0)return{err:'bad'};return{prize:s.prizes.splice(i,1)[0]}}
function restock(s,id,n){const x=s.prizes.find(q=>q.id===id);if(!x)return{err:'none'};if(!int(n)||n<1||n>1e5||x.stock===null)return{err:'bad'};x.stock+=n;return{prize:x}}
// 设置：暂停开关、抽奖页上的一句提示、图鉴卡总数（不能少于已经发出去的）
function settings(s,o){const n={};if('open' in o){if(typeof o.open!=='boolean')return{err:'bad'};n.open=o.open}
  if('note' in o){if(typeof o.note!=='string'||o.note.length>60)return{err:'bad'};n.note=o.note.trim()}
  if('cardStock' in o){if(!int(o.cardStock)||o.cardStock<s.card.given||o.cardStock>1e5)return{err:'bad'};n.cardStock=o.cardStock}
  if('open' in n)s.open=n.open;if('note' in n)s.note=n.note;if('cardStock' in n)s.card.stock=n.cardStock;return{ok:true}}

/* ---------- 抽 ---------- */
function pick(prizes,rnd){const pool=prizes.filter(live);if(!pool.length)return null;
  let r=rnd()*pool.reduce((t,p)=>t+p.weight,0);for(const p of pool){r-=p.weight;if(r<0)return p}return pool[pool.length-1]}
function draw(s,now,rnd){if(!s.open)return{err:'closed'};const w=winOf(s);if(w)return{err:'pending',no:w.no};
  const p=pick(s.prizes,rnd);if(!p)return{err:'empty'};p.given++;
  const card=p.tier===0&&s.card.given<s.card.stock;if(card)s.card.given++;
  const d={no:s.draws.length+1,t:now,prize:p.id,tier:p.tier,name:p.name,card,emp:null,et:null,void:false};s.draws.push(d);return{draw:d}}

/* ---------- 中奖登记、作废 ---------- */
// 同一个工号之前中过（没作废的），不带 force 就回 dup 和之前那几次，让工作人员决定；登记过的再登记一次就是改
function claim(s,no,emp,force,now){const d=s.draws.find(x=>x.no===no);if(!d)return{err:'none'};if(d.tier===0||d.void)return{err:'bad'};
  const k=empKey(emp);if(!empOk(k))return{err:'bad'};
  const prev=s.draws.filter(x=>x!==d&&x.tier>0&&!x.void&&x.emp===k).map(x=>({no:x.no,tier:x.tier,name:x.name}));if(prev.length&&!force)return{err:'dup',prev};
  d.emp=k;d.et=now;return{draw:d}}
function voidDraw(s,no){const d=s.draws.find(x=>x.no===no);if(!d)return{err:'none'};if(d.tier===0||d.void)return{err:'bad'};
  const p=s.prizes.find(q=>q.id===d.prize);if(p&&p.given>0)p.given--;d.void=true;return{draw:d}}
// 清空重来（彩排完用）：记录清掉、已发归零，奖品设置留着
function reset(s){s.draws=[];for(const p of s.prizes)p.given=0;s.card.given=0;return{ok:true}}

module.exports={TIERS,empKey,empOk,fresh,load,rest,winOf,setPrize,delPrize,restock,settings,pick,draw,claim,voidDraw,reset};
