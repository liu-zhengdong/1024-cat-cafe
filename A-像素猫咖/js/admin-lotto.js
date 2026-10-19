/* 1024 猫咖 · 组织者后台里"现场抽奖"那一块（admin.html #lotto）。设计见 docs/抽奖系统.md，接口是 server/lotto.js。
   接口、弹窗、小工具借 admin.js 的（window.AdminKit）；工号是组织者和用户输的，插进网页一样过 esc()。 */
window.LottoAdmin=(()=>{
const $=id=>document.getElementById(id),K=()=>window.AdminKit;
const api=(m,p,b)=>K().api(m,'/lotto/'+p,b),esc=s=>K().esc(s);
const TIER=t=>t===0?'谢谢参与':['','一','二','三','四','五','六','七','八','九'][t]+'等奖';
const STAT={draft:['草稿',''],live:['进行中','live'],paused:['暂停中','ban'],ended:['已结束','']};
const WHY={done:'到期',early:'提前结束',abort:'中止'};
const ERR={act:'活动不在进行中（或者没选活动）',none:'次数不够',bad:'填得不对',empty:'奖池空了',time:'不在活动时间里',disk:'没存上，看一下服务器的磁盘'};
let acts=[],cur=null;
const act=()=>acts.find(a=>a.id===cur)||null;

async function load(){const r=await api('GET','state');acts=r.acts||[];if(!acts.some(a=>a.id===cur))cur=r.current||(acts[acts.length-1]||{}).id||null;drawAct();await loadRows()}

/* ---------- 活动 ---------- */
function drawAct(){const a=act();
  $('lact').innerHTML=acts.length?acts.map(x=>`<option value="${esc(x.id)}"${x.id===cur?' selected':''}>${esc(x.name)}</option>`).join(''):'<option>还没有活动</option>';
  const [n,k]=a?STAT[a.status]||['?','']:['—',''];$('lstat').textContent=a&&a.status==='ended'&&a.endWhy?`${n}（${WHY[a.endWhy]||a.endWhy}）`:n;$('lstat').className='tag '+k;
  const B={draft:[['live','开始']],live:[['paused','暂停'],['ended','结束']],paused:[['live','继续'],['ended','结束']],ended:[]}[a?a.status:'ended']||[];
  $('lbtns').innerHTML=B.map(([to,t])=>`<button class="${to==='ended'?'lbtn warn':'lbtn'}" data-to="${to}">${t}</button>`).join('');
  $('lbtns').querySelectorAll('[data-to]').forEach(b=>b.onclick=()=>status(b.dataset.to));
  const tm=t=>t?new Date(t).toLocaleString():'';
  $('lsum').textContent=a?`抽了 ${a.draws} 次 · ${a.people} 个工号有过次数${a.start||a.end?` · 时间：${tm(a.start)||'不限'} ～ ${tm(a.end)||'不限'}`:''}`:'先新建一个活动，配好奖品，再点"开始"。';
  drawPrizes(a)}
$('lact').onchange=e=>{cur=e.target.value;drawAct();loadRows()};
async function status(to){const a=act();if(!a)return;
  if(to!=='ended'){const r=await api('POST','act/status',{id:a.id,to});if(r.err)alert(ERR[r.err]||'没改成');return load()}
  K().modal(`<h2>结束「${esc(a.name)}」</h2><p>结束以后不能再抽、不能再加次数，也不能重新开始；记录都留着，照样能导出。</p><div class="row"><button class="lbtn" data-x>算了</button><button class="lbtn warn" data-w="abort">中止（出了问题）</button><button class="pbtn" data-w="early">结束</button></div>`,m=>{
    m.querySelector('[data-x]').onclick=K().close;m.querySelectorAll('[data-w]').forEach(b=>b.onclick=async()=>{await api('POST','act/status',{id:a.id,to:'ended',why:b.dataset.w});K().close();load()})})}
$('lnew').onclick=()=>K().modal(`<h2>新建活动</h2><p><input type="text" data-n maxlength="40" placeholder="活动名称，比如：1024 现场抽奖"></p><p>开始时间（选填）<input type="datetime-local" data-s></p><p>结束时间（选填，到点自动结束）<input type="datetime-local" data-e></p><p class="err"></p><div class="row"><button class="lbtn" data-x>算了</button><button class="pbtn" data-go>建</button></div>`,m=>{
  const v=k=>m.querySelector(`[data-${k}]`).value,ts=s=>s?new Date(s).getTime():null;m.querySelector('[data-x]').onclick=K().close;
  m.querySelector('[data-go]').onclick=async()=>{const r=await api('POST','act',{name:v('n').trim(),start:ts(v('s')),end:ts(v('e'))});
    if(!r.act){m.querySelector('.err').textContent='名称 1～40 个字；结束时间要晚于开始时间';return}cur=r.act.id;K().close();load()}});

/* ---------- 奖品 ---------- */
function drawPrizes(a){const P=a?a.prizes:[],w=P.filter(p=>p.weight>0&&(p.rest===null||p.rest>0)).reduce((t,p)=>t+p.weight,0);
  $('lprizes').innerHTML=P.length?P.map(p=>{const on=p.rest===null||p.rest>0;return`<tr><td>${esc(TIER(p.tier))}</td><td>${esc(p.name)}</td><td class="n">${esc(p.weight)}</td><td class="n">${p.stock===null?'不限':esc(p.stock)}</td><td class="n">${esc(p.given)}</td>
    <td class="n">${p.rest===null?'—':esc(p.rest)}</td><td class="n">${on&&w?(p.weight/w*100).toFixed(1)+'%':'0'}</td><td><div class="acts">${p.stock===null?'':`<button class="lbtn" data-re="${esc(p.id)}">补货</button>`}<button class="lbtn" data-ed="${esc(p.id)}">改</button></div></td></tr>`}).join(''):'<tr><td colspan="8" class="hint">还没有奖品。</td></tr>';
  $('lprizes').querySelectorAll('[data-re]').forEach(b=>b.onclick=()=>restock(P.find(p=>p.id===b.dataset.re)));
  $('lprizes').querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>edit(P.find(p=>p.id===b.dataset.ed)))}
$('lpadd').onclick=async()=>{const a=act();if(!a)return K().say($('lpmsg'),'先新建活动',1);const s=$('lpstock').value.trim();
  const r=await api('POST','prize',{act:a.id,tier:+$('lptier').value,name:$('lpname').value.trim(),weight:+$('lpw').value,stock:s===''?null:+s});
  if(!r.prize)return K().say($('lpmsg'),'名称 1～30 个字，权重大于 0，库存是不小于 0 的整数或者空着',1);$('lpname').value='';$('lpstock').value='';K().say($('lpmsg'),'加上了');load()};
async function restock(p){const n=Math.floor(+prompt(`给「${p.name}」补几个？（现在还剩 ${p.rest} 个）`,'1'));if(!(n>=1))return;
  const r=await api('POST','restock',{act:cur,id:p.id,n});if(r.err)alert(ERR[r.err]||'没补上');load()}
function edit(p){K().modal(`<h2>改「${esc(p.name)}」</h2><p>名称 <input type="text" data-n maxlength="30" value="${esc(p.name)}"></p><p>权重 <input type="number" data-w min="1" value="${esc(p.weight)}"></p>
  <p>库存（空着=不限；不能少于已经抽出去的 ${esc(p.given)} 个）<input type="number" data-s min="0" value="${p.stock===null?'':esc(p.stock)}"></p><p class="err"></p><div class="row"><button class="lbtn" data-x>算了</button><button class="pbtn" data-go>保存</button></div>`,m=>{
  const v=k=>m.querySelector(`[data-${k}]`).value.trim();m.querySelector('[data-x]').onclick=K().close;
  m.querySelector('[data-go]').onclick=async()=>{const r=await api('POST','prize/edit',{act:cur,id:p.id,name:v('n'),weight:+v('w'),stock:v('s')===''?null:+v('s')});
    if(!r.prize){m.querySelector('.err').textContent='没改成：权重大于 0，库存不能少于已经抽出去的';return}K().close();load()}})}

/* ---------- 加次数、查一个工号 ---------- */
function drawEmp(r){const SRC={manual:'管理员',codehub:'codehub star',jiaxian:'稼先关注',github:'github star'};
  $('lemp').innerHTML=`<b class="big">${esc(r.emp)} 还有 ${esc(r.left)} 次</b><ul>${r.grants.map(g=>`<li>${esc(new Date(g.t).toLocaleTimeString())} ${g.n>0?'+':''}${esc(g.n)} · ${esc(SRC[g.src]||g.src)}${g.why?' · '+esc(g.why):''}</li>`).join('')}
    ${r.draws.map(d=>`<li>${esc(new Date(d.t).toLocaleTimeString())} 抽到 ${esc(TIER(d.tier))} · ${esc(d.name)}</li>`).join('')}</ul>`}
async function query(){const emp=$('lemp-in').value.trim();if(!emp)return;const r=await api('GET',`emp?act=${encodeURIComponent(cur||'')}&emp=${encodeURIComponent(emp)}`);
  if(r.err)return K().say($('lgmsg'),ERR[r.err]||'没查到',1);drawEmp(r)}
$('lq').onclick=query;
$('lgo').onclick=async()=>{const emp=$('lemp-in').value.trim(),n=Math.trunc(+$('ln').value),note=$('lnote').value.trim();if(!emp||!n)return K().say($('lgmsg'),'填工号和次数',1);
  if(n<0&&!confirm(`给 ${emp} 减 ${-n} 次？`))return;
  const r=await api('POST','grant',{act:cur,emp,n,why:$('lwhy').value+(note?' · '+note:'')});if(r.err)return K().say($('lgmsg'),ERR[r.err]||'没加上',1);
  K().say($('lgmsg'),`${r.grant.emp} ${n>0?'加了':'减了'} ${Math.abs(n)} 次，现在 ${r.left} 次`);$('lnote').value='';query();load()};
$('lemp-in').onkeydown=e=>{if(e.key==='Enter')$('lgo').click()};

/* ---------- 抽奖记录、导出 ---------- */
async function loadRows(){if(!cur){$('lrows').innerHTML='';return}const q=new URLSearchParams({act:cur,tier:$('lft').value,emp:$('lfe').value.trim()});
  const r=await api('GET','draws?'+q);const VIA={w3:'自己登录抽',desk:'前台代抽'};
  $('lrows').innerHTML=(r.draws||[]).map(d=>`<tr><td>${esc(new Date(d.t).toLocaleString())}</td><td>${esc(d.emp)}</td><td>${esc(d.tier===0?'没中':TIER(d.tier))}</td><td>${esc(d.name)}</td><td>${esc(VIA[d.via]||d.via)}</td></tr>`).join('')||'<tr><td colspan="5" class="hint">还没有记录。</td></tr>';
  $('lmore').textContent=r.total>(r.draws||[]).length?`只列出最近 ${r.draws.length} 条，一共 ${r.total} 条；全部的导出来看。`:''}
$('lft').onchange=loadRows;$('lfe').oninput=loadRows;
$('lexw').onclick=()=>cur&&K().download(`/lotto/export?act=${encodeURIComponent(cur)}`);
$('lexa').onclick=()=>cur&&K().download(`/lotto/export?act=${encodeURIComponent(cur)}&all=1`);

setInterval(()=>{if(K()&&K().live())load().catch(()=>{})},10000);
return{load}})();
