'use strict';

// The question bank: 20 UTBK questions in four subtests (5 each), three CPNS
// questions (TWK, TIU and one TKP), and the daily set drawn from the UTBK
// bank. These are sample practice questions written for this app, not real
// exam questions. The old three UTBK questions stay with `retired: true` so
// attempts taken before the 20-question bank still open and review.

const SUBTESTS = [
  'Penalaran Umum',
  'Pengetahuan Kuantitatif',
  'Literasi Bahasa Indonesia',
  'Literasi Bahasa Inggris',
];

const EXAMS = {
  utbk: {
    mode: 'utbk',
    name: 'Try Out UTBK PTN',
    durationMin: 40,
    maxScore: 1000,
    passingGrade: 600,
  },
  cpns: {
    mode: 'cpns',
    name: 'Try Out CAT CPNS',
    durationMin: 45,
    maxScore: 15,
    passingGrade: 10,
  },
  // The Daily 5 quick practice: five UTBK questions in ten minutes, scored
  // right answers out of five. It has no pass line anyone is shown.
  daily: {
    mode: 'daily',
    name: 'Latihan harian',
    durationMin: 10,
    maxScore: 5,
    passingGrade: 3,
  },
};

const LEGACY_IDS = { utbk: ['utbk-1', 'utbk-2', 'utbk-3'] };

const opt = (a, b, c, d, e) => [
  { letter: 'A', text: a },
  { letter: 'B', text: b },
  { letter: 'C', text: c },
  { letter: 'D', text: d },
  { letter: 'E', text: e },
];

const PASSAGE_LBI =
  'Setiap pagi, Rani berjalan kaki ke sekolah meskipun jaraknya hampir tiga kilometer. ' +
  'Ia menolak tawaran ayahnya untuk diantar motor karena ingin menikmati udara pagi dan ' +
  'mendengar suara burung di sepanjang jalan. Kebiasaan itu juga membuatnya lebih siap ' +
  'mengikuti pelajaran pertama, yang menurutnya paling sulit.';

const PASSAGE_LBE =
  'Many students believe that studying longer means learning more. Research on memory ' +
  'suggests otherwise: after about an hour of intense focus, attention drops sharply, ' +
  'and the last pages read are remembered far worse than the first. Short sessions with ' +
  'deliberate breaks, spread over several days, tend to produce stronger recall than one ' +
  'long night of reading.';

