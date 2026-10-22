'use strict';

// SiapUjian's single-page app: the dashboard (/), the CAT-style exam screens
// (/ujian/:mode), the result summary (/hasil/:id), the answer review
// (/tinjau/:id), progress (/progres), the profile form (/profil) and the
// daily five-question practice (/latihan).

(function () {
  var view = document.getElementById('view');
  var params = new URLSearchParams(location.search);
  var TOKEN = params.get('token') ||
    (window.usernode && (window.usernode.token || window.usernode.userToken)) || null;
  var DEMO = params.get('demo') === '1';
  var demoQuery = DEMO ? '?demo=1' : '';

  // The dashboard as the spec drew it, captured before any request goes out.
  var HOME_HTML = view.innerHTML;

  var MODE_NAMES = { utbk: 'Try Out UTBK PTN', cpns: 'Try Out CAT CPNS' };
  var FALLBACK_META = {
    utbk: { mode: 'utbk', name: MODE_NAMES.utbk, questionCount: 20, durationMin: 30, passingGrade: 600, subtests: [{}, {}, {}, {}] },
    cpns: { mode: 'cpns', name: MODE_NAMES.cpns, questionCount: 3, durationMin: 45, passingGrade: 10, subtests: [] },
  };
  var EXAM_META = {};

  var CAMPUSES = [
    'Universitas Indonesia',
    'Institut Teknologi Bandung',
    'Universitas Gadjah Mada',
    'Universitas Airlangga',
    'Universitas Diponegoro',
    'Universitas Brawijaya',
    'Universitas Padjadjaran',
    'Universitas Negeri Jakarta',
  ];
  var MAJORS = [
    'Kedokteran',
    'Teknik Informatika',
    'Teknik Sipil',
    'Hukum',
    'Manajemen',
    'Akuntansi',
    'Psikologi',
    'Farmasi',
    'Ilmu Komputer',
    'Arsitektur',
    'Hubungan Internasional',
    'Kedokteran Gigi',
  ];

  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  var EXAM = null;
  var examState = null;
  var activeDialog = null;
  var progressMode = 'utbk';

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
    if (TOKEN) headers['x-usernode-token'] = TOKEN;
    // A staging preview can be shown as of a chosen moment (?un-now=): send
    // the page's "now" so day-based screens (streak, daily practice) agree
    // with what the app shows. Production has no previewNow.
    try {
      if (window.usernode && window.usernode.previewNow) {
        headers['x-usernode-now'] = now().toISOString();
      }
    } catch (e) {}
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

  function clockText(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    return pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60);
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
        if (!overlay.parentNode) return;
        activeDialog = null;
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(answer);
      }
      activeDialog = { close: close };
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
    if (!a || a.target || a.metaKey || a.ctrlKey || e.shiftKey || e.altKey) return;
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
    m = p.match(/^\/tinjau\/(\d+)$/);
    if (m) return renderReview(m[1]);
    if (p === '/progres') return renderProgress();
    if (p === '/profil') return renderProfile();
    if (p === '/latihan') return renderPractice();
    history.replaceState({}, '', '/' + location.search);
    return renderHome();
  }

  function bindBack(path) {
    var back = document.getElementById('page-back');
    if (back) back.addEventListener('click', function () { navigate(path); });
  }

  // ── Dashboard ───────────────────────────────────────────────────────────
  function renderHome() {
    view.innerHTML = HOME_HTML;
    var today = document.getElementById('today');
    if (today) today.textContent = todayLabel();

    paintModeCards();

    var note = document.querySelector('[data-usernode-demo-note]');
    if (note) note.hidden = !DEMO;

    loadExamMeta();
    loadProfile();
    loadStreak();
    loadResults();
  }

  function paintModeCards() {
    var cards = document.querySelectorAll('#view [data-mode]');
    Array.prototype.forEach.call(cards, function (card) {
      var mode = card.getAttribute('data-mode');
      var info = EXAM_META[mode] || FALLBACK_META[mode];
      if (!info) return;
      function fill(key, text) {
        var node = card.querySelector('[data-meta="' + key + '"]');
        if (node) node.textContent = text;
      }
      fill('count', info.questionCount + ' soal');
      fill('duration', info.durationMin + ' menit');
      fill('passing', 'Passing grade ' + info.passingGrade);
      var subtes = card.querySelector('[data-meta="subtes"]');
      if (subtes) {
        var count = (info.subtests || []).length;
        subtes.hidden = !count;
        if (count) subtes.textContent = count + ' subtes';
      }
      var rail = card.querySelector('[data-meta="rail"]');
      if (!rail) return;
      rail.innerHTML = '';
      for (var i = 1; i <= info.questionCount; i++) {
        rail.appendChild(el('i', '', String(i)));
      }
    });
  }

  function loadExamMeta() {
    api('/api/exams').then(function (data) {
      EXAM_META = {};
      ((data && data.exams) || []).forEach(function (exam) { EXAM_META[exam.mode] = exam; });
      if (document.querySelector('#view [data-mode]')) paintModeCards();
    }).catch(function () {});
  }

  function loadProfile() {
    var nameEl = document.getElementById('profile-name');
    var initialEl = document.getElementById('profile-initial');
    var roleEl = document.getElementById('profile-role');
    var roleLabel = document.getElementById('profile-role-label');
    var targetEl = document.getElementById('profile-target');
    var targetName = document.getElementById('profile-target-name');
    var gapEl = document.getElementById('profile-gap');
    if (!nameEl) return;

    nameEl.innerHTML = '<span class="skeleton" style="display:block;height:16px;width:140px;margin:3px 0"></span>';
    targetEl.hidden = true;

    function paintRole(exam) {
      var isCpns = exam === 'cpns';
      if (roleEl) roleEl.classList.toggle('cpns', isCpns);
      if (roleLabel) roleLabel.textContent = isCpns ? 'Pejuang CPNS' : 'Pejuang PTN';
      Array.prototype.forEach.call(document.querySelectorAll('#view [data-mode]'), function (card) {
        card.classList.toggle('is-target', card.getAttribute('data-mode') === exam);
      });
    }

    function paintTarget(me) {
      var exam = me.target_exam === 'cpns' ? 'cpns' : 'utbk';
      paintRole(exam);
      if (exam !== 'utbk') {
        targetEl.hidden = true;
        return;
      }
      var campus = me.target_campus || '';
      var major = me.target_major || '';
      if (!campus && !major) {
        targetEl.hidden = false;
        targetName.textContent = 'Atur target di Profil';
        gapEl.hidden = true;
        return;
      }
      targetEl.hidden = false;
      targetName.textContent = campus && major ? campus + ', ' + major : campus || major;
      if (me.latest_utbk && typeof me.latest_utbk.score === 'number') {
        var targetScore = typeof me.target_score === 'number' ? me.target_score : 600;
        var gap = targetScore - me.latest_utbk.score;
        gapEl.hidden = false;
        gapEl.classList.remove('wait');
        gapEl.textContent = gap > 0 ? 'Kurang ' + gap + ' poin' : 'Target tercapai';
      } else {
        gapEl.hidden = false;
        gapEl.classList.add('wait');
        gapEl.textContent = 'Belum ada skor UTBK';
      }
    }

    api('/api/me' + demoQuery).then(function (me) {
      nameEl.textContent = me.name || 'Tamu';
      initialEl.textContent = (me.name || 'T').trim().charAt(0).toUpperCase();
      paintTarget(me);
    }).catch(function () {
      nameEl.textContent = 'Tamu';
      initialEl.textContent = 'T';
      paintRole('utbk');
      targetEl.hidden = true;
    });
  }

  function loadStreak() {
    var titleEl = document.getElementById('streak-title');
    var subEl = document.getElementById('streak-sub');
    var actionEl = document.getElementById('streak-action');
    if (!titleEl) return;

    function paint(data) {
      var current = data && typeof data.current === 'number' ? data.current : 0;
      var done = !!(data && data.todayDone);
      titleEl.textContent = current > 0 ? 'Beruntun ' + current + ' hari' : 'Mulai beruntun hari ini';
      subEl.textContent = done ? 'Latihan hari ini selesai.' : '5 soal singkat, sekitar 5 menit';
      actionEl.textContent = done ? 'Lihat hasil latihan' : 'Latihan 5 soal';
    }

    api('/api/streak' + demoQuery).then(paint).catch(function () {
      paint({ current: 0, todayDone: false });
    });
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
        row.querySelector('[data-row="mode"]').textContent = MODE_NAMES[a.mode] || a.mode;
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

  // ── Exam ────────────────────────────────────────────────────────────────
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
  var FLAG_SVG = '<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>';
  var GRID_SVG = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

  function quizShell(exam) {
    return '<div data-spec-screen="2"><div class="app">' +
      '<div class="bar">' +
        '<button class="btn-secondary" id="quiz-back" type="button" aria-label="Keluar dari ujian">' + BACK_SVG + '</button>' +
        '<div class="quiz-head"><div class="ttl">' + (MODE_NAMES[exam.mode] || 'Try out') + '</div><div class="s" id="quiz-sub"></div></div>' +
        '<div class="timer" id="quiz-timer-wrap">' + CLOCK_SVG + '<span id="quiz-timer"></span></div>' +
      '</div>' +
      '<button class="nav-chip" id="quiz-nav-open" type="button">' + GRID_SVG + '<span id="quiz-nav-count"></span></button>' +
      '<div class="grid">' +
        '<div class="card qcard" id="question-card">' +
          '<div class="passage" id="q-passage" hidden></div>' +
          '<span class="tag" id="q-topic"></span>' +
          '<p class="q" id="q-prompt"></p>' +
          '<div id="q-options"></div>' +
          '<button class="flag-btn" id="q-flag" type="button" aria-pressed="false">' + FLAG_SVG + '<span id="q-flag-label">Tandai soal</span></button>' +
        '</div>' +
        '<div class="rail rail-wide" id="quiz-rail">' +
          '<span class="s">Soal</span>' +
          '<div class="rail-grid" id="rail-grid"></div>' +
          '<div class="rail-legend"><span><i class="lg f"></i>Terjawab</span><span><i class="lg m"></i>Ditandai</span><span><i class="lg"></i>Belum</span></div>' +
          '<span class="s" id="rail-count"></span>' +
        '</div>' +
      '</div>' +
      '<div class="foot"><button class="btn-secondary" id="prev-q" type="button">Sebelumnya</button>' +
      '<button class="btn-primary" id="next-q" type="button">Soal berikutnya</button></div>' +
      '<div class="s quiz-hint">Ujian selesai otomatis saat waktu habis.</div>' +
      '<div class="s quiz-error" id="quiz-error" role="alert" hidden></div>' +
      '<div class="sheet-scrim" id="quiz-scrim" hidden></div>' +
      '<div class="sheet" id="quiz-sheet" hidden>' +
        '<div class="sheet-head"><div class="ttl">Soal</div>' +
        '<button class="btn-secondary" id="quiz-nav-close" type="button">Tutup</button></div>' +
        '<div class="rail-grid" id="sheet-grid"></div>' +
        '<div class="rail-legend"><span><i class="lg f"></i>Terjawab</span><span><i class="lg m"></i>Ditandai</span><span><i class="lg"></i>Belum dijawab</span></div>' +
        '<div class="s" id="sheet-count"></div>' +
      '</div>' +
      '</div></div>';
  }

  function renderQuiz(mode) {
    view.innerHTML = '<div data-spec-screen="2"><div class="app"><div class="bar"><button class="btn-secondary" id="quiz-back" type="button" aria-label="Keluar dari ujian">' + BACK_SVG + '</button><div><div class="ttl">' + (MODE_NAMES[mode] || 'Try out') + '</div><div class="s">Memuat soal...</div></div></div>' +
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
      flags: {},
      finished: false,
      submitting: false,
      timedOut: false,
      endAt: now().getTime() + exam.durationMin * 60000,
      interval: null,
    };
    view.innerHTML = quizShell(exam);
    examState.el = {
      sub: document.getElementById('quiz-sub'),
      timer: document.getElementById('quiz-timer'),
      timerWrap: document.getElementById('quiz-timer-wrap'),
      topic: document.getElementById('q-topic'),
      passage: document.getElementById('q-passage'),
      prompt: document.getElementById('q-prompt'),
      options: document.getElementById('q-options'),
      flag: document.getElementById('q-flag'),
      flagLabel: document.getElementById('q-flag-label'),
      railGrid: document.getElementById('rail-grid'),
      sheetGrid: document.getElementById('sheet-grid'),
      railCount: document.getElementById('rail-count'),
      sheetCount: document.getElementById('sheet-count'),
      navCount: document.getElementById('quiz-nav-count'),
      sheet: document.getElementById('quiz-sheet'),
      scrim: document.getElementById('quiz-scrim'),
      prev: document.getElementById('prev-q'),
      next: document.getElementById('next-q'),
      error: document.getElementById('quiz-error'),
    };
    document.getElementById('quiz-back').addEventListener('click', leaveQuiz);
    document.getElementById('quiz-nav-open').addEventListener('click', openSheet);
    document.getElementById('quiz-nav-close').addEventListener('click', closeSheet);
    examState.el.scrim.addEventListener('click', closeSheet);
    examState.el.prev.addEventListener('click', function () { goTo(examState.idx - 1); });
    examState.el.next.addEventListener('click', function () {
      if (examState.idx < EXAM.questions.length - 1) goTo(examState.idx + 1);
      else finishExam(false);
    });
    examState.el.flag.addEventListener('click', function () {
      if (!examState || examState.finished) return;
      var id = EXAM.questions[examState.idx].id;
      if (examState.flags[id]) delete examState.flags[id];
      else examState.flags[id] = true;
      paintQuestion();
    });
    examState.interval = setInterval(tick, 1000);
    paintQuestion();
    tick();
  }

  function openSheet() {
    if (!examState) return;
    examState.el.sheet.hidden = false;
    examState.el.scrim.hidden = false;
    paintTiles();
  }

  function closeSheet() {
    if (!examState) return;
    examState.el.sheet.hidden = true;
    examState.el.scrim.hidden = true;
  }

  function tick() {
    if (!examState || examState.finished) return;
    var left = examState.endAt - now().getTime();
    if (left <= 0) {
      examState.el.timer.textContent = '00:00';
      finishExam(true);
      return;
    }
    examState.el.timer.textContent = clockText(left / 1000);
    examState.el.timerWrap.classList.toggle('low', left < 300000);
  }

  function goTo(i) {
    if (!examState || i < 0 || i >= EXAM.questions.length) return;
    examState.idx = i;
    paintQuestion();
  }

  function answeredCount() {
    if (!examState || !EXAM) return 0;
    return EXAM.questions.filter(function (q) { return !!examState.answers[q.id]; }).length;
  }

  function paintTiles() {
    if (!examState || !EXAM) return;
    var label = answeredCount() + ' dari ' + EXAM.questions.length + ' dijawab';
    examState.el.railCount.textContent = label;
    examState.el.sheetCount.textContent = label;
    examState.el.navCount.textContent = label;
    [examState.el.railGrid, examState.el.sheetGrid].forEach(function (grid) {
      if (!grid) return;
      grid.innerHTML = '';
      EXAM.questions.forEach(function (qq, i) {
        var cls = 'rail-tile';
        if (examState.answers[qq.id]) cls += ' f';
        if (examState.flags[qq.id]) cls += ' m';
        if (i === examState.idx) cls += ' c';
        var t = el('i', cls, String(i + 1));
        t.setAttribute('role', 'button');
        t.setAttribute('tabindex', '0');
        t.setAttribute('aria-label', 'Soal ' + (i + 1) +
          (examState.answers[qq.id] ? ', sudah dijawab' : ', belum dijawab') +
          (examState.flags[qq.id] ? ', ditandai' : ''));
        t.addEventListener('click', function () { goTo(i); closeSheet(); });
        t.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo(i); closeSheet(); }
        });
        grid.appendChild(t);
      });
    });
  }

  function paintQuestion() {
    if (!examState || !EXAM) return;
    var q = EXAM.questions[examState.idx];
    var e = examState.el;
    var subName = q.subtestName || q.topic;
    e.sub.textContent = subName + ', soal ' + (examState.idx + 1) + ' dari ' + EXAM.questions.length;
    if (q.passage) {
      e.passage.hidden = false;
      e.passage.innerHTML = '';
      if (q.passage.title) e.passage.appendChild(el('div', 'passage-title', q.passage.title));
      e.passage.appendChild(el('p', 'passage-text', q.passage.text));
    } else {
      e.passage.hidden = true;
      e.passage.innerHTML = '';
    }
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

    var flagged = !!examState.flags[q.id];
    e.flag.classList.toggle('on', flagged);
    e.flag.setAttribute('aria-pressed', flagged ? 'true' : 'false');
    e.flagLabel.textContent = flagged ? 'Ditandai' : 'Tandai soal';

    paintTiles();
    e.prev.disabled = examState.idx === 0;
    e.next.textContent = examState.idx === EXAM.questions.length - 1 ? 'Selesai ujian' : 'Soal berikutnya';
  }

  function finishExam(timedOut) {
    if (!examState || examState.finished || examState.submitting) return;
    if (timedOut && activeDialog) activeDialog.close(false);
    closeSheet();
    if (!timedOut) {
      var unanswered = EXAM.questions.filter(function (q) { return !examState.answers[q.id]; }).length;
      var flagged = EXAM.questions.filter(function (q) { return !!examState.flags[q.id]; }).length;
      if (unanswered > 0 || flagged > 0) {
        var parts = [];
        if (unanswered > 0) parts.push(unanswered + ' soal belum dijawab');
        if (flagged > 0) parts.push(flagged + ' soal ditandai');
        confirmDialog(parts.join(' dan ') + '. Selesai sekarang?', 'Selesai').then(function (ok) {
          if (ok) submitExam(false);
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
    if (examState.interval) {
      clearInterval(examState.interval);
      examState.interval = null;
    }
    var e = examState.el;
    var total = EXAM.durationMin * 60;
    var used = timedOut ? total : Math.max(0, Math.min(total, Math.round(total - (examState.endAt - now().getTime()) / 1000)));
    var flaggedIds = Object.keys(examState.flags).filter(function (id) { return examState.flags[id]; });
    e.next.disabled = true;
    e.next.textContent = 'Mengirim...';
    e.error.hidden = true;
    api('/api/attempts' + demoQuery, {
      method: 'POST',
      body: JSON.stringify({
        mode: EXAM.mode,
        answers: examState.answers,
        flagged: flaggedIds,
        timedOut: timedOut,
        timeUsedSec: used,
      }),
    }).then(function (r) {
      examState.finished = true;
      navigate('/hasil/' + r.id);
    }).catch(function (err) {
      examState.submitting = false;
      e.next.disabled = false;
      e.next.textContent = examState.idx === EXAM.questions.length - 1 ? 'Selesai ujian' : 'Soal berikutnya';
      e.error.innerHTML = '';
      if (err && err.message === 'account_required') {
        e.error.appendChild(el('span', '', 'Kamu perlu akun untuk menyimpan hasil. '));
      } else {
        e.error.appendChild(el('span', '', 'Jawabanmu belum terkirim. '));
        var retry = el('button', 'btn-secondary', 'Kirim ulang');
        retry.type = 'button';
        retry.addEventListener('click', function () {
          if (examState) submitExam(examState.timedOut);
        });
        e.error.appendChild(retry);
      }
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

  function paintResults(data) {
    var a = data.attempt;
    var exam = data.exam;
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div data-spec-screen="3"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="results-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Hasil try out</div><div class="s" data-r="exam"></div></div></div>' +
      '<div class="score-head"><div class="score-num"><span class="score-label">Skor</span> <span data-r="score"></span> <span class="score-label">dari ' + exam.maxScore + '</span></div>' +
      '<div class="pass-line" data-r="pass"></div>' +
      (a.timed_out ? '<div class="s" data-r="timed">Waktu habis</div>' : '') +
      '</div>' +
      '<div class="counts" data-r="counts" hidden>' +
        '<div class="count"><b data-r="correct">0</b><span>Benar</span></div>' +
        '<div class="count"><b data-r="wrong">0</b><span>Salah</span></div>' +
        '<div class="count"><b data-r="blank">0</b><span>Kosong</span></div>' +
      '</div>' +
      '<div class="s time-line" data-r="time" hidden></div>' +
      '<div class="card" data-r="breakdown-card" hidden><div class="s bar-title">Skor per subtes</div><div data-r="breakdown"></div></div>' +
      '<div class="state-empty legacy-note" data-r="legacy" hidden>Rincian subtes tidak tersedia untuk try out lama.</div>' +
      '<div class="actions"><a class="btn-primary" href="/tinjau/' + a.id + '" data-r="review">Tinjau jawaban</a>' +
      '<a class="btn-secondary" href="/" id="results-home">Kembali ke beranda</a>' +
      '<button class="btn-secondary" id="delete-result" type="button">Hapus hasil</button></div>' +
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

    var hasCounts = (a.correct || 0) + (a.wrong || 0) + (a.blank || 0) > 0;
    if (hasCounts) {
      var counts = wrap.querySelector('[data-r="counts"]');
      counts.hidden = false;
      counts.querySelector('[data-r="correct"]').textContent = String(a.correct || 0);
      counts.querySelector('[data-r="wrong"]').textContent = String(a.wrong || 0);
      counts.querySelector('[data-r="blank"]').textContent = String(a.blank || 0);
    }

    if (a.time_used_sec > 0) {
      var timeEl = wrap.querySelector('[data-r="time"]');
      timeEl.hidden = false;
      timeEl.textContent = 'Waktu terpakai ' + clockText(a.time_used_sec) + ' dari ' + clockText(exam.durationMin * 60);
    }

    if (data.breakdown) {
      var card = wrap.querySelector('[data-r="breakdown-card"]');
      card.hidden = false;
      var box = wrap.querySelector('[data-r="breakdown"]');
      var order = (exam.subtests || []).map(function (s) { return s.key; });
      var items = Object.keys(data.breakdown).map(function (k) { return data.breakdown[k]; });
      items.sort(function (x, y) {
        var xi = order.indexOf(x.key);
        var yi = order.indexOf(y.key);
        return (xi === -1 ? 99 : xi) - (yi === -1 ? 99 : yi);
      });
      items.forEach(function (item) {
        var row = el('div', 'bar-row');
        row.appendChild(el('span', 'bar-label', item.name));
        var track = el('span', 'track');
        var fill = el('span', 'fill');
        fill.style.width = Math.max(0, Math.min(100, Math.round((item.score / (item.max || 1)) * 100))) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el('span', 'num', String(item.score)));
        box.appendChild(row);
      });
    } else {
      wrap.querySelector('[data-r="legacy"]').hidden = false;
    }

    if (!data.questions || !data.questions.length) {
      wrap.querySelector('[data-r="review"]').hidden = true;
    }

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

  // ── Review ──────────────────────────────────────────────────────────────
  function answerText(q, letter) {
    if (!letter) return 'kosong';
    for (var i = 0; i < q.options.length; i++) {
      if (q.options[i].letter === letter) return q.options[i].letter + '. ' + q.options[i].text;
    }
    return letter;
  }

  function verdictOf(q) {
    if (q.type === 'tkp') {
      return q.given
        ? { label: (q.weights[q.given] || 0) + ' dari 5 poin', tone: 'acc' }
        : { label: 'Kosong', tone: 'blank' };
    }
    if (!q.given) return { label: 'Kosong', tone: 'blank' };
    if (q.given === q.answer) return { label: 'Benar', tone: 'ok' };
    return { label: 'Salah', tone: 'no' };
  }

  function reviewEntry(q, index) {
    var isTkp = q.type === 'tkp';
    var v = verdictOf(q);
    var entry = el('div', 'card entry');

    var head = el('div', 'entry-head');
    head.appendChild(el('span', 'q-tile ' + (v.tone === 'acc' ? 'acc' : v.tone), String(index + 1)));
    head.appendChild(el('span', 'tag', q.topic));
    if (q.flagged) head.appendChild(el('span', 'flag-tag', 'Ditandai'));
    head.appendChild(el('span', 'verdict ' + (v.tone === 'ok' ? 'ok' : v.tone === 'no' ? 'no' : 'blank'), v.label));
    entry.appendChild(head);

    if (q.passage) {
      var passage = el('div', 'passage');
      if (q.passage.title) passage.appendChild(el('div', 'passage-title', q.passage.title));
      passage.appendChild(el('p', 'passage-text', q.passage.text));
      entry.appendChild(passage);
    }
    entry.appendChild(el('p', 'q', q.prompt));

    var opts = el('div', 'review-opts');
    q.options.forEach(function (o) {
      var tone = '';
      if (!isTkp && q.answer === o.letter) tone = ' ok';
      else if (!isTkp && q.given === o.letter) tone = ' no';
      else if (isTkp && q.given === o.letter) tone = ' acc';
      var row = el('div', 'ropt' + tone);
      row.appendChild(el('b', '', o.letter));
      row.appendChild(el('span', '', o.text));
      if (isTkp) row.appendChild(el('i', 'rw', (q.weights[o.letter] || 0) + ' poin'));
      opts.appendChild(row);
    });
    entry.appendChild(opts);

    var givenLine = el('div', 'answer-line');
    givenLine.appendChild(el('span', 'k', 'Jawabanmu: '));
    givenLine.appendChild(el('span', 'v', answerText(q, q.given)));
    entry.appendChild(givenLine);

    if (!isTkp) {
      var keyLine = el('div', 'answer-line');
      keyLine.appendChild(el('span', 'k', 'Jawaban benar: '));
      keyLine.appendChild(el('span', 'v', answerText(q, q.answer)));
      entry.appendChild(keyLine);
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

  function renderReview(id) {
    view.innerHTML = '<div data-spec-screen="4"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="review-back" type="button" aria-label="Kembali ke hasil">' + BACK_SVG + '</button><div><div class="ttl">Tinjau jawaban</div><div class="s">Memuat tinjauan...</div></div></div>' +
      '<div class="card"><div class="skeleton" style="height:16px;width:90%;margin-bottom:8px"></div><div class="skeleton" style="height:16px;width:70%"></div></div>' +
      '</div></div>';
    var back = document.getElementById('review-back');
    if (back) back.addEventListener('click', function () { navigate('/hasil/' + id); });
    api('/api/attempts/' + id).then(function (data) {
      if (!document.querySelector('[data-spec-screen="4"]')) return;
      paintReview(id, data);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="4"]')) return;
      view.innerHTML = '<div data-spec-screen="4"><div class="app">' +
        '<div class="bar"><button class="btn-secondary" id="review-back" type="button" aria-label="Kembali ke hasil">' + BACK_SVG + '</button><div><div class="ttl">Tinjau jawaban</div></div></div>' +
        '<div class="state-error"><div class="text-body font-medium">Tinjauan tidak bisa dimuat.</div><div class="text-small text-muted">Periksa koneksimu, lalu coba lagi.</div><button class="btn-secondary" id="review-retry" type="button">Coba lagi</button></div>' +
        '</div></div>';
      document.getElementById('review-back').addEventListener('click', function () { navigate('/hasil/' + id); });
      document.getElementById('review-retry').addEventListener('click', function () { renderReview(id); });
    });
  }

  function paintReview(id, data) {
    var exam = data.exam;
    var questions = data.questions || [];
    var filter = 'semua';

    view.innerHTML = '<div data-spec-screen="4"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="review-back" type="button" aria-label="Kembali ke hasil">' + BACK_SVG + '</button><div><div class="ttl">Tinjau jawaban</div><div class="s" data-r="exam"></div></div></div>' +
      '<div class="filters" id="review-filters"></div>' +
      '<div id="review-body"></div>' +
      '<div class="actions"><a class="btn-secondary" href="/hasil/' + id + '">Kembali ke hasil</a></div>' +
      '</div></div>';
    view.querySelector('[data-r="exam"]').textContent = exam.name + ', skor ' + data.attempt.score + ' dari ' + exam.maxScore;
    document.getElementById('review-back').addEventListener('click', function () { navigate('/hasil/' + id); });

    var indexById = {};
    questions.forEach(function (q, i) { indexById[q.id] = i; });

    var filters = [
      { key: 'semua', label: 'Semua' },
      { key: 'benar', label: 'Benar' },
      { key: 'salah', label: 'Salah' },
      { key: 'kosong', label: 'Kosong' },
      { key: 'ditandai', label: 'Ditandai' },
    ];

    function matches(q) {
      if (filter === 'ditandai') return !!q.flagged;
      var v = verdictOf(q);
      if (filter === 'benar') return v.tone === 'ok' || v.tone === 'acc';
      if (filter === 'salah') return v.tone === 'no';
      if (filter === 'kosong') return v.tone === 'blank';
      return true;
    }

    function paintFilters() {
      var box = document.getElementById('review-filters');
      box.innerHTML = '';
      filters.forEach(function (f) {
        var b = el('button', 'filter-chip' + (filter === f.key ? ' on' : ''), f.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', filter === f.key ? 'true' : 'false');
        b.addEventListener('click', function () {
          filter = f.key;
          paintFilters();
          paintBody();
        });
        box.appendChild(b);
      });
    }

    function paintBody() {
      var body = document.getElementById('review-body');
      body.innerHTML = '';
      var visible = questions.filter(matches);
      if (!visible.length) {
        body.appendChild(el('div', 'state-empty', 'Tidak ada soal pada filter ini.'));
        return;
      }
      var groups = [];
      var byKey = {};
      questions.forEach(function (q) {
        var key = q.subtest || q.topic;
        if (!byKey[key]) {
          byKey[key] = { key: key, name: q.subtestName || q.topic, items: [] };
          groups.push(byKey[key]);
        }
        if (matches(q)) byKey[key].items.push(q);
      });
      groups.forEach(function (g) {
        if (!g.items.length) return;
        body.appendChild(el('h3', 'group-title', g.name));
        g.items.forEach(function (q) {
          body.appendChild(reviewEntry(q, indexById[q.id]));
        });
      });
    }

    paintFilters();
    paintBody();
  }

  // ── Progress ────────────────────────────────────────────────────────────
  function renderProgress() {
    view.innerHTML = '<div data-spec-screen="5"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="progress-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Perkembangan</div><div class="s">Memuat perkembangan...</div></div></div>' +
      '<div class="stats"><div class="stat"><div class="skeleton" style="height:24px;width:50%"></div></div><div class="stat"><div class="skeleton" style="height:24px;width:50%"></div></div><div class="stat"><div class="skeleton" style="height:24px;width:50%"></div></div></div>' +
      '<div class="card"><div class="skeleton" style="height:120px"></div></div>' +
      '</div></div>';
    document.getElementById('progress-back').addEventListener('click', function () { navigate('/'); });
    loadProgress();
  }

  function loadProgress() {
    api('/api/progress?mode=' + progressMode + (DEMO ? '&demo=1' : '')).then(function (data) {
      if (!document.querySelector('[data-spec-screen="5"]')) return;
      paintProgress(data);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="5"]')) return;
      view.innerHTML = '<div data-spec-screen="5"><div class="app">' +
        '<div class="bar"><button class="btn-secondary" id="progress-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Perkembangan</div></div></div>' +
        '<div class="state-error"><div class="text-body font-medium">Perkembangan tidak bisa dimuat.</div><div class="text-small text-muted">Periksa koneksimu, lalu coba lagi.</div><button class="btn-secondary" id="progress-retry" type="button">Coba lagi</button></div>' +
        '</div></div>';
      document.getElementById('progress-back').addEventListener('click', function () { navigate('/'); });
      document.getElementById('progress-retry').addEventListener('click', function () { renderProgress(); });
    });
  }

  function chartHtml(data) {
    var max = data.mode === 'utbk' ? 1000 : 15;
    var left = 40;
    var right = 590;
    var top = 20;
    var bottom = 150;
    function y(score) {
      return Math.max(top, Math.min(bottom, bottom - (score / max) * (bottom - top)));
    }
    var pts = data.trend || [];
    var n = pts.length;
    var xs = [];
    for (var i = 0; i < n; i++) {
      xs.push(n === 1 ? (left + right) / 2 : left + (i * (right - left)) / (n - 1));
    }
    var grid = '';
    var ticks = max === 15 ? [0, 5, 10, 15] : [0, 1, 2, 3, 4].map(function (g) { return (max / 4) * g; });
    for (var g = 0; g < ticks.length; g++) {
      var value = ticks[g];
      var gy = y(value);
      grid += '<line class="grid-l" x1="' + left + '" y1="' + gy.toFixed(0) + '" x2="' + right + '" y2="' + gy.toFixed(0) + '"/>';
      grid += '<text x="2" y="' + (gy + 4).toFixed(0) + '">' + Math.round(value) + '</text>';
    }
    var line = '';
    if (n > 1) {
      line = '<polyline class="trend" points="' +
        pts.map(function (p, idx) { return xs[idx].toFixed(0) + ',' + y(p.score).toFixed(0); }).join(' ') + '"/>';
    }
    var dots = pts.map(function (p, idx) {
      return '<circle class="pt" cx="' + xs[idx].toFixed(0) + '" cy="' + y(p.score).toFixed(0) + '" r="4"/>';
    }).join('');
    var target = '';
    if (data.mode === 'utbk' && typeof data.targetScore === 'number') {
      var ty = y(data.targetScore);
      target = '<line class="target" x1="' + left + '" y1="' + ty.toFixed(0) + '" x2="' + right + '" y2="' + ty.toFixed(0) + '"/>' +
        '<text class="tgt" x="' + (right - 68) + '" y="' + (ty - 6).toFixed(0) + '">Target ' + data.targetScore + '</text>';
    }
    var dates = '';
    if (n) {
      var marks = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
      marks.forEach(function (idx) {
        var d = new Date(pts[idx].created_at);
        var label = d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
        var anchor = idx === 0 ? left : idx === n - 1 ? right - 30 : xs[idx] - 16;
        dates += '<text x="' + anchor + '" y="170">' + label + '</text>';
      });
    }
    var summary = pts.map(function (p) {
      var d = new Date(p.created_at);
      return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ': ' + p.score;
    }).join(', ');
    return '<svg class="chart" viewBox="0 0 600 180" role="img"><title>Skor ' +
      (data.mode === 'utbk' ? 'UTBK PTN' : 'CAT CPNS') + '. ' + summary + '</title>' +
      grid + target + line + dots + dates + '</svg>';
  }

  function paintProgress(data) {
    var examName = data.mode === 'utbk' ? 'UTBK PTN' : 'CAT CPNS';
    view.innerHTML = '<div data-spec-screen="5"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="progress-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Perkembangan</div><div class="s" data-r="count"></div></div></div>' +
      '<div class="seg" id="progress-seg"><button type="button" data-mode="utbk">UTBK PTN</button><button type="button" data-mode="cpns">CAT CPNS</button></div>' +
      '<div id="progress-body"></div>' +
      '</div></div>';
    document.getElementById('progress-back').addEventListener('click', function () { navigate('/'); });
    view.querySelector('[data-r="count"]').textContent = data.count + ' try out ' + examName;
    Array.prototype.forEach.call(document.querySelectorAll('#progress-seg button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === progressMode);
      b.addEventListener('click', function () {
        if (progressMode === b.getAttribute('data-mode')) return;
        progressMode = b.getAttribute('data-mode');
        renderProgress();
      });
    });

    var body = document.getElementById('progress-body');
    if (!data.count) {
      var empty = el('div', 'state-empty');
      empty.appendChild(el('div', 'text-body font-medium', 'Belum ada try out.'));
      empty.appendChild(el('div', 'text-small text-muted', 'Selesaikan satu untuk melihat perkembanganmu.'));
      body.appendChild(empty);
      return;
    }

    var stats = el('div', 'stats');
    function stat(value, label) {
      var s = el('div', 'stat');
      s.appendChild(el('b', '', String(value)));
      s.appendChild(el('span', '', label));
      return s;
    }
    stats.appendChild(stat(data.count, 'Try out'));
    stats.appendChild(stat(data.best, 'Skor terbaik'));
    stats.appendChild(stat(data.average, 'Rata-rata'));
    body.appendChild(stats);

    if (data.weakest) {
      var weak = el('div', 'weak');
      weak.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>';
      var copy = el('div', 's');
      copy.appendChild(el('b', '', 'Subtes terlemah: ' + data.weakest.name + '. '));
      copy.appendChild(document.createTextNode('Rata-rata ' + data.weakest.average + ' dari ' + data.weakest.max + '.'));
      weak.appendChild(copy);
      body.appendChild(weak);
    }

    var chartCard = el('div', 'card chart-card');
    chartCard.appendChild(el('div', 's bar-title', data.mode === 'utbk' ? 'Skor UTBK PTN per try out' : 'Skor CAT CPNS per try out'));
    var chart = el('div');
    chart.innerHTML = chartHtml(data);
    chartCard.appendChild(chart);
    body.appendChild(chartCard);

    body.appendChild(el('h3', 'group-title', 'Riwayat try out'));
    var list = el('ul', 'list');
    data.attempts.forEach(function (a) {
      var row = el('li', 'list-row result-row');
      row.setAttribute('role', 'link');
      row.setAttribute('tabindex', '0');
      row.setAttribute('style', 'cursor:pointer');
      var icon = el('span', 'result-icon' + (a.mode === 'cpns' ? ' cpns' : ''));
      icon.innerHTML = a.mode === 'cpns'
        ? '<svg class="ri-cpns" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>'
        : '<svg class="ri-utbk" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>';
      row.appendChild(icon);
      var main = el('div', 'result-main');
      main.appendChild(el('div', 'result-mode', MODE_NAMES[a.mode] || a.mode));
      main.appendChild(el('div', 's', whenLabel(new Date(a.created_at))));
      row.appendChild(main);
      var scoreBox = el('div', 'result-score');
      scoreBox.appendChild(el('span', 'result-points', scoreLabel(a.mode, a.score, a.max_score)));
      var badge = el('span', 'status-badge' + (a.passed ? '' : ' no'), a.passed ? 'Lulus' : 'Belum lulus');
      scoreBox.appendChild(badge);
      row.appendChild(scoreBox);
      function open() { navigate('/hasil/' + a.id); }
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  // ── Profile ─────────────────────────────────────────────────────────────
  function renderProfile() {
    view.innerHTML = '<div data-spec-screen="6"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="page-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Profil</div><div class="s">Memuat profil...</div></div></div>' +
      '<div class="card"><div class="skeleton" style="height:16px;width:40%;margin-bottom:10px"></div><div class="skeleton" style="height:44px"></div></div>' +
      '</div></div>';
    bindBack('/');
    api('/api/me' + demoQuery).then(function (me) {
      if (!document.querySelector('[data-spec-screen="6"]')) return;
      paintProfile(me);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="6"]')) return;
      view.innerHTML = '<div data-spec-screen="6"><div class="app">' +
        '<div class="bar"><button class="btn-secondary" id="page-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Profil</div></div></div>' +
        '<div class="state-error"><div class="text-body font-medium">Profil tidak bisa dimuat.</div><div class="text-small text-muted">Periksa koneksimu, lalu coba lagi.</div><button class="btn-secondary" id="profile-retry" type="button">Coba lagi</button></div>' +
        '</div></div>';
      bindBack('/');
      document.getElementById('profile-retry').addEventListener('click', renderProfile);
    });
  }

  function optionList(list, value, placeholder) {
    function esc(text) {
      return String(text).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    var html = '<option value="">' + esc(placeholder) + '</option>';
    list.forEach(function (item) {
      html += '<option value="' + esc(item) + '">' + esc(item) + '</option>';
    });
    if (value && list.indexOf(value) === -1) {
      html += '<option value="' + esc(value) + '">' + esc(value) + '</option>';
    }
    return html;
  }

  function paintProfile(me) {
    var target = me.target_exam === 'cpns' ? 'cpns' : 'utbk';
    var container = document.querySelector('[data-spec-screen="6"] .app');
    container.innerHTML =
      '<div class="bar"><button class="btn-secondary" id="page-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Profil</div><div class="s">Atur nama dan target belajarmu</div></div></div>' +
      '<form class="card profile-form" id="profile-form">' +
        '<label class="s" for="f-name">Nama</label>' +
        '<input class="field" id="f-name" maxlength="60" required autocomplete="name">' +
        '<span class="s">Ujian target</span>' +
        '<div class="target-btns">' +
          '<button type="button" class="btn-secondary" data-target="utbk" aria-pressed="false">UTBK PTN</button>' +
          '<button type="button" class="btn-secondary" data-target="cpns" aria-pressed="false">CAT CPNS</button>' +
        '</div>' +
        '<div id="target-group">' +
          '<label class="s" for="f-campus">Kampus tujuan</label>' +
          '<select class="field" id="f-campus">' + optionList(CAMPUSES, me.target_campus, 'Pilih kampus') + '</select>' +
          '<label class="s" for="f-major">Jurusan</label>' +
          '<select class="field" id="f-major">' + optionList(MAJORS, me.target_major, 'Pilih jurusan') + '</select>' +
          '<label class="s" for="f-score">Target skor</label>' +
          '<input class="field" id="f-score" type="number" inputmode="numeric" min="0" max="1000" step="10" placeholder="e.g. 720">' +
          '<div class="s target-line" id="f-latest"></div>' +
        '</div>' +
        '<div class="s form-error" id="profile-error" role="alert" hidden></div>' +
        '<div class="actions"><button class="btn-primary" type="submit">Simpan</button>' +
        '<button class="btn-secondary" type="button" id="profile-cancel">Batal</button></div>' +
      '</form>';

    bindBack('/');
    var form = document.getElementById('profile-form');
    var name = document.getElementById('f-name');
    var campus = document.getElementById('f-campus');
    var major = document.getElementById('f-major');
    var score = document.getElementById('f-score');
    var group = document.getElementById('target-group');
    var latest = document.getElementById('f-latest');
    name.value = me.name && me.name !== 'Tamu' ? me.name : '';
    campus.value = me.target_campus || '';
    major.value = me.target_major || '';
    score.value = me.target_score == null ? 600 : me.target_score;

    function paintLatest() {
      if (!me.latest_utbk) {
        latest.textContent = 'Belum ada skor UTBK.';
        return;
      }
      var gap = (Number(score.value) || 600) - me.latest_utbk.score;
      latest.textContent = 'Skor UTBK terakhir: ' + me.latest_utbk.score +
        (gap > 0 ? '. Kurang ' + gap + ' poin dari target.' : '. Target tercapai.');
    }

    function paintTarget() {
      Array.prototype.forEach.call(form.querySelectorAll('[data-target]'), function (b) {
        var on = b.getAttribute('data-target') === target;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('on', on);
      });
      group.hidden = target !== 'utbk';
    }
    Array.prototype.forEach.call(form.querySelectorAll('[data-target]'), function (b) {
      b.addEventListener('click', function () {
        target = b.getAttribute('data-target');
        paintTarget();
      });
    });
    paintTarget();
    paintLatest();
    score.addEventListener('input', paintLatest);
    document.getElementById('profile-cancel').addEventListener('click', function () { navigate('/'); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('profile-error');
      err.hidden = true;
      if (!name.value.trim()) {
        err.textContent = 'Nama tidak boleh kosong.';
        err.hidden = false;
        name.focus();
        return;
      }
      var targetScore = score.value === '' ? 600 : Number(score.value);
      if (!Number.isInteger(targetScore) || targetScore < 0 || targetScore > 1000) {
        err.textContent = 'Target skor harus bilangan bulat 0 sampai 1000.';
        err.hidden = false;
        score.focus();
        return;
      }
      var saveBtn = form.querySelector('button[type="submit"]');
      saveBtn.disabled = true;
      api('/api/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.value,
          target_exam: target,
          target_campus: campus.value,
          target_major: major.value,
          target_score: target === 'utbk' ? targetScore : 600,
        }),
      }).then(function () {
        navigate('/');
      }).catch(function () {
        saveBtn.disabled = false;
        err.textContent = 'Profil tidak bisa disimpan. Periksa koneksimu, lalu coba Simpan lagi.';
        err.hidden = false;
      });
    });
    name.focus();
  }

  // ── Daily practice ──────────────────────────────────────────────────────
  function renderPractice() {
    view.innerHTML = '<div data-spec-screen="7"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="page-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Latihan 5 soal</div><div class="s">Memuat soal...</div></div></div>' +
      '<div class="card"><div class="skeleton" style="height:20px;width:40%;margin-bottom:14px"></div><div class="skeleton" style="height:16px;width:90%;margin-bottom:8px"></div><div class="skeleton" style="height:44px;margin-bottom:8px"></div><div class="skeleton" style="height:44px"></div></div>' +
      '</div></div>';
    bindBack('/');
    api('/api/practice' + demoQuery).then(function (data) {
      if (!document.querySelector('[data-spec-screen="7"]')) return;
      paintPractice(data);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="7"]')) return;
      view.innerHTML = '<div data-spec-screen="7"><div class="app">' +
        '<div class="bar"><button class="btn-secondary" id="page-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Latihan 5 soal</div></div></div>' +
        '<div class="state-error"><div class="text-body font-medium">Soal latihan tidak bisa dimuat.</div><div class="text-small text-muted">Periksa koneksimu, lalu coba lagi.</div><button class="btn-secondary" id="practice-retry" type="button">Coba lagi</button></div>' +
        '</div></div>';
      bindBack('/');
      document.getElementById('practice-retry').addEventListener('click', renderPractice);
    });
  }

  function paintPractice(data) {
    var container = document.querySelector('[data-spec-screen="7"] .app');
    var done = !!data.done;
    var answers = data.answers || {};
    var streak = data.streak;

    var html = '<div class="bar"><button class="btn-secondary" id="page-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button>' +
      '<div><div class="ttl">Latihan 5 soal</div><div class="s" id="practice-sub"></div></div></div>';
    if (done) {
      html += '<div class="card practice-result"><div class="score-num" id="practice-score">Benar ' + data.correct + ' dari ' + data.total + '</div>' +
        '<div class="pass-line ok" id="practice-line">Latihan hari ini selesai.</div></div>';
    } else {
      html += '<div class="s practice-note">Lima soal singkat tanpa batas waktu. Selesaikan untuk menjaga beruntunmu.</div>';
    }
    html += '<div id="practice-list"></div>';
    if (!done) {
      html += '<div class="actions"><button class="btn-primary" id="practice-finish" type="button">Selesai latihan</button>' +
        '<button class="btn-secondary" id="practice-cancel" type="button">Batal</button></div>' +
        '<div class="s form-error" id="practice-error" role="alert" hidden></div>';
    } else {
      html += '<div class="actions"><a class="btn-primary" href="/">Kembali ke beranda</a></div>';
    }
    container.innerHTML = html;
    bindBack('/');
    var sub = document.getElementById('practice-sub');
    sub.textContent = streak && streak.current > 0 ? 'Beruntun ' + streak.current + ' hari' : 'Latihan harian';

    var list = document.getElementById('practice-list');
    (data.questions || []).forEach(function (q, i) {
      var card = el('div', 'card entry practice-q');
      var head = el('div', 'entry-head');
      head.appendChild(el('span', 'q-tile', String(i + 1)));
      head.appendChild(el('span', 'tag', q.subtestName || q.topic));
      card.appendChild(head);
      if (q.passage) {
        var passage = el('div', 'passage');
        if (q.passage.title) passage.appendChild(el('div', 'passage-title', q.passage.title));
        passage.appendChild(el('p', 'passage-text', q.passage.text));
        card.appendChild(passage);
      }
      card.appendChild(el('p', 'q', q.prompt));
      var opts = el('div');
      q.options.forEach(function (o) {
        var isGiven = answers[q.id] === o.letter;
        var tone = '';
        if (done) {
          if (q.answer === o.letter) tone = ' ok';
          else if (isGiven) tone = ' no';
        } else if (isGiven) {
          tone = ' on';
        }
        var b = el('button', 'opt' + tone);
        b.type = 'button';
        if (done) b.disabled = true;
        b.setAttribute('aria-pressed', isGiven ? 'true' : 'false');
        b.appendChild(el('b', '', o.letter));
        b.appendChild(el('span', '', o.text));
        if (!done) {
          b.addEventListener('click', function () {
            answers[q.id] = o.letter;
            Array.prototype.forEach.call(opts.querySelectorAll('.opt'), function (n) {
              n.classList.remove('on');
              n.setAttribute('aria-pressed', 'false');
            });
            b.classList.add('on');
            b.setAttribute('aria-pressed', 'true');
          });
        }
        opts.appendChild(b);
      });
      card.appendChild(opts);
      if (done) {
        var line = el('div', 'answer-line');
        line.appendChild(el('span', 'k', 'Jawabanmu: '));
        line.appendChild(el('span', 'v', q.given ? answerText(q, q.given) : 'kosong'));
        card.appendChild(line);
        var explain = el('div', 'explain');
        explain.appendChild(el('div', 'explain-title', 'Pembahasan'));
        var ol = document.createElement('ol');
        (q.explanation || []).forEach(function (step) { ol.appendChild(el('li', '', step)); });
        explain.appendChild(ol);
        card.appendChild(explain);
      }
      list.appendChild(card);
    });

    if (!done) {
      var finish = document.getElementById('practice-finish');
      var cancel = document.getElementById('practice-cancel');
      cancel.addEventListener('click', function () { navigate('/'); });
      finish.addEventListener('click', function () {
        finish.disabled = true;
        var err = document.getElementById('practice-error');
        err.hidden = true;
        api('/api/practice' + demoQuery, {
          method: 'POST',
          body: JSON.stringify({ answers: answers }),
        }).then(function (payload) {
          paintPractice(payload);
        }).catch(function (e) {
          finish.disabled = false;
          if (e && e.message === 'account_required') {
            err.textContent = 'Kamu perlu akun untuk menyimpan hasil.';
          } else {
            err.textContent = 'Latihan belum tersimpan. Periksa koneksimu, lalu coba lagi.';
          }
          err.hidden = false;
        });
      });
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  renderRoute();
})();
