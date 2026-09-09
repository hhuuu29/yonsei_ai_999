# 두투두 (do-to-do)

카톡 단톡방 export → 일정·챙길 것 추출 → 비서와 대화 → Google Calendar 등록.
연세대 999 Trainthon 해커톤. 발표는 9/10 오전.

## 현재 상태 (Phase 2·나 필터·Vercel 배포 완료)
- index.html + 순수 JS 모듈, 프레임워크·빌드 없음
- window.DoToDo 순수 함수: parseKakaoMessages / parseScheduleFromKakao / eventsToIcs
- 폰·PC 포맷 모두 회귀 테스트 및 브라우저 흐름 검증 완료. LLM 응답 검증은 고정 fixture 기준
- 라이브: https://dotodo-ten.vercel.app

## Phase 2 원칙
- 프레임워크 마이그레이션 금지. 순수 JS, 모듈 파일만 추가
- Phase 1 순수 함수는 오프라인 폴백으로 유지
- API 키는 UI 입력 → 기본 localStorage, "이 브라우저에 기억"을 끄면 sessionStorage. 코드/레포에 절대 넣지 않음
- 디자인은 design/mockup.html이 정답. 색·타이포·레이아웃 그대로
- 기능 하나 끝날 때마다 main에 직접 커밋. PR 금지

## 작업 순서 (바꾸지 말 것)
1. [완료] LLM 추출 레이어 — 노이즈 제거, 일정별 체크리스트, 최신 공지 반영
2. [완료] UI 재구성 — 채팅 중심 + 타임라인 일정판 (mockup.html)
3. [완료] 챗 비서 — 추출 컨텍스트로 질문/지시 처리
4. [완료] Google Calendar — 등록 + 기존 일정 읽어 충돌 표시
5. [완료] Vercel 배포 — GitHub Pages 계획을 대체, 프로젝트 dotodo
6. [완료] 나 필터 — 이름 선택·저장, 대상별 일정판, 근거 이름 하이라이트
7. [완료] 데모 준비 — PC 대화 불러오기 버튼, composer 44px, 추출 로딩 말풍선

## 데모 데이터 (data/)
- trainthon-mobile.txt: 폰 카톡 내보내기 (9/9 08:13 기준)
- trainthon-pc.txt: PC 카톡 내보내기 (9/9 12:52 기준, 더 많음). 포맷 다름
- 파서는 두 포맷 모두 지원해야 하고, 검증은 두 파일 모두에 돌린다
- 데모는 pc 버전으로

정답 (두 파일 공통):
9/9 08:30 집합 / 9/9 08:57 KTX / 9/9 20:00 멘토링 / 9/9 21:00 Ben Q&A / 9/10 15:37 복귀 KTX
※ 원문 "9/8(목)"은 오타. 날짜-요일 불일치 경고가 붙어야 함 (데모 포인트)
※ 명찰: 9/7 "지참" → 9/9 08:12 "기차 안 배부"로 변경. 최신이 이겨야 함