const UTBK = [
  // ── Penalaran Umum ───────────────────────────────────────────────────
  {
    id: 'utbk-pu-1',
    topic: 'Penalaran Umum',
    prompt:
      'Semua siswa yang lulus ujian menerima sertifikat. Andi tidak menerima sertifikat. Kesimpulan yang pasti benar adalah...',
    options: opt('Andi belum mengikuti ujian.', 'Andi tidak lulus ujian.', 'Andi lulus ujian tanpa sertifikat.', 'Semua siswa menerima sertifikat.', 'Andi akan menerima sertifikat nanti.'),
    answer: 'B',
    explanation: [
      'Pernyataan itu berbentuk: jika lulus ujian, maka menerima sertifikat.',
      'Kontraposisinya: jika tidak menerima sertifikat, maka tidak lulus ujian.',
      'Andi tidak menerima sertifikat, jadi Andi tidak lulus ujian (jawaban B).',
    ],
  },
  {
    id: 'utbk-pu-2',
    topic: 'Penalaran Umum',
    prompt:
      'Sebuah kafe hanya memakai kopi lokal. Semua kopi lokal dipanen dari kebun di dataran tinggi. Manakah kesimpulan yang pasti benar?',
    options: opt('Semua kopi di dataran tinggi dipanen oleh kafe itu.', 'Kafe itu tidak memakai kopi dari luar negeri.', 'Semua kopi di dataran tinggi dipakai kafe itu.', 'Kopi lokal tidak bisa ditanam di dataran rendah.', 'Kafe itu menanam kopinya sendiri.'),
    answer: 'B',
    explanation: [
      'Kopi lokal adalah bagian dari kopi yang bukan dari luar negeri.',
      'Kafe hanya memakai kopi lokal, jadi kafe tidak memakai kopi impor sama sekali.',
      'Pilihan lain membalik arah pernyataan (A dan C) atau menambah informasi yang tidak ada (D, E).',
    ],
  },
  {
    id: 'utbk-pu-3',
    topic: 'Penalaran Umum',
    prompt:
      'Jika hujan turun, jalan menjadi licin. Jika jalan licin, perjalanan menjadi lambat. Hari ini perjalanan tidak lambat. Kesimpulan yang tepat adalah...',
    options: opt('Hari ini hujan turun.', 'Hari ini tidak hujan.', 'Jalan hari ini licin.', 'Perjalanan hari ini cepat karena hujan berhenti.', 'Tidak dapat disimpulkan apa pun.'),
    answer: 'B',
    explanation: [
      'Rantai pernyataannya: hujan → licin → lambat.',
      'Perjalanan tidak lambat, jadi jalan tidak licin (kontraposisi langkah kedua).',
      'Jalan tidak licin, jadi tidak hujan (kontraposisi langkah pertama), jawaban B.',
    ],
  },
  {
    id: 'utbk-pu-4',
    topic: 'Penalaran Umum',
    prompt:
      'Pada sebuah survei, 60 persen responden memilih olahraga lari dan 35 persen memilih bersepeda. Tidak ada yang memilih keduanya. Berapa persen yang tidak memilih keduanya?',
    options: opt('5 persen', '15 persen', '25 persen', '35 persen', '40 persen'),
    answer: 'A',
    explanation: [
      'Karena tidak ada irisan, jumlahkan saja: 60 + 35 = 95 persen.',
      'Sisanya tidak memilih keduanya: 100 − 95 = 5 persen, jawaban A.',
    ],
  },
  {
    id: 'utbk-pu-5',
    topic: 'Penalaran Umum',
    prompt:
      'Rina lebih tinggi dari Dewi. Sari lebih tinggi dari Rina. Dewi lebih tinggi dari Tia. Siapa yang paling pendek?',
    options: opt('Rina', 'Dewi', 'Sari', 'Tia', 'Tidak bisa ditentukan'),
    answer: 'D',
    explanation: [
      'Urutkan dari yang tertinggi: Sari > Rina > Dewi.',
      'Dewi lebih tinggi dari Tia, jadi Tia ada di bawah Dewi.',
      'Jadi urutan lengkapnya Sari, Rina, Dewi, Tia; yang paling pendek Tia (jawaban D).',
    ],
  },

  // ── Pengetahuan Kuantitatif ──────────────────────────────────────────
  {
    id: 'utbk-pk-1',
    topic: 'Pengetahuan Kuantitatif',
    prompt: 'Jika x + y = 10 dan x − y = 4, berapakah nilai x × y?',
    options: opt('16', '20', '21', '24', '25'),
    answer: 'C',
    explanation: [
      'Jumlahkan kedua persamaan: 2x = 14, sehingga x = 7.',
      'Masukkan ke x + y = 10: y = 3.',
      'Maka x × y = 7 × 3 = 21, jawaban C.',
    ],
  },
  {
    id: 'utbk-pk-2',
    topic: 'Pengetahuan Kuantitatif',
    prompt:
      'Rata-rata 4 bilangan adalah 15. Jika satu bilangan, 21, dikeluarkan, berapa rata-rata 3 bilangan sisanya?',
    options: opt('11', '12', '13', '14', '15'),
    answer: 'C',
    explanation: [
      'Jumlah keempat bilangan: 4 × 15 = 60.',
      'Setelah 21 dikeluarkan: 60 − 21 = 39.',
      'Rata-rata tiga bilangan: 39 : 3 = 13, jawaban C.',
    ],
  },
  {
    id: 'utbk-pk-3',
    topic: 'Pengetahuan Kuantitatif',
    prompt: 'Sebuah barang dijual Rp120.000 setelah mendapat diskon 25 persen. Berapa harga awal barang itu?',
    options: opt('Rp150.000', 'Rp155.000', 'Rp160.000', 'Rp165.000', 'Rp180.000'),
    answer: 'C',
    explanation: [
      'Harga setelah diskon adalah 75 persen dari harga awal.',
      'Harga awal = 120.000 : 0,75 = 160.000.',
      'Jawaban C.',
    ],
  },
  {
    id: 'utbk-pk-4',
    topic: 'Pengetahuan Kuantitatif',
    prompt: 'Perhatikan pola: 3, 6, 11, 18, 27, ... Bilangan berikutnya adalah...',
    options: opt('36', '38', '39', '40', '42'),
    answer: 'B',
    explanation: [
      'Selisih antar suku: 3, 5, 7, 9, naik 2 setiap langkah.',
      'Selisih berikutnya 11, sehingga 27 + 11 = 38.',
      'Jawaban B.',
    ],
  },
  {
    id: 'utbk-pk-5',
    topic: 'Pengetahuan Kuantitatif',
    prompt:
      'Sebuah tangki terisi penuh dalam 6 jam oleh pipa A dan dalam 12 jam oleh pipa B. Jika keduanya dibuka bersama, berapa jam tangki terisi penuh?',
    options: opt('2 jam', '3 jam', '4 jam', '5 jam', '6 jam'),
    answer: 'C',
    explanation: [
      'Pipa A mengisi 1/6 tangki per jam, pipa B 1/12 tangki per jam.',
      'Bersama: 1/6 + 1/12 = 3/12 = 1/4 tangki per jam.',
      'Maka tangki penuh dalam 4 jam, jawaban C.',
    ],
  },

  // ── Literasi Bahasa Indonesia ────────────────────────────────────────
  {
    id: 'utbk-lbi-1',
    topic: 'Literasi Bahasa Indonesia',
    passage: PASSAGE_LBI,
    prompt: 'Alasan utama Rani menolak diantar motor adalah...',
    options: opt('jarak sekolahnya sangat dekat', 'ia ingin menikmati udara pagi dan suara burung', 'ayahnya tidak punya waktu', 'ia ingin berolahraga agar langsing', 'ia tidak suka naik motor'),
    answer: 'B',
    explanation: [
      'Bacaan menyebut Rani menolak diantar karena ingin menikmati udara pagi dan mendengar suara burung.',
      'Jarak sekolah justru jauh (hampir tiga kilometer), jadi A salah.',
      'Jawaban B sesuai dengan teks.',
    ],
  },
  {
    id: 'utbk-lbi-2',
    topic: 'Literasi Bahasa Indonesia',
    passage: PASSAGE_LBI,
    prompt: 'Menurut Rani, pelajaran pada jam pertama terasa lebih mudah diikuti karena...',
    options: opt('gurunya selalu datang lebih awal', 'ia sudah berjalan kaki sehingga lebih siap', 'ia belajar lebih dulu di rumah', 'kelasnya lebih sepi pada pagi hari', 'ia selalu sarapan sebelum berangkat'),
    answer: 'B',
    explanation: [
      'Teks menyebut kebiasaan berjalan kaki membuat Rani lebih siap mengikuti pelajaran pertama.',
      'Tidak ada keterangan tentang guru, belajar di rumah, atau sarapan.',
      'Jawaban B.',
    ],
  },
  {
    id: 'utbk-lbi-3',
    topic: 'Literasi Bahasa Indonesia',
    passage: PASSAGE_LBI,
    prompt: 'Kata "kebiasaan" dalam bacaan merujuk pada...',
    options: opt('menolak tawaran ayah', 'berjalan kaki ke sekolah setiap pagi', 'mendengar suara burung', 'mengikuti pelajaran pertama', 'bersekolah hampir tiga kilometer'),
    answer: 'B',
    explanation: [
      '"Kebiasaan itu" melanjutkan kalimat sebelumnya, yaitu berjalan kaki ke sekolah setiap pagi.',
      'Pilihan lain adalah bagian dari kebiasaan atau keterangan jarak, bukan kebiasaannya sendiri.',
      'Jawaban B.',
    ],
  },
  {
    id: 'utbk-lbi-4',
    topic: 'Literasi Bahasa Indonesia',
    passage: PASSAGE_LBI,
    prompt: 'Simpulan yang paling tepat tentang Rani adalah...',
    options: opt('ia lebih suka berolahraga daripada belajar', 'ia menghargai ketenangan pagi dan menjaga kebugaran', 'ia tidak senang diberi perhatian oleh ayahnya', 'ia ingin hemat biaya transportasi', 'ia takut terlambat bila diantar motor'),
    answer: 'B',
    explanation: [
      'Rani memilih berjalan kaki demi udara pagi dan suara burung, dan merasa lebih siap belajar.',
      'Itu menunjukkan ia menghargai ketenangan pagi dan menjaga kebugaran.',
      'Pilihan lain tidak didukung teks, jadi jawaban B.',
    ],
  },
  {
    id: 'utbk-lbi-5',
    topic: 'Literasi Bahasa Indonesia',
    passage: PASSAGE_LBI,
    prompt: 'Penulisan kata baku yang benar adalah...',
    options: opt('apotik', 'izin', 'praktek', 'analisa', 'resiko'),
    answer: 'B',
    explanation: [
      'Bentuk baku menurut KBBI: apotek, izin, praktik, analisis, risiko.',
      'Yang benar pada pilihan adalah "izin".',
      'Jawaban B.',
    ],
  },

  // ── Literasi Bahasa Inggris ──────────────────────────────────────────
  {
    id: 'utbk-lbe-1',
    topic: 'Literasi Bahasa Inggris',
    passage: PASSAGE_LBE,
    prompt: 'What is the main idea of the passage?',
    options: opt('Studying at night is better than studying in the morning.', 'Spreading shorter study sessions seems to improve recall.', 'Memory research is unreliable.', 'Students should never read for more than an hour.', 'Long reading sessions always work best.'),
    answer: 'B',
    explanation: [
      'The passage contrasts long sessions with "short sessions with deliberate breaks" that "tend to produce stronger recall".',
      'That is its main idea, so B.',
      'The other choices either contradict the text or exaggerate it.',
    ],
  },
  {
    id: 'utbk-lbe-2',
    topic: 'Literasi Bahasa Inggris',
    passage: PASSAGE_LBE,
    prompt: 'According to the passage, what happens after about an hour of intense focus?',
    options: opt('Students remember everything they read.', 'Attention drops sharply.', 'Reading becomes faster.', 'Memory improves with each page.', 'Students stop taking breaks.'),
    answer: 'B',
    explanation: [
      'The text says that "after about an hour of intense focus, attention drops sharply".',
      'So answer B follows the passage directly.',
    ],
  },
  {
    id: 'utbk-lbe-3',
    topic: 'Literasi Bahasa Inggris',
    passage: PASSAGE_LBE,
    prompt: 'The word "recall" in the last sentence is closest in meaning to...',
    options: opt('remembering', 'repeating', 'reading', 'writing', 'forgetting'),
    answer: 'A',
    explanation: [
      '"Recall" means the ability to remember something.',
      'The passage talks about how well material is remembered.',
      'Answer A.',
    ],
  },
  {
    id: 'utbk-lbe-4',
    topic: 'Literasi Bahasa Inggris',
    passage: PASSAGE_LBE,
    prompt: 'The passage suggests that one long night of reading is...',
    options: opt('the most effective way to study', 'less effective than several short sessions', 'useful only for short texts', 'better for students with strong memory', 'what researchers recommend'),
    answer: 'B',
    explanation: [
      'The last sentence says short sessions spread over several days "tend to produce stronger recall than one long night of reading".',
      'So one long night is less effective, answer B.',
    ],
  },
  {
    id: 'utbk-lbe-5',
    topic: 'Literasi Bahasa Inggris',
    prompt: 'Choose the sentence with correct grammar.',
    options: opt('She go to school every day.', 'They is studying for the exam.', 'He has finished his homework.', 'The students was late yesterday.', 'I am agree with you.'),
    answer: 'C',
    explanation: [
      'C uses the present perfect correctly: "He has finished".',
      'A needs "goes", B needs "are", D needs "were", and E needs "I agree".',
      'Answer C.',
    ],
  },
];

