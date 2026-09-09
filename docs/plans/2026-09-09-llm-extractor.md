# LLM Extractor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gemini 구조화 출력을 이용해 카카오톡 메시지에서 일정·체크리스트·할 일을 정리하고 기존 룰 파서를 안전한 폴백으로 유지한다.

**Architecture:** 브라우저 일반 스크립트 `llm-extractor.js`가 프롬프트 생성, REST 호출, 응답 정규화, 폴백을 담당한다. `index.html`은 룰 결과를 먼저 렌더링한 뒤 API 키가 있을 때만 비동기 LLM 결과를 적용한다.

**Tech Stack:** 순수 JavaScript, Gemini REST API, Node.js 내장 `node:test`

---

### Task 1: LLM 추출 모듈

**Files:**
- Create: `llm-extractor.js`
- Create: `tests/llm-extractor.test.js`

1. mock 성공, 429, 무키 폴백 테스트를 작성한다.
2. `node --test tests/llm-extractor.test.js`가 모듈 부재로 실패하는지 확인한다.
3. Gemini 요청·응답 파싱·정규화·폴백을 최소 구현한다.
4. 같은 명령으로 세 테스트 통과를 확인한다.

### Task 2: UI와 ICS 연동

**Files:**
- Modify: `index.html`

1. API 키 입력과 sessionStorage 저장, LLM 활성 상태를 추가한다.
2. 룰 결과 즉시 렌더링 후 자동 LLM 추출을 연결한다.
3. 429 상태 문구와 todos 표시를 연결한다.
4. checklist와 정리 메시지를 ICS DESCRIPTION에 추가하되 기존 `eventsToIcs(events, options)` 호출을 유지한다.

### Task 3: 전체 검증과 커밋

1. 두 데이터 파일의 메시지 수가 26개와 36개인지 확인한다.
2. mock 성공, 429, 무키 폴백 테스트를 실행한다.
3. `git diff --check`와 작업 파일 진단을 확인한다.
4. 변경 전체를 커밋하고 `main`에 푸시한다.
