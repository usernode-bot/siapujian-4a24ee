# SiapUjian

SiapUjian is a practice app for Indonesian entrance exams: timed try outs in
the official CAT layout, for **UTBK PTN** (the national university entrance
test) and **CPNS** (the civil service selection test).

- **Try Out UTBK PTN** takes 30 minutes over three sample questions. A right
  answer scores, a wrong or blank one scores nothing, and the score is scaled
  to 0 to 1000 with a passing grade of 600.
- **Try Out CAT CPNS** takes 45 minutes. TWK and TIU score 5 for a right
  answer and 0 for a wrong one; each TKP option carries a weight from 1 to 5.
  The three questions are worth 15 points, with a passing grade of 10.

The quiz screen copies the official CAT: the question and its options on the
left, a numbered answer rail on the right where each answered tile fills
blue, and a countdown timer. When the time runs out the exam ends by itself.
Afterwards the results screen shows your score against the passing grade,
marks each answer right or wrong (or its TKP points), and gives a
step-by-step explanation of every question. The dashboard keeps your profile
(name, target exam and an optional goal, which you can edit yourself) and
your latest results, newest first.

The six questions are placeholder test content, not real exam questions.

Built on Homeroom: sign-in comes from the platform, data lives in the app's
private Postgres tables, and the look follows the viewer's light or dark
Homeroom theme. See `CLAUDE.md` for the app's own notes.
