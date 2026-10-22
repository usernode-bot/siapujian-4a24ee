# SiapUjian — notes for Claude Code

This app runs on **Homeroom**. The platform conventions are the single
source of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.):

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

**Inside Homeroom** (its dev chat, and Homeroom bot's builds), do not
fetch that URL: what applies to your change is already in your
instructions, and the `homeroom` MCP server's
`get_platform_conventions` reads any one section of the conventions
when you need it. The two sections below are for working outside
Homeroom; skip them there.

**Anywhere else** (Claude Code run against this repo locally, or another
harness), fetch it at the start of each session. The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

## Connector permission prompts (outside Homeroom)

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) once you accept the workspace trust dialog.
See `.claude/README.md` for the whole story, including what to do if you
are still being prompted.

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. This matters before you **read** code to answer
a question about how the app behaves now, not only before you edit it.

The canonical repository is named in `.claude/homeroom-canonical-repo`. Check against
it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`,
`git grep <pattern> FETCH_HEAD`). To change code, start from the exact base
commit your Homeroom work order gives, and never merge or rebase onto the
canonical `main` yourself: which commit a change is diffed against decides
what the group votes on. With the Homeroom connector, `get_checkout_status`
answers the same question.

A session-start hook (`.claude/hooks/homeroom-freshness.sh`, see `.claude/README.md`) runs
this check for you and tells you when you are behind. It is silent offline, so
its silence is not proof the checkout is current. Inside Homeroom (its dev
chat, and Homeroom bot's builds) the platform fixes the base commit, and none
of this applies.

## Starter template

The screen this app currently ships — the "Starter template" hero with
the app's thumbnail tile and the plain-English note on how the app gets
built (by asking Homeroom bot) — is placeholder content from the
Homeroom starter template, not product intent.

When the user asks for their first real feature, REPLACE the template
screen rather than building alongside it:

- remove the `usernode-starter-notice@1` block in `public/index.html`
  (both sentinel comments and everything between them),
- rewrite `README.md` to describe the actual app.

Keep the `usernode-dev-console@1` forwarder `<script>` when rewriting the
HTML — that block is platform infrastructure, not template content. So is
the bridge `<script>`. The design kit is not placeholder either: build the
real app with it, and fill in "## Design" below.

The screen has a light and a dark look and follows the viewer's Homeroom
theme, switching live when they change it: the theme `<script>` right after
the bridge tag sets a `dark` class on `<html>`. Keep that script, and give
everything you build both looks (the design kit's colour tokens carry both), unless one
fixed look is the point of this app, like a game's own scene; then say so
under "## Design" below. Unless a request asks for one, add
no theme picker: the viewer's Homeroom setting is the control. "The
platform's light/dark theme inside the app frame" in the platform
conventions has the details.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About SiapUjian

Practise UTBK and CPNS exams like the real thing.

A timed try-out app for Indonesian entrance exams. One dashboard shows the
person's profile (name, target exam, campus and major for UTBK, target
score), the daily streak and two modes, Try Out UTBK PTN and Try Out CAT
CPNS. Try Out UTBK PTN asks 20 questions across four subtests (Penalaran
Umum, Pengetahuan Kuantitatif, Literasi Bahasa Indonesia, Literasi Bahasa
Inggris), five each, 50 points per correct answer, a total of 1000 with a
passing grade of 600. Each mode opens a CAT-style quiz: question and options
in a card, a numbered navigator that shows answered, flagged and empty
questions, a countdown timer that ends the exam by itself at zero. The
result shows the score against the passing grade, the counts of right,
wrong and empty answers, the time used and a bar per subtest; a separate
Tinjau jawaban page explains every question. Perkembangan charts the score
history and names the weakest subtest, and a daily Latihan 5 soal keeps the
streak. The 20 UTBK and 3 CPNS questions live in `questions.js` and are
original practice content, not real exam questions.

## Your people's data

`usernode-user-data.js` erases a person's rows when they delete their
Homeroom account, and exports them when they ask for a copy. By default it
covers every table with a `user_id` (or `usernode_pubkey`) column. When
you add a table that keys a person's rows another way (`author_id`), add it
to `OWNED_BY`; when a table's `user_id` is not the person the row is
about, add it to `SKIP`. Keep the file and its mount in `server.js`.

## Design

This app's look. The first real version fills in the blanks; every later
change follows it, and updates it when a request changes the look on purpose.

- **Palette:** a clean slate ground with white surfaces (ground, surface,
  raised, fg, muted, line); accent: indigo running to blue in the primary
  gradient (`--accent` to `--accent-to`), with warm amber as the second
  accent (`--warm`, `--warm-soft`, `--warm-ink`: the role badge and the
  blooms behind the home screen); right: green, for a marked right answer;
  wrong: red, for a marked wrong answer and for danger. The two mode cards
  have their own gradient tokens (`--mode-utbk-from/-to`,
  `--mode-cpns-from/-to`) and the "Lulus" / "Belum lulus" badges their
  tints (`--pass-*`, `--fail-*`). Every token has a light and a dark value
  in `styles/tailwind-input.css`.
- **Home screen:** generous spacing; cards at 20 px radius with a thin
  border and a soft shadow; two faint colour blooms behind the whole page;
  the mode cards' information pills are frosted light chips carrying the
  card's own colour, because white-on-tint text would fall under 4.5:1.
  Cards lift on hover and the mode cards scale to 1.02 (not under
  reduced motion). Under the profile card sits the warm streak strip
  ("Beruntun N hari" and **Latihan 5 soal**); the profile card names the
  target campus and major with the gap to the latest UTBK score.
- **Signature element:** the answer rail. Small rounded number tiles that
  fill indigo once the question is answered and take an amber ring when
  flagged, like an exam answer sheet; on a wide window it sits beside the
  question as a five-column grid, on a phone it opens as a sheet from the
  "N dari 20 dijawab" chip. It also appears outlined on each mode card as
  that card's progress tracker (filling light on hover), and in green and
  red on the review page.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`
  (change their sizes in `tailwind.config.js` if you must, not their number).
  System UI type, with tabular figures for the timer and the scores.
