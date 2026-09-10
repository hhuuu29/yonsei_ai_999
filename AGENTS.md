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
- 기본 Gemini 키는 Vercel Production의 GEMINI_API_KEY에 저장, /api/gemini 서버 함수로 호출. 코드/레포/브라우저 응답에 절대 넣지 않음. .env*는 Git·배포 제외
- 개인 키 입력은 설정 안의 선택 기능. 기본 localStorage, "이 브라우저에 기억"을 끄면 sessionStorage
- 사용자 요청으로 디자인 전면 개편 완료: app.css의 흰색·청회색·파란색 UI가 현재 기준. design/mockup.html은 이전 시안
- 기능 하나 끝날 때마다 main에 직접 커밋. PR 금지

## 작업 순서 (바꾸지 말 것)
1. [완료] LLM 추출 레이어 — 노이즈 제거, 일정별 체크리스트, 최신 공지 반영
2. [완료] UI 재구성 — 채팅 중심 + 타임라인 일정판 (mockup.html)
3. [완료] 챗 비서 — 추출 컨텍스트로 질문/지시 처리
4. [완료] Google Calendar — 등록 + 기존 일정 읽어 충돌 표시
5. [완료] Vercel 배포 — GitHub Pages 계획을 대체, 프로젝트 dotodo
6. [완료] 나 필터 — 이름 선택·저장, 대상별 일정판, 근거 이름 하이라이트
7. [완료] 데모 준비 — PC 대화 불러오기 버튼, composer 44px, 추출 로딩 말풍선
8. [완료] 기본 AI 서버 연결·UI 개편 — Vercel 환경변수, 선택형 개인 키, 클립 첨부 아이콘. 가상 일정으로 실제 Gemini 추출·비서 응답 검증
9. Google Calendar 서비스 기본 연결 — GOOGLE_CLIENT_ID 환경변수, 사용자 설정 입력 없음, 동의 후 직접 등록. 자동 ICS 폴백 제거. 실서비스 OAuth 설정 대기
10. [구현 완료·실계정 검증 대기] 앱 내 캘린더 관리 — 헤더 캘린더 버튼, 월간·일별 조회, 생성·수정·삭제. 페이지네이션, ETag 충돌 검사, 새 일정 생성 재시도 중복 방지. 참석자가 있는 일정은 읽기 전용. 모의 API 브라우저 검증 완료
11. [구현 완료·운영 연결 대기] 개인 보관함·친구 공유 — Supabase Google 로그인, 서버 세션 쿠키, 일정·할 일 사본 저장/복원/삭제. 가입 없는 링크 미리보기, 수신자 Google 등록, 7일 만료·해제·중복 방지. 모의 API 브라우저와 로컬 PostgreSQL RLS 검증 완료. 설치: docs/plans/2026-09-10-cloud-setup.md

## 첫 운영 버전 확정 (2026-09-10)
- 개인 비서 + 친구에게 일정 공유. 팀 공동 편집은 이후 범위
- 설계: docs/plans/2026-09-10-personal-assistant-design.md
- 새 Supabase 프로젝트 연결·Email 인증 활성화 확인, Vercel Production 서버 환경변수 3개 등록 완료. 운영 SQL 설치와 실제 Auth·REST 저장/복원·계정 격리·공유 해제 검증 완료. Security Advisor 오류·경고 0건. Google 공급자·OAuth 콜백·Site URL 연결 완료. Google 앱 공개와 실계정 로그인 검증은 대기
- 현재 캘린더는 로그인한 Google 계정의 기본 캘린더를 직접 사용. 토큰은 메모리에만 보관하고 자동 백그라운드 동기화는 제공하지 않음

## 데모 데이터 (data/)
- trainthon-mobile.txt: 폰 카톡 내보내기 (9/9 08:13 기준)
- trainthon-pc.txt: PC 카톡 내보내기 (9/9 12:52 기준, 더 많음). 포맷 다름
- 파서는 두 포맷 모두 지원해야 하고, 검증은 두 파일 모두에 돌린다
- 데모는 pc 버전으로

정답 (두 파일 공통):
9/9 08:30 집합 / 9/9 08:57 KTX / 9/9 20:00 멘토링 / 9/9 21:00 Ben Q&A / 9/10 15:37 복귀 KTX
※ 원문 "9/8(목)"은 오타. 날짜-요일 불일치 경고가 붙어야 함 (데모 포인트)
※ 명찰: 9/7 "지참" → 9/9 08:12 "기차 안 배부"로 변경. 최신이 이겨야 함
