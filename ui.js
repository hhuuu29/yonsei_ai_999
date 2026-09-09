(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.DoToDoUI = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
  var API_KEY_STORAGE = "dotodo.geminiApiKey";

  function confidenceDots(confidence) {
    var value = typeof confidence === "number" && isFinite(confidence) ? confidence : 0.75;
    var filled = Math.max(1, Math.min(4, Math.ceil(value * 4)));
    return [0, 1, 2, 3].map(function (index) { return index < filled; });
  }

  function prepareEvents(events) {
    return (events || []).map(function (event) {
      if (typeof event.confidence === "number" && event.confidence < 0.6) {
        event.selected = false;
      } else if (event.selected !== false) {
        event.selected = true;
      }
      return event;
    });
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
      parseDocumentMessages: parseDocumentMessages
    };
  }

  var document = root.document;
  var core = root.DoToDo;
  var llm = root.DoToDoLLM;
  if (!core) return { confidenceDots: confidenceDots, prepareEvents: prepareEvents };

  var chat = document.getElementById("chat");
  var board = document.getElementById("board");
  var boardList = document.getElementById("boardList");
  var openBoard = document.getElementById("openBoard");
  var closeBoard = document.getElementById("closeBoard");
  var mobileEventCount = document.getElementById("mobileEventCount");
  var selectedCount = document.getElementById("selectedCount");
  var btnExport = document.getElementById("btnExport");
  var fileInput = document.getElementById("fileInput");
  var composer = document.getElementById("composer");
  var composerInput = document.getElementById("composerInput");
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
    runId: 0
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
    if (boardMode && event.checklist && event.checklist.length) {
      extra.push("챙길 것 " + event.checklist.length);
    }
    if (extra.length) details.appendChild(document.createTextNode(" " + extra.join(" · ")));
    body.appendChild(details);
    card.appendChild(body);
    addConfidence(card, event.confidence);

    var note = eventNote(event);
    if (note) card.appendChild(element("div", "note", note));
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

  function renderChat() {
    chat.innerHTML = "";
    addGreeting();
    if (!state.fileName) return;
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

  composer.addEventListener("submit", function (event) { event.preventDefault(); });
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

  apiKeyInput.value = loadStoredApiKey();
  updateAiBadge();
  renderAll();

  return {
    confidenceDots: confidenceDots,
    prepareEvents: prepareEvents,
    parseDocumentMessages: parseDocumentMessages,
    processChat: processChat
  };
});
