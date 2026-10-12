/* 1024 猫咖 · 终极彩蛋"全成就"和它的金羽毛（设计见 docs/店内设计.md 第四节"终极彩蛋"）。
   依赖 cat-sprites.js（贴地飞 flyR / flyL）、scene-kit.js、world-play.js（drawCat3 调 CAT_WINGS）、world-eggs.js（A.eggs.full / found）、world-charms.js（金羽毛那枚挂坠）。
   - 条件：图鉴三页都点亮（A.eggs.full()）。最后一样一齐，等你回到店里（不在看风景、对话框、进店动画、楼梯上），再过两三秒：
     一声号角，脚下炸开一圈金光，金色的小羽毛往下飘，猫开心地蹦两下；0.7 秒后 A.eggs.found('ultimate') —— 戴上金羽毛、大字、"彩蛋"那一条、新闻、全店广播都从那儿走。
   - 戴着金羽毛（c.charm === 'ultimate'）的猫，CAT_WINGS 给 drawCat3 用：
     翅膀 —— 正面看左右各一只收在背后，背影贴在背上，侧身竖在背上（盖在身子上的是近处那只）；飞的时候上下扇，坐着隔几秒扑扇一下；
     贴地飞 —— 走路换成 flyR / flyL（四只脚划水），离地四格、一上一下地浮，地上一团影子；
     金色光环 —— 连翅膀一圈金边，外面一圈淡金一明一暗。夜里身上一团金光，光晕上偶尔闪一颗小星星。
     别的真人的猫按标志位里的挂坠编号一样画；店猫、补位的猫不戴。
   - 拼好的贴图（翅膀 + 猫）和光环按贴图缓存（s.wg），每个姿态每种扇法只拼一次。 */
const WING_C={o:'#6b4a1e',w:'#fffdf4',l:'#fff0b0',d:'#f2c95c',g:'#d4962a'};
// 正面看左边那只（右边那只左右翻）：a 是贴在肩后的那一点。rest 收着，up 扑扇
const WING_PAIR={rest:{a:[9,8],g:[
  "oo........",
  "owo.......",
  "owwoo.....",
  ".owwwoo...",
  ".owwwwwoo.",
  "..owwwwwwo",
  "..owlwwwlo",
  "...owlwllo",
  "...owolldo",
  "....owoldo",
  "....oo.oo."]},
 up:{a:[9,9],g:[
  "o.........",
  "oo........",
  "owoo......",
  "owwwoo....",
  ".owwwwoo..",
  ".owwwwwwoo",
  "..owlwwwwo",
  "..owwlwwlo",
  "...owlwllo",
  "...owolldo",
  "....owoldo",
  "....oo.oo."]}};
// 侧身（朝右）：近处那只，盖在身子上；a 是肩后贴着的那一点。rest 收着，up / mid / down 扇
const WING_SIDE={rest:{a:[8,5],g:[
  "o........",
  "owoo.....",
  "owwwooo..",
  ".owwwwwoo",
  ".owwwwwllo",
  "..owwwlldo",
  "...oooooo."]},
 up:{a:[7,10],g:[
  "..oo....",
  ".owwo...",
  "owwwo...",
  "owwwwo..",
  ".owwwwo.",
  "owwwwlo.",
  ".owwwllo",
  "owwwlldo",
  ".owwlldo",
  "..owlldo",
  "...ooooo"]},
 mid:{a:[10,5],g:[
  "o..........",
  "owoo.......",
  "owwwoooo...",
  ".owwwwwwoo.",
  "..owwwwwllo",
  "..owwwwlldo",
  "...ooooooo."]},
 down:{a:[9,1],g:[
  "......oooo",
  "...oowwldo",
  "..owwwlldo",
  ".owwwwldo.",
  "owwwwldo..",
  "owwooo....",
  ".oo......."]}};
