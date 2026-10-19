// 抽奖的 w3 登录、自动发次数、白名单后台：起一个假的 w3 和假的 codehub、稼先，再起真的服务端，从头走一遍。node --test 'server/*.test.js'
// 换成内网真的 w3 以后，这个测试不用改：它测的是"按 lotto-config.json 的写法走通"，真接口对不上的话改 w3.js / lotto-sources.js。
const test=require('node:test'),assert=require('node:assert/strict'),http=require('http'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const ROOT=path.resolve(__dirname,'..');

// 假的 w3：authorize 直接带着 code 跳回去；token 换 access_token；userinfo 按 token 给工号。假的 codehub、稼先：按工号答 star / 关注了没有
function mock(){const codes=new Map([['c-alice','W777'],['c-boss','A001'],['c-bad','中文']]);let fail=false;
  const srv=http.createServer((req,res)=>{const u=new URL(req.url,'http://x'),j=(o,s=200)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
    if(u.pathname==='/authorize'){const back=new URL(u.searchParams.get('redirect_uri'));back.searchParams.set('code',u.searchParams.get('login_as'));back.searchParams.set('state',u.searchParams.get('state'));res.writeHead(302,{Location:back.href});return res.end()}
    if(u.pathname==='/token'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{const f=new URLSearchParams(b);if(f.get('client_secret')!=='s3cret'||!codes.has(f.get('code')))return j({error:'bad'},400);j({access_token:'tk-'+f.get('code')})});return}
    if(u.pathname==='/userinfo'){const c=(req.headers.authorization||'').replace('Bearer tk-','');return codes.has(c)?j({data:{uid:codes.get(c),cn:'测试'}}):j({},401)}
    if(u.pathname==='/codehub'){if(fail)return j({},503);return j({starred:u.searchParams.get('user')==='W777'})}
    if(u.pathname==='/jiaxian'){let b='';req.on('data',d=>b+=d);req.on('end',()=>j({list:JSON.parse(b).emp==='W777'?[1]:[]}));return}
    j({},404)});
  return new Promise(r=>srv.listen(0,'127.0.0.1',()=>r({srv,port:srv.address().port,setFail:v=>{fail=v}})))}

function start(dir,port){return new Promise((r,x)=>{const p=spawn(process.execPath,['server/server.js'],{cwd:ROOT,env:{...process.env,DATA_DIR:dir,ADMIN_KEY:'k',PORT:String(port)}});
  p.stdout.on('data',()=>r(p));p.stderr.on('data',d=>process.stderr.write(d));p.on('exit',c=>x(new Error('服务端退出了 '+c)))})}

