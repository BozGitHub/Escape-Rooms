// UPDATED app.js — dynamic questions, timer, hints (configurable), improved padlocks, hidden leaderboard until finish
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    HINT_PENALTY_MS: 60000, // editable
    STATE_KEY: "escape_state_v1",
    SCORES_KEY: "escape_scores_v1",
    SESSION_MAX_AGE_MS: 60 * 60 * 1000
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

  function toStr(x) { return String(x == null ? "" : x); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function disableAll() {
    var els = document.querySelectorAll("input,button");
    for (var i = 0; i < els.length; i++) els[i].disabled = true;
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
    box.innerHTML =
      "<h2 style='margin-top:0'>" + toStr(title) + "</h2>" +
      "<div class='q' style='margin-top:.5rem'>" + bodyHtml + "</div>";

    cover.appendChild(box);
    document.body.appendChild(cover);
    return { cover: cover, box: box };
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
      var age = Date.now() - (data.lastUpdated || 0);
      if (age > CONFIG.SESSION_MAX_AGE_MS) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function clearState() {
    try { localStorage.removeItem(CONFIG.STATE_KEY); } catch (e) {}
  }

  // Leaderboard
  function getScores() {
    try {
      var raw = localStorage.getItem(CONFIG.SCORES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveScores(scores) {
    try { localStorage.setItem(CONFIG.SCORES_KEY, JSON.stringify(scores)); } catch (e) {}
  }

  function addScore(name, sec) {
    var scores = getScores();
    scores.push({
      name: name || "Unnamed team",
      secondsRemaining: sec,
      timeLeftText: formatSeconds(sec),
      date: new Date().toISOString().slice(0, 10)
    });
    scores.sort(function (a, b) { return b.secondsRemaining - a.secondsRemaining; });
    saveScores(scores);
  }

  function formatSeconds(s) {
    var m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? "0" + m : m) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  function showLeaderboard() {
    var scores = getScores();
    if (!scores.length) return showOverlay("Leaderboard", "<p>No scores yet.</p>");

    var html = "<table style='width:100%;border-collapse:collapse;'>";
    html += "<tr><th>#</th><th>Team</th><th>Time Left</th><th>Date</th></tr>";
    scores.forEach(function (s, i) {
      html += "<tr><td>" + (i+1) + "</td><td>" + s.name + "</td><td>" + s.timeLeftText + "</td><td>" + s.date + "</td></tr>";
    });
    html += "</table>";

    showOverlay("Leaderboard", html);
  }

  // Load questions.json
  function loadQuestions() {
    return fetch("/questions.json")
      .then(function (r) { return r.json(); })
      .then(function (j) { ROOMS = j || []; })
      .catch(function () { ROOMS = []; });
  }

  // Timer
  function injectTimerCard() {
    var card = document.createElement("div");
    card.id = "timer-card";
    card.className = "card";
    card.style.position = "fixed";
    card.style.top = "260px";
    card.style.left = "50%";
    card.style.transform = "translateX(-50%)";
    card.style.zIndex = "50";
    card.innerHTML =
      "<div style='font-size:.8rem;color:#9da7b1;'>Time left</div>" +
      "<div class='tval' style='font-size:1.6rem;font-weight:700;'>--:--</div>";
    document.body.appendChild(card);
  }

  function updateTimerDisplay() {
    var el = document.querySelector("#timer-card .tval");
    if (!el) return;
    var sec = Math.floor(state.timeLeftMs / 1000);
    el.textContent = formatSeconds(sec);
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(function () {
      state.timeLeftMs = clamp(state.timeLeftMs - 1000, 0, CONFIG.COUNTDOWN_MINUTES*60000);
      updateTimerDisplay();
      saveState();
      if (state.timeLeftMs <= 0) {
        stopTimer();
        failMission();
      }
    }, 1000);
    updateTimerDisplay();
  }

  function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  function deductHintTime() {
    state.timeLeftMs = clamp(
      state.timeLeftMs - CONFIG.HINT_PENALTY_MS,
      0,
      CONFIG.COUNTDOWN_MINUTES * 60000
    );
    updateTimerDisplay();
    saveState();
  }

  // Server verify
  function verify(level, ans) {
    return fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: level, answer: ans })
    })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (d) { return !!d.ok; })
      .catch(function () { return false; });
  }

  // Progress bar
  function injectProgress() {
    var prog = document.createElement("div");
    prog.id = "progress";
    prog.className = "card";
    prog.style.marginTop = "4rem";
    prog.innerHTML =
      "<div class='ptext'></div>" +
      "<div class='locks' style='font-size:1.4rem;margin-top:.3rem;'></div>";

    var wrap = document.querySelector(".wrap");
    wrap.insertBefore(prog, document.getElementById("rooms"));
  }

  function updateProgress() {
    var total = ROOMS.length;
    var solvedCount = 0;
    for (var i = 0; i < total; i++) if (state.solved[i]) solvedCount++;

    var lockStr = "";
    for (var j = 0; j < total; j++) lockStr += state.solved[j] ? "🔓" : "🔒";

    document.querySelector("#progress .ptext").textContent =
      "Level " + (state.current+1) + " of " + total +
      "  (" + solvedCount + "/" + total + " unlocked)";

    document.querySelector("#progress .locks").textContent = lockStr;
  }

  // Fail
  function failMission() {
    disableAll();
    clearState();
    showOverlay("Mission failed", "You ran out of time.");
  }

  // Win
  function celebrate() {
    stopTimer();
    disableAll();
    clearState();
    var sec = Math.floor(state.timeLeftMs/1000);

    var ov = showOverlay(
      "Power Restored",
