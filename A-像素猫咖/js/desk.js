/* 1024 猫咖 · 前台抽奖页（desk.html）。设计见 docs/抽奖系统.md，接口是 server/lotto.js 的 /api/admin/lotto/*。
   工作人员在这台电脑上登录一次：用 w3（工号在白名单里，lotto-config.json 的 admins），或者用后台口令（只存在这个标签页里；
   和后台页面分开存，在这个标签页里打开 admin.html 还要再输一次）。
   之后来一个人：输工号 → 看剩几次 → 转扭蛋机 → 扭蛋蹦出来、晃三下、裂开，出来抽到什么。
   抽到什么是服务端定的：一按"转"就去抽，动画只是把结果演出来（那一幕在 lotto-scene.js，和店里的抽奖台共用）。
   抽完、或者 30 秒没人碰，回到"输工号"：下一个人看不到上一个人的工号和结果。 */
(()=>{
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const BASE=((window.CAT1024_CONFIG||{}).api||'api').replace(/\/$/,''),KK='cat1024.desk',API=BASE+'/admin/lotto',IDLE_MS=30000;
const ERR={none:'次数用完了',empty:'奖池空了，请工作人员补货',act:'现在没有进行中的抽奖，请找工作人员',time:'不在抽奖时间里',bad:'工号不对：字母、数字、- 和 _，2～32 位',disk:'没存上，请找工作人员',net:'连不上服务器，请找工作人员'};
const LOGIN_ERR={state:'登录过期了，再点一次',w3:'w3 登录没成，再试一次；一直不行就用后台口令',emp:'w3 给的工号认不出，用后台口令登录',disk:'服务器存不下，请找部署的同事'};
const TIER=LottoScene.TIER;
// 工作人员怎么登录的：key 后台口令；w3 白名单（cookie，请求里不用带什么）
let key='',w3=null,w3on=false;try{key=sessionStorage.getItem(KK)||''}catch(e){}

/* ---------- 接口 ---------- */
async function api(m,p,b){let r;try{r=await fetch(API+p,{method:m,headers:{'Content-Type':'application/json',...(key?{'X-Admin-Key':key}:{})},body:b?JSON.stringify(b):undefined})}catch(e){return{err:'net'}}
  if(r.status===401||r.status===429){logout(r.status===429?'口令错太多次了，过一会儿再来':w3?'w3 登录过期了，或者这个工号不在白名单里':'口令不对');return{err:'auth'}}
  return r.json().catch(()=>({err:'net'}))}

/* ---------- 右边的窗：登录 → 输工号 → 剩几次 → 转着 → 结果 ---------- */
let who=null,left=0,act=null,idleT=0;
const panel=html=>{$('panel').innerHTML=html;const f=$('panel').querySelector('input');if(f)setTimeout(()=>f.focus(),30)};
function logout(msg){key='';w3=null;try{sessionStorage.removeItem(KK)}catch(e){}$('adm').textContent='';$('act').textContent='';sc.abort();
  panel(`<h2>工作人员登录</h2>${w3on?'<div class="row" style="margin:0 0 20px"><button class="pbtn" id="w3">用 w3 登录</button></div><p>w3 登录要工号在白名单里。也可以用后台口令：</p>':'<p>用后台口令登录一次。关掉这个标签页就要重新登录。</p>'}
    <form id="lf"><input type="password" id="lk" placeholder="后台口令" autocomplete="current-password"><button class="${w3on?'lbtn':'pbtn'}">登录</button></form><p class="err">${esc(msg||'')}</p>`);
  if($('w3'))$('w3').onclick=()=>{location.href=BASE+'/lotto/w3/login?back=desk'};
  $('lf').onsubmit=async e=>{e.preventDefault();key=$('lk').value.trim();if(!key)return;const r=await api('GET','/state');if(r.err)return;try{sessionStorage.setItem(KK,key)}catch(x){}loadAct(r);ask()}}
function loadAct(r){act=(r.acts||[]).find(a=>a.id===r.current)||null;$('act').textContent=act?'· '+act.name:'· 现在没有进行中的抽奖';
  $('adm').innerHTML=`${w3?esc(w3)+' ':'工作人员'}已登录 <button class="lbtn sm" id="out">退出</button>`;
  $('out').onclick=async()=>{if(!confirm('退出登录？'))return;if(w3)await fetch(BASE+'/lotto/logout',{method:'POST'}).catch(()=>{});logout('')}}
function ask(msg){who=null;left=0;sc.ready(false);
  panel(`<h2>输入你的工号</h2><form id="ef"><input type="text" id="emp" maxlength="32" placeholder="工号" autocomplete="off" spellcheck="false"><button class="pbtn">查次数</button></form><p class="err">${esc(msg||'')}</p>
    <p>抽完以后，组织方按工号统一联系你兑奖。</p><p>还没有次数？关注内源社区、猫猫观察局，加入猫猫群，或者参加现场的互动游戏，到工作人员那里领。</p>`);
  $('ef').onsubmit=async e=>{e.preventDefault();const v=$('emp').value.trim();if(!v)return;const r=await api('GET','/emp?emp='+encodeURIComponent(v));
    if(r.err)return r.err==='auth'?0:ask(ERR[r.err]||'没查到');who=r.emp;left=r.left;ready()}}
function ready(){sc.ready(left>0);
  panel(`<h2>${esc(who)}</h2><p class="big">${left>0?`还有 ${esc(left)} 次`:'还没有次数'}</p>${left>0?'<p>转一下扭蛋机，扭到什么就是什么。</p>':'<p>关注内源社区、猫猫观察局，加入猫猫群，或者参加现场的互动游戏，到工作人员那里领。</p>'}
    <div class="row">${left>0?'<button class="pbtn" id="go">转一下 <kbd>空格</kbd></button>':''}<button class="lbtn" id="bye">${left>0?'不是我':'好'}</button></div><p class="err"></p>`);
  if($('go'))$('go').onclick=spin;$('bye').onclick=()=>ask()}
function result(d){const won=d.tier>0;
  panel(`<p class="tier ${won?'win':''}">${esc(TIER(d.tier))}${won?'！':''}</p>${won?`<p class="prize">${esc(d.name)}</p><p>${esc(who)} · 组织方会按工号联系你兑奖</p>`:'<p>下次一定。</p>'}
    <div class="row">${left>0?`<button class="pbtn" id="go">再转一次 <kbd>空格</kbd></button>`:''}<button class="lbtn" id="bye">${left>0?`先不抽了（还有 ${esc(left)} 次）`:'完成'}</button></div>`);
  if($('go'))$('go').onclick=spin;$('bye').onclick=()=>ask();setTimeout(()=>{const b=$('go')||$('bye');b&&b.focus()},30)}

// 转：先把窗里的按钮收起来，同时去抽；动画开转，结果回来以后扭蛋裂开时揭晓
async function spin(){if(sc.busy||!who||left<1||!sc.spin())return;
  panel(`<h2>${esc(who)}</h2><p class="big">转啊转……</p>`);
  const r=await api('POST','/draw',{emp:who});if(r.err){sc.abort();if(r.err!=='auth')ask(ERR[r.err]||'没抽成');return}
  left=r.left;sc.result(r.draw)}

/* ---------- 左边的扭蛋机（lotto-scene.js） ---------- */
const LW=220,LH=128,cv=$('cv'),ctx=cv.getContext('2d');cv.width=LW;cv.height=LH;
const sc=LottoScene.create({onShown:result});
// 一格像素放大成整数倍：宽屏按左边那一栏，窄屏（上下排）按屏幕宽、最多占半屏高
function fit(){const st=$('stage'),narrow=innerWidth<=900,w=narrow?innerWidth-32:st.clientWidth,h=narrow?innerHeight*.45:st.clientHeight,s=Math.max(1,Math.floor(Math.min(w/LW,h/LH)));cv.style.width=LW*s+'px';cv.style.height=LH*s+'px'}
addEventListener('resize',fit);fit();
function frame(ms){use(ctx);ctx.fillStyle='#1c1424';ctx.fillRect(0,0,LW,LH);sc.draw(ms/1000,LW,LH,{hint:!who?'输工号，转扭蛋':''});requestAnimationFrame(frame)}

/* ---------- 键盘、没人碰就回到输工号 ---------- */
addEventListener('keydown',e=>{poke();if((e.key===' '||e.key==='e'||e.key==='E')&&document.activeElement.tagName!=='INPUT'&&(sc.ph==='ready'||sc.ph==='shown')){e.preventDefault();spin()}});
addEventListener('pointerdown',poke);
function poke(){idleT=Date.now()}
setInterval(()=>{if((key||w3)&&who&&!sc.busy&&Date.now()-idleT>IDLE_MS)ask()},2000);
// 活动的名字、暂停没有：隔一会儿问一次
setInterval(async()=>{if(!key&&!w3)return;const r=await api('GET','/state');if(!r.err)loadAct(r)},15000);

// 打开时：先问一下开没开 w3、这个浏览器是不是已经用 w3 登录了（白名单里的）；从 w3 回来的，地址上带着成没成
PXT.ready.then(async()=>{requestAnimationFrame(frame);
  const h=new URLSearchParams(location.hash.slice(1)),bad=h.get('lotto-err');if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  const m=await fetch(BASE+'/lotto/me').then(r=>r.json()).catch(()=>({}));w3on=!!m.w3;if(m.me&&m.me.admin){w3=m.me.emp;key=''}
  if(!key&&!w3)return logout(bad?LOGIN_ERR[bad]||'没登录上':m.me?`${m.me.emp} 不在白名单里，用后台口令登录`:'');
  const r=await api('GET','/state');if(r.err)return;loadAct(r);ask()})})();