test('w3 登录、刷新发次数、自己抽、白名单进后台',async t=>{
  const M=await mock(),MB=`http://127.0.0.1:${M.port}`,PORT=18100+Math.floor(Math.random()*800),B=`http://127.0.0.1:${PORT}`;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lotto-w3-'));
  fs.writeFileSync(path.join(dir,'lotto-config.json'),JSON.stringify({
    w3:{authorize:MB+'/authorize',token:MB+'/token',userinfo:MB+'/userinfo',clientId:'cat',clientSecret:'s3cret',redirect:B+'/api/lotto/w3/callback',empField:'data.uid',nameField:'data.cn'},
    admins:['a001'],keyLogin:false,
    sources:{codehub:{url:MB+'/codehub?user={emp}',path:'starred',equals:true},jiaxian:{url:MB+'/jiaxian',method:'POST',body:{emp:'{emp}'},path:'list'}}}));
  const srv=await start(dir,PORT);t.after(()=>{srv.kill();M.srv.close()});
  // 一个只会记 cookie 的浏览器：跟着跳转走，带上 Path 对得上的 cookie
  const jar=()=>{const c={};return{async go(url,opt={}){let u=url;for(let i=0;i<6;i++){const r=await fetch(u,{...opt,redirect:'manual',headers:{...(opt.headers||{}),cookie:Object.entries(c).map(([k,v])=>k+'='+v).join('; ')}});
      for(const s of r.headers.getSetCookie()){const [kv]=s.split(';'),[k,v]=kv.split('=');if(/Max-Age=0/.test(s))delete c[k];else c[k]=v}
      if(r.status!==302)return{r,url:u};u=new URL(r.headers.get('location'),u).href;opt={}}throw new Error('跳太多次')},c}};
  const adm=(p,b)=>fetch(B+'/api/admin/lotto/'+p,{method:b?'POST':'GET',headers:{'X-Admin-Key':'k','Content-Type':'application/json'},body:b&&JSON.stringify(b)}).then(r=>r.json().then(j=>[r.status,j]));

  // 没登录：看得到开了 w3、有哪几个来源；抽不了
  const anon=jar();let r=await (await anon.go(B+'/api/lotto/me')).r.json();assert.equal(r.w3,true);assert.deepEqual(r.sources,['codehub','jiaxian']);assert.equal(r.me,null);
  assert.equal((await anon.go(B+'/api/lotto/draw',{method:'POST'})).r.status,401);

  // 配置里关了口令：后台口令进不了抽奖后台
  assert.equal((await adm('state'))[0],401);

  // 白名单里的 A001 用 w3 登录，进后台建活动、配奖品、开始
  // 假 w3 要知道用谁登录：发起登录，在跳去 authorize 的那一步加上 login_as
  const loginAs=async(J,code,back)=>{const r0=await fetch(B+'/api/lotto/w3/login?back='+back,{redirect:'manual'});const st=r0.headers.getSetCookie()[0].split(';')[0].split('=');J.c[st[0]]=st[1];
    const to=new URL(r0.headers.get('location'));to.searchParams.set('login_as',code);return J.go(to.href)};
  const boss=jar();let g=await loginAs(boss,'c-boss','admin');assert.match(g.url,/\/admin\.html#lotto=in$/);
  const bo=(p,b)=>boss.go(B+'/api/admin/lotto/'+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json'},body:b&&JSON.stringify(b)}).then(async x=>[x.r.status,await x.r.json()]);
  const [s1,a1]=await bo('act',{name:'线上'});assert.equal(s1,200);const act=a1.act.id;
  await bo('prize',{act,tier:2,name:'猫杯',weight:1,stock:5});await bo('act/status',{id:act,to:'live'});
  const [,gr]=await bo('grant',{act,emp:'W001',n:1,why:'互动游戏'});assert.equal(gr.grant.by,'后台 A001');

  // 不在白名单的 W777 登录：后台进不去，自己能用
  const alice=jar();g=await loginAs(alice,'c-alice','shop');assert.match(g.url,/\/#lotto=in$/);
  assert.equal((await alice.go(B+'/api/admin/lotto/state')).r.status,401);
  r=await (await alice.go(B+'/api/lotto/me')).r.json();assert.equal(r.me.emp,'W777');assert.equal(r.me.name,'测试');assert.equal(r.me.left,0);assert.equal(r.me.admin,false);

  // 刷新：codehub star 了、稼先关注了，各发 1 次；再刷新（过了 10 秒的限制以后）不再发
  r=await (await alice.go(B+'/api/lotto/refresh',{method:'POST'})).r.json();assert.deepEqual(r.got.sort(),['codehub','jiaxian']);assert.equal(r.left,2);
  r=await (await alice.go(B+'/api/lotto/refresh',{method:'POST'})).r.json();assert.equal(r.err,'soon');

  // 自己抽：两次都中（只有一档、库存够），第三次没次数
  for(let i=0;i<2;i++){r=await (await alice.go(B+'/api/lotto/draw',{method:'POST'})).r.json();assert.equal(r.draw.name,'猫杯');assert.equal(r.draw.via,'w3')}
  assert.equal((await (await alice.go(B+'/api/lotto/draw',{method:'POST'})).r.json()).err,'none');

  // 退出：会话作废
  await alice.go(B+'/api/lotto/logout',{method:'POST'});assert.equal((await (await alice.go(B+'/api/lotto/me')).r.json()).me,null);

  // state 对不上（别人塞过来的 code）：不登录
  const eve=jar();g=await eve.go(B+'/api/lotto/w3/callback?code=c-alice&state=forged');assert.match(g.url,/#lotto-err=state$/);assert.equal(eve.c.lotto_sid,undefined);
  // w3 给的工号格式不对：不登录
  const bad=jar();g=await loginAs(bad,'c-bad','desk');assert.match(g.url,/\/desk\.html#lotto-err=emp$/);assert.equal(bad.c.lotto_sid,undefined);

  const [,b2]=await bo('emp?emp=W777');assert.equal(b2.left,0);assert.equal(b2.draws.length,2);
  // 重启以后：会话还在（库里存的是散列）、记录还在
  srv.kill();await new Promise(r=>setTimeout(r,200));const srv2=await start(dir,PORT);t.after(()=>srv2.kill());
  const [s3,st3]=await bo('state');assert.equal(s3,200);assert.equal(st3.acts[0].draws,2);
});

test('codehub 查失败只给 0 次，不影响稼先',async t=>{
  const M=await mock();M.setFail(true);const MB=`http://127.0.0.1:${M.port}`;t.after(()=>M.srv.close());
  const SRC=require('./lotto-sources')({codehub:{url:MB+'/codehub?user={emp}',path:'starred',equals:true},jiaxian:{url:MB+'/jiaxian',method:'POST',body:{emp:'{emp}'},path:'list'}});
  await assert.rejects(SRC.check('codehub','W777'),/503/);assert.equal(await SRC.check('jiaxian','W777'),true);assert.equal(await SRC.check('jiaxian','W001'),false);
  await assert.rejects(SRC.check('github','W777'),/没配/)});
