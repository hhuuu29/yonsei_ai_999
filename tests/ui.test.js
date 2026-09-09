const test = require("node:test");
const assert = require("node:assert/strict");

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
