# Google Calendar Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Register selected DoToDo events in Google Calendar from the browser, show conflicts and completion in chat, and fall back to ICS when authentication is unavailable.

**Architecture:** Add a UMD `google-calendar.js` module for GIS token acquisition, Calendar REST calls, event conversion, and conflict detection. Keep browser state and rendering in `ui.js`; load GIS and the new module from `index.html`. Use dependency injection for fetch/token mocks.

**Tech Stack:** Vanilla JavaScript, Google Identity Services, Google Calendar REST API v3, Node test runner, browser-harness.

---

### Task 1: Ground LLM extraction in source text

**Files:**
- Modify: `tests/llm-extractor.test.js`
- Modify: `llm-extractor.js`

1. Add a test asserting the system prompt explicitly prohibits inferred numbers, names, identifiers, and uncertain title/checklist content.
2. Run `node --test tests/llm-extractor.test.js` and confirm it fails on the missing wording.
3. Add the grounding rules to the extraction prompt.
4. Run the focused test and confirm it passes.

### Task 2: Build the Google Calendar module

**Files:**
- Create: `tests/google-calendar.test.js`
- Create: `google-calendar.js`

1. Add failing tests for:
   - converting timed and all-day events to Calendar API bodies;
   - checklist/evidence description generation;
   - reminder override conversion;
   - overlap detection;
   - `events.list` query boundaries;
   - sequential `events.insert` calls;
   - GIS token success and denial.
2. Run `node --test tests/google-calendar.test.js` and confirm module-not-found failure.
3. Implement a UMD module exposing:
   - `eventToGoogleEvent(event, messages)`;
   - `findConflicts(events, existingEvents)`;
   - `requestAccessToken(clientId, googleIdentity)`;
   - `listEvents(accessToken, range, fetchImpl)`;
   - `insertEvents(accessToken, events, messages, fetchImpl)`.
4. Use scopes `calendar.events calendar.readonly`, `singleEvents=true`, and `orderBy=startTime`.
5. Run focused tests until green.

### Task 3: Add settings, conflicts, and registration UI

**Files:**
- Modify: `tests/ui.test.js`
- Modify: `index.html`
- Modify: `ui.js`

1. Add failing helper tests for Client ID storage, conflict labels, and registration result state.
2. Add the GIS script and `google-calendar.js` before `ui.js`.
3. Add a Client ID input beside the AI key controls and store it under `dotodo.googleClientId`.
4. Replace the disabled Google Calendar button behavior with:
   - collect selected events;
   - request/reuse a memory-only token;
   - list existing events over the selected range;
   - store conflict messages on matching cards;
   - insert selected events;
   - append an assistant completion bubble containing count and Calendar link.
5. Render `기존 일정과 겹쳐요: {제목} {시간}` in inline and board cards.
6. On missing Client ID, GIS load failure, token denial, or auth failure, call the existing ICS download path.
7. Run UI and full Node tests.

### Task 4: Route chat exportAll through Calendar

**Files:**
- Modify: `tests/ui.test.js`
- Modify: `ui.js`

1. Add a failing test for choosing Calendar when connected and ICS otherwise.
2. Replace direct `downloadIcs()` handling for assistant `exportAll` with the shared calendar registration function.
3. Confirm disconnected flow still downloads ICS.
4. Run focused and full tests.

### Task 5: Browser verification and commit

**Files:**
- No production files unless verification exposes a tested defect.

1. Ensure `browser-harness` is installed with:
   `uv tool install --python 3.12 --upgrade --force browser-harness`.
2. Start the app at `http://localhost:8080`.
3. Open it with browser-harness and ask the user to enter the configured Client ID and complete Google consent.
4. Register selected events and verify the assistant completion bubble.
5. Inspect the created event and verify checklist text in description.
6. Register the same source again and verify overlap text on its card.
7. Run:
   `node --test tests/*.test.js`
   `git diff --check`
8. Commit implementation:
   `git commit -m "feat: add Google Calendar integration"`.
