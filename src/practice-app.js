(function () {
  'use strict';
  const D = JSON.parse(document.getElementById('bank-data').textContent);
  const C = window.PracticeCore, Q = D.questions, byId = new Map(Q.map(q=>[q.id,q]));
  const KEY = 'tencent-fde-bank-20261103-v2';
  let state = C.createState(D.fingerprint), storageError = '', notice = '', toastTimer, pendingConfirm;
  let lastSavedRaw=null, recoveryRaw=null, exportedRecovery=false, hasConflict=false;
  const ui = {view:location.hash.startsWith('#paper=')||new URLSearchParams(location.search).has('paper')?'exams':'home',filters:{domain:'all',type:'all',difficulty:'all',scope:'all',order:'ordered',search:''},result:null,reviewIds:[],reviewIndex:0};
  try { lastSavedRaw = localStorage.getItem(KEY); if (lastSavedRaw) state = C.deserialize(lastSavedRaw,D.fingerprint,Q); }
  catch (error) { recoveryRaw=lastSavedRaw; storageError = '无法恢复本地记录：'+error.message+'。原始记录已保护，尚未覆盖。'; }
  const e = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rich = value => e(value).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  const button = (label,action,value='',kind='secondary',disabled=false) => `<button class="button ${kind}" data-action="${action}" data-value="${e(value)}" ${disabled?'disabled':''}>${label}</button>`;
  const date = value => new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const clock = seconds => `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  function save() {
    if(recoveryRaw)storageError='原始记录尚未恢复，已暂停覆盖保存。请先导出原始记录，再明确重新开始。';
    else if(hasConflict)storageError='另一页面已更新记录，本页已暂停保存。请导出本页草稿或载入最新记录，避免互相覆盖。';
    else {
      const raw=C.serialize(state);let result;
      try{result=C.persist(localStorage,KEY,lastSavedRaw,raw);}catch(_){result={ok:false,conflict:false};}
      if(result.ok){lastSavedRaw=raw;storageError='';}
      else if(result.conflict){hasConflict=true;storageError='另一页面已更新记录，本页已暂停保存。请导出本页草稿或载入最新记录。';}
      else storageError='浏览器未能保存进度。当前作答仍可继续，请使用“导出备份”保留学习记录。';
    }
    const status=document.getElementById('save-status');
    if(status){status.className=storageError?'save-error small':'muted small';status.textContent=storageError?'本次未能自动保存':'已自动保存到本浏览器';}
  }
  function toast(message) {
    const node=document.getElementById('toast');node.textContent=message;node.style.display='block';
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.style.display='none';},3600);
  }
  function confirmAction(title,text,callback) {
    document.getElementById('confirm-title').textContent=title;
    document.getElementById('confirm-text').textContent=text;
    pendingConfirm=callback;document.getElementById('confirm-dialog').showModal();
  }
  const activeExam = () => state.exam && state.exam.submittedAt===null;
  function activeBanner() {
    return activeExam()?`<div class="active-exam"><p><strong>模拟卷 ${state.exam.paper} 正在进行</strong><br><span class="small">剩余 <span data-timer>${clock(C.remaining(state.exam))}</span>，离开本页不会暂停计时。</span></p>${button('返回考试','resume-exam','','primary')}</div>`:'';
  }
  function shell(content) {
    const stats=C.stats(Q,state), scope=ui.view==='practice'?state.practice.filters.scope:ui.filters.scope;
    const current=['exams','exam','result','review'].includes(ui.view)?'exams':ui.view==='history'?'history':scope==='wrong'?'wrong':scope==='favorites'?'favorites':ui.view==='practice'?'practice':'home';
    const nav=[['home','学习总览',''],['practice','章节练习',''],['wrong','错题本',stats.wrong],['favorites','我的收藏',stats.favorites],['exams','模拟考试','3'],['history','考试记录',state.history.length]];
    const recoveryActions=recoveryRaw?`<p class="small">请先导出原始记录，避免丢失其中的笔记或历史成绩。</p>${button('导出原始记录','export')}${button('以空白记录重新开始','reset-recovery')}`:hasConflict?`<div class="actions">${button('导出本页草稿','export')}${button('载入最新记录','load-latest','','primary')}</div>`:'';
    return `<a href="#main-content" class="skip-link">跳转到主要内容</a><div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">F</span><div>FDE 备考工作台<small>180 道原创练习 · 修订版</small></div></div><nav class="side-nav" aria-label="学习导航">${nav.map(([value,label,count])=>`<button class="nav-button ${current===value?'active':''}" data-action="nav" data-value="${value}" ${current===value?'aria-current="page"':''}><span>${label}</span>${count!==''?`<span class="nav-count">${count}</span>`:''}</button>`).join('')}</nav><div class="side-bottom"><p>题库 v2.0 · 2026-11-03 修订</p><p>原创模拟题，非官方题库或真题。</p><a href="${e(D.courseHref)}" target="_blank" rel="noopener">腾讯云官方课程</a></div></aside><main class="main" id="main-content"><div class="content"><header class="topbar"><p class="muted small"><span class="status-dot"></span><span id="save-status">${storageError?'本地记录需要注意':'进度保存在当前浏览器'}</span></p><div class="backup-actions"><button class="text-button" data-action="export">${recoveryRaw?'导出原始记录':'导出备份'}</button><button class="text-button" data-action="import">导入备份</button><a class="small" href="使用说明.html">使用说明</a></div></header>${storageError?`<div class="storage-warning" role="alert">${e(storageError)}${recoveryActions}</div>`:''}${notice?`<div class="storage-warning" role="status">${e(notice)}</div>`:''}${ui.view!=='exam'?activeBanner():''}${content}</div></main></div>`;
  }
  function metric(label,value,detail) {return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;}
  function field(label,key,values) {return `<div class="field"><label for="filter-${key}">${label}</label><select id="filter-${key}" data-filter="${key}">${values.map(([value,text])=>`<option value="${e(value)}" ${String(ui.filters[key])===String(value)?'selected':''}>${e(text)}</option>`).join('')}</select></div>`;}
  function home() {
    const stats=C.stats(Q,state), scope=ui.filters.scope;
    const title=scope==='wrong'?'错题重练':scope==='favorites'?'收藏题练习':'学习总览';
    const subtitle=scope==='wrong'?'集中练最近仍未答对的题。重新提交答对后，会自动移出待复习列表。':scope==='favorites'?'把值得反复琢磨的场景留在这里，随时开始一组练习。':'继续上次的练习，或选择一个模块开始。每次专注一题。';
    const count=C.select(Q,state,ui.filters).length;
    return `<div class="page-head"><div><h1>${title}</h1><p class="muted">${subtitle}</p></div>${state.practice.ids.length?button('继续上次练习','continue','','primary'):''}</div><div class="metrics">${metric('已练习',`${stats.completed}<small> / 180</small>`,'至少提交过一次的题目')}${metric('最近答对',stats.mastered,'按每题最近一次提交统计')}${metric('待复习错题',stats.wrong,'重练答对后自动移出')}${metric('累计正确率',`${stats.accuracy}%`,`${stats.attempts} 次提交，包含重复练习`)}</div><div class="home-grid"><section class="panel"><div class="panel-head"><h2>选择这一组练习</h2><span class="badge">单选 / 多选</span></div><div class="filters">${field('章节模块','domain',[['all','全部模块'],...D.domains.map((name,i)=>[i+1,`${String(i+1).padStart(2,'0')} ${name}`])])}${field('题型','type',[['all','全部题型'],['single','单选题'],['multiple','多选题']])}${field('范围','scope',[['all','全部题目'],['unanswered','尚未练习'],['wrong','待复习错题'],['favorites','收藏题']])}${field('认知任务','difficulty',[['all','全部'],['基础','基础'],['应用','应用'],['综合','综合']])}${field('出题顺序','order',[['ordered','按题库顺序'],['random','随机顺序']])}<div class="field field-wide"><label for="filter-search">查找题目</label><input id="filter-search" data-filter="search" value="${e(ui.filters.search)}" placeholder="输入关键词或题号，如 MCP、FDE-081" type="search"></div></div><div class="filter-footer"><p class="muted small">符合条件：<strong id="filter-count">${count}</strong> 道</p>${button('开始练习','start','','primary',count===0)}</div><p class="notice">练习提交后显示逐项解析。多选错选、漏选均判错；正确率采用等权统计，不是官方考试分数。</p></section><section class="panel"><div class="panel-head"><h2>章节进度</h2><span class="muted small">已做 / 题量</span></div>${D.domains.map((name,i)=>{const list=Q.filter(q=>q.domain===i+1),done=list.filter(q=>state.records[q.id]?.attempts>0).length;return `<button class="module-row" data-action="module" data-value="${i+1}"><span class="module-index">${String(i+1).padStart(2,'0')}</span><span class="module-name">${e(name)}<span class="progress"><i style="width:${done/list.length*100}%"></i></span></span><span class="module-count">${done} / ${list.length}</span></button>`;}).join('')}</section></div><p class="notice">学习记录保存在当前浏览器。更换浏览器、文件位置或清理浏览器数据前，请导出备份；熟题成绩不代表未见题表现。</p>`;
  }
  function analysis(q,selected) {
    const correct=C.grade(q,selected);
    return `<section class="answer-panel" aria-live="polite"><p tabindex="-1" class="verdict ${correct?'good':'bad'}">${correct?'回答正确':'本题未答对'} <span class="small">你的答案：${selected.length?selected.join('、'):'未作答'} · 正确答案：${q.answer.join('、')}</span></p><div class="analysis"><p>${e(q.explanation)}</p><ul>${['A','B','C','D'].map(letter=>`<li><strong>${letter} ${q.answer.includes(letter)?'正确':'不符合题意'}</strong>：${e(q.option_explanations[letter])}</li>`).join('')}</ul></div><div class="source-links"><span class="small muted">参考小节：</span>${q.source_refs.map(ref=>`<a href="${e(D.sectionUrls[ref])}" target="_blank" rel="noopener">${e(D.sectionTitles[ref])}</a>`).join('')}</div></section>`;
  }
  function quiz(mode) {
    const exam=mode==='exam', review=mode==='review';
    const context=exam?state.exam:review?ui.result:state.practice;
    const ids=review?ui.reviewIds:context.ids, index=review?ui.reviewIndex:context.index;
    if(!ids.length) return `<section class="panel empty"><h1>这一组没有题目</h1><p>调整筛选条件，或先完成一些练习。</p>${button('返回学习总览','nav','home','primary')}</section>`;
    const q=byId.get(ids[index]), selected=context.answers[q.id]||[], revealed=review||(!exam&&context.submitted[q.id]);
    const done=ids.filter(id=>exam||review?(context.answers[id]||[]).length:context.submitted[id]).length;
    const name=exam?`模拟卷 ${context.paper}`:review?`模拟卷 ${context.paper} 复盘`:'章节练习';
    const options=['A','B','C','D'].map(letter=>{
      const chosen=selected.includes(letter),right=revealed&&q.answer.includes(letter),wrong=revealed&&chosen&&!q.answer.includes(letter);
      return `<label class="option ${chosen?'selected':''} ${right?'correct':''} ${wrong?'incorrect':''}"><input id="answer-${letter}" type="${q.type==='single'?'radio':'checkbox'}" name="answer" data-answer="${letter}" value="${letter}" ${chosen?'checked':''} ${revealed?'disabled':''}><span class="option-letter">${letter}</span><span class="option-copy">${e(q.options[letter])}</span>${right?'<span class="option-state">正确选项</span>':wrong?'<span class="option-state">误选</span>':''}</label>`;
    }).join('');
    return `<div class="page-head"><div><h1>${name}</h1><p class="muted small">${exam?'交卷前隐藏答案与解析；多选错选、漏选均算错。':review?'对照题干条件检查每个选项，再回到官方课程补齐知识。':`本组 ${ids.length} 道 · 已提交 ${done} 道`}</p></div>${exam?'<div><p class="muted small" style="margin:0">考试剩余时间</p><div class="timer" data-timer>'+clock(C.remaining(context))+'</div></div>':''}</div><div class="quiz-grid"><section class="panel question-panel"><div class="question-top"><div class="question-meta"><span class="badge">${q.type==='single'?'单选题':'多选题'}</span><span class="muted small">${q.id} · ${q.difficulty} · ${index+1} / ${ids.length}</span></div><button class="favorite ${state.favorites.includes(q.id)?'on':''}" data-action="favorite" data-value="${q.id}" aria-pressed="${state.favorites.includes(q.id)}">${state.favorites.includes(q.id)?'★ 已收藏':'☆ 收藏'}</button></div><p class="muted small">${e(D.domains[q.domain-1])}${q.type==='multiple'?' · 请选择所有符合题意的选项':''}</p><fieldset><legend id="question-title" tabindex="-1">${rich(q.stem)}</legend><div class="option-list">${options}</div></fieldset>${revealed?analysis(q,selected):''}<div class="question-actions">${button('上一题','move','-1','secondary',index===0)}<div class="actions">${!exam&&!review?(revealed?button('重新作答','retry',q.id):button('提交答案','submit',q.id,'primary',!selected.length)):''}${index<ids.length-1?button('下一题','move','1',exam||revealed?'primary':'secondary'):exam?button('检查并交卷','finish-exam','','primary'):button(review?'返回成绩':'返回总览',review?'back-result':'nav','home','primary')}</div></div>${!exam?`<details class="note-block" ${state.notes[q.id]?'open':''}><summary>我的笔记${state.notes[q.id]?' · 已保存':''}</summary><label class="small muted" for="question-note">记录容易漏看的条件、错因或记忆方法（自动保存）</label><textarea id="question-note" data-note="${q.id}" maxlength="8000" placeholder="例如：先区分认证成功与工具调用权限，不用扩大权限来排错。">${e(state.notes[q.id]||'')}</textarea></details>`:''}</section><aside class="panel answer-card"><h2>答题卡</h2><p class="muted small">${exam?'已选择':review?'有作答':'已提交'} ${done} / ${ids.length}</p><div class="progress"><i style="width:${done/ids.length*100}%"></i></div><div class="card-numbers">${ids.map((id,i)=>{let cls=(context.answers[id]||[]).length?'answered':'';if(review||(!exam&&context.submitted[id]))cls=C.grade(byId.get(id),context.answers[id]||[])?'good':'bad';return `<button class="number-button ${cls} ${i===index?'current':''}" data-action="jump" data-value="${i}" aria-label="第 ${i+1} 题${i===index?'，当前题':''}" ${i===index?'aria-current="step"':''}>${i+1}</button>`;}).join('')}</div><div class="legend-items"><span>未答</span>${exam?'<span class="done">已选</span>':'<span class="good">正确</span><span class="bad">错误</span>'}</div>${exam?`<div style="margin-top:22px">${button('检查并交卷','finish-exam','','primary')}</div><p class="notice">允许跳题。到时自动交卷，未答题算错。</p>`:'<p class="notice">点击题号可跳转。已提交的练习需点“重新作答”才能修改。</p>'}</aside></div>`;
  }
  function exams() {
    return `<div class="page-head"><div><h1>模拟考试</h1><p class="muted">三套固定试卷互不重复。交卷前不显示正确性，交卷后统一复盘。</p></div></div><div class="exam-cards">${['A','B','C'].map(paper=>{const last=state.history.find(item=>item.paper===paper);return `<section class="panel"><div class="paper-letter">${paper}</div><h2>模拟卷 ${paper}</h2><p class="muted">60 题 · 120 分钟</p><ul><li>40 道单选题 + 20 道多选题</li><li>按官方大纲模块比例取整组卷</li><li>刷新、关闭后继续按截止时间计时</li></ul>${last?`<p class="small">上次正确率 <strong>${last.result.accuracy}%</strong> · ${date(last.submittedAt)}</p>`:'<p class="muted small">尚无交卷记录</p>'}${activeExam()&&state.exam.paper===paper?button('继续考试','resume-exam','','primary'):button('开始考试','start-exam',paper,'primary')}</section>`;}).join('')}</div><p class="notice">正确率按每题等权计算，多选完全匹配才算对。该结果不是官方百分制成绩，不用于承诺通过；已见过的题卷更适合作为复盘材料。</p>`;
  }
  function result() {
    const exam=ui.result, r=exam.result;
    return `<div class="page-head"><div><h1>模拟卷 ${exam.paper} · 成绩与复盘</h1><p class="muted small">${date(exam.submittedAt)} 交卷 · 本次记录已保存</p></div>${button('查看考试记录','nav','history')}</div><div class="panel"><div class="result-head"><div class="result-score">${r.accuracy}<small>%</small></div><div><h2 style="margin-bottom:6px">等权正确率</h2><p class="muted" style="margin:0">答对 ${r.correct} / ${r.total} 题 · 未答 ${r.unanswered} 题</p><p class="muted small" style="margin:4px 0 0">不是官方考试分数；未答和多选不完整均算错。</p></div></div><div class="actions">${button('逐题复盘','review','all','primary')}${button('只看错题','review','wrong','secondary',!r.wrongIds.length)}${button('把本卷错题再练一遍','practice-result','','secondary',!r.wrongIds.length)}</div></div><div class="result-grid" style="margin-top:22px"><section class="panel"><h2>分模块表现</h2>${Object.entries(r.domains).map(([domain,rec])=>`<div class="module-row"><span class="module-index">${String(domain).padStart(2,'0')}</span><span class="module-name">${e(D.domains[Number(domain)-1])}<span class="progress"><i style="width:${rec.correct/rec.total*100}%"></i></span></span><span class="module-count">${rec.correct} / ${rec.total}</span></div>`).join('')}</section><section class="panel"><h2>下一步怎么练</h2><p>先复盘错误和未答题，写下遗漏的题干条件，再回查对应课程章节。重练答对后，该题会移出当前错题本，历史错误次数仍保留。</p><p class="muted small">三套卷共用同一个 180 题题库，分章练习可能已经遇到卷内题目。反复做熟题的高分不能作为真实考试通过率。</p>${button('打开错题本','nav','wrong')}</section></div>`;
  }
  function history() {
    if(!state.history.length)return `<div class="page-head"><div><h1>考试记录</h1><p class="muted">保留最近 20 次交卷结果，支持回看当时的作答。</p></div></div><section class="panel empty"><h2>还没有完成的模拟考试</h2><p>从模拟卷 A 开始，限时作答后查看分模块结果。</p>${button('选择模拟卷','nav','exams','primary')}</section>`;
    return `<div class="page-head"><div><h1>考试记录</h1><p class="muted">最近 20 次交卷结果 · 正确率为每题等权口径</p></div></div><section class="panel table-wrap"><table><thead><tr><th>交卷时间</th><th>试卷</th><th>答对题数</th><th>未答</th><th>正确率</th><th>操作</th></tr></thead><tbody>${state.history.map((exam,i)=>`<tr><td>${date(exam.submittedAt)}</td><td>模拟卷 ${exam.paper}</td><td>${exam.result.correct} / ${exam.result.total}</td><td>${exam.result.unanswered}</td><td><strong>${exam.result.accuracy}%</strong></td><td><button class="text-button" data-action="history-result" data-value="${i}">查看与复盘</button></td></tr>`).join('')}</tbody></table></section>`;
  }
  function render(preserveFocus=false) {
    const focus=preserveFocus?document.activeElement?.id:null;
    const content=ui.view==='home'?home():ui.view==='practice'?quiz('practice'):ui.view==='exam'?quiz('exam'):ui.view==='review'?quiz('review'):ui.view==='exams'?exams():ui.view==='result'?result():history();
    document.getElementById('app').innerHTML=shell(content);
    if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  }
  function startPractice(ids,filters) {
    if(!ids.length){toast('没有符合条件的题目，请调整筛选。');return;}
    const run=()=>{C.beginPractice(state,ids,filters);save();ui.view='practice';render();window.scrollTo(0,0);};
    if(state.practice.ids.some(id=>(state.practice.answers[id]||[]).length&&!state.practice.submitted[id]))confirmAction('开始新一组练习？','这会替换当前练习的未提交答案。已提交成绩、错题、收藏和笔记都会保留。',run);
    else run();
  }
  function finishExam(expired=false) {
    if(!activeExam())return;
    const run=()=>{C.finishExam(state,Q);save();ui.result=state.exam;ui.view='result';render();window.scrollTo(0,0);if(expired)toast('考试时间已到，已自动交卷。');};
    if(expired){run();return;}
    const left=state.exam.ids.filter(id=>!(state.exam.answers[id]||[]).length).length;
    confirmAction('确认交卷',left?`还有 ${left} 道未作答，交卷后未答题将算错。确认现在交卷？`:'所有题目均已选择。交卷后显示成绩和解析，不能修改本次答案。',run);
  }
  const actions={
    nav(value){if(value==='home'||value==='practice'||value==='wrong'||value==='favorites'){ui.filters.scope=value==='wrong'?'wrong':value==='favorites'?'favorites':'all';ui.filters.domain='all';ui.filters.type='all';ui.filters.difficulty='all';ui.filters.search='';ui.view='home';}else ui.view=value;render();window.scrollTo(0,0);},
    start(){let ids=C.select(Q,state,ui.filters);if(ui.filters.order==='random'){ids=[...ids];for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}}startPractice(ids,{...ui.filters});},
    continue(){ui.view='practice';render();},
    module(value){ui.filters={domain:value,type:'all',difficulty:'all',scope:'all',order:'ordered',search:''};startPractice(C.select(Q,state,ui.filters),{...ui.filters});},
    move(value){const context=ui.view==='exam'?state.exam:ui.view==='review'?null:state.practice;if(context)context.index=Math.min(context.ids.length-1,Math.max(0,context.index+Number(value)));else ui.reviewIndex=Math.min(ui.reviewIds.length-1,Math.max(0,ui.reviewIndex+Number(value)));save();render();document.getElementById('question-title')?.focus();window.scrollTo(0,0);},
    jump(value){if(ui.view==='review')ui.reviewIndex=Number(value);else (ui.view==='exam'?state.exam:state.practice).index=Number(value);save();render();document.getElementById('question-title')?.focus();},
    submit(value){C.submitPractice(state,byId.get(value));save();render();document.querySelector('.verdict')?.focus();},
    retry(value){C.retry(state,value);save();render();document.getElementById('answer-A')?.focus();},
    favorite(value){state.favorites=state.favorites.includes(value)?state.favorites.filter(id=>id!==value):[...state.favorites,value];save();render();document.querySelector('[data-action="favorite"]')?.focus();},
    'start-exam'(paper){const run=()=>{C.beginExam(state,Q,paper);save();ui.view='exam';render();window.scrollTo(0,0);};if(activeExam())confirmAction('替换正在进行的考试？','当前考试尚未交卷。开始新考试会放弃当前试卷的作答，已交卷记录不会受影响。',run);else confirmAction(`开始模拟卷 ${paper}`,'共60题、120分钟。点击确认后开始计时；关闭或离开页面不会暂停，时间到后自动交卷。',run);},
    'resume-exam'(){if(!activeExam()){ui.view='exams';render();return;}ui.view='exam';render();},
    'finish-exam'(){finishExam();},
    'history-result'(value){ui.result=state.history[Number(value)];ui.view='result';render();},
    review(value){ui.reviewIds=value==='wrong'?[...ui.result.result.wrongIds]:[...ui.result.ids];ui.reviewIndex=0;ui.view='review';render();window.scrollTo(0,0);},
    'back-result'(){ui.view='result';render();},
    'practice-result'(){startPractice([...ui.result.result.wrongIds],{scope:'wrong'});},
    export(){const blob=new Blob([recoveryRaw||C.serialize(state)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`FDE修订版${recoveryRaw?'原始待恢复记录':'学习记录'}-${new Date().toLocaleDateString('sv-SE')}.json`;a.click();if(recoveryRaw)exportedRecovery=true;setTimeout(()=>URL.revokeObjectURL(url),5000);toast('学习记录已导出，请保留备份文件。');},
    import(){if(recoveryRaw||hasConflict){toast('请先处理上方的记录恢复或冲突提示，再导入备份。');return;}document.getElementById('import-file').click();},
    'load-latest'(){try{const raw=localStorage.getItem(KEY);state=raw?C.deserialize(raw,D.fingerprint,Q):C.createState(D.fingerprint);lastSavedRaw=raw;hasConflict=false;storageError='';ui.view='home';render();tick();toast('已载入最新记录。本页未保存的操作可通过刚才导出的草稿找回。');}catch(error){toast('载入失败，尚未覆盖任何记录：'+error.message);}},
    'reset-recovery'(){if(!exportedRecovery){toast('请先导出原始记录，再重新开始。');return;}confirmAction('使用空白学习记录？','请确认原始记录文件已下载。重新开始会替换当前无法恢复的本地记录。',()=>{try{const raw=localStorage.getItem(KEY);if(raw!==recoveryRaw){hasConflict=true;storageError='另一页面已更新记录，请载入最新记录。';recoveryRaw=null;render();return;}lastSavedRaw=raw;recoveryRaw=null;state=C.createState(D.fingerprint);save();ui.view='home';render();}catch(error){toast('未重置：'+error.message);}});}
  };
  document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;try{if(activeExam()&&C.remaining(state.exam)===0){finishExam(true);return;}actions[button.dataset.action]?.(button.dataset.value);}catch(error){toast('操作未完成：'+error.message);}});
  document.addEventListener('change',event=>{
    const node=event.target;
    if(node.dataset.answer){const exam=ui.view==='exam',context=exam?state.exam:state.practice,q=byId.get(context.ids[context.index]);if(exam&&C.remaining(context)===0){finishExam(true);return;}C.choose(state,q.id,node.dataset.answer,q,exam);save();render(true);}
    if(node.dataset.filter){ui.filters[node.dataset.filter]=node.value;updateCount();}
  });
  function updateCount(){const n=C.select(Q,state,ui.filters).length;const label=document.getElementById('filter-count');if(label)label.textContent=n;const start=document.querySelector('[data-action="start"]');if(start)start.disabled=n===0;}
  document.addEventListener('input',event=>{const node=event.target;if(node.dataset.note){state.notes[node.dataset.note]=node.value;save();}if(node.dataset.filter){ui.filters[node.dataset.filter]=node.value;updateCount();}});
  document.getElementById('dialog-cancel').addEventListener('click',()=>{document.getElementById('confirm-dialog').close();pendingConfirm=null;});
  document.getElementById('dialog-confirm').addEventListener('click',()=>{document.getElementById('confirm-dialog').close();const callback=pendingConfirm;pendingConfirm=null;callback?.();});
  document.getElementById('confirm-dialog').addEventListener('cancel',()=>{pendingConfirm=null;});
  document.getElementById('import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{if(file.size>5000000)throw new Error('备份文件超过5MB');const imported=C.deserialize(await file.text(),D.fingerprint,Q);confirmAction('导入学习备份？','有效备份将替换当前浏览器的学习记录。建议先导出当前记录；导入中的考试仍按原截止时间计时。',()=>{state=imported;save();ui.view='home';ui.filters.scope='all';render();tick();toast('备份已导入。');});}catch(error){toast('未导入，现有记录保持不变：'+error.message);}
  });
  window.addEventListener('storage',event=>{if(event.key!==KEY||event.newValue===lastSavedRaw)return;hasConflict=true;storageError='另一页面已更新学习记录，本页已暂停保存。请导出本页草稿或载入最新记录。';render();});
  function tick(){if(!activeExam())return;const seconds=C.remaining(state.exam);if(seconds===0){finishExam(true);return;}document.querySelectorAll('[data-timer]').forEach(node=>{node.textContent=clock(seconds);node.classList.toggle('urgent',seconds<600);});}
  render();tick();setInterval(tick,1000);
})();
