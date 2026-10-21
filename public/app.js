'use strict';

// SiapUjian's single-page app: the dashboard (/), the two CAT-style exam
// screens (/ujian/utbk, /ujian/cpns) and the results screen (/hasil/:id).

(function () {
  var view = document.getElementById('view');
  var params = new URLSearchParams(location.search);
  var TOKEN = params.get('token') ||
    (window.usernode && (window.usernode.token || window.usernode.userToken)) || null;
  var DEMO = params.get('demo') === '1';
  var demoQuery = DEMO ? '?demo=1' : '';

  // The dashboard as the spec drew it, captured before any request goes out.
  var HOME_HTML = view.innerHTML;

  var MODE_INFO = {
    utbk: { name: 'Try Out UTBK PTN', count: 3, duration: '30 menit', passing: 'Passing grade 600' },
    cpns: { name: 'Try Out CAT CPNS', count: 3, duration: '45 menit', passing: 'Passing grade 10' },
  };

  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  var EXAM = null; // the loaded exam for the quiz view
  var examState = null;

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
    if (TOKEN) headers['x-usernode-token'] = TOKEN;
    return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (r.status === 204) return null;
      var body = r.json().catch(function () { return {}; });
      return body.then(function (b) {
        if (!r.ok) throw new Error((b && b.error) || 'HTTP ' + r.status);
        return b;
      });
    });
  }

  function now() {
    try {
      if (window.usernode && typeof window.usernode.now === 'function') {
        var d = window.usernode.now();
        if (d instanceof Date && !isNaN(d)) return d;
        if (d) return new Date(d);
      }
    } catch (e) {}
    return new Date();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function timeLabel(d) {
    return pad(d.getHours()) + '.' + pad(d.getMinutes());
  }

  function whenLabel(d) {
    var n = now();
    var today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Hari ini, ' + timeLabel(d);
    if (diff === 1) return 'Kemarin, ' + timeLabel(d);
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ', ' + timeLabel(d);
  }

  function todayLabel() {
    var n = now();
    return DAYS[n.getDay()] + ', ' + n.getDate() + ' ' + MONTHS[n.getMonth()];
  }

  function scoreLabel(mode, score, max) {
    return mode === 'cpns' ? 'Skor ' + score + ' / ' + max : 'Skor ' + score;
  }

  // ── Dialog ──────────────────────────────────────────────────────────────
  function confirmDialog(message, okLabel) {
    return new Promise(function (resolve) {
      var overlay = el('div');
      overlay.setAttribute('style', 'position:fixed;inset:0;background:rgb(var(--fg) / .35);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50');
      var box = el('div', 'card');
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('style', 'max-width:24rem;width:100%');
      var p = el('p', '', message);
      p.setAttribute('style', 'margin:0 0 16px');
      var row = el('div');
      row.setAttribute('style', 'display:flex;gap:8px;justify-content:flex-end');
      var cancel = el('button', 'btn-secondary', 'Batal');
      cancel.type = 'button';
      var ok = el('button', 'btn-primary', okLabel);
      ok.type = 'button';
      row.appendChild(cancel);
      row.appendChild(ok);
      box.appendChild(p);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      function close(answer) {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(answer);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      document.addEventListener('keydown', onKey);
      cancel.addEventListener('click', function () { close(false); });
      ok.addEventListener('click', function () { close(true); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
      ok.focus();
    });
  }

  // ── Routing ─────────────────────────────────────────────────────────────
  function navigate(path) {
    if (path + location.search === location.pathname + location.search) return;
    history.pushState({}, '', path + location.search);
    renderRoute();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="/"]');
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });
  window.addEventListener('popstate', renderRoute);

  function renderRoute() {
    stopTimer();
    var p = location.pathname.replace(/\/+$/, '') || '/';
    if (p === '/') return renderHome();
    var m = p.match(/^\/ujian\/(utbk|cpns)$/);
    if (m) return renderQuiz(m[1]);
    m = p.match(/^\/hasil\/(\d+)$/);
    if (m) return renderResults(m[1]);
    history.replaceState({}, '', '/' + location.search);
    return renderHome();
  }

  // ── Dashboard ───────────────────────────────────────────────────────────
  function renderHome() {
    view.innerHTML = HOME_HTML;
    var today = document.getElementById('today');
    if (today) today.textContent = todayLabel();

    var modes = document.querySelectorAll('#view [data-mode]');
    Array.prototype.forEach.call(modes, function (card) {
      var mode = card.getAttribute('data-mode');
      var info = MODE_INFO[mode];
      function fill(key, text) {
        var node = card.querySelector('[data-meta="' + key + '"]');
        if (node) node.textContent = text;
      }
      fill('count', info.count + ' soal');
      fill('duration', info.duration);
      fill('passing', info.passing);
      var rail = card.querySelector('[data-meta="rail"]');
      rail.innerHTML = '';
      for (var i = 1; i <= info.count; i++) rail.appendChild(el('i', '', String(i)));
    });

    var note = document.querySelector('[data-usernode-demo-note]');
    if (note) note.hidden = !DEMO;

    loadProfile();
    loadResults();
  }

  function loadProfile() {
    var nameEl = document.getElementById('profile-name');
    var targetEl = document.getElementById('profile-target');
    var initialEl = document.getElementById('profile-initial');
    var roleEl = document.getElementById('profile-role');
    var roleLabel = document.getElementById('profile-role-label');
    var editBtn = document.getElementById('edit-profile');
    if (!nameEl) return;
    editBtn.addEventListener('click', openProfileForm);

    nameEl.innerHTML = '<span class="skeleton" style="display:block;height:16px;width:140px;margin:3px 0"></span>';
    targetEl.innerHTML = '<span class="skeleton" style="display:block;height:12px;width:180px;margin:4px 0"></span>';
    targetEl.hidden = false;

    // The role badge names the exam the person is working towards, and the
    // mode card it belongs to wears a "Target kamu" chip.
    function paintRole(exam, goal) {
      var isCpns = exam === 'cpns';
      if (roleEl) roleEl.classList.toggle('cpns', isCpns);
      if (roleLabel) roleLabel.textContent = isCpns ? 'Pejuang CPNS' : 'Pejuang PTN';
      if (goal) {
        targetEl.textContent = goal;
        targetEl.hidden = false;
      } else {
        targetEl.textContent = '';
        targetEl.hidden = true;
      }
      Array.prototype.forEach.call(document.querySelectorAll('#view [data-mode]'), function (card) {
        card.classList.toggle('is-target', card.getAttribute('data-mode') === exam);
      });
    }

    api('/api/me').then(function (me) {
      nameEl.textContent = me.name || 'Tamu';
      initialEl.textContent = (me.name || 'T').trim().charAt(0).toUpperCase();
      paintRole(me.target_exam === 'cpns' ? 'cpns' : 'utbk', me.target_goal);
    }).catch(function () {
      nameEl.textContent = 'Tamu';
      initialEl.textContent = 'T';
      paintRole('utbk', null);
    });
  }

  function openProfileForm() {
    var card = document.getElementById('profile-card');
    if (!card) return;
    api('/api/me').then(function (me) {
      var form = el('form', 'card profile-form');
      form.id = 'profile-form';
      form.setAttribute('style', 'display:flex;flex-direction:column;gap:10px');
      form.innerHTML =
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<div style="font-weight:600;flex:1">Ubah profil</div>' +
          '<button type="button" class="btn-secondary" id="profile-cancel">Batal</button>' +
          '<button type="submit" class="btn-primary" style="min-width:0;padding:0 16px">Simpan</button>' +
        '</div>' +
        '<label class="s" for="f-name">Nama</label>' +
        '<input class="field" id="f-name" maxlength="60" required autocomplete="name">' +
        '<span class="s">Ujian target</span>' +
        '<div style="display:flex;gap:8px">' +
          '<button type="button" class="btn-secondary" data-target="utbk" aria-pressed="false">UTBK PTN</button>' +
          '<button type="button" class="btn-secondary" data-target="cpns" aria-pressed="false">CAT CPNS</button>' +
        '</div>' +
        '<label class="s" for="f-goal">Tujuan (opsional)</label>' +
        '<input class="field" id="f-goal" maxlength="80" placeholder="e.g. Kedokteran UI">' +
        '<div class="s" id="profile-error" role="alert" hidden></div>';
      card.replaceWith(form);

      var name = form.querySelector('#f-name');
      var goal = form.querySelector('#f-goal');
      name.value = me.name && me.name !== 'Tamu' ? me.name : '';
      goal.value = me.target_goal || '';
      var target = me.target_exam === 'cpns' ? 'cpns' : 'utbk';

      function paintTarget() {
        Array.prototype.forEach.call(form.querySelectorAll('[data-target]'), function (b) {
          var on = b.getAttribute('data-target') === target;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.classList.toggle('border-accent', on);
          b.classList.toggle('bg-raised', on);
        });
      }
      Array.prototype.forEach.call(form.querySelectorAll('[data-target]'), function (b) {
        b.addEventListener('click', function () {
          target = b.getAttribute('data-target');
          paintTarget();
        });
      });
      paintTarget();

      form.querySelector('#profile-cancel').addEventListener('click', function () {
        renderHome();
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = form.querySelector('#profile-error');
        var saveBtn = form.querySelector('button[type="submit"]');
        err.hidden = true;
        if (!name.value.trim()) {
          err.textContent = 'Nama tidak boleh kosong.';
          err.hidden = false;
          name.focus();
          return;
        }
        saveBtn.disabled = true;
        api('/api/me', {
          method: 'PUT',
          body: JSON.stringify({ name: name.value, target_exam: target, target_goal: goal.value }),
        }).then(function () {
          renderHome();
        }).catch(function () {
          saveBtn.disabled = false;
          err.textContent = 'Profil tidak bisa disimpan. Periksa koneksimu, lalu coba Simpan lagi.';
          err.hidden = false;
        });
      });
      name.focus();
    }).catch(function () {
      nameElFallback();
    });
  }

  function nameElFallback() {
    var nameEl = document.getElementById('profile-name');
    if (nameEl) nameEl.textContent = 'Tamu';
  }

  function loadResults() {
    var list = document.getElementById('results');
    var state = document.getElementById('results-state');
    if (!list || !state) return;

    list.hidden = true;
    list.innerHTML = '';
    state.innerHTML = '';
    var skeleton = el('ul', 'list');
    var tpl = document.getElementById('skeleton-row-tpl');
    for (var i = 0; i < 3; i++) skeleton.appendChild(tpl.content.cloneNode(true));
    state.appendChild(skeleton);

    function showError() {
      if (!document.getElementById('results')) return;
      var list2 = document.getElementById('results');
      var state2 = document.getElementById('results-state');
      list2.hidden = true;
      state2.innerHTML = '';
      var box = el('div', 'state-error');
      box.appendChild(el('div', 'text-body font-medium', 'Hasil terakhir tidak bisa dimuat.'));
      box.appendChild(el('div', 'text-small text-muted', 'Mode ujian tetap bisa dibuka.'));
      var retry = el('button', 'btn-secondary', 'Coba lagi');
      retry.type = 'button';
      retry.addEventListener('click', loadResults);
      box.appendChild(retry);
      state2.appendChild(box);
    }

    api('/api/attempts' + demoQuery).then(function (data) {
      if (!document.getElementById('results')) return;
      var list2 = document.getElementById('results');
      var state2 = document.getElementById('results-state');
      state2.innerHTML = '';
      var attempts = (data && data.attempts) || [];
      if (!attempts.length) {
        list2.hidden = true;
        var box = el('div', 'state-empty');
        box.appendChild(el('div', 'text-body font-medium', 'Belum ada hasil.'));
        box.appendChild(el('div', 'text-small text-muted', 'Selesaikan try out pertama untuk melihat skormu di sini.'));
        state2.appendChild(box);
        return;
      }
      var rowTpl = document.getElementById('result-row-tpl');
      attempts.forEach(function (a) {
        var row = rowTpl.content.firstElementChild.cloneNode(true);
        row.setAttribute('data-attempt', a.id);
        row.setAttribute('role', 'link');
        row.setAttribute('tabindex', '0');
        row.setAttribute('style', 'cursor:pointer');
        var icon = row.querySelector('.result-icon');
        if (icon) icon.classList.toggle('cpns', a.mode === 'cpns');
        row.querySelector('[data-row="mode"]').textContent = MODE_INFO[a.mode] ? MODE_INFO[a.mode].name : a.mode;
        row.querySelector('[data-row="when"]').textContent = whenLabel(new Date(a.created_at));
        row.querySelector('[data-row="score"]').textContent = scoreLabel(a.mode, a.score, a.max_score);
        var verdict = row.querySelector('[data-row="verdict"]');
        verdict.classList.add(a.passed ? 'ok' : 'no');
        row.querySelector('[data-row="verdict-label"]').textContent = a.passed ? 'Lulus' : 'Belum lulus';
        var verdictPath = row.querySelector('[data-row="verdict-path"]');
        if (verdictPath) verdictPath.setAttribute('d', a.passed ? 'M20 6 9 17l-5-5' : 'M18 6 6 18M6 6l12 12');
        function open() { navigate('/hasil/' + a.id); }
        row.addEventListener('click', open);
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
        list2.appendChild(row);
      });
      list2.hidden = false;
    }).catch(showError);
  }

  // ── Quiz ────────────────────────────────────────────────────────────────
  function stopTimer() {
    if (examState && examState.interval) {
      clearInterval(examState.interval);
      examState.interval = null;
    }
    examState = null;
    EXAM = null;
  }

  var BACK_SVG = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
  var CLOCK_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/></svg>';

  function quizShell(examName, subtitle, timerText) {
    return '<div data-spec-screen="2"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="quiz-back" type="button" aria-label="Keluar dari ujian">' + BACK_SVG + '</button>' +
      '<div><div class="ttl">' + examName + '</div><div class="s" id="quiz-progress">' + subtitle + '</div></div>' +
      '<div class="timer" aria-live="off">' + CLOCK_SVG + '<span id="quiz-timer">' + timerText + '</span></div></div>' +
      '<div class="grid"><div class="card" id="question-card">' +
      '<span class="tag" id="q-topic"></span><p class="q" id="q-prompt"></p><div id="q-options"></div>' +
      '</div><div class="rail"><span class="s">Soal</span><div id="rail-tiles" style="display:contents"></div><span class="s" id="rail-count" style="margin-top:6px;text-align:center"></span></div></div>' +
      '<div class="foot"><button class="btn-secondary" id="prev-q" type="button">Sebelumnya</button>' +
      '<button class="btn-primary" id="next-q" type="button">Soal berikutnya</button></div>' +
      '<div class="s" style="text-align:center;margin-top:12px">Ujian selesai otomatis saat waktu habis.</div>' +
      '<div class="s" id="quiz-error" role="alert" hidden style="text-align:center;margin-top:12px"></div>' +
      '</div></div>';
  }

  function renderQuiz(mode) {
    view.innerHTML = '<div data-spec-screen="2"><div class="app"><div class="bar"><button class="btn-secondary" id="quiz-back" type="button" aria-label="Keluar dari ujian">' + BACK_SVG + '</button><div><div class="ttl">' + (MODE_INFO[mode] ? MODE_INFO[mode].name : 'Try out') + '</div><div class="s">Memuat soal...</div></div></div>' +
      '<div class="card"><div class="skeleton" style="height:20px;width:40%;margin-bottom:14px"></div><div class="skeleton" style="height:16px;width:90%;margin-bottom:8px"></div><div class="skeleton" style="height:16px;width:70%;margin-bottom:20px"></div>' +
      '<div class="skeleton" style="height:44px;margin-bottom:8px"></div><div class="skeleton" style="height:44px;margin-bottom:8px"></div><div class="skeleton" style="height:44px"></div></div></div></div>';
    var back = document.getElementById('quiz-back');
    if (back) back.addEventListener('click', leaveQuiz);

    api('/api/exams/' + mode).then(function (exam) {
      if (!document.querySelector('[data-spec-screen="2"]')) return;
      startExam(exam);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="2"]')) return;
      view.innerHTML = '<div data-spec-screen="2"><div class="app"><div class="bar"><button class="btn-secondary" id="quiz-back" type="button" aria-label="Kembali">' + BACK_SVG + '</button><div><div class="ttl">Try out</div></div></div>' +
        '<div class="state-error"><div class="text-body font-medium">Soal tidak bisa dimuat.</div><div class="text-small text-muted">Periksa koneksimu, lalu coba lagi.</div><button class="btn-secondary" id="quiz-retry" type="button">Coba lagi</button></div></div></div>';
      document.getElementById('quiz-back').addEventListener('click', function () { navigate('/'); });
      document.getElementById('quiz-retry').addEventListener('click', function () { renderQuiz(mode); });
    });
  }

  function leaveQuiz() {
    confirmDialog('Keluar dari ujian? Jawaban tidak disimpan.', 'Keluar').then(function (ok) {
      if (ok) navigate('/');
    });
  }

  function startExam(exam) {
    EXAM = exam;
    examState = {
      idx: 0,
      answers: {},
      finished: false,
      submitting: false,
      timedOut: false,
      endAt: now().getTime() + exam.durationMin * 60000,
      interval: null,
    };
    view.innerHTML = quizShell(exam.name, 'Soal 1 dari ' + exam.questions.length, formatClock(exam.durationMin * 60));
    examState.el = {
      progress: document.getElementById('quiz-progress'),
      timer: document.getElementById('quiz-timer'),
      topic: document.getElementById('q-topic'),
      prompt: document.getElementById('q-prompt'),
      options: document.getElementById('q-options'),
      tiles: document.getElementById('rail-tiles'),
      count: document.getElementById('rail-count'),
      prev: document.getElementById('prev-q'),
      next: document.getElementById('next-q'),
      error: document.getElementById('quiz-error'),
    };
    document.getElementById('quiz-back').addEventListener('click', leaveQuiz);
    examState.el.prev.addEventListener('click', function () { goTo(examState.idx - 1); });
    examState.el.next.addEventListener('click', function () {
      if (examState.idx < EXAM.questions.length - 1) goTo(examState.idx + 1);
      else finishExam(false);
    });
    examState.interval = setInterval(tick, 1000);
    paintQuestion();
    tick();
  }

  function formatClock(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return pad(m) + ':' + pad(s);
  }

  function tick() {
    if (!examState || examState.finished) return;
    var left = examState.endAt - now().getTime();
    if (left <= 0) {
      examState.el.timer.textContent = '00:00';
      finishExam(true);
      return;
    }
    examState.el.timer.textContent = formatClock(left / 1000);
  }

  function goTo(i) {
    if (!examState || i < 0 || i >= EXAM.questions.length) return;
    examState.idx = i;
    paintQuestion();
  }

  function paintQuestion() {
    if (!examState || !EXAM) return;
    var q = EXAM.questions[examState.idx];
    var e = examState.el;
    e.progress.textContent = 'Soal ' + (examState.idx + 1) + ' dari ' + EXAM.questions.length;
    e.topic.textContent = q.topic;
    e.prompt.textContent = q.prompt;
    e.options.innerHTML = '';
    q.options.forEach(function (o) {
      var on = examState.answers[q.id] === o.letter;
      var b = el('button', 'opt' + (on ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.appendChild(el('b', '', o.letter));
      b.appendChild(el('span', '', o.text));
      b.addEventListener('click', function () {
        if (!examState || examState.finished) return;
        examState.answers[q.id] = o.letter;
        paintQuestion();
      });
      e.options.appendChild(b);
    });

    e.tiles.innerHTML = '';
    EXAM.questions.forEach(function (qq, i) {
      var answered = !!examState.answers[qq.id];
      var t = el('i', 'rail-tile' + (answered ? ' f' : '') + (i === examState.idx ? ' c' : ''), String(i + 1));
      t.setAttribute('role', 'button');
      t.setAttribute('tabindex', '0');
      t.setAttribute('aria-label', 'Soal ' + (i + 1) + (answered ? ', sudah dijawab' : ', belum dijawab'));
      t.addEventListener('click', function () { goTo(i); });
      t.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo(i); }
      });
      e.tiles.appendChild(t);
    });
    var answeredCount = EXAM.questions.filter(function (qq) { return !!examState.answers[qq.id]; }).length;
    e.count.textContent = answeredCount + ' dari ' + EXAM.questions.length + ' dijawab';

    e.prev.disabled = examState.idx === 0;
    e.next.textContent = examState.idx === EXAM.questions.length - 1 ? 'Selesai ujian' : 'Soal berikutnya';
  }

  function finishExam(timedOut) {
    if (!examState || examState.finished || examState.submitting) return;
    if (!timedOut) {
      var unanswered = EXAM.questions.filter(function (q) { return !examState.answers[q.id]; }).length;
      if (unanswered > 0) {
        confirmDialog(unanswered + ' soal belum dijawab. Selesai sekarang?', 'Selesai').then(function (ok) {
          if (ok) submitExam(timedOut);
        });
        return;
      }
    }
    submitExam(timedOut);
  }

  function submitExam(timedOut) {
    if (!examState || examState.submitting) return;
    examState.timedOut = timedOut;
    examState.submitting = true;
    if (timedOut && examState.interval) {
      clearInterval(examState.interval);
      examState.interval = null;
    }
    var e = examState.el;
    e.next.disabled = true;
    e.next.textContent = 'Mengirim...';
    e.error.hidden = true;
    api('/api/attempts' + demoQuery, {
      method: 'POST',
      body: JSON.stringify({ mode: EXAM.mode, answers: examState.answers, timedOut: timedOut }),
    }).then(function (r) {
      examState.finished = true;
      navigate('/hasil/' + r.id);
    }).catch(function () {
      examState.submitting = false;
      e.next.disabled = false;
      e.next.textContent = examState.idx === EXAM.questions.length - 1 ? 'Selesai ujian' : 'Soal berikutnya';
      e.error.innerHTML = '';
      e.error.appendChild(el('span', '', 'Jawabanmu belum terkirim. '));
      var retry = el('button', 'btn-secondary', 'Kirim ulang');
      retry.type = 'button';
      retry.addEventListener('click', function () { submitExam(examState ? examState.timedOut : false); });
      e.error.appendChild(retry);
      e.error.hidden = false;
    });
  }

  // ── Results ─────────────────────────────────────────────────────────────
  function renderResults(id) {
    view.innerHTML = '<div data-spec-screen="3"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="results-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Hasil try out</div><div class="s">Memuat hasil...</div></div></div>' +
      '<div class="card"><div class="skeleton" style="height:32px;width:60%;margin-bottom:12px"></div><div class="skeleton" style="height:16px;width:45%"></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="skeleton" style="height:16px;width:90%;margin-bottom:8px"></div><div class="skeleton" style="height:16px;width:70%"></div></div>' +
      '</div></div>';
    var back = document.getElementById('results-back');
    if (back) back.addEventListener('click', function () { navigate('/'); });
    api('/api/attempts/' + id).then(function (data) {
      if (!document.querySelector('[data-spec-screen="3"]')) return;
      paintResults(data);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="3"]')) return;
      view.innerHTML = '<div data-spec-screen="3"><div class="app">' +
        '<div class="bar"><button class="btn-secondary" id="results-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Hasil try out</div></div></div>' +
        '<div class="state-error"><div class="text-body font-medium">Hasil ini tidak bisa dimuat.</div><div class="text-small text-muted">Periksa koneksimu, lalu coba lagi.</div><button class="btn-secondary" id="results-retry" type="button">Coba lagi</button></div>' +
        '</div></div>';
      document.getElementById('results-back').addEventListener('click', function () { navigate('/'); });
      document.getElementById('results-retry').addEventListener('click', function () { renderResults(id); });
    });
  }

  function answerText(q, letter) {
    for (var i = 0; i < q.options.length; i++) {
      if (q.options[i].letter === letter) return q.options[i].letter + '. ' + q.options[i].text;
    }
    return letter;
  }

  function paintResults(data) {
    var a = data.attempt;
    var exam = data.exam;
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div data-spec-screen="3"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="results-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Hasil try out</div><div class="s" data-r="exam"></div></div></div>' +
      '<div class="score-head"><div class="score-num"><span class="score-label">Skor</span> <span data-r="score"></span> <span class="score-label">dari ' + exam.maxScore + '</span></div>' +
      '<div class="pass-line" data-r="pass"></div>' +
      '<div class="s" data-r="timed" hidden>Waktu habis</div></div>' +
      '<div class="entries" id="entries"></div>' +
      '<div class="actions"><a class="btn-primary" href="/" id="results-home">Kembali ke beranda</a><button class="btn-secondary" id="delete-result" type="button">Hapus hasil</button></div>' +
      '<div class="s" id="delete-error" role="alert" hidden style="margin-top:8px"></div>' +
      '</div></div>';

    wrap.querySelector('[data-r="exam"]').textContent = exam.name;
    wrap.querySelector('[data-r="score"]').textContent = String(a.score);
    var pass = wrap.querySelector('[data-r="pass"]');
    if (a.passed) {
      pass.textContent = 'Passing grade ' + exam.passingGrade + ': Lulus';
      pass.classList.add('ok');
    } else {
      pass.textContent = 'Passing grade ' + exam.passingGrade + ': Belum lulus, kurang ' + (exam.passingGrade - a.score);
      pass.classList.add('no');
    }
    if (a.timed_out) wrap.querySelector('[data-r="timed"]').hidden = false;

    var entries = wrap.querySelector('#entries');
    data.questions.forEach(function (q, i) {
      entries.appendChild(resultEntry(q, i, exam));
    });

    view.innerHTML = '';
    view.appendChild(wrap);

    document.getElementById('results-back').addEventListener('click', function () { navigate('/'); });
    document.getElementById('delete-result').addEventListener('click', function () {
      confirmDialog('Hapus hasil try out ini?', 'Hapus').then(function (ok) {
        if (!ok) return;
        api('/api/attempts/' + a.id, { method: 'DELETE' }).then(function () {
          navigate('/');
        }).catch(function () {
          var err = document.getElementById('delete-error');
          if (err) {
            err.textContent = 'Hasil tidak bisa dihapus. Coba lagi.';
            err.hidden = false;
          }
        });
      });
    });
  }

  function resultEntry(q, i, exam) {
    var isTkp = q.type === 'tkp';
    var given = q.given;
    var entry = el('div', 'card entry');

    var head = el('div', 'entry-head');
    var verdict = 'Kosong';
    var tone = 'blank';
    if (isTkp) {
      verdict = given ? (q.weights[given] || 0) + ' dari 5 poin' : 'Kosong';
      tone = given ? 'acc' : 'blank';
    } else if (!given) {
      verdict = 'Kosong';
      tone = 'blank';
    } else if (given === q.answer) {
      verdict = 'Benar';
      tone = 'ok';
    } else {
      verdict = 'Salah';
      tone = 'no';
    }
    var tile = el('span', 'q-tile ' + tone, String(i + 1));
    head.appendChild(tile);
    head.appendChild(el('span', 'tag', q.topic));
    var v = el('span', 'verdict ' + (tone === 'ok' ? 'ok' : tone === 'no' ? 'no' : 'blank'), verdict);
    head.appendChild(v);
    entry.appendChild(head);

    entry.appendChild(el('p', 'q', q.prompt));

    var givenLine = el('div', 'answer-line');
    givenLine.appendChild(el('span', 'k', 'Jawabanmu: '));
    givenLine.appendChild(el('span', 'v', given ? answerText(q, given) : 'kosong'));
    entry.appendChild(givenLine);

    if (!isTkp) {
      var keyLine = el('div', 'answer-line');
      keyLine.appendChild(el('span', 'k', 'Jawaban benar: '));
      keyLine.appendChild(el('span', 'v', answerText(q, q.answer)));
      entry.appendChild(keyLine);
    } else {
      var weights = el('ul', 'tkp-weights');
      q.options.forEach(function (o) {
        var li = el('li');
        li.appendChild(el('span', '', o.letter + '. ' + o.text));
        li.appendChild(el('b', '', (q.weights[o.letter] || 0) + ' poin'));
        weights.appendChild(li);
      });
      entry.appendChild(weights);
    }

    var explain = el('div', 'explain');
    explain.appendChild(el('div', 'explain-title', 'Pembahasan'));
    var ol = document.createElement('ol');
    (q.explanation || []).forEach(function (step) {
      ol.appendChild(el('li', '', step));
    });
    explain.appendChild(ol);
    entry.appendChild(explain);
    return entry;
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  renderRoute();
})();
