# SiapUjian

SiapUjian is a practice app for Indonesian entrance exams: timed try outs in
the official CAT layout, for **UTBK PTN** (the national university entrance
test) and **CPNS** (the civil service selection test).

- **Try Out UTBK PTN** asks 20 questions across four subtests: Penalaran
  Umum, Pengetahuan Kuantitatif, Literasi Bahasa Indonesia and Literasi
  Bahasa Inggris, five each. A right answer is worth 50 points, a wrong or
  blank one nothing, so the score runs from 0 to 1000 with a passing grade
  of 600.
- **Try Out CAT CPNS** takes 45 minutes over three sample questions. TWK and
  TIU score 5 for a right answer and 0 for a wrong one; each TKP option
  carries a weight from 1 to 5. The three questions are worth 15 points, with
  a passing grade of 10.

The quiz screen copies the official CAT: the question in a card, a numbered
navigator that shows which questions are answered, flagged or still empty, and
a countdown timer. Flag a question with **Tandai soal**; on a phone the
navigator opens as a sheet, on a wide window it sits beside the question. When
the time runs out the exam ends by itself. The result shows the score against
the passing grade, the counts of right, wrong and empty answers, the time used
and a bar for each subtest. **Tinjau jawaban** opens every question with your
answer, the right answer and a step-by-step explanation, filterable by Benar,
Salah, Kosong or Ditandai.

The dashboard keeps your profile (name, target exam, and for UTBK a target
campus, major and score), your daily streak with **Latihan 5 soal**, and your
latest results. **Perkembangan** charts your score history, names your weakest
subtest and lists every try out. **Profil** is where the campus, major and
target score are set.

The 20 UTBK and 3 CPNS questions are original practice content, not real exam
questions. Built on Homeroom: sign-in comes from the platform, data lives in
the app's private Postgres tables, and the look follows the viewer's light or
dark Homeroom theme. See `CLAUDE.md` for the app's own notes.