// The old three-question UTBK set, kept so earlier attempts still review.
const LEGACY = [
  {
    id: 'utbk-1',
    mode: 'utbk',
    retired: true,
    topic: 'Penalaran Matematika',
    prompt:
      'Harga 2 buku dan 1 pensil Rp13.000. Harga 1 buku dan 2 pensil Rp11.000. Berapa harga 1 buku?',
    options: opt('Rp3.000', 'Rp4.000', 'Rp5.000', 'Rp6.000', 'Rp7.000'),
    answer: 'C',
    explanation: [
      'Tulis harga buku b dan pensil p: 2b + p = 13.000 dan b + 2p = 11.000.',
      'Kalikan persamaan kedua dengan 2: 2b + 4p = 22.000.',
      'Kurangkan: 3p = 9.000, jadi p = 3.000.',
      'Masukkan: b + 6.000 = 11.000, jadi b = 5.000 (jawaban C).',
    ],
  },
  {
    id: 'utbk-2',
    mode: 'utbk',
    retired: true,
    topic: 'Penalaran Umum',
    prompt:
      'Semua siswa yang lulus ujian menerima sertifikat. Andi tidak menerima sertifikat. Kesimpulan yang pasti benar adalah...',
    options: opt('Andi belum mengikuti ujian.', 'Andi tidak lulus ujian.', 'Andi lulus ujian tanpa sertifikat.', 'Semua siswa menerima sertifikat.', 'Andi akan menerima sertifikat nanti.'),
    answer: 'B',
    explanation: [
      'Jika lulus, maka menerima sertifikat.',
      'Kontraposisinya: jika tidak menerima sertifikat, maka tidak lulus.',
      'Andi tidak menerima sertifikat, jadi Andi tidak lulus (jawaban B).',
    ],
  },
  {
    id: 'utbk-3',
    mode: 'utbk',
    retired: true,
    topic: 'Pengetahuan Kuantitatif',
    prompt: 'Jika x + y = 10 dan x − y = 4, berapakah nilai x × y?',
    options: opt('16', '20', '21', '24', '25'),
    answer: 'C',
    explanation: [
      'Jumlahkan: 2x = 14, jadi x = 7.',
      'Maka y = 3.',
      'x × y = 21, jawaban C.',
    ],
  },
];

