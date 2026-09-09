# 두투두 (DoToDo)

라이브: [https://dotodo-ten.vercel.app](https://dotodo-ten.vercel.app)

## 나 필터

- 파일 업로드 후 발신자 칩을 선택하거나 이름을 직접 입력한다. 이름은 localStorage에 저장되며 헤더의 `나: 이름`에서 변경하거나 해제할 수 있다.
- 이름을 선택하면 일정판을 `나에게 해당`과 `전체 공지`로 나눈다. 전원 공지와 내 이름·팀 대상은 상단, 다른 대상은 하단에 표시한다. 체크리스트도 항목별로 분리하며 일정 선택 상태는 유지한다.
- AI 추출의 events·checklist·todos는 `audience`를 가진다: `"all"`, 이름 배열, `"team:N"`. 대상 명단은 `audienceSourceMsgIndexes`, 확인된 팀 배정은 `teams`에 보존한다.
- API 키가 없으면 기존 룰 파서로 동작하며 대상 정보가 없는 항목은 전원 공지로 취급한다.
- PC 원문에는 신현우의 명찰 대상 명단과 별도의 후드 수령 명단이 있다. 22팀 배정은 없으므로 멘토링 시트 링크만으로 `team:22`를 추정하지 않는다.

검증: `node --test tests/*.test.js`. Playwright와 Edge가 있는 환경에서는 `node tests/audience-browser.cjs`로 두 export의 이름 선택·저장·층 분리·근거·모바일 UI를 검증한다. 브라우저 테스트의 Gemini 응답은 고정 fixture이며 실제 모델 정확도 검증과는 별개다.

카카오톡 대화보내기 텍스트에서 일정을 추출해 `.ics`로 저장하는 오프라인 웹앱.

## 사용

1. [`index.html`](./index.html)을 브라우저에서 연다 (빌드 없음).
2. 카카오톡 export `.txt`를 붙여넣거나 업로드한다.
3. **일정 찾기** → 카드에서 확인/수정 → **선택한 일정 .ics로 내보내기**.

## 제약 (Phase 1)

- 파일 하나: `index.html` (HTML+CSS+JS)
- npm / 빌드 / 외부 라이브러리 / CDN / 네트워크 요청 없음
- 일정 추출은 룰 기반만 (LLM 호출 없음)

## 순수 함수 (`window.DoToDo`)

- `parseKakaoMessages(text)`
- `parseScheduleFromKakao(text)`
- `eventsToIcs(events)`
