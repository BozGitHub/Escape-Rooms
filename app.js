// app.js — dynamic questions, timer, hints (-1 min), progress, anti-F5 using localStorage, local leaderboard
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    STATE_KEY: "escape_state_v1",
    SCORES_KEY: "escape_scores_v1",
    SESSION_MAX_AGE_MS: 60 * 60 * 1000 // 1 hour
  };

  var state = {
    timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
    timerId: null,
    current: 0,
    solved: {},      // {0:true,1:true,...}
    hintsUsed: {},   // {0:true,...}
    lastUpdated: Date.now()
  };

  var ROOMS = [];

  // ----------------- Helpers -----------------
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

  // ----------------- localStorage state -----------------
  function saveState() {
    try {
      state.lastUpdated = Date.now();
      var toSave = {
        timeLeftMs: state.timeLeftMs,
        current: state.current,
        solved: state.solved,
        hintsUsed: state.hintsUsed,
        lastUpdated: state.lastUpdated
      };
      localStorage.setItem(CONFIG.STATE_KEY, JSON.stringify(toSave));
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
        // too old -> ignore (new session)
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

  // ----------------- localStorage leaderboard -----------------
  function getScores() {
    try {
      var raw = localStorage.getItem(CONFIG.SCORES_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch (e) {
      return [];
    }
  }

  function saveScores(scores) {
    try {
      localStorage.setItem(CONFIG.SCORES_KEY, JSON.stringify(scores));
    } catch (e) {}
  }

  function addScore(name, secondsRemaining) {
    var scores = getScores();
    scores.push({
      name: name || "Unnamed team",
      secondsRemaining: secondsRemaining,
      timeLeftText: formatSeconds(secondsRemaining),
      date: new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    });
    // best first (more time remaining)
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
    var html = "<table style='width:100%;border-collapse:collapse;font-size:.95rem;'>"
      + "<thead><tr><th style='text-align:left;padding:.3rem;'>#</th>"
      + "<th style='text-align:left;padding:.3rem;'>Team</th>"
      + "<th style='text-align:left;padding:.3rem;'>Time Left</th>"
      + "<th style='text-align:left;padding:.3rem;'>Date</th></tr></thead><tbody>";

    for (var i = 0; i < scores.length; i++) {
      var s = scores[i];
      html += "<tr>"
        + "<td style='padding:.3rem;'>" + (i + 1) + "</td>"
        + "<td style='padding:.3rem;'>" + s.name + "</td>"
        + "<td style='padding:.3rem;'>" + s.timeLeftText + "</td>"
        + "<td style='padding:.3rem;'>" + s.date + "</td>"
        + "</tr>";
    }
    html += "</tbody></table>";

    showOverlay("Leaderboard", html);
  }

  // ----------------- Load questions -----------------
  function loadQuestions() {
    return fetch("/questions.json")
      .then(function (res) { return res.json(); })
      .then(function (data) { ROOMS = data || []; })
      .catch(function (err) {
        console.error("Failed to load questions.json", err);
        ROOMS = [];
      });
  }

  // ----------------- Timer -----------------
  function injectTimerCard() {
    var card = document.createElement("div");
    card.id = "timer-card";
    card.className = "card";
    card.style.position = "fixed";
    card.style.top = "10px";
    card.style.left = "50%";
    card.style.transform = "translateX(-50%)";
    card.style.zIndex = "50";
    card.style.maxWidth = "260px";
    card.style.textAlign = "center";
    card.style.padding = "0.6rem 1.2rem";

    card.innerHTML =
      "<div style='font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;color:#9da7b1;'>Time left</div>" +
      "<div class='tval' style='font-size:1.6rem;font-weight:700;margin-top:.15rem;'>--:--</div>";

    document.body.appendChild(card);
  }

  function updateTimerDisplay() {
    var tEl = document.querySelector("#timer-card .tval");
    if (!tEl) return;
    var s = Math.floor(state.timeLeftMs / 1000);
    tEl.textContent = formatSeconds(s);
  }

  function startTimer() {
    stopTimer();
    function tick() {
      state.timeLeftMs = clamp(
        state.timeLeftMs - 1000,
        0,
        CONFIG.COUNTDOWN_MINUTES * 60 * 1000
      );
      updateTimerDisplay();
      saveState();
      if (state.timeLeftMs <= 0) {
        stopTimer();
        failMission();
      }
    }
    state.timerId = setInterval(tick, 1000);
    updateTimerDisplay();
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function deductOneMinute() {
    state.timeLeftMs = clamp(
      state.timeLeftMs - 60 * 1000,
      0,
      CONFIG.COUNTDOWN_MINUTES * 60 * 1000
    );
    updateTimerDisplay();
    saveState();
  }

  // ----------------- Verify via /api/check -----------------
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

  // ----------------- Progress (emoji padlocks) -----------------
  function injectProgressAndLeaderboardButton() {
    var prog = document.createElement("div");
    prog.id = "progress";
    prog.className = "card";
    prog.style.marginTop = "4rem";

    prog.innerHTML =
      "<div style='display:flex;justify-content:space-between;align-items:center;gap:.5rem;'>\
         <div class='ptext'></div>\
         <button type='button' class='view-leaderboard' style='font-size:.85rem;padding:.35rem .7rem;border-radius:.75rem;border:none;cursor:pointer;background:#1f2937;color:#e5e7eb;'>View Leaderboard</button>\
       </div>\
       <div class='locks' style='font-size:1.4rem;margin-top:.3rem;'></div>";

    var wrap = document.querySelector(".wrap");
    var roomsEl = document.getElementById("rooms");
    wrap.insertBefore(prog, roomsEl);

    var btn = prog.querySelector(".view-leaderboard");
    btn.addEventListener("click", function () {
      showLeaderboard();
    });

    updateProgress();
  }

  function updateProgress() {
    var total = ROOMS.length;
    var solvedCount = 0;
    var i;
    for (i = 0; i < total; i++) {
      if (state.solved[i]) solvedCount++;
    }
    var locksStr = "";
    for (i = 0; i < total; i++) {
      locksStr += state.solved[i] ? "🔓" : "🔒";
    }

    var ptext = document.querySelector("#progress .ptext");
    var locks = document.querySelector("#progress .locks");
    if (ptext) {
      ptext.textContent =
        "Level " + (state.current + 1) + " of " + total +
        "  (" + solvedCount + "/" + total + " unlocked)";
    }
    if (locks) locks.textContent = locksStr;
  }

  // ----------------- Confetti burst (small) -----------------
  function burstAtElement(el) {
    try {
      var rect = el.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var canvas = document.createElement("canvas");
      canvas.className = "confetti-burst";
      canvas.style.position = "fixed";
      canvas.style.left = "0";
      canvas.style.top = "0";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "20";
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.body.appendChild(canvas);
      var ctx = canvas.getContext("2d");
      var parts = [];
      var i;
      for (i = 0; i < 60; i++) {
        parts.push({
          x: cx, y: cy,
          r: 2 + Math.random() * 3,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 1) * 6,
          a: 1
        });
      }
      function step() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.a *= 0.97;
          ctx.globalAlpha = Math.max(0, p.a);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
        if (parts[0].a > 0.1) requestAnimationFrame(step);
        else document.body.removeChild(canvas);
      }
      requestAnimationFrame(step);
    } catch (e) {}
  }

  // ----------------- Fail & Success -----------------
  function failMission() {
    disableAll();
    clearState();
    showOverlay(
      "Mission failed",
      "The building remains sealed. Power systems never recovered."
    );
  }

  function celebrate() {
    stopTimer();
    disableAll();
    var secondsRemaining = Math.floor(state.timeLeftMs / 1000);
    clearState();
    askForNameAndSaveScore(secondsRemaining);
  }

  // ----------------- Leaderboard front-end -----------------
  function askForNameAndSaveScore(secondsRemaining) {
    var timeStr = formatSeconds(secondsRemaining);
    var ov = showOverlay(
      "Power Restored",
      "<p>You escaped with <strong>" + timeStr + "</strong> left on the clock.</p>" +
      "<p>Enter your team name to save your score to this computer's leaderboard.</p>" +
      "<div style='margin-top:.75rem;display:flex;gap:.5rem;justify-content:center;'>\
         <input type='text' id='lb-name' placeholder='Team name' style='padding:.5rem 0.7rem;border-radius:.5rem;border:1px solid #374151;background:#020617;color:#e5e7eb;min-width:180px;'>\
         <button id='lb-save' style='padding:.5rem 0.9rem;border-radius:.5rem;border:none;background:#16a34a;color:#fff;font-weight:600;cursor:pointer;'>Save</button>\
       </div>"
    );

    var input = document.getElementById("lb-name");
    var btn = document.getElementById("lb-save");
    if (input) input.focus();

    if (btn) {
      btn.addEventListener("click", function () {
        var name = input ? input.value.trim() : "";
        addScore(name, secondsRemaining);
        ov.cover.remove();
        showLeaderboard();
      });
    }
  }

  // ----------------- Rooms -----------------
  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.setAttribute("data-index", String(i));

    div.innerHTML =
      "<h2 style='margin:0 0 .5rem 0'>" + room.title + "</h2>" +
      "<div class='q intro' style='margin-bottom:.4rem;'></div>" +
      "<div class='q prompt' style='white-space:pre-line;'></div>" +
      "<div class='controls' style='margin-top:.6rem;'>\
         <input type='text' placeholder='Type your answer...' aria-label='answer input'>\
         <button class='submit'>Submit</button>\
         <button class='hint-btn'>Show Hint (-1:00)</button>\
         <button class='next' disabled>Next Room →</button>\
       </div>" +
      "<div class='hint-text' style='margin-top:.4rem; display:none; color:#9da7b1;'></div>" +
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

    // restore hint used state
    if (state.hintsUsed[i]) {
      hintEl.style.display = "block";
      hintBtn.textContent = "Hint used (-1:00)";
      hintBtn.disabled = true;
    }

    // restore solved state
    if (state.solved[i]) {
      feedback.textContent = "Correct!";
      next.disabled = false;
    }

    submit.addEventListener("click", function () {
      var val = input.value;
      submit.disabled = true;
      feedback.textContent = "Checking...";
      verify(i, val).then(function (ok) {
        submit.disabled = false;
        if (ok) {
          state.solved[i] = true;
          feedback.textContent = "Correct!";
          feedback.className = "feedback ok";
          next.disabled = false;
          burstAtElement(submit);
          updateProgress();
          saveState();
        } else {
          feedback.textContent = "Not yet — try again!";
          feedback.className = "feedback err";
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
        var nxt = document.querySelector('.room[data-index="' + (idx + 1) + '"]');
        if (nxt) nxt.classList.add("active");
        updateProgress();
        saveState();
      } else {
        celebrate();
      }
    });

    return div;
  }

  function buildRooms() {
    var roomsEl = document.getElementById("rooms");
    roomsEl.innerHTML = "";
    for (var i = 0; i < ROOMS.length; i++) {
      roomsEl.appendChild(makeRoom(i, ROOMS[i]));
    }
  }

  // ----------------- Init flow -----------------
  function startGame() {
    injectTimerCard();
    injectProgressAndLeaderboardButton();

    // Check for saved state (anti-F5)
    var saved = loadState();
    if (saved && ROOMS.length) {
      state.timeLeftMs = saved.timeLeftMs;
      state.current = saved.current || 0;
      state.solved = saved.solved || {};
      state.hintsUsed = saved.hintsUsed || {};
    } else {
      // brand new session
      clearState();
      state.timeLeftMs = CONFIG.COUNTDOWN_MINUTES * 60 * 1000;
      state.current = 0;
      state.solved = {};
      state.hintsUsed = {};
    }

    buildRooms();
    updateProgress();
    startTimer();
  }

  function start() {
    loadQuestions().then(function () {
      startGame();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
