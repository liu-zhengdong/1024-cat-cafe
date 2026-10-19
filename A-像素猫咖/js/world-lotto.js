/* 1024 猫咖 · 店里的抽奖台（docs/抽奖系统.md）：1024 舞台右下角、抓娃娃机左边一台小扭蛋机。走过去按 E，切到特写（挂在"看风景"那一套上）：
   左边那台猫头扭蛋机、聚光灯、店猫，和会场前台的抽奖页是同一幕（lotto-scene.js）。
   - 身份是 w3 登录的工号，不是猫：没登录就按 E 去 w3 登录，登录完回到店里；同一个工号在会场前台抽的、在店里抽的，次数和记录是一份。
   - E 转一下（服务端定抽到什么）；R 刷新：查 codehub star、稼先关注，该发的次数发上；G 填 GitHub 用户名：star 了 clowder-ai 加 1 次。
   - 服务端没开 w3（lotto-config.json 没配），或者是本机模式：特写里写"线上抽奖还没开，现场抽奖请到会场前台"，什么也不做。
   - 不进图鉴、不算"店里的 119 样东西"：活动结束就撤，不能让已经集齐全成就的猫突然少一样。 */
(()=>{
// 摆在地图上：抓娃娃机（902,156）左边，相机和它之间；占地是底下那一条，前面留出站的地方
const M=WORLD,P=M.P;P.lotto={x:850,y:160};P.lottoAt={x:838,y:214};
M.BLOCK.push([850,204,30,10]);
// 小扭蛋机：猫耳朵、红帽子、玻璃球里一把扭蛋，红机身上写"抽奖"，底下出蛋口。(x,y) 左上角，宽 30、高 54；有人在抽的时候球里的扭蛋跟着晃
const CAPS=[[-5,3,0],[1,5,1],[6,2,2],[-2,-1,3],[4,-3,4],[-6,-3,5],[0,0,4],[-3,6,2],[7,6,0]],COL=['#e0533d','#5B9BD5','#9B7EBD','#5B8C5A','#e8b83a','#f4a6b8'];
function lottoMachine(x,y,t,busy){alpha(.22,()=>disc(x+15,y+53,15,2,'#241a2e'));const gx=x+15,gy=y+21;
  // 耳朵和红帽子
  for(const s of [-1,1]){const ax=gx+s*7;for(let i=0;i<5;i++){const hw=Math.floor(i*.6);R(ax-hw-1,y+1+i,hw*2+3,1,OL);if(i)R(ax-hw,y+1+i,hw*2+1,1,i>2?'#f4a6b8':'#e0533d')}}
  R(gx-8,y+6,17,4,OL);R(gx-7,y+7,15,3,'#e0533d');R(gx-6,y+7,6,1,'#f07a5e');
  // 玻璃球
  disc(gx,gy,11,11,OL);disc(gx,gy,10,10,'#8fb4c8');disc(gx,gy,9,9,'#26303f');
  CAPS.forEach(([dx,dy,c],i)=>{const j=busy?Math.round(Math.sin(t*20+i*1.7)*1.4):0,k=busy?Math.round(Math.cos(t*17+i)*1):0;R(gx+dx-1+j,gy+dy-1+k,3,3,OL);R(gx+dx+j,gy+dy+k,2,1,'#fff4dc');R(gx+dx+j,gy+dy+1+k,2,1,COL[c])});
  P1(gx-5,gy-6,'#ffffff');P1(gx-6,gy-5,'#ffffff');P1(gx-4,gy-7,'#cfe8f4');
  // 脖子和机身
  R(x+5,y+31,20,3,OL);R(x+6,y+32,18,1,'#c8b89a');
  R(x+1,y+34,28,19,OL);R(x+2,y+35,26,17,'#e0533d');R(x+2,y+35,26,1,'#f07a5e');R(x+26,y+36,2,16,'#b83e2c');
  PXT.draw('抽奖',x+3,y+33,'#fff4dc');
  R(x+9,y+47,12,5,OL);R(x+10,y+48,10,3,'#1a1220');
  // 一圈小灯，有人抽的时候跑得快
  for(let i=0;i<6;i++){const on=(Math.floor(t*(busy?8:2))+i)%3===0;P1(x+3+i*5,y+52,on?'#ffd84a':'#8a2a24')}}
M.props.push({x:P.lotto.x-1,y:P.lotto.y,w:32,h:56,base:P.lotto.y+54,draw:(t,S)=>lottoMachine(P.lotto.x,P.lotto.y,t,S.lottoBusy>t),live:1});

WORLD_MODS.push(A=>{
const {S,me,run,settle,T,news,sfx}=A;
const CFG=window.CAT1024_CONFIG||{},BASE=(CFG.api||'').replace(/\/$/,'');
const ERR={none:'次数用完了：按 R 刷新，看看 star / 关注的次数到了没有',empty:'奖池空了，等组织者补货',act:'现在没有进行中的抽奖',time:'不在抽奖时间里',auth:'w3 登录过期了：按 E 重新登录',disk:'服务器没存上，等一下再试',net:'连不上服务器，等一下再试',soon:'刚刷新过，过几秒再来',busy:'正在转'};
const SRC_N={codehub:'codehub star',jiaxian:'稼先关注',github:'GitHub star'};
let info=null,msg='',busy=false;
const sc=LottoScene.create({onShown:r=>{busy=false;if(info&&info.me)info.me.left=r.leftAfter;msg=r.tier>0?`抽到了 ${LottoScene.TIER(r.tier)} · ${r.name} · 组织方会按工号联系你兑奖`:'谢谢参与，下次一定';
  if(r.tier>0){sfx('prize');news(`你在扭蛋机里抽到了 ${LottoScene.TIER(r.tier)}：${r.name}`)}A.vista.cap()}});   // 揭晓的字留在画面上，下一次转再换
const left=()=>info&&info.me&&info.me.left||0;
const call=(m,p)=>fetch(BASE+'/lotto/'+p,{method:m,headers:{'Content-Type':'application/json'}}).then(r=>r.json()).catch(()=>({err:'net'}));
async function load(){info=BASE?await call('GET','me'):{w3:false};if(info.err)info={w3:false,err:info.err}}
// 特写下面那一行：现在能做什么
function caption(){if(!info)return'……';if(info.err==='net')return ERR.net;if(!info.w3)return'线上抽奖还没开，现场抽奖请到会场前台';
  if(!info.me)return'用 w3 登录以后才能抽：抽奖跟着工号走，会场前台抽的也算在一起';if(!info.act)return ERR.act;
  return msg||`${info.me.emp} · 还有 ${left()} 次`+(left()?'':' · R 刷新看看 star / 关注的次数');}
const ghTodo=()=>!!(info&&info.github&&info.me&&info.me.got&&!info.me.got.github);
const hint=()=>!info||!info.w3?'':!info.me?'E 用 w3 登录':'E 转一下 · R 刷新次数'+(ghTodo()?' · G 填 GitHub 用户名':'');

A.vista.add('lotto',{info:()=>({n:'扭蛋抽奖机',sub:info&&info.act?info.act.name:'1024 现场 + 线上抽奖',hint:hint()}),
  open:()=>{msg='';sc.ready(left()>0)},close:()=>{},
  draw:E=>{const {w,h,t}=E;C.fillStyle='#1c1424';C.fillRect(0,0,w,h);
    // 背后一面深紫的幕布，顶上一排小灯
    R(0,0,w,Math.round(h*.62),'#241a2e');for(let x=4;x<w;x+=12)P1(x,6,Math.floor(t*2+x/12)%3?'#5a3a6a':'#ffd84a');R(0,Math.round(h*.62),w,1,'#3a2c4c');
    // 幕布上的字：和舞台背板一样，金色的 1024
    const tl=(s,y,col)=>PXT.draw(s,Math.round(w/2-PXT.w(s)/2),y,col,{shadow:OL});tl('1024 扭蛋抽奖',Math.round(h*.16),'#ffd84a');tl('Clowder AI · 把孤立的 AI agent 变成真正的团队',Math.round(h*.16)+20,'#8a7a9a');
    sc.draw(t,w,h,{hint:info&&info.me&&!left()&&!busy?'没有次数了':''})},
  cap:()=>caption(),
  act:async()=>{if(!info||!info.w3||busy)return;if(!info.me){location.href=BASE+'/lotto/w3/login?back=shop';return}
    if(!info.act){msg=ERR.act;A.vista.cap();return}if(left()<1){msg=ERR.none;A.vista.cap();return}if(!sc.spin())return;
    busy=true;msg='转啊转……';A.vista.cap();S.lottoBusy=A.t+6;
    const r=await call('POST','draw');if(r.err){busy=false;sc.abort();sc.ready(left()>0);msg=ERR[r.err]||'没抽成';if(r.err==='auth')info.me=null;A.vista.cap();return}
    sc.result({...r.draw,leftAfter:r.left})},
  key:(e,V)=>{if((e.key==='r'||e.key==='R')&&!e.repeat){refresh();return true}if((e.key==='g'||e.key==='G')&&!e.repeat){ghOpen();return true}return false}});

/* ---------- 填 GitHub 用户名：和登记抽奖那张表一样的样子（index.html 的 .ov .box.lotto） ---------- */
const GH_ERR={taken:'这个 GitHub 账号已经被别的工号用过了',bound:'你的工号已经绑了别的 GitHub 账号',gh:'GitHub 没查成，过一会儿再试',soon:'刚查过，过几秒再试',bad:'GitHub 用户名只有字母、数字和 -',act:ERR.act,auth:ERR.auth,net:ERR.net};
let ov=null;
function ghOpen(){if(!info||!info.me||busy)return;if(!info.github){msg='没开 GitHub 查询';A.vista.cap();return}if(info.me.got&&info.me.got.github){msg='GitHub star 已经领过了'+(info.me.gh?'（@'+info.me.gh+'）':'');A.vista.cap();return}
  if(!ov){ov=document.createElement('div');ov.className='ov';ov.style.cssText='position:fixed;z-index:60';
    ov.innerHTML=`<div class="box lotto win"><h3>GitHub star</h3><p class="lead">在 GitHub 上 star 了 clowder-ai？填你的 GitHub 用户名，查到了加 1 次抽奖机会。</p>
      <label><span>用户名</span><input maxlength="40" autocomplete="off" spellcheck="false" placeholder="GitHub 用户名"></label>
      <p class="note">一个 GitHub 账号只能给一个工号用，查到以后就绑在你的工号上。</p><p class="err"></p>
      <div class="row"><button class="lbtn" data-x>算了</button><button class="pbtn" data-go>查一下</button></div></div>`;document.body.appendChild(ov);
    const inp=ov.querySelector('input');ov.querySelector('[data-x]').onclick=ghClose;ov.querySelector('[data-go]').onclick=ghSend;
    ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();ghClose()}else if(e.key==='Enter'&&e.target===inp&&!e.isComposing){e.preventDefault();ghSend()}})}
  ov.querySelector('.err').textContent='';ov.querySelector('input').value=info.me.gh||'';ov.style.display='flex';setTimeout(()=>ov.querySelector('input').focus(),30)}
function ghClose(){if(ov)ov.style.display='none';const g=document.getElementById('game');g&&g.focus()}
async function ghSend(){const u=ov.querySelector('input').value.trim(),b=ov.querySelector('[data-go]'),err=ov.querySelector('.err');if(!u||b.disabled)return;b.disabled=true;err.textContent='在查……';
  const r=await fetch(BASE+'/lotto/github',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:u})}).then(x=>x.json()).catch(()=>({err:'net'}));b.disabled=false;
  if(r.err){err.textContent=(GH_ERR[r.err]||'没查成')+(r.err==='bound'&&r.user?'（@'+r.user+'）':'');if(r.err==='auth'){info.me=null;ghClose();A.vista.cap()}return}
  if(r.no){err.textContent=`@${r.user} 没有 star clowder-ai`;return}
  info.me.left=r.left;info.me.gh=r.user;info.me.got.github=true;msg=r.got?`GitHub star（@${r.user}）加了 1 次 · 还有 ${r.left} 次`:'GitHub star 已经领过了';
  if(r.got)sfx('coin');sc.ready(left()>0);ghClose();A.vista.cap()}

