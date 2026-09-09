# Google Calendar 연동 설계

## 목표

선택한 두투두 일정을 브라우저에서 Google Calendar에 직접 등록한다. 백엔드 없이 Google Identity Services(GIS) OAuth 토큰과 Calendar REST API를 사용한다. 연결할 수 없으면 기존 ICS 다운로드를 유지한다.

LLM 일정 추출에는 원문에서 확인되지 않는 숫자, 이름, 번호를 추정하지 않는 규칙을 추가한다. 불확실한 정보는 제목과 checklist에서 제외한다.

## 구조

- `google-calendar.js`
  - GIS 토큰 클라이언트 초기화와 토큰 요청
  - Calendar `events.list`, `events.insert` 호출
  - 두투두 이벤트를 Google Calendar 요청 본문으로 변환
  - 기존 일정과의 시간 겹침 계산
- `ui.js`
  - Client ID 설정과 `localStorage` 저장
  - 선택 일정 등록 흐름 및 ICS 폴백
  - 충돌 경고를 일정 카드에 표시
  - 완료 결과와 캘린더 링크를 비서 말풍선에 추가
- `index.html`
  - GIS 스크립트 로드
  - Client ID 설정 필드 및 상태 UI

## 인증과 저장

OAuth 웹 Client ID의 승인된 JavaScript 원본은 `http://localhost:8080`으로 설정한다. Client ID만 `localStorage`에 저장한다. access token은 페이지 메모리에만 유지하고 만료되거나 인증이 실패하면 새 토큰을 요청한다.

Scopes:

- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.readonly`

## 등록 흐름

1. 선택 일정의 최소 시작부터 최대 종료까지 `events.list`로 기존 일정을 조회한다.
2. 두투두 일정과 기존 일정의 시간이 겹치면 해당 카드에 `기존 일정과 겹쳐요: {제목} {시간}`을 표시한다.
3. 사용자가 요청한 선택 일정은 충돌 여부와 관계없이 `events.insert`로 등록한다.
4. description에는 checklist와 원문 근거 요약을 넣는다.
5. assistant가 추가한 reminder는 Google `reminders.overrides`로 변환한다.
6. 성공하면 챗 영역에 `N개 추가했어요`와 Google Calendar 링크를 표시한다.

GIS 미로딩, Client ID 미설정, 팝업 취소, 토큰 만료 또는 API 인증 오류에서는 ICS 다운로드로 폴백한다. 챗 비서의 `exportAll` 액션도 같은 등록 흐름을 호출하며 연결할 수 없으면 ICS를 저장한다.

## 검증

- 변환, 충돌 계산, list/insert 요청은 Node mock 테스트로 검증한다.
- `browser-harness`로 `http://localhost:8080`을 열고 사용자가 Client ID 입력 및 Google 동의를 완료한 뒤 실제 등록을 확인한다.
- 등록된 이벤트 description의 checklist, 두 번째 등록 전 충돌 표시, 완료 말풍선을 확인한다.
