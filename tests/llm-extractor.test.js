const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MODULE_PATH = "../llm-extractor.js";
const ROOT = path.join(__dirname, "..");

function loadExtractor() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

function ruleFallback() {
  return {
    events: [{
      title: "룰 일정",
      start: new Date("2026-09-09T08:30:00+09:00"),
      end: new Date("2026-09-09T09:30:00+09:00"),
      checklist: []
    }],
    warnings: []
  };
}

function loadDoToDo() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const element = () => ({
    addEventListener() {},
    appendChild() {},
    setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} },
    focus() {},
    files: [],
    value: "",
    disabled: false,
    hidden: false,
    textContent: "",
    className: "",
    innerHTML: ""
  });
  const context = {
    console: { info() {}, warn() {} },
    window: {},
    document: { getElementById: element, createElement: element, body: element() },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    Blob: function Blob() {},
    URL: { createObjectURL() {}, revokeObjectURL() {} },
    setTimeout() {},
    Date
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  return context.window.DoToDo;
}

function successfulPayload() {
  const events = [
    {
      title: "집합",
      start: "2026-09-09T08:30:00+09:00",
      end: "2026-09-09T08:50:00+09:00",
      allDay: false,
      location: "서울역",
      confidence: 0.98,
      warnings: [],
      sourceMsgIndex: 20,
      checklist: [
        { text: "명찰은 기차 안에서 배부 (09/09 08:12 변경)", sourceMsgIndex: 24 },
        { text: "후드 수령", sourceMsgIndex: 0 },
        { text: "좌석 확인", sourceMsgIndex: 20 },
        { text: "Wi-Fi 확인", sourceMsgIndex: 20 },
        { text: "출석마감 확인", sourceMsgIndex: 20 },
        { text: "신분증", sourceMsgIndex: 20 },
        { text: "충전기", sourceMsgIndex: 20 },
        { text: "여덟 번째 항목은 제거", sourceMsgIndex: 20 }
      ]
    },
    {
      title: "KTX",
      start: "2026-09-09T08:57:00+09:00",
      end: "2026-09-09T10:40:00+09:00",
      allDay: false,
      location: "서울역",
      confidence: 0.97,
      warnings: [],
      sourceMsgIndex: 20,
      checklist: []
    },
    {
      title: "멘토링",
      start: "2026-09-09T20:00:00+09:00",
      end: "2026-09-09T21:00:00+09:00",
      allDay: false,
      location: "",
      confidence: 0.94,
      warnings: [],
      sourceMsgIndex: 12,
      checklist: []
    },
    {
      title: "Ben Q&A",
      start: "2026-09-09T21:00:00+09:00",
      end: "2026-09-09T22:00:00+09:00",
      allDay: false,
      location: "",
      confidence: 0.93,
      warnings: [],
      sourceMsgIndex: 12,
      checklist: []
    },
    {
      title: "복귀 KTX",
      start: "2026-09-08T15:37:00+09:00",
      end: "2026-09-08T17:30:00+09:00",
      allDay: false,
      location: "",
      confidence: 0.96,
      warnings: ["9/8(목)은 날짜와 요일이 일치하지 않습니다. 숫자 날짜를 우선했습니다."],
      suggestedDate: "2026-09-10",
      sourceMsgIndex: 2,
      checklist: []
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      title: `추가 후보 ${index + 1}`,
      start: `2026-09-${String(index + 11).padStart(2, "0")}T12:00:00+09:00`,
      end: `2026-09-${String(index + 11).padStart(2, "0")}T13:00:00+09:00`,
      allDay: false,
      location: "",
      confidence: 0.4,
      warnings: [],
      sourceMsgIndex: 0,
      checklist: []
    }))
  ];
  return {
    events,
    todos: [{ text: "오픈프로필 변경", sourceMsgIndex: 0 }],
    summary: "메시지에서 일정 8개, 할 일 1개를 찾았어요"
  };
}

test("두 export의 mock 성공 응답에서 text parts만 파싱하고 요구 결과를 보존한다", async () => {
  const DoToDoLLM = loadExtractor();
  const DoToDo = loadDoToDo();
  const payload = successfulPayload();
  const json = JSON.stringify(payload);
  const datasets = [
    ["data/trainthon-mobile.txt", 26],
    ["data/trainthon-pc.txt", 36]
  ];

  for (const [relativePath, expectedMessageCount] of datasets) {
    const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    const ruleResult = DoToDo.parseScheduleFromKakao(text);
    assert.equal(ruleResult.messages.length, expectedMessageCount);
    let request;
    const result = await DoToDoLLM.extract({
      apiKey: "test-key",
      messages: ruleResult.messages,
      ruleResult,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [
                  { text: json.slice(0, 80) },
                  { thoughtSignature: "반드시 무시" },
                  { text: json.slice(80) }
                ]
              }
            }]
          })
        };
      }
    });

    assert.equal(result.status, "success");
    assert.equal(result.events.length, 8);
    assert.equal(result.events[0].checklist.length, 7);
    assert.match(result.events[0].checklist[0].text, /명찰.*변경/);
    assert.deepEqual(
      result.events.slice(0, 5).map((event) => event.confidence >= 0.8),
      [true, true, true, true, true]
    );
    assert.equal(result.events[4].suggestedDate, "2026-09-10");
    assert.equal(result.events[4].warnings.length, 1);
    assert.equal(result.todos[0].text, "오픈프로필 변경");
    assert.ok(result.events[0].start instanceof Date);
    assert.equal(result.events[0].start.getMonth(), 8);
    assert.equal(result.events[0].start.getDate(), 9);
    assert.equal(result.events[0].start.getHours(), 8);
    assert.equal(result.events[0].start.getMinutes(), 30);
    assert.match(request.url, /gemini-3-flash-preview:generateContent$/);
    assert.equal(request.options.headers["x-goog-api-key"], "test-key");
    const body = JSON.parse(request.options.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "low" });
    assert.equal("temperature" in body.generationConfig, false);
    assert.match(body.contents[0].parts[0].text, new RegExp(`"sourceMsgIndex":${expectedMessageCount - 1}`));
  }

  const invalidPayload = successfulPayload();
  invalidPayload.events[0].start = "2026-09-08T23:30:00Z";
  const fallback = ruleFallback();
  const invalidResult = await DoToDoLLM.extract({
    apiKey: "test-key",
    messages: [],
    ruleResult: fallback,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(invalidPayload) }] } }]
      })
    })
  });
  assert.equal(invalidResult.status, "error");
  assert.strictEqual(invalidResult.events, fallback.events);
});

test("429 응답은 잠시 후 다시 시도 상태와 룰 결과를 반환한다", async () => {
  const DoToDoLLM = loadExtractor();
  const fallback = ruleFallback();
  const result = await DoToDoLLM.extract({
    apiKey: "test-key",
    messages: [],
    ruleResult: fallback,
    fetchImpl: async () => ({ ok: false, status: 429 })
  });

  assert.equal(result.status, "rate_limited");
  assert.equal(result.message, "잠시 후 다시 시도");
  assert.strictEqual(result.events, fallback.events);
});

test("API 키가 없으면 호출 없이 룰 파서 결과로 폴백한다", async () => {
  const DoToDoLLM = loadExtractor();
  const fallback = ruleFallback();
  let called = false;
  const result = await DoToDoLLM.extract({
    apiKey: "",
    messages: [],
    ruleResult: fallback,
    fetchImpl: async () => {
      called = true;
      throw new Error("호출되면 안 됨");
    }
  });

  assert.equal(called, false);
  assert.equal(result.status, "disabled");
  assert.strictEqual(result.events, fallback.events);
});
