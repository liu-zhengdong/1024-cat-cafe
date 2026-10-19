/* 1024 猫咖 · 抽奖系统的 w3 登录（docs/抽奖系统.md"w3 登录"）。
   按标准的 OAuth2 授权码流程写：跳去 authorize → 带着 code 回到 callback → 拿 code 换 token → 拿 token 取用户信息 → 读出工号。
   地址、client、工号在用户信息里的哪个字段，都写在数据目录的 lotto-config.json 的 w3 一段里；没写就是没开 w3。
   w3 实际不是这个流程（比如 CAS 票据、要签名、工号要另外查），只改这里的 loginUrl() 和 identify()，别的地方不用动：
   别处只认"identify 给回 {emp} 或者抛错"。 */
const crypto=require('crypto');
const pick=(o,path)=>String(path||'').split('.').filter(Boolean).reduce((v,k)=>v==null?v:v[k],o);
const TIMEOUT=8000;

module.exports=(cfg,{fetch=globalThis.fetch}={})=>{
const c=cfg&&typeof cfg==='object'?cfg:null;
const need=['authorize','token','userinfo','clientId','redirect','empField'];
const enabled=!!c&&need.every(k=>typeof c[k]==='string'&&c[k]);
if(c&&!enabled)console.error('lotto-config.json 的 w3 缺了这几项，w3 登录没开：'+need.filter(k=>!(typeof c[k]==='string'&&c[k])).join('、'));

// 跳去 w3 登录的地址；state 防的是别人拿自己的 code 塞给你（回来时要和 cookie 里的对上）
function loginUrl(state){const u=new URL(c.authorize);u.searchParams.set('response_type','code');u.searchParams.set('client_id',c.clientId);
  u.searchParams.set('redirect_uri',c.redirect);u.searchParams.set('state',state);if(c.scope)u.searchParams.set('scope',c.scope);return u.href}

async function call(url,opt){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),TIMEOUT);
  try{const r=await fetch(url,{...opt,signal:ac.signal});const text=await r.text();if(!r.ok)throw new Error(`${url} 回了 ${r.status}：${text.slice(0,200)}`);
    try{return JSON.parse(text)}catch(e){throw new Error(`${url} 回的不是 JSON：${text.slice(0,200)}`)}}finally{clearTimeout(t)}}

// code → {emp, name}；拿不到工号就抛错
async function identify(code){
  const form=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:c.redirect,client_id:c.clientId});if(c.clientSecret)form.set('client_secret',c.clientSecret);
  const tk=await call(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:form.toString()});
  if(!tk.access_token)throw new Error('token 接口没给 access_token');
  const me=await call(c.userinfo,{headers:{Authorization:'Bearer '+tk.access_token,Accept:'application/json'}});
  const emp=pick(me,c.empField);if(emp==null||emp==='')throw new Error(`用户信息里没有 ${c.empField}`);
  return{emp:String(emp),name:c.nameField?String(pick(me,c.nameField)??''):''}}

const newState=()=>crypto.randomBytes(16).toString('base64url');
// 猫咖挂在哪个路径下：从 callback 地址往回推（https://网站/1024-cat-cafe/api/lotto/w3/callback → /1024-cat-cafe/），cookie 只在这个路径下发
const base=enabled?new URL(c.redirect).pathname.replace(/api\/lotto\/w3\/callback$/,''):'/';
const secure=enabled&&c.redirect.startsWith('https:');
return{enabled,loginUrl,identify,newState,base,secure}};
module.exports.pick=pick;
