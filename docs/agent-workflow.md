2\. Agent Roles

2.1 Claude Code



Claude Code is the primary implementation agent.



Claude Code may:



Inspect the project file structure.

Read non-secret source files.

Create or modify approved project files.

Implement Next.js / TypeScript / React code.

Create documentation files.

Create helper scripts.

Create feature branches.

Run local validation commands.

Run:

npx tsc --noEmit

npm run build

approved local test scripts

Create local commits only on feature branches when explicitly allowed by task instructions.

Produce implementation reports.



Claude Code must:



Protect the master branch.

Work only on the files allowed by the current task.

Report all modified files.

Report all test/build results honestly.

Stop and report if unexpected files are modified.

Stop and report if a secret file is required.

Stop and report if production deployment or production DB access is needed.



Claude Code must not:



Commit directly to master.

Push without explicit user approval.

Deploy to production without explicit user approval.

Modify Supabase production data directly.

Read or print secret keys.

Call Gemini or any paid/live AI API unless explicitly approved.

Use git add ..

Use git add -A.

Make broad unrelated refactors.

Rewrite large parts of the application unless the task explicitly requires it.

2.2 Hermes



Hermes is the planning and data-structure agent.



Hermes may:



Draft database schema ideas.

Draft JSON structures.

Draft policy documents.

Draft data relationship diagrams in text.

Break large product goals into tasks.

Review privacy, GPS, media license, and data-quality policies.

Prepare structured task cards for Claude Code.



Hermes is suitable for:



places data policy

events data policy

trip\_moments policy

custom\_spots policy

place\_media and media\_licenses policy

affiliate\_links structure

route\_templates structure

AI Scheduler candidate-pool logic

Agent workflow planning



Hermes must not:



Modify production code directly.

Run Git commands.

Run deployment commands.

Access Supabase production DB.

Modify .env.local.

Access or print API keys.

Replace Claude Code as the final implementation agent.



Hermes output should usually be reviewed and then handed to Claude Code for actual implementation.



2.3 Qwen



Qwen is the UI and component draft agent.



Qwen may:



Draft React component ideas.

Draft Tailwind CSS layouts.

Draft card UI designs.

Draft mobile-first screens.

Draft static UI components using mock data.

Draft:

Home sections

Korea Ready cards

Story Route cards

Trip Moment cards

Trip Story 9:16 share cards

Timeline layouts

Empty states

Loading states



Qwen is suitable for:



Visual exploration.

Fast component drafts.

UI alternatives.

Mobile card designs.

Viral/share-oriented screen concepts.



Qwen must not:



Modify production project files directly unless explicitly instructed and reviewed.

Handle Supabase logic.

Handle authentication logic.

Handle security-sensitive code.

Handle production deployment.

Modify .env.local.

Access or print API keys.

Decide final data models.

Decide final routing architecture without Claude Code review.



Qwen output should be treated as a draft. Claude Code must adapt it to the actual project structure before final use.



2.4 User



The user is the project owner and final approval authority.



The user is responsible for:



Final business decisions.

Final UX approval.

Final production deployment approval.

Final Supabase production DB approval.

Final merge/push approval.

Final affiliate/monetization approval.

Final legal/commercial judgment on image and data usage.



The user may:



Request a task by saying TASK-번호 진행해.

Approve local commits.

Approve branch push.

Approve production deployment.

Approve Supabase migrations.

Reject or revise AI output.

Stop automation at any time.



The user should not be required to monitor every small code change once the agent workflow is established.



The target operating model is:



AI agents perform the work.

Claude Code verifies the work.

The user approves only the important checkpoints.

3\. Computer Roles

3.1 Laptop



The laptop is the primary development machine.



Laptop role:



Main development factory



The laptop should be used for:



Claude Code implementation.

Feature branch work.

Local validation.

Type checking.

Build testing.

Local commit creation.

Qwen UI draft testing if needed.

Hermes planning if needed.



The laptop should not automatically deploy production.



3.2 Desktop



The desktop is the control tower and review station.



Desktop role:



Monitoring / review / approval station



The desktop should be used for:



Reviewing Claude Code reports.

Checking GitHub status.

Checking Cloudflare Pages deployments.

Checking the live site in browser.

Reviewing UI on a large screen.

Reviewing Supabase dashboard manually when needed.

Approving merge/push/deploy decisions.



The desktop should not edit the same files while the laptop is working on them.



4\. Git Rules

4.1 Protected Branch



The protected production branch is:



master



Rules:



Do not commit directly to master.

Do not run automated code changes directly on master.

Do not push directly to master unless explicitly approved by the user.

Production deployment must be approved by the user.

4.2 Feature Branch Rule



All task work must happen on a feature branch.



Branch naming format:



feature/TASK-번호-short-name



Examples:



feature/TASK-001-agent-workflow

