(function (root, factory) {
  "use strict";
  var extractor = root.DoToDoLLM;
  if (!extractor && typeof require === "function") extractor = require("./llm-extractor.js");
  var api = factory(root, extractor);
  root.DoToDoAssistant = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, extractor) {
  "use strict";

  var MODEL = extractor && extractor.MODEL
    ? extractor.MODEL
    : "gemini-3-flash-preview";
  var API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
  var ACTION_TYPES = {
    setTime: true,
    addReminder: true,
    toggleInclude: true,
    applySuggestedDate: true,
    exportAll: true
  };

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatSeoulWallClock(value) {
    if (!(value instanceof Date) || isNaN(value.getTime())) return value;
    var seoul = new Date(value.getTime() + 9 * 60 * 60 * 1000);
    return [
      seoul.getUTCFullYear(),
      "-",
      pad(seoul.getUTCMonth() + 1),
      "-",
      pad(seoul.getUTCDate()),
      "T",
      pad(seoul.getUTCHours()),
      ":",
      pad(seoul.getUTCMinutes()),
      ":",
      pad(seoul.getUTCSeconds()),
      "+09:00"
    ].join("");
  }

  function compactMessages(messages) {
    return (messages || []).map(function (message, index) {
      return {
        sourceMsgIndex: index,
        sender: String(message.speaker || message.sender || ""),
        sentAt: formatSeoulWallClock(message.sentAt),
        text: String(message.text || "")
      };
    });
  }

  function compactEvents(events) {
    return (events || []).map(function (event) {
      return {
        eventId: event.eventId,
        title: event.title,
        audience: event.audience || "all",
        start: formatSeoulWallClock(event.start),
        end: formatSeoulWallClock(event.end),
        allDay: !!event.allDay,
        location: event.location || "",
        included: event.selected !== false,
        confidence: event.confidence,
        warnings: event.warnings || [],
        suggestedDate: event.suggestedDate,
        reminders: event.reminders || [],
        checklist: event.checklist || []
      };
    });
  }

  function buildSystemPrompt(messages, events, todos, userName, teams) {
    return [
      "당신은 두투두의 한국어 일정 비서다.",
      "사용자 이름: " + (userName || "미선택"),
      "확인된 팀 배정: " + JSON.stringify(teams || []),
      "사용자가 나에게 해당하는 일을 물으면 audience와 팀 배정을 확인한다. 다른 사람 대상 공지를 사용자의 할 일로 안내하지 않는다.",
      "아래 원문 메시지, 현재 일정, 할 일만 근거로 질문에 답하거나 사용자의 지시를 구조화한다.",
      "근거가 있는 답변은 sourceMsgIndexes에 해당 원문 인덱스를 넣는다. 추측하지 않는다.",
      "지시는 실행하지 말고 다음 actions 중 필요한 것만 반환한다:",
      '- setTime: {"type":"setTime","eventId":"...","start":"YYYY-MM-DDTHH:mm:ss+09:00","end":"YYYY-MM-DDTHH:mm:ss+09:00"}',
      '- addReminder: {"type":"addReminder","eventId":"...","minutesBefore":30}',
      '- toggleInclude: {"type":"toggleInclude","eventId":"...","included":true}',
      '- applySuggestedDate: {"type":"applySuggestedDate","eventId":"..."}',
      '- exportAll: {"type":"exportAll"} 선택된 일정을 Google Calendar에 등록한다. 연결할 수 없으면 .ics로 저장한다.',
      "일정 식별에는 반드시 제공된 eventId를 그대로 사용한다.",
      "답변 다음에 현재 컨텍스트로 이어서 물을 만한 suggestedQuestions를 2~3개 제안한다.",
      "출력 스키마:",
      '{"reply":"string","sourceMsgIndexes":[0],"actions":[],"suggestedQuestions":["string"]}',
      "",
      "원문 메시지 전체:",
      JSON.stringify(compactMessages(messages)),
      "",
      "현재 events:",
      JSON.stringify(compactEvents(events)),
      "",
      "현재 todos:",
      JSON.stringify(todos || [])
    ].join("\n");
  }

  function normalizeAction(action) {
    if (!action || !ACTION_TYPES[action.type]) return null;
    if (action.type === "exportAll") return { type: "exportAll" };
    var eventId = typeof action.eventId === "string" ? action.eventId.trim() : "";
    if (!eventId) return null;
    if (action.type === "setTime") {
      if (typeof action.start !== "string" || typeof action.end !== "string") return null;
      return { type: "setTime", eventId: eventId, start: action.start, end: action.end };
    }
    if (action.type === "addReminder") {
      var minutes = Number(action.minutesBefore);
      if (!isFinite(minutes) || minutes < 0 || minutes > 10080) return null;
      return { type: "addReminder", eventId: eventId, minutesBefore: Math.round(minutes) };
    }
    if (action.type === "toggleInclude") {
      if (typeof action.included !== "boolean") return null;
      return { type: "toggleInclude", eventId: eventId, included: action.included };
    }
    return { type: "applySuggestedDate", eventId: eventId };
  }

  function parseResponse(data, messageCount) {
    var candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
    var parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : [];
    var text = parts
      .filter(function (part) { return part && typeof part.text === "string"; })
      .map(function (part) { return part.text; })
      .join("");
    if (!text) throw new Error("Gemini 응답에 text가 없습니다.");
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed.reply !== "string") {
      throw new Error("챗 비서 응답 스키마가 올바르지 않습니다.");
    }
    var seenSources = {};
    return {
      status: "success",
      reply: parsed.reply.trim(),
      sourceMsgIndexes: (Array.isArray(parsed.sourceMsgIndexes) ? parsed.sourceMsgIndexes : [])
        .filter(function (index) {
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= messageCount ||
            seenSources[index]
          ) return false;
          seenSources[index] = true;
          return true;
        }),
      actions: (Array.isArray(parsed.actions) ? parsed.actions : [])
        .map(normalizeAction)
        .filter(Boolean),
      suggestedQuestions: (Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [])
        .filter(function (question) { return typeof question === "string" && question.trim(); })
        .map(function (question) { return question.trim(); })
        .slice(0, 3)
    };
  }

  async function ask(options) {
    options = options || {};
    var apiKey = String(options.apiKey || "").trim();
    var useProxy = !apiKey && options.useProxy;
    if (!apiKey && !useProxy) {
      return {
        status: "disabled",
        reply: "AI 정제를 열어 API 키를 먼저 입력해주세요.",
        sourceMsgIndexes: [],
        actions: [],
        suggestedQuestions: []
      };
    }
    var fetchImpl = options.fetchImpl || root.fetch;
    if (typeof fetchImpl !== "function") {
      return {
        status: "error",
        reply: "이 브라우저에서는 AI 비서를 사용할 수 없어요.",
        sourceMsgIndexes: [],
        actions: [],
        suggestedQuestions: []
      };
    }

    var history = (options.history || []).map(function (entry) {
      return {
        role: entry.role === "assistant" ? "model" : "user",
        parts: [{ text: String(entry.text || "") }]
      };
    });
    history.push({
      role: "user",
      parts: [{ text: String(options.userText || "") }]
    });

    try {
      var response = await fetchImpl(
        useProxy ? "/api/gemini" : API_BASE + encodeURIComponent(MODEL) + ":generateContent",
        {
          method: "POST",
          headers: useProxy ? { "Content-Type": "application/json" } : {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: buildSystemPrompt(
                  options.messages || [],
                  options.events || [],
                  options.todos || [],
                  options.userName || "",
                  options.teams || []
                )
              }]
            },
            contents: history,
            generationConfig: {
              responseMimeType: "application/json",
              thinkingConfig: { thinkingLevel: "low" }
            }
          })
        }
      );
      if (response.status === 429) {
        return {
          status: "rate_limited",
          reply: "잠시 후 다시 시도해주세요",
          sourceMsgIndexes: [],
          actions: [],
          suggestedQuestions: []
        };
      }
      if (response.status === 503) return { status: "error", reply: "AI 연결을 준비 중이에요. 잠시 후 다시 질문해 주세요.", sourceMsgIndexes: [], actions: [], suggestedQuestions: [] };
      if (!response.ok) throw new Error("Gemini HTTP " + response.status);
      var parsed = parseResponse(await response.json(), (options.messages || []).length);
      if (parsed.suggestedQuestions.length < 2) {
        throw new Error("챗 비서 추천 질문이 2개보다 적습니다.");
      }
      return parsed;
    } catch (error) {
      return {
        status: "error",
        reply: "답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.",
        sourceMsgIndexes: [],
        actions: [],
        suggestedQuestions: []
      };
    }
  }

  return {
    MODEL: MODEL,
    ask: ask,
    buildSystemPrompt: buildSystemPrompt
  };
});
