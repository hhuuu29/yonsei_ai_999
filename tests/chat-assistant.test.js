const test = require("node:test");
const assert = require("node:assert/strict");

function loadAssistant() {
  delete require.cache[require.resolve("../chat-assistant.js")];
  return require("../chat-assistant.js");
}

function context(overrides) {
  return Object.assign({
    apiKey: "test-key",
    userText: "집합 때 뭐 챙겨?",
    messages: [{
      speaker: "운영진",
      sentAt: new Date("2026-09-09T08:12:00+09:00"),
      text: "명찰은 기차 안에서 배부합니다."
    }],
    events: [{
      eventId: "event-gather",
      title: "서울역 집합",
      start: new Date(2026, 8, 9, 8, 30),
      checklist: [{ text: "명찰 배부", sourceMsgIndex: 0 }]
    }],
    todos: [{ text: "오픈프로필 변경", sourceMsgIndex: 0 }],
    history: [{ role: "user", text: "일정 알려줘" }, { role: "assistant", text: "5개예요." }]
  }, overrides);
}

test("질문 mock 응답의 답변·근거·추천 질문을 JSON으로 파싱한다", async () => {
  const assistant = loadAssistant();
  const payload = {
    reply: "명찰과 후드를 챙기세요.",
    sourceMsgIndexes: [0, 99],
    actions: [],
    suggestedQuestions: ["기차 시간은?", "복귀 일정은?"]
  };
  let request;
  const result = await assistant.ask(context({
    fetchImpl: async (url, options) => {
      request = { url, options };
      const json = JSON.stringify(payload);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [
                { text: json.slice(0, 30) },
                { thoughtSignature: "무시" },
                { text: json.slice(30) }
              ]
            }
          }]
        })
      };
    }
  }));

  assert.equal(result.status, "success");
  assert.equal(result.reply, payload.reply);
  assert.deepEqual(result.sourceMsgIndexes, [0]);
  assert.deepEqual(result.suggestedQuestions, payload.suggestedQuestions);
  assert.match(request.url, new RegExp(`${assistant.MODEL}:generateContent$`));
  const body = JSON.parse(request.options.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "low" });
  assert.equal("temperature" in body.generationConfig, false);
  assert.match(body.systemInstruction.parts[0].text, /event-gather/);
  assert.match(body.systemInstruction.parts[0].text, /2026-09-09T08:12:00\+09:00/);
  assert.deepEqual(body.contents.map((entry) => entry.role), ["user", "model", "user"]);
});

test("지시 mock 응답의 지원 actions를 보존한다", async () => {
  const assistant = loadAssistant();
  const payload = {
    reply: "알림을 추가하고 날짜를 바로잡았어요.",
    sourceMsgIndexes: [],
    actions: [
      { type: "addReminder", eventId: "event-gather", minutesBefore: 30 },
      { type: "applySuggestedDate", eventId: "event-return" },
      { type: "unsupported", eventId: "event-gather" }
    ],
    suggestedQuestions: ["다른 일정도 확인할까요?", "시간도 바꿀까요?"]
  };
  const result = await assistant.ask(context({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
      })
    })
  }));

  assert.equal(result.status, "success");
  assert.deepEqual(result.actions.map((action) => action.type), [
    "addReminder",
    "applySuggestedDate"
  ]);
});

test("429 응답은 재시도 안내를 반환한다", async () => {
  const assistant = loadAssistant();
  const result = await assistant.ask(context({
    fetchImpl: async () => ({ ok: false, status: 429 })
  }));

  assert.equal(result.status, "rate_limited");
  assert.equal(result.reply, "잠시 후 다시 시도해주세요");
});
