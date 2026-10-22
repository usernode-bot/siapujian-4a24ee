# SiapUjian

SiapUjian is a practice app for Indonesian entrance exams: timed try outs in
the official CAT layout, for **UTBK PTN** (the national university entrance
test) and **CPNS** (the civil service selection test).

- **Try Out UTBK PTN** takes 40 minutes over 20 sample questions in four
  subtests (Penalaran Umum, Pengetahuan Kuantitatif, Literasi Bahasa Indonesia,
  Literasi Bahasa Inggris), five each. A right answer is worth 50 points, a
  wrong or blank one nothing, and the total runs from 0 to 1000 with a passing
  grade of 600.
- **Try Out CAT CPNS** takes 45 minutes. TWK and TIU score 5 for a right
  answer and 0 for a wrong one; each TKP option carries a weight from 1 to 5.
  The three questions are worth 15 points, with a passing grade of 10.

The quiz screen copies the official CAT: the question and its options, a
countdown timer, and a "Lembar jawaban" answer sheet grouped by subtest where
each answered tile fills indigo and a Ragu-ragu button marks the open question
in amber. When the time runs out the exam ends by itself. The results screen
shows the score against the passing grade, the Benar, Salah and Kosong counts,
the time used, a bar for each subtest and the coloured answer sheet.
"Lihat pembahasan" opens every question with your answer, the right answer and
a short explanation.

**Tanya AI** helps you understand a question. A floating button on the
dashboard opens a chat, and every question in Review mode has a "Tanya AI"
button that attaches the question, your answer and the correct answer.
Quick chips explain the answer, give a shortcut, generate three practice
questions with hidden answers, or build a 7-day study plan from your weakest
subtopics. Each person gets 10 questions a day, and past conversations are
kept in "Penjelasan tersimpan".


**Progres** charts the last ten UTBK scores against the 600 line, marks the
weakest subtest from every question answered, and lists every finished try out
and Latihan harian. The dashboard's **Latihan harian** card offers five UTBK
questions in ten minutes, changing every day, with a streak counter: a day
counts when at least one try out or Latihan harian is finished (days run on
WIB). The profile keeps your name, target exam, and for UTBK a free-text
target campus, major and score, with a line showing how far the latest score
is from the target.

The 20 UTBK questions, 3 CPNS questions and their explanations are placeholder
practice content, not real exam questions.

The 20 UTBK and 3 CPNS questions are original practice content, not real exam
questions. Built on Homeroom: sign-in comes from the platform, data lives in
the app's private Postgres tables, and the look follows the viewer's light or
dark Homeroom theme. See `CLAUDE.md` for the app's own notes.
