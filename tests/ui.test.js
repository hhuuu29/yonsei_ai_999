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
