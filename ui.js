(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.DoToDoUI = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
  var API_KEY_STORAGE = "dotodo.geminiApiKey";
  var CLIENT_ID_STORAGE = "dotodo.googleClientId";

  function confidenceDots(confidence) {
    var value = typeof confidence === "number" && isFinite(confidence) ? confidence : 0.75;
    var filled = Math.max(1, Math.min(4, Math.ceil(value * 4)));
    return [0, 1, 2, 3].map(function (index) { return index < filled; });
  }

  function prepareEvents(events) {
    return (events || []).map(function (event, index) {
      if (!event.eventId) {
        event.eventId = event.uid || (
          "event-" + index + "-" +
          (event.start instanceof Date && !isNaN(event.start.getTime()) ? event.start.getTime() : "undated")
        );
      }
      if (typeof event.confidence === "number" && event.confidence < 0.6) {
        event.selected = false;
      } else if (event.selected !== false) {
        event.selected = true;
      }
      return event;
    });
  }

  function parseSeoulDateTime(value) {
    var match = String(value || "").match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\+09:?00$/
    );
    if (!match) return null;
    var date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    );
    return isNaN(date.getTime()) ? null : date;
  }

  function applyAssistantActions(events, actions) {
    var changed = {};
    var exportAll = false;
    (actions || []).forEach(function (action) {
      if (!action || action.type === "exportAll") {
        if (action && action.type === "exportAll") exportAll = true;
        return;
      }
      var event = (events || []).find(function (candidate) {
        return candidate.eventId === action.eventId;
      });
      if (!event) return;
      if (action.type === "setTime") {
        var start = parseSeoulDateTime(action.start);
        var end = parseSeoulDateTime(action.end);
        if (!start || !end || end <= start) return;
        event.start = start;
        event.end = end;
        event.allDay = false;
      } else if (action.type === "addReminder") {
        var minutes = Number(action.minutesBefore);
        if (!isFinite(minutes) || minutes < 0) return;
        event.reminders = Array.isArray(event.reminders) ? event.reminders : [];
        if (event.reminders.indexOf(Math.round(minutes)) < 0) {
          event.reminders.push(Math.round(minutes));
          event.reminders.sort(function (a, b) { return a - b; });
        }
      } else if (action.type === "toggleInclude") {
        event.selected = !!action.included;
      } else if (action.type === "applySuggestedDate") {
        var target = event.suggestedDate && String(event.suggestedDate).match(
          /^(\d{4})-(\d{2})-(\d{2})$/
        );
        if (!target || !(event.start instanceof Date)) return;
        var duration = event.end instanceof Date ? event.end - event.start : 3600000;
        event.start = new Date(
          Number(target[1]),
          Number(target[2]) - 1,
          Number(target[3]),
          event.start.getHours(),
          event.start.getMinutes(),
          event.start.getSeconds()
        );
        event.end = new Date(event.start.getTime() + duration);
        event.suggestedDate = undefined;
        event.warnings = [];
      } else {
        return;
      }
      changed[event.eventId] = true;
    });
    return { changedEventIds: Object.keys(changed), exportAll: exportAll };
  }

  function applyCalendarConflicts(events, conflicts) {
    (events || []).forEach(function (event) {
      event.conflicts = (conflicts && event.eventId && conflicts[event.eventId]) || [];
    });
    return events;
  }

  function parseDocumentMessages(text, fileName, today) {
    var fallback = today instanceof Date ? today : new Date();
    var date = new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
    var match = String(fileName || "").match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
    if (match) {
      var candidate = new Date(2000 + Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (
        candidate.getFullYear() === 2000 + Number(match[1]) &&
        candidate.getMonth() === Number(match[2]) - 1 &&
        candidate.getDate() === Number(match[3])
      ) {
        date = candidate;
      }
    }
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split(/\n\s*\n+/)
      .map(function (paragraph) { return paragraph.trim(); })
      .filter(Boolean)
      .map(function (paragraph) {
        var messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return {
          sender: "문서",
          speaker: "문서",
          sentAt: new Date(messageDate.getTime()),
          date: messageDate,
          text: paragraph
        };
      });
  }

  if (!root.document) {
    return {
      confidenceDots: confidenceDots,
      prepareEvents: prepareEvents,
      parseDocumentMessages: parseDocumentMessages,
      applyAssistantActions: applyAssistantActions,
      applyCalendarConflicts: applyCalendarConflicts
    };
  }

  var document = root.document;
  var core = root.DoToDo;
  var llm = root.DoToDoLLM;
  var assistant = root.DoToDoAssistant;
  var calendar = root.DoToDoCalendar;
  if (!core) return { confidenceDots: confidenceDots, prepareEvents: prepareEvents };

  var chat = document.getElementById("chat");
  var board = document.getElementById("board");
  var boardList = document.getElementById("boardList");
  var openBoard = document.getElementById("openBoard");
  var closeBoard = document.getElementById("closeBoard");
  var mobileEventCount = document.getElementById("mobileEventCount");
  var selectedCount = document.getElementById("selectedCount");
  var btnExport = document.getElementById("btnExport");
  var btnGoogle = document.getElementById("btnGoogle");
  var googleClientIdInput = document.getElementById("googleClientIdInput");
  var fileInput = document.getElementById("fileInput");
  var composer = document.getElementById("composer");
  var composerInput = document.getElementById("composerInput");
  var sendButton = document.getElementById("sendButton");
  var aiBadge = document.getElementById("aiBadge");
  var apiPanel = document.getElementById("apiPanel");
  var apiKeyInput = document.getElementById("apiKeyInput");
  var rememberApiKey = document.getElementById("rememberApiKey");
  var status = document.getElementById("status");

  var state = {
    events: [],
    todos: [],
    messages: [],
    raw: "",
    fileName: "",
    sourceKind: "chat",
    summary: "",
    runId: 0,
    conversation: [],
    history: [],
    assistantBusy: false,
    assistantRequestId: 0,
    googleToken: null
  };

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatTime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";
    return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function formatMessageTime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "시각 미상";
    return (
      (date.getMonth() + 1) + "/" + date.getDate() + " " +
      (date.getHours() < 12 ? "오전 " : "오후 ") +
      ((date.getHours() + 11) % 12 + 1) + ":" + pad2(date.getMinutes())
    );
  }

  function formatDateSection(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "날짜 미정";
    return (date.getMonth() + 1) + "월 " + date.getDate() + "일 " + WEEKDAY[date.getDay()] + "요일";
  }

  function dateKey(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "unknown";
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function suggestedDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]) - 1;
    var day = Number(match[3]);
    var date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
      ? date
      : null;
  }

  function effectiveDate(event) {
    var suggested = event.suggestedDate ? suggestedDate(event.suggestedDate) : null;
    if (!suggested || !(event.start instanceof Date)) return event.start;
    return new Date(
      suggested.getFullYear(),
      suggested.getMonth(),
      suggested.getDate(),
      event.start.getHours(),
      event.start.getMinutes(),
      event.start.getSeconds()
    );
  }

  function loadStoredApiKey() {
    try {
      var remembered = root.localStorage.getItem(API_KEY_STORAGE) || "";
      if (remembered) {
        rememberApiKey.checked = true;
        return remembered;
      }
      var sessionKey = root.sessionStorage.getItem(API_KEY_STORAGE) || "";
      rememberApiKey.checked = !sessionKey;
      return sessionKey;
    } catch (error) {
      return "";
    }
  }

  function storeApiKey(value) {
    try {
      if (!value) {
        root.localStorage.removeItem(API_KEY_STORAGE);
        root.sessionStorage.removeItem(API_KEY_STORAGE);
      } else if (rememberApiKey.checked) {
        root.localStorage.setItem(API_KEY_STORAGE, value);
        root.sessionStorage.removeItem(API_KEY_STORAGE);
      } else {
        root.sessionStorage.setItem(API_KEY_STORAGE, value);
        root.localStorage.removeItem(API_KEY_STORAGE);
      }
    } catch (error) {
      setStatus("이 브라우저에서는 API 키를 세션에 저장할 수 없어요.", "warn");
    }
  }

  function loadStoredClientId() {
    try {
      return root.localStorage.getItem(CLIENT_ID_STORAGE) || "";
    } catch (error) {
      return "";
    }
  }

  function storeClientId(value) {
    try {
      if (!value) root.localStorage.removeItem(CLIENT_ID_STORAGE);
      else root.localStorage.setItem(CLIENT_ID_STORAGE, value);
    } catch (error) {
      setStatus("이 브라우저에서는 Google Client ID를 저장할 수 없어요.", "warn");
    }
  }

  function setStatus(message, kind) {
    status.textContent = message || "";
    status.className = "app-status" + (kind ? " " + kind : "");
  }

  function updateAiBadge() {
    var active = !!apiKeyInput.value.trim();
    aiBadge.classList.toggle("on", active);
    aiBadge.textContent = active ? "AI 정제 켜짐" : "AI 정제";
  }

  function addGreeting() {
    chat.appendChild(element(
      "div",
      "msg bot",
      "안녕하세요, 두투두예요. 카카오톡 대화 내보내기 파일을 보내주시면 일정과 챙길 것을 정리해드릴게요."
    ));
  }

  function addFileBubble() {
    var bubble = element("div", "msg me file");
    bubble.appendChild(element("div", "ico"));
    var copy = element("div");
    copy.appendChild(element("b", "", state.fileName));
    copy.appendChild(element(
      "span",
      "",
      (state.sourceKind === "document" ? "회의록/문서" : "카카오톡 대화") +
      " · " + state.messages.length + "개 메시지"
    ));
    bubble.appendChild(copy);
    chat.appendChild(bubble);
    var now = new Date();
    chat.appendChild(element("div", "stamp num", pad2(now.getHours()) + ":" + pad2(now.getMinutes())));
  }

  function addConfidence(parent, confidence) {
    var dots = element("div", "conf");
    var value = typeof confidence === "number" && isFinite(confidence) ? confidence : 0.75;
    dots.setAttribute("role", "img");
    dots.setAttribute("aria-label", "확신도 " + Math.round(value * 100) + "%");
    confidenceDots(confidence).forEach(function (filled) {
      var dot = element("i", filled ? "" : "o");
      dot.setAttribute("aria-hidden", "true");
      dots.appendChild(dot);
    });
    parent.appendChild(dots);
  }

  function eventNote(event) {
    var warnings = Array.isArray(event.warnings) ? event.warnings.slice() : [];
    if (event.suggestedDate) warnings.push("제안 날짜: " + event.suggestedDate);
    return warnings.join(" ");
  }

  function buildEventCard(event, index, boardMode) {
    var classes = ["ev"];
    if (event.warnings && event.warnings.length) classes.push("flag");
    if (typeof event.confidence === "number" && event.confidence < 0.6) classes.push("dim");
    if (event._flash) classes.push("flash");
    var card = element("article", classes.join(" "));
    card.dataset.eventIndex = String(index);

    if (boardMode) {
      var checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!event.selected;
      checkbox.setAttribute("aria-label", event.title + " 선택");
      checkbox.addEventListener("change", function () {
        event.selected = checkbox.checked;
        updateSelection();
      });
      card.appendChild(checkbox);
    }

    var displayDate = boardMode ? effectiveDate(event) : event.start;
    var date = element("div", "d num");
    date.appendChild(element("span", "n", displayDate instanceof Date ? displayDate.getDate() : "–"));
    date.appendChild(element("span", "w", displayDate instanceof Date ? WEEKDAY[displayDate.getDay()] : ""));
    card.appendChild(date);

    var body = element("div");
    body.appendChild(element("h4", "", event.title || "일정"));
    var details = element("div", "sub");
    details.appendChild(element("span", "t num", event.allDay ? "시간 미정" : formatTime(event.start)));
    var extra = [];
    if (event.location) extra.push(event.location);
    if (event.reminders && event.reminders.length) {
      extra.push(event.reminders.map(function (minutes) {
        return "알림 " + minutes + "분 전";
      }).join(" · "));
    }
    if (boardMode && event.checklist && event.checklist.length) {
      extra.push("챙길 것 " + event.checklist.length);
    }
    if (extra.length) details.appendChild(document.createTextNode(" " + extra.join(" · ")));
    body.appendChild(details);
    card.appendChild(body);
    addConfidence(card, event.confidence);

    var note = eventNote(event);
    if (note) card.appendChild(element("div", "note", note));
    (event.conflicts || []).forEach(function (text) {
      card.appendChild(element("div", "note", text));
    });
    return card;
  }

  function highlightSource(container, sourceText, checklistText) {
    var text = String(sourceText || "");
    if (!text) {
      container.textContent = "원문 메시지를 찾지 못했습니다.";
      return;
    }
    var tokens = String(checklistText || "")
      .replace(/\([^)]*변경[^)]*\)/g, "")
      .split(/[\s,·/]+/)
      .filter(function (token) { return token.length >= 2; })
      .sort(function (a, b) { return b.length - a.length; });
    var token = tokens.find(function (candidate) { return text.indexOf(candidate) >= 0; });
    if (!token) {
      var whole = element("mark", "", text);
      container.appendChild(whole);
      return;
    }
    var index = text.indexOf(token);
    container.appendChild(document.createTextNode(text.slice(0, index)));
    container.appendChild(element("mark", "", token));
    container.appendChild(document.createTextNode(text.slice(index + token.length)));
  }

  function addChecklistBubble(event, eventIndex) {
    var bubble = element("div", "msg bot");
    bubble.appendChild(document.createTextNode((event.title || "일정") + "에 챙길 것이에요."));
    var list = element("ul", "list");
    event.checklist.forEach(function (item, itemIndex) {
      var row = element("li");
      var copy = element("span", "", item.text);
      var changed = item.text.match(/\(([^)]*변경[^)]*)\)/);
      if (changed) copy.appendChild(element("span", "chg", changed[1]));
      row.appendChild(copy);

      var sourceButton = element("button", "src", "근거");
      sourceButton.type = "button";
      var quoteId = "evidence-" + eventIndex + "-" + itemIndex;
      sourceButton.setAttribute("aria-controls", quoteId);
      sourceButton.setAttribute("aria-expanded", "false");
      row.appendChild(sourceButton);
      var quote = element("div", "q");
      quote.id = quoteId;
      var source = state.messages[item.sourceMsgIndex];
      var who = element("div", "who");
      who.appendChild(element("b", "", source && source.speaker ? source.speaker : "발신자 미상"));
      who.appendChild(document.createTextNode(" " + formatMessageTime(source && source.sentAt)));
      quote.appendChild(who);
      highlightSource(quote, source && source.text, item.text);
      row.appendChild(quote);
      sourceButton.addEventListener("click", function () {
        var open = quote.classList.toggle("on");
        sourceButton.textContent = open ? "닫기" : "근거";
        sourceButton.setAttribute("aria-expanded", String(open));
      });
      list.appendChild(row);
    });
    bubble.appendChild(list);
    chat.appendChild(bubble);
  }

  function addAnswerEvidence(container, sourceIndex, answerIndex, evidenceIndex) {
    var source = state.messages[sourceIndex];
    var button = element("button", "src", "근거");
    button.type = "button";
    var quoteId = "answer-evidence-" + answerIndex + "-" + evidenceIndex;
    button.setAttribute("aria-controls", quoteId);
    button.setAttribute("aria-expanded", "false");
    var quote = element("div", "q");
    quote.id = quoteId;
    var who = element("div", "who");
    who.appendChild(element("b", "", source && source.speaker ? source.speaker : "발신자 미상"));
    who.appendChild(document.createTextNode(" " + formatMessageTime(source && source.sentAt)));
    quote.appendChild(who);
    highlightSource(quote, source && source.text, "");
    button.addEventListener("click", function () {
      var open = quote.classList.toggle("on");
      button.textContent = open ? "닫기" : "근거";
      button.setAttribute("aria-expanded", String(open));
    });
    container.appendChild(button);
    container.appendChild(quote);
  }

  function renderConversation() {
    state.conversation.forEach(function (entry, index) {
      if (entry.role === "loading") {
        var loading = element("div", "msg bot loading");
        loading.setAttribute("aria-label", "두투두가 답변을 작성 중");
        loading.appendChild(element("i"));
        loading.appendChild(element("i"));
        loading.appendChild(element("i"));
        chat.appendChild(loading);
        return;
      }
      if (entry.role === "user") {
        chat.appendChild(element("div", "msg me", entry.text));
        return;
      }
      var bubble = element("div", "msg bot");
      bubble.appendChild(document.createTextNode(entry.text));
      if (entry.calendarUrl) {
        var link = element("a", "cal-link", "Google Calendar 열기");
        link.href = entry.calendarUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        bubble.appendChild(document.createElement("br"));
        bubble.appendChild(link);
      }
      if (entry.sourceMsgIndexes && entry.sourceMsgIndexes.length) {
        var sources = element("div", "answer-sources");
        entry.sourceMsgIndexes.forEach(function (sourceIndex, evidenceIndex) {
          addAnswerEvidence(sources, sourceIndex, index, evidenceIndex);
        });
        bubble.appendChild(sources);
      }
      chat.appendChild(bubble);
      if (entry.suggestedQuestions && entry.suggestedQuestions.length) {
        var chips = element("div", "chips");
        entry.suggestedQuestions.forEach(function (question) {
          var chip = element("button", "", question);
          chip.type = "button";
          chip.addEventListener("click", function () { sendQuestion(question); });
          chips.appendChild(chip);
        });
        chat.appendChild(chips);
      }
    });
  }

  function renderChat() {
    chat.innerHTML = "";
    addGreeting();
    if (!state.fileName) {
      renderConversation();
      chat.scrollTop = chat.scrollHeight;
      return;
    }
    addFileBubble();
    chat.appendChild(element("div", "msg bot", state.summary));
    var stackMessage = element("div", "msg wide");
    var stack = element("div", "event-stack");
    state.events.forEach(function (event, index) {
      stack.appendChild(buildEventCard(event, index, false));
    });
    if (!state.events.length) stack.appendChild(element("div", "board-empty", "찾은 일정이 없어요."));
    stackMessage.appendChild(stack);
    chat.appendChild(stackMessage);
    state.events.forEach(function (event, index) {
      if (event.checklist && event.checklist.length) addChecklistBubble(event, index);
    });
    renderConversation();
    chat.scrollTop = chat.scrollHeight;
  }

  function renderBoard() {
    boardList.innerHTML = "";
    if (state.todos.length) {
      boardList.appendChild(element("div", "sec", "시간 없는 할 일"));
      state.todos.forEach(function (todo) {
        boardList.appendChild(element("div", "todo", todo.text));
      });
    }
    if (!state.events.length && !state.todos.length) {
      boardList.appendChild(element("div", "board-empty", "파일을 보내면 일정이 여기에 정리돼요."));
      updateSelection();
      return;
    }

    var sorted = state.events
      .map(function (event, index) { return { event: event, index: index }; })
      .sort(function (a, b) { return effectiveDate(a.event) - effectiveDate(b.event); });
    var lastKey = "";
    sorted.forEach(function (entry) {
      var displayDate = effectiveDate(entry.event);
      var key = dateKey(displayDate);
      if (key !== lastKey) {
        boardList.appendChild(element("div", "sec", formatDateSection(displayDate)));
        lastKey = key;
      }
      boardList.appendChild(buildEventCard(entry.event, entry.index, true));
    });
    updateSelection();
  }

  function updateSelection() {
    var selected = state.events.filter(function (event) { return event.selected; }).length;
    selectedCount.textContent = selected + "개 선택";
    mobileEventCount.textContent = state.events.length;
    btnExport.disabled = selected === 0;
    if (btnGoogle) btnGoogle.disabled = selected === 0;
  }

  function renderAll() {
    renderChat();
    renderBoard();
  }

  function enrichLlmEvents(events) {
    return prepareEvents(events.map(function (event) {
      var source = state.messages[event.sourceMsgIndex];
      event.sourceText = source ? source.text : "";
      event.speaker = source ? source.speaker : "";
      event.description = source
        ? (source.speaker ? source.speaker + ": " : "") + source.text
        : "";
      event.organizedMessageCount = state.messages.length;
      return event;
    }));
  }

  async function processChat(raw, fileName) {
    var runId = ++state.runId;
    var isNewSource = raw !== state.raw || fileName !== state.fileName;
    if (isNewSource) {
      state.conversation = [];
      state.history = [];
      state.assistantBusy = false;
      state.assistantRequestId += 1;
    }
    var ruleResult;
    try {
      var kakaoMessages = core.parseKakaoMessages(raw);
      if (kakaoMessages.length) {
        ruleResult = core.parseScheduleFromKakao(raw);
        state.sourceKind = "chat";
      } else {
        ruleResult = {
          messages: parseDocumentMessages(raw, fileName, new Date()),
          events: [],
          warnings: []
        };
        state.sourceKind = "document";
      }
    } catch (error) {
      setStatus("대화 파일을 읽지 못했어요: " + error.message, "warn");
      return;
    }

    state.raw = raw;
    state.fileName = fileName || "붙여넣은 카카오톡 대화.txt";
    state.messages = ruleResult.messages;
    state.events = prepareEvents(ruleResult.events);
    state.todos = [];
    state.summary =
      state.messages.length + "개 메시지에서 일정 " + state.events.length +
      "개를 찾았어요. AI 정제를 켜면 노이즈와 최신 공지를 더 정확히 정리해요.";
    renderAll();

    var apiKey = apiKeyInput.value.trim();
    if (!apiKey || !llm) {
      setStatus("룰 파서 결과를 표시 중이에요.", "");
      return;
    }

    setStatus("전체 메시지를 AI로 정리하고 있어요…", "");
    var result = await llm.extract({
      apiKey: apiKey,
      messages: state.messages,
      ruleResult: ruleResult
    });
    if (runId !== state.runId) return;
    if (result.status === "success") {
      state.events = enrichLlmEvents(result.events);
      state.todos = result.todos;
      state.summary = result.summary ||
        (state.messages.length + "개 메시지에서 일정 " + state.events.length +
        "개, 할 일 " + state.todos.length + "개를 찾았어요.");
      setStatus("AI 정제가 끝났어요.", "ok");
      renderAll();
    } else if (result.status === "rate_limited") {
      setStatus("잠시 후 다시 시도", "warn");
      apiPanel.hidden = false;
      aiBadge.setAttribute("aria-expanded", "true");
    } else {
      setStatus(result.message || "AI 정제에 실패해 룰 파서 결과를 유지합니다.", "warn");
    }
  }

  function looksLikeKakaoExport(text) {
    return /저장한 날짜|---+\s*\d{4}년|\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*(?:오전|오후)|\[[^\]]+\]\s*\[(?:오전|오후)/.test(text);
  }

  function downloadIcs() {
    var picked = state.events.filter(function (event) { return event.selected; }).map(function (event) {
      var corrected = effectiveDate(event);
      if (!event.suggestedDate || !(corrected instanceof Date)) return event;
      var duration = event.end instanceof Date ? event.end.getTime() - event.start.getTime() : 3600000;
      var start = new Date(
        corrected.getFullYear(),
        corrected.getMonth(),
        corrected.getDate(),
        event.start.getHours(),
        event.start.getMinutes(),
        event.start.getSeconds()
      );
      var copy = Object.assign({}, event, {
        start: start,
        end: new Date(start.getTime() + duration)
      });
      return copy;
    });
    if (!picked.length) return;
    var ics = core.eventsToIcs(picked, { calendarName: "두투두" });
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = element("a");
    link.href = url;
    link.download = "dotodo-" + dateKey(new Date()).replace(/-/g, "") + ".ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    setStatus(picked.length + "개 일정을 .ics로 저장했어요.", "ok");
  }

  function selectedEvents() {
    return state.events.filter(function (event) { return event.selected; });
  }

  function tokenStillValid() {
    return !!(
      state.googleToken &&
      state.googleToken.accessToken &&
      state.googleToken.expiresAt &&
      state.googleToken.expiresAt - 60000 > Date.now()
    );
  }

  function addCalendarResult(count, calendarUrl) {
    state.conversation.push({
      role: "assistant",
      text: count + "개 추가했어요",
      calendarUrl: calendarUrl || "https://calendar.google.com/calendar/r",
      sourceMsgIndexes: [],
      suggestedQuestions: []
    });
    renderChat();
  }

  async function addToGoogleCalendar() {
    var picked = selectedEvents();
    if (!picked.length) return false;
    if (!calendar) {
      downloadIcs();
      return false;
    }
    var clientId = googleClientIdInput && googleClientIdInput.value.trim();
    if (!clientId) {
      apiPanel.hidden = false;
      aiBadge.setAttribute("aria-expanded", "true");
      if (googleClientIdInput) googleClientIdInput.focus();
      setStatus("Google Client ID를 입력한 뒤 다시 추가해 주세요. 지금은 .ics로 저장했어요.", "warn");
      downloadIcs();
      return false;
    }

    var token = tokenStillValid() ? state.googleToken : await calendar.requestAccessToken({
      clientId: clientId,
      googleIdentity: root.google
    });
    if (!token || token.status !== "success" || !token.accessToken) {
      state.googleToken = null;
      downloadIcs();
      setStatus("Google 계정에 연결하지 못해 .ics로 저장했어요.", "warn");
      return false;
    }
    state.googleToken = token;

    try {
      if (btnGoogle) btnGoogle.disabled = true;
      var result = await calendar.syncAndInsert({
        accessToken: token.accessToken,
        events: picked,
        messages: state.messages
      });
      applyCalendarConflicts(state.events, result.conflicts || {});
      addCalendarResult(result.inserted.length, result.calendarUrl);
      renderBoard();
      setStatus(result.inserted.length + "개를 Google Calendar에 추가했어요.", "ok");
      return true;
    } catch (error) {
      if (error && error.code === "AUTH") state.googleToken = null;
      downloadIcs();
      setStatus("Google Calendar 연결이 끊어져 .ics로 저장했어요.", "warn");
      return false;
    } finally {
      updateSelection();
    }
  }

  async function sendQuestion(value) {
    var question = String(value || "").trim();
    if (!question || state.assistantBusy) return;
    composerInput.value = "";
    sendButton.disabled = true;
    state.conversation.push({ role: "user", text: question });

    if (!state.raw) {
      state.conversation.push({
        role: "assistant",
        text: "먼저 카톡 export나 회의록을 보내주세요",
        sourceMsgIndexes: [],
        suggestedQuestions: []
      });
      renderChat();
      return;
    }
    if (!assistant) {
      state.conversation.push({
        role: "assistant",
        text: "챗 비서 모듈을 불러오지 못했어요.",
        sourceMsgIndexes: [],
        suggestedQuestions: []
      });
      renderChat();
      return;
    }

    var loadingEntry = { role: "loading" };
    state.conversation.push(loadingEntry);
    state.assistantBusy = true;
    var assistantRequestId = ++state.assistantRequestId;
    var sourceRunId = state.runId;
    renderChat();
    var previousHistory = state.history.slice();
    var result = await assistant.ask({
      apiKey: apiKeyInput.value.trim(),
      userText: question,
      messages: state.messages,
      events: state.events,
      todos: state.todos,
      history: previousHistory
    });
    if (assistantRequestId !== state.assistantRequestId || sourceRunId !== state.runId) return;
    state.assistantBusy = false;
    var loadingIndex = state.conversation.indexOf(loadingEntry);
    var responseEntry = {
      role: "assistant",
      text: result.reply,
      sourceMsgIndexes: result.sourceMsgIndexes || [],
      suggestedQuestions: result.suggestedQuestions || []
    };
    if (loadingIndex >= 0) state.conversation.splice(loadingIndex, 1, responseEntry);
    else state.conversation.push(responseEntry);
    state.history.push({ role: "user", text: question });
    state.history.push({ role: "assistant", text: result.reply });

    var applied = applyAssistantActions(state.events, result.actions || []);
    applied.changedEventIds.forEach(function (eventId) {
      var event = state.events.find(function (candidate) { return candidate.eventId === eventId; });
      if (event) event._flash = true;
    });
    renderAll();
    if (applied.exportAll) addToGoogleCalendar();
    if (applied.changedEventIds.length) {
      setTimeout(function () {
        state.events.forEach(function (event) { event._flash = false; });
        renderAll();
      }, 1400);
    }
  }

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      processChat(String(reader.result || ""), file.name);
    };
    reader.onerror = function () { setStatus("파일을 읽을 수 없어요.", "warn"); };
    reader.readAsText(file, "UTF-8");
    fileInput.value = "";
  });

  composerInput.addEventListener("paste", function (event) {
    var text = event.clipboardData && event.clipboardData.getData("text");
    if (!text || !looksLikeKakaoExport(text)) return;
    event.preventDefault();
    composerInput.value = "";
    processChat(text, "붙여넣은 카카오톡 대화.txt");
  });

  composerInput.addEventListener("input", function () {
    sendButton.disabled = !composerInput.value.trim() || state.assistantBusy;
  });
  composerInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion(composerInput.value);
    }
  });
  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    sendQuestion(composerInput.value);
  });
  var boardReturnFocus = null;

  function openMobileBoard() {
    boardReturnFocus = document.activeElement;
    board.classList.add("open");
    board.setAttribute("aria-modal", "true");
    openBoard.setAttribute("aria-expanded", "true");
    closeBoard.focus();
  }

  function closeMobileBoard(restoreFocus) {
    board.classList.remove("open");
    board.setAttribute("aria-modal", "false");
    openBoard.setAttribute("aria-expanded", "false");
    if (restoreFocus !== false && boardReturnFocus && boardReturnFocus.focus) {
      boardReturnFocus.focus();
    }
  }

  openBoard.addEventListener("click", openMobileBoard);
  closeBoard.addEventListener("click", function () { closeMobileBoard(true); });
  board.addEventListener("keydown", function (event) {
    if (!board.classList.contains("open") || board.getAttribute("aria-modal") !== "true") return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileBoard(true);
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = Array.prototype.slice.call(
      board.querySelectorAll("button:not([disabled]), input:not([disabled])")
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  var desktopQuery = root.matchMedia("(min-width: 900px)");
  function syncBoardMode(event) {
    if (event.matches) closeMobileBoard(false);
  }
  if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", syncBoardMode);
  else desktopQuery.addListener(syncBoardMode);
  syncBoardMode(desktopQuery);
  aiBadge.addEventListener("click", function () {
    apiPanel.hidden = !apiPanel.hidden;
    aiBadge.setAttribute("aria-expanded", String(!apiPanel.hidden));
    if (!apiPanel.hidden) apiKeyInput.focus();
  });
  apiKeyInput.addEventListener("input", function () {
    storeApiKey(apiKeyInput.value.trim());
    updateAiBadge();
  });
  rememberApiKey.addEventListener("change", function () {
    storeApiKey(apiKeyInput.value.trim());
  });
  apiKeyInput.addEventListener("change", function () {
    if (state.raw && apiKeyInput.value.trim()) processChat(state.raw, state.fileName);
  });
  btnExport.addEventListener("click", downloadIcs);
  if (btnGoogle) btnGoogle.addEventListener("click", function () { addToGoogleCalendar(); });
  if (googleClientIdInput) {
    googleClientIdInput.value = loadStoredClientId();
    googleClientIdInput.addEventListener("input", function () {
      storeClientId(googleClientIdInput.value.trim());
    });
  }

  apiKeyInput.value = loadStoredApiKey();
  updateAiBadge();
  renderAll();

  return {
    confidenceDots: confidenceDots,
    prepareEvents: prepareEvents,
    parseDocumentMessages: parseDocumentMessages,
    applyAssistantActions: applyAssistantActions,
    applyCalendarConflicts: applyCalendarConflicts,
    processChat: processChat
  };
});
