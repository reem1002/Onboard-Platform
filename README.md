# Onboard — Employee Training LMS (MERN)

Replacement for the Moodle LMS, built for **onboarding new employees inside companies**.
Phase 1 covers: secure auth, multi-company tenancy, structured assignments (modelled on the
SOC-L1-2026 course), file submissions, AI draft grading with instructor approval, and
dashboards for company admins, instructors and employees.

## What's in the platform

- **Structured assignments** (brief, tasks, callouts, rubric) with **videos** (YouTube, Vimeo, Loom, Google Drive, .mp4) and **lesson** items (watch/read, nothing to submit).
- **Milestone quizzes**: single/multiple-answer and true/false, auto-graded on the server, with pass mark, attempt limit and explanations shown after submitting. Optional **time limit** (server-side timer, auto-submit, survives page reloads), **shuffled** questions/options, a **results page** (who passed, question-by-question analysis) and **“Allow another try”** for employees out of attempts.
- **AI draft grading → instructor approval**, feedback sheet on screen and as Word.
- **Employee progress reports** (Word) in the on-the-job training format: executive summary, overview, milestone progress bars, job-description alignment, skills with grades & assessor evidence, highlights & development focus, business value, next steps. Narrative is editable and can be drafted by AI.
- **Support**: employees ask their course instructor or platform support; company admins contact platform support; the platform admin monitors every ticket with response-time stats.
- **Role dashboards** (first page after sign-in): what needs me today + how things are going, with a “What’s new” feed and a notification bell (graded, returned, course assigned, new submissions, support replies, reports shared…).
- **Profile** for every user: personal details, change password, list of signed-in devices with sign-out.
- **Account recovery**: “Remember me” (30 days), self-service “Forgot password” (emailed one-time link, 30 min), and admin emergency reset (one-time link, 24 h — the admin never sees a password). Accounts created by an admin must choose their own password at first sign-in.
- **Formats**: employees and company admins download feedback and progress reports as **PDF** (read-only); instructors/admins also get **Word** to edit. Instructors can **share** a report snapshot with the company admin.
- **Themes**: Default (warm pastel), Light, Dark or Match device — saved per account under Account settings.
- **Assignment resources**: instructors attach templates, sample logs, pcaps, etc.; employees download them from the assignment page.
- **File sizes & storage**: platform admin sets per-file / per-submission limits and a storage quota per company (Settings); instructors can override the per-file limit per assignment; employees see limits and sizes before uploading, with a live progress bar and cancel.
- **Course outline**: drag-and-drop (or arrow buttons) to reorder items and move them between milestones; rename/add/reorder milestones; publish/unpublish, duplicate and delete in place (items with submissions can only be unpublished).
- **Email notifications**: every in-app notification can also be emailed (branded HTML + deep link). Users choose categories in Account settings; the platform admin has a master switch and a “send test email” button.
- **Loading states**: skeleton placeholders shaped like each page, and a thin activity bar during requests.
- **Seats**: each customer company has a purchased seat limit enforced on employee accounts.
- **In-platform file viewer**: PDFs, images, Word (.docx, with its images), text/CSV/JSON/logs open inside the platform — instructors review submissions side-by-side with the grade, employees preview resources and their own uploads. Download is still one click away.
- **Due-date reminders** (hourly job): course due in 3 days / 1 day / overdue (overdue also tells the company admin), assignment due in 2 days / overdue, and a daily nudge to instructors when work waits > 48 h. Each reminder is sent once. Users can turn them off under Account settings → Email notifications.
- **Certificates**: issued automatically when an employee completes every graded item of a course (PDF with QR code). Anyone can check one at `/verify/<code>`; the platform admin can revoke.
- **Company branding**: the company admin (or platform admin) uploads a logo and picks an accent colour (with a contrast check); it is applied to that company's users, PDFs and exports.
- **Arabic / RTL**: EN ⇄ عربي toggle (top bar and sign-in page), saved per account. Employee-facing pages are translated; staff-only pages and course content stay in English for now.
- **Exports**: team progress as **CSV** or **PDF** (Team progress page) and a course **gradebook CSV** (course page). CSV opens in Excel with Arabic names intact and is protected against formula injection.

