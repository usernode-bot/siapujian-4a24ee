'use strict';

// Tanya AI: the prompt text, the sample (offline) replies and the parsing of
// the model's structured answers. The routes, quota and storage live in
// ai.js; this file has no database or network access, so it is easy to read
// and to test on its own.

const { QUESTIONS } = require('./questions');

// The subtests each exam's questions are grouped by. Used for the study plan
// and for the practice-topic picker.
const TOPICS = {
  utbk: ['Penalaran Matematika', 'Penalaran Umum', 'Pengetahuan Kuantitatif'],
  cpns: ['TWK', 'TIU', 'TKP'],
};

const CONTENT_RULES =
  'Batasan: tolak dengan sopan permintaan tentang topik dewasa atau sugestif, ' +
  'kekerasan, perjudian, atau hal di luar belajar ujian, lalu tawarkan bantuan belajar. ' +
  'Jangan pernah meminta atau membahas kata sandi, nomor kartu, atau data pribadi.';

const ASK_SYSTEM = [
  'Kamu "Tanya AI", tutor persiapan UTBK dan CPNS di aplikasi SiapUjian.',
  'Selalu menjawab dalam bahasa Indonesia yang sederhana dan ramah, memakai "kamu".',
  '',
  'Cara menjawab:',
  '- Awali dengan jawaban inti maksimal 3 kalimat dalam SATU paragraf.',
  '- Jika perlu langkah atau penjelasan tambahan, tulis setelah satu baris kosong, maksimal 6 kalimat.',
  '- Jawab langsung ke inti, tanpa pembuka panjang.',
  '- Jika kamu tidak yakin atau soalnya ambigu, katakan dengan jujur bahwa kamu tidak yakin dan sarankan cara memeriksanya. Jangan menebak.',
  '- Jangan mengerjakan soal ujian yang sedang berlangsung; jelaskan konsepnya saja.',
  '',
  CONTENT_RULES,
].join('\n');

function truncate(text, max) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function labelOf(question, letter) {
  if (!question || !letter) return '';
  const option = (question.options || []).find((o) => o.letter === letter);
  return option ? letter + '. ' + option.text : letter;
}

// The question context, written for the model. Everything is data the viewer
// can already see in Review mode: the prompt, the options, their answer and
// (for their own finished attempt) the answer key.
function contextBlock(ctx) {
  const q = ctx && ctx.question;
  if (!q) {
    return 'Pengguna belum memilih soal. Bantu mereka belajar UTBK dan CPNS secara umum, ' +
      'dan minta mereka membuka Tanya AI dari pembahasan soal bila ingin dibantu soal tertentu.';
  }
  const lines = [
    'Mode ujian: ' + (q.mode === 'cpns' ? 'CPNS' : 'UTBK'),
    'Topik: ' + q.topic,
    'Soal: ' + q.prompt,
    'Pilihan:',
  ];
  (q.options || []).forEach((o) => lines.push(o.letter + '. ' + o.text));
  if (ctx.given) lines.push('Jawaban pengguna: ' + labelOf(q, ctx.given));
  else if (ctx.attempt) lines.push('Pengguna belum menjawab soal ini.');
  if (ctx.answer) lines.push('Kunci jawaban: ' + labelOf(q, ctx.answer));
  if (ctx.weights) {
    lines.push('Bobot TKP: ' + Object.keys(ctx.weights)
      .map((k) => k + '=' + ctx.weights[k]).join(', '));
  }
  if (ctx.explanation && ctx.explanation.length) {
    lines.push('Pembahasan resmi aplikasi:', ...ctx.explanation);
  }
  return lines.join('\n');
}

function askSystem(ctx) {
  return ASK_SYSTEM + '\n\nKonteks soal:\n' + contextBlock(ctx);
}

function studySystem(data) {
  const weakest = (data.weakest || []).map((t) => {
    if (t.total) return '- ' + t.topic + ': ' + Math.round(t.ratio * 100) + '% benar dari ' + t.total + ' soal';
    return '- ' + t.topic + ': belum ada data, anggap perlu latihan dasar';
  }).join('\n');
  return [
    ASK_SYSTEM,
    '',
    'Tugas khusus: susun rencana belajar 7 hari untuk ' + data.examName + '.',
    'Subtests terlemah pengguna (urut dari paling lemah):',
    weakest,
    '',
    'Format: tepat 7 baris, satu baris per hari, diawali "Hari 1: " sampai "Hari 7: ".',
    'Setiap baris berisi topik harian dan jumlah soal latihan, misalnya "Hari 1: Dasar Penalaran Matematika, 5 soal".',
    'Maksimal 15 kata per baris. Jangan menulis pembuka atau penutup.',
  ].join('\n');
}