for(const W of [...Object.values(WING_PAIR),...Object.values(WING_SIDE)]){W.gw=Math.max(...W.g.map(r=>r.length));W.mg=W.g.map(r=>[...r.padEnd(W.gw,'.')].reverse().join(''))}
// 哪个姿态怎么长：正面（左右各一只，在身后）、背影（贴在背上，在前面）、侧身（竖在背上，近处那只在前面；后面是肩后那一点）。别的（翻肚皮、缠成茧……）压在身子底下，不画
const WING_PAIRS=new Set(['sit','meow','happy','hold','alert','lick','slowBlink','maneki','knead','dance','swing','bat','kick']);
const WING_AT={flyR:[7,10],flyL:[7,10],walkR:[7,10],walkL:[7,10],lie:[17,8],sleep:[17,8],leap:[12,9],pounce:[14,9],stretch:[13,12],splat:[16,6]};
const wingType=k=>WING_PAIRS.has(k)?'pair':k==='back'?'over':WING_AT[k]?'side':null;
function wingPaint(x,g,ox,oy){g.forEach((r,j)=>[...r].forEach((ch,i)=>{const c=WING_C[ch];if(!c)return;x.fillStyle=c;x.fillRect(ox+i,oy+j,1,1)}))}
const WPX=12,WPT=12,WPB=2;   // 拼贴图时四周留的地方：左右、上、下
CAT_WINGS={
  on:c=>c.charm==='ultimate',
  // 贴地飞：离地四格，一上一下地浮（多浮一格）
  hover:(c,k,t)=>k==='flyR'||k==='flyL'?-4-(Math.sin(t*3.2+(c.id||0))>0?1:0):0,
  // 翅膀 + 猫拼成一张：返回 {cv, w, h, ox, oy}（猫的贴图在拼好的这张里的左上角）
  wrap(s,k,flip,t,c){const type=wingType(k),f=!type?'none':type==='side'?(k==='flyR'||k==='flyL'?['up','mid','down','mid'][Math.floor(t*6+(c.id||0)*.37)%4]:'rest')
      :((t+(c.id||0)*.61)%(k==='happy'||k==='dance'?1.2:4.5))<.3?'up':'rest',key=f+(flip?'|f':'');
    const m=s.wg||(s.wg={});if(m[key])return m[key];
    const cv=document.createElement('canvas');cv.width=s.w+WPX*2;cv.height=s.h+WPT+WPB;const x=cv.getContext('2d');
    const put=(W,ax,ay,mi)=>wingPaint(x,mi?W.mg:W.g,WPX+ax-(mi?W.gw-1-W.a[0]:W.a[0]),WPT+ay-W.a[1]);
    const wings=()=>{if(type==='side'){const W=WING_SIDE[f],at=WING_AT[k];put(W,flip?s.w-1-at[0]:at[0],at[1],flip)}
      else{const W=WING_PAIR[f],cc=s.cc,y0=cc?cc[1]+1:Math.round(s.h*.62);put(W,cc?cc[0]-(flip?7:5):3,y0,false);put(W,cc?cc[0]+(flip?5:7):s.w-5,y0,true)}};
    if(type==='pair')wings();x.drawImage(s.cv,WPX,WPT);if(type==='over'||type==='side')wings();
    return m[key]={cv,w:cv.width,h:cv.height,ox:WPX,oy:WPT}},
  // 金色光环：一圈金边，外面一圈淡金一明一暗（按拼好的那张算一次）；顺便记下画在哪（world 坐标），夜里的金光、小星星按它放
  halo(ctx,w,x,y,t,c){if(!w.r1){const ring=(src,col)=>{const o=document.createElement('canvas');o.width=src.width+2;o.height=src.height+2;const z=o.getContext('2d');
        for(const [a,b] of [[0,1],[2,1],[1,0],[1,2]])z.drawImage(src,a,b);z.globalCompositeOperation='source-in';z.fillStyle=col;z.fillRect(0,0,o.width,o.height);return o};
      w.r1=ring(w.cv,'#ffd84a');w.r2=ring(w.r1,'#fff3b0')}
    const a=ctx.globalAlpha;ctx.globalAlpha=a*(.35+.25*Math.sin(t*3+(c.id||0)));ctx.drawImage(w.r2,x-2,y-2);ctx.globalAlpha=a;ctx.drawImage(w.r1,x-1,y-1);
    c._wb=[x,y,w.w,w.h];c._wbT=t},
  // 地上的影子（离地飞的时候）
  shadow(ctx,x,y){const o=C;use(ctx);alpha(.3,()=>disc(x,y,7,2,'#140e1a'));use(o)}};

