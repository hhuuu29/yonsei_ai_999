# 두투두 (DoToDo)

라이브: [https://dotodo-ten.vercel.app](https://dotodo-ten.vercel.app)

정적 데모: [GitHub Pages](https://hhuuu29.github.io/yonsei_ai_999/)

카카오톡 단톡방 대화에서 일정과 챙길 것을 추출하고, 내게 해당하는 공지를 확인하며 비서와 대화해 Google Calendar에 등록하는 웹앱.

## 제출 정보

| 항목 | 링크 / 정보 |
| --- | --- |
| 레포 | [hhuuu29/yonsei_ai_999](https://github.com/hhuuu29/yonsei_ai_999) |
| 라이브 URL | [dotodo-ten.vercel.app](https://dotodo-ten.vercel.app) |
| 최종 제출 커밋 | [main 최신 커밋 및 전체 해시 확인](https://github.com/hhuuu29/yonsei_ai_999/commits/main) |
| 기능 완료 커밋 | [`e5f79ee`](https://github.com/hhuuu29/yonsei_ai_999/commit/e5f79ee9a6d62dda8e9d9870f16e7b5a81ddf2e6) — 데모 준비 완료 |
| 배포 | Vercel 프로젝트 `dotodo`, 정적 프런트 + Gemini 서버 함수, 빌드 없음 |

최종 제출 커밋은 이 문서 정리까지 포함한 main의 최신 커밋이다. 로컬에서는 `git rev-parse HEAD`로 전체 해시를 확인할 수 있다.

## 발표 데모 순서

일반 사용자는 Gemini 키나 Google Client ID 입력 없이 바로 시작한다. **구글 캘린더에 추가**를 누르면 Google 계정 연결·동의 후 선택한 일정이 바로 등록된다.

1. **데모 버튼** — 첫 인사 아래 **데모: 트레인톤 단톡방 불러오기**를 누른다. PC 카톡 파일을 불러오고 `36개 메시지 읽는 중…` 말풍선이 표시된다.
2. **이름 선택** — “이 방에서 당신은 누구예요?”에서 **신현우**를 직접 입력하고 **선택**을 누른다. `나에게 해당`과 `전체 공지`를 비교하고 명찰 항목의 근거에서 이름을 확인한다. 헤더의 `나: 신현우`로 변경할 수 있다.
3. **질문** — “나는 무엇을 챙겨야 해?”를 입력하고 비서 답변과 근거를 펼친다. 이어 “복귀 KTX 날짜는?”으로 원문의 `9/8(목)` 날짜·요일 불일치와 최신 명찰 배부 공지를 보여준다.
4. **캘린더 추가** — 일정판에서 등록할 일정을 선택하고 **구글 캘린더에 추가**를 누른다. Google 계정 연결 후 등록 결과와 기존 일정 충돌 표시를 확인한다. 모바일에서는 헤더의 **일정** 버튼으로 일정판을 연다.

기본 AI 연결에 실패하면 룰 파서 결과를 표시한다. Google 연결 취소·실패 시 재시도를 안내하며 파일을 자동 다운로드하지 않는다. 별도의 **.ics 저장** 버튼을 직접 누르면 파일로 내보낼 수 있다. LLM 결과는 실행마다 달라질 수 있다.

## 앱 안에서 캘린더 관리

헤더의 **캘린더 → Google 연결 · 새로고침**으로 기본 캘린더를 불러온다. 월을 이동하고 날짜를 선택하면 해당 날짜의 일정을 볼 수 있다. **일정 만들기** 또는 기존 일정을 눌러 제목·장소·시간을 편집한다. 저장과 삭제는 Google에도 반영된다. 종일 일정의 종료일은 마지막 날의 다음 날이다.

수정·삭제 시 원격 버전을 검사하며, 다른 곳에서 변경됐다면 새로고침을 요청한다. 새 일정 생성 실패 후 저장을 재시도하면 같은 ID를 사용한다. 초대받은 일정, 참석자가 있는 일정, 특수 일정은 조회만 지원하고 반복 일정은 선택한 발생 항목만 수정한다.

한국 시간(서울)으로 표시하며, 앱을 열거나 새로고침할 때 Google 데이터를 읽는다. 자동 백그라운드 동기화는 아직 제공하지 않는다. 실계정 연결은 위 라이브 도메인의 OAuth 원본 설정을 완료해야 한다.

## 내 보관함과 친구에게 일정 공유

**Google 로그인·DB 연결 완료:** Google로 보관함에 로그인한다. Supabase 공급자와 Google OAuth 콜백을 연결했다. 운영 DB 저장/복원·계정 간 접근 차단·공유 생성/해제 검증 완료. 실계정 로그인 최종 확인과 Google 앱 공개 설정은 별도 확인한다.

- 일정판의 **보관함에 저장** → Google 로그인 → 저장할 내용 확인. 원문을 제외한 일정·할 일의 사본을 보관한다. 헤더 **보관함**에서 다시 열거나 삭제한다.
- **친구에게 공유** → 체크리스트 포함 여부 확인 → **이 내용으로 공유 링크 만들기**. 링크를 복사해 원하는 사람에게 직접 보낸다.
- 받은 사람은 가입 없이 미리보고 **내 Google 캘린더에 추가**로 자신의 기본 캘린더에 복사한다. 재시도는 중복 등록하지 않는다.
- 링크는 7일 후 만료된다. 보관함의 **공유 링크 관리**에서 해제할 수 있다. 이미 친구가 복사한 일정은 유지된다.

설치 SQL, 서버 환경변수, Google 로그인 설정과 검증 방법은 [운영 연결 안내](docs/plans/2026-09-10-cloud-setup.md)를 참고한다.

검증: `node --test tests/*.test.js`, Playwright가 설치된 환경에서 `node tests/calendar-browser.cjs`와 `node tests/audience-browser.cjs`. 브라우저 테스트는 Google·Gemini 모의 API를 사용하며 실제 개인 일정에 쓰지 않는다.

## Google Calendar 설정 (운영자 전용)

- Google Cloud 프로젝트에서 Calendar API를 사용 설정하고 Google Auth Platform에서 OAuth 동의 화면 및 **웹 애플리케이션** 클라이언트를 생성한다.
- 승인된 JavaScript 원본에 `https://dotodo-ten.vercel.app`을 등록한다. 팝업 토큰 방식이므로 클라이언트 비밀은 사용하지 않는다.
- Vercel Production 환경변수 `GOOGLE_CLIENT_ID`에 `…apps.googleusercontent.com` 값을 등록하고 재배포한다. `/api/config`는 공개 Client ID만 반환한다. 사용자는 설정을 입력하거나 변경하지 않는다.
- 테스트 상태에서는 Google 콘솔에 허용한 테스트 사용자만 연결할 수 있다. 일반 공개 사용은 Google OAuth 게시·검증 요구사항을 충족해야 한다.
- 연결 토큰은 메모리에만 보관한다. 만료되면 추가 버튼에서 다시 연결하며 동의 직후 등록을 이어간다.

## 기본 AI 설정 (운영자)

- Vercel 프로젝트의 Production 환경변수에 `GEMINI_API_KEY`를 등록하고 다시 배포한다. 사용자 브라우저는 `/api/gemini`를 호출하며 서버만 키를 사용한다.
- 서버는 모델·출력 토큰 수를 고정하고 요청 크기·동일 출처를 검사한다. 인스턴스별 분당 요청 제한을 두며, 전체 비용 한도는 별도로 Vercel/Google 프로젝트에서 설정한다.
- `.env.local` 등 `.env*` 파일은 Git과 배포 대상에서 제외한다. 키를 프런트 코드에 넣지 않는다.
- 개인 키는 **설정 → 개인 API 키 사용 (선택)**에서 지정할 수 있다. 이 경우 해당 브라우저가 Gemini에 직접 요청한다.
- 단순 정적 HTTP 서버에서는 서버 함수를 실행하지 않으므로 기본 AI는 Vercel 배포 또는 `vercel dev`에서 사용한다. 개인 키 또는 오프라인 룰 파서도 지원한다.

## 나 필터

- 파일 업로드 후 발신자 칩을 선택하거나 이름을 직접 입력한다. 이름은 localStorage에 저장되며 헤더의 `나: 이름`에서 변경하거나 해제할 수 있다.
- 이름을 선택하면 일정판을 `나에게 해당`과 `전체 공지`로 나눈다. 전원 공지와 내 이름·팀 대상은 상단, 다른 대상은 하단에 표시한다. 체크리스트도 항목별로 분리하며 일정 선택 상태는 유지한다.
- AI 추출의 events·checklist·todos는 `audience`를 가진다: `"all"`, 이름 배열, `"team:N"`. 대상 명단은 `audienceSourceMsgIndexes`, 확인된 팀 배정은 `teams`에 보존한다.
- 기본 AI 연결이 실패하면 기존 룰 파서로 동작하며 대상 정보가 없는 항목은 전원 공지로 취급한다.
- PC 원문에는 신현우의 명찰 대상 명단과 별도의 후드 수령 명단이 있다. 22팀 배정은 없으므로 멘토링 시트 링크만으로 `team:22`를 추정하지 않는다.

검증: `node --test tests/*.test.js`. Playwright와 Edge가 있는 환경에서는 `node tests/audience-browser.cjs`로 두 export의 이름 선택·저장·층 분리·근거·모바일 UI를 검증한다. 브라우저 테스트의 Gemini 응답은 고정 fixture이며 실제 모델 정확도 검증과는 별개다.

기본 AI 서버 연결은 키가 저장되지 않은 새 브라우저에서 가상 일정의 실제 Gemini 추출 및 비서 답변으로 확인했다. 개인 카톡 원문은 이 실서비스 테스트에 전송하지 않았다.

## 실행 구조

- `index.html` + `app.css` + 순수 JS 모듈 + `api/gemini.js`. 프레임워크·빌드 없음.
- 라이브 사이트 또는 정적 HTTP 서버에서 실행한다. 데모 버튼은 `data/trainthon-pc.txt`를 fetch하므로 HTTP 환경이 필요하다.
- 직접 파일 업로드와 카톡 export 붙여넣기도 지원한다.
- Phase 1의 순수 함수와 룰 파서는 오프라인 폴백으로 유지한다. AI 추출·챗 비서·Google Calendar에는 네트워크 연결이 필요하다.

### GitHub Pages 배포

- 저장소 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택한다.
- `.github/workflows/pages.yml`은 `main` push 또는 수동 실행 시 기존 테스트를 실행하고 Pages에 배포한다. 별도 빌드·프레임워크·패키지 설치는 없다.
- 배포 파일은 `index.html`, `app.css`, 네 개의 JS 파일, `data/`의 세 데모 파일만 명시적으로 복사한다. 서버 함수·환경변수 파일·저장소 메타데이터는 업로드하지 않는다.
- CSS·스크립트·데모 fetch 경로는 상대 경로이므로 프로젝트 경로 `/yonsei_ai_999/`에서도 동작한다. 새 정적 파일을 추가하면 workflow의 복사 목록도 갱신한다.
- **Pages는 정적 데모다.** 파일 업로드·PC 데모·룰 추출·나 필터·수동 ICS 저장을 사용할 수 있다. `/api/gemini`와 `/api/config`를 실행할 서버가 없어 기본 AI 추출·AI 비서·Google Calendar 직접 연결은 제공되지 않는다. 기본 AI 실패 시 기존 룰 파서로 폴백하며, 선택형 개인 Gemini 키를 입력하면 AI 기능을 사용할 수 있다. 기본 AI와 Calendar 서비스 연결에는 위 Vercel 사이트를 사용한다.
- Vercel 설정과 완성된 기능 코드는 그대로 유지한다. Gemini 키를 Pages 변수나 정적 파일에 넣지 않는다.

## 순수 함수 (`window.DoToDo`)

- `parseKakaoMessages(text)`
- `parseScheduleFromKakao(text)`
- `eventsToIcs(events)`
