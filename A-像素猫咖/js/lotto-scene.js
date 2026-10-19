/* 1024 猫咖 · 抽奖的扭蛋机那一幕：前台抽奖页（desk.js）和店里抽奖台的特写（world-lotto.js）共用。设计见 docs/抽奖系统.md。
   一台猫头扭蛋机，右边一块聚光灯，再右边坐着一只店猫看着。转一下：旋钮转一圈、扭蛋滚出来、蹦到聚光灯里、晃三下、裂开，出来几等奖和奖品名。
   抽到什么是服务端定的：spin() 只管开转，结果回来再 result(r)；没回来，扭蛋就一直晃着等。服务端说不行，abort() 收起来。
   扭蛋机、扭蛋、聚光灯、猫都是进店那台（entry-art.js 的 EA）。依赖 scene-kit（use 之后的 C、P1、OL、alpha、spark）、pixel-text（PXT）、sound（Sound）。
   LottoScene.create({onShown(r)}) → {draw(t,w,h,{hint}), spin()→true/false, result(r), abort(), ready(on), ph}
   draw 画在当前画布（先 use）上，宽高给多少就以中线排开：扭蛋机在左、聚光灯在中线偏右、店猫在最右；底色由调用方铺。 */
const LottoScene=(()=>{
const TIER=t=>t===0?'谢谢参与':['','一','二','三','四','五','六','七','八','九'][t]+'等奖';
// 扭蛋的颜色跟着几等奖走（店里的六种项圈色：红 蓝 紫 绿 黄 粉）：一等奖金黄，没中是紫的
const CAPC=t=>({1:4,2:0,3:1,4:5,5:3}[t]??2);
const ease=k=>k<0?0:k>1?1:k<.5?2*k*k:1-(-2*k+2)**2/2,cl=k=>k<0?0:k>1?1:k,lerp=(a,b,k)=>a+(b-a)*k;
const sfx=k=>{try{Sound.sfx(k)}catch(e){}};
const BUSY=['turn','hop','wob','pop'];

function create({onShown}={}){
const caps=EA.pile(20,1024),mascot={look:{coat:0,collar:4,face:'content'},act:null,next:2,react:null};
const A={ph:'idle',t:0,t0:0,res:null,cap:null,fx:[]};
// 店里的猫坐在旁边看：平时舔爪、慢眨眼、踩奶；有人中奖就开心地蹦一下，没中就接着舔爪
function catTick(t){const c=mascot;if(c.react&&t>c.react.t0+c.react.dur)c.react=null;if(c.act&&t>c.act.end){c.act=null;c.next=t+3+Math.random()*4}
  if(!c.react&&!c.act&&t>c.next){const k=['lick','slowBlink','knead'][Math.floor(Math.random()*3)];c.act={k,t0:t,end:t+2.4}}}
function catDraw(t,CX,FY){const c=mascot;let k='sit',tt=t,y=FY;if(c.react){k=c.react.k;tt=t-c.react.t0;if(c.react.hop&&tt<.5)y+=Math.round(-Math.sin(tt/.5*Math.PI)*8)}else if(c.act){k=c.act.k;tt=t-c.act.t0}
  EA.cat(k,c.look,CX,y,tt,{face:'L'})}

function draw(t,w,h,{hint}={}){A.t=t;const k=t-A.t0,mid=Math.round(w/2),FY=Math.round(h*.81),MX=mid-44,RX=mid+40,CX=mid+82;
  const label=(s,y,col)=>{const lw=PXT.w(s);PXT.draw(s,Math.round(RX-lw/2),y,col,{shadow:OL})};
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
  else if(A.ph==='pop'&&k>.9){A.ph='shown';onShown&&onShown(A.res)}
  catTick(t);
  // —— 画 ——
  EA.spot(MX,FY+1,40,9);EA.machine(MX,FY,t,{caps,turn,flap,jig,wiggle:A.ph==='ready'?1:0});
  const lit=['hop','wob','pop','shown'].includes(A.ph);EA.spot(RX,FY+1,24,6,lit?{}:{bright:'#2e2340',mid:'#241b31'});
  catDraw(t,CX,FY);
  const pa=t-(A.popT||-9),R0=A.res;
  if(R0&&(A.ph==='pop'||A.ph==='shown')){const won=R0.tier>0;if(won)EA.rays(RX,FY-14,40+Math.min(pa,1)*20,t,'#ffe08a');
    if(A.bot){const q=cl(pa/.5);if(q<1)alpha(1-q,()=>EA.capsule(A.bot.x,A.bot.y+q*4,14,0,A.cap.c,{part:'bot'}))}
    if(A.top&&pa<3)EA.capsule(A.top.x+A.top.vx*pa,A.top.y+A.top.vy*pa+70*pa*pa,14,A.top.va*pa,A.cap.c,{part:'top'});
    // 扭蛋里出来的字：几等奖在上，奖品名在下
    const q=ease(cl(pa/.4)),y=Math.round(lerp(FY-24,FY-50,q));label(TIER(R0.tier),y,won?'#ffd84a':'#b9a8c9');if(won)label(PXT.fit(R0.name,100),y+16,'#fff4dc');
    if(won&&pa<2.5)for(let i=0;i<6;i++){const a=i*1.047+pa*2,r=10+pa*14;spark(Math.round(RX+Math.cos(a)*r),Math.round(FY-14+Math.sin(a)*r*.7),t+i*.3)}}
  if(A.cap&&['turn','hop','wob'].includes(A.ph))EA.capsule(A.cap.x,A.cap.y+(A.cap.hopY||0),A.cap.r,A.cap.a,A.cap.c);
  if(hint&&(A.ph==='idle'||A.ph==='ready'))label(hint,FY-40,'#8a7a9a');
  A.fx=A.fx.filter(f=>{const a=t-f.t0;if(a>f.life)return false;P1(Math.round(f.x+f.vx*a),Math.round(f.y+f.vy*a+60*a*a),a<f.life*.5?'#fff4dc':'#ffd84a');return true})}

return{draw,TIER,get ph(){return A.ph},get busy(){return BUSY.includes(A.ph)},
  // 开转：已经在转就不理
  spin(){if(BUSY.includes(A.ph))return false;Object.assign(A,{ph:'turn',t0:A.t,res:null,cap:null,top:null,bot:null,fx:[],rat:-1,wn:-1});sfx('ratchet');return true},
  result(r){A.res=r},abort(){A.ph='idle';A.cap=null;A.res=null},ready(on){if(!BUSY.includes(A.ph))A.ph=on?'ready':'idle'}}}
return{create,TIER,CAPC}})();
