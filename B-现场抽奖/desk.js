/* 1024 现场抽奖 · 抽奖页（index.html）。设计见 README.md，接口在 server.js。
   工作人员确认这个人满足条件 → 点"抽一次"（空格）→ 扭蛋机转、晃、裂开（scene.js）→
   中了：当场登记工号（同工号中过先提醒），登记了才能抽下一次；真登记不了就作废，奖品放回奖池。
   谢谢惠顾：提示发一张猫猫图鉴卡（还有的话）。
   抽到什么是服务端定的：一按就去抽，扭蛋晃着等结果，结果回来才裂开。页面刷新了，没登记的那一次还在，接着登记。 */
(()=>{
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TIER=t=>['谢谢惠顾','一等奖','二等奖','三等奖'][t]||'';
const ERR={closed:'抽奖暂停了（设置页里打开）',empty:'奖池空了：到设置页补货',disk:'没存上：看一下这台电脑的磁盘',net:'连不上抽奖服务：看一下黑窗口还开着没有',bad:'工号不对：字母、数字、- 和 _，2～32 位',none:'没有这一次'};
const sfx=k=>{try{Sound.sfx(k)}catch(e){}};
async function api(m,p,b){try{const r=await fetch('api/'+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return await r.json()}catch(e){return{err:'net'}}}

/* ---------- 右边的窗：等着 → 转着 → 中了（登记）/ 谢谢惠顾 ---------- */
let S=null,cur=null,busy=false;   // S：最近一次 /api/state；cur：刚抽到、还在窗里的那一次
const panel=html=>{$('panel').innerHTML=html;const f=$('panel').querySelector('input');if(f)setTimeout(()=>f.focus(),30)};
function stock(){if(!S)return'';const P=S.prizes.filter(p=>p.tier>0).sort((a,b)=>a.tier-b.tier);
  return`<div class="stock">${P.map(p=>`<span class="${p.rest===0?'out':''}">${esc(TIER(p.tier))} · ${esc(p.name)} <b>${p.rest===null?'不限':'剩 '+p.rest}</b></span>`).join('')}<span class="${S.card.rest<=0?'out':''}">猫猫图鉴卡 <b>剩 ${esc(Math.max(0,S.card.rest))}</b></span></div>`}
function idle(msg){cur=null;sc.ready(!!(S&&S.open));
  panel(`<h2>${S&&!S.open?'抽奖暂停了':'下一位'}</h2>${S&&S.note?`<p class="note">${esc(S.note)}</p>`:'<p>先确认这个人满足条件，再抽。</p>'}
    <div class="row"><button class="pbtn" id="go" ${S&&!S.open?'disabled':''}>抽一次 <kbd>空格</kbd></button></div><p class="err">${esc(msg||'')}</p>${stock()}`);
  $('go').onclick=go}
function lose(d){cur=d;const n=S?Math.max(0,S.card.rest):0;
  panel(`<p class="tier no">谢谢惠顾</p>${d.card?`<p class="card">请发一张猫猫图鉴卡</p><p>图鉴卡还剩 ${esc(n)} 张</p>`:'<p>图鉴卡发完了</p>'}
    <div class="row"><button class="pbtn" id="go">下一位 · 抽一次 <kbd>空格</kbd></button></div>${stock()}`);$('go').onclick=go}
// 中了：登记工号。dup 是同工号中过的那几次（工作人员决定还是登记，还是作废这一次）
function win(d,{emp='',err='',dup=null}={}){cur=d;
  panel(`<p class="tier">${esc(TIER(d.tier))}！</p><p class="prize">${esc(d.name)}</p>
    <h2>登记工号</h2><form id="cf"><input type="text" id="emp" maxlength="32" placeholder="工号" autocomplete="off" spellcheck="false" value="${esc(emp)}"><button class="pbtn">登记</button></form>
    ${dup?`<p class="warn">${esc(dup.emp)} 之前中过：${dup.prev.map(x=>`第 ${x.no} 次 ${esc(TIER(x.tier))} · ${esc(x.name)}`).join('；')}</p><div class="row"><button class="pbtn" id="force">还是登记</button><button class="lbtn" id="vd">作废这一次</button></div>`:''}
    <p class="err">${esc(err)}</p><p>登记以后，活动结束后组织方按工号联系兑奖。登记之前不能抽下一次。</p>
    ${dup?'':'<div class="row"><button class="lbtn sm" id="vd">登记不了：作废这一次，奖品放回奖池</button></div>'}`);
  $('cf').onsubmit=e=>{e.preventDefault();claim($('emp').value,false)};$('vd').onclick=voidIt;if($('force'))$('force').onclick=()=>claim(dup.emp,true)}
function claimed(d){cur=d;panel(`<p class="tier">${esc(TIER(d.tier))}</p><p class="prize">${esc(d.name)}</p><h2>登记好了 · ${esc(d.emp)}</h2><p>活动结束后组织方按工号联系兑奖。</p>
  <div class="row"><button class="pbtn" id="go">下一位 · 抽一次 <kbd>空格</kbd></button></div>${stock()}`);$('go').onclick=go;sc.ready(true)}

async function claim(emp,force){emp=emp.trim();if(!emp)return;const r=await api('POST','claim',{no:cur.no,emp,force});
  if(r.err==='dup')return win(cur,{emp,dup:{emp:emp.replace(/\s+/g,'').toUpperCase(),prev:r.prev}});
  if(r.err)return win(cur,{emp,err:ERR[r.err]||'没登记上'});sfx('stamp');await load();claimed(r.draw)}
async function voidIt(){if(!confirm(`作废第 ${cur.no} 次的${TIER(cur.tier)}？奖品放回奖池，这一次不算。`))return;const r=await api('POST','void',{no:cur.no});
  if(r.err)return win(cur,{err:ERR[r.err]||'没作废成'});await load();idle(`第 ${r.draw.no} 次作废了，奖品放回奖池`)}

// 抽：按钮收起来，同时去抽；结果回来以后，扭蛋裂开时揭晓
async function go(){if(busy||(cur&&cur.tier>0&&!cur.emp&&!cur.void)||(S&&!S.open))return;if(!sc.spin())return;busy=true;
  panel(`<p class="big">转啊转……</p>`);const r=await api('POST','draw');
  if(r.err){busy=false;sc.abort();await load();if(r.err==='pending'){const d=S.pending;return d?win(d,{err:'这一次还没登记'}):idle()}return idle(ERR[r.err]||'没抽成')}
  sc.result(r.draw)}
function shown(d){busy=false;load().then(()=>{if(d.tier>0){sfx('prize');win(d)}else lose(d)})}

async function load(){const r=await api('GET','state');if(r.err)return false;S=r;$('count').textContent=`已经抽了 ${r.total} 次`;return true}

/* ---------- 左边的扭蛋机（scene.js） ---------- */
const LW=220,LH=128,cv=$('cv'),ctx=cv.getContext('2d');cv.width=LW;cv.height=LH;
const sc=LottoScene.create({onShown:shown});
function fit(){const st=$('stage'),narrow=innerWidth<=900,w=narrow?innerWidth-32:st.clientWidth,h=narrow?innerHeight*.45:st.clientHeight,s=Math.max(1,Math.floor(Math.min(w/LW,h/LH)));cv.style.width=LW*s+'px';cv.style.height=LH*s+'px'}
addEventListener('resize',fit);fit();
function frame(ms){use(ctx);ctx.fillStyle='#1c1424';ctx.fillRect(0,0,LW,LH);sc.draw(ms/1000,LW,LH,{hint:!cur&&S&&S.open?'按空格抽一次':''});requestAnimationFrame(frame)}

// 空格 / 回车：等着、谢谢惠顾、登记好了的时候就是"抽一次"；在输入框里不算
addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat&&document.activeElement.tagName!=='INPUT'&&$('go')&&!$('go').disabled){e.preventDefault();go()}});
// 暂停、补货这些设置页改的：隔一会儿问一次（转着、等登记的时候不打断）
setInterval(async()=>{if(busy||cur&&cur.tier>0&&!cur.emp)return;if(await load()&&!cur)idle()},8000);

PXT.ready.then(async()=>{requestAnimationFrame(frame);if(!await load())return idle(ERR.net);if(S.pending)return win(S.pending);idle()})})();
