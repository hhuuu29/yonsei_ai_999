const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("낮은 확신 일정은 기본 제외하고 확신도는 점 네 개로 표현한다", () => {
  const ui = require("../ui.js");
  const events = ui.prepareEvents([
    { title: "확정", confidence: 0.9, selected: true },
    { title: "의심", confidence: 0.59, selected: true },
    { title: "룰 후보", selected: true }
  ]);

  assert.equal(events[0].selected, true);
  assert.equal(events[1].selected, false);
  assert.equal(events[2].selected, true);
  assert.deepEqual(ui.confidenceDots(0.9), [true, true, true, true]);
  assert.deepEqual(ui.confidenceDots(0.59), [true, true, true, false]);
  assert.deepEqual(ui.confidenceDots(undefined), [true, true, true, false]);
});

test("일반 문서는 빈 줄 문단별 메시지와 파일명 날짜로 변환한다", () => {
  const ui = require("../ui.js");
  const messages = ui.parseDocumentMessages(
    "첫 번째 결정 사항입니다.\n계속되는 줄입니다.\n\n두 번째 할 일입니다.",
    "회의록_260907.txt",
    new Date(2026, 8, 9)
  );

  assert.equal(messages.length, 2);
  assert.equal(messages[0].speaker, "문서");
  assert.equal(messages[0].sender, "문서");
  assert.equal(messages[0].text, "첫 번째 결정 사항입니다.\n계속되는 줄입니다.");
  assert.equal(messages[0].date.getFullYear(), 2026);
  assert.equal(messages[0].date.getMonth(), 8);
  assert.equal(messages[0].date.getDate(), 7);

  const sample = fs.readFileSync(path.join(__dirname, "..", "data", "meeting-sample.txt"), "utf8");
  const sampleMessages = ui.parseDocumentMessages(sample, "meeting-sample.txt", new Date(2026, 8, 9));
  assert.equal(sampleMessages.length, 4);
  assert.equal(sampleMessages[0].date.getDate(), 9);
});

test("챗 비서 actions를 일정 상태에 즉시 반영한다", () => {
  const ui = require("../ui.js");
  const events = [
    {
      eventId: "return",
      title: "복귀 KTX",
      start: new Date(2026, 8, 8, 15, 37),
      end: new Date(2026, 8, 8, 17, 41),
      suggestedDate: "2026-09-10",
      warnings: ["날짜와 요일 불일치"],
      selected: true
    },
    {
      eventId: "mentoring",
      title: "멘토링",
      start: new Date(2026, 8, 9, 20, 0),
      end: new Date(2026, 8, 9, 21, 0),
      selected: true
    }
  ];

  const result = ui.applyAssistantActions(events, [
    { type: "addReminder", eventId: "return", minutesBefore: 30 },
    { type: "applySuggestedDate", eventId: "return" },
    {
      type: "setTime",
      eventId: "mentoring",
      start: "2026-09-09T19:30:00+09:00",
      end: "2026-09-09T20:30:00+09:00"
    },
    { type: "toggleInclude", eventId: "mentoring", included: false },
    { type: "exportAll" }
  ]);

  assert.deepEqual(events[0].reminders, [30]);
  assert.equal(events[0].start.getDate(), 10);
  assert.equal(events[0].suggestedDate, undefined);
  assert.deepEqual(events[0].warnings, []);
  assert.equal(events[1].start.getHours(), 19);
  assert.equal(events[1].start.getMinutes(), 30);
  assert.equal(events[1].selected, false);
  assert.equal(result.exportAll, true);
  assert.deepEqual(result.changedEventIds.sort(), ["mentoring", "return"]);
});
