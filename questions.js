'use strict';

// The question bank. This file is the only place a question's answer key,
// TKP weights or explanation is authored. The exam routes send questions
// without those fields; only the review route (for the viewer's own attempt)
// returns them, from the snapshot stored at submit.
//
// UTBK: 20 questions, five in each of four subtests, 50 points each, total
// 0 to 1000, passing grade 600. The questions and passages are original
// practice content, not real exam questions.
// CPNS: three questions (TWK, TIU, one TKP), scored 0 to 15, passing 10.

const SUBTESTS = [
  { key: 'pu', name: 'Penalaran Umum' },
  { key: 'pk', name: 'Pengetahuan Kuantitatif' },
  { key: 'lbi', name: 'Literasi Bahasa Indonesia' },
  { key: 'lbe', name: 'Literasi Bahasa Inggris' },
];

// Passages shared by the literacy questions.
const PASSAGES = {
  'lbi-a': {
    id: 'lbi-a',
    title: 'Literasi digital di sekolah',
    text:
      'Kemampuan membaca bukan lagi sekadar mengenali huruf dan kata. Di era digital, pembaca harus menilai apakah informasi yang ditemuinya masuk akal, berasal dari sumber yang dapat dipercaya, dan tidak menyesatkan. Sebuah survei pada 1.200 siswa sekolah menengah menunjukkan bahwa hampir separuh responden membagikan tautan berita tanpa membuka isinya. Mereka mengaku hanya membaca judul yang muncul di media sosial. Temuan ini penting karena judul sering kali dibuat lebih dramatis daripada isi beritanya. Sekolah perlu menjadikan literasi digital bagian dari pembelajaran, bukan kegiatan tambahan yang hanya dilakukan sekali setahun. Dengan begitu, siswa terbiasa memeriksa sumber sebelum mempercayai dan menyebarkan informasi.',
  },
  'lbi-b': {
    id: 'lbi-b',
    title: 'Belajar daring dan kebiasaan membaca',
    text:
      'Selama pembelajaran daring, banyak siswa mengaku lebih sering membaca materi dari layar. Kemudahan mengakses membuat mereka dapat membuka puluhan halaman dalam sehari. Namun, kecepatan itu tidak selalu diikuti pemahaman. Penelitian di sebuah kota menemukan bahwa siswa yang membaca dengan mencatat inti bacaan memperoleh nilai lebih tinggi daripada siswa yang hanya menyorot teks. Peneliti menduga kebiasaan mencatat membantu pembaca menghubungkan gagasan baru dengan pengetahuan yang sudah dimiliki. Karena itu, guru sebaiknya tidak hanya membagikan tautan bacaan, tetapi juga memberi tugas singkat untuk merangkum isinya dengan bahasa sendiri.',
  },
  'lbe-a': {
    id: 'lbe-a',
    title: 'Sleep and learning',
    text:
      'Sleep is not simply a pause in activity. While we sleep, the brain replays and organizes what we learned during the day, moving fragile new memories into more stable storage. Studies of students have found that those who sleep soon after studying remember more a week later than those who stay awake late to review the same material. The effect is strongest for material that requires understanding rather than simple repetition. This does not mean that sleep can replace studying. It means that studying late into the night and cutting sleep is a poor trade: the hours gained are often paid back with weaker recall. For students preparing for an important exam, a regular sleep schedule is therefore part of preparation, not a luxury.',
  },
  'lbe-b': {
    id: 'lbe-b',
    title: 'Remote work',
    text:
      'Remote work was once treated as a temporary arrangement. It is now a normal part of many jobs, and companies are still learning how to manage it. Supporters point out that employees save commuting time and can focus better on tasks that need deep concentration. Critics worry that new employees miss the informal learning that happens when people sit near each other. Most studies suggest that the results depend less on where people work than on how clearly work is organized: teams with written goals and regular check-ins do well in both settings. The debate, then, is not really about offices. It is about the habits a team builds around communication and trust.',
  },
};