feature/TASK-002-events-schema

feature/TASK-003-trip-moments



If the current branch is master, Claude Code must create a feature branch before modifying files.



4.3 Staging Rule



Allowed:



git add path/to/specific-file

git add path/to/another-specific-file



Forbidden:



git add .

git add -A



Only selective staging is allowed.



Claude Code must report the exact files staged.



4.4 Commit Rule



Local commits are allowed only when all conditions are met:



1\. The task explicitly allows local commit.

2\. The current branch is not master.

3\. Only task-approved files are modified.

4\. Type check passes, unless the task is documentation-only.

5\. Build passes, unless the task explicitly allows skipping build.

6\. The commit message clearly references the task number.



Commit message format:



TASK-번호: short description



Example:



TASK-001: add agent workflow docs

4.5 Push Rule



Claude Code must not push unless the user explicitly approves.



Default:



push 금지



Allowed only after user approval:



git push origin feature/TASK-번호-short-name

5\. Deployment Rules



Production deployment is not automated by default.



Forbidden without explicit approval:



Cloudflare production deployment.

Manual production deployment.

Wrangler production deployment.

Any deployment command that changes the live site.

Any merge that triggers automatic production deployment.



Allowed:



Local build.

Local preview when safe.

Cloudflare dashboard read-only check by the user.

Preview deployment only when explicitly approved.



Production deployment requires:



1\. User approval.

2\. Clean git status except intended files.

3\. Type check success.

4\. Build success.

5\. Review of changed files.

6\. No secret exposure.

7\. No unintended Supabase production DB change.

6\. Supabase Rules



Supabase is a critical production system.



Forbidden without explicit approval:



Direct production DB modification.

Applying migrations to production.

Using service role key in frontend code.

Printing service role key.

Reading .env.local.

Reading supabase/.temp/.

Reading pooler URL files.

Running scripts that write to production data.



Allowed:



Drafting migration files.

Reviewing existing non-secret schema files.

Creating local-only schema documentation.

Creating seed scripts that are not executed against production.

Writing SQL migration files without applying them.



Supabase write operations require explicit user approval.



7\. Secret and API Key Rules



Never read, print, summarize, or expose:



.env.local

SUPABASE\_SERVICE\_ROLE\_KEY

ADMIN\_KEY

Gemini API key

Cloudflare tokens

GitHub tokens

pooler-url

supabase/.temp/\*

any private API key



If a task requires a secret, stop and report:



This task requires a secret or production credential. I will not access it. Please handle it manually in the proper dashboard.

8\. Gemini / AI API Rules



Gemini live API usage is forbidden unless explicitly approved.



Default rule:



Gemini live 호출 금지

HARNESS\_SKIP\_GEMINI=1 유지

AI Trip live generation 금지



Allowed without approval:



Static planning.

Documentation.

Mock data.

Local-only tests that do not call Gemini.

Rule-based scheduler logic.



Forbidden without approval:



Live Gemini API call.

Live AI Trip generation.

API harness that may trigger billing.

Background retry jobs.

Any paid AI inference test.

9\. Data and Media Rules

9.1 Place Data



The single source of truth for official places is:



Supabase places



Rules:



Use place\_id as the stable identifier.

Do not rely only on names for matching.

Maintain coordinate quality.

Maintain AI usability flags.

Maintain admin approval status.

Keep user-added places separate in custom\_spots.

9.2 Events Data



Events are date-based travel data.



Events must include:



start\_date

end\_date

start\_time

end\_time

display\_until

fixed\_time\_event

source

official\_url

is\_ai\_usable



Past events should be hidden from default lists after display\_until, but saved trips may show them as Past Event.



9.3 Trip Moments and GPS



Trip Moments may store:



User memory title.

Comment.

Photo.

GPS latitude and longitude.

GPS accuracy.

Manual pin adjustment.

Share location level.



Privacy rules:



Default visibility = private

Default share\_location\_level = hidden

Exact GPS sharing requires explicit user choice

Photo EXIF location data should be removed when possible



GPS is not a guaranteed address. It is a memory hint to help the user return near the place.



9.4 Media and License



Public tourism websites may contain useful images, but public visibility does not automatically mean commercial reuse is allowed.



Allowed only with proper conditions:



Directly photographed images.

Partner-provided images under contract.

Public/open-license images with clear allowed use.

Tourism API images that explicitly allow reuse.



Do not use without permission:



Blog images.

Instagram images.

Google images.

Naver images.

Michelin/review platform images.

Official website images without clear reuse permission.



Media license metadata must be tracked before public use.



10\. Task Execution Rule



When the user says:



TASK-번호 진행해



The agent must follow docs/agent-workflow.md.



The expected default agent for task execution is Claude Code.



Hermes and Qwen may prepare drafts, but Claude Code is responsible for final file integration and validation.



11\. Reporting Rule



