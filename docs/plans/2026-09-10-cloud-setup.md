# 개인 보관함·공유 링크 운영 연결

## 운영 적용 상태 (2026-09-10)

- dotodo Supabase 프로젝트에 `10_personal_library.sql` 설치 완료. 두 테이블의 REST 조회 정상, Security Advisor 오류·경고 0건.
- Vercel Production에 Supabase 서버 환경변수 3개 등록 완료.
- 실제 Supabase Auth·REST에서 가상 계정 2개로 저장/복원, 재시도 중복 방지, 계정 간 접근 차단, 공유 생성/미리보기/해제 검증 완료. 검증 후 세션을 해제하고 가상 계정·데이터를 삭제했다.
- Supabase Google 공급자 활성화, 기존 웹 Client ID/Secret 연결, Google OAuth 콜백·Supabase Site URL 설정 완료. Google 앱은 현재 테스트 상태이며 실계정 로그인 최종 확인과 공개 설정이 남아 있다.
- 실제 이메일 수신과 실계정 Google 캘린더 등록은 위 DB 검증에 포함하지 않았다.

## 구현 범위

순수 JS와 Vercel 서버 함수를 유지한다. Supabase Auth Google 계정로 로그인하고 PostgreSQL에 선택한 일정·할 일의 사본을 저장한다. 보관함과 Google 계정 연결은 별개다. Google 캘린더의 자동 백그라운드 동기화는 포함하지 않는다.

- `snapshot.js`: 저장·공유용 허용 필드 검증. 원문·발신자·API 키·대상 명단·Google 참석자 정보를 제거한다.
- `api/cloud.js`: Google ID 토큰 검증·서버 세션 쿠키·보관함 CRUD·공유 생성/해제/조회/Google 등록. Supabase REST와 Auth API를 서버에서 호출한다.
- `cloud-client.js`, `cloud.css`: 보관함, 로그인, 저장·공유 미리보기. 체크리스트를 공유에서 제외할 수 있다.
- `share.html`, `share.js`: 가입 없는 공유 미리보기와 수신자의 Google 계정 등록.
- `supabase/schemas/10_personal_library.sql`: 새 프로젝트용 트랜잭션 SQL. 소유자별 RLS, 공유 내용 불변, 해제 후 재활성화 금지.

## 1. 프로젝트 키 준비

Supabase 프로젝트의 Project URL과 API Keys를 확인하고 `.env.local`에 다음 변수로 저장한다. 실제 키는 Git·문서·채팅에 넣지 않는다.

```dotenv
SUPABASE_URL=https://프로젝트참조.supabase.co
SUPABASE_ANON_KEY=프로젝트의_publishable_key_또는_legacy_anon_key
SUPABASE_SERVICE_ROLE_KEY=프로젝트의_secret_key_또는_legacy_service_role_key
APP_ORIGIN=https://dotodo-ten.vercel.app
```

`APP_ORIGIN`은 생략하면 위 라이브 도메인을 사용한다. POST는 이 원본만 허용한다. 프리뷰 도메인에서 쓰려면 해당 배포 환경의 원본 설정을 일치시켜야 한다. 모든 키는 서버 환경변수이며 `/api/config`로 반환하지 않는다.

## 2. 테이블 설치

Supabase SQL Editor에서 `supabase/schemas/10_personal_library.sql` 전체를 **새 프로젝트에 한 번** 실행한다. 기존 데이터 삭제 명령은 없다. 이미 테이블이 있는 프로젝트에서는 반복 실행하지 말고 현재 스키마를 비교한 뒤 별도 변경 SQL을 작성한다.

Data API에서 public 스키마가 활성화되어 있어야 한다. SQL은 authenticated의 필요한 권한과 소유자 RLS를 함께 설정하며 anon에는 테이블 접근을 허용하지 않는다. 공개 링크 조회는 서버의 secret/service role 키가 해시·만료·해제 조건으로 조회한다. SQL 설치 후 Supabase Security Advisor도 확인한다.

## 3. Google 로그인 설정

기존 Google Cloud 웹 OAuth 클라이언트의 Client ID와 Client Secret을 Supabase → Authentication → Sign In / Providers → Google에 등록하고 활성화한다. Skip nonce checks는 끈 상태로 유지한다. Client Secret은 Supabase 설정에만 필요하며 앱의 공개 설정이나 Vercel 함수에는 넣지 않는다. `.env.local`의 `GOOGLE_CLIENT_SECRET`은 운영 설정을 전달할 때만 사용한다.

- Google 승인된 JavaScript 원본: `https://dotodo-ten.vercel.app`
- Google 승인된 리디렉션 URI: `https://jwrdoeefnznwmtceecrf.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://dotodo-ten.vercel.app`

