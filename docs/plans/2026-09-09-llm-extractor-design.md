# LLM 추출 레이어 설계

## 목표

기존 룰 파서 결과를 즉시 보여준 뒤, API 키가 있으면 전체 카카오톡 메시지와 룰 후보를 Gemini로 한 번에 보내 일정·체크리스트·할 일을 정리한다. Gemini 호출이 불가능하거나 실패하면 룰 결과를 그대로 유지한다.

## 구조

- `llm-extractor.js`는 일반 스크립트로 로드하며 `window.TalkCalLLM`을 제공한다.
- 기본 모델은 한 줄 상수 `gemini-3-flash-preview`로 둔다.
- Gemini 요청은 `responseMimeType: "application/json"`과 `thinkingConfig: { thinkingLevel: "low" }`를 사용하며 `temperature`는 보내지 않는다.
- 응답은 `candidates[0].content.parts`의 `text` 필드만 이어 붙여 JSON으로 파싱한다.
- 일정 수는 제한하지 않고, 일정별 checklist만 최대 7개로 정규화한다.

## 데이터 흐름

1. 기존 룰 파서가 메시지와 후보 일정을 만든다.
2. UI는 룰 결과를 즉시 렌더링한다.
3. sessionStorage에 키가 있으면 LLM 추출을 자동 실행한다.
4. 성공하면 검증·정규화한 events/todos로 교체한다.
5. 무키, 429, 네트워크·응답 오류에서는 룰 결과를 유지한다.

## 검증

Node 내장 테스트로 mock 성공, HTTP 429, 무키 폴백을 검증한다. 실제 API 호출은 하지 않는다.
