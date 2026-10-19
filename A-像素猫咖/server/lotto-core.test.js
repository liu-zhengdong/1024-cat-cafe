// 抽奖规则的测试：node --test 'server/*.test.js'
const test=require('node:test'),assert=require('node:assert/strict');
const L=require('./lotto-core');
const T0=1_000_000;
// 一个进行中的活动：一等奖 1 个、二等奖 2 个
function live(extra={}){const s=L.fresh();L.addAct(s,{name:'1024',...extra},'a1');
  L.addPrize(s,'a1',{tier:1,name:'键盘',weight:1,stock:1},'p1');L.addPrize(s,'a1',{tier:2,name:'猫杯',weight:3,stock:2},'p2');
  L.setStatus(s,'a1','live',null,T0);return s}
const give=(s,emp,n=1)=>L.grant(s,{act:'a1',emp,src:'manual',n},T0);
const draw=(s,emp,r=0)=>L.draw(s,{act:'a1',emp,via:'desk'},T0,()=>r);

test('工号去掉空格、转大写以后是同一个人',()=>{const s=live();give(s,' ab 12 ');assert.equal(L.left(s,'a1','AB12'),1)});

test('没有次数不能抽；抽一次扣一次',()=>{const s=live();assert.equal(draw(s,'E1').err,'none');
  give(s,'E1',2);const r=draw(s,'E1');assert.equal(r.left,1);assert.equal(s.draws.length,1)});

test('自动来源同一个活动只发一次，管理员加的不去重',()=>{const s=live();
  assert.equal(L.grant(s,{act:'a1',emp:'E1',src:'codehub'},T0).left,1);
  const again=L.grant(s,{act:'a1',emp:'E1',src:'codehub',n:5},T0);assert.equal(again.dup,true);assert.equal(again.left,1);
  give(s,'E1');give(s,'E1');assert.equal(L.left(s,'a1','E1'),3)});

test('管理员减次数，不能减到比已经抽掉的少',()=>{const s=live();give(s,'E1',2);draw(s,'E1');
  assert.equal(give(s,'E1',-2).err,'none');assert.equal(give(s,'E1',-1).left,0)});

test('认不出的来源、工号格式不对都拒绝，state 不动',()=>{const s=live();
  assert.equal(L.grant(s,{act:'a1',emp:'E1',src:'wechat'},T0).err,'bad');assert.equal(give(s,'中文工号').err,'bad');
  assert.equal(give(s,'E1',1.5).err,'bad');assert.equal(s.grants.length,0)});

test('按权重抽，库存抽完的退出，全空不扣次数',()=>{const s=live();give(s,'E1',5);
  assert.equal(draw(s,'E1',0).draw.prize,'p1');            // r=0 落在第一档
  assert.equal(draw(s,'E1',0).draw.prize,'p2');            // 一等奖没了，只剩二等奖
  assert.equal(draw(s,'E1',0.99).draw.prize,'p2');
  const r=draw(s,'E1');assert.equal(r.err,'empty');assert.equal(L.left(s,'a1','E1'),2)});

test('不限库存的"谢谢参与"一直能抽到',()=>{const s=live();L.addPrize(s,'a1',{tier:0,name:'谢谢参与',weight:10,stock:null},'p0');
  give(s,'E1',10);for(let i=0;i<10;i++)assert.ok(draw(s,'E1',0.99).draw);assert.equal(s.acts[0].prizes[2].given,10)});

test('补货以后又能抽到',()=>{const s=live();give(s,'E1',4);for(let i=0;i<3;i++)draw(s,'E1');assert.equal(draw(s,'E1').err,'empty');
  assert.equal(L.restock(s,'a1','p1',1).prize.stock,2);assert.equal(draw(s,'E1').draw.prize,'p1');
  assert.equal(L.restock(s,'a1','p1',0).err,'bad')});

test('改库存不能少于已经发出去的',()=>{const s=live();give(s,'E1');draw(s,'E1',0);
  assert.equal(L.editPrize(s,'a1','p1',{stock:0}).err,'bad');assert.equal(L.editPrize(s,'a1','p1',{stock:3}).prize.stock,3)});

test('状态只能按规定变；暂停、草稿、结束都不能抽',()=>{const s=live();give(s,'E1',3);
  assert.equal(L.setStatus(s,'a1','draft',null,T0).err,'bad');
  L.setStatus(s,'a1','paused',null,T0);assert.equal(draw(s,'E1').err,'act');
  L.setStatus(s,'a1','live',null,T0);assert.ok(draw(s,'E1').draw);
  assert.equal(L.setStatus(s,'a1','ended','whatever',T0).err,'bad');
  L.setStatus(s,'a1','ended','early',T0);assert.equal(draw(s,'E1').err,'act');
  assert.equal(L.setStatus(s,'a1','live',null,T0).err,'bad');assert.equal(give(s,'E1').err,'act')});

test('不在活动时间里不能抽；过了结束时间当作结束',()=>{const s=live({start:T0+10,end:T0+100});give(s,'E1');
  assert.equal(draw(s,'E1').err,'time');assert.ok(L.draw(s,{act:'a1',emp:'E1',via:'w3'},T0+50,()=>0).draw);
  const a=s.acts[0];assert.equal(L.statusOf(a,T0+100),'ended');assert.equal(L.setStatus(s,'a1','paused',null,T0+100).err,'bad')});

test('读库时认不出的状态当暂停，缺的补上',()=>{const s=L.load({acts:[{id:'x',status:'weird'}]});
  assert.equal(s.acts[0].status,'paused');assert.deepEqual(s.acts[0].prizes,[]);assert.deepEqual(s.draws,[]);
  assert.deepEqual(L.load(null),L.fresh())});

test('奖品参数不对拒绝',()=>{const s=live();for(const p of [{tier:1,name:'x',weight:0,stock:1},{tier:1,name:'',weight:1,stock:1},{tier:10,name:'x',weight:1,stock:1},{tier:1,name:'x',weight:1,stock:-1}])
  assert.equal(L.addPrize(s,'a1',p,'q').err,'bad');assert.equal(s.acts[0].prizes.length,2)});
