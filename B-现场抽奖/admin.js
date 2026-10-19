/* 1024 现场抽奖 · 设置页（admin.html）。设计见 README.md，接口在 server.js。
   工号是现场手输的，插进网页的每个值都过 esc()。 */
(()=>{
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TIER=t=>['谢谢惠顾','一等奖','二等奖','三等奖'][t]||'?';
const ERR={bad:'填得不对',none:'找不到了，刷新一下',dup:'这个工号之前中过',disk:'没存上：看一下磁盘',net:'连不上抽奖服务'};
async function api(m,p,b){try{const r=await fetch('api/'+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return await r.json()}catch(e){return{err:'net'}}}
// 按钮旁边的一句回话，几秒后自己消失
const say=(el,t,bad)=>{el.textContent=t;el.classList.toggle('bad',!!bad);clearTimeout(el._t);el._t=setTimeout(()=>{el.textContent=''},5000)};
const when=t=>{if(!t)return'';const d=new Date(t),p=n=>String(n).padStart(2,'0');return`${d.getMonth()+1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};
let S=null,D=[];

/* ---------- 现场：概况、暂停、提示、图鉴卡 ---------- */
async function load(){const r=await api('GET','state');if(r.err){$('live').textContent=ERR.net;return}S=r;
  const won=D.filter(d=>d.tier>0&&!d.void).length;
  $('stats').innerHTML=`<span><b>${esc(r.total)}</b>次</span><span><b>${esc(won)}</b>中奖</span><span><b>${esc(r.card.given)}</b>张图鉴卡发出去了</span>${r.pending?`<span style="color:var(--bad)">第 ${esc(r.pending.no)} 次中了${esc(TIER(r.pending.tier))}，还没登记工号</span>`:''}`;
  $('openTag').textContent=r.open?'抽奖开着':'暂停中';$('openTag').className='tag '+(r.open?'on':'off');$('openBtn').textContent=r.open?'暂停':'继续';
  if(document.activeElement!==$('note'))$('note').value=r.note||'';if(document.activeElement!==$('cards'))$('cards').value=r.card.stock;
  $('cardInfo').textContent=`已经发了 ${r.card.given} 张，还剩 ${Math.max(0,r.card.rest)} 张`;drawPrizes()}
const setting=async(body,el,ok)=>{const r=await api('POST','settings',body);if(r.err)return say(el,ERR[r.err]||'没保存上',1);say(el,ok);load()};
$('openBtn').onclick=()=>{const on=!S.open;if(!on&&!confirm('暂停抽奖？抽奖页上"抽一次"会点不了。'))return;setting({open:on},$('openMsg'),on?'继续了':'暂停了')};
$('noteBtn').onclick=()=>setting({note:$('note').value},$('noteMsg'),'保存了');
$('cardBtn').onclick=()=>{const n=Number($('cards').value);if(!Number.isInteger(n)||n<0)return say($('cardMsg'),'填不小于 0 的整数',1);
  if(n<S.card.given)return say($('cardMsg'),`不能少于已经发出去的 ${S.card.given} 张`,1);setting({cardStock:n},$('cardMsg'),'保存了')};

/* ---------- 奖品 ---------- */
function drawPrizes(){const P=S.prizes.slice().sort((a,b)=>(a.tier||9)-(b.tier||9)),w=P.filter(p=>p.weight>0&&(p.rest===null||p.rest>0)).reduce((t,p)=>t+p.weight,0);
  $('prizes').innerHTML=P.map(p=>{const on=p.weight>0&&(p.rest===null||p.rest>0);return`<tr><td>${esc(TIER(p.tier))}</td><td>${esc(p.name)}</td><td class="n">${esc(p.weight)}</td><td class="n">${p.stock===null?'不限':esc(p.stock)}</td>
    <td class="n">${esc(p.given)}</td><td class="n">${p.rest===null?'—':esc(p.rest)}</td><td class="n">${on&&w?(p.weight/w*100).toFixed(1)+'%':'0'}</td>
    <td><div class="acts">${p.stock===null?'':`<button class="lbtn" data-re="${esc(p.id)}">补货</button>`}<button class="lbtn" data-ed="${esc(p.id)}">改</button>${p.given?'':`<button class="lbtn" data-del="${esc(p.id)}">删</button>`}</div></td></tr>`}).join('')||'<tr><td colspan="8" class="hint">还没有奖品，先在下面加。</td></tr>';
  const find=id=>S.prizes.find(p=>p.id===id);
  $('prizes').querySelectorAll('[data-re]').forEach(b=>b.onclick=async()=>{const p=find(b.dataset.re),n=Math.floor(+prompt(`给「${p.name}」补几份？（现在还剩 ${p.rest} 份）`,'1'));if(!(n>=1))return;
    const r=await api('POST','restock',{id:p.id,n});if(r.err)alert(ERR[r.err]);load()});
  $('prizes').querySelectorAll('[data-ed]').forEach(b=>b.onclick=async()=>{const p=find(b.dataset.ed);const name=prompt('名称',p.name);if(name===null)return;const w=prompt('权重（0 就是停掉这一档）',p.weight);if(w===null)return;
    const s=prompt(`库存（空着=不限；不能少于已经发出去的 ${p.given} 份）`,p.stock===null?'':p.stock);if(s===null)return;
    const r=await api('POST','prize',{id:p.id,tier:p.tier,name,weight:+w,stock:s.trim()===''?null:+s});if(r.err)alert('没改成：名称 1～30 个字，权重不小于 0，库存是整数、不少于已发');load()});
  $('prizes').querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{const p=find(b.dataset.del);if(!confirm(`删掉「${p.name}」？`))return;await api('POST','prize/del',{id:p.id});load()})}
$('pAdd').onclick=async()=>{const s=$('pStock').value.trim(),r=await api('POST','prize',{tier:+$('pTier').value,name:$('pName').value,weight:+$('pW').value,stock:s===''?null:+s});
  if(r.err)return say($('pMsg'),'名称 1～30 个字，权重不小于 0，库存是不小于 0 的整数或者空着',1);$('pName').value='';$('pStock').value='';say($('pMsg'),'加上了');load()};

/* ---------- 记录：改工号、作废、导出 ---------- */
async function loadRows(){const r=await api('GET','draws');if(r.err)return;D=r.draws;drawRows()}
function drawRows(){const only=$('onlyWon').checked,q=$('q').value.trim().toUpperCase(),L=D.filter(d=>(!only||d.tier>0)&&(!q||(d.emp||'').includes(q)));
  $('rCount').textContent=`一共 ${D.length} 次${only||q?`，符合的 ${L.length} 次`:''}`;
  $('rows').innerHTML=L.slice(0,300).map(d=>`<tr class="${d.void?'void':''}"><td class="n">${esc(d.no)}</td><td>${esc(when(d.t))}</td><td>${esc(TIER(d.tier))}</td><td>${esc(d.name)}</td>
    <td>${d.tier>0?(d.emp?esc(d.emp):d.void?'':'<span style="color:var(--bad)">没登记</span>'):''}</td><td>${d.card?'发了':''}</td>
    <td>${d.tier>0&&!d.void?`<div class="acts"><button class="lbtn" data-emp="${esc(d.no)}">${d.emp?'改工号':'登记'}</button><button class="lbtn" data-void="${esc(d.no)}">作废</button></div>`:d.void?'作废了':''}</td></tr>`).join('')||'<tr><td colspan="7" class="hint">还没有记录。</td></tr>';
  $('rows').querySelectorAll('[data-emp]').forEach(b=>b.onclick=async()=>{const no=+b.dataset.emp,d=D.find(x=>x.no===no),emp=prompt(`第 ${no} 次（${TIER(d.tier)} · ${d.name}）的工号`,d.emp||'');if(!emp)return;
    let r=await api('POST','claim',{no,emp});if(r.err==='dup'&&confirm(`${emp} 之前中过：${r.prev.map(x=>`第 ${x.no} 次 ${TIER(x.tier)}`).join('、')}。还是登记？`))r=await api('POST','claim',{no,emp,force:true});
    if(r.err&&r.err!=='dup')alert(ERR[r.err]||'没登记上');refresh()});
  $('rows').querySelectorAll('[data-void]').forEach(b=>b.onclick=async()=>{const no=+b.dataset.void,d=D.find(x=>x.no===no);if(!confirm(`作废第 ${no} 次的${TIER(d.tier)}（${d.emp||'没登记'}）？奖品放回奖池，导出的中奖名单里不再有它。`))return;
    const r=await api('POST','void',{no});if(r.err)alert(ERR[r.err]||'没作废成');refresh()})}
$('onlyWon').onchange=drawRows;$('q').oninput=drawRows;
const download=what=>{const a=document.createElement('a');a.href='api/export?what='+what;a.click()};
$('exWon').onclick=()=>download('won');$('exAll').onclick=()=>download('all');

$('reset').onclick=async()=>{if(!confirm('清空重来？\n先备份到 data/backups/，再清掉所有抽奖记录、已发归零；奖品设置留着。'))return;if(prompt('确认就输入"清空"')!=='清空')return;
  const r=await api('POST','reset');if(r.err)return say($('resetMsg'),ERR[r.err]||'没清成',1);say($('resetMsg'),'清空了，备份在 data/backups/');refresh()};

async function refresh(){await loadRows();await load()}
refresh();setInterval(()=>{if(!document.hidden)refresh()},5000)})();