const CPNS = [
  {
    id: 'cpns-1',
    mode: 'cpns',
    topic: 'TWK',
    prompt: 'Lambang negara Republik Indonesia adalah...',
    options: opt('Bendera Merah Putih', 'Garuda Pancasila', 'Bahasa Indonesia', 'Lagu Indonesia Raya', 'Monumen Nasional'),
    answer: 'B',
    explanation: [
      'Lambang negara Indonesia adalah Garuda Pancasila.',
      'Bendera Merah Putih adalah bendera negara, bukan lambang negara.',
      'Bahasa Indonesia adalah bahasa negara, dan Indonesia Raya adalah lagu kebangsaan.',
      'Jawaban yang tepat adalah B.',
    ],
  },
  {
    id: 'cpns-2',
    mode: 'cpns',
    topic: 'TIU',
    prompt: 'Perhatikan pola bilangan berikut: 2, 6, 12, 20, 30, ... Bilangan berikutnya adalah...',
    options: opt('36', '40', '42', '44', '48'),
    answer: 'C',
    explanation: [
      'Selisih antar suku: 4, 6, 8, 10, naik 2 setiap langkah.',
      'Selisih berikutnya 12, sehingga 30 + 12 = 42.',
      'Jawaban yang tepat adalah C.',
    ],
  },
  {
    id: 'cpns-3',
    mode: 'cpns',
    topic: 'TKP',
    type: 'tkp',
    prompt:
      'Kamu ditugaskan menyelesaikan laporan kelompok yang harus dikumpulkan besok pagi, tetapi salah satu anggota belum mengirim bagiannya. Apa yang kamu lakukan?',
    options: opt('Menunggu bagian itu datang tanpa melakukan apa pun.', 'Menghubungi anggota tersebut, menanyakan kendalanya, dan menawarkan bantuan.', 'Mengerjakan bagiannya sendiri tanpa memberi tahu siapa pun.', 'Melaporkan anggota tersebut kepada dosen atau atasan.', 'Mengumpulkan laporan apa adanya dan menyalahkan anggota tersebut.'),
    weights: { A: 1, B: 5, C: 3, D: 4, E: 1 },
    explanation: [
      'Soal TKP tidak punya jawaban benar atau salah; setiap pilihan bernilai 1 sampai 5.',
      'A bernilai 1: menunggu pasif tidak menyelesaikan masalah.',
      'B bernilai 5: menghubungi rekan, menanyakan kendala, dan menawarkan bantuan paling konstruktif.',
      'C bernilai 3: inisiatif baik, tetapi mengerjakan tanpa memberi tahu kurang melibatkan tim.',
      'D bernilai 4: melapor ke penanggung jawab tepat waktu, tetapi setelah mencoba menyelesaikan bersama akan lebih baik.',
      'E bernilai 1: mengumpulkan asal jadi dan menyalahkan orang lain tidak bertanggung jawab.',
    ],
  },
];

