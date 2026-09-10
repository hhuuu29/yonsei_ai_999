(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.DoToDoCalendar = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly"
  ].join(" ");
  var CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  var SEOUL_MS = 9 * 60 * 60 * 1000;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function wallParts(date) {
    return {
      y: date.getFullYear(),
      m: pad(date.getMonth() + 1),
      d: pad(date.getDate()),
      h: pad(date.getHours()),
      min: pad(date.getMinutes()),
      s: pad(date.getSeconds())
    };
  }

  function formatWallDate(date) {
    var p = wallParts(date);
    return p.y + "-" + p.m + "-" + p.d;
  }

  function formatWallDateTime(date) {
    var p = wallParts(date);
    return formatWallDate(date) + "T" + p.h + ":" + p.min + ":" + p.s;
  }

  function formatSeoulOffset(date) {
    return formatWallDateTime(date) + "+09:00";
  }

  function wallClockUtcMs(date) {
    return Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    ) - SEOUL_MS;
  }

  function parseGoogleInstant(part, isEnd) {
    if (!part) return NaN;
    if (part.dateTime) return Date.parse(part.dateTime);
    if (part.date) {
      var match = String(part.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return NaN;
      var start = Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      ) - SEOUL_MS;
      return isEnd ? start : start;
    }
    return NaN;
  }

  function googleAllDayEnd(part) {
    if (!part || !part.date) return parseGoogleInstant(part, true);
    var match = String(part.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return NaN;
    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    ) - SEOUL_MS;
  }

  function eventRangeUtc(event) {
    var start = event.allDay
      ? Date.UTC(event.start.getFullYear(), event.start.getMonth(), event.start.getDate()) - SEOUL_MS
      : wallClockUtcMs(event.start);
    var endDate = event.end instanceof Date ? event.end : new Date(event.start.getTime() + 3600000);
    var end = event.allDay
      ? Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) - SEOUL_MS
      : wallClockUtcMs(endDate);
    return { start: start, end: end };
  }

  function existingRangeUtc(existing) {
    var start = parseGoogleInstant(existing.start, false);
    var end = existing.end && existing.end.date
      ? googleAllDayEnd(existing.end)
      : parseGoogleInstant(existing.end, true);
    return { start: start, end: end };
  }

  function formatClockRange(existing) {
    if (existing.start && existing.start.date) return "하루 종일";
    var start = existing.start && existing.start.dateTime
      ? new Date(existing.start.dateTime)
      : null;
    var end = existing.end && existing.end.dateTime
      ? new Date(existing.end.dateTime)
      : null;
    if (!start || isNaN(start.getTime())) return "";
    function clock(date) {
      var seoul = new Date(date.getTime() + SEOUL_MS);
      return pad(seoul.getUTCHours()) + ":" + pad(seoul.getUTCMinutes());
    }
    return end && !isNaN(end.getTime())
      ? clock(start) + "–" + clock(end)
      : clock(start);
  }

  function conflictLabel(existing) {
    var title = String(existing.summary || "제목 없는 일정").trim() || "제목 없는 일정";
    var time = formatClockRange(existing);
    return time
      ? "기존 일정과 겹쳐요: " + title + " " + time
      : "기존 일정과 겹쳐요: " + title;
  }

  function sourceSummary(event, messages) {
    var indexes = [];
    var seen = {};
    function add(index) {
      if (!Number.isInteger(index) || index < 0 || seen[index]) return;
      seen[index] = true;
      indexes.push(index);
    }
    add(event.sourceMsgIndex);
    (event.checklist || []).forEach(function (item) { add(item.sourceMsgIndex); });
    return indexes.map(function (index) {
      var message = (messages || [])[index];
      if (!message) return "";
      var speaker = message.speaker || message.sender || "";
      var text = String(message.text || "").replace(/\s+/g, " ").trim();
      return speaker ? speaker + ": " + text : text;
    }).filter(Boolean);
  }

  function eventDescription(event, messages) {
    var lines = [];
    var checklist = (event.checklist || []).filter(function (item) {
      return item && item.text;
    });
    if (checklist.length) {
      lines.push("챙길 것");
      checklist.forEach(function (item) {
        lines.push("• " + item.text);
      });
      lines.push("");
    }
    var evidence = sourceSummary(event, messages);
    if (evidence.length) {
      lines.push("근거");
      evidence.forEach(function (line) { lines.push(line); });
    }
    return lines.join("\n").trim();
  }

  function eventToGoogleEvent(event, messages) {
    var body = {
      summary: event.title || "일정",
      description: eventDescription(event, messages)
    };
    if (event.location) body.location = event.location;
    if (event.allDay) {
      body.start = { date: formatWallDate(event.start) };
      body.end = {
        date: formatWallDate(event.end instanceof Date ? event.end : new Date(
          event.start.getFullYear(),
          event.start.getMonth(),
          event.start.getDate() + 1
        ))
      };
    } else {
      body.start = { dateTime: formatWallDateTime(event.start), timeZone: "Asia/Seoul" };
      body.end = {
        dateTime: formatWallDateTime(event.end instanceof Date ? event.end : new Date(event.start.getTime() + 3600000)),
        timeZone: "Asia/Seoul"
      };
    }
    var reminders = Array.isArray(event.reminders) ? event.reminders : [];
    if (reminders.length) {
      var seen = {};
      body.reminders = {
        useDefault: false,
        overrides: reminders.filter(function (minutes) {
          var value = Math.round(Number(minutes));
          if (!isFinite(value) || value < 0 || seen[value]) return false;
          seen[value] = true;
          return true;
        }).map(function (minutes) {
          return { method: "popup", minutes: Math.round(Number(minutes)) };
        })
      };
    }
    return body;
  }

  function findConflicts(events, existingEvents) {
    var conflicts = {};
    (events || []).forEach(function (event) {
      if (!event || !event.eventId || !(event.start instanceof Date)) return;
      var local = eventRangeUtc(event);
      (existingEvents || []).forEach(function (existing) {
        var remote = existingRangeUtc(existing);
        if (!isFinite(local.start) || !isFinite(local.end) || !isFinite(remote.start) || !isFinite(remote.end)) {
          return;
        }
        if (local.start < remote.end && remote.start < local.end) {
          conflicts[event.eventId] = conflicts[event.eventId] || [];
          var label = conflictLabel(existing);
          if (conflicts[event.eventId].indexOf(label) < 0) conflicts[event.eventId].push(label);
        }
      });
    });
    return conflicts;
  }

  function selectedRange(events) {
    var start = null;
    var end = null;
    (events || []).forEach(function (event) {
      if (!(event.start instanceof Date)) return;
      var range = eventRangeUtc(event);
      if (start == null || range.start < start) start = range.start;
      if (end == null || range.end > end) end = range.end;
    });
    if (start == null || end == null) return null;
    function fromUtc(ms) {
      var seoul = new Date(ms + SEOUL_MS);
      return new Date(
        seoul.getUTCFullYear(),
        seoul.getUTCMonth(),
        seoul.getUTCDate(),
        seoul.getUTCHours(),
        seoul.getUTCMinutes(),
        seoul.getUTCSeconds()
      );
    }
    return { start: fromUtc(start), end: fromUtc(end) };
  }

  function requestAccessToken(options) {
    options = options || {};
    var clientId = String(options.clientId || "").trim();
    var googleIdentity = options.googleIdentity || root.google;
    if (!clientId) {
      return Promise.resolve({ status: "missing_client", accessToken: "" });
    }
    if (
      !googleIdentity ||
      !googleIdentity.accounts ||
      !googleIdentity.accounts.oauth2 ||
      typeof googleIdentity.accounts.oauth2.initTokenClient !== "function"
    ) {
      return Promise.resolve({ status: "unavailable", accessToken: "" });
    }
    return new Promise(function (resolve) {
      var settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        resolve(result);
      }
      try {
        var client = googleIdentity.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: function (response) {
            if (response && response.access_token) {
              finish({
                status: "success",
                accessToken: response.access_token,
                expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000
              });
              return;
            }
            finish({ status: "denied", accessToken: "" });
          },
          error_callback: function () {
            finish({ status: "denied", accessToken: "" });
          }
        });
        client.requestAccessToken({ prompt: options.prompt || "" });
      } catch (error) {
        finish({ status: "unavailable", accessToken: "" });
      }
    });
  }

  async function calendarFetch(accessToken, url, options, fetchImpl) {
    var response = await (fetchImpl || root.fetch)(url, Object.assign({}, options || {}, {
      headers: Object.assign({
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      }, options && options.headers)
    }));
    if (response.status === 401) {
      var authError = new Error("Google Calendar 인증이 만료되었어요.");
      authError.code = "AUTH";
      throw authError;
    }
    if (!response.ok) {
      var error = new Error("Google Calendar HTTP " + response.status);
      error.code = ({403: "FORBIDDEN", 404: "NOT_FOUND", 409: "EXISTS", 412: "CONFLICT", 429: "RATE_LIMIT"})[response.status] || "HTTP";
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function listEvents(accessToken, range, fetchImpl) {
    if (!range) return [];
    var params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: formatSeoulOffset(range.start),
      timeMax: formatSeoulOffset(range.end)
    });
    var items = [];
    var data;
    do {
      data = await calendarFetch(
      accessToken,
      CALENDAR_API + "?" + params.toString(),
      { method: "GET" },
      fetchImpl
    );
      items = items.concat(Array.isArray(data.items) ? data.items : []);
      if (data.nextPageToken) params.set("pageToken", data.nextPageToken);
    } while (data.nextPageToken);
    return items.filter(function (item) { return item.status !== "cancelled"; });
  }

  async function createEvent(accessToken, body, fetchImpl) {
    try {
      return await calendarFetch(accessToken, CALENDAR_API, { method: "POST", body: JSON.stringify(body) }, fetchImpl);
    } catch (error) {
      if (error.code !== "EXISTS" || !body.id) throw error;
      return calendarFetch(accessToken, CALENDAR_API + "/" + encodeURIComponent(body.id), { method: "GET" }, fetchImpl);
    }
  }

  function updateEvent(accessToken, id, patch, etag, fetchImpl) {
    if (!id || !etag) return Promise.reject(new Error("일정을 새로고침한 뒤 수정해 주세요."));
    return calendarFetch(accessToken, CALENDAR_API + "/" + encodeURIComponent(id), {
      method: "PATCH", headers: { "If-Match": etag }, body: JSON.stringify(patch)
    }, fetchImpl);
  }

  function deleteEvent(accessToken, id, etag, fetchImpl) {
    if (!id || !etag) return Promise.reject(new Error("일정을 새로고침한 뒤 삭제해 주세요."));
    return calendarFetch(accessToken, CALENDAR_API + "/" + encodeURIComponent(id), {
      method: "DELETE", headers: { "If-Match": etag }
    }, fetchImpl);
  }

  async function insertEvents(accessToken, events, messages, fetchImpl) {
    var inserted = [];
    for (var i = 0; i < (events || []).length; i++) {
      var created = await calendarFetch(
        accessToken,
        CALENDAR_API,
        {
          method: "POST",
          body: JSON.stringify(eventToGoogleEvent(events[i], messages))
        },
        fetchImpl
      );
      inserted.push(created);
    }
    return inserted;
  }

  async function syncAndInsert(options) {
    options = options || {};
    var fetchImpl = options.fetchImpl || root.fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error("이 브라우저에서는 Google Calendar를 호출할 수 없어요.");
    }
    var existing = await listEvents(
      options.accessToken,
      selectedRange(options.events),
      fetchImpl
    );
    var inserted = await insertEvents(
      options.accessToken,
      options.events,
      options.messages,
      fetchImpl
    );
    var htmlLink = inserted.map(function (item) { return item && item.htmlLink; }).find(Boolean);
    return {
      existing: existing,
      conflicts: findConflicts(options.events, existing),
      inserted: inserted,
      calendarUrl: htmlLink || "https://calendar.google.com/calendar/r"
    };
  }

  return {
    SCOPES: SCOPES,
    eventToGoogleEvent: eventToGoogleEvent,
    findConflicts: findConflicts,
    requestAccessToken: requestAccessToken,
    listEvents: listEvents,
    createEvent: createEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
    insertEvents: insertEvents,
    syncAndInsert: syncAndInsert,
    selectedRange: selectedRange
  };
});