## Roles

| Role | Sees / does |
|---|---|
| `super_admin` (platform admin) | Everything: companies & seat limits, company admins, instructors, courses, instructor↔course assignment, all support tickets, reports. |
| `instructor` (platform staff) | Only the courses the admin assigns: edit assignments/quizzes, grade & approve AI feedback, answer course questions, generate reports for students in those courses. |
| `company_admin` (customer) | Adds employee accounts within the purchased seats, assigns courses, team progress, progress reports for their employees, contacts platform support. Cannot grade or edit content. |
| `employee` | Assigned courses only; submits work, takes quizzes, watches lessons, asks the instructor or support; sees grades after approval. |

## Assignment structure (replaces Word → copy/paste)

Every assignment is structured data, mirroring the live SOC course layout:

```
Meta: Difficulty | Type | Hours | Platform | Certifications
Scenario: bullets + callouts (Tip / Hint / Example / Warning / Note)
Tasks[]: title + bullets + callouts
Deliverable: bullets + accepted file types + max files
Grading criteria: weighted rubric (must total 100%) + private grader guidance
Professional development: LinkedIn skills + CV accomplishment
```

Authors edit it in a form with a **live preview**; employees see a clean brief with a task rail.

## AI grading flow

```
employee uploads → AI reads the file (docx/pdf/txt) → drafts a score + comment per rubric criterion
                 → instructor reviews, adjusts, approves or returns → employee sees final grade
```

- The AI draft is **never** shown to the employee.
- Weighted totals are computed on the server, not trusted from the model.
- Student text is treated as untrusted data (prompt-injection attempts are flagged, not obeyed).
- Screenshots-heavy lab reports get the `needs_screenshots_review` flag and lower confidence.
- The dashboard tracks how often instructors approve the AI draft unchanged.

## Security (OWASP Top 10 mapping)

| OWASP | What's in place |
|---|---|
| A01 Broken access control | RBAC on every route, tenant scoping on every query, 404 for cross-tenant IDs (IDOR), server decides tenant for new users |
| A02 Cryptographic failures | bcrypt (12), refresh tokens stored as SHA-256 hashes, HS256 pinned, secrets ≥32 chars enforced at boot |
| A03 Injection | Zod validation (unknown keys stripped), `$`/`.` key stripping, regex escaping in search |
| A04 Insecure design | AI output is a draft behind human approval; one active submission per assignment |
| A05 Misconfiguration | Helmet + CSP, strict CORS allow-list, env validated at boot, no stack traces in prod |
| A06 Vulnerable components | Pinned deps; run `npm audit` in CI |
| A07 Auth failures | 15-min access token in memory, httpOnly/SameSite=Strict refresh cookie scoped to `/api/auth`, **rotation + reuse detection** (replayed token kills the whole session family), lockout after 5 failures, rate limiting, generic errors + timing equalisation, sessions revoked on password change/deactivation/admin reset, single-use hashed reset tokens (30 min self-service, 24 h admin), generic “forgot password” response (no account enumeration), forced password change for admin-created accounts, device list with remote sign-out |
| A08 Integrity | Uploads: extension allow-list + magic-byte check, random filenames, stored outside web root, served via authorized route with `nosniff` + sandbox CSP |
| A09 Logging | Audit log for logins, failures, token reuse, user changes, grade decisions |
| A10 SSRF | No user-supplied URLs are fetched |

## Run locally

Requirements: Node 20+, MongoDB 6+.