const QUESTIONS = UTBK.map((q) => ({ ...q, mode: 'utbk' }))
  .concat(LEGACY)
  .concat(CPNS);

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

function questionsFor(mode) {
  return QUESTIONS.filter((q) => q.mode === mode && !q.retired);
}

function byId(id) {
  return BY_ID.get(id) || null;
}

// The daily set interleaves the bank PU1, PK1, LBI1, LBE1, PU2, ... and takes
// five in a row, so every day covers all four subtests and the set cycles
// every four days.
const DAILY_ORDER = [0, 5, 10, 15, 1, 6, 11, 16, 2, 7, 12, 17, 3, 8, 13, 18, 4, 9, 14, 19]
  .map((i) => UTBK[i].id);

// The calendar day in Jakarta (WIB), as YYYY-MM-DD.
const WIB_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
});
function wibDay(date) {
  return WIB_DAY.format(date instanceof Date ? date : new Date(date));
}

function dailyIds(day) {
  const k = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
  const out = [];
  for (let i = 0; i < 5; i++) out.push(DAILY_ORDER[(((k * 5 + i) % 20) + 20) % 20]);
  return out;
}

function publicQuestion(q) {
  const out = {
    id: q.id,
    topic: q.topic,
    type: q.type || 'pilihan',
    prompt: q.prompt,
    options: q.options,
  };
  if (q.passage) out.passage = q.passage;
  return out;
}

