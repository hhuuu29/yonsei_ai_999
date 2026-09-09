# yonsei_ai_999 — CalPass

텍스트 일정을 `.ics` 캘린더 파일로 바꾸는 오프라인 도구입니다.  
연세대학교 창업지원단 AI 창업캠프 999 (Trainthon).

## Phase 1 — KTX / 모바일 (현재)

**단일 파일:** [`index.html`](./index.html)

제약:
- `index.html` 하나만 사용
- npm · 빌드 도구 · 번들러 · 프레임워크 금지
- 외부 라이브러리 / CDN 금지 (순수 JS)
- 네트워크 요청 0 · 완전 오프라인
- 모바일 브라우저에서 파일을 열면 바로 실행

사용법: `index.html`을 폰/랩탑 브라우저로 연 뒤, 일정 텍스트를 붙여넣고 **파싱하기** → **ICS 다운로드**.

핵심 순수 함수 (Phase 2에서 재사용):
- `parseSchedule(text, options?)` → `{ events, warnings }`
- `eventsToIcs(events, options?)` → ICS 문자열

브라우저 콘솔에서 `window.CalPass`로도 호출할 수 있습니다.

## Phase 2 — 강릉 랩탑

Phase 1 제약을 해제하고 다음을 추가합니다.
- 프레임워크 / 빌드 도구 / 외부 API 허용
- Google Calendar OAuth 연동
- LLM 추출 레이어

**Phase 1의 `parseSchedule` · `eventsToIcs` 로직은 순수 함수로 유지한 채 그대로 재사용합니다.**
