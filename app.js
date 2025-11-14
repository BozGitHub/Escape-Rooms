// app.js — dynamic questions, timer, hints (-1 min), progress (locks disappear), anti-F5 using localStorage
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    STATE_KEY: "escape_state_v1",
    SESSION_MAX_AGE_MS: 60 * 60 * 1000,
    HINT_PENALTY_MS: 60000
  };

  var state = {
    timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
    timerId: null,
    current: 0,
    solved: {},
    hintsUsed: {},
    lastUpdated: Date.now()
  };

  var ROOMS = [];

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toStr(x) { return String(x == null ? "" : x); }

  function flashIncorrect() {
    var overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(255,0,0,0.45)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "20000";
    overlay.style.fontSize = "2rem";
    overlay.style.fontWeight = "800";
    overlay.style.color = "#fff";
    overlay.style.textShadow = "0 0 10px #000";
    overlay.textContent = "Incorrect Answer";

    document.body.appendChild(overlay);
    setTimeout(function () {
      overlay.style.transition = "opacity .3s";
      overlay.style.opacity = "0";
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 300);
    }, 600);
  }

  function showOverlay(title, bodyHtml) {
    var cover = document.createElement("div");
    cover.style.position = "fixed";
    cover.style.inset = "0";
    cover.style.background = "rgba(0,0,0,.75)";
    cover.style.backdropFilter = "blur(2px)";
    cover.style.display = "flex";
    cover.style.alignItems = "center";
    cover.style.justifyContent = "center";
    cover.style.zIndex = "9999";

    var box = document.createElement("div");
    box.className = "card";
    box.style.maxWidth = "720px";
    box.style.textAlign = "center";
    box.innerHTML = "<h2 style='margin-top:0'>" + toStr(title) + "</h2>" +
      "<div class='q' style='margin-top:.5rem'>" + bodyHtml + "</div>";

    cover.appendChild(box);
    document.body.appendChild(cover);
    return { cover: cover, box: box };
  }

  function disableAll() {
    var els = document.querySelectorAll("input,button");
    for (var i = 0; i < els.length; i++) els[i].disabled = true;
  }

  function saveState() {
    try {
      state.lastUpdated = Date.now();
      localStorage.setItem(CONFIG.STATE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(CONFIG.STATE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data.timeLeftMs !== "number") return null;
      var age = Date.now() - (data.lastUpdated || 0);
      if (age > CONFIG.SESSION_MAX_AGE_MS) {
        localStorage.removeItem(CONFIG.STATE_KEY);
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  function clearState() {
    try { localStorage.removeItem(CONFIG.STATE_KEY); } catch (e) {}
  }

  function loadQuestions() {
    return fetch("/questions.json")
      .then(function (res) { return res.json(); })
      .then(function (data) { ROOMS = data || []; })
      .catch(function () { ROOMS = []; });
  }

  function injectTimerCard() {
    var card = document.createElement("div");
    card.id = "timer-card";
    card.className = "card";
    card.style.position = "fixed";
    card.style.top = "200px";
    card.style.left = "50%";
    card.style.transform = "translateX(-50%)";
    card.style.zIndex = "50";
    card.style.maxWidth = "260px";
    card.style.textAlign = "center";

    card.innerHTML =
      "<div style='font-size:0.8rem;color:#9da7b1;'>Time left</div>" +
      "<div class='tval' style='font-size:1.8rem;font-weight:700;'>--:--</div>" +
      "<div style='margin-top:4px;font-size:.75rem;color:#aaa;'>Hint costs time</div>";

    document.body.appendChild(card);
  }

  function updateTimerDisplay() {
    var el = document.querySelector("#timer-card .tval");
    if (!el) return;
    el.textContent = formatSeconds(Math.floor(state.timeLeftMs / 1000));
  }

  function startTimer() {
    stopTimer();
    function tick() {
      state.timeLeftMs = clamp(state.timeLeftMs - 1000, 0, CONFIG.COUNTDOWN_MINUTES * 60000);
      updateTimerDisplay();
      saveState();
      if (state.timeLeftMs <= 0) { stopTimer(); failMission(); }
    }
    state.timerId = setInterval(tick, 1000);
    updateTimerDisplay();
  }

  function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  function deductOneMinute() {
    state.timeLeftMs = clamp(state.timeLeftMs - CONFIG.HINT_PENALTY_MS, 0, CONFIG.COUNTDOWN_MINUTES * 60000);
    updateTimerDisplay();
    saveState();
  }

  function verify(levelIndex, answer) {
    return fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: levelIndex, answer: answer })
    })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (d) { return !!(d && d.ok); })
      .catch(function () { return false; });
  }

  function updateProgress() {
    var total = ROOMS.length;
    var locksEl = document.querySelector("#progress .locks");
    var textEl = document.querySelector("#progress .ptext");

    var locked = "";
    var solvedCount = 0;

    for (var i = 0; i < total; i++) {
      if (state.solved[i]) solvedCount++;
      else locked += "🔒";
    }

    if (locksEl) locksEl.textContent = locked;
    if (textEl) textEl.textContent =
      "Level " + (state.current + 1) + " of " + total +
      "  (" + solvedCount + "/" + total + " unlocked)";
  }

  function failMission() {
    disableAll();
    clearState();
    showOverlay("Mission failed", "You ran out of time.");
  }

  function celebrate() {
    stopTimer();
    disableAll();
    clearState();
    showOverlay("Escaped!", "You restored power and escaped!");
  }

  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.setAttribute("data-index", i);

    div.innerHTML =
      "<h2 style='margin:0 0 .5rem 0'>" + room.title + "</h2>" +
      "<div class='q intro' style='margin-bottom:.4rem;'></div>" +
      "<div class='q prompt' style='white-space:pre-line;'></div>" +
      "<div class='controls'
