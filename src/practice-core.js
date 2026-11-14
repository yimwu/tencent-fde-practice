(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PracticeCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const letters = ['A', 'B', 'C', 'D'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function createState(fingerprint) {
    return {version:2, fingerprint, records:{}, favorites:[], notes:{}, practice:{ids:[],index:0,answers:{},submitted:{},filters:{}}, exam:null, history:[]};
  }
  function grade(question, selected) {
    return Array.isArray(selected) && selected.every(x => letters.includes(x)) &&
      [...new Set(selected)].length === question.answer.length && question.answer.every(x => selected.includes(x));
  }
  function select(questions, state, filters = {}) {
    const search = String(filters.search || '').toLowerCase().trim();
    return questions.filter(q => {
      const rec = state.records[q.id];
      return (!filters.domain || filters.domain === 'all' || String(q.domain) === String(filters.domain)) &&
        (!filters.type || filters.type === 'all' || q.type === filters.type) &&
        (!filters.difficulty || filters.difficulty === 'all' || q.difficulty === filters.difficulty) &&
        (filters.scope !== 'wrong' || !!(rec && rec.wrong > 0 && !rec.lastCorrect)) &&
        (filters.scope !== 'favorites' || state.favorites.includes(q.id)) &&
        (filters.scope !== 'unanswered' || !rec || rec.attempts === 0) &&
        (!search || [q.id,q.stem,...Object.values(q.options)].join(' ').toLowerCase().includes(search));
    }).map(q => q.id);
  }
  function beginPractice(state, ids, filters) {
    state.practice = {ids:[...ids],index:0,answers:{},submitted:{},filters:{...filters}};
  }
  function choose(state, id, letter, question, exam = false) {
    const context = exam ? state.exam : state.practice;
    if (!context || !context.ids.includes(id) || !letters.includes(letter) || (exam && context.submittedAt!==null) || (!exam && context.submitted[id])) return false;
    const previous = context.answers[id] || [];
    context.answers[id] = question.type === 'single' ? [letter] : previous.includes(letter) ? previous.filter(x => x !== letter) : [...previous,letter].sort();
    return true;
  }
  function record(state, question, selected, now) {
    const correct = grade(question, selected);
    const old = state.records[question.id] || {attempts:0,correct:0,wrong:0};
    state.records[question.id] = {attempts:old.attempts+1, correct:old.correct+Number(correct), wrong:old.wrong+Number(!correct), lastCorrect:correct, lastSelected:[...selected], lastAt:now};
    return correct;
  }
  function submitPractice(state, question, now = Date.now()) {
    const p = state.practice;
    if (!p.ids.includes(question.id) || p.submitted[question.id] || !(p.answers[question.id] || []).length) return null;
    const correct = record(state, question, p.answers[question.id], now);
    p.submitted[question.id] = true;
    return {correct};
  }
  function retry(state, id) {
    delete state.practice.submitted[id];
    delete state.practice.answers[id];
  }
  function beginExam(state, questions, paper, now = Date.now(), duration = 7200000) {
    const ids = questions.filter(q => q.paper === paper).sort((a,b) => a.paper_number-b.paper_number).map(q => q.id);
    if (!ids.length) throw new Error('没有找到这套模拟卷');
    state.exam = {paper,ids,index:0,answers:{},startedAt:now,deadline:now+duration,submittedAt:null,result:null};
  }
  function remaining(exam, now = Date.now()) {
    return exam ? Math.max(0, Math.ceil((exam.deadline-now)/1000)) : 0;
  }
  function scoreExam(exam, questions) {
    const byId = new Map(questions.map(q => [q.id,q]));
    const domains = {}; const wrongIds = []; let correct = 0; let unanswered = 0;
    for (const id of exam.ids) {
      const q = byId.get(id); const selected = exam.answers[id] || [];
      const ok = grade(q, selected);
      const d = domains[q.domain] || (domains[q.domain] = {total:0,correct:0});
      d.total++; d.correct += Number(ok); correct += Number(ok);
      if (!selected.length) unanswered++;
      if (!ok) wrongIds.push(id);
    }
    return {correct,total:exam.ids.length,unanswered,wrongIds,domains,accuracy:Math.round(correct/exam.ids.length*1000)/10};
  }
  function finishExam(state, questions, now = Date.now()) {
    const exam = state.exam;
    if (!exam || exam.submittedAt !== null) return false;
    exam.result = scoreExam(exam,questions); exam.submittedAt = now;
    for (const id of exam.ids) record(state,questions.find(q => q.id === id),exam.answers[id] || [],now);
    state.history.unshift(clone(exam)); state.history = state.history.slice(0,20);
    return true;
  }
  function stats(questions,state) {
    const records = questions.map(q => state.records[q.id]).filter(Boolean);
    const attempts = records.reduce((n,r) => n+r.attempts,0);
    const correct = records.reduce((n,r) => n+r.correct,0);
    return {completed:records.filter(r => r.attempts>0).length,mastered:records.filter(r => r.lastCorrect).length,wrong:records.filter(r => r.wrong>0 && !r.lastCorrect).length,favorites:state.favorites.length,attempts,accuracy:attempts ? Math.round(correct/attempts*1000)/10 : 0};
  }
  function serialize(state) { return JSON.stringify(state); }
  function persist(storage,key,expectedRaw,nextRaw) {
    try {
      const currentRaw=storage.getItem(key);
      if(currentRaw!==expectedRaw)return {ok:false,conflict:true,currentRaw};
      storage.setItem(key,nextRaw);
      return {ok:true};
    } catch(error) { return {ok:false,conflict:false,error:String(error.message||error)}; }
  }
  function deserialize(raw,fingerprint,questions) {
    const input = JSON.parse(raw);
    if (!input || input.version !== 2 || input.fingerprint !== fingerprint) throw new Error('备份版本或题库版本不匹配');
    const state = createState(fingerprint); const known = new Set(questions.map(q => q.id));
    const object = x => x && typeof x === 'object' && !Array.isArray(x);
    const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
    const validIds = ids => Array.isArray(ids) && ids.length <= questions.length && ids.every(id => known.has(id)) && new Set(ids).size === ids.length;
    function answers(value) {
      if (!object(value)) throw new Error('备份作答结构不正确');
      const result = {};
      for (const [id,choices] of Object.entries(value)) {
        if (!known.has(id) || !Array.isArray(choices) || choices.length>4 || choices.some(x => !letters.includes(x)) || new Set(choices).size!==choices.length) throw new Error('备份包含无效题号或选项');
        result[id] = [...choices];
      }
      return result;
    }
    if (!object(input.records) || !object(input.notes) || !validIds(input.favorites)) throw new Error('备份学习记录结构不正确');
    for (const [id,r] of Object.entries(input.records)) {
      if (!known.has(id) || !object(r) || ![r.attempts,r.correct,r.wrong,r.lastAt].every(finite) || ![r.attempts,r.correct,r.wrong].every(Number.isInteger) || r.attempts>1000000 || r.correct+r.wrong!==r.attempts || typeof r.lastCorrect!=='boolean') throw new Error('备份成绩记录无效');
      state.records[id] = {...r,lastSelected:answers({[id]:r.lastSelected})[id]};
    }
    state.favorites = [...input.favorites];
    for (const [id,note] of Object.entries(input.notes)) {
      if (!known.has(id) || typeof note!=='string' || note.length>8000) throw new Error('备份笔记结构不正确');
      state.notes[id] = note;
    }
    const p = input.practice;
    if (!object(p) || !validIds(p.ids) || !Number.isInteger(p.index) || p.index<0 || p.index>=Math.max(1,p.ids.length) || !object(p.submitted)) throw new Error('备份练习进度无效');
    state.practice = {ids:[...p.ids],index:p.index,answers:answers(p.answers),submitted:{},filters:{}};
    for (const [id,flag] of Object.entries(p.submitted)) {
      if (!p.ids.includes(id) || flag!==true || !state.practice.answers[id]?.length) throw new Error('备份提交状态无效');
      state.practice.submitted[id] = true;
    }
    for (const key of ['scope','domain','type','difficulty','search','order']) if (typeof p.filters?.[key]==='string') state.practice.filters[key]=p.filters[key].slice(0,200);
    function restoreExam(e) {
      if (!object(e) || !['A','B','C'].includes(e.paper) || !validIds(e.ids) || !e.ids.length || !Number.isInteger(e.index) || e.index<0 || e.index>=e.ids.length || !finite(e.startedAt) || !finite(e.deadline) || e.deadline<=e.startedAt || e.deadline-e.startedAt>86400000 || (e.submittedAt!==null && !finite(e.submittedAt))) throw new Error('备份考试状态无效');
      const expected = questions.filter(q=>q.paper===e.paper).sort((a,b)=>a.paper_number-b.paper_number).map(q=>q.id);
      if (JSON.stringify(e.ids)!==JSON.stringify(expected)) throw new Error('备份试卷题目不匹配');
      const exam = {paper:e.paper,ids:[...e.ids],index:e.index,answers:answers(e.answers),startedAt:e.startedAt,deadline:e.deadline,submittedAt:e.submittedAt,result:null};
      if (exam.submittedAt!==null) exam.result=scoreExam(exam,questions);
      return exam;
    }
    if (input.exam!==null) state.exam=restoreExam(input.exam);
    if (!Array.isArray(input.history) || input.history.length>20) throw new Error('备份历史记录无效');
    state.history=input.history.map(restoreExam);
    if (state.history.some(e=>e.submittedAt===null)) throw new Error('历史考试尚未交卷');
    return state;
  }
  return {createState,grade,select,beginPractice,choose,submitPractice,retry,beginExam,remaining,scoreExam,finishExam,stats,serialize,deserialize,persist};
});
