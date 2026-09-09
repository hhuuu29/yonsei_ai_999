# 두투두 (DoToDo)

라이브: [https://dotodo-ten.vercel.app](https://dotodo-ten.vercel.app)

카카오톡 단톡방 대화에서 일정과 챙길 것을 추출하고, 내게 해당하는 공지를 확인하며 비서와 대화해 Google Calendar에 등록하는 웹앱.

## 제출 정보

| 항목 | 링크 / 정보 |
| --- | --- |
| 레포 | [hhuuu29/yonsei_ai_999](https://github.com/hhuuu29/yonsei_ai_999) |
| 라이브 URL | [dotodo-ten.vercel.app](https://dotodo-ten.vercel.app) |
| 최종 제출 커밋 | [main 최신 커밋 및 전체 해시 확인](https://github.com/hhuuu29/yonsei_ai_999/commits/main) |
| 기능 완료 커밋 | [`e5f79ee`](https://github.com/hhuuu29/yonsei_ai_999/commit/e5f79ee9a6d62dda8e9d9870f16e7b5a81ddf2e6) — 데모 준비 완료 |
| 배포 | Vercel 프로젝트 `dotodo`, 정적 파일 배포, 빌드 없음 |

최종 제출 커밋은 이 문서 정리까지 포함한 main의 최신 커밋이다. 로컬에서는 `git rev-parse HEAD`로 전체 해시를 확인할 수 있다.

## 발표 데모 순서

사전 준비: 라이브 사이트의 **AI 정제**를 열어 Gemini API 키와 Google OAuth 웹 클라이언트 ID를 입력한다. Google Calendar 데모용 계정과 라이브 도메인의 OAuth 설정을 준비한다. 키는 코드나 레포에 넣지 않는다.

1. **데모 버튼** — 첫 인사 아래 **데모: 트레인톤 단톡방 불러오기**를 누른다. PC 카톡 파일을 불러오고 `36개 메시지 읽는 중…` 말풍선이 표시된다.
2. **이름 선택** — “이 방에서 당신은 누구예요?”에서 **신현우**를 직접 입력하고 **선택**을 누른다. `나에게 해당`과 `전체 공지`를 비교하고 명찰 항목의 근거에서 이름을 확인한다. 헤더의 `나: 신현우`로 변경할 수 있다.
3. **질문** — “나는 무엇을 챙겨야 해?”를 입력하고 비서 답변과 근거를 펼친다. 이어 “복귀 KTX 날짜는?”으로 원문의 `9/8(목)` 날짜·요일 불일치와 최신 명찰 배부 공지를 보여준다.
4. **캘린더 추가** — 일정판에서 등록할 일정을 선택하고 **구글 캘린더에 추가**를 누른다. Google 계정 연결 후 등록 결과와 기존 일정 충돌 표시를 확인한다. 모바일에서는 헤더의 **일정** 버튼으로 일정판을 연다.

AI 키가 없으면 룰 파서 결과를 표시한다. Google 연결을 할 수 없으면 `.ics`로 저장하며, 일정판의 **.ics 저장**도 사용할 수 있다. LLM 결과는 실행마다 달라질 수 있으므로 발표 전 실제 키로 한 번 확인한다.

## 나 필터

- 파일 업로드 후 발신자 칩을 선택하거나 이름을 직접 입력한다. 이름은 localStorage에 저장되며 헤더의 `나: 이름`에서 변경하거나 해제할 수 있다.
- 이름을 선택하면 일정판을 `나에게 해당`과 `전체 공지`로 나눈다. 전원 공지와 내 이름·팀 대상은 상단, 다른 대상은 하단에 표시한다. 체크리스트도 항목별로 분리하며 일정 선택 상태는 유지한다.
- AI 추출의 events·checklist·todos는 `audience`를 가진다: `"all"`, 이름 배열, `"team:N"`. 대상 명단은 `audienceSourceMsgIndexes`, 확인된 팀 배정은 `teams`에 보존한다.
- API 키가 없으면 기존 룰 파서로 동작하며 대상 정보가 없는 항목은 전원 공지로 취급한다.
- PC 원문에는 신현우의 명찰 대상 명단과 별도의 후드 수령 명단이 있다. 22팀 배정은 없으므로 멘토링 시트 링크만으로 `team:22`를 추정하지 않는다.

검증: `node --test tests/*.test.js`. Playwright와 Edge가 있는 환경에서는 `node tests/audience-browser.cjs`로 두 export의 이름 선택·저장·층 분리·근거·모바일 UI를 검증한다. 브라우저 테스트의 Gemini 응답은 고정 fixture이며 실제 모델 정확도 검증과는 별개다.

## 실행 구조

- `index.html` + 순수 JS 모듈. 프레임워크·빌드 없음.
- 라이브 사이트 또는 정적 HTTP 서버에서 실행한다. 데모 버튼은 `data/trainthon-pc.txt`를 fetch하므로 HTTP 환경이 필요하다.
- 직접 파일 업로드와 카톡 export 붙여넣기도 지원한다.
- Phase 1의 순수 함수와 룰 파서는 오프라인 폴백으로 유지한다. AI 추출·챗 비서·Google Calendar에는 네트워크 연결이 필요하다.

## 순수 함수 (`window.DoToDo`)

- `parseKakaoMessages(text)`
- `parseScheduleFromKakao(text)`
- `eventsToIcs(events)`