WORLD_MODS.push(A=>{
const {S,me,sfx,emote,run,rr,after}=A,E=A.eggs,now=()=>A.t;

/* ---------- 夜里身上一团金光；光晕上偶尔闪一颗小星星 ---------- */
A.tickers.push(()=>{const t=now();for(const c of S.cats){if(c.gone||c.hidden||!c._wb||t-c._wbT>.25||!CAT_WINGS.on(c))continue;const b=c._wb;
  A.lights.push({x:Math.round(b[0]+b[2]/2),y:Math.round(b[1]+b[3]*.62),r:24,col:'#ffd84a',a:.5+.15*Math.sin(t*3+(c.id||0))})}});
const star=(x,y,k)=>{const col=k<.5?'#ffffff':'#fff3b0';P1(x,y,col);if(k>.25&&k<.75){P1(x-1,y,'#ffd84a');P1(x+1,y,'#ffd84a');P1(x,y-1,'#ffd84a');P1(x,y+1,'#ffd84a')}};
A.overs.push(vis=>{const t=now();for(const c of S.cats){if(c.gone||c.hidden||!c._wb||t-c._wbT>.25||!CAT_WINGS.on(c))continue;const [bx,by,bw,bh]=c._wb;if(!vis(bx,by,bw,bh))continue;
  for(let i=0;i<2;i++){const T=t*.8+i*.5+(c.id||0)*.13,ph=T%1;if(ph>.4)continue;const n=Math.floor(T)*7919+i*104729+(c.id||0)*31,u=(n%97)/97,v=(n%61)/61;
    star(Math.round(bx+4+u*(bw-8)),Math.round(by+4+v*(bh*.7)),ph/.4)}}});

/* ---------- 全成就：图鉴三页都点亮 ---------- */
// 每半秒看一次。刚一齐先等两三秒（最后那一样自己的那一条先出完），再等你回到店里；进店之前就集齐了的（终极彩蛋上线之前、断线时），等进店动画和"欢迎回来"的大字过去。
// 页面上开着登记抽奖的表、图鉴这些，或者"你被抽中了"排着没弹（A.uiBusy，app.js 填），先等着。触发以后那几秒 A.celebrating()：页面先不弹登记表、中奖通知
let chk=0,readyAt=0,calm=0,party=null;const plumes=[];
A.on('guideLoad',()=>{readyAt=0;calm=now()+6.5});
A.celebrating=()=>!!party;
A.tickers.push(dt=>{if((chk+=dt)<.5)return;chk=0;if(!A.play||party||E.has('ultimate'))return;
  if(!E.full()){readyAt=0;return}if(!readyAt){readyAt=now()+2.5;return}
  if(now()<readyAt||now()<calm||A.vista.on||A.dlg.open||(A.arriving&&A.arriving())||(A.uiBusy&&A.uiBusy())||me.hidden||me.transit)return;celebrate()});
function celebrate(){const t=now();party={t0:t,x:Math.round(me.x),y:Math.round(me.y)};sfx('fanfare');
  for(let i=0;i<28;i++)plumes.push({x:me.x+rr(-34,34),y:me.y-rr(34,80),vx:rr(-5,5),vy:rr(10,20),t0:t+rr(0,1.4),life:rr(2.4,3.6),s:rr(0,6.3)});
  if(!me.place&&!me.hidden&&!A.busy())run(me,[{k:'happy',dur:1.8,ex:'happy'}]);
  S.cats.forEach(o=>{if(!o.me&&!o.hidden&&Math.hypot(o.x-me.x,o.y-me.y)<170)emote(o,'bang',1.2)});
  after(.7,()=>{E.found('ultimate');after(4.8,()=>{party=null})})}   // 大字、"彩蛋"那一条出得差不多了，才让页面弹别的
// 脚下炸开的那圈金光（一秒）、往下飘的金羽毛
A.tickers.push(dt=>{for(let i=plumes.length-1;i>=0;i--){const p=plumes[i],k=now()-p.t0;if(k<0)continue;if(k>p.life){plumes.splice(i,1);continue}p.y+=p.vy*dt;p.x+=(p.vx+Math.sin(now()*2.4+p.s)*10)*dt}
  if(party&&now()-party.t0<1.2)A.lights.push({x:party.x,y:party.y-12,r:30+Math.round((now()-party.t0)*40),col:'#ffd84a',a:Math.max(0,1-(now()-party.t0)/1.2)})});
A.overs.push(vis=>{const t=now();
  if(party){const k=(t-party.t0)/1;if(k<1){const rx=6+k*46,ry=rx*.36,n=Math.round(rx*1.8);alpha(1-k,()=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2;P1(Math.round(party.x+Math.cos(a)*rx),Math.round(party.y+Math.sin(a)*ry),i%3?'#ffd84a':'#fff3b0')}})}}
  for(const p of plumes){const k=t-p.t0;if(k<0||!vis(p.x-3,p.y-3,6,6))continue;const x=Math.round(p.x),y=Math.round(p.y),f=Math.sin(t*3+p.s)>0;
    alpha(Math.min(1,(p.life-k)/.6),()=>{P1(x,y,'#fff6c8');P1(f?x+1:x-1,y,'#fff6c8');P1(f?x+2:x-2,y+(f?1:-1),'#ffd84a');P1(f?x-1:x+1,y+(f?-1:1),'#ffd84a')})}});
});