async function refresh(){if(!info||!info.me||busy)return;msg='在查 star / 关注……';A.vista.cap();const r=await call('POST','refresh');
  if(r.err){msg=r.err==='soon'?`刚刷新过，${r.wait||10} 秒后再来`:ERR[r.err]||'没刷新上';A.vista.cap();return}
  info.me.left=r.left;const n=r.got.map(k=>SRC_N[k]||k);
  msg=[n.length?`${n.join('、')} 各加了 1 次`:'',r.fail.length?`${r.fail.map(k=>SRC_N[k]||k).join('、')} 没查成，稍后再试`:'',!n.length&&!r.fail.length?'没有新的次数':'',`还有 ${r.left} 次`].filter(Boolean).join(' · ');
  if(n.length)sfx('coin');sc.ready(left()>0);A.vista.cap()}

// 店里：走到扭蛋机前面坐下，先问一下自己是谁、剩几次，再切到特写。别的猫不来抽（这是人的事）
T({id:'lotto',n:'扭蛋抽奖机',hit:[P.lotto.x,P.lotto.y,30,54],at:P.lottoAt,label:'扭蛋抽奖',
  go(c){run(c,[{go:P.lottoAt},{fn:async c=>{if(!c.me)return;settle(c,{k:'sit'});await load();A.vista.open('lotto')}}])}});

// 从 w3 登录回来：地址上带着成没成。抹掉，在新闻里说一声（店里的 #move= #claim= 不归这里管）
const h=new URLSearchParams(location.hash.slice(1)),ok=h.has('lotto'),bad=h.get('lotto-err');
if(ok||bad){history.replaceState(null,'',location.pathname+location.search);
  setTimeout(()=>news(ok?'w3 登录好了：去一楼 1024 舞台右下角的扭蛋机抽奖':`w3 登录没成（${bad}），再到扭蛋机前按 E 试一次`),4000)}
})})();
