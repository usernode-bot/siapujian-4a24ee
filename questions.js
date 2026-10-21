'use strict';

// The sample question bank for this first version: three UTBK questions and
// three CPNS questions (TWK, TIU and one TKP). They are placeholder test
// content, not real exam questions. The scales are sized to the three
// questions: UTBK scores 0 to 1000 with a pass at 600, CPNS scores 0 to 15
// with a pass at 10.

const EXAMS = {
  utbk: {
    mode: 'utbk',
    name: 'Try Out UTBK PTN',
    durationMin: 30,
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
};

const QUESTIONS = [
  {
    id: 'utbk-1',
    mode: 'utbk',
    topic: 'Penalaran Matematika',
    prompt:
      'Harga 2 buku dan 1 pensil Rp13.000. Harga 1 buku dan 2 pensil Rp11.000. Berapa harga 1 buku?',
    options: [
      { letter: 'A', text: 'Rp3.000' },
      { letter: 'B', text: 'Rp4.000' },
      { letter: 'C', text: 'Rp5.000' },
      { letter: 'D', text: 'Rp6.000' },
      { letter: 'E', text: 'Rp7.000' },
    ],
    answer: 'C',
    explanation: [
      'Tulis harga buku sebagai b dan harga pensil sebagai p.',
      'Dari soal: 2b + p = 13.000 dan b + 2p = 11.000.',
      'Kalikan persamaan kedua dengan 2: 2b + 4p = 22.000.',
      'Kurangkan persamaan pertama dari hasilnya: 3p = 9.000, jadi p = 3.000.',
      'Masukkan p ke b + 2p = 11.000: b + 6.000 = 11.000, jadi b = 5.000.',
      'Harga 1 buku adalah Rp5.000, jawaban C.',
    ],
  },
  {
    id: 'utbk-2',
    mode: 'utbk',
    topic: 'Penalaran Umum',
    prompt:
      'Semua siswa yang lulus ujian menerima sertifikat. Andi tidak menerima sertifikat. Kesimpulan yang pasti benar adalah...',
    options: [
      { letter: 'A', text: 'Andi belum mengikuti ujian.' },
      { letter: 'B', text: 'Andi tidak lulus ujian.' },
      { letter: 'C', text: 'Andi lulus ujian tanpa sertifikat.' },
      { letter: 'D', text: 'Semua siswa menerima sertifikat.' },
      { letter: 'E', text: 'Andi akan menerima sertifikat nanti.' },
    ],
    answer: 'B',
    explanation: [
      'Pernyataan pertama berbentuk: jika lulus ujian, maka menerima sertifikat.',
      'Itu sama dengan bentuk: jika tidak menerima sertifikat, maka tidak lulus ujian (kontraposisi).',
      'Andi tidak menerima sertifikat, sehingga berlaku bagian pertama kontraposisi.',
      'Maka Andi tidak lulus ujian, jawaban B.',
      'Pilihan A tidak dapat dipastikan: Andi bisa saja ikut ujian dan tidak lulus.',
    ],
  },
  {
    id: 'utbk-3',
    mode: 'utbk',
    topic: 'Pengetahuan Kuantitatif',
    prompt: 'Jika x + y = 10 dan x − y = 4, berapakah nilai x × y?',
    options: [
      { letter: 'A', text: '16' },
      { letter: 'B', text: '20' },
      { letter: 'C', text: '21' },
      { letter: 'D', text: '24' },
      { letter: 'E', text: '25' },
    ],
    answer: 'C',
    explanation: [
      'Jumlahkan kedua persamaan: (x + y) + (x − y) = 10 + 4.',
      'Hasilnya 2x = 14, sehingga x = 7.',
      'Masukkan x ke x + y = 10: 7 + y = 10, sehingga y = 3.',
      'Maka x × y = 7 × 3 = 21, jawaban C.',
    ],
  },
  {
    id: 'cpns-1',
    mode: 'cpns',
    topic: 'TWK',
    prompt: 'Lambang negara Republik Indonesia adalah...',
    options: [
      { letter: 'A', text: 'Bendera Merah Putih' },
      { letter: 'B', text: 'Garuda Pancasila' },
      { letter: 'C', text: 'Bahasa Indonesia' },
      { letter: 'D', text: 'Lagu Indonesia Raya' },
      { letter: 'E', text: 'Monumen Nasional' },
    ],
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
    options: [
      { letter: 'A', text: '36' },
      { letter: 'B', text: '40' },
      { letter: 'C', text: '42' },
      { letter: 'D', text: '44' },
      { letter: 'E', text: '48' },
    ],
    answer: 'C',
    explanation: [
      'Lihat selisih antar suku: 6 − 2 = 4, 12 − 6 = 6, 20 − 12 = 8, 30 − 20 = 10.',
      'Selisihnya bertambah 2 setiap langkah: 4, 6, 8, 10.',
      'Selisih berikutnya adalah 12, sehingga 30 + 12 = 42.',
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
    options: [
      { letter: 'A', text: 'Menunggu bagian itu datang tanpa melakukan apa pun.' },
      { letter: 'B', text: 'Menghubungi anggota tersebut, menanyakan kendalanya, dan menawarkan bantuan.' },
      { letter: 'C', text: 'Mengerjakan bagiannya sendiri tanpa memberi tahu siapa pun.' },
      { letter: 'D', text: 'Melaporkan anggota tersebut kepada dosen atau atasan.' },
      { letter: 'E', text: 'Mengumpulkan laporan apa adanya dan menyalahkan anggota tersebut.' },
    ],
    weights: { A: 1, B: 5, C: 3, D: 4, E: 1 },
    explanation: [
      'Soal TKP tidak punya jawaban benar atau salah; setiap pilihan bernilai 1 sampai 5.',
      'Pilihan A bernilai 1: menunggu pasif tidak menyelesaikan masalah.',
      'Pilihan B bernilai 5: menghubungi rekan, menanyakan kendala, dan menawarkan bantuan paling konstruktif.',
      'Pilihan C bernilai 3: inisiatif baik, tetapi mengerjakan tanpa memberi tahu kurang melibatkan tim.',
      'Pilihan D bernilai 4: melapor ke penanggung jawab tepat waktu, tetapi setelah mencoba menyelesaikan bersama akan lebih baik.',
      'Pilihan E bernilai 1: mengumpulkan asal jadi dan menyalahkan orang lain tidak bertanggung jawab.',
    ],
  },
];

function questionsFor(mode) {
  return QUESTIONS.filter((q) => q.mode === mode);
}

function publicQuestion(q) {
  return {
    id: q.id,
    topic: q.topic,
    type: q.type || 'pilihan',
    prompt: q.prompt,
    options: q.options,
  };
}

// Scores one attempt. `answers` maps question id to an option letter; unknown
// ids and letters are ignored, and a blank scores 0.
function score(mode, answers) {
  const exam = EXAMS[mode];
  if (!exam) throw new Error('unknown mode');
  const qs = questionsFor(mode);
  const a = answers && typeof answers === 'object' ? answers : {};
  let raw = 0;
  for (const q of qs) {
    const given = typeof a[q.id] === 'string' ? a[q.id].toUpperCase() : null;
    const valid = q.options.some((o) => o.letter === given);
    if (!valid) continue;
    if (mode === 'utbk') {
      if (given === q.answer) raw += 1;
    } else if (q.type === 'tkp') {
      raw += q.weights[given] || 0;
    } else if (given === q.answer) {
      raw += 5;
    }
  }
  let total;
  if (mode === 'utbk') total = Math.round((raw / qs.length) * exam.maxScore);
  else total = raw;
  return {
    score: total,
    maxScore: exam.maxScore,
    passed: total >= exam.passingGrade,
  };
}

module.exports = { EXAMS, QUESTIONS, questionsFor, publicQuestion, score };
