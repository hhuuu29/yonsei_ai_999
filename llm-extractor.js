(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.DoToDoLLM = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var MODEL = "gemini-3-flash-preview";
  var API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

  function normalizeName(value) {
    return String(value || "").trim().replace(/^@/, "").split(/[_/]/)[0].trim().replace(/\s+/g, " ");
  }

  function normalizeAudience(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.filter(function (name) { return typeof name === "string"; })
        .map(normalizeName).filter(Boolean)));
    }
    var team = typeof value === "string" && value.match(/^team:([1-9]\d*)$/);
    return team ? "team:" + Number(team[1]) : "all";
  }

  function isRelevant(item, name, teams) {
    name = normalizeName(name);
    if (!name) return true;
    var audience = normalizeAudience(item && item.audience);
    if (audience === "all") return true;
    if (Array.isArray(audience)) return audience.indexOf(name) >= 0;
    return (teams || []).some(function (team) {
      return audience === "team:" + team.team &&
        (team.names || []).map(normalizeName).indexOf(name) >= 0;
    });
  }

  function audienceSources(item) {
    return (Array.isArray(item.audienceSourceMsgIndexes) ? item.audienceSourceMsgIndexes : [])
      .filter(function (index) { return Number.isInteger(index) && index >= 0; });
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatLocalDateTime(value) {
    if (!(value instanceof Date) || isNaN(value.getTime())) return "";
    return (
      value.getFullYear() + "-" +
      pad2(value.getMonth() + 1) + "-" +
      pad2(value.getDate()) + "T" +
      pad2(value.getHours()) + ":" +
      pad2(value.getMinutes()) + ":" +
      pad2(value.getSeconds())
    );
  }

  function compactRuleEvent(event, index) {
    return {
      candidateIndex: index,
      title: String(event.title || ""),
      start: formatLocalDateTime(event.start),
      end: formatLocalDateTime(event.end),
      allDay: !!event.allDay,
      location: String(event.location || ""),
      warnings: Array.isArray(event.warnings) ? event.warnings : [],
      sourceText: String(event.sourceText || "")
    };
  }

  function buildPrompt(messages, ruleEvents) {
    var indexedMessages = (messages || []).map(function (message, index) {
      return {
        sourceMsgIndex: index,
        sentAt: formatLocalDateTime(message.sentAt || message.date),
        speaker: String(message.speaker || ""),
        text: String(message.text || "")
      };
    });
    var candidates = (ruleEvents || []).map(compactRuleEvent);

    return [
      "당신은 한국어 카카오톡 단체방에서 확정된 일정, 일정별 체크리스트, 독립 할 일을 정리하는 추출기다.",
      "기준 시간대는 Asia/Seoul이다. 아래 모든 메시지와 룰 파서 후보를 함께 검토하라.",
      "",
      "추출 규칙:",
      "- 누구에게 해당하는 공지인지 판단하라. events, 각 checklist 항목, todos 모두 audience를 반드시 넣는다. 전원은 \"all\", 명단으로 지목된 대상은 [\"이름1\",\"이름2\"], 팀 번호로 지목된 대상은 \"team:N\"이다.",
      "- 한 메시지에 여러 공지가 있어도 공지별 명단을 따로 연결한다. 부모 일정이 all이어도 명찰 지참 대상·후드집업 수령 대상 checklist에는 각각의 명단을 넣는다. 후드집업 지참(전원)과 수령(명단)은 다른 지시다.",
      "- 명단·표·팀 배정에 나온 이름을 추출해 매핑한다. 이름_소속은 이름으로 정규화한다. 팀 배정은 teams:[{team:숫자,names:[이름],sourceMsgIndex:배정원문인덱스}]로 반환한다. 메시지에 없는 팀 번호나 링크 안의 내용을 추정하지 않는다.",
      "- 멘토링 시트에 특정 팀 배정이 원문으로 주어졌다면 해당 항목은 team:N으로 표시한다. 시트 링크만 있으면 특정 팀에 배정하지 않는다.",
      "- audienceSourceMsgIndexes에는 대상 명단이나 팀 배정의 원문 인덱스를 넣는다. 최신 변경 공지는 sourceMsgIndex에, 이전 대상 명단은 audienceSourceMsgIndexes에 보존한다. 명찰 지참 대상 명단을 잃지 않되 지참 지시는 최신 배부 공지에 맞춰 갱신한다.",
      "- 날짜 해석 기준일은 반드시 각 메시지의 sentAt이다. 담주/다음주/이번주/내일/모레/그때 같은 문맥을 연결한다.",
      "- 날짜와 요일이 불일치하면 숫자 날짜를 우선하고 warnings에 경고한다.",
      "- 다른 메시지에 더 신뢰할 수 있는 요일 단서가 있으면 원문 날짜는 유지하면서 suggestedDate에 YYYY-MM-DD를 넣는다.",
      "- '~지참', '~해주세요', '~확인 부탁' 같은 지시는 별도 일정으로 만들지 말고 관련 일정 checklist에 넣는다.",
      "- 같은 주제의 공지가 바뀌면 가장 최신 내용을 사용하고 checklist 문구 끝에 '(MM/DD HH:MM 변경)'을 붙인다.",
      "- 어느 일정에도 붙일 수 없는 지시는 todos로 분리한다.",
      "- '신청/접수/제출 기간 N일~M일 X시까지'처럼 기간이 있는 마감성 공지는 기간 일정으로 만들지 않는다. 마지막 날 X시의 단일 일정으로 만들고 제목에 '마감'을 포함한다.",
      "- 원문에 없는 숫자·이름·번호를 추정해서 넣지 마. \"추정\", \"아마\" 같은 표현이 필요하면 그 정보는 빼. 제목과 checklist는 원문에서 확인 가능한 내용만.",
      "- 일정 개수에는 제한이 없다. 각 일정의 checklist만 중요도순 최대 7개다.",
      "- sourceMsgIndex는 아래 메시지 배열의 인덱스를 그대로 사용한다.",
      "- start/end는 ISO 8601 형식으로 작성한다. 시간이 있는 일정은 +09:00 오프셋을 포함하고, allDay 일정은 YYYY-MM-DD만 사용한다.",
      "- confidence는 0 이상 1 이하 숫자다.",
      "",
      "출력 객체:",
      '{"events":[{"title":"string","audience":"all","audienceSourceMsgIndexes":[],"start":"ISO 8601","end":"ISO 8601","allDay":false,"location":"string","confidence":0.0,"warnings":["string"],"suggestedDate":"YYYY-MM-DD (선택)","sourceMsgIndex":0,"checklist":[{"text":"string","audience":["이름1"],"audienceSourceMsgIndexes":[0],"sourceMsgIndex":0}]}],"todos":[{"text":"string","audience":"team:1","audienceSourceMsgIndexes":[],"sourceMsgIndex":0}],"teams":[],"summary":"N개 메시지에서 일정 N개, 할 일 N개를 찾았어요"}',
      "",
      "메시지:",
      JSON.stringify(indexedMessages),
      "",
      "룰 파서 후보:",
      JSON.stringify(candidates)
    ].join("\n");
  }

  function fallback(ruleResult, status, message) {
    var result = ruleResult || {};
    return {
      status: status,
      message: message || "",
      events: Array.isArray(result.events) ? result.events : [],
      todos: [],
      summary: ""
    };
  }

  function parseDate(value, allDay) {
    if (typeof value !== "string" || !value.trim()) return null;
    var text = value.trim();
    var dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var seoulDateTime = text.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\+09:?00$/
    );
    var parsed;
    if (allDay && dateOnly) {
      parsed = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    } else if (!allDay && seoulDateTime) {
      // DoToDo stores Seoul wall-clock fields in local Date objects before adding TZID.
      parsed = new Date(
        Number(seoulDateTime[1]),
        Number(seoulDateTime[2]) - 1,
        Number(seoulDateTime[3]),
        Number(seoulDateTime[4]),
        Number(seoulDateTime[5]),
        Number(seoulDateTime[6] || 0)
      );
    } else {
      return null;
    }
    if (isNaN(parsed.getTime())) return null;
    return allDay
      ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
      : parsed;
  }

  function normalizeChecklist(items) {
    var seen = {};
    return (Array.isArray(items) ? items : []).reduce(function (result, item) {
      if (result.length >= 7 || !item || typeof item.text !== "string") return result;
      var text = item.text.trim();
      if (!text || seen[text]) return result;
      seen[text] = true;
      result.push({
        text: text,
        audience: normalizeAudience(item.audience),
        audienceSourceMsgIndexes: audienceSources(item),
        sourceMsgIndex: Number.isInteger(item.sourceMsgIndex) ? item.sourceMsgIndex : -1
      });
      return result;
    }, []);
  }

  function normalizeEvent(event) {
    if (!event || typeof event.title !== "string") return null;
    var title = event.title.trim();
    var allDay = !!event.allDay;
    var start = parseDate(event.start, allDay);
    if (!title || !start) return null;
    var end = parseDate(event.end, allDay);
    if (!end || end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + (allDay ? 86400000 : 3600000));
    }
    var confidence = Number(event.confidence);
    if (!isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(1, confidence));
    var suggestedDate = typeof event.suggestedDate === "string"
      ? event.suggestedDate.trim()
      : "";

    return {
      title: title,
      audience: normalizeAudience(event.audience),
      audienceSourceMsgIndexes: audienceSources(event),
      start: start,
      end: end,
      allDay: allDay,
      hasClearTime: !allDay,
      location: typeof event.location === "string" ? event.location.trim() : "",
      confidence: confidence,
      warnings: (Array.isArray(event.warnings) ? event.warnings : [])
        .filter(function (warning) { return typeof warning === "string" && warning.trim(); })
        .map(function (warning) { return warning.trim(); }),
      suggestedDate: suggestedDate || undefined,
      sourceMsgIndex: Number.isInteger(event.sourceMsgIndex) ? event.sourceMsgIndex : -1,
      checklist: normalizeChecklist(event.checklist),
      selected: true
    };
  }

  function normalizeTodo(todo) {
    if (!todo || typeof todo.text !== "string" || !todo.text.trim()) return null;
    return {
      text: todo.text.trim(),
      audience: normalizeAudience(todo.audience),
      audienceSourceMsgIndexes: audienceSources(todo),
      sourceMsgIndex: Number.isInteger(todo.sourceMsgIndex) ? todo.sourceMsgIndex : -1
    };
  }

  function parseResponse(data) {
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
    if (!parsed || !Array.isArray(parsed.events) || !Array.isArray(parsed.todos)) {
      throw new Error("Gemini 응답 스키마가 올바르지 않습니다.");
    }
    var events = parsed.events.map(normalizeEvent).filter(Boolean);
    if (events.length !== parsed.events.length) {
      throw new Error("Gemini 일정 날짜 형식이 올바르지 않습니다.");
    }
    return {
      events: events,
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      todos: parsed.todos.map(normalizeTodo).filter(Boolean),
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    };
  }

  async function extract(options) {
    options = options || {};
    var ruleResult = options.ruleResult || {};
    var apiKey = String(options.apiKey || "").trim();
    var useProxy = !apiKey && options.useProxy;
    if (!apiKey && !useProxy) return fallback(ruleResult, "disabled", "API 키가 없어 LLM이 비활성화되었습니다.");

    var fetchImpl = options.fetchImpl || root.fetch;
    if (typeof fetchImpl !== "function") {
      return fallback(ruleResult, "error", "LLM 호출을 지원하지 않는 브라우저입니다.");
    }

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
            contents: [{
              parts: [{
                text: buildPrompt(options.messages || [], ruleResult.events || [])
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              thinkingConfig: { thinkingLevel: "low" }
            }
          })
        }
      );

      if (response.status === 429) {
        return fallback(ruleResult, "rate_limited", "잠시 후 다시 시도");
      }
      if (!response.ok) {
        return fallback(ruleResult, "error", response.status === 503 ? "AI 연결을 준비 중이에요. 우선 기본 일정으로 보여드릴게요." : "AI 정리에 실패해 기본 일정으로 보여드려요.");
      }

      var normalized = parseResponse(await response.json());
      return {
        status: "success",
        message: "",
        events: normalized.events,
        teams: normalized.teams.filter(function (team) {
          var source = team && (options.messages || [])[team.sourceMsgIndex];
          return source && Number.isInteger(team.team) && team.team > 0 &&
            Array.isArray(team.names) && team.names.length > 0 &&
            (new RegExp("(?:^|\\D)" + team.team + "\\s*(?:팀|조)|(?:팀|조)\\s*" + team.team + "(?:\\D|$)").test(source.text) ||
              (/(?:팀|조)(?:\s*번호)?\s*[|\t,]/.test(source.text) && String(source.text).split(/\r?\n/).some(function (line) {
                return new RegExp("^\\s*\\|?\\s*" + team.team + "\\s*[|\\t,]").test(line) &&
                  team.names.every(function (name) { return typeof name === "string" && line.includes(normalizeName(name)); });
              }))) &&
            team.names.every(function (name) { return typeof name === "string" && normalizeName(name) && source.text.includes(normalizeName(name)); });
        }).map(function (team) { return { team: team.team, names: team.names.map(normalizeName), sourceMsgIndex: team.sourceMsgIndex }; }),
        todos: normalized.todos,
        summary: normalized.summary
      };
    } catch (error) {
      return fallback(ruleResult, "error", "AI 정리에 실패해 룰 결과를 유지합니다.");
    }
  }

  return {
    MODEL: MODEL,
    normalizeName: normalizeName,
    normalizeAudience: normalizeAudience,
    isRelevant: isRelevant,
    buildPrompt: buildPrompt,
    extract: extract
  };
});