const EXAMS = {
  utbk: {
    mode: 'utbk',
    name: 'Try Out UTBK PTN',
    durationMin: 30,
    maxScore: 1000,
    passingGrade: 600,
    subtests: SUBTESTS.map((s) => s.key),
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
  // ── Pengetahuan Kuantitatif ─────────────────────────────────────────────
  {
    id: 'utbk-pk-1',
    mode: 'utbk',
    subtest: 'pk',
    topic: 'Aljabar',
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
      'Kurangkan persamaan pertama: 3p = 9.000, jadi p = 3.000.',
      'Masukkan p ke b + 2p = 11.000: b = 5.000, jawaban C.',
    ],
  },
  {
    id: 'utbk-pk-2',
    mode: 'utbk',
    subtest: 'pk',
    topic: 'Aljabar',
    prompt: 'Jika x + y = 10 dan x - y = 4, berapakah nilai x kali y?',
    options: [
      { letter: 'A', text: '16' },
      { letter: 'B', text: '20' },
      { letter: 'C', text: '21' },
      { letter: 'D', text: '24' },
      { letter: 'E', text: '25' },
    ],
    answer: 'C',
    explanation: [
      'Jumlahkan kedua persamaan: 2x = 14, sehingga x = 7.',
      'Masukkan x ke x + y = 10, sehingga y = 3.',
      'Maka x kali y = 7 kali 3 = 21.',
      'Jawaban yang tepat adalah C.',
    ],
  },
  {
    id: 'utbk-pk-3',
    mode: 'utbk',
    subtest: 'pk',
    topic: 'Barisan dan deret',
    prompt:
      'Perhatikan pola bilangan berikut: 2, 6, 12, 20, 30, ... Bilangan berikutnya adalah...',
    options: [
      { letter: 'A', text: '36' },
      { letter: 'B', text: '40' },
      { letter: 'C', text: '42' },
      { letter: 'D', text: '44' },
      { letter: 'E', text: '48' },
    ],
    answer: 'C',
    explanation: [
      'Lihat selisih antar suku: 4, 6, 8, dan 10.',
      'Selisihnya bertambah 2 setiap langkah.',
      'Selisih berikutnya adalah 12, sehingga 30 + 12 = 42.',
      'Jawaban yang tepat adalah C.',
    ],
  },
  {
    id: 'utbk-pk-4',
    mode: 'utbk',
    subtest: 'pk',
    topic: 'Geometri',
    prompt:
      'Sebuah persegi panjang memiliki keliling 40 cm dan panjang 12 cm. Berapa luas persegi panjang itu?',
    options: [
      { letter: 'A', text: '48 cm2' },
      { letter: 'B', text: '72 cm2' },
      { letter: 'C', text: '96 cm2' },
      { letter: 'D', text: '120 cm2' },
      { letter: 'E', text: '144 cm2' },
    ],
    answer: 'C',
    explanation: [
      'Keliling persegi panjang adalah 2 kali (panjang + lebar).',
      'Maka 40 = 2 kali (12 + lebar), sehingga 12 + lebar = 20.',
      'Lebarnya adalah 8 cm.',
      'Luas = 12 kali 8 = 96 cm2, jawaban C.',
    ],
  },
  {
    id: 'utbk-pk-5',
    mode: 'utbk',
    subtest: 'pk',
    topic: 'Statistika',
    prompt:
      'Rata-rata lima bilangan adalah 7. Empat di antaranya adalah 6, 8, 7, dan 9. Bilangan kelima adalah...',
    options: [
      { letter: 'A', text: '4' },
      { letter: 'B', text: '5' },
      { letter: 'C', text: '6' },
      { letter: 'D', text: '7' },
      { letter: 'E', text: '8' },
    ],
    answer: 'B',
    explanation: [
      'Jumlah lima bilangan adalah 5 kali 7 = 35.',
      'Jumlah empat bilangan yang diketahui: 6 + 8 + 7 + 9 = 30.',
      'Bilangan kelima adalah 35 - 30 = 5.',
      'Jawaban yang tepat adalah B.',
    ],
  },

  // ── Penalaran Umum ──────────────────────────────────────────────────────
  {
    id: 'utbk-pu-1',
    mode: 'utbk',
    subtest: 'pu',
    topic: 'Silogisme',
    prompt:
      'Semua siswa kelas A mengikuti lomba. Semua peserta lomba mendapat sertifikat. Kesimpulan yang pasti benar adalah...',
    options: [
      { letter: 'A', text: 'Semua siswa kelas A mendapat sertifikat.' },
      { letter: 'B', text: 'Semua siswa yang mendapat sertifikat berasal dari kelas A.' },
      { letter: 'C', text: 'Sebagian siswa kelas A tidak mengikuti lomba.' },
      { letter: 'D', text: 'Hanya siswa kelas A yang mendapat sertifikat.' },
      { letter: 'E', text: 'Siswa kelas A mengikuti lebih dari satu lomba.' },
    ],
    answer: 'A',
    explanation: [
      'Pernyataan pertama: siswa kelas A termasuk peserta lomba.',
      'Pernyataan kedua: semua peserta lomba mendapat sertifikat.',
      'Maka semua siswa kelas A mendapat sertifikat (sifat transitif).',
      'Pilihan B membalik arah himpunan, sehingga tidak pasti benar.',
      'Pilihan C, D, dan E tidak didukung kedua pernyataan.',
    ],
  },
  {
    id: 'utbk-pu-2',
    mode: 'utbk',
    subtest: 'pu',
    topic: 'Penalaran deduktif',
    prompt:
      'Jika hujan turun, lapangan menjadi basah. Hari ini lapangan tidak basah. Kesimpulan yang tepat adalah...',
    options: [
      { letter: 'A', text: 'Hari ini tidak hujan.' },
      { letter: 'B', text: 'Hari ini hujan.' },
      { letter: 'C', text: 'Lapangan basah karena disiram.' },
      { letter: 'D', text: 'Hujan turun sebentar.' },
      { letter: 'E', text: 'Tidak dapat disimpulkan apa pun.' },
    ],
    answer: 'A',
    explanation: [
      'Pernyataan berbentuk: jika hujan, maka lapangan basah.',
      'Kontraposisinya: jika lapangan tidak basah, maka tidak hujan.',
      'Hari ini lapangan tidak basah, sehingga berlaku kontraposisi.',
      'Maka hari ini tidak hujan, jawaban A.',
    ],
  },
  {
    id: 'utbk-pu-3',
    mode: 'utbk',
    subtest: 'pu',
    topic: 'Penalaran analitis',
    prompt:
      'Rina lebih tinggi daripada Sinta. Dewi lebih pendek daripada Sinta. Siapa yang paling tinggi di antara mereka?',
    options: [
      { letter: 'A', text: 'Rina' },
      { letter: 'B', text: 'Sinta' },
      { letter: 'C', text: 'Dewi' },
      { letter: 'D', text: 'Sinta dan Dewi' },
      { letter: 'E', text: 'Tidak dapat ditentukan' },
    ],
    answer: 'A',
    explanation: [
      'Rina lebih tinggi daripada Sinta, jadi Rina di atas Sinta.',
      'Dewi lebih pendek daripada Sinta, jadi Dewi di bawah Sinta.',
      'Urutan dari tertinggi: Rina, Sinta, Dewi.',
      'Yang paling tinggi adalah Rina, jawaban A.',
    ],
  },
  {
    id: 'utbk-pu-4',
    mode: 'utbk',
    subtest: 'pu',
    topic: 'Analogi',
    prompt: 'Dokter : rumah sakit = guru : ...',
    options: [
      { letter: 'A', text: 'murid' },
      { letter: 'B', text: 'sekolah' },
      { letter: 'C', text: 'buku' },
      { letter: 'D', text: 'pelajaran' },
      { letter: 'E', text: 'papan tulis' },
    ],
    answer: 'B',
    explanation: [
      'Hubungannya adalah profesi dan tempat bekerja.',
      'Dokter bekerja di rumah sakit.',
      'Guru bekerja di sekolah.',
      'Jawaban yang tepat adalah B.',
    ],
  },
  {
    id: 'utbk-pu-5',
    mode: 'utbk',
    subtest: 'pu',
    topic: 'Silogisme',
    prompt:
      'Semua tanaman di kebun diberi pupuk. Semua tanaman yang diberi pupuk tumbuh subur. Kesimpulan yang pasti benar adalah...',
    options: [
      { letter: 'A', text: 'Semua tanaman di kebun tumbuh subur.' },
      { letter: 'B', text: 'Semua tanaman yang tumbuh subur ada di kebun.' },
      { letter: 'C', text: 'Sebagian tanaman di kebun tidak diberi pupuk.' },
      { letter: 'D', text: 'Pupuk satu-satunya penyebab tanaman subur.' },
      { letter: 'E', text: 'Tanaman di luar kebun tidak diberi pupuk.' },
    ],
    answer: 'A',
    explanation: [
      'Tanaman di kebun termasuk tanaman yang diberi pupuk.',
      'Semua tanaman yang diberi pupuk tumbuh subur.',
      'Maka semua tanaman di kebun tumbuh subur.',
      'Pilihan B membalik arah himpunan dan tidak pasti benar.',
    ],
  },

  // ── Literasi Bahasa Indonesia ───────────────────────────────────────────
  {
    id: 'utbk-lbi-1',
    mode: 'utbk',
    subtest: 'lbi',
    topic: 'Ide pokok',
    passageId: 'lbi-a',
    prompt: 'Ide pokok bacaan di atas adalah...',
    options: [
      { letter: 'A', text: 'Pentingnya literasi digital diajarkan di sekolah.' },
      { letter: 'B', text: 'Survei terhadap 1.200 siswa sekolah menengah.' },
      { letter: 'C', text: 'Cara membuat judul berita yang menarik.' },
      { letter: 'D', text: 'Kebiasaan siswa membuka tautan berita.' },
      { letter: 'E', text: 'Perbedaan media sosial dan media cetak.' },
    ],
    answer: 'A',
    explanation: [
      'Bacaan membuka dengan kemampuan menilai informasi di era digital.',
      'Bagian tengah memaparkan temuan survei sebagai bukti.',
      'Bacaan ditutup dengan saran menjadikan literasi digital bagian pembelajaran.',
      'Jadi ide pokoknya adalah pentingnya literasi digital di sekolah, jawaban A.',
    ],
  },
  {
    id: 'utbk-lbi-2',
    mode: 'utbk',
    subtest: 'lbi',
    topic: 'Simpulan',
    passageId: 'lbi-a',
    prompt: 'Simpulan yang sesuai dengan bacaan adalah...',
    options: [
      { letter: 'A', text: 'Membaca judul saja tidak cukup untuk menilai kebenaran berita.' },
      { letter: 'B', text: 'Semua siswa membagikan berita tanpa membacanya.' },
      { letter: 'C', text: 'Media sosial selalu menyebarkan berita palsu.' },
      { letter: 'D', text: 'Survei membuktikan siswa tidak suka membaca.' },
      { letter: 'E', text: 'Literasi digital cukup diajarkan sekali setahun.' },
    ],
    answer: 'A',
    explanation: [
      'Bacaan menyebut hampir separuh responden hanya membaca judul.',
      'Bacaan juga menyebut judul sering lebih dramatis daripada isinya.',
      'Maka membaca judul saja tidak cukup untuk menilai berita.',
      'Pilihan B, C, D, dan E terlalu umum atau bertentangan dengan teks.',
    ],
  },
  {
    id: 'utbk-lbi-3',
    mode: 'utbk',
    subtest: 'lbi',
    topic: 'Makna kata',
    passageId: 'lbi-a',
    prompt: 'Kata "dramatis" dalam bacaan bermakna...',
    options: [
      { letter: 'A', text: 'dibuat lebih menarik dan berlebihan daripada kenyataan' },
      { letter: 'B', text: 'ditulis dengan bahasa yang sulit dipahami' },
      { letter: 'C', text: 'disampaikan oleh banyak narasumber' },
      { letter: 'D', text: 'diterbitkan oleh media resmi' },
      { letter: 'E', text: 'dibaca oleh banyak orang' },
    ],
    answer: 'A',
    explanation: [
      'Bacaan membandingkan judul dengan isi berita.',
      'Judul disebut lebih dramatis daripada isinya.',
      'Artinya judul dibuat lebih menarik dan berlebihan daripada kenyataan.',
      'Jawaban yang tepat adalah A.',
    ],
  },
  {
    id: 'utbk-lbi-4',
    mode: 'utbk',
    subtest: 'lbi',
    topic: 'Maksud penulis',
    passageId: 'lbi-b',
    prompt: 'Maksud penulis pada bacaan kedua adalah...',
    options: [
      { letter: 'A', text: 'mendorong guru memberi tugas merangkum, bukan hanya membagikan bacaan' },
      { letter: 'B', text: 'melarang siswa membaca materi dari layar' },
      { letter: 'C', text: 'menyatakan bahwa menyorot teks selalu salah' },
      { letter: 'D', text: 'membuktikan pembelajaran daring lebih buruk daripada tatap muka' },
      { letter: 'E', text: 'menjelaskan cara membuat tautan bacaan' },
    ],
    answer: 'A',
    explanation: [
      'Bacaan memaparkan bahwa mencatat inti bacaan berkaitan dengan nilai lebih tinggi.',
      'Kalimat terakhir menyarankan guru memberi tugas merangkum dengan bahasa sendiri.',
      'Itulah maksud penulis: bukan sekadar membagikan tautan.',
      'Pilihan lain tidak didukung bacaan.',
    ],
  },
  {
    id: 'utbk-lbi-5',
    mode: 'utbk',
    subtest: 'lbi',
    topic: 'Fakta atau opini',
    passageId: 'lbi-b',
    prompt: 'Pernyataan berikut yang merupakan opini adalah...',
    options: [
      { letter: 'A', text: 'Kebiasaan mencatat adalah cara terbaik untuk memahami bacaan.' },
      { letter: 'B', text: 'Penelitian dilakukan di sebuah kota.' },
      { letter: 'C', text: 'Siswa dapat membuka puluhan halaman dalam sehari.' },
      { letter: 'D', text: 'Siswa yang mencatat inti bacaan memperoleh nilai lebih tinggi.' },
      { letter: 'E', text: 'Guru membagikan tautan bacaan.' },
    ],
    answer: 'A',
    explanation: [
      'Opini berisi penilaian yang belum tentu benar untuk semua orang.',
      'Pilihan B, C, D, dan E adalah pernyataan yang dapat diperiksa atau dilaporkan.',
      'Kata "cara terbaik" pada pilihan A adalah penilaian.',
      'Jawaban yang tepat adalah A.',
    ],
  },

  // ── Literasi Bahasa Inggris ─────────────────────────────────────────────
  {
    id: 'utbk-lbe-1',
    mode: 'utbk',
    subtest: 'lbe',
    topic: 'Main idea',
    passageId: 'lbe-a',
    prompt: 'What is the main idea of the passage?',
    options: [
      { letter: 'A', text: 'Sleep supports memory, so a regular sleep schedule helps exam preparation.' },
      { letter: 'B', text: 'Students should never study in the evening.' },
      { letter: 'C', text: 'Sleep can replace studying before an exam.' },
      { letter: 'D', text: 'Simple repetition is the best way to remember facts.' },
      { letter: 'E', text: 'The brain stops working while we sleep.' },
    ],
    answer: 'A',
    explanation: [
      'The passage explains that sleep organizes and stabilizes new memories.',
      'It reports that students who sleep soon after studying remember more.',
      'It closes by saying a regular sleep schedule is part of preparation.',
      'Answer A sums this up; the other options overstate or contradict the text.',
    ],
  },
  {
    id: 'utbk-lbe-2',
    mode: 'utbk',
    subtest: 'lbe',
    topic: 'Inference',
    passageId: 'lbe-a',
    prompt: 'What can be inferred from the passage?',
    options: [
      { letter: 'A', text: 'Staying up late to study may reduce how much is remembered.' },
      { letter: 'B', text: 'Sleep is more important than understanding the material.' },
      { letter: 'C', text: 'Students who sleep less always get lower grades.' },
      { letter: 'D', text: 'Reviewing material late at night has no effect at all.' },
      { letter: 'E', text: 'Everyone needs exactly the same amount of sleep.' },
    ],
    answer: 'A',
    explanation: [
      'The passage says studying late and cutting sleep is a poor trade.',
      'It explains that the hours gained are paid back with weaker recall.',
      'So staying up late may reduce what is remembered.',
      'Options B, C, D, and E are stronger claims than the text supports.',
    ],
  },
  {
    id: 'utbk-lbe-3',
    mode: 'utbk',
    subtest: 'lbe',
    topic: 'Vocabulary in context',
    passageId: 'lbe-a',
    prompt: 'The word "fragile" in the passage is closest in meaning to...',
    options: [
      { letter: 'A', text: 'easily lost' },
      { letter: 'B', text: 'carefully written' },
      { letter: 'C', text: 'widely known' },
      { letter: 'D', text: 'slowly repeated' },
      { letter: 'E', text: 'clearly visible' },
    ],
    answer: 'A',
    explanation: [
      'The passage contrasts fragile new memories with more stable storage.',
      'Sleep moves these new memories into stable storage.',
      'So fragile here means easily lost or not yet lasting.',
      'Answer A fits the contrast; the other options do not.',
    ],
  },
  {
    id: 'utbk-lbe-4',
    mode: 'utbk',
    subtest: 'lbe',
    topic: 'Reference',
    passageId: 'lbe-b',
    prompt: 'In the sentence "It is now a normal part of many jobs", the word "It" refers to...',
    options: [
      { letter: 'A', text: 'remote work' },
      { letter: 'B', text: 'a temporary arrangement' },
      { letter: 'C', text: 'commuting time' },
      { letter: 'D', text: 'deep concentration' },
      { letter: 'E', text: 'communication and trust' },
    ],
    answer: 'A',
    explanation: [
      'The previous sentence introduces remote work as a temporary arrangement.',
      'The next sentence says it is now a normal part of many jobs.',
      'The pronoun refers back to remote work.',
      'Answer A is correct.',
    ],
  },
  {
    id: 'utbk-lbe-5',
    mode: 'utbk',
    subtest: 'lbe',
    topic: 'Author purpose',
    passageId: 'lbe-b',
    prompt: "What is the author's main purpose?",
    options: [
      { letter: 'A', text: 'To argue that how work is organized matters more than where it is done.' },
      { letter: 'B', text: 'To explain why offices should be closed.' },
      { letter: 'C', text: 'To prove that remote workers are less productive.' },
      { letter: 'D', text: 'To describe the history of a single company.' },
      { letter: 'E', text: 'To compare salaries in different cities.' },
    ],
    answer: 'A',
    explanation: [
      'The passage presents both support for and criticism of remote work.',
      'It then says results depend on how clearly work is organized.',
      'The last sentence says the debate is about habits of communication and trust.',
      'So the author argues organization matters more than location, answer A.',
    ],
  },

  // ── CAT CPNS (unchanged demo set) ──────────────────────────────────────
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
    prompt:
      'Perhatikan pola bilangan berikut: 2, 6, 12, 20, 30, ... Bilangan berikutnya adalah...',
    options: [
      { letter: 'A', text: '36' },
      { letter: 'B', text: '40' },
      { letter: 'C', text: '42' },
      { letter: 'D', text: '44' },
      { letter: 'E', text: '48' },
    ],
    answer: 'C',
    explanation: [
      'Selisih antar suku adalah 4, 6, 8, dan 10.',
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
      'Pilihan B bernilai 5: menghubungi rekan dan menawarkan bantuan paling konstruktif.',
      'Pilihan C bernilai 3: inisiatif baik, tetapi kurang melibatkan tim.',
      'Pilihan D bernilai 4: melapor itu tepat, tetapi berkomunikasi dulu lebih baik.',
      'Pilihan E bernilai 1: tidak bertanggung jawab.',
    ],
  },
];

