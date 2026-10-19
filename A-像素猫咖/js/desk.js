/* 1024 猫咖 · 前台抽奖页（desk.html）。设计见 docs/抽奖系统.md，接口是 server/lotto.js 的 /api/admin/lotto/*。
   管理员在这台电脑上登录一次（后台口令，只存在这个标签页里；和后台页面分开存，在这个标签页里打开 admin.html 还要再输一次）。
   之后来一个人：输工号 → 看剩几次 → 转扭蛋机 → 扭蛋蹦出来、晃三下、裂开，出来抽到什么。
   抽到什么是服务端定的：一按"转"就去抽，动画只是把结果演出来；结果没回来，扭蛋就一直晃着等。
   抽完、或者 30 秒没人碰，回到"输工号"：下一个人看不到上一个人的工号和结果。
   扭蛋机、扭蛋、聚光灯、猫都是进店那台（entry-art.js 的 EA），画法见那里。 */
(()=>{
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KK='cat1024.desk',API=((window.CAT1024_CONFIG||{}).api||'api').replace(/\/$/,'')+'/admin/lotto',IDLE_MS=30000;
const ERR={none:'次数用完了',empty:'奖池空了，请工作人员补货',act:'现在没有进行中的抽奖，请找工作人员',time:'不在抽奖时间里',bad:'工号不对：字母、数字、- 和 _，2～32 位',disk:'没存上，请找工作人员',net:'连不上服务器，请找工作人员'};
const TIER=t=>t===0?'谢谢参与':['','一','二','三','四','五','六','七','八','九'][t]+'等奖';
// 扭蛋的颜色跟着几等奖走（店里的六种项圈色：红 蓝 紫 绿 黄 粉）：一等奖金黄，没中是紫的
const CAPC=t=>({1:4,2:0,3:1,4:5,5:3}[t]??2);
const sfx=k=>{try{Sound.sfx(k)}catch(e){}};
let key='';try{key=sessionStorage.getItem(KK)||''}catch(e){}

/* ---------- 接口 ---------- */
async function api(m,p,b){let r;try{r=await fetch(API+p,{method:m,headers:{'Content-Type':'application/json','X-Admin-Key':key},body:b?JSON.stringify(b):undefined})}catch(e){return{err:'net'}}
  if(r.status===401||r.status===429){logout(r.status===429?'口令错太多次了，过一会儿再来':'口令不对');return{err:'auth'}}
  return r.json().catch(()=>({err:'net'}))}

/* ---------- 右边的窗：登录 → 输工号 → 剩几次 → 转着 → 结果 ---------- */
let who=null,left=0,act=null,idleT=0;
const panel=html=>{$('panel').innerHTML=html;const f=$('panel').querySelector('input');if(f)setTimeout(()=>f.focus(),30)};
function logout(msg){key='';try{sessionStorage.removeItem(KK)}catch(e){}$('adm').textContent='';$('act').textContent='';
  panel(`<h2>工作人员登录</h2><p>用后台口令登录一次。关掉这个标签页就要重新登录。</p><form id="lf"><input type="password" id="lk" placeholder="后台口令" autocomplete="current-password"><button class="pbtn">登录</button></form><p class="err">${esc(msg||'')}</p>`);
  $('lf').onsubmit=async e=>{e.preventDefault();key=$('lk').value.trim();if(!key)return;const r=await api('GET','/state');if(r.err)return;try{sessionStorage.setItem(KK,key)}catch(x){}loadAct(r);ask()}}
function loadAct(r){act=(r.acts||[]).find(a=>a.id===r.current)||null;$('act').textContent=act?'· '+act.name:'· 现在没有进行中的抽奖';
  $('adm').innerHTML='工作人员已登录 <button class="lbtn sm" id="out">退出</button>';$('out').onclick=()=>{if(confirm('退出登录？'))logout('')}}
function ask(msg){who=null;left=0;A.ph='idle';
  panel(`<h2>输入你的工号</h2><form id="ef"><input type="text" id="emp" maxlength="32" placeholder="工号" autocomplete="off" spellcheck="false"><button class="pbtn">查次数</button></form><p class="err">${esc(msg||'')}</p>
    <p>抽完以后，组织方按工号统一联系你兑奖。</p><p>还没有次数？关注内源社区、猫猫观察局，加入猫猫群，或者参加现场的互动游戏，到工作人员那里领。</p>`);
  $('ef').onsubmit=async e=>{e.preventDefault();const v=$('emp').value.trim();if(!v)return;const r=await api('GET','/emp?emp='+encodeURIComponent(v));
    if(r.err)return r.err==='auth'?0:ask(ERR[r.err]||'没查到');who=r.emp;left=r.left;ready()}}
function ready(){A.ph=left>0?'ready':'idle';
  panel(`<h2>${esc(who)}</h2><p class="big">${left>0?`还有 ${esc(left)} 次`:'还没有次数'}</p>${left>0?'<p>转一下扭蛋机，扭到什么就是什么。</p>':'<p>关注内源社区、猫猫观察局，加入猫猫群，或者参加现场的互动游戏，到工作人员那里领。</p>'}
    <div class="row">${left>0?'<button class="pbtn" id="go">转一下 <kbd>空格</kbd></button>':''}<button class="lbtn" id="bye">${left>0?'不是我':'好'}</button></div><p class="err"></p>`);
  if($('go'))$('go').onclick=spin;$('bye').onclick=()=>ask()}
function result(d){const won=d.tier>0;
  panel(`<p class="tier ${won?'win':''}">${esc(TIER(d.tier))}${won?'！':''}</p>${won?`<p class="prize">${esc(d.name)}</p><p>${esc(who)} · 组织方会按工号联系你兑奖</p>`:'<p>下次一定。</p>'}
    <div class="row">${left>0?`<button class="pbtn" id="go">再转一次 <kbd>空格</kbd></button>`:''}<button class="lbtn" id="bye">${left>0?`先不抽了（还有 ${esc(left)} 次）`:'完成'}</button></div>`);
  if($('go'))$('go').onclick=spin;$('bye').onclick=()=>ask();setTimeout(()=>{const b=$('go')||$('bye');b&&b.focus()},30)}

// 转：先把窗里的按钮收起来，同时去抽；动画开转，结果回来以后扭蛋裂开时揭晓
async function spin(){if(A.ph!=='ready'&&A.ph!=='shown'||!who||left<1)return;
  Object.assign(A,{ph:'turn',t0:A.t,res:null,cap:null,top:null,bot:null,fx:[],rat:-1,wn:-1});sfx('ratchet');
  panel(`<h2>${esc(who)}</h2><p class="big">转啊转……</p>`);
  const r=await api('POST','/draw',{emp:who});if(r.err){A.ph='idle';if(r.err!=='auth')ask(ERR[r.err]||'没抽成');return}
  left=r.left;A.res=r.draw}

/* ---------- 左边的扭蛋机 ---------- */
const LW=220,LH=128,FY=104,MX=66,RX=150,CX=192;
const cv=$('cv'),ctx=cv.getContext('2d');cv.width=LW;cv.height=LH;
const caps=EA.pile(20,1024),mascot={look:{coat:0,collar:4,face:'content'},act:null,next:2,react:null};
const A={ph:'idle',t:0,t0:0};
const ease=k=>k<0?0:k>1?1:k<.5?2*k*k:1-(-2*k+2)**2/2,cl=k=>k<0?0:k>1?1:k,lerp=(a,b,k)=>a+(b-a)*k;
// 一格像素放大成整数倍：宽屏按左边那一栏，窄屏（上下排）按屏幕宽、最多占半屏高
function fit(){const st=$('stage'),narrow=innerWidth<=900,w=narrow?innerWidth-32:st.clientWidth,h=narrow?innerHeight*.45:st.clientHeight,s=Math.max(1,Math.floor(Math.min(w/LW,h/LH)));cv.style.width=LW*s+'px';cv.style.height=LH*s+'px'}
addEventListener('resize',fit);fit();
// 店里的猫坐在旁边看：平时舔爪、慢眨眼；有人中奖就开心地蹦一下，没中就接着舔爪
function catTick(t){const c=mascot;if(c.react&&t>c.react.t0+c.react.dur)c.react=null;if(c.act&&t>c.act.end){c.act=null;c.next=t+3+Math.random()*4}
  if(!c.react&&!c.act&&t>c.next){const k=['lick','slowBlink','knead'][Math.floor(Math.random()*3)];c.act={k,t0:t,end:t+2.4}}}
function catDraw(t){const c=mascot;let k='sit',tt=t,y=FY;if(c.react){k=c.react.k;tt=t-c.react.t0;if(c.react.hop&&tt<.5)y+=Math.round(-Math.sin(tt/.5*Math.PI)*8)}else if(c.act){k=c.act.k;tt=t-c.act.t0}
  EA.cat(k,c.look,CX,y,tt,{face:'L'})}
const label=(s,y,col)=>{const w=PXT.w(s);PXT.draw(s,Math.round(RX-w/2),y,col,{shadow:OL})};

function frame(ms){const t=ms/1000;A.t=t;const k=t-A.t0;use(ctx);ctx.fillStyle='#1c1424';ctx.fillRect(0,0,LW,LH);
  let turn=0,flap=0,jig=0;
  if(A.ph==='turn'){turn=ease(cl(k/.9));jig=k<.9?Math.sin(cl(k/.9)*Math.PI)+.2:Math.max(0,.4-(k-.9));if(k<.9&&Math.floor(k*4.4)!==A.rat){A.rat=Math.floor(k*4.4);sfx('ratchet')}
    if(k>.9&&!A.cap){const i=caps.reduce((b,c,j)=>c.y>caps[b].y?j:b,0);caps.splice(i,1);caps.push(...EA.pile(1,Math.floor(t*1000)%9973+1));A.cap={x:MX,y:FY-8,r:5,a:0,c:A.res?CAPC(A.res.tier):2};sfx('toss')}
    flap=k<1?0:k<1.25?(k-1)/.25:k<1.6?1:Math.max(0,1-(k-1.6)/.3);
    if(A.cap&&k>1.1){const q=cl((k-1.1)/.7);A.cap.x=MX+2+q*30;A.cap.y=q<.35?lerp(FY-8,FY+4,q/.35):FY+4-Math.abs(Math.sin((q-.35)/.65*Math.PI*2))*3*(1-q);A.cap.a=q*5}
    if(k>2){A.hop={x:A.cap.x,y:A.cap.y};A.ph='hop';A.t0=t}}
  else if(A.ph==='hop'){const q=ease(cl(k/.6));A.cap.x=lerp(A.hop.x,RX,q);A.cap.y=lerp(A.hop.y,FY-14,q)-Math.sin(cl(k/.6)*Math.PI)*26;A.cap.r=Math.round(lerp(5,14,q));A.cap.a*=1-q;
    if(k>.6){A.ph='wob';A.t0=t;sfx('land')}}
  // 晃：至少晃三下；结果还没回来就接着晃
  else if(A.ph==='wob'){const n=Math.floor(k/.34),q=(k%.34)/.34;A.cap.a=Math.sin(q*Math.PI*2)*(.18+Math.min(n,2)*.14);A.cap.hopY=-Math.round(Math.sin(q*Math.PI)*(Math.min(n,2)+1));if(n!==A.wn){A.wn=n;sfx('clack')}
    if(A.res&&A.cap.c!==CAPC(A.res.tier)&&n<1)A.cap.c=CAPC(A.res.tier);
    if(n>=3&&A.res){const c=A.cap,won=A.res.tier>0;A.ph='pop';A.t0=t;A.popT=t;sfx('crack');setTimeout(()=>sfx(won?'reveal':'tick'),120);
      A.top={x:c.x,y:c.y,vx:(Math.random()<.5?-1:1)*38,vy:-70,va:(Math.random()<.5?-1:1)*7};A.bot={x:c.x,y:c.y};
      for(let i=0;i<(won?24:8);i++){const a=Math.random()*Math.PI*2,v=20+Math.random()*50;A.fx.push({x:c.x,y:c.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-30,t0:t,life:.5+Math.random()*.6})}
      mascot.act=null;mascot.react=won?{k:'happy',t0:t,dur:1.2,hop:1}:{k:'lick',t0:t,dur:2.4}}}
  else if(A.ph==='pop'&&k>.9){A.ph='shown';result(A.res)}
  catTick(t);
  // —— 画 ——
  EA.spot(MX,FY+1,40,9);EA.machine(MX,FY,t,{caps,turn,flap,jig,wiggle:A.ph==='ready'?1:0});
  const lit=['hop','wob','pop','shown'].includes(A.ph);EA.spot(RX,FY+1,24,6,lit?{}:{bright:'#2e2340',mid:'#241b31'});
  catDraw(t);
  const pa=t-(A.popT||-9),R0=A.res;
  if(R0&&(A.ph==='pop'||A.ph==='shown')){const won=R0.tier>0;if(won)EA.rays(RX,FY-14,40+Math.min(pa,1)*20,t,'#ffe08a');
    if(A.bot){const q=cl(pa/.5);if(q<1)alpha(1-q,()=>EA.capsule(A.bot.x,A.bot.y+q*4,14,0,A.cap.c,{part:'bot'}))}
    if(A.top&&pa<3)EA.capsule(A.top.x+A.top.vx*pa,A.top.y+A.top.vy*pa+70*pa*pa,14,A.top.va*pa,A.cap.c,{part:'top'});
    // 扭蛋里出来的字：几等奖在上，奖品名在下
    const q=ease(cl(pa/.4)),y=Math.round(lerp(FY-24,FY-50,q));label(TIER(R0.tier),y,won?'#ffd84a':'#b9a8c9');if(won)label(PXT.fit(R0.name,100),y+16,'#fff4dc');
    if(won&&pa<2.5)for(let i=0;i<6;i++){const a=i*1.047+pa*2,r=10+pa*14;spark(Math.round(RX+Math.cos(a)*r),Math.round(FY-14+Math.sin(a)*r*.7),t+i*.3)}}
  if(A.cap&&['turn','hop','wob'].includes(A.ph))EA.capsule(A.cap.x,A.cap.y+(A.cap.hopY||0),A.cap.r,A.cap.a,A.cap.c);
  if(A.ph==='idle'&&!who)label('输工号，转扭蛋',FY-40,'#8a7a9a');
  A.fx=(A.fx||[]).filter(f=>{const a=t-f.t0;if(a>f.life)return false;P1(Math.round(f.x+f.vx*a),Math.round(f.y+f.vy*a+60*a*a),a<f.life*.5?'#fff4dc':'#ffd84a');return true});
  requestAnimationFrame(frame)}

/* ---------- 键盘、没人碰就回到输工号 ---------- */
addEventListener('keydown',e=>{poke();if((e.key===' '||e.key==='e'||e.key==='E')&&document.activeElement.tagName!=='INPUT'&&(A.ph==='ready'||A.ph==='shown')){e.preventDefault();spin()}});
addEventListener('pointerdown',poke);
function poke(){idleT=Date.now()}
setInterval(()=>{if(key&&who&&!['turn','hop','wob','pop'].includes(A.ph)&&Date.now()-idleT>IDLE_MS)ask()},2000);
// 活动的名字、暂停没有：隔一会儿问一次
setInterval(async()=>{if(!key)return;const r=await api('GET','/state');if(!r.err)loadAct(r)},15000);

PXT.ready.then(()=>{requestAnimationFrame(frame);
  if(!key)return logout('');api('GET','/state').then(r=>{if(r.err)return;loadAct(r);ask()})})})();