- **The logo:** the app's mark is the uploaded logo, a graduation cap under
  the arched "SiapUjian" wordmark with a gold check. `public/logo.png` is the
  header lockup (already trimmed, on its own white rounded plate) and
  `public/icon.png` is the square 256 px version used as the favicon and
  apple-touch icon. Both carry the white plate themselves, so they read the
  same in the light and the dark look; do not recolour or re-key them.
- Icons are line icons: a clock for the timer, chevrons, a graduation cap
  for UTBK PTN, a shield badge for CAT CPNS, a target or a briefcase on the
  role badge. No emoji as icons. All app text is in Indonesian.

The kit is in `styles/tailwind-input.css`: colour tokens with a light and
a dark value (named in `tailwind.config.js`), and a few components
(`page-column`, `btn-primary`, `btn-secondary`, `field`, `list`, `list-row`,
`card`, `section-label`, `skeleton`, `state-empty`, `state-error`).
Re-theme by changing the token values there, keeping every text pair at
4.5:1 or more in both looks.

- Colour comes only from the tokens (`bg-ground`, `bg-surface`,
  `text-fg`, `text-muted`, `border-line`, `bg-accent` with
  `text-on-accent`, ...): never a raw hex value or a stock palette class.
- Tap targets are at least 44 px; the buttons and fields already are.
- A field's label says what it is; its placeholder, if any, is an example
  that says so ("e.g. 5.0"), never a bare value that could pass for one
  already entered.
- Each screen sits in `page-column`, one centred column on a wide window.
- Every screen that loads data has honest loading, empty and error states.
  Never show the empty state while loading or after a failure; an error says
  what failed, what still works, and offers Retry. Loading has the content's
  own shape (its rows, with `skeleton` bars for their text).
- Seed obviously fake staging demo data so the populated screen can be seen
  ("Staging mock data" in the platform conventions).
- No cards in cards, no uppercase eyebrows, no emoji as icons.
- The dashboard header shows the logo image (`public/logo.png`, 56 px tall,
  `.brand-logo` in `public/screens.css`) on its own, not the old line icon
  plus "SiapUjian" text: the image carries the name. Never an empty tile,
  and never `brand/icon.png`, which the app does not serve.

## App-specific conventions

- All three tables, `profiles`, `attempts` and `daily_practices`, are marked
  `staging:private` and keyed by `user_id`, so `usernode-user-data.js`
  covers them as is.
- `questions.js` is the only place a question's answer key, TKP weights or
  explanation is authored. The exam route never sends them; only the review
  route does, for the viewer's own attempt. An attempt keeps a snapshot of
  its questions, taken server-side at submit, so an old result stays
  explainable after the bank changes; that snapshot is the only copy
  outside `questions.js`, and only the review route may return it.
- An unfinished exam is never saved. Leaving the exam screen or closing the
  app discards it, flags included.
- Scores are computed on the server by `questions.js`'s `score()`, never by
  the page; the page only shows what an attempt stored. UTBK is
  20 questions at 50 points each, 0 to 1000, passing grade 600.
- A daily practice is not a try out: it never appears in Hasil terakhir or
  Perkembangan, only in the streak. `daily_practices` holds one row per
  person per day. The streak unions days with a practice and days with a
  finished attempt.
- Days (streak, daily practice) turn over at midnight in `Asia/Jakarta`.
  The server derives the day from `req.now` with `Intl.DateTimeFormat`, so
  a staging preview opened with `?un-now=` sees the right day.