// The three UTBK questions the first version shipped. They are never used to
// build an exam again; they exist so an attempt stored before the 20-question
// bank can still be reviewed. Attempts without a snapshot fall back to these.
const LEGACY_QUESTIONS = [
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
      'Tulis 2b + p = 13.000 dan b + 2p = 11.000.',
      'Kalikan persamaan kedua dengan 2: 2b + 4p = 22.000.',
      'Kurangkan persamaan pertama: 3p = 9.000, jadi p = 3.000.',
      'Masukkan p: b = 5.000, jawaban C.',
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
      'Pernyataan berbentuk: jika lulus, maka menerima sertifikat.',
      'Kontraposisinya: jika tidak menerima sertifikat, maka tidak lulus.',
      'Andi tidak menerima sertifikat, jadi Andi tidak lulus, jawaban B.',
    ],
  },
  {
    id: 'utbk-3',
    mode: 'utbk',
    topic: 'Pengetahuan Kuantitatif',
    prompt: 'Jika x + y = 10 dan x - y = 4, berapakah nilai x kali y?',
    options: [
      { letter: 'A', text: '16' },
      { letter: 'B', text: '20' },
      { letter: 'C', text: '21' },
      { letter: 'D', text: '24' },
      { letter: 'E', text: '25' },
    ],
    answer: 'C',
    explanation: [
      'Jumlahkan kedua persamaan: 2x = 14, sehingga x = 7.',
      'Masukkan x: y = 3.',
      'Maka x kali y = 21, jawaban C.',
    ],
  },
];