// Scores one attempt over the given question ids (or the mode's whole set
// when `ids` is empty). `answers` maps question id to an option letter;
// unknown ids and letters are ignored, and a blank scores 0.
function score(mode, answers, ids) {
  const exam = EXAMS[mode];
  if (!exam) throw new Error('unknown mode');
  let qs;
  if (Array.isArray(ids) && ids.length) {
    qs = ids.map(byId).filter(Boolean);
  } else {
    qs = questionsFor(mode);
  }
  const a = answers && typeof answers === 'object' ? answers : {};
  let raw = 0;
  let correct = 0;
  let wrong = 0;
  let empty = 0;
  const groups = new Map();
  for (const q of qs) {
    const given = typeof a[q.id] === 'string' ? a[q.id].toUpperCase() : null;
    const valid = q.options.some((o) => o.letter === given);
    const isTkp = q.type === 'tkp';
    let right = false;
    if (!valid) {
      empty += 1;
    } else if (isTkp) {
      raw += q.weights[given] || 0;
    } else if (given === q.answer) {
      right = true;
      correct += 1;
      raw += mode === 'utbk' || mode === 'daily' ? 1 : 5;
    } else {
      wrong += 1;
    }
    if (!q.retired && SUBTESTS.indexOf(q.topic) >= 0) {
      const g = groups.get(q.topic) || { name: q.topic, correct: 0, total: 0 };
      g.total += 1;
      if (right) g.correct += 1;
      groups.set(q.topic, g);
    }
  }
  let total;
  if (mode === 'utbk') total = qs.length ? Math.round((raw / qs.length) * exam.maxScore) : 0;
  else total = raw;
  const subtests = SUBTESTS.filter((n) => groups.has(n)).map((name) => {
    const g = groups.get(name);
    return {
      name,
      correct: g.correct,
      total: g.total,
      score: Math.round((g.correct / g.total) * exam.maxScore),
    };
  });
  return {
    score: total,
    maxScore: exam.maxScore,
    passed: total >= exam.passingGrade,
    correct,
    wrong,
    empty,
    subtests,
  };
}

module.exports = {
  EXAMS,
  QUESTIONS,
  SUBTESTS,
  LEGACY_IDS,
  questionsFor,
  byId,
  publicQuestion,
  score,
  wibDay,
  dailyIds,
};
