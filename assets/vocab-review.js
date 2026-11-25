/* CET-6 生词本：独立词库 + 间隔复习 + 困难词优先 + 自动发音 */
(function () {
  'use strict';

  var DECK_KEY = 'cet6_vocab_decks_v1';
  var STUDY_KEY = 'cet6_vocab_study_v2';
  var LEGACY_VOCAB_KEY = 'cet6_vocab';
  var LEGACY_STUDY_KEY = 'cet6_vocab_study_v1';
  var DAY = 24 * 60 * 60 * 1000;
  var $ = function (id) { return document.getElementById(id); };

  function readJson(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (e) { return fallback; }
  }
  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      alert('浏览器本地空间不足，保存失败。请先导出词库备份。');
      return false;
    }
  }
  function safe(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function localDay() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function formatDate(ts) {
    if (!ts) return '尚未安排';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function toast(message) {
    var el = $('deckToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'deckToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:400;background:#203b60;color:#fff;padding:8px 16px;border-radius:99px;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,.18)';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.style.display = 'none'; }, 1800);
  }

  var legacyVocab = readJson(LEGACY_VOCAB_KEY, {});
  var deckStore = readJson(DECK_KEY, { decks: {}, activeId: '' });
  if (!deckStore.decks || typeof deckStore.decks !== 'object') deckStore.decks = {};
  if (!deckStore.activeId) deckStore.activeId = '';

  /* 把旧版单一生词本迁移为「我的收藏」，原有单词不会丢失。 */
  if (Object.keys(legacyVocab).length) {
    if (!deckStore.decks.favorites) {
      deckStore.decks.favorites = {
        id: 'favorites', name: '我的收藏', createdAt: Date.now(), updatedAt: Date.now(), words: {}
      };
    }
    var favorites = deckStore.decks.favorites;
    if (!favorites.words || typeof favorites.words !== 'object') favorites.words = {};
    Object.keys(legacyVocab).forEach(function (word) {
      if (!favorites.words[word]) favorites.words[word] = legacyVocab[word];
    });
  }

  var studyStore = readJson(STUDY_KEY, { decks: {} });
  if (!studyStore.decks || typeof studyStore.decks !== 'object') studyStore.decks = {};
  var oldStudy = readJson(LEGACY_STUDY_KEY, null);
  if (deckStore.decks.favorites && oldStudy && oldStudy.items && !studyStore.decks.favorites) {
    studyStore.decks.favorites = {
      items: oldStudy.items || {},
      daily: oldStudy.daily || {}
    };
  }

  function saveDecks() { return writeJson(DECK_KEY, deckStore); }
  function saveStudy() { return writeJson(STUDY_KEY, studyStore); }
  function deckIds() {
    return Object.keys(deckStore.decks).sort(function (a, b) {
      return (Number(deckStore.decks[a].createdAt) || 0) -
        (Number(deckStore.decks[b].createdAt) || 0);
    });
  }
  function activeDeck() { return deckStore.decks[deckStore.activeId] || null; }
  function words() {
    var d = activeDeck();
    return d && d.words ? d.words : {};
  }
  function currentStudy() {
    if (!studyStore.decks[deckStore.activeId]) {
      studyStore.decks[deckStore.activeId] = { items: {}, daily: {} };
    }
    var s = studyStore.decks[deckStore.activeId];
    if (!s.items || typeof s.items !== 'object') s.items = {};
    if (!s.daily || typeof s.daily !== 'object') s.daily = {};
    return s;
  }
  function uniqueName(name) {
    var base = String(name || '').trim().slice(0, 60) || '未命名词库';
    var names = deckIds().map(function (id) { return deckStore.decks[id].name; });
    if (names.indexOf(base) === -1) return base;
    var n = 2;
    while (names.indexOf(base + ' (' + n + ')') !== -1) n++;
    return base + ' (' + n + ')';
  }
  function newId() {
    return 'deck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  if (!deckStore.activeId || !deckStore.decks[deckStore.activeId]) {
    var idsAtStart = deckIds();
    deckStore.activeId = idsAtStart.length ? idsAtStart[idsAtStart.length - 1] : '';
  }
  saveDecks();
  if (deckStore.decks.favorites && oldStudy && oldStudy.items) saveStudy();

  var session = null;
  var lastMissed = [];
  var lastMode = 'mix';

  function renderDeckSelect() {
    var select = $('deckSelect');
    var ids = deckIds();
    select.innerHTML = '';
    if (!ids.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '暂无词库，请先导入';
      select.appendChild(empty);
      select.disabled = true;
      $('renameDeck').disabled = true;
      $('deleteDeck').disabled = true;
      $('exportDeck').disabled = true;
      return;
    }
    select.disabled = false;
    ids.forEach(function (id) {
      var option = document.createElement('option');
      option.value = id;
      option.textContent = deckStore.decks[id].name + '（' +
        Object.keys(deckStore.decks[id].words || {}).length + '词）';
      select.appendChild(option);
    });
    select.value = deckStore.activeId;
    $('renameDeck').disabled = false;
    $('deleteDeck').disabled = false;
    $('exportDeck').disabled = false;
  }

  function statusFor(word, now) {
    var rec = currentStudy().items[word] || {};
    if (!rec.seen) return { text: '未学习', cls: 'new' };
    if (rec.lastGrade === 'again') return { text: '重点复习', cls: 'hard' };
    if (Number(rec.dueAt) <= now) return { text: '待复习', cls: 'due' };
    return { text: '下次 ' + formatDate(rec.dueAt), cls: '' };
  }

  function renderList() {
    var deck = activeDeck();
    var box = $('list');
    if (!deck) {
      box.innerHTML = '<p class="hint">还没有词库。先给词库命名，再导入 JSON 文件。</p>';
      $('count').textContent = '共 0 个生词';
      return;
    }
    var v = deck.words || {};
    var keys = Object.keys(v).sort();
    $('count').textContent = '当前词库共 ' + keys.length + ' 个生词';
    if (!keys.length) {
      box.innerHTML = '<p class="hint">这个词库暂时没有单词。</p>';
      return;
    }
    var now = Date.now();
    box.innerHTML = keys.map(function (word) {
      var e = v[word] || {};
      var st = statusFor(word, now);
      return '<div class="vocab-item"><div class="t"><b class="en">' + safe(word) + '</b>' +
        (e.p ? ' <span class="hint">/' + safe(e.p) + '/</span>' : '') +
        (e.s ? ' <span class="badge">' + safe(e.s) + '</span>' : '') +
        '<span class="vocab-status ' + st.cls + '">' + safe(st.text) + '</span>' +
        '<div class="zh">' + safe(e.t || '') + '</div>' +
        (e.mnemonic ? '<div class="vocab-mnemonic"><strong>💡 助记：</strong>' + safe(e.mnemonic) + '</div>' : '') +
        '</div><button class="btn small" data-remove-word="' + safe(word) + '">移除</button></div>';
    }).join('');
  }

  function dailyInfo() {
    var state = currentStudy();
    var day = localDay();
    if (!state.daily[day]) state.daily[day] = { tested: 0, known: 0, fuzzy: 0, again: 0 };
    return state.daily[day];
  }
  function renderStats() {
    if (!activeDeck()) {
      $('dailyStats').textContent = '导入词库后开始记录复习进度。';
      return;
    }
    var state = currentStudy();
    var d = dailyInfo();
    var now = Date.now();
    var list = Object.keys(words());
    var due = 0, fresh = 0, hard = 0;
    list.forEach(function (word) {
      var r = state.items[word] || {};
      if (!r.seen) fresh++;
      else if (r.lastGrade === 'again') { hard++; due++; }
      else if (Number(r.dueAt) <= now) due++;
      if (r.lastGrade === 'fuzzy') hard++;
    });
    $('dailyStats').textContent = '今日已测 ' + d.tested + ' 词 · 认识 ' + d.known +
      ' · 模糊 ' + d.fuzzy + ' · 不认识 ' + d.again +
      ' ｜ 待复习 ' + due + ' · 新词 ' + fresh + ' · 困难词 ' + hard;
  }

  function renderAll() {
    renderDeckSelect();
    renderList();
    renderStats();
  }
  renderAll();

  $('deckSelect').addEventListener('change', function () {
    deckStore.activeId = this.value;
    saveDecks();
    session = null;
    lastMissed = [];
    $('studyCard').classList.add('study-hidden');
    $('studyEnd').classList.add('study-hidden');
    $('studyProgress').classList.add('study-hidden');
    renderAll();
  });

  $('importFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (file && !$('newDeckName').value.trim()) {
      $('newDeckName').value = file.name.replace(/\.json$/i, '');
    }
  });

  $('importDeck').addEventListener('click', function () {
    var file = $('importFile').files && $('importFile').files[0];
    var name = $('newDeckName').value.trim();
    if (!file) { alert('请先选择 JSON 文件。'); return; }
    if (!name) { alert('请先给这个词库命名。'); $('newDeckName').focus(); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var incoming = parsed && parsed.words && typeof parsed.words === 'object' ? parsed.words : parsed;
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
          throw new Error('词库 JSON 应为「单词: 词条信息」的对象格式。');
        }
        var clean = {};
        Object.keys(incoming).forEach(function (word) {
          var entry = incoming[word];
          if (word && entry && typeof entry === 'object' && !Array.isArray(entry)) clean[word] = entry;
        });
        var count = Object.keys(clean).length;
        if (!count) throw new Error('文件中没有找到有效单词。');
        var id = newId();
        deckStore.decks[id] = {
          id: id,
          name: uniqueName(name),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          words: clean
        };
        deckStore.activeId = id;
        if (!saveDecks()) return;
        if (!studyStore.decks[id]) studyStore.decks[id] = { items: {}, daily: {} };
        saveStudy();
        $('newDeckName').value = '';
        $('importFile').value = '';
        lastMissed = [];
        session = null;
        $('studyCard').classList.add('study-hidden');
        $('studyEnd').classList.add('study-hidden');
        $('studyProgress').classList.add('study-hidden');
        renderAll();
        toast('已新建词库「' + deckStore.decks[id].name + '」，导入 ' + count + ' 词');
      } catch (e) {
        alert('导入失败：' + (e.message || 'JSON 格式错误'));
      }
    };
    reader.readAsText(file);
  });

  $('exportDeck').addEventListener('click', function () {
    var deck = activeDeck();
    if (!deck) return;
    var blob = new Blob([JSON.stringify(deck.words || {}, null, 2)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = deck.name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('已导出当前词库');
  });

  $('renameDeck').addEventListener('click', function () {
    var deck = activeDeck();
    if (!deck) return;
    var name = prompt('请输入新的词库名称：', deck.name);
    if (name === null || !name.trim()) return;
    deck.name = uniqueName(name.trim() === deck.name ? name.trim() + ' ' : name.trim());
    deck.updatedAt = Date.now();
    saveDecks();
    renderDeckSelect();
    toast('词库已重命名');
  });

  $('deleteDeck').addEventListener('click', function () {
    var deck = activeDeck();
    if (!deck) return;
    if (!confirm('确定删除词库「' + deck.name + '」及其复习记录吗？此操作不可撤销。')) return;
    var id = deckStore.activeId;
    delete deckStore.decks[id];
    delete studyStore.decks[id];
    if (id === 'favorites') {
      legacyVocab = {};
      localStorage.removeItem(LEGACY_VOCAB_KEY);
    }
    var ids = deckIds();
    deckStore.activeId = ids.length ? ids[ids.length - 1] : '';
    saveDecks();
    saveStudy();
    session = null;
    lastMissed = [];
    $('studyCard').classList.add('study-hidden');
    $('studyEnd').classList.add('study-hidden');
    $('studyProgress').classList.add('study-hidden');
    renderAll();
    toast('词库已删除');
  });

  $('list').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-remove-word]');
    if (!btn || !activeDeck()) return;
    var word = btn.getAttribute('data-remove-word');
    delete activeDeck().words[word];
    delete currentStudy().items[word];
    if (deckStore.activeId === 'favorites') {
      delete legacyVocab[word];
      writeJson(LEGACY_VOCAB_KEY, legacyVocab);
    }
    activeDeck().updatedAt = Date.now();
    saveDecks();
    saveStudy();
    renderAll();
  });

  $('maskBtn').addEventListener('click', function () {
    var masked = document.body.classList.toggle('hide-zh');
    this.textContent = masked ? '显示释义' : '遮住释义（自测）';
  });

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function duePool() {
    var now = Date.now();
    var state = currentStudy();
    var hard = [], due = [], fresh = [];
    Object.keys(words()).forEach(function (word) {
      var r = state.items[word] || {};
      if (r.lastGrade === 'again') hard.push(word);
      else if (r.seen && Number(r.dueAt) <= now) due.push(word);
      else if (!r.seen) fresh.push(word);
    });
    hard.sort(function (a, b) {
      var aa = state.items[a] || {}, bb = state.items[b] || {};
      return (Number(bb.lapses) || 0) - (Number(aa.lapses) || 0) ||
        (Number(aa.lastSeen) || 0) - (Number(bb.lastSeen) || 0);
    });
    due.sort(function (a, b) {
      return (Number(state.items[a].dueAt) || 0) - (Number(state.items[b].dueAt) || 0);
    });
    return hard.concat(due, shuffle(fresh));
  }

  function progress() {
    if (!session) return;
    var total = session.words.length;
    var done = session.index;
    $('progressText').textContent = '进度 ' + done + '/' + total;
    $('progressPercent').textContent = (total ? Math.round(done / total * 100) : 0) + '%';
    $('progressFill').style.width = (total ? done / total * 100 : 0) + '%';
  }

  function startSession(reviewOnly) {
    if (!activeDeck() || !Object.keys(words()).length) {
      alert('当前词库没有单词，请先导入 JSON。');
      return;
    }
    var mode = reviewOnly ? lastMode : $('studyMode').value;
    var pool;
    if (reviewOnly) {
      pool = lastMissed.slice();
      lastMissed = [];
    } else {
      lastMode = mode;
      var order = $('studyOrder').value;
      if (order === 'random') pool = shuffle(Object.keys(words()));
      else if (order === 'due') {
        var now = Date.now(), state = currentStudy();
        pool = Object.keys(words()).filter(function (word) {
          var r = state.items[word] || {};
          return !!r.seen && Number(r.dueAt) <= now;
        }).sort(function (a, b) {
          return (Number(state.items[a].dueAt) || 0) - (Number(state.items[b].dueAt) || 0);
        });
      } else pool = duePool();

      if (!pool.length) {
        var future = Object.keys(currentStudy().items).map(function (word) {
          return Number(currentStudy().items[word].dueAt) || 0;
        }).filter(function (ts) { return ts > Date.now(); }).sort(function (a, b) { return a - b; });
        alert(future.length ?
          '目前没有到期词或新词。下一次复习：' + formatDate(future[0]) + '。也可以切换「随机复习全部」。' :
          '当前没有可复习的词。');
        return;
      }
      var limit = $('studyLimit').value;
      if (limit !== 'all') pool = pool.slice(0, Number(limit));
    }
    if (!pool.length) { alert('本轮没有可重练的单词。'); return; }
    session = {
      words: pool.slice(),
      index: 0,
      mode: mode,
      reviewOnly: !!reviewOnly,
      reinserted: {},
      results: { known: 0, fuzzy: 0, again: 0 }
    };
    $('studyEnd').classList.add('study-hidden');
    $('studyCard').classList.remove('study-hidden');
    $('studyProgress').classList.remove('study-hidden');
    renderCard();
  }

  function speak(word) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    try {
      window.speechSynthesis.cancel();
      var utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }

  function renderCard() {
    if (!session) return;
    if (session.index >= session.words.length) { finishSession(); return; }
    var word = session.words[session.index];
    var entry = words()[word] || {};
    var direction = session.mode === 'mix' ? (Math.random() < 0.5 ? 'en' : 'zh') : session.mode;
    session.currentWord = word;
    session.currentDirection = direction;
    $('directionLabel').textContent = direction === 'en' ? '英 → 中' : '中 → 英';
    $('studyPrompt').textContent = direction === 'en' ? word : (entry.t || '该词暂无中文释义');
    $('studyPhonetic').textContent = direction === 'en' && entry.p ? '/' + entry.p + '/' : '';
    $('speakWord').classList.toggle('study-hidden', direction !== 'en');
    $('studyAnswer').textContent = direction === 'en' ? (entry.t || '暂无中文释义，请在词表中补充。') : word;
    $('studyMnemonicText').textContent = entry.mnemonic || '这个词还没有助记。';
    $('studyMnemonic').style.display = 'none';
    $('studyAnswer').classList.add('study-hidden');
    $('showAnswer').classList.remove('study-hidden');
    $('studyGrade').classList.add('study-hidden');
    $('cardHint').textContent = '先在心里回忆，再点击显示答案。';
    progress();
  }

  function finishSession() {
    $('studyCard').classList.add('study-hidden');
    $('studyEnd').classList.remove('study-hidden');
    $('studyProgress').classList.remove('study-hidden');
    progress();
    var result = session.results;
    var total = session.words.length;
    $('endSummary').textContent = '本轮完成 ' + total + ' 次记忆：认识 ' + result.known +
      '，模糊 ' + result.fuzzy + '，不认识 ' + result.again + '。';
    $('endAccuracy').textContent = lastMissed.length ?
      '还有 ' + lastMissed.length + ' 个词需要重点复习，系统已安排短间隔回炉。' :
      '本轮没有标记为模糊或不认识的词，继续保持。';
    $('reviewMisses').classList.toggle('study-hidden', lastMissed.length === 0);
    session = null;
    renderStats();
  }

  $('startStudy').addEventListener('click', function () { startSession(false); });
  $('restartStudy').addEventListener('click', function () { startSession(false); });
  $('reviewMisses').addEventListener('click', function () { startSession(true); });

  $('showAnswer').addEventListener('click', function () {
    $('studyAnswer').classList.remove('study-hidden');
    $('studyMnemonic').style.display = 'block';
    $('showAnswer').classList.add('study-hidden');
    $('studyGrade').classList.remove('study-hidden');
    $('cardHint').textContent = '根据刚才是否能主动回忆，选择你的掌握程度。';
  });

  $('studyGrade').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-grade]');
    if (!btn || !session) return;
    var grade = btn.getAttribute('data-grade');
    var word = session.currentWord;
    var now = Date.now();
    var state = currentStudy();
    var old = state.items[word] || { streak: 0, dueAt: 0, seen: 0, lapses: 0 };
    var streak = Number(old.streak) || 0;
    var dueAt;
    if (grade === 'known') {
      streak += 1;
      var intervals = [1, 3, 7, 14, 30, 60];
      dueAt = now + intervals[Math.min(streak - 1, intervals.length - 1)] * DAY;
    } else if (grade === 'fuzzy') {
      streak = 0;
      dueAt = now + 12 * 60 * 60 * 1000;
    } else {
      streak = 0;
      dueAt = now + 5 * 60 * 1000;
    }

    state.items[word] = {
      streak: streak,
      dueAt: dueAt,
      seen: (Number(old.seen) || 0) + 1,
      lastGrade: grade,
      lastSeen: now,
      lapses: (Number(old.lapses) || 0) + (grade === 'again' ? 1 : 0)
    };

    var daily = dailyInfo();
    daily.tested += 1;
    daily[grade] += 1;
    session.results[grade] += 1;

    if (grade !== 'known') {
      if (lastMissed.indexOf(word) === -1) lastMissed.push(word);
      /* 本轮把困难词再插入一次，隔开几个单词后回忆，避免连续死记。 */
      if (!session.reinserted[word]) {
        session.reinserted[word] = true;
        var insertAt = Math.min(session.index + 3, session.words.length);
        session.words.splice(insertAt, 0, word);
      }
    }

    /* 英译中或混合模式抽到英译中：点击任一记忆反馈后自动朗读当前英文。 */
    if (session.currentDirection === 'en') speak(word);

    activeDeck().updatedAt = Date.now();
    saveDecks();
    saveStudy();
    renderStats();
    session.index += 1;
    renderCard();
  });

  $('speakWord').addEventListener('click', function () {
    if (session && session.currentDirection === 'en') speak(session.currentWord);
  });
})();