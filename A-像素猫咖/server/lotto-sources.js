/* 1024 猫咖 · 抽奖系统的自动发次数：查一个工号有没有 star codehub 仓库、有没有关注稼先节目号（docs/抽奖系统.md"能做什么"）。
   服务端用服务账号查，不用用户自己授权。每个来源在 lotto-config.json 的 sources 里一段：
     {"url":"https://…/stars?user={emp}", "method":"GET", "headers":{"Authorization":"Bearer …"}, "body":null, "path":"data.starred", "equals":true}
   - url、body 里的 {emp} 换成工号（url 里会编码）；
   - 回来的 JSON 按 path 取值：写了 equals 就要相等才算，没写就是"取到的值为真"才算（数组按长度、对象算真）。
   接口的形状对不上（要先换 token、要翻页、要按用户名不按工号查……），只改这里的 check()：别处只认"check 给回 true/false，或者抛错"。
   查失败（超时、不是 200、不是 JSON）一律抛错：调用方给 0 次、提示稍后再试，不会多发。 */
const {pick}=require('./w3');
const NAMES=['codehub','jiaxian'],TIMEOUT=5000;

module.exports=(cfg,{fetch=globalThis.fetch}={})=>{
const S=cfg&&typeof cfg==='object'?cfg:{};
const on=NAMES.filter(k=>S[k]&&typeof S[k].url==='string'&&S[k].url);
const fill=(s,emp,enc)=>String(s).replace(/\{emp\}/g,enc?encodeURIComponent(emp):emp);
async function check(src,emp){const c=S[src];if(!on.includes(src))throw new Error(src+' 没配');
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),TIMEOUT);
  try{const body=c.body==null?undefined:fill(typeof c.body==='string'?c.body:JSON.stringify(c.body),emp,false);
    const r=await fetch(fill(c.url,emp,true),{method:c.method||(body?'POST':'GET'),headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(c.headers||{})},body,signal:ac.signal});
    if(!r.ok)throw new Error(`${src} 回了 ${r.status}`);const j=await r.json();const v=pick(j,c.path);
    if('equals' in c)return v===c.equals;return Array.isArray(v)?v.length>0:!!v}finally{clearTimeout(t)}}
return{on,check}};
module.exports.NAMES=NAMES;
