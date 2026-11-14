const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('./practice-core.js');

// Execute the real application, replacing only browser APIs. No application
// functions are copied into this harness and no actual browser storage is used.
const source = fs.readFileSync(path.join(__dirname, 'practice-app.js'), 'utf8');
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '题库.json'), 'utf8')).questions;
const KEY = 'tencent-fde-bank-20261103-v2';
const fingerprint = 'storage-regression-bank';
const bank = {questions, fingerprint, domains:Array.from({length:10}, (_, i)=>`模块${i+1}`), sectionTitles:{}, sectionUrls:{}, courseHref:'https://cloud.tencent.com/edu/learning/course-4767-84813-84825'};
const initial = () => C.createState(fingerprint);

function createTab(store, initialTime = 1000000) {
  const listeners = {}, windowListeners = {}, nodes = new Map(), downloads = [], intervals = [];
  let now = initialTime;
  const document = {
    activeElement:null,
    getElementById(id) {
      if (!nodes.has(id)) {
        const node = {id, textContent:'', innerHTML:'', style:{}, listeners:{},
          addEventListener(type, callback) {this.listeners[type] = callback;},
          focus() {document.activeElement = this;},
          showModal() {this.open = true;}, close() {this.open = false;}};
        if (id === 'bank-data') node.textContent = JSON.stringify(bank);
        nodes.set(id, node);
      }
      return nodes.get(id);
    },
    addEventListener(type, callback) {listeners[type] = callback;},
    querySelectorAll() {return [];}, querySelector() {return null;},
    createElement() {return {click() {downloads.push(this.href);}};}
  };
  const blobs = new Map();
  class TestDate extends Date {
    constructor(...args) {super(...(args.length ? args : [now]));}
    static now() {return now;}
  }
  vm.runInNewContext(source, {
    document, window:{PracticeCore:C, scrollTo(){}, addEventListener(type, callback){windowListeners[type]=callback;}},
    localStorage:{getItem:key=>store.get(key) ?? null, setItem:(key,value)=>store.set(key,value)},
    location:{hash:'',search:''}, URLSearchParams, Blob, Date:TestDate,
    URL:{createObjectURL(blob){const url=`blob:test-${blobs.size}`;blobs.set(url,blob);return url;},revokeObjectURL(){}},
    setInterval(callback){intervals.push(callback);},setTimeout(){},clearTimeout(){}
  }, {filename:'practice-app.js'});
  return {
    click(action, value='') {listeners.click({target:{closest(){return {disabled:false,dataset:{action,value}};}}});},
    inputNote(id, value) {listeners.input({target:{dataset:{note:id},value}});},
    confirm() {document.getElementById('dialog-confirm').listeners.click();},
    storage(newValue, key=KEY) {windowListeners.storage({key,newValue});},
    async exported() {this.click('export');assert.ok(downloads.length);return blobs.get(downloads.at(-1)).text();},
    async importRaw(raw) {
      await document.getElementById('import-file').listeners.change({target:{value:'backup.json',files:[{size:Buffer.byteLength(raw),text:async()=>raw}]}});
    },
    tick(time) {now=time;intervals.forEach(callback=>callback());},
    get html() {return document.getElementById('app').innerHTML;},
    get toast() {return document.getElementById('toast').textContent;},
    get dialogOpen() {return !!document.getElementById('confirm-dialog').open;}
  };
}

test('真实 app：没有 storage 事件时，陈旧标签页也不能覆盖另一页记录，并能导出本页草稿', async()=>{
  const store=new Map(), a=createTab(store), b=createTab(store);
  a.click('favorite',questions[0].id);
  const saved=store.get(KEY);
  b.click('favorite',questions[1].id);
  assert.equal(store.get(KEY),saved);
  assert.match(b.html,/载入最新记录/);
  const draft=JSON.parse(await b.exported());
  assert.deepEqual(draft.favorites,[questions[1].id]);
  assert.deepEqual(JSON.parse(saved).favorites,[questions[0].id]);
});

test('真实 app：storage 事件暂停保存；显式载入最新后可继续保存且保留对方数据',()=>{
  const store=new Map(), a=createTab(store), b=createTab(store);
  a.inputNote(questions[0].id,'另一页的新笔记');
  const saved=store.get(KEY);
  b.storage(saved);
  assert.match(b.html,/本页已暂停保存/);
  b.click('favorite',questions[1].id);
  assert.equal(store.get(KEY),saved);
  b.click('load-latest');
  b.click('favorite',questions[1].id);
  const state=JSON.parse(store.get(KEY));
  assert.equal(state.notes[questions[0].id],'另一页的新笔记');
  assert.deepEqual(state.favorites,[questions[1].id]);
});

