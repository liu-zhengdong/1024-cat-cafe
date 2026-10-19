/* 1024 猫咖 · 抽奖系统的自动发次数：查一个工号有没有 star codehub 仓库、有没有关注稼先节目号（docs/抽奖系统.md"能做什么"）。
   服务端用服务账号查，不用用户自己授权。每个来源在 lotto-config.json 的 sources 里一段：
     {"url":"https://…/stars?user={emp}", "method":"GET", "headers":{"Authorization":"Bearer …"}, "body":null, "path":"data.starred", "equals":true}
   - url、body 里的 {emp} 换成工号（url 里会编码）；
   - 回来的 JSON 按 path 取值：写了 equals 就要相等才算，没写就是"取到的值为真"才算（数组按长度、对象算真）。
   接口的形状对不上（要先换 token、要翻页、要按用户名不按工号查……），只改这里的 check()：别处只认"check 给回 true/false，或者抛错"。
   GitHub 不一样：要员工自己填用户名，见下面 github()。
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
/* GitHub：员工自己填用户名，查它 star 了 clowder-ai 没有。配置 sources.github：{"repo":"zts212653/clowder-ai", "token":"可选，github 的 token", "api":"可选，默认 https://api.github.com"}
   GitHub 没有"某个用户 star 了某个仓库没有"的接口（/users/{用户名}/starred/{仓库} 对 star 了的人也回 404，2026-10-19 实测），
   只能翻这个用户 star 过的仓库列表 GET {api}/users/{用户名}/starred?sort=created，最近 star 的在前：为活动刚 star 的在第一页。
   最多翻 PAGES 页（每页 100 个）；用户名不存在回 404，算没 star；别的状态都算没查成。
   不带 token 每小时只能调 60 次（按服务器的出口 IP 算），活动当天不够：要配 token（公开信息，不用勾任何权限）。 */
const G=S.github&&typeof S.github.repo==='string'&&/^[\w.-]+\/[\w.-]+$/.test(S.github.repo)?S.github:null,PAGES=5;
async function github(user){if(!G)throw new Error('github 没配');const want=G.repo.toLowerCase(),api=(G.api||'https://api.github.com').replace(/\/$/,'');
  for(let page=1;page<=PAGES;page++){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),TIMEOUT);
    try{const r=await fetch(`${api}/users/${encodeURIComponent(user)}/starred?sort=created&direction=desc&per_page=100&page=${page}`,
        {headers:{Accept:'application/vnd.github+json','User-Agent':'1024-cat-cafe',...(G.token?{Authorization:'Bearer '+G.token}:{})},signal:ac.signal});
      if(r.status===404)return false;
      if(!r.ok)throw new Error(`github 回了 ${r.status}`+(r.status===403||r.status===429?'（多半是查太多次了，配个 token）':''));
      const L=await r.json();if(!Array.isArray(L))throw new Error('github 回的不是列表');
      if(L.some(x=>x&&String(x.full_name).toLowerCase()===want))return true;if(L.length<100)return false}finally{clearTimeout(t)}}
  return false}
return{on,check,github:G?github:null}};
module.exports.NAMES=NAMES;
