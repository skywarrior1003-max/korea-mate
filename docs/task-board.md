\# GoKoreaMate 2.0 Task Board



This task board defines the ordered work queue for GoKoreaMate 2.0 Autopilot development.



All agents must follow:



\- `AGENTS.md`

\- `docs/agent-workflow.md`



Default execution agent:



```text

Claude Code on Laptop



Default review station:



Desktop



Default branch policy:



feature/TASK-번호-short-name



Default protected branch:



master



Default rules:



Do not commit directly to master.

Do not push without user approval.

Do not deploy production without user approval.

Do not modify Supabase production DB without user approval.

Do not use git add .

Do not use git add -A.

Use selective staging only.

Do not call Gemini live API.

Do not read .env.local.

Do not read supabase/.temp/.

Do not expose secrets.

0\. Current Project Context



GoKoreaMate / gokoreamate.com is being rebuilt toward GoKoreaMate 2.0.



Current known state:



\- restaurants page has been converted to Supabase places-first loading with JSON fallback.

\- Latest known pushed commit for restaurant placeholder refinement: dbae010.

\- restaurants data: 194 Busan restaurants.

\- actual restaurant image data is not yet available.

\- placeholder design is currently used when image is missing.

\- Supabase places is the long-term single source of truth.

\- restaurants.json remains fallback only.

\- Like = feedback / preference signal.

\- Add to Itinerary = schedule input.

\- AI Trip is paused.

\- Gemini live API calls are forbidden unless explicitly approved.

\- Cloudflare Pages is the deployment platform.



GoKoreaMate 2.0 target structure:



AI Scheduler

\+ Near Me Map

\+ Explore \& Events

\+ Story Routes

\+ Korea Ready Affiliate Hub

\+ My Trip \& Trip Moments

\+ Trip Story Card

\+ Supabase-based Travel Data Platform

1\. Summary Table

태스크 ID	작업 이름	우선순위	상태

TASK-001	자동 검증 스크립트 세팅	P0	완료

TASK-002	2.0 문서/에이전트 규칙 Git 정리	P0	완료

TASK-003	restaurants Supabase 연동 검증 도구 추가	P0	완료

TASK-004	Events 데이터 모델 초안 추가	P1	완료

TASK-005	Trip Moments / GPS 데이터 모델 초안 추가	P1	완료

TASK-006	Media License 데이터 정책 및 스키마 초안 추가	P1	완료

TASK-007	Affiliate Links / Korea Ready 데이터 구조 초안 추가	P1	완료

TASK-008	Story Routes 데이터 구조 초안 추가	P2	완료

TASK-009	UI Draft Component Sandbox 추가	P2	완료

TASK-010	Trip Story Card 9:16 UI 초안 추가	P2	완료

TASK-011	Near Me 2.0 후보군 설계 문서 추가	P2	완료

TASK-012	규칙 기반 Scheduler 후보군 설계 문서 추가	P3	완료

TASK-013	규칙 기반 Scheduler 엔진 구현 (Phase 2 킥오프)	P3	완료

TASK-014	AI Personalization Layer 구현 (추천 이유 + 대안 장소)	P3	완료

TASK-015	Near Me 2.0 API 구현 (GPS → 후보군 → 스케줄러 연동)	P3	완료

TASK-016	Explore & Events API 구현 (events.json 쿼리 + F7 Event Bonus 활성화)	P3	완료

TASK-017	Trip Plan Combo API 구현 (Near Me + Scheduler + AI 단일 파사드 통합)	P3	완료

TASK-018	프론트엔드 일정 생성 파이프라인 전환 (레거시 → POST /api/trip/plan)	P3	완료

TASK-019	Story Routes API 구현 및 레거시 소스 청산 통합	P3	완료

TASK-020	Near Me 실 GPS 연동 및 Supabase 실 데이터 파이프라인 활성화	P3	완료

TASK-021	Supabase affiliate_links 스케줄러 인젝터 파이프라인 연동	P3	완료

TASK-001: 자동 검증 스크립트 세팅

Purpose



Create a reusable local verification script so Claude Code can validate future tasks with one command.



This task reduces repeated manual checking by standardizing:



git status

changed files

forbidden file detection

TypeScript check

Next.js build

summary report



This task does not change app behavior.



Allowed files

scripts/agent-verify.mjs

package.json

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

supabase/.temp/\*\*

pooler-url

package-lock.json unless package.json script edit forces no package change; do not intentionally update dependencies

src/\*\*

supabase/migrations/\*\*

public/data/\*\*

Cloudflare config files

Any secret or credential file

Required work

Create scripts/agent-verify.mjs.



The script must run and report:



git status --short

git branch --show-current

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



The script must check and warn if forbidden files are modified or staged:



.env.local

supabase/.temp/

package-lock.json

supabase/migrations/

The script must warn if current branch is master.

The script must not access secrets.

The script must not run deployment commands.

The script must not modify files.



Add a package script if safe:



"agent:verify": "node scripts/agent-verify.mjs"

If adding the script modifies package.json, confirm that package-lock.json remains unchanged.

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

node scripts/agent-verify.mjs

npm run agent:verify



The verification script itself should run:



npx tsc --noEmit

npm run build

Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-001: add agent verification script

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

package.json may be modified to add agent:verify.

Do not update dependencies.

Do not modify package-lock.json unless absolutely unavoidable; if it changes, stop and report before committing.

This task is foundational for future automation.

TASK-002: 2.0 문서/에이전트 규칙 Git 정리

Purpose



Commit the foundational planning and agent-operation documents after confirming they are present and safe.



This task creates a stable project baseline before feature implementation starts.



Expected existing files:



AGENTS.md

docs/agent-workflow.md

docs/gokoreamate-2.0-design.md

docs/gokoreamate-2.0-data-model.md

docs/gokoreamate-2.0-roadmap.md

docs/task-board.md

Allowed files

AGENTS.md

docs/agent-workflow.md

docs/gokoreamate-2.0-design.md

docs/gokoreamate-2.0-data-model.md

docs/gokoreamate-2.0-roadmap.md

docs/task-board.md

Forbidden files

.env.local

src/\*\*

supabase/\*\*

public/\*\*

package.json

package-lock.json

node\_modules/\*\*

Cloudflare config files

Any secret or credential file

Required work

Confirm that the allowed documents exist.



Review that the documents mention the following non-negotiable rules:



master direct commit forbidden

git add . forbidden

git add -A forbidden

selective staging only

production deployment requires user approval

Supabase production DB changes require user approval

Gemini live calls forbidden

Cloudflare Pages is the deployment platform

places is the long-term single source of truth

Like is feedback, not Save

Add to Itinerary is schedule input

Do not modify app code.

Do not create DB migrations.

Run validation.

Stage only the allowed documentation files.

Create a local commit.

Update this task status in the summary table from 대기중 to 완료 if the commit is successful.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If TASK-001 is already complete, also run:



npm run agent:verify

Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only documentation files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-002: add GoKoreaMate 2.0 planning docs

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

This task only commits planning and workflow documents.

Do not combine this task with code implementation.

If documents are missing, stop and report.

If the working tree contains unrelated changes, stop and report.

TASK-003: restaurants Supabase 연동 검증 도구 추가

Purpose



Create a safe local verification script that checks the current restaurants data-loading structure without changing production data.



The goal is to confirm:



restaurants page uses Supabase places first

restaurants.json remains fallback

no service role key is used in frontend

restaurant mapping assumptions are documented



This task does not modify the live database.



Allowed files

scripts/check-restaurants-places.mjs

docs/restaurants-places-verification.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

supabase/.temp/\*\*

src/app/restaurants/page.tsx

src/lib/places.ts

public/data/restaurants.json

supabase/migrations/\*\*

package.json

package-lock.json

Any production data writing script

Any secret or credential file

Required work

Create scripts/check-restaurants-places.mjs.

The script should be read-only.

The script may inspect local source files and local JSON files.

The script must not require Supabase service role key.

The script must not read .env.local.



The script should check, as much as possible from local files:



public/data/restaurants.json exists

restaurants.json count can be read

src/lib/places.ts exists

getRestaurantPlaces or equivalent places loader exists

fallback logic is documented

no SUPABASE\_SERVICE\_ROLE\_KEY reference appears in src/

no service role key appears in restaurants frontend code



Create docs/restaurants-places-verification.md summarizing:



current restaurants data flow

Supabase-first / JSON fallback rule

known image data limitation

current 194 restaurant context

no merge/no duplicate principle

future verification needs

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

node scripts/check-restaurants-places.mjs

npx tsc --noEmit

npm run build



If available:



npm run agent:verify

Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-003: add restaurants places verification

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

This task must not modify restaurants UI.

This task must not change src/lib/places.ts.

This task must not change restaurants.json.

This task must not connect to production Supabase.

If local source structure differs, document the mismatch and stop before modifying app code.

TASK-004: Events 데이터 모델 초안 추가

Purpose



Add a draft Supabase migration and documentation for date-based Events.



Events are a core GoKoreaMate 2.0 feature because festivals, concerts, exhibitions, and seasonal events can be the main reason foreign visitors travel.



This task creates a draft migration file only. It must not apply the migration to production.



Allowed files

supabase/migrations/\*\_events\_schema.sql

docs/events-data-model.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

supabase/.temp/\*\*

Any command that applies migration to production

Any production DB write

src/\*\*

public/\*\*

package.json

package-lock.json

Any secret or credential file

Required work

Create a draft migration file for events.



The migration should define a table such as events with fields including:



id

event\_id

place\_id nullable

city

district

title\_ko

title\_en

description\_ko

description\_en

event\_type

start\_date

end\_date

start\_time

end\_time

display\_until

fixed\_time\_event

lat

lng

source

official\_url

ticket\_url

affiliate\_link\_id nullable

image\_url nullable

admin\_status

is\_active

is\_ai\_usable

created\_at

updated\_at

Include RLS planning comments if appropriate, but do not apply or test against production DB.

Create docs/events-data-model.md.



The documentation must explain:



Happening during your trip

display\_until auto-hide

Past Event for saved trips

fixed\_time\_event priority in Scheduler

official data source requirement

event source validation

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify



Do not run Supabase production migration commands.



Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-004: draft events data model

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

This task creates a draft migration only.

Do not apply migration to production.

Do not connect to Supabase production DB.

Events must not be treated as ordinary static cards; they are date-based travel data.

AI Scheduler must respect fixed-time events before flexible attractions.

TASK-005: Trip Moments / GPS 데이터 모델 초안 추가

Purpose



Add a draft data model for Trip Moments and Custom Spots.



Trip Moments allow users to save personal memories inside a trip:



photo

comment

GPS

manual pin

private memory

share-card inclusion



GPS is a memory hint, not a guaranteed address.



This task creates draft schema and documentation only. It must not implement upload UI yet.



Allowed files

supabase/migrations/\*\_trip\_moments\_schema.sql

docs/trip-moments-data-model.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

supabase/.temp/\*\*

Any command that applies migration to production

Any production DB write

src/\*\*

public/\*\*

package.json

package-lock.json

Any secret or credential file

Required work



Create a draft migration file for:



trip\_sessions

trip\_items

custom\_spots

trip\_moments



trip\_moments should include fields such as:



moment\_id

trip\_id

place\_id nullable

custom\_spot\_id nullable

title

comment

photo\_url

lat

lng

gps\_accuracy\_m

geo\_source

address\_label

map\_note

visibility

share\_location\_level

created\_at

visit\_time

include\_in\_share\_card



custom\_spots should include fields such as:



custom\_spot\_id

trip\_id

name

lat

lng

gps\_accuracy\_m

address\_label

note

photo\_url

visibility

created\_at

Create docs/trip-moments-data-model.md.



The documentation must include privacy rules:



default visibility = private

default share\_location\_level = hidden

exact GPS sharing requires explicit user choice

photo EXIF location data should be removed when possible

GPS is a hint, not a guaranteed address

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify



Do not run Supabase production migration commands.



Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-005: draft trip moments data model

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

This task must not implement file upload.

This task must not store actual user GPS data.

This task must not expose exact GPS by default.

This task must not alter existing My Trip UI.

Production DB changes require explicit user approval later.

TASK-006: Media License 데이터 정책 및 스키마 초안 추가

Purpose



Add draft data model and policy documentation for official/public tourism media usage.



This task prevents accidental copyright violations when matching Visit Busan, tourism office, public data, or partner images to places and events.



This task does not scrape or download images.



Allowed files

supabase/migrations/\*\_media\_license\_schema.sql

docs/media-license-policy.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

supabase/.temp/\*\*

Any image scraping script

Any image download script

Any production DB write

src/\*\*

public/images/\*\*

public/data/\*\*

package.json

package-lock.json

Any secret or credential file

Required work



Create draft migration for:



place\_media

media\_licenses

place\_sources

place\_match\_logs

admin\_review\_queue



place\_media should include fields such as:



media\_id

place\_id nullable

event\_id nullable

media\_type

media\_url

storage\_path nullable

is\_primary

license\_id

source

source\_url

admin\_status

created\_at

updated\_at



media\_licenses should include:



license\_id

license\_type

commercial\_use\_allowed

attribution\_required

modification\_allowed

source\_name

source\_url

notes

verified\_at

verified\_by

Create docs/media-license-policy.md.



The documentation must clearly state:



public website image does not automatically mean commercial reuse is allowed

direct photos are allowed

partner-provided images are allowed under contract

public/open-license images may be used only under their license terms

tourism API images may be used only if reuse is allowed

official website images are pending until license is confirmed

blog/Instagram/Google/Naver images are forbidden

Michelin/review platform images are forbidden unless licensed

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify



Do not scrape images.

Do not download images.

Do not apply migration to production.



Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-006: draft media license policy

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

This task is policy/schema only.

No image collection is allowed.

Incorrect media usage can create legal risk.

All public media must have tracked license metadata before public display.

TASK-007: Affiliate Links / Korea Ready 데이터 구조 초안 추가

Purpose



Add draft data model and documentation for Korea Ready monetization.



Korea Ready should feel like helpful travel preparation, not an aggressive ad section.



This task prepares the structure for:



eSIM

transport

airport pickup

KTX

activities

tours

stay

map tips

payment / phone verification tips



No real affiliate keys or tracking secrets should be added.



Allowed files

supabase/migrations/\*\_affiliate\_links\_schema.sql

docs/korea-ready-affiliate-model.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

supabase/.temp/\*\*

Any real affiliate credential file

Any production DB write

src/\*\*

public/\*\*

package.json

package-lock.json

Any secret or credential file

Required work

Create draft migration for affiliate\_links.



Include fields such as:



affiliate\_link\_id

provider

category

title

description

destination\_url

tracking\_code nullable

city nullable

placement\_context

priority

is\_active

starts\_at nullable

ends\_at nullable

admin\_status

created\_at

updated\_at

Create docs/korea-ready-affiliate-model.md.



The documentation must explain:



Korea Ready is helpful travel preparation, not a banner farm

eSIM has highest early priority

activity/tour links should appear in itinerary context

stay links should appear in area/context

transport links should appear around airport/station scenarios

direct PG payment is forbidden at this stage

affiliate links must be managed without exposing secrets

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify



Do not apply migration to production.



Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-007: draft Korea Ready affiliate model

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

Do not add real affiliate secrets.

Do not add tracking credentials.

Do not add direct payment logic.

Affiliate UX must not look like spam advertising.

TASK-008: Story Routes 데이터 구조 초안 추가

Purpose



Add draft data model and documentation for Story Routes.



Story Routes are curated travel flows such as:



BTS Day in Busan

Busan Food 100 Day

Galmaetgil Ocean Walk

Festival Day

Temple \& Healing Day

Local Night View

Rainy Day Busan



This task prepares route templates before UI implementation.



Allowed files

supabase/migrations/\*\_route\_templates\_schema.sql

docs/story-routes-data-model.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

supabase/.temp/\*\*

Any production DB write

src/\*\*

public/\*\*

package.json

package-lock.json

Any secret or credential file

Required work



Create draft migration for:



route\_templates

route\_template\_items



route\_templates should include fields such as:



route\_id

city

title\_ko

title\_en

description\_ko

description\_en

mood\_tags

duration\_type

estimated\_minutes

difficulty

route\_type

is\_active

admin\_status

created\_at

updated\_at



route\_template\_items should include fields such as:



route\_item\_id

route\_id

place\_id nullable

event\_id nullable

item\_order

recommended\_start\_time nullable

stay\_minutes

note\_ko

note\_en

is\_required

created\_at

Create docs/story-routes-data-model.md.



The documentation must explain:



Story Routes are curated routes, not AI hallucinations

places/events should be linked by ID

routes can be added to My Trip

Festival routes can include date-based events

route\_templates help scheduler before full AI implementation

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify



Do not apply migration to production.



Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-008: draft story routes data model

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

This task is schema/documentation only.

Do not create UI yet.

Do not seed unverified routes yet.

Do not invent place data outside verified sources.

TASK-009: UI Draft Component Sandbox 추가

Purpose



Create a safe UI sandbox area for future Qwen-generated component drafts.



This prevents UI drafts from being mixed directly into production pages before review.



This task should create isolated draft components only.



Allowed files

src/components/drafts/KoreaReadyDraft.tsx

src/components/drafts/StoryRouteCardDraft.tsx

src/components/drafts/TripMomentCardDraft.tsx

src/components/drafts/index.ts

docs/ui-draft-guidelines.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

src/app/page.tsx

src/app/restaurants/page.tsx

src/lib/places.ts

production route files unless explicitly allowed later

package.json

package-lock.json

Any secret or credential file

Required work

Create src/components/drafts/ if missing.



Add static draft components:



KoreaReadyDraft

StoryRouteCardDraft

TripMomentCardDraft



Components must:



use mock data only

not fetch data

not call APIs

not access Supabase

not modify app routes

not be imported into production pages yet

be mobile-first

use existing project styling conventions where obvious

Create docs/ui-draft-guidelines.md.



Documentation must explain:



Qwen drafts are visual drafts only

Claude Code adapts final components

draft components must not be connected to production pages without a task

no real affiliate links

no real user data

no GPS access

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify

Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-009: add UI draft component sandbox

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

Draft components should not affect live UI.

Do not import drafts into production routes.

Avoid dependency changes.

If existing styling utilities are unclear, use simple Tailwind classes.

TASK-010: Trip Story Card 9:16 UI 초안 추가

Purpose



Create a draft 9:16 Trip Story Card component for future viral sharing.



Initial implementation should be a static, capture-friendly UI draft.



No image generation engine is required in this task.



Allowed files

src/components/drafts/TripStoryCardDraft.tsx

src/components/drafts/index.ts

docs/trip-story-card-ui.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

src/app/\*\*

src/lib/\*\*

production route files

package.json

package-lock.json

Any image generation package

Any external API integration

Any secret or credential file

Required work

Create TripStoryCardDraft.

The draft should be a 9:16 mobile-card style component.



It should use mock data only:



My 2026 Busan Trip

Busan, Korea

travel dates

representative places

one Trip Moment photo placeholder

user comment

gokoreamate.com

Do not implement PNG export yet.

Do not implement Satori or image generation.

Do not import the component into production pages.

Create docs/trip-story-card-ui.md.



Document future stages:



Stage 1: capture-friendly UI

Stage 2: save as image

Stage 3: include Trip Moments

Stage 4: share link

Stage 5: reload friend itinerary

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify

Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-010: add trip story card draft

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

No image generation engine.

No external API.

No production UI connection.

No user data access.

Draft only.

TASK-011: Near Me 2.0 후보군 설계 문서 추가

Purpose



Document Near Me 2.0 candidate-generation logic before implementation.



Near Me 2.0 should combine:



GPS

radius

category

time context

Like preference

Add to Itinerary context

date-based events

places data



This task is documentation only.



Allowed files

docs/near-me-2.0-candidate-logic.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

src/\*\*

supabase/migrations/\*\*

public/\*\*

package.json

package-lock.json

Any secret or credential file

Required work

Create docs/near-me-2.0-candidate-logic.md.



Document radius levels:



1km = close

3km = reachable

7km = special



Document categories:



Food

Cafe

Attraction

K-POP

Event

Walking

Temple

Night View

Shopping

Rainy Day



Document scoring inputs:



distance

coordinate\_quality

current time

category match

Like preference

Add to Itinerary neighborhood

event date match

is\_active

admin\_status

is\_map\_usable

is\_ai\_usable

Document output format for future implementation.

State that no Gemini live API should be used.

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify

Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-011: document Near Me 2.0 candidate logic

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

Documentation only.

Do not implement GPS access yet.

Do not modify Near Me production UI.

Do not call map APIs.

Do not call Gemini.

TASK-012: 규칙 기반 Scheduler 후보군 설계 문서 추가

Purpose



Document the rule-based Scheduler design before AI Scheduler is reactivated.



The Scheduler must not let AI invent places.



It must use verified data from:



places

events

route\_templates

trip\_items

trip\_moments

candidate\_pool



This task is documentation only.



Allowed files

docs/rule-based-scheduler-design.md

docs/task-board.md

Forbidden files

.env.local

supabase/.temp/

src/\*\*

supabase/migrations/\*\*

public/\*\*

package.json

package-lock.json

Any Gemini-related live API file

Any secret or credential file

Required work

Create docs/rule-based-scheduler-design.md.



Document Scheduler priority:



1\. arrival time/place

2\. departure time/place

3\. user-selected fixed-time events

4\. Add to Itinerary places

5\. Like preference signals

6\. Near Me / nearby places

7\. affiliate context cards

Document candidate pool input format.



Document hard constraints:



no schedule before arrival

no schedule after departure

fixed-time events cannot be moved

avoid repeating same place

prefer zone continuity

do not invent places

only use verified IDs



Document AI role:



AI may write explanation text later

AI may suggest alternatives later

AI must not create unverified places

Gemini live calls remain forbidden

Update this task status in the summary table from 대기중 to 완료 only after successful validation and local commit.

Validation



Run:



git status --short

git diff --stat

git diff --name-only

npx tsc --noEmit

npm run build



If available:



npm run agent:verify

Commit policy



Local commit allowed: yes.



Conditions:



\- Branch must not be master.

\- Only allowed files may be staged.

\- Use selective staging only.

\- Do not use git add .

\- Do not use git add -A.



Commit message:



TASK-012: document rule-based scheduler design

Push policy



Push allowed: no unless user approves.



Deployment policy



Production deployment allowed: no.



Risk notes

Documentation only.

Do not reactivate AI Trip.

Do not call Gemini.

Do not modify scheduler code.

Do not implement production scheduler yet.

2\. Execution Notes



When the user says:



TASK-001 진행해



Claude Code must:



1\. Read this task board.

2\. Follow AGENTS.md.

3\. Follow docs/agent-workflow.md.

4\. Create the feature branch.

5\. Modify only allowed files.

6\. Run validation.

7\. Create local commit only if allowed and validation passes.

8\. Do not push.

9\. Do not deploy.

10\. Report final status.

3\. Default Final Report Format



Every TASK report must use:



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

4\. Final Principle



This board exists to reduce repeated manual prompting.



The target operating model is:



The user gives a TASK number.

Claude Code executes the defined task.

The desktop reviews the result.

The user approves push/deploy only at important gates.

