'use strict';

// SiapUjian's single-page app: the dashboard (/), the CAT-style exam screens
// (/ujian/utbk, /ujian/cpns, /ujian/harian), the results screen (/hasil/:id),
// its review (/hasil/:id/pembahasan) and Progres (/progres).

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
    utbk: { name: 'Try Out UTBK PTN', count: 20, duration: '40 menit', passing: 'Passing grade 600' },
    cpns: { name: 'Try Out CAT CPNS', count: 3, duration: '45 menit', passing: 'Passing grade 10' },
    daily: { name: 'Latihan harian', count: 5, duration: '10 menit', passing: '' },
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
    if (mode === 'daily') return score + ' dari ' + max + ' benar';
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
    if (p === '/progres') return renderProgress();
    var m = p.match(/^\/ujian\/(utbk|cpns|harian)$/);
    if (m) return renderQuiz(m[1] === 'harian' ? 'daily' : m[1]);
    m = p.match(/^\/hasil\/(\d+)\/pembahasan$/);
    if (m) return renderReview(m[1]);
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
      rail.classList.toggle('dense', info.count > 10);
      for (var i = 1; i <= info.count; i++) rail.appendChild(el('i', '', String(i)));
    });

    var note = document.querySelector('[data-usernode-demo-note]');
    if (note) note.hidden = !DEMO;

    var dailyRetry = document.getElementById('daily-retry');
    if (dailyRetry) dailyRetry.addEventListener('click', loadSummary);
    loadProfile();
    loadSummary();
    loadResults();
  }

  // The Latihan harian card, the streak chip and the target gap, all from
  // /api/summary (with the profile for the target score).
  function loadSummary() {
    var streakEl = document.getElementById('streak-label');
    var dailyBtn = document.getElementById('daily-btn');
    var dailyScore = document.getElementById('daily-score');
    var gapEl = document.getElementById('profile-gap');
    if (!streakEl || !dailyBtn) return;
    function showRetry(show) {
      var chip = document.getElementById('streak-chip');
      var errLine = document.getElementById('daily-error');
      if (chip) chip.hidden = show;
      if (errLine) errLine.hidden = !show;
    }
    function fail() {
      if (!document.getElementById('streak-label')) return;
      showRetry(true);
    }
    showRetry(false);
    streakEl.textContent = 'Memuat...';

    Promise.all([api('/api/me'), api('/api/summary' + demoQuery)]).then(function (r) {
      if (!document.getElementById('streak-label')) return;
      var me = r[0];
      var s = r[1] || {};
      var st = s.streak || { days: 0, doneToday: false };
      streakEl.textContent = st.days > 0 ? 'Runtutan ' + st.days + ' hari' : 'Mulai runtutanmu hari ini';
      if (s.daily) {
        dailyBtn.textContent = 'Lihat hasil hari ini';
        dailyBtn.setAttribute('href', '/hasil/' + s.daily.id);
        if (dailyScore) {
          dailyScore.textContent = 'Skor hari ini: ' + s.daily.score + ' dari 5 benar.';
          dailyScore.hidden = false;
        }
      } else {
        dailyBtn.textContent = 'Mulai 5 soal';
        dailyBtn.setAttribute('href', '/ujian/harian');
        if (dailyScore) dailyScore.hidden = true;
      }
      if (!gapEl) return;
      if (me.target_exam === 'cpns') {
        gapEl.hidden = true;
        return;
      }
      var target = me.target_score || 600;
      gapEl.hidden = false;
      var line = gapEl.querySelector('[data-gap="line"]');
      var fill = gapEl.querySelector('[data-gap="fill"]');
      var tick = gapEl.querySelector('[data-gap="tick"]');
      tick.style.left = Math.max(0, Math.min(100, target / 10)) + '%';
      if (!s.latestUtbk) {
        fill.style.width = '0%';
        line.textContent = 'Selesaikan try out UTBK untuk melihat jarak ke target.';
      } else {
        var sc = s.latestUtbk.score;
        fill.style.width = Math.max(0, Math.min(100, sc / 10)) + '%';
        line.innerHTML = '';
        if (sc >= target) {
          line.appendChild(document.createTextNode('Skor terakhir '));
          line.appendChild(el('strong', '', String(sc)));
          line.appendChild(document.createTextNode('. Sudah melewati target '));
          line.appendChild(el('strong', '', String(target)));
          line.appendChild(document.createTextNode('.'));
        } else {
          line.appendChild(document.createTextNode('Skor terakhir '));
          line.appendChild(el('strong', '', String(sc)));
          line.appendChild(document.createTextNode('. Kurang '));
          line.appendChild(el('strong', '', String(target - sc)));
          line.appendChild(document.createTextNode(' poin dari target '));
          line.appendChild(el('strong', '', String(target)));
          line.appendChild(document.createTextNode('.'));
        }
      }
    }).catch(fail);
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
      var goal = me.target_exam === 'cpns'
        ? me.target_goal
        : [me.target_major, me.target_campus].filter(Boolean).join(', ') || null;
      paintRole(me.target_exam === 'cpns' ? 'cpns' : 'utbk', goal);
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
        '<div class="utbk-fields">' +
          '<label class="s" for="f-campus">Kampus tujuan (opsional)</label>' +
          '<input class="field" id="f-campus" maxlength="80" placeholder="e.g. Universitas Gadjah Mada">' +
          '<label class="s" for="f-major">Jurusan tujuan (opsional)</label>' +
          '<input class="field" id="f-major" maxlength="80" placeholder="e.g. Teknik Informatika">' +
          '<label class="s" for="f-score">Skor target (opsional)</label>' +
          '<input class="field" id="f-score" inputmode="numeric" maxlength="4" placeholder="e.g. 700">' +
        '</div>' +
        '<div class="cpns-fields">' +
          '<label class="s" for="f-goal">Tujuan (opsional)</label>' +
          '<input class="field" id="f-goal" maxlength="80" placeholder="e.g. Analyst Kebijakan">' +
        '</div>' +
        '<div class="s" id="profile-error" role="alert" hidden></div>';
      card.replaceWith(form);

      var name = form.querySelector('#f-name');
      var goal = form.querySelector('#f-goal');
      var campus = form.querySelector('#f-campus');
      var major = form.querySelector('#f-major');
      var targetScore = form.querySelector('#f-score');
      name.value = me.name && me.name !== 'Tamu' ? me.name : '';
      goal.value = me.target_goal || '';
      campus.value = me.target_campus || '';
      major.value = me.target_major || '';
      targetScore.value = me.target_score ? String(me.target_score) : '';
      var target = me.target_exam === 'cpns' ? 'cpns' : 'utbk';

      function paintTarget() {
        form.querySelector('.utbk-fields').hidden = target !== 'utbk';
        form.querySelector('.cpns-fields').hidden = target !== 'cpns';
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
        var scoreVal = targetScore.value.trim();
        if (scoreVal && (!/^\d+$/.test(scoreVal) || Number(scoreVal) < 1 || Number(scoreVal) > 1000)) {
          err.textContent = 'Skor target harus angka 1 sampai 1000.';
          err.hidden = false;
          targetScore.focus();
          return;
        }
        saveBtn.disabled = true;
        api('/api/me', {
          method: 'PUT',
          body: JSON.stringify({
            name: name.value, target_exam: target, target_goal: goal.value,
            target_campus: campus.value, target_major: major.value, target_score: scoreVal || null,
          }),
        }).then(function () {
          renderHome();
        }).catch(function (e) {
          saveBtn.disabled = false;
          err.textContent = e && e.message === 'invalid_target_score'
            ? 'Skor target harus angka 1 sampai 1000.'
            : 'Profil tidak bisa disimpan. Periksa koneksimu, lalu coba Simpan lagi.';
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
      attempts.slice(0, 3).forEach(function (a) {
        list2.appendChild(resultRow(a));
      });
      list2.hidden = false;
    }).catch(showError);
  }

  // One finished result, as the dashboard, Progres and the results list show it.
  function resultRow(a) {
    var rowTpl = document.getElementById('result-row-tpl');
    var row = rowTpl.content.firstElementChild.cloneNode(true);
    row.setAttribute('data-attempt', a.id);
    row.setAttribute('role', 'link');
    row.setAttribute('tabindex', '0');
    row.setAttribute('style', 'cursor:pointer');
    var icon = row.querySelector('.result-icon');
    if (icon) {
      icon.classList.toggle('cpns', a.mode === 'cpns');
      icon.classList.toggle('daily', a.mode === 'daily');
    }
    row.querySelector('[data-row="mode"]').textContent = MODE_INFO[a.mode] ? MODE_INFO[a.mode].name : a.mode;
    row.querySelector('[data-row="when"]').textContent = whenLabel(new Date(a.created_at));
    row.querySelector('[data-row="score"]').textContent = scoreLabel(a.mode, a.score, a.max_score);
    var verdict = row.querySelector('[data-row="verdict"]');
    if (a.mode === 'daily') {
      verdict.hidden = true;
    } else {
      verdict.classList.add(a.passed ? 'ok' : 'no');
      row.querySelector('[data-row="verdict-label"]').textContent = a.passed ? 'Lulus' : 'Belum lulus';
      var verdictPath = row.querySelector('[data-row="verdict-path"]');
      if (verdictPath) verdictPath.setAttribute('d', a.passed ? 'M20 6 9 17l-5-5' : 'M18 6 6 18M6 6l12 12');
    }
    function open() { navigate('/hasil/' + a.id); }
    row.addEventListener('click', open);
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return row;
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

  var FLAG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>';

  function quizShell(examName, subtitle, timerText) {
    return '<div data-spec-screen="2"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="quiz-back" type="button" aria-label="Keluar dari ujian">' + BACK_SVG + '</button>' +
      '<div><div class="ttl">' + examName + '</div><div class="s" id="quiz-progress">' + subtitle + '</div></div>' +
      '<div class="timer" aria-live="off">' + CLOCK_SVG + '<span id="quiz-timer">' + timerText + '</span></div></div>' +
      '<div class="card" id="question-card">' +
      '<div class="qhead"><span class="tag" id="q-topic"></span>' +
      '<button class="btn-secondary flag" id="q-flag" type="button" aria-pressed="false">' + FLAG_SVG + 'Ragu-ragu</button></div>' +
      '<p class="passage" id="q-passage" hidden></p>' +
      '<p class="q" id="q-prompt"></p><div id="q-options"></div>' +
      '</div>' +
      '<div class="foot"><button class="btn-secondary" id="prev-q" type="button">Sebelumnya</button>' +
      '<button class="btn-primary" id="next-q" type="button">Soal berikutnya</button></div>' +
      '<div class="sheet card" id="sheet" aria-label="Lembar jawaban">' +
      '<div class="sheet-head"><strong>Lembar jawaban</strong><span class="s" id="rail-count"></span></div>' +
      '<div class="legend"><span><i class="sw f"></i>Dijawab</span><span><i class="sw r"></i>Ragu-ragu</span><span><i class="sw"></i>Belum dijawab</span></div>' +
      '<div id="sheet-groups"></div></div>' +
      '<div class="s note">Ujian selesai otomatis saat waktu habis.</div>' +
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
      flags: {},
      finished: false,
      submitting: false,
      timedOut: false,
      startedAt: now().getTime(),
      endAt: now().getTime() + exam.durationMin * 60000,
      interval: null,
    };
    view.innerHTML = quizShell(exam.name, 'Soal 1 dari ' + exam.questions.length, formatClock(exam.durationMin * 60));
    examState.el = {
      progress: document.getElementById('quiz-progress'),
      timer: document.getElementById('quiz-timer'),
      topic: document.getElementById('q-topic'),
      passage: document.getElementById('q-passage'),
      prompt: document.getElementById('q-prompt'),
      options: document.getElementById('q-options'),
      flag: document.getElementById('q-flag'),
      groups: document.getElementById('sheet-groups'),
      count: document.getElementById('rail-count'),
      prev: document.getElementById('prev-q'),
      next: document.getElementById('next-q'),
      error: document.getElementById('quiz-error'),
    };
    document.getElementById('quiz-back').addEventListener('click', leaveQuiz);
    examState.el.flag.addEventListener('click', function () {
      if (!examState || examState.finished) return;
      var id = EXAM.questions[examState.idx].id;
      if (examState.flags[id]) delete examState.flags[id];
      else examState.flags[id] = true;
      paintQuestion();
    });
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
    if (q.passage) {
      e.passage.textContent = q.passage;
      e.passage.hidden = false;
    } else {
      e.passage.textContent = '';
      e.passage.hidden = true;
    }
    var flagged = !!examState.flags[q.id];
    e.flag.setAttribute('aria-pressed', flagged ? 'true' : 'false');
    e.flag.classList.toggle('on', flagged);
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

    // The answer sheet, grouped by subtest (by consecutive topic, so an old
    // three-question CPNS try out still groups sensibly).
    e.groups.innerHTML = '';
    var group = null;
    // Latihan harian draws one row of five tiles, with no subtest headings:
    // five one-tile groups would push the sheet far down the screen.
    var singleGroup = EXAM.mode === 'daily';
    EXAM.questions.forEach(function (qq, i) {
      if (!group || (!singleGroup && group.name !== qq.topic)) {
        group = { name: qq.topic, ids: [], box: null };
        var g = el('div', 'grp');
        if (!singleGroup) g.appendChild(el('div', 'grp-name', qq.topic));
        var tiles = el('div', 'tiles');
        g.appendChild(tiles);
        group.el = tiles;
        e.groups.appendChild(g);
      }
      var answered = !!examState.answers[qq.id];
      var isFlag = !!examState.flags[qq.id];
      var cls = 'rail-tile' + (answered ? ' f' : '') + (isFlag ? ' r' : '') + (i === examState.idx ? ' c' : '');
      var t = el('i', cls, String(i + 1));
      t.setAttribute('role', 'button');
      t.setAttribute('tabindex', '0');
      t.setAttribute('aria-label', 'Soal ' + (i + 1) + (answered ? ', sudah dijawab' : ', belum dijawab') + (isFlag ? ', ragu-ragu' : ''));
      t.addEventListener('click', function () { goTo(i); });
      t.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo(i); }
      });
      group.el.appendChild(t);
    });
    var answeredCount = EXAM.questions.filter(function (qq) { return !!examState.answers[qq.id]; }).length;
    e.count.textContent = answeredCount + ' dari ' + EXAM.questions.length + ' dijawab';
    e.count.setAttribute('data-answered', String(answeredCount));

    e.prev.disabled = examState.idx === 0;
    e.next.textContent = examState.idx === EXAM.questions.length - 1 ? 'Selesai ujian' : 'Soal berikutnya';
  }

  function finishExam(timedOut) {
    if (!examState || examState.finished || examState.submitting) return;
    if (!timedOut) {
      var unanswered = EXAM.questions.filter(function (q) { return !examState.answers[q.id]; }).length;
      var flagged = EXAM.questions.filter(function (q) { return examState.flags[q.id]; }).length;
      if (unanswered > 0 || flagged > 0) {
        var parts = [];
        if (unanswered > 0) parts.push(unanswered + ' soal belum dijawab');
        if (flagged > 0) parts.push(flagged + ' ditandai ragu-ragu');
        confirmDialog(parts.join(' dan ') + '. Selesai sekarang?', 'Selesai').then(function (ok) {
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
    var payload = {
      mode: EXAM.mode,
      answers: examState.answers,
      timedOut: timedOut,
      durationSec: Math.round((now().getTime() - examState.startedAt) / 1000),
    };
    if (EXAM.mode === 'daily' && EXAM.day) payload.day = EXAM.day;
    api('/api/attempts' + demoQuery, {
      method: 'POST',
      body: JSON.stringify(payload),
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

  function durationText(sec) {
    var s = Math.max(0, Math.round(sec));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(r);
  }

  function paintResults(data) {
    var a = data.attempt;
    var exam = data.exam;
    var bd = data.breakdown || { correct: 0, wrong: 0, empty: 0, subtests: [] };
    var isDaily = exam.mode === 'daily';
    var isUtbk = exam.mode === 'utbk';
    var showBars = isUtbk && !data.legacy && bd.subtests && bd.subtests.length;
    var wrap = document.createElement('div');
    var passHtml = isDaily ? '' :
      '<div class="pass-line" data-r="pass"></div>';
    wrap.innerHTML = '<div data-spec-screen="3"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="results-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Hasil try out</div><div class="s" data-r="exam"></div></div></div>' +
      '<div class="score-head"><div class="score-num"><span class="score-label">' + (isDaily ? '' : 'Skor') + '</span> <span data-r="score"></span> <span class="score-label">' + (isDaily ? '' : 'dari ' + exam.maxScore) + '</span></div>' +
      passHtml +
      '<div class="s" data-r="timed" hidden>Waktu habis</div></div>' +
      '<div class="card stats-card">' +
      '<div class="stats"><div class="stat ok"><b data-r="correct">0</b><span class="s">Benar</span></div>' +
      '<div class="stat no"><b data-r="wrong">0</b><span class="s">Salah</span></div>' +
      '<div class="stat"><b data-r="empty">0</b><span class="s">Kosong</span></div></div>' +
      '<div class="s time" data-r="duration" hidden>' + CLOCK_SVG + '<span></span></div>' +
      '</div>' +
      '<div class="card" id="bars-card" hidden><h3 class="h">Skor per subtes</h3><div class="bars" id="bars"></div>' +
      '<div class="s legend">Garis putus-putus: passing grade ' + exam.passingGrade + '</div></div>' +
      '<div class="card" id="sheet-card"><h3 class="h">Lembar jawaban</h3><div class="sheet" id="result-sheet"></div></div>' +
      '<div class="actions">' +
      '<a class="btn-primary" id="review-link" href="/hasil/' + a.id + '/pembahasan">Lihat pembahasan</a>' +
      '<a class="btn-secondary" href="/">Kembali ke beranda</a>' +
      '<button class="btn-secondary" id="delete-result" type="button">Hapus hasil</button></div>' +
      '<div class="s" id="delete-error" role="alert" hidden style="margin-top:8px"></div>' +
      '</div></div>';

    wrap.querySelector('[data-r="exam"]').textContent = exam.name;
    wrap.querySelector('[data-r="score"]').textContent =
      isDaily ? bd.correct + ' dari ' + data.questions.length + ' benar' : String(a.score);
    if (!isDaily) {
      var pass = wrap.querySelector('[data-r="pass"]');
      if (a.passed) {
        pass.textContent = 'Passing grade ' + exam.passingGrade + ': Lulus';
        pass.classList.add('ok');
      } else {
        pass.textContent = 'Passing grade ' + exam.passingGrade + ': Belum lulus, kurang ' + (exam.passingGrade - a.score);
        pass.classList.add('no');
      }
    }
    if (a.timed_out) wrap.querySelector('[data-r="timed"]').hidden = false;
    wrap.querySelector('[data-r="correct"]').textContent = String(bd.correct);
    wrap.querySelector('[data-r="wrong"]').textContent = String(bd.wrong);
    wrap.querySelector('[data-r="empty"]').textContent = String(bd.empty);
    if (a.duration_sec != null) {
      var dur = wrap.querySelector('[data-r="duration"]');
      dur.hidden = false;
      dur.querySelector('span').textContent = 'Waktu dipakai ' + durationText(a.duration_sec) + ' dari ' + exam.durationMin + ':00';
    }

    if (showBars) {
      var barsCard = wrap.querySelector('#bars-card');
      barsCard.hidden = false;
      var bars = wrap.querySelector('#bars');
      bd.subtests.forEach(function (s) {
        var row = el('div', 'brow');
        var top = el('div', 'brow-top');
        top.appendChild(el('span', '', s.name));
        top.appendChild(el('b', '', String(s.score)));
        row.appendChild(top);
        var track = el('div', 'track');
        var fill = el('span', 'fill');
        fill.style.width = Math.max(0, Math.min(100, s.score / 10)) + '%';
        track.appendChild(fill);
        var mark = el('span', 'mark');
        mark.style.left = Math.max(0, Math.min(100, exam.passingGrade / 10)) + '%';
        track.appendChild(mark);
        row.appendChild(track);
        row.appendChild(el('div', 'sub', s.correct + ' dari ' + s.total + ' benar'));
        bars.appendChild(row);
      });
    }

    var sheet = wrap.querySelector('#result-sheet');
    data.questions.forEach(function (q, i) {
      var tone = !q.given ? '' : q.type === 'tkp' ? 'ok' : q.given === q.answer ? 'ok' : 'no';
      var t = el('a', 'qt ' + tone, String(i + 1));
      t.href = '/hasil/' + a.id + '/pembahasan#q-' + (i + 1);
      t.setAttribute('aria-label', 'Soal ' + (i + 1) + ', ' + (!q.given ? 'kosong' : tone === 'ok' ? 'benar' : 'salah'));
      sheet.appendChild(t);
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

    entry.id = 'q-' + (i + 1);
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

    if (q.passage) entry.appendChild(el('p', 'passage', q.passage));
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

  // ── Review (Pembahasan) ─────────────────────────────────────────────────
  function renderReview(id) {
    view.innerHTML = '<div data-spec-screen="4"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="review-back" type="button" aria-label="Kembali ke hasil">' + BACK_SVG + '</button><div><div class="ttl">Pembahasan</div><div class="s">Memuat pembahasan...</div></div></div>' +
      '<div class="card"><div class="skeleton" style="height:16px;width:90%;margin-bottom:8px"></div><div class="skeleton" style="height:16px;width:70%"></div></div>' +
      '</div></div>';
    var back = document.getElementById('review-back');
    if (back) back.addEventListener('click', function () { navigate('/hasil/' + id); });
    api('/api/attempts/' + id).then(function (data) {
      if (!document.querySelector('[data-spec-screen="4"]')) return;
      paintReview(data);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="4"]')) return;
      view.innerHTML = '<div data-spec-screen="4"><div class="app">' +
        '<div class="bar"><button class="btn-secondary" id="review-back" type="button" aria-label="Kembali ke hasil">' + BACK_SVG + '</button><div><div class="ttl">Pembahasan</div></div></div>' +
        '<div class="state-error"><div class="text-body font-medium">Pembahasan tidak bisa dimuat.</div><div class="text-small text-muted">Periksa koneksimu, lalu coba lagi.</div><button class="btn-secondary" id="review-retry" type="button">Coba lagi</button></div>' +
        '</div></div>';
      document.getElementById('review-back').addEventListener('click', function () { navigate('/hasil/' + id); });
      document.getElementById('review-retry').addEventListener('click', function () { renderReview(id); });
    });
  }

  function paintReview(data) {
    var exam = data.exam;
    var when = whenLabel(new Date(data.attempt.created_at));
    view.innerHTML = '<div data-spec-screen="4"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="review-back" type="button" aria-label="Kembali ke hasil">' + BACK_SVG + '</button><div><div class="ttl">Pembahasan</div><div class="s" id="review-sub"></div></div></div>' +
      '<div id="review-body"></div></div></div>';
    document.getElementById('review-sub').textContent = exam.name + ', ' + when;
    document.getElementById('review-back').addEventListener('click', function () { navigate('/hasil/' + data.attempt.id); });
    var body = document.getElementById('review-body');
    var group = null;
    data.questions.forEach(function (q, i) {
      if (group !== q.topic) {
        group = q.topic;
        body.appendChild(el('h2', 'review-heading', q.topic));
      }
      body.appendChild(resultEntry(q, i, exam));
    });
    if (location.hash && location.hash.indexOf('#q-') === 0) {
      var target = document.querySelector(location.hash);
      if (target) target.scrollIntoView({ block: 'start' });
    }
  }

  // ── Progres ─────────────────────────────────────────────────────────────
  function renderProgress() {
    view.innerHTML = '<div data-spec-screen="5"><div class="app">' +
      '<div class="bar"><button class="btn-secondary" id="progress-back" type="button" aria-label="Kembali ke beranda">' + BACK_SVG + '</button><div><div class="ttl">Progres</div><div class="s">Semua try out kamu</div></div></div>' +
      '<div id="progress-body">' +
      '<div class="card"><div class="skeleton" style="height:16px;width:40%;margin-bottom:10px"></div><div class="skeleton" style="height:150px"></div></div>' +
      '<div class="card" style="margin-top:16px"><div class="skeleton" style="height:16px;width:50%;margin-bottom:10px"></div><div class="skeleton" style="height:14px;margin-bottom:8px"></div><div class="skeleton" style="height:14px;margin-bottom:8px"></div><div class="skeleton" style="height:14px"></div></div>' +
      '</div></div></div>';
    document.getElementById('progress-back').addEventListener('click', function () { navigate('/'); });

    Promise.all([api('/api/attempts' + demoQuery), api('/api/summary' + demoQuery)]).then(function (res) {
      if (!document.querySelector('[data-spec-screen="5"]')) return;
      paintProgress(res[0].attempts || [], res[1]);
    }).catch(function () {
      if (!document.querySelector('[data-spec-screen="5"]')) return;
      var body = document.getElementById('progress-body');
      body.innerHTML = '';
      var box = el('div', 'state-error card');
      box.appendChild(el('div', 'text-body font-medium', 'Progres tidak bisa dimuat.'));
      box.appendChild(el('div', 'text-small text-muted', 'Hasil try out tetap tersimpan. Periksa koneksimu, lalu coba lagi.'));
      var retry = el('button', 'btn-secondary', 'Coba lagi');
      retry.type = 'button';
      retry.addEventListener('click', renderProgress);
      box.appendChild(retry);
      body.appendChild(box);
    });
  }

  function trendChart(trend) {
    var NS = 'http://www.w3.org/2000/svg';
    var W = 320;
    var H = 170;
    var x0 = 34;
    var x1 = 314;
    var yTop = 10;
    var yBot = 140;
    var y = function (v) { return yBot - (v / 1000) * (yBot - yTop); };
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Tren skor UTBK: ' + trend.map(function (t) { return t.score; }).join(', '));
    function mk(tag, attrs, text) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    }
    [1000, 500, 0].forEach(function (v) {
      mk('line', { x1: x0, y1: y(v), x2: x1, y2: y(v), class: 'grid-line' });
      mk('text', { x: 28, y: y(v) + 3, 'text-anchor': 'end', class: 'ax' }, String(v));
    });
    mk('line', { x1: x0, y1: y(600), x2: x1, y2: y(600), class: 'pg-line' });
    mk('text', { x: x0 + 2, y: y(600) - 5, class: 'pg-label' }, 'Passing grade 600');
    var step = trend.length > 1 ? (x1 - x0) / (trend.length - 1) : 0;
    var pts = trend.map(function (t, i) { return [x0 + step * i, y(t.score)]; });
    if (pts.length > 1) {
      mk('polyline', { points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '), class: 'chart-line' });
    }
    pts.forEach(function (p, i) {
      var c = mk('circle', { cx: p[0], cy: p[1], r: 5, class: 'chart-dot' });
      var title = document.createElementNS(NS, 'title');
      title.textContent = (trend[i].score + ' pada ' + whenLabel(new Date(trend[i].created_at)));
      c.appendChild(title);
    });
    var last = pts[pts.length - 1];
    if (last) mk('text', { x: last[0], y: last[1] - 10, 'text-anchor': 'middle', class: 'chart-label' }, String(trend[trend.length - 1].score));
    trend.forEach(function (t, i) {
      if (trend.length > 5 && i % 2) return;
      var d = new Date(t.created_at);
      mk('text', { x: pts[i][0], y: 160, 'text-anchor': 'middle', class: 'ax' }, d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]);
    });
    return svg;
  }

  function paintProgress(attempts, summary) {
    var body = document.getElementById('progress-body');
    body.innerHTML = '';
    var trend = (summary && summary.trend) || [];

    var chartCard = el('section', 'card prog-card');
    chartCard.appendChild(el('h3', 'h', 'Tren skor UTBK'));
    chartCard.appendChild(el('div', 's', trend.length ? trend.length + ' try out terakhir' : 'Belum ada try out UTBK.'));
    if (trend.length) {
      chartCard.appendChild(trendChart(trend));
    } else {
      chartCard.appendChild(el('div', 's empty-inline', 'Belum ada try out UTBK. Selesaikan satu untuk melihat trenmu.'));
    }
    body.appendChild(chartCard);

    var weak = summary && summary.weakest;
    var weakCard = el('section', 'card prog-card');
    weakCard.appendChild(el('h3', 'h', 'Subtes terlemah'));
    if (weak) {
      weakCard.appendChild(el('div', 's', 'Dari semua soal UTBK yang sudah kamu kerjakan.'));
      weak.subtests.forEach(function (s) {
        var row = el('div', 'wrow' + (s.name === weak.name ? ' weak' : ''));
        var n = el('span', 'n', s.name);
        if (s.name === weak.name) n.appendChild(el('span', 'weak-chip', 'Terlemah'));
        row.appendChild(n);
        var track = el('span', 'wtrack');
        var bar = el('b', '');
        bar.style.width = Math.max(0, Math.min(100, s.pct)) + '%';
        track.appendChild(bar);
        row.appendChild(track);
        row.appendChild(el('span', 'p', s.pct + '%'));
        weakCard.appendChild(row);
      });
    } else {
      weakCard.appendChild(el('div', 's empty-inline', 'Belum ada soal UTBK yang dikerjakan.'));
    }
    body.appendChild(weakCard);

    body.appendChild(el('h2', 'home-heading', 'Riwayat'));
    var card = el('div', 'results-card');
    if (!attempts.length) {
      var empty = el('div', 'state-empty');
      empty.appendChild(el('div', 'text-body font-medium', 'Belum ada hasil.'));
      empty.appendChild(el('div', 'text-small text-muted', 'Selesaikan try out pertama untuk melihatnya di sini.'));
      card.appendChild(empty);
    } else {
      var ul = el('ul', 'list');
      attempts.forEach(function (a) { ul.appendChild(resultRow(a)); });
      card.appendChild(ul);
    }
    body.appendChild(card);
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  renderRoute();
})();