```bash
# API
cd server
cp .env.example .env        # fill in the two JWT secrets (openssl rand -hex 32) and optionally ANTHROPIC_API_KEY
npm install
npm run seed                # prints generated demo passwords ONCE
npm run dev                 # http://localhost:4000

# Client
cd ../client
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Seeded demo data: NexaBank company, Sarah Chen (company admin), 3 new-hire employees,
a platform instructor, and the SOC Analyst L1 course with its 6 milestones and two fully
structured assignments (SOC-03, W-01).

Tests (26 integration tests: auth, token rotation/reuse, lockout, tenancy/IDOR, uploads, AI review flow):

```bash
cd server && MONGO_URI=mongodb://127.0.0.1:27017/lms_test npm test
```

## Managing accounts from the command line

Run these in the `server` folder (MongoDB must be running):

```bash
npm run user -- list                                                     # every account
npm run user -- create you@example.com "Your Name" super_admin           # temporary password, must change at first sign-in
npm run user -- create you@example.com "Your Name" employee nexabank --password "My-Pass-2026"
npm run user -- set-password someone@example.com                         # new temporary password + unlock
npm run user -- set-password someone@example.com "Known-Pass-2026"      # set a password you choose
npm run user -- demo-passwords "Demo-Pass-2026"                          # dev only: same password for the 6 seed accounts
```

## AI grading in-house (free)

The AI only drafts; an instructor approves every grade.

1. Install Ollama for Windows: https://ollama.com/download (runs in the background on port 11434, `OLLAMA_URL`).
2. Download a model once: `ollama pull qwen2.5:7b` (~4.7 GB; fits a 4–8 GB graphics card + 16 GB RAM) — or `qwen2.5:3b` (~1.9 GB) on a smaller laptop.
3. In the app: **Settings → AI grading → In-house (free)**, pick the model, Save. The status dot turns green when Ollama is reachable.

How a draft is made:
- **Reading files:** PDF, Word, text/CSV. Scanned PDFs / screenshots-only files are flagged. Long submissions are not cut off: for each criterion the most relevant paragraphs are sent to the model, and quotes are checked against the whole document.
- **Unreadable submissions skip the AI** (fewer than 60 readable words): the instructor is told to grade it with the file viewer instead of getting an invented draft.
- **Automatic checks (no AI):** very little text, unreadable files, text that tries to instruct the AI, tasks with no matching section, text copied from the brief, similarity to a colleague's submission (MinHash fingerprints).
- **Criterion by criterion:** the model grades one rubric criterion at a time and must quote the submission. Quotes are verified; invented quotes are dropped and a high score with no real quote is flagged.
- **Optional repeated runs** — the median is kept and big disagreements are flagged.
- **Learns from instructors:** earlier approved grades on the same assignment (and where the AI was too generous/harsh) are shown to the model as calibration.
- **The server computes the total** from the rubric weights. Confidence and the evidence under each criterion are shown to the instructor.
- Settings shows how close drafts are to instructors' final grades.

If Ollama is off, the submission falls back to manual grading and instructors are notified; use **Retry AI** on the review page later.

## Free email for testing (Gmail)

1. Turn on 2-Step Verification on the Google account.
2. Create an App password at https://myaccount.google.com/apppasswords (16 characters).
3. In `server/.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your.address@gmail.com
   SMTP_PASS=the16characterapppassword
   MAIL_FROM="Onboard LMS <your.address@gmail.com>"
   APP_URL=http://localhost:5173
   ```
4. Restart the server, then Settings → “Send me a test email”. Gmail allows roughly 500 emails a day — fine for testing; use a transactional provider (Brevo, Resend, Amazon SES…) with your own domain in production.

## Rate limits (why a refresh is never needed)

API requests are limited per signed-in user (1,500 / 15 min in production, much higher in development), not per IP — so several accounts tested from one laptop no longer share a budget. Sign-in counts only *failed* attempts (20 / 15 min per IP + email). Token refresh has its own generous limit. A limited request returns a clear JSON message instead of “something went wrong”.

## Production notes

- Serve the client build and API behind one reverse proxy (same origin) over HTTPS; `NODE_ENV=production` turns on `Secure` cookies.
- Replace the in-process grading queue with BullMQ + Redis when running more than one API instance.
- Store uploads in S3/Blob storage with server-side encryption.

## Next phases (suggested)

1. Importer: pull existing Moodle assignments (all SOC/CSS/GRC items) into the structured format.
2. MFA (TOTP) for admins and instructors.
3. Translate staff pages (review, editors, settings) and server notification texts to Arabic.
4. OCR for scanned PDFs / screenshots before AI grading.