function subtestName(key) {
  const found = SUBTESTS.find((s) => s.key === key);
  return found ? found.name : key;
}

function passageFor(q) {
  if (!q.passageId || !PASSAGES[q.passageId]) return null;
  const p = PASSAGES[q.passageId];
  return { id: p.id, title: p.title, text: p.text };
}

function questionsFor(mode) {
  return QUESTIONS.filter((q) => q.mode === mode);
}

function legacyQuestionsFor(mode) {
  return mode === 'utbk' ? LEGACY_QUESTIONS : [];
}

// A question as the exam route may send it: no answer, weights or explanation.
function publicQuestion(q) {
  return {
    id: q.id,
    subtest: q.subtest || null,
    subtestName: q.subtest ? subtestName(q.subtest) : null,
    topic: q.topic,
    type: q.type || 'pilihan',
    passage: passageFor(q),
    prompt: q.prompt,
    options: q.options,
  };
}

// Everything the review route may show, taken once at submit.
function questionSnapshot(q) {
  return {
    id: q.id,
    subtest: q.subtest || null,
    subtestName: q.subtest ? subtestName(q.subtest) : null,
    topic: q.topic,
    type: q.type || 'pilihan',
    passage: passageFor(q),
    prompt: q.prompt,
    options: q.options,
    answer: q.answer || null,
    weights: q.weights || null,
    explanation: q.explanation || [],
  };
}

