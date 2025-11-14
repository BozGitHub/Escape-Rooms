// app.js — dynamic questions, timer, hints (-1 min), progress (locks disappear), anti-F5 using localStorage, local leaderboard
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    STATE_KEY: "escape_state_v1",
    SCORES_KEY: "escape_scores_v1",
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
    } catch (e) {
      return null;
    }
  }

  function clearState() {
    try { localStorage.removeItem(CONFIG.STATE_KEY); } catch (e) {}
  }

  function getScores() {
    try {
      var raw = localStorage.getItem(CONFIG.SCORES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveScores(scores) {
    try { localStorage.setItem(CONFIG.SCORES_KEY, JSON.stringify(scores)); } catch (e) {}
  }

  function addScore(name, secondsRemaining) {
    var scores = getScores();
    scores.push({
      name: name || "Unnamed team",
      secondsRemaining: secondsRemaining,
      timeLeftText: formatSeconds(secondsRemaining),
      date: new Date().toISOString().slice(0, 10)
    });
    scores.sort(function (a, b) { return b.secondsRemaining - a.secondsRemaining; });
    saveScores(scores);
  }

  function formatSeconds(s) {
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  function showLeaderboard() {
    var scores = getScores();
    if (!scores.length) {
      showOverlay("Leaderboard", "<p>No scores recorded yet.</p>");
      return;
    }

    var html = "<table style='width:100%;border-collapse:collapse;font-size:.95rem;'>" +
      "<thead><tr><th>#</th><th>Team</th><th>Time Left</th><th>Date</th></tr></thead><tbody>";

    for (var i = 0; i < scores.length; i++) {
      var s = scores[i];
      html += "<tr>" +
        "<td>" + (i + 1) + "</td>" +
        "<td>" + s.name + "</td>" +
        "<td>" + s.timeLeftText + "</td>" +
        "<td>" + s.date + "</td>" +
        "</tr>";
    }
    html += "</tbody></table>";

    showOverlay("Leaderboard", html);
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

  function injectProgressAndLeaderboardButton() {
    var prog = document.createElement("div");
    prog.id = "progress";
    prog.className = "card";
    prog.style.marginTop = "3rem";

    prog.innerHTML =
      "<div style='display:flex;justify-content:space-between;align-items:center;'>" +
      "  <div class='ptext'></div>" +
      "  <button class='view-leaderboard' style='font-size:.85rem;padding:.35rem .7rem;border:none;border-radius:.7rem;background:#1f2937;color:#e5e7eb;cursor:pointer;'>Leaderboard</button>" +
      "</div>" +
      "<div class='locks' style='font-size:1.6rem;margin-top:.4rem;'></div>";

    var wrap = document.querySelector(".wrap");
    wrap.insertBefore(prog, document.getElementById("rooms"));

    prog.querySelector(".view-leaderboard").addEventListener("click", showLeaderboard);

    updateProgress();
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
    var secs = Math.floor(state.timeLeftMs / 1000);
    clearState();
    askForNameAndSaveScore(secs);
  }

  function askForNameAndSaveScore(secs) {
    var timeStr = formatSeconds(secs);
    var ov = showOverlay(
      "Power Restored",
      "<p>You escaped with <strong>" + timeStr + "</strong> remaining.</p>" +
      "<p>Enter a team name to save your score:</p>" +
      "<div style='margin-top:.75rem;display:flex;gap:.5rem;justify-content:center;'>" +
      "<input id='lb-name' placeholder='Team name' style='padding:.5rem;border-radius:.4rem;background:#000;color:#fff;border:1px solid #333;'>" +
      "<button id='lb-save' style='padding:.5rem .9rem;border:none;border-radius:.4rem;background:#16a34a;color:#fff;'>Save</button>" +
      "</div>"
    );

    var input = document.getElementById("lb-name");
    var btn = document.getElementById("lb-save");
    if (input) input.focus();

    btn.addEventListener("click", function () {
      addScore(input.value.trim(), secs);
      ov.cover.remove();
      showLeaderboard();
    });
  }

  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.setAttribute("data-index", i);

    div.innerHTML =
      "<h2 style='margin:0 0 .5rem 0'>" + room.title + "</h2>" +
      "<div class='q intro' style='margin-bottom:.4rem;'></div>" +
      "<div class='q prompt' style='white-space:pre-line;'></div>" +
      "<div class='controls' style='margin-top:.6rem;'>" +
      "  <input type='text' placeholder='Type your answer...'>" +
      "  <button class='submit'>Submit</button>" +
      "  <button class='hint-btn'>Show Hint (-1:00)</button>" +
      "  <button class='next' disabled>Next →</button>" +
      "</div>" +
      "<div class='hint-text' style='display:none;margin-top:.4rem;color:#9da7b1;'></div>" +
      "<div class='feedback' style='margin-top:.3rem;'></div>";

    var introEl = div.querySelector(".intro");
    var promptEl = div.querySelector(".prompt");
    var hintEl = div.querySelector(".hint-text");
    var submit = div.querySelector(".submit");
    var next = div.querySelector(".next");
    var hintBtn = div.querySelector(".hint-btn");
    var feedback = div.querySelector(".feedback");
    var input = div.querySelector("input");

    introEl.textContent = room.intro || "";
    promptEl.textContent = room.prompt || "";
    hintEl.textContent = "Hint: " + (room.hint || "");

    if (state.hintsUsed[i]) {
      hintEl.style.display = "block";
      hintBtn.textContent = "Hint used (-1:00)";
      hintBtn.disabled = true;
    }

    if (state.solved[i]) {
      feedback.textContent = "Correct!";
      next.disabled = false;
    }

    submit.addEventListener("click", function () {
      submit.disabled = true;
      feedback.textContent = "Checking...";

      verify(i, input.value).then(function (ok) {
        submit.disabled = false;
        if (ok) {
          state.solved[i] = true;
          feedback.textContent = "Correct!";
          next.disabled = false;
          updateProgress();
          saveState();
        } else {
          feedback.textContent = "Not yet — try again!";
        }
      });
    });

    hintBtn.addEventListener("click", function () {
      if (state.hintsUsed[i]) return;
      state.hintsUsed[i] = true;
      hintEl.style.display = "block";
      hintBtn.textContent = "Hint used (-1:00)";
      hintBtn.disabled = true;
      deductOneMinute();
      saveState();
    });

    next.addEventListener("click", function () {
      var idx = parseInt(div.getAttribute("data-index"), 10);
      div.classList.remove("active");
      if (idx + 1 < ROOMS.length) {
        state.current = idx + 1;
        document.querySelector('.room[data-index="' + (idx + 1) + '"]').classList.add("active");
        updateProgress();
        saveState();
      } else {
        celebrate();
      }
    });

    return div;
  }

  function buildRooms() {
    var container = document.getElementById("rooms");
    container.innerHTML = "";
    for (var i = 0; i < ROOMS.length; i++) {
      container.appendChild(makeRoom(i, ROOMS[i]));
    }
  }

  function startGame() {
    injectTimerCard();
    injectProgressAndLeaderboardButton();

    var saved = loadState();
    if (saved && ROOMS.length) {
      state = saved;
    } else {
      clearState();
    }

    buildRooms();
    updateProgress();
    startTimer();
  }

  function start() {
    loadQuestions().then(startGame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
