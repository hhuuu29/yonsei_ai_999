const test = require("node:test");
const assert = require("node:assert/strict");

function loadCalendar() {
  delete require.cache[require.resolve("../google-calendar.js")];
  return require("../google-calendar.js");
}

function event(overrides) {
  return Object.assign({
    eventId: "event-gather",
    title: "서울역 집합",
    start: new Date(2026, 8, 9, 8, 30),
    end: new Date(2026, 8, 9, 8, 50),
    allDay: false,
    location: "서울역",
    checklist: [
      { text: "명찰은 기차 안에서 배부", sourceMsgIndex: 0 },
      { text: "후드 수령", sourceMsgIndex: 1 }
    ],
    sourceMsgIndex: 0,
    reminders: [30]
  }, overrides);
}

test("선택 일정을 Google Calendar 요청 본문으로 변환한다", () => {
  const calendar = loadCalendar();
  const body = calendar.eventToGoogleEvent(event(), [
    { speaker: "운영진", text: "명찰은 기차 안에서 배부합니다." },
    { speaker: "운영진", text: "후드집업은 모두 가져오세요." }
  ]);

  assert.equal(body.summary, "서울역 집합");
  assert.deepEqual(body.start, { dateTime: "2026-09-09T08:30:00", timeZone: "Asia/Seoul" });
  assert.deepEqual(body.end, { dateTime: "2026-09-09T08:50:00", timeZone: "Asia/Seoul" });
  assert.equal(body.location, "서울역");
  assert.match(body.description, /명찰은 기차 안에서 배부/);
  assert.match(body.description, /후드 수령/);
  assert.match(body.description, /운영진: 명찰은 기차 안에서 배부합니다/);
  assert.equal(body.reminders.useDefault, false);
  assert.deepEqual(body.reminders.overrides, [{ method: "popup", minutes: 30 }]);
});

test("하루 종일 일정은 date 필드를 쓰고 알림이 없으면 reminders를 생략한다", () => {
  const calendar = loadCalendar();
  const body = calendar.eventToGoogleEvent(event({
    allDay: true,
    start: new Date(2026, 8, 10),
    end: new Date(2026, 8, 11),
    reminders: [],
    checklist: []
  }), []);

  assert.deepEqual(body.start, { date: "2026-09-10" });
  assert.deepEqual(body.end, { date: "2026-09-11" });
  assert.equal("reminders" in body, false);
});

test("시간이 겹치는 기존 일정은 카드 문구로 표시한다", () => {
  const calendar = loadCalendar();
  const conflicts = calendar.findConflicts(
    [event()],
    [{
      summary: "팀 스탠드업",
      start: { dateTime: "2026-09-09T08:40:00+09:00" },
      end: { dateTime: "2026-09-09T09:10:00+09:00" }
    }]
  );

  assert.deepEqual(conflicts, {
    "event-gather": ["기존 일정과 겹쳐요: 팀 스탠드업 08:40–09:10"]
  });
});

test("GIS 토큰 성공·거부와 Calendar list/insert를 mock으로 처리한다", async () => {
  const calendar = loadCalendar();
  const requests = [];
  const gis = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          assert.equal(config.client_id, "client.apps.googleusercontent.com");
          assert.match(config.scope, /calendar\.events/);
          assert.match(config.scope, /calendar\.readonly/);
          return {
            requestAccessToken() {
              config.callback({ access_token: "ya29.token", expires_in: 3600 });
            }
          };
        }
      }
    }
  };

  const token = await calendar.requestAccessToken({
    clientId: "client.apps.googleusercontent.com",
    googleIdentity: gis
  });
  assert.equal(token.accessToken, "ya29.token");

  const denied = await calendar.requestAccessToken({
    clientId: "client.apps.googleusercontent.com",
    googleIdentity: {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            return {
              requestAccessToken() {
                config.error_callback({ type: "popup_closed" });
              }
            };
          }
        }
      }
    }
  });
  assert.equal(denied.status, "denied");

  const selected = [
    event(),
    event({
      eventId: "event-mentoring",
      title: "멘토링",
      start: new Date(2026, 8, 9, 20, 0),
      end: new Date(2026, 8, 9, 20, 50),
      reminders: [],
      checklist: []
    })
  ];
  const result = await calendar.syncAndInsert({
    accessToken: token.accessToken,
    events: selected,
    messages: [{ speaker: "운영진", text: "명찰은 기차 안에서 배부합니다." }],
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (String(url).indexOf("/events?") >= 0) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [{
              summary: "기존 미팅",
              start: { dateTime: "2026-09-09T08:00:00+09:00" },
              end: { dateTime: "2026-09-09T09:00:00+09:00" }
            }]
          })
        };
      }
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gcal-" + body.summary,
          htmlLink: "https://calendar.google.com/event?eid=" + encodeURIComponent(body.summary),
          summary: body.summary
        })
      };
    }
  });

  assert.equal(requests[0].options.method, "GET");
  assert.match(requests[0].url, /timeMin=2026-09-09T08%3A30%3A00%2B09%3A00/);
  assert.match(requests[0].url, /timeMax=2026-09-09T20%3A50%3A00%2B09%3A00/);
  assert.match(requests[0].url, /singleEvents=true/);
  assert.equal(requests.filter((entry) => entry.options.method === "POST").length, 2);
  assert.equal(result.inserted.length, 2);
  assert.deepEqual(result.conflicts["event-gather"], [
    "기존 일정과 겹쳐요: 기존 미팅 08:00–09:00"
  ]);
  assert.match(result.calendarUrl, /calendar\.google\.com/);
});