Every completed task must report:



Task ID:

Branch:

Modified files:

Staged files:

Commit hash if created:

Type check result:

Build result:

Push status:

Deploy status:

Risks:

Next recommended step:



The report must clearly state:



commit 여부

push 여부

배포 여부

git add . 사용 여부

git add -A 사용 여부

12\. Final Principle



Automation is allowed, but uncontrolled automation is not allowed.



The target operating model is:



Feature branch automation:

Allowed



Local validation:

Required



Local commit:

Allowed only on feature branches



Push:

User approval required



Production deployment:

User approval required



Supabase production DB changes:

User approval required



\## 2. docs/agent-workflow.md



```md

\# Agent Workflow



\## GoKoreaMate Autopilot Workflow



This document defines how AI agents must operate when the user gives a task command such as:



```text

TASK-번호 진행해



The default execution agent is Claude Code.



Hermes may support planning.

Qwen may support UI drafts.

Claude Code performs final file integration, validation, and reporting.



1\. Workflow Goal



The goal of this workflow is to reduce repeated manual prompting and allow AI agents to work in a controlled, repeatable, and safe way.



The user should not need to supervise every small implementation detail.



The workflow must protect:



master branch

production deployment

Supabase production DB

secret keys

existing stable features

2\. Autopilot 6-Step Procedure



When the user says:



TASK-번호 진행해



Claude Code must perform the following 6 steps.



Step 1. Analyze the Task from task-board

1.1 Locate the task



Check the task board file.



Default location:



docs/task-board.md



If the task board does not exist, stop and report:



docs/task-board.md does not exist. I cannot run TASK-번호 in autopilot mode until the task board is created.



Find the matching task ID.



Example:



TASK-001

TASK-002

TASK-003

1.2 Read the task card



The task card should define:



Task ID

Task title

Purpose

Allowed files

Forbidden files

Expected output

Validation commands

Commit policy

Push policy

Deployment policy

Risk notes



If the task card does not clearly define allowed files, stop and report.



Do not guess broad file changes.



1.3 Check current project state



Before modifying files, run:



pwd

git status --short

git branch --show-current

git log --oneline -5



Report if:



The current directory is unexpected.

The working tree is not clean.

The branch is not expected.

There are untracked or modified files unrelated to the task.

1.4 Check forbidden conditions



Stop immediately if the task requires:



.env.local access

secret key access

supabase/.temp access

pooler-url access

Gemini live API call

production DB write

production deployment

master branch direct commit



Unless the user explicitly approved that specific action, do not proceed.



Step 2. Create a Feature Branch

2.1 Branch rule



All task work must happen on a feature branch.



Branch format:



feature/TASK-번호-short-name



Example:



git checkout -b feature/TASK-001-agent-workflow

2.2 If already on master



If the current branch is master, create the feature branch before modifying files.



2.3 If already on a feature branch



If the current branch already matches the task branch, continue.



If the current branch is a different feature branch, stop and report:



Current branch does not match TASK-번호. Please confirm whether to continue, switch branch, or finish the current branch first.

2.4 Never commit directly to master



If the current branch is master after this step, stop.



Step 3. Modify Only the Approved Files

3.1 Allowed files only



Modify only the files listed in the task card.



If a new file is necessary but not listed, stop and report before creating it.



3.2 Forbidden file areas



Do not modify unless the task explicitly allows it:



.env.local

supabase/.temp/

package-lock.json

package.json

next.config.ts

wrangler config files

Cloudflare config

Supabase production migration files

AI Trip live API files

3.3 No unrelated refactoring



Do not perform:



Broad formatting changes.

Unrelated cleanup.

Large refactors.

Renaming unrelated files.

Dependency upgrades.

Package changes.

3.4 Keep existing features safe



When modifying code, preserve existing behavior unless the task says otherwise.



Special GoKoreaMate rules:



Like = feedback, not Save

Add to Itinerary = schedule input

Heart must not be mixed with itinerary

Gemini live call is forbidden

AI must not invent places

places is the long-term single source of truth

3.5 If unexpected changes happen



If unexpected files are modified, stop and report:



Unexpected files were modified. I will stop before staging or committing.

Step 4. Run Automatic Validation

4.1 Required validation



After changes, run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build

4.2 Documentation-only tasks



For documentation-only tasks, still run:



npx tsc --noEmit

npm run build



unless the task card explicitly allows skipping them.



4.3 Report all failures



If type check or build fails, do not hide the failure.



Report:



Command:

Exit status:

Error summary:

Likely cause:

Modified files:

Recommended next action:

4.4 Do not rollback automatically



If validation fails:



Do not rollback automatically.

Do not delete the work automatically.

Do not commit.

Report the error and wait for instructions.



The user or supervising assistant will decide whether to fix, revert, or split the task.



Step 5. Create a Local Commit on Success