function examMeta(mode) {
  const exam = EXAMS[mode];
  if (!exam) return null;
  const qs = questionsFor(mode);
  const per = exam.subtests
    ? SUBTESTS.map((s) => ({
        key: s.key,
        name: s.name,
        questionCount: qs.filter((q) => q.subtest === s.key).length,
        maxScore: Math.round(
          (qs.filter((q) => q.subtest === s.key).length / qs.length) * exam.maxScore
        ),
      }))
    : [];
  return {
    mode: exam.mode,
    name: exam.name,
    durationMin: exam.durationMin,
    maxScore: exam.maxScore,
    passingGrade: exam.passingGrade,
    questionCount: qs.length,
    subtests: per,
  };
}

function examMetas() {
  return Object.keys(EXAMS).map(examMeta);
}

// Scores one attempt. `answers` maps question id to an option letter; unknown
// ids and letters are ignored, and a blank scores 0.
function score(mode, answers) {
  const exam = EXAMS[mode];
  if (!exam) throw new Error('unknown mode');
  const qs = questionsFor(mode);
  const a = answers && typeof answers === 'object' ? answers : {};
  let raw = 0;
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  const per = new Map();
  for (const q of qs) {
    const key = q.subtest || q.topic;
    if (!per.has(key)) per.set(key, { correct: 0, total: 0, raw: 0 });
    const stat = per.get(key);
    stat.total += 1;
    const letter = typeof a[q.id] === 'string' ? a[q.id].toUpperCase() : null;
    const valid = letter && q.options.some((o) => o.letter === letter);
    if (!valid) {
      blank += 1;
      continue;
    }
    if (mode === 'utbk') {
      if (letter === q.answer) {
        raw += 1;
        correct += 1;
        stat.correct += 1;
        stat.raw += 1;
      } else {
        wrong += 1;
      }
    } else if (q.type === 'tkp') {
      const points = q.weights[letter] || 0;
      raw += points;
      correct += 1;
      stat.correct += 1;
      stat.raw += points;
    } else if (letter === q.answer) {
      raw += 5;
      correct += 1;
      stat.correct += 1;
      stat.raw += 5;
    } else {
      wrong += 1;
    }
  }
  const breakdown = {};
  for (const [key, stat] of per) {
    const max = mode === 'utbk'
      ? Math.round((stat.total / qs.length) * exam.maxScore)
      : stat.total * 5;
    breakdown[key] = {
      key,
      name: mode === 'utbk' ? subtestName(key) : key,
      correct: stat.correct,
      total: stat.total,
      score: mode === 'utbk' ? stat.raw * 50 : stat.raw,
      max,
    };
  }
  const total = mode === 'utbk' ? correct * 50 : raw;
  return {
    score: total,
    maxScore: exam.maxScore,
    passed: total >= exam.passingGrade,
    breakdown,
    correct,
    wrong,
    blank,
  };
}

// A deterministic five-question set for one practice day: one question from
// each subtest, plus one more from a rotating subtest.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function practiceQuestions(day) {
  const picked = [];
  for (const st of SUBTESTS) {
    const pool = QUESTIONS.filter((q) => q.mode === 'utbk' && q.subtest === st.key);
    if (pool.length) picked.push(pool[hashString(day + ':' + st.key) % pool.length]);
  }
  const extraSub = SUBTESTS[hashString(day + ':extra') % SUBTESTS.length].key;
  const extraPool = QUESTIONS.filter((q) => q.mode === 'utbk' && q.subtest === extraSub);
  let extra = extraPool[hashString(day + ':extra:q') % extraPool.length];
  if (picked.some((q) => q.id === extra.id)) {
    const used = new Set(picked.map((q) => q.id));
    extra = extraPool.find((q) => !used.has(q.id)) || extra;
  }
  picked.push(extra);
  return picked.slice(0, 5);
}

module.exports = {
  SUBTESTS,
  PASSAGES,
  EXAMS,
  QUESTIONS,
  LEGACY_QUESTIONS,
  questionsFor,
  legacyQuestionsFor,
  publicQuestion,
  questionSnapshot,
  examMeta,
  examMetas,
  score,
  practiceQuestions,
};