로그인 화면은 Google의 공식 버튼을 사용한다. 서버가 10분 nonce를 HttpOnly 쿠키에 저장하고 해시만 Google에 전달한다. ID 토큰과 원본 nonce를 Supabase에 교환해 받은 세션은 HttpOnly 쿠키에만 저장한다. 로그인 실패 시 새 nonce로 다시 준비한다. 기존 이메일 OTP 화면과 서버 발송 경로는 제거했다. 캘린더 동의는 별도로 받는다.

참고: [Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 4. Vercel 환경변수와 배포

기존 dotodo 프로젝트의 Production 환경에 같은 변수를 등록하고 재배포한다. `.env*`와 `supabase/`는 배포 파일에서 제외한다. 키를 명령 인수·터미널 로그에 출력하지 말고 stdin 또는 Vercel 대시보드를 사용한다.

Google 연결은 기존 `GOOGLE_CLIENT_ID`와 Google Cloud의 승인된 JavaScript origin을 사용한다. 공유받는 친구는 별도 두투두 가입 없이 자신의 Google 계정에 동의한다. `origin_mismatch`가 남아 있으면 공유 일정 등록도 작동하지 않는다.

## 동작과 경계

- 저장은 자동 동기화가 아닌 명시적인 사본 저장이다. 최대 일정 30개, 일정당 체크리스트 30개, 할 일 100개다. 보관함·공유 관리 목록은 최신 100개를 보여 준다.
- 저장한 묶음을 열면 현재 일정판을 바꿀지 확인한다. 원문은 저장하지 않으므로 복원한 사본에는 원문 근거가 없다. 수정 후 다시 저장하면 새 사본이다.
- 인증 토큰은 HttpOnly·Secure·SameSite=Lax 쿠키로만 보관한다. 서버는 `/auth/v1/user`로 사용자를 검증하고 사용자 토큰으로 RLS를 적용한다. 클라이언트의 owner_id는 사용하지 않는다.
- 공유는 생성 당시의 사본이며 7일 후 만료된다. URL 토큰은 fragment(`#...`)로 전달하고 DB에는 해시만 저장한다. 생성 재시도는 같은 요청 ID로 같은 링크를 반환한다.
- 링크는 생성 직후 복사한다. 관리 목록에서는 제목·만료·해제 상태를 확인하고 해제할 수 있다. 링크 원문을 재조회하는 API는 없다.
- 수신자 등록 때 서버가 활성 링크를 다시 조회하고, 고정된 일정 ID로 Google 등록을 시도한다. 일부 실패 후 재시도해도 성공했던 일정을 중복 생성하지 않는다.
- 링크를 해제해도 이미 복사한 친구의 일정은 삭제하지 않는다. Google 등록이 시작된 뒤 링크가 해제된 경우 진행 중인 요청까지 취소하지는 않는다.
- 원문을 제외하더라도 일정 제목·장소·체크리스트 자체에 개인정보가 있을 수 있으므로 생성 전에 실제 공유 내용이 표시된다.
- API 호출 제한은 인스턴스 단위다. Supabase Auth의 발송/검증 제한, Google·Vercel 프로젝트의 사용량 한도를 함께 설정한다.

## 검증

```text
node --test tests/*.test.js
node tests/audience-browser.cjs
node tests/calendar-browser.cjs
node tests/cloud-browser.cjs
node tests/cloud-rls.cjs
```

브라우저 테스트에는 Playwright가 필요하다. RLS 테스트는 테스트 전용 `@electric-sql/pglite@0.3.14`를 NODE_PATH 또는 `.vercel/qa-deps`에 설치해 실행한다. 운영 앱에 패키지 의존성을 추가하지 않는다.

`cloud-browser.cjs`는 실제 서버 핸들러와 가상 Supabase·Google 응답으로 Google 로그인 쿠키, 저장·새로고침·복원, 공유 필드 제외, 비로그인 수신자 등록, 재시도, 링크 해제, 계정 간 접근 차단을 확인한다. `cloud-rls.cjs`는 실제 PostgreSQL 엔진에서 SQL 설치·RLS·권한을 검증하지만 운영 Supabase의 Auth·REST 게이트웨이 설정까지 검증하지는 않는다.

운영 키·SQL·Google 설정 후에는 운영자가 로그인하고, 별도 계정에서 사본이 보이지 않는지, 친구가 공유 링크로 가상 일정을 등록하는지 확인한다. 실제 개인 대화나 실제 친구 캘린더를 에이전트가 임의 테스트 대상으로 사용하지 않는다.