for (const broken of ['{broken-json', JSON.stringify({...initial(),fingerprint:'old-bank',notes:{[questions[0].id]:'原始重要笔记'}})]) {
  test(`真实 app：恢复失败保留原始字节，编辑不覆盖，导出后才可显式重置（${broken.startsWith('{broken')?'JSON损坏':'版本不匹配'}）`, async()=>{
    const store=new Map([[KEY,broken]]), tab=createTab(store);
    tab.click('favorite',questions[1].id);
    assert.equal(store.get(KEY),broken);
    tab.click('reset-recovery');
    assert.equal(tab.dialogOpen,false);
    assert.match(tab.toast,/先导出原始记录/);
    assert.equal(await tab.exported(),broken);
    tab.click('reset-recovery');
    assert.equal(tab.dialogOpen,true);
    assert.equal(store.get(KEY),broken);
    tab.confirm();
    assert.deepEqual(JSON.parse(store.get(KEY)),initial());
    tab.click('favorite',questions[0].id);
    assert.deepEqual(JSON.parse(store.get(KEY)).favorites,[questions[0].id]);
  });
}

test('真实 app：恢复重置确认前若另一页更新，不能以空白覆盖新记录',async()=>{
  const broken='{bad',store=new Map([[KEY,broken]]),tab=createTab(store);
  await tab.exported();tab.click('reset-recovery');
  const newer=initial();newer.notes[questions[0].id]='已恢复的新记录';
  const raw=C.serialize(newer);store.set(KEY,raw);
  tab.confirm();
  assert.equal(store.get(KEY),raw);
  assert.match(tab.html,/载入最新记录/);
  tab.click('load-latest');tab.click('favorite',questions[1].id);
  assert.equal(JSON.parse(store.get(KEY)).notes[questions[0].id],'已恢复的新记录');
});

test('真实 app：正常备份导入须确认，非法备份不改变已有记录',async()=>{
  const original=initial();original.notes[questions[0].id]='现有记录';
  const store=new Map([[KEY,C.serialize(original)]]),tab=createTab(store);
  const backup=initial();backup.favorites=[questions[1].id];const raw=C.serialize(backup);
  await tab.importRaw(raw);
  assert.deepEqual(JSON.parse(store.get(KEY)),original);
  tab.confirm();assert.deepEqual(JSON.parse(store.get(KEY)),backup);
  await tab.importRaw('{bad');
  assert.deepEqual(JSON.parse(store.get(KEY)),backup);
  assert.match(tab.toast,/未导入/);
});

test('真实 app：冲突期间考试到时仍交卷到可导出草稿，不覆盖最新存储',async()=>{
  const state=initial();C.beginExam(state,questions,'A',1000000,1000);
  const store=new Map([[KEY,C.serialize(state)]]),tab=createTab(store);
  const latest=initial();latest.notes[questions[0].id]='另一页需保留的笔记';
  const latestRaw=C.serialize(latest);store.set(KEY,latestRaw);tab.storage(latestRaw);
  tab.tick(1001001);tab.tick(1002001);
  assert.equal(store.get(KEY),latestRaw);
  const draft=JSON.parse(await tab.exported());
  assert.equal(draft.history.length,1);
  assert.equal(draft.exam.result.total,60);
  assert.equal(draft.exam.result.unanswered,60);
  assert.ok(draft.exam.submittedAt!==null);
});

test('修订版真实 app：忽略旧版记录，新保存不覆盖旧版对错与笔记',()=>{
  const oldKey='tencent-fde-practice-v2';
  const oldState=C.createState('original-bank-fingerprint');
  oldState.notes[questions[0].id]='旧版重要笔记';
  oldState.records[questions[0].id]={attempts:1,correct:0,wrong:1,lastCorrect:false,lastSelected:['A'],lastAt:1};
  const original=C.serialize(oldState),store=new Map([[oldKey,original]]);
  const tab=createTab(store);
  assert.doesNotMatch(tab.html,/无法恢复本地记录/);
  tab.click('favorite',questions[1].id);
  const revised=JSON.parse(store.get(KEY));
  assert.equal(store.get(oldKey),original);
  assert.deepEqual(revised.records,{});
  assert.deepEqual(revised.notes,{});
  assert.deepEqual(revised.favorites,[questions[1].id]);
  assert.equal(store.size,2);
});