function practiceSystem(topic) {
  return [
    'Kamu pembuat soal latihan UTBK dan CPNS dalam bahasa Indonesia.',
    'Buat tepat 3 soal pilihan ganda baru tentang topik "' + topic + '".',
    'Balas HANYA dengan JSON array yang valid, tanpa teks lain dan tanpa blok kode.',
    'Format tiap elemen:',
    '{"prompt":"...","options":[{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."},{"letter":"D","text":"..."},{"letter":"E","text":"..."}],"answer":"B","explanation":"..."}',
    'Setiap soal punya 5 pilihan A sampai E, satu jawaban benar, dan penjelasan 1 sampai 2 kalimat.',
    CONTENT_RULES,
  ].join('\n');
}

// The visible answer is the first paragraph; everything after the first blank
// line becomes "Tampilkan detail". A one-paragraph answer has no detail.
function splitShortDetail(raw) {
  const text = String(raw == null ? '' : raw).trim();
  const i = text.indexOf('\n\n');
  if (i === -1) return { text: text, detail: null };
  const short = text.slice(0, i).trim();
  const detail = text.slice(i + 2).trim();
  return { text: short || text, detail: detail || null };
}

// Validates the model's practice JSON and keeps at most three questions. Any
// malformed entry is dropped; a result with no usable question is null.
function parsePractice(raw) {
  const s = String(raw == null ? '' : raw);
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  let list;
  try {
    list = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
    const explanation = typeof item.explanation === 'string' ? item.explanation.trim() : '';
    const answer = typeof item.answer === 'string' ? item.answer.trim().toUpperCase() : '';
    const options = Array.isArray(item.options) ? item.options.filter((o) =>
      o && typeof o.letter === 'string' && typeof o.text === 'string' &&
      /^[A-E]$/.test(o.letter.trim().toUpperCase()) && o.text.trim()
    ).map((o) => ({ letter: o.letter.trim().toUpperCase(), text: o.text.trim() })) : [];
    if (!prompt || !answer || !options.some((o) => o.letter === answer) || !explanation) continue;
    out.push({ prompt: prompt, options: options, answer: answer, explanation: explanation });
    if (out.length === 3) break;
  }
  return out.length === 3 ? out : null;
}

// ── Sample replies, used when the platform's LLM proxy is not available ─────
// (staging previews and standalone runs have no proxy token). Every sample
// reply is stored with `sample: true`, and the page labels it "Contoh".

const QUICK_TIPS = {
  'Penalaran Matematika': 'Ubah soal cerita menjadi persamaan, lalu eliminasi satu variabel dengan menjumlahkan atau mengurangkan kedua persamaan.',
  'Penalaran Umum': 'Tulis pernyataan sebagai "jika A maka B", lalu gunakan kontraposisinya: "jika bukan B maka bukan A".',
  'Pengetahuan Kuantitatif': 'Jumlahkan atau kurangkan kedua persamaan untuk menghilangkan satu variabel, lalu substitusi kembali.',
  TWK: 'Ingat istilah resmi kenegaraan dan pasal yang mengaturnya. Singkirkan pilihan yang mencampur istilah satu dengan yang lain.',
  TIU: 'Cari pola lewat selisih antar suku, lalu periksa apakah selisihnya tetap atau bertambah.',
  TKP: 'Pilih tindakan yang paling konstruktif, melibatkan tim, dan tetap bertanggung jawab.',
};

function quickTip(topic) {
  return QUICK_TIPS[topic] || 'Baca soal dua kali, tandai kata kunci, dan singkirkan pilihan yang jelas salah sebelum memilih.';
}

function inferIntent(message) {
  const m = String(message || '').toLowerCase();
  if (/cara cepat|trik/.test(m)) return 'quick';
  if (/kenapa.*salah|mengapa.*salah|salahku/.test(m)) return 'wrong';
  if (/serupa|latihan soal|soal baru/.test(m)) return 'practice';
  if (/rencana|belajar 7 hari|bantu aku belajar/.test(m)) return 'study';
  if (/jelaskan|pembahasan|langkah/.test(m)) return 'explain';
  return 'ask';
}

