(function (root) {
  "use strict";
  var api = root.DoToDoCalendar;
  var doc = root.document;
  function el(tag, text, className) {
    var node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function dayKey(date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
  function shiftDay(key, days) {
    var date = new Date(key + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function localTime(part) {
    if (part.date) return part.date;
    var date = new Date(Date.parse(part.dateTime) + 9 * 3600000);
    return date.toISOString().slice(0, 16);
  }
  function onDay(event, key) {
    if (!event.start || !event.end) return false;
    if (event.start.date) return event.start.date <= key && key < event.end.date;
    return Date.parse(event.start.dateTime) < Date.parse(shiftDay(key, 1) + "T00:00:00+09:00") &&
      Date.parse(event.end.dateTime) > Date.parse(key + "T00:00:00+09:00");
  }

  function mount(options) {
    var trigger = doc.getElementById("openCalendar");
    if (!trigger) return;
    var selected = dayKey(new Date());
    var month = selected.slice(0, 7);
    var events = [], loaded = false, busy = false, editor = null;
    var dialog = el("dialog", "", "calendar-manager");
    dialog.setAttribute("aria-labelledby", "calendarHeading");
    var header = el("header", "", "cm-header");
    var heading = el("h2", "내 캘린더"); heading.id = "calendarHeading";
    header.appendChild(heading);
    function button(text, fn, parent, className) {
      var node = el("button", text, className); node.type = "button";
      node.addEventListener("click", fn); parent.appendChild(node); return node;
    }
    button("닫기", function () { if (!busy) dialog.close(); }, header);
    dialog.appendChild(header);
    var note = el("p", "Google 기본 캘린더 · 한국 시간 (서울)", "cm-note"); dialog.appendChild(note);
    var toolbar = el("div", "", "cm-toolbar"); dialog.appendChild(toolbar);
    button("이전 달", function () { move(-1); }, toolbar);
    var monthTitle = el("strong"); toolbar.appendChild(monthTitle);
    button("다음 달", function () { move(1); }, toolbar);
    button("오늘", function () { selected = dayKey(new Date()); month = selected.slice(0,7); refresh(); }, toolbar);
    button("Google 연결 · 새로고침", connect, toolbar, "cm-primary");
    var status = el("p", "Google을 연결하면 일정을 볼 수 있어요.", "cm-status");
    status.setAttribute("role", "status"); dialog.appendChild(status);
    var layout = el("div", "", "cm-layout"); dialog.appendChild(layout);
    var grid = el("div", "", "cm-grid"); layout.appendChild(grid);
    var agenda = el("section", "", "cm-agenda"); layout.appendChild(agenda);
    var formHost = el("section", "", "cm-editor"); dialog.appendChild(formHost);
    doc.body.appendChild(dialog);
    dialog.addEventListener("cancel", function (event) { if (busy) event.preventDefault(); });
    dialog.addEventListener("close", function () { trigger.focus(); });
    trigger.addEventListener("click", function () { dialog.showModal(); render(); if (options.currentToken()) refresh(); });

    function message(text) { status.textContent = text; }
    function setBusy(value) {
      busy = value;
      dialog.querySelectorAll("button").forEach(function (node) { node.disabled = value; });
      formHost.querySelectorAll("input").forEach(function (node) { node.disabled = value || !!(editor && editor.pending); });
    }
    function failure(error) {
      if (error.code === "AUTH") options.invalidateToken();
      message(({AUTH:"Google 연결이 만료됐어요. 연결 · 새로고침을 눌러주세요.",
        FORBIDDEN:"이 일정을 변경할 권한이 없거나 Google API 사용이 제한되어 있어요.",
        CONFLICT:"다른 곳에서 일정이 변경됐어요. 새로고침한 뒤 다시 편집해 주세요.",
        NOT_FOUND:"일정이 삭제됐어요. 새로고침해 주세요.",
        RATE_LIMIT:"요청이 많아요. 잠시 후 다시 시도해 주세요."})[error.code] ||
        "완료 여부를 확인하지 못했어요. 저장 재시도는 같은 일정으로 처리됩니다. 새로고침해 확인할 수도 있어요.");
    }
    function token() {
      var value = options.currentToken();
      if (!value) { var error = new Error("expired"); error.code = "AUTH"; throw error; }
      return value;
    }
    async function connect() {
      if (busy) return;
      setBusy(true); message("Google 연결 중…");
      try {
        // Called directly by a click, before any asynchronous work.
        var value = await options.connect();
        if (!value) { message("Google 연결을 완료하지 못했어요. 팝업과 서비스 연결 설정을 확인해 주세요."); return; }
        events = []; loaded = false; closeEditor();
      } catch (error) { failure(error); return; }
      finally { setBusy(false); }
      await refresh();
    }
    function range() {
      var parts = month.split("-").map(Number);
      return {start:new Date(parts[0],parts[1]-1,1),end:new Date(parts[0],parts[1],1)};
    }
    async function refresh() {
      if (busy) return;
      closeEditor(); setBusy(true); loaded = false; events = []; render(); message("일정을 읽는 중…");
      try {
        events = await api.listEvents(token(), range()); loaded = true;
        message("Google에서 불러왔어요 · " + new Date().toLocaleTimeString("ko-KR", {hour:"2-digit",minute:"2-digit"}));
      } catch (error) { failure(error); }
      finally { render(); setBusy(false); }
    }
    function move(delta) {
      if (busy) return;
      var parts = month.split("-").map(Number);
      var date = new Date(Date.UTC(parts[0], parts[1]-1+delta, 1));
      month = date.toISOString().slice(0,7); selected = month + "-01"; refresh();
    }
    function render() {
      monthTitle.textContent = month.replace("-", "년 ") + "월";
      grid.replaceChildren(); agenda.replaceChildren();
      ["일","월","화","수","목","금","토"].forEach(function (day) { grid.appendChild(el("span",day,"cm-weekday")); });
      var first = month + "-01", offset = new Date(first + "T12:00:00Z").getUTCDay();
      for (var i=0; i<offset; i++) grid.appendChild(el("span"));
      for (var key=first; key.slice(0,7)===month; key=shiftDay(key,1)) {
        (function (date) {
          var count = events.filter(function (event) { return onDay(event,date); }).length;
          var node = button(String(Number(date.slice(8))), function () { selected=date; closeEditor(); render(); }, grid, "cm-day");
          node.setAttribute("aria-label", date + (loaded ? ", 일정 " + count + "개" : ""));
          node.setAttribute("aria-pressed", String(date===selected));
          if (date === dayKey(new Date())) node.setAttribute("aria-current","date");
          if (count) node.appendChild(el("small",count + "개"));
          node.disabled = busy;
        })(key);
      }
      agenda.appendChild(el("h3",selected));
      if (!loaded) { agenda.appendChild(el("p","연결 · 새로고침으로 Google 일정을 불러오세요.")); return; }
      button("+ 일정 만들기", function () { edit(null); }, agenda, "cm-primary");
      var rows = events.filter(function (event) { return onDay(event,selected); });
      if (!rows.length) agenda.appendChild(el("p","이날은 예정된 일정이 없어요."));
      rows.forEach(function (event) {
        var row = button("", function () { edit(event); }, agenda, "cm-event");
        row.appendChild(el("small",event.start.date ? "하루 종일" : localTime(event.start).slice(11)+" – "+localTime(event.end).slice(11)));
        row.appendChild(el("strong",event.summary || "제목 없는 일정"));
        if (event.location) row.appendChild(el("span",event.location));
      });
    }
    function closeEditor() { editor=null; formHost.replaceChildren(); }
    function edit(event) {
      if (busy) return;
      closeEditor();
      editor={event:event, id:event ? event.id : root.crypto.randomUUID().replace(/-/g,""), pending:null};
      var form = el("form"); formHost.appendChild(form);
      form.appendChild(el("h3",event ? "일정 편집" : "새 일정"));
      form.appendChild(el("p",event && event.recurringEventId ? "반복 일정의 이 날짜만 변경합니다." : "저장하면 Google 캘린더에도 반영돼요."));
      function input(label,type,value,name) {
        var wrap=el("label",label), field=el("input"); field.type=type; field.name=name; field.value=value || "";
        wrap.appendChild(field); form.appendChild(wrap); return field;
      }
      var title=input("제목","text",event && event.summary,"title"); title.required=true; title.maxLength=500;
      var location=input("장소","text",event && event.location,"location"); location.maxLength=1000;
      var allDay=input("하루 종일","checkbox","","allDay"); allDay.checked=!!(event && event.start.date);
      var start=input("시작 (서울)",allDay.checked ? "date":"datetime-local",event ? localTime(event.start):selected+"T09:00","start");
      var end=input("종료 (종일 일정은 마지막 날의 다음 날)",allDay.checked ? "date":"datetime-local",event ? localTime(event.end):selected+"T10:00","end");
      start.required=end.required=true;
      allDay.addEventListener("change",function () {
        var a=start.value.slice(0,10) || selected, b=end.value.slice(0,10) || a;
        start.type=end.type=allDay.checked ? "date":"datetime-local";
        start.value=allDay.checked ? a : a+"T09:00";
        end.value=allDay.checked ? (b>a ? b:shiftDay(a,1)) : b+"T10:00";
      });
      var readOnly=event && (event.locked || event.eventType && event.eventType!=="default" || event.organizer && event.organizer.self===false || event.attendees && event.attendees.some(function(a){return !a.self;}));
      if (readOnly) {
        form.appendChild(el("p","초대받은 일정·참석자가 있는 일정·특수 일정은 Google Calendar에서 관리해 주세요."));
        form.querySelectorAll("input").forEach(function(node){node.disabled=true;});
        button("닫기",closeEditor,form); return;
      }
      var actions=el("div","","cm-form-actions"); form.appendChild(actions);
      var save=el("button","Google에 저장","cm-primary"); save.type="submit"; actions.appendChild(save);
      button("취소",closeEditor,actions);
      if (event) button("일정 삭제",async function () {
        if (busy || !root.confirm("이 일정을 Google 캘린더에서도 삭제할까요?")) return;
        setBusy(true);
        try { await api.deleteEvent(token(),event.id,event.etag); events=events.filter(function(row){return row.id!==event.id;}); closeEditor(); render(); message("Google 캘린더에서 삭제했어요."); }
        catch(error){failure(error);} finally {setBusy(false);}
      },actions,"cm-danger");
      form.addEventListener("submit",async function (ev) {
        ev.preventDefault(); if (busy) return;
        if (!editor.pending && (!title.value.trim() || !start.value || end.value<=start.value)) {message("제목과 시작·종료 시간을 확인해 주세요. 종료는 시작보다 늦어야 해요.");return;}
        var body=editor.pending || {summary:title.value.trim(),location:location.value.trim(),
          start:allDay.checked ? {date:start.value}:{dateTime:start.value+":00+09:00",timeZone:"Asia/Seoul"},
          end:allDay.checked ? {date:end.value}:{dateTime:end.value+":00+09:00",timeZone:"Asia/Seoul"}};
        if (!event) {body.id=editor.id; editor.pending=body;}
        setBusy(true); message("Google에 저장 중…");
        try {
          var saved=event ? await api.updateEvent(token(),event.id,body,event.etag) : await api.createEvent(token(),body);
          events=events.filter(function(row){return row.id!==saved.id;}).concat(saved).sort(function(a,b){return localTime(a.start).localeCompare(localTime(b.start));});
          closeEditor(); render(); message("Google 캘린더에 저장했어요.");
        } catch(error){failure(error);} finally {setBusy(false);}
      });
      title.focus();
    }
  }
  root.DoToDoCalendarManager={mount:mount};
})(globalThis);
