/* 1024 现场抽奖 · 抽奖页（index.html）。设计见 README.md，接口在 server.js。
   上面是舞台（stage.js）：给围观的人看，扭蛋机、悬念、欢呼、彩带都在那里。下面一条是工作人员的操作条：
   等着 → 抽一次（空格）→ 舞台上演完 → 中了：登记工号（同工号中过先提醒），登记了才能抽下一次；真登记不了就作废，奖品放回奖池
                                       → 谢谢惠顾：提示发一张猫猫图鉴卡（还有的话）
   抽到什么是服务端定的：一按就去抽，扭蛋晃着等结果。页面刷新了，没登记的那一次还在，接着登记。 */
(()=>{
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TIER=t=>['谢谢惠顾','一等奖','二等奖','三等奖'][t]||'';
const ERR={closed:'抽奖暂停了（设置页里打开）',empty:'奖池空了：到设置页补货',disk:'没存上：看一下这台电脑的磁盘',net:'连不上抽奖服务：看一下黑窗口还开着没有',bad:'工号不对：字母、数字、- 和 _，2～32 位',none:'没有这一次'};
const sfx=k=>{try{Sound.sfx(k)}catch(e){}};
async function api(m,p,b){try{const r=await fetch('api/'+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return await r.json()}catch(e){return{err:'net'}}}

/* ---------- 操作条：左边一句话，右边按钮 ---------- */
let S=null,cur=null,busy=false;   // S：最近一次 /api/state；cur：刚抽到、还在条上的那一次
const bar=(title,sub,ctl,cls='')=>{$('say').innerHTML=`<b class="${cls}">${title}</b><span>${sub||'&nbsp;'}</span>`;$('ctl').innerHTML=ctl||'';const f=$('ctl').querySelector('input');if(f)setTimeout(()=>f.focus(),30)};
const stock=()=>!S?'':[...S.prizes.filter(p=>p.tier>0).sort((a,b)=>a.tier-b.tier).map(p=>`${TIER(p.tier)} 剩 ${p.rest===null?'不限':p.rest}`),`图鉴卡 剩 ${Math.max(0,S.card.rest)}`].join(' · ');
const GO=label=>`<button class="pbtn" id="go" ${S&&!S.open?'disabled':''}>${label} <kbd>空格</kbd></button>`;
function idle(msg){cur=null;sc.ready(!!(S&&S.open));
  if(S&&!S.open)return bar('抽奖暂停了','到设置页里点"继续"',GO('抽一次'));
  bar('下一位',msg?`<span class="warn">${esc(msg)}</span>`:esc(S&&S.note?S.note+' · '+stock():'先确认这个人满足条件，再抽 · '+stock()),GO('抽一次'));$('go').onclick=go}
function lose(d){cur=d;const n=S?Math.max(0,S.card.rest):0;
  bar('谢谢惠顾',d.card?`<span class="ok">请发一张猫猫图鉴卡</span> · 还剩 ${esc(n)} 张`:'图鉴卡发完了',GO('下一位 · 抽一次'),'t0');$('go').onclick=go}
// 中了：登记工号。dup 是同工号中过的那几次（工作人员决定还是登记，还是作废这一次）
function win(d,{emp='',err='',dup=null}={}){cur=d;
  const sub=dup?`<span class="warn">${esc(dup.emp)} 之前中过：${dup.prev.map(x=>`第 ${x.no} 次 ${esc(TIER(x.tier))}`).join('、')}</span>`:err?`<span class="warn">${esc(err)}</span>`:'登记工号；活动结束后组织方按工号联系兑奖。登记之前不能抽下一次';
  bar(`${esc(TIER(d.tier))} · ${esc(d.name)}`,sub,dup?`<button class="pbtn" id="force">还是登记 ${esc(dup.emp)}</button><button class="lbtn" id="vd">作废这一次</button><button class="lbtn" id="re">改工号</button>`
    :`<form id="cf"><input type="text" id="emp" maxlength="32" placeholder="工号" autocomplete="off" spellcheck="false" value="${esc(emp)}"><button class="pbtn">登记</button></form><button class="lbtn sm" id="vd">作废</button>`,'t'+d.tier);
  if($('cf'))$('cf').onsubmit=e=>{e.preventDefault();claim($('emp').value,false)};$('vd').onclick=voidIt;
  if($('force'))$('force').onclick=()=>claim(dup.emp,true);if($('re'))$('re').onclick=()=>win(d,{emp:dup.emp})}
function claimed(d){cur=d;bar(`登记好了 · ${esc(d.emp)}`,`${esc(TIER(d.tier))} · ${esc(d.name)} · 活动结束后组织方按工号联系兑奖`,GO('下一位 · 抽一次'),'t'+d.tier);$('go').onclick=go;sc.ready(true)}

async function claim(emp,force){emp=emp.trim();if(!emp)return;const r=await api('POST','claim',{no:cur.no,emp,force});
  if(r.err==='dup')return win(cur,{emp,dup:{emp:emp.replace(/\s+/g,'').toUpperCase(),prev:r.prev}});
  if(r.err)return win(cur,{emp,err:ERR[r.err]||'没登记上'});sfx('stamp');await load();claimed(r.draw)}
async function voidIt(){if(!confirm(`作废第 ${cur.no} 次的${TIER(cur.tier)}？奖品放回奖池，这一次不算。`))return;const r=await api('POST','void',{no:cur.no});
  if(r.err)return win(cur,{err:ERR[r.err]||'没作废成'});await load();idle(`第 ${r.draw.no} 次作废了，奖品放回奖池`)}

// 抽：条上先换成"转啊转"，同时去抽；舞台演完（onShown）再把结果交给条
async function go(){if(busy||(cur&&cur.tier>0&&!cur.emp&&!cur.void)||(S&&!S.open))return;if(!sc.spin())return;busy=true;
  bar('转啊转……','','');const r=await api('POST','draw');
  if(r.err){busy=false;sc.abort();await load();if(r.err==='pending'){const d=S.pending;return d?win(d,{err:'这一次还没登记'}):idle()}return idle(ERR[r.err]||'没抽成')}
  sc.result(r.draw)}
function shown(d){busy=false;load().then(()=>d.tier>0?win(d):lose(d))}

async function load(){const r=await api('GET','state');if(r.err)return false;S=r;$('count').textContent=`已经抽了 ${r.total} 次`;return true}

/* ---------- 舞台（stage.js）：一格像素放大成整数倍，铺满上面那一块 ---------- */
const sc=Stage.create({onShown:shown}),cv=$('cv'),ctx=cv.getContext('2d');cv.width=sc.W;cv.height=sc.H;
function fit(){const st=$('stage'),w=st.clientWidth,h=st.clientHeight||innerHeight*.6,s=Math.max(1,Math.floor(Math.min(w/sc.W,h/sc.H)));cv.style.width=sc.W*s+'px';cv.style.height=sc.H*s+'px'}
addEventListener('resize',fit);
function frame(ms){use(ctx);sc.draw(ms/1000);requestAnimationFrame(frame)}

// 声音：活动现场默认开着（猫咖里默认关）；条上一个开关
const paintSnd=()=>{$('snd').textContent='声音 '+(Sound.on?'开':'关')};
$('snd').onclick=()=>{Sound.set(!Sound.on);paintSnd()};
addEventListener('pointerdown',()=>{try{Sound.init()}catch(e){}},{once:true});
// 空格 / 回车：等着、谢谢惠顾、登记好了的时候就是"抽一次"；在输入框里不算
addEventListener('keydown',e=>{try{Sound.init()}catch(x){}if((e.key===' '||e.key==='Enter')&&!e.repeat&&document.activeElement.tagName!=='INPUT'&&$('go')&&!$('go').disabled){e.preventDefault();go()}});
// 暂停、补货这些设置页改的：隔一会儿问一次（转着、等登记的时候不打断）
setInterval(async()=>{if(busy||cur&&cur.tier>0&&!cur.emp)return;if(await load()&&!cur)idle()},8000);

PXT.ready.then(async()=>{try{if(!Sound.on)Sound.set(true)}catch(e){}paintSnd();fit();requestAnimationFrame(frame);
  if(!await load())return idle(ERR.net);if(S.pending)return win(S.pending);idle()})})();