function sampleAnswer(input) {
  const ctx = input.ctx || {};
  const q = ctx.question || null;
  const intent = input.intent || inferIntent(input.message);
  const topic = q ? q.topic : '';

  if (intent === 'quick') {
    return {
      text: 'Cara cepat untuk ' + (topic || 'soal ujian') + ': ' + quickTip(topic),
      detail: 'Setelah menemukan pola atau persamaan, kerjakan satu langkah lagi untuk memastikan hasilnya masuk akal. ' +
        'Kalau masih ragu, coba masukkan jawabanmu kembali ke soal aslinya.',
    };
  }

  if (intent === 'wrong') {
    if (q && ctx.given && ctx.answer && ctx.given !== ctx.answer) {
      const first = (ctx.explanation && ctx.explanation[0]) || '';
      return {
        text: 'Jawabanmu ' + labelOf(q, ctx.given) + ' belum tepat. Jawaban yang benar adalah ' +
          labelOf(q, ctx.answer) + '.' + (first ? ' ' + first : ''),
        detail: (ctx.explanation || []).slice(1).join(' ') ||
          'Bandingkan pilihanmu dengan kunci jawaban, lalu catat bagian mana yang berbeda.',
      };
    }
    if (q && ctx.given && ctx.answer && ctx.given === ctx.answer) {
      return {
        text: 'Jawabanmu sudah benar, ' + labelOf(q, ctx.answer) + '. Yang perlu kamu jaga adalah cara mengerjakannya.',
        detail: (ctx.explanation || []).join(' ') || null,
      };
    }
    return {
      text: 'Aku perlu tahu soal dan jawabanmu dulu untuk menjelaskan bagian yang salah.',
      detail: 'Buka Tanya AI dari salah satu pembahasan soal di halaman hasil try out, lalu pilih "Kenapa jawabanku salah?".',
    };
  }

  if (intent === 'practice' || intent === 'similar') {
    return {
      text: 'Aku bisa buatkan 3 soal latihan' + (topic ? ' tentang ' + topic : '') + '. Pilih topik di tombol "Latihan soal", lalu kerjakan dulu sebelum membuka jawaban.',
      detail: null,
    };
  }

  if (intent === 'study') {
    return { text: sampleStudyPlan(input.plan || {}).text, detail: null };
  }

  // explain and free questions
  if (q && ctx.answer) {
    const steps = ctx.explanation || [];
    const first = steps[0] || ('Jawaban yang benar adalah ' + labelOf(q, ctx.answer) + '.');
    const wrong = ctx.given && ctx.given !== ctx.answer
      ? ' Jawabanmu ' + labelOf(q, ctx.given) + ' belum tepat, jadi perhatikan langkah di bawah.' : '';
    return {
      text: first + wrong,
      detail: steps.length > 1 ? steps.slice(1).join(' ') : null,
    };
  }

  if (q) {
    return {
      text: 'Soal ini termasuk ' + q.topic + '. Bacalah semua pilihan, lalu singkirkan yang tidak sesuai dengan pertanyaan.',
      detail: 'Soal ini belum dikerjakan di try out, jadi kunci jawabannya belum ditampilkan. ' +
        'Kerjakan try out atau buka pembahasan hasilmu untuk melihat langkah lengkapnya.',
    };
  }

  return {
    text: 'Aku siap bantu belajar UTBK dan CPNS. Pilih salah satu tombol cepat di bawah, atau tulis pertanyaanmu.',
    detail: 'Contoh pertanyaan: "Jelaskan cara mengerjakan soal Penalaran Matematika", atau buka Tanya AI dari pembahasan soal agar aku bisa membahas soal itu.',
  };
}

function sampleStudyPlan(data) {
  const weakest = (data.weakest || []).filter((t) => t.topic);
  const topics = weakest.length ? weakest.map((t) => t.topic) : TOPICS[data.mode || 'utbk'];
  const pick = (i) => topics[i % topics.length];
  const lines = [
    'Hari 1: Dasar ' + pick(0) + ', 5 soal',
    'Hari 2: Latihan ' + pick(0) + ', 10 soal',
    'Hari 3: Dasar ' + pick(1) + ', 5 soal',
    'Hari 4: Latihan ' + pick(1) + ' dan ulangi ' + pick(0) + ', 10 soal',
    'Hari 5: Dasar ' + pick(2) + ', 5 soal',
    'Hari 6: Latihan campuran ' + pick(0) + ', ' + pick(1) + ', ' + pick(2) + ', 15 soal',
    'Hari 7: Try out penuh, lalu bahas semua jawaban yang salah',
  ];
  return {
    text: lines.join('\n'),
    detail: 'Latihan singkat setiap hari lebih efektif daripada satu sesi panjang. Catat soal yang salah dan ulangi di hari ke-7.',
    sample: true,
  };
}

function bestTkpAnswer(q) {
  let best = null;
  (q.options || []).forEach((o) => {
    if (!best || (q.weights && (q.weights[o.letter] || 0) > (q.weights[best] || 0))) best = o.letter;
  });
  return best;
}

function practiceFromQuestion(q) {
  return {
    prompt: q.prompt,
    options: q.options,
    answer: q.answer || bestTkpAnswer(q) || 'A',
    explanation: (q.explanation || []).join(' '),
  };
}

function samplePractice(topic, mode) {
  const all = QUESTIONS.slice();
  const sameTopic = all.filter((q) => q.topic === topic);
  const sameMode = all.filter((q) => q.mode === (mode === 'cpns' ? 'cpns' : 'utbk'));
  const chosen = [];
  const seen = new Set();
  for (const list of [sameTopic, sameMode, all]) {
    for (const q of list) {
      if (chosen.length === 3) break;
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      chosen.push(q);
    }
  }
  return chosen.slice(0, 3).map(practiceFromQuestion);
}

module.exports = {
  TOPICS,
  askSystem,
  studySystem,
  practiceSystem,
  contextBlock,
  splitShortDetail,
  parsePractice,
  sampleAnswer,
  sampleStudyPlan,
  samplePractice,
  inferIntent,
  truncate,
  labelOf,
};