5.1 Commit only if allowed



Create a local commit only if the task card allows local commit.



If the task card says commit is forbidden, do not commit.



5.2 Conditions for commit



Commit is allowed only if:



Current branch is not master

Modified files match allowed files

No forbidden files were accessed

No forbidden files were modified

Type check passed

Build passed

No production deployment was run

No production DB write was run

5.3 Selective staging only



Allowed:



git add path/to/file1

git add path/to/file2



Forbidden:



git add .

git add -A



Before committing, show staged files:



git diff --cached --name-only

git diff --cached --stat

5.4 Commit message format



Use:



TASK-번호: short description



Example:



git commit -m "TASK-001: add agent workflow docs"

5.5 Push policy



Do not push unless the task card explicitly allows it and the user has approved it.



Default:



push 금지

Step 6. Report Final Status



At the end of the task, report in this format.



\[GoKoreaMate Autopilot Task Report]



1\. Task ID:

2\. Task title:

3\. Machine role:

4\. Agent:

5\. Working directory:

6\. Branch:

7\. Initial git status:

8\. Modified files:

9\. Staged files:

10\. Commit:

11\. Commit hash:

12\. Push status:

13\. Deployment status:

14\. Supabase production DB status:

15\. Type check result:

16\. Build result:

17\. Forbidden actions check:

18\. Risks / warnings:

19\. Next recommended step:



The report must explicitly include:



git add . 사용 여부:

git add -A 사용 여부:

master 직접 commit 여부:

push 여부:

production 배포 여부:

Supabase 운영 DB 변경 여부:

Gemini live 호출 여부:

3\. Failure Rules



If the task fails at any step, do not improvise beyond the task scope.



3.1 If task-board is missing



Stop and report.



3.2 If working tree is dirty



Stop and report unless the dirty files are part of the same task.



3.3 If current branch is wrong



Stop and report.



3.4 If required files are missing



Stop and report.



3.5 If the task requires secrets



Stop and report.



3.6 If validation fails



Do not rollback automatically.

Do not commit.

Report the error.



3.7 If unexpected files changed



Do not stage.

Do not commit.

Report the unexpected files.



4\. Task Card Format



Each task in docs/task-board.md should follow this structure.



\## TASK-001: Example task title



\### Purpose

Explain why this task exists.



\### Allowed files

\- path/to/file1

\- path/to/file2



\### Forbidden files

\- .env.local

\- supabase/.temp/

\- package.json

\- package-lock.json



\### Required work

\- Item 1

\- Item 2

\- Item 3



\### Validation

\- git status --short

\- git diff --stat

\- git diff --name-only

\- npx tsc --noEmit

\- npm run build



\### Commit policy

Local commit allowed: yes/no



\### Push policy

Push allowed: no unless user approves



\### Deployment policy

Production deployment allowed: no



\### Risk notes

\- Note 1

\- Note 2

5\. Default Task Policies



Unless a task card explicitly says otherwise, use these defaults.



Local commit allowed: yes, only on feature branch after validation passes

Push allowed: no

Production deployment allowed: no

Supabase production DB write allowed: no

Gemini live call allowed: no

git add . allowed: no

git add -A allowed: no

Selective staging only: yes

6\. Agent Collaboration Rules

6.1 Hermes



Hermes may prepare:



Data model drafts.

Policy drafts.

JSON schema drafts.

Task breakdowns.



Hermes output must be reviewed before Claude Code implements it.



6.2 Qwen



Qwen may prepare:



UI component drafts.

Tailwind layouts.

Mobile card concepts.

Share card concepts.



Qwen output must be adapted by Claude Code before final integration.



6.3 Claude Code



Claude Code is responsible for:



Actual file edits.

Project consistency.

Type check.

Build check.

Git status reporting.

Safe local commits.

6.4 User



The user is responsible for:



Final approval.

Push approval.

Production deployment approval.

Supabase production DB approval.

Affiliate/legal/business approval.

7\. GoKoreaMate-Specific Rules



The following project rules must always be respected.



Cloudflare Pages is the deployment platform.

Do not call this project Vercel-based.

Gemini live calls are forbidden unless explicitly approved.

HARNESS\_SKIP\_GEMINI=1 must be respected.

AI Trip is currently paused unless explicitly reactivated.

restaurants currently use Supabase places first and JSON fallback.

places is the long-term single source of truth.

Heart/Like is feedback, not Save.

Add to Itinerary is the schedule input.

Manual Schedule is removed.

Events should use display\_until for auto-hide.

Saved trips may preserve Past Event labels.

Trip Moments GPS is private by default.

Exact GPS sharing must be user-controlled.

Public images require license verification.

8\. Final Principle



The goal is not reckless full automation.



The goal is controlled autopilot.



AI agents do the work.

Claude Code verifies the work.

The user approves the important gates.

Production remains protected.

