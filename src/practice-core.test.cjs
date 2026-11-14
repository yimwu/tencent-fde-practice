const test = require('node:test');
const assert = require('node:assert/strict');
let C = {};
try { C = require('./practice-core.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const qs = [
  {id:'q1', domain:1, type:'single', difficulty:'基础', stem:'角色', options:{A:'执行',B:'判断',C:'数据',D:'界面'},answer:['B'],paper:'A',paper_number:1},
  {id:'q2', domain:2, type:'multiple', difficulty:'应用', stem:'权限边界',options:{A:'审计',B:'越权',C:'审批',D:'泄露'},answer:['A','C'],paper:'A',paper_number:2},
  {id:'q3', domain:2, type:'single',difficulty:'综合',stem:'其他场景',options:{A:'甲',B:'乙',C:'丙',D:'丁'},answer:['D'],paper:'B',paper_number:1}
];
test('多选严格比较集合，漏选、额外选项和无效选项不能算对',()=>{
  assert.equal(typeof C.grade,'function','缺少真实判分功能');
  assert.equal(C.grade(qs[1],['C','A']),true);
  for(const answer of [[],['A'],['A','B','C'],['A','C','Z']]) assert.equal(C.grade(qs[1],answer),false);
  assert.equal(C.grade(qs[0],['B']),true);
  assert.equal(C.grade(qs[0],['A']),false);
});
test('提交后不重复计数，重练答对移出当前错题但保留历史错误',()=>{
  const s=C.createState('bank'); C.beginPractice(s,['q2'],{}); C.choose(s,'q2','A',qs[1]);
  C.submitPractice(s,qs[1],100); C.submitPractice(s,qs[1],101);
  assert.equal(s.records.q2.attempts,1); assert.equal(s.records.q2.lastCorrect,false);
  assert.equal(C.choose(s,'q2','C',qs[1]),false);
  C.retry(s,'q2'); C.choose(s,'q2','A',qs[1]); C.choose(s,'q2','C',qs[1]); C.submitPractice(s,qs[1],200);
  assert.equal(s.records.q2.attempts,2); assert.equal(s.records.q2.wrong,1);
  assert.deepEqual(C.select(qs,s,{scope:'wrong'}),[]);
});
test('未提交答案不计成绩，筛选未做题、收藏和关键词不泄露答案',()=>{
  const s=C.createState('bank');C.beginPractice(s,['q1'],{});C.choose(s,'q1','A',qs[0]);
  assert.equal(C.stats(qs,s).attempts,0);
  s.favorites=['q2'];
  assert.deepEqual(C.select(qs,s,{scope:'favorites',domain:'2',type:'multiple',search:'审批'}),['q2']);
  assert.deepEqual(C.select(qs,s,{scope:'unanswered',difficulty:'综合'}),['q3']);
});
test('序列化恢复当前题、草稿、收藏、笔记和考试截止时间',()=>{
  const s=C.createState('bank'); C.beginPractice(s,['q1','q2'],{});s.practice.index=1;
  C.choose(s,'q2','C',qs[1]);s.favorites=['q1'];s.notes.q1='先判断业务目标';
  C.beginExam(s,qs,'A',1000,120000);
  const restored=C.deserialize(C.serialize(s),'bank',qs);
  assert.equal(restored.practice.index,1);assert.deepEqual(restored.practice.answers.q2,['C']);
  assert.equal(restored.notes.q1,'先判断业务目标');assert.deepEqual(restored.favorites,['q1']);
  assert.equal(restored.exam.deadline,121000);assert.equal(C.remaining(restored.exam,61000),60);
});
test('考试未答算错，超时交卷仅记录一次且交卷后不能改答案',()=>{
  const s=C.createState('bank');C.beginExam(s,qs,'A',1000,120000);C.choose(s,'q1','B',qs[0],true);
  assert.equal(C.remaining(s.exam,999999),0);
  C.finishExam(s,qs,121001);C.finishExam(s,qs,121002);
  assert.equal(s.history.length,1);assert.equal(s.exam.result.correct,1);
  assert.equal(s.exam.result.total,2);assert.equal(s.exam.result.unanswered,1);assert.equal(s.exam.result.accuracy,50);
  assert.equal(C.choose(s,'q2','A',qs[1],true),false);
  assert.deepEqual(C.select(qs,s,{scope:'wrong'}),['q2']);
});
test('备份拒绝损坏数据、不同题库和非法选项，不修改现有记录',()=>{
  const s=C.createState('bank'); const before=C.serialize(s);
  assert.throws(()=>C.deserialize('{','bank',qs));
  assert.throws(()=>C.deserialize(JSON.stringify({...s,fingerprint:'other'}),'bank',qs));
  assert.throws(()=>C.deserialize(JSON.stringify({...s,practice:{ids:['q1'],index:0,answers:{q1:['Z']},submitted:{},filters:{}}}),'bank',qs));
  assert.equal(C.serialize(s),before);
});
test('陈旧页面保存时检测另一页的新记录，不覆盖新收藏或考试结果',()=>{
  let raw='newer-record';
  const storage={getItem:()=>raw,setItem:(_key,value)=>{raw=value;}};
  const result=C.persist(storage,'key','old-record','stale-draft');
  assert.equal(result.ok,false);assert.equal(result.conflict,true);assert.equal(raw,'newer-record');
  assert.equal(C.persist(storage,'key','newer-record','confirmed-record').ok,true);
  assert.equal(raw,'confirmed-record');
});
test('存储被禁用或配额不足时报告失败，不能声称已保存',()=>{
  const storage={getItem:()=>null,setItem:()=>{throw new Error('QuotaExceeded');}};
  assert.equal(C.persist(storage,'key',null,'new').ok,false);
});
