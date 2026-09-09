const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadParser() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
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

test("목록 번호와 기간 표현을 일정 날짜·시각으로 오인하지 않는다", () => {
  const parser = loadParser();
  const chat = [
    "2026년 9월 9일 수요일",
    "2026. 9. 9. 오후 1:00, 운영진 : 2-1. 팀 소개",
    "2-2. 제출물 확인",
    "총 16시간 과정입니다."
  ].join("\n");

  const result = parser.parseScheduleFromKakao(chat);

  assert.equal(result.messages.length, 1);
  assert.equal(result.events.length, 0);
});

test("일정 알림은 ICS VALARM으로 내보낸다", () => {
  const parser = loadParser();
  const ics = parser.eventsToIcs([{
    title: "멘토링",
    start: new Date(2026, 8, 9, 20, 0),
    end: new Date(2026, 8, 9, 20, 50),
    reminders: [30]
  }], { now: new Date(2026, 8, 9, 12, 0) });

  assert.match(ics, /BEGIN:VALARM\r\n/);
  assert.match(ics, /TRIGGER:-PT30M\r\n/);
  assert.match(ics, /ACTION:DISPLAY\r\n/);
});
