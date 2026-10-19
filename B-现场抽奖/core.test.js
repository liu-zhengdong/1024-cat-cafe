// 现场抽奖的规则测试：node --test
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./core');
const T0=1_000_000;
// 一等奖 1 份、二等奖 2 份、谢谢惠顾不限；图鉴卡 2 张
function setup(){const s=C.fresh();C.setPrize(s,{tier:1,name:'键盘',weight:1,stock:1},'p1');C.setPrize(s,{tier:2,name:'猫杯',weight:1,stock:2},'p2');
  C.setPrize(s,{tier:0,name:'谢谢惠顾',weight:1,stock:null},'p0');C.settings(s,{cardStock:2});return s}
const draw=(s,r)=>C.draw(s,T0,()=>r);

test('按权重抽：落在哪一档就是哪一档',()=>{const s=setup();
  assert.equal(draw(s,0).draw.tier,1);C.claim(s,1,'w1',false,T0);assert.equal(draw(s,.4).draw.tier,2);C.claim(s,2,'w2',false,T0);assert.equal(draw(s,.9).draw.tier,0)});

test('中了奖没登记，不能抽下一次；登记了就能抽',()=>{const s=setup();draw(s,0);
  assert.deepEqual(draw(s,.9),{err:'pending',no:1});assert.equal(s.draws.length,1);
  assert.equal(C.claim(s,1,' w 001 ',false,T0).draw.emp,'W001');assert.ok(draw(s,.9).draw)});

test('谢谢惠顾发图鉴卡，发完就不发了',()=>{const s=setup();
  const a=[draw(s,.9),draw(s,.9),draw(s,.9)].map(r=>r.draw.card);assert.deepEqual(a,[true,true,false]);assert.equal(s.card.given,2)});

test('库存抽完的退出；全空回 empty，不记一次',()=>{const s=C.fresh();C.setPrize(s,{tier:1,name:'键盘',weight:1,stock:1},'p1');
  draw(s,.5);C.claim(s,1,'W1',false,T0);assert.deepEqual(draw(s,.5),{err:'empty'});assert.equal(s.draws.length,1);
  assert.equal(C.restock(s,'p1',1).prize.stock,2);assert.equal(draw(s,.5).draw.tier,1)});

test('同一个工号又中了：先提醒，force 才登记',()=>{const s=setup();draw(s,0);C.claim(s,1,'W001',false,T0);draw(s,.4);
  assert.deepEqual(C.claim(s,2,'w001',false,T0),{err:'dup',prev:[{no:1,tier:1,name:'键盘'}]});assert.equal(s.draws[1].emp,null);
  assert.equal(C.claim(s,2,'w001',true,T0).draw.emp,'W001')});

test('作废：放回库存，导出时不算；之后能接着抽',()=>{const s=setup();draw(s,0);assert.equal(s.prizes[0].given,1);
  assert.equal(C.voidDraw(s,1).draw.void,true);assert.equal(s.prizes[0].given,0);assert.equal(C.winOf(s),null);assert.equal(draw(s,0).draw.tier,1);
  assert.equal(C.voidDraw(s,1).err,'bad');assert.equal(C.claim(s,1,'W1',false,T0).err,'bad')});

test('谢谢惠顾不能登记、不能作废；工号格式不对不收',()=>{const s=setup();draw(s,.9);
  assert.equal(C.claim(s,1,'W1',false,T0).err,'bad');assert.equal(C.voidDraw(s,1).err,'bad');draw(s,0);
  for(const e of ['','x','中文','a b c'.repeat(20)])assert.equal(C.claim(s,2,e,false,T0).err,'bad',e);assert.equal(C.claim(s,9,'W1',false,T0).err,'none')});

test('暂停时不能抽',()=>{const s=setup();C.settings(s,{open:false});assert.deepEqual(draw(s,0),{err:'closed'});C.settings(s,{open:true});assert.ok(draw(s,0).draw)});

test('奖品：参数不对不收；改库存不能少于已发；发出去过的不能删',()=>{const s=setup();
  for(const p of [{tier:4,name:'x',weight:1,stock:1},{tier:1,name:'',weight:1,stock:1},{tier:1,name:'x',weight:-1,stock:1},{tier:1,name:'x',weight:1,stock:1.5}])assert.equal(C.setPrize(s,p,'q').err,'bad');
  draw(s,0);assert.equal(C.setPrize(s,{id:'p1',tier:1,name:'键盘',weight:1,stock:0}).err,'bad');assert.equal(C.setPrize(s,{id:'p1',tier:1,name:'大键盘',weight:2,stock:3}).prize.name,'大键盘');
  assert.equal(C.delPrize(s,'p1').err,'bad');assert.equal(C.delPrize(s,'p2').prize.id,'p2');assert.equal(C.setPrize(s,{id:'nope',tier:1,name:'x',weight:1,stock:1}).err,'none')});

test('设置：图鉴卡总数不能少于已经发出去的；提示最多 60 个字',()=>{const s=setup();draw(s,.9);
  assert.equal(C.settings(s,{cardStock:0}).err,'bad');assert.equal(C.settings(s,{note:'x'.repeat(61)}).err,'bad');assert.equal(C.settings(s,{open:'yes'}).err,'bad');
  assert.ok(C.settings(s,{cardStock:5,note:' 先确认条件 '}).ok);assert.equal(s.note,'先确认条件')});

test('清空重来：记录清掉、已发归零，奖品设置留着',()=>{const s=setup();draw(s,0);C.claim(s,1,'W1',false,T0);draw(s,.9);C.reset(s);
  assert.equal(s.draws.length,0);assert.equal(s.prizes.length,3);assert.ok(s.prizes.every(p=>p.given===0));assert.equal(s.card.given,0);assert.equal(s.card.stock,2)});

test('读库：缺的补上，认不出等级的不进抽奖',()=>{const s=C.load({prizes:[{id:'x',tier:9,name:'怪',weight:5,stock:1,given:0}]});
  assert.equal(s.open,true);assert.deepEqual(s.card,{stock:0,given:0});assert.equal(s.prizes[0].weight,0);assert.deepEqual(C.draw(s,T0,()=>0),{err:'empty'});
  assert.deepEqual(C.load(null),C.fresh())});
