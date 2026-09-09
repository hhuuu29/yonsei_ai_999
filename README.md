# 두투두 (DoToDo)

라이브: [https://dotodo-ten.vercel.app](https://dotodo-ten.vercel.app)

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
