// app.js — Fully Working Version (Timer at 260px, Hints, Leaderboard, Anti-F5)
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    STATE_KEY: "escape_state_v1",
    SCORES_KEY: "escape_scores_v1",
    SESSION_MAX_AGE_MS: 60 * 60 * 1000 // 1 hour
  };

  var HINT_PENALTY_MS = 60 * 1000; // 1 minute

  var state = {
    timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
    timerId: null,
    current: 0,
    solved: {},
    hintsUsed: {},
    lastUpdated: Date.now()
  };

  var ROOMS = [];

  // ---------- Helpers ----------
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
    cover.style.backdropFilter = "blur(3px)";
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

  // ---------- localStorage state ----------
  function saveState() {
    try {
      state.lastUpdated = Date.now();
      localStorage.setItem(CONFIG.STATE_KEY, JSON.stringify({
        timeLeftMs: state.timeLeftMs,
        current: state.current,
        solved: state.solved,
        hintsUsed: state.hintsUsed,
        lastUpdated: state.lastUpdated
      }));
    } catch (e) {}
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(CONFIG.STATE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data) return null;

      if (Date.now() - data.lastUpdated > CONFIG.SESSION_MAX_AGE_MS) {
        localStorage.removeItem(CONFIG.STATE_KEY);
        return null;
      }

      return data;
    } catch (e) { return null; }
  }

  function clearState() {
    try { localStorage.removeItem(CONFIG.STATE_KEY); } catch (e) {}
  }

  // ---------- Leaderboard localStorage ----------
  function getScores() {
    try {
      var raw = localStorage.getItem(CONFIG.SCORES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveScores(scores) {
    try { localStorage.setItem(CONFIG.SCORES_KEY, JSON.stringify(scores)); }
    catch (e) {}
  }

  function addScore(name, secondsRemaining) {
    var scores = getScores();
    scores.push({
      name: name || "Team",
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
      showOverlay("Leaderboard", "<p>No scores yet.</p>");
      return;
    }

    var html = "<table style='width:100%;border-collapse:collapse;font-size:.95rem;'>" +
      "<thead><tr>" +
      "<th style='padding:.3rem;text-align:left;'>#</th>" +
      "<th style='padding:.3rem;text-align:left;'>Team</th>" +
      "<th style='padding:.3rem;text-align:left;'>Time Left</th>" +
      "<th style='padding:.3rem;text-align:left;'>Date</th>" +
      "</tr></thead><tbody>";

    for (var i = 0; i < scores.length; i++) {
      var s = scores[i];
      html += "<tr>" +
        "<td style='padding:.3rem;'>" + (i + 1) + "</td>" +
        "<td style='padding:.3rem;'>" + s.name + "</td>" +
        "<td style='padding:.3rem;'>" + s.timeLeftText + "</td>" +
        "<td style='padding:.3rem;'>" + s.date + "</td>" +
        "</tr>";
    }

    html += "</tbody></table>";

    showOverlay("Leaderboard", html);
  }

  // ---------- Load external questions ----------
  function loadQuestions() {
    return fetch("/questions.json")
      .then(function (res) { return res.json(); })
      .then(function (data) { ROOMS = data || []; })
      .catch(function () { ROOMS = []; });
  }

  // ---------- Timer ----------
  function injectTimerCard() {
    var card = document.createElement("div");
    card.id = "timer-card";
    card.className = "card";
    card.style.position = "fixed";
    card.style.top = "260px";
    card.style.left = "50%";
    card.style.transform = "translateX(-50%)";
    card.style.zIndex = "50";
    card.style.maxWidth = "260px";
    card.style.textAlign = "center";
    card.style.padding = "0.6rem 1.2rem";

    card.innerHTML =
      "<div style='font-size:0.8rem;text-transform:uppercase;color:#9da7b1;'>Time left</div>" +
      "<div class='tval' style='font-size:1.6rem;font-weight:700;margin-top:.15rem;'>--:--</div>";

    document.body.appendChild(card);
  }

  function updateTimerDisplay() {
    var t = document.querySelector("#timer-card .tval");
    if (!t) return;
    t.textContent = formatSeconds(Math.floor(state.timeLeftMs / 1000));
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(function () {
      state.timeLeftMs = Math.max(0, state.timeLeftMs - 1000);
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
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function deductOneMinute() {
    state.timeLeftMs = Math.max(0, state.timeLeftMs - HINT_PENALTY_MS);
    updateTimerDisplay();
    saveState();
  }

  // ---------- Server verification ----------
  function verify(levelIndex, answer) {
    return fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: levelIndex, answer: answer })
    })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (d) { return !!d.ok; })
      .catch(function () { return false; });
  }

  // ---------- Progress padlocks ----------
  function injectProgress() {
    var prog = document.createElement("div");
    prog.id = "progress";
    prog.className = "card";
    prog.style.marginTop = "4rem";

    prog.innerHTML =
      "<div class='ptext'></div>" +
      "<div class='locks' style='font-size:1.4rem;margin-top:.3rem;'></div>";

    var wrap = document.querySelector(".wrap");
    var roomsEl = document.getElementById("rooms");
    wrap.insertBefore(prog, roomsEl);

    updateProgress();
  }

  function updateProgress() {
    if (!ROOMS.length) return;
    var total = ROOMS.length;
    var solved = Object.keys(state.solved).length;

    var ptext = document.querySelector("#progress .ptext");
    var locks = document.querySelector("#progress .locks");

    if (ptext)
      ptext.textContent =
        "Level " + (state.current + 1) + " of " + total +
        " (" + solved + "/" + total + " unlocked)";

    if (locks) {
      var str = "";
      for (var i = 0; i < total; i++)
        str += state.solved[i] ? "🔓" : "🔒";
      locks.textContent = str;
    }
  }

  // ---------- Confetti ----------
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
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "20";
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

      function anim() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var alive = false;

        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15;
          p.a *= 0.97;

          if (p.a > 0.05) alive = true;

          ctx.globalAlpha = Math.max(0, p.a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (alive) requestAnimationFrame(anim);
        else document.body.removeChild(canvas);
      }

      anim();
    } catch (e) {}
  }

  // ---------- Fail & Success ----------
  function failMission() {
    disableAll();
    clearState();
    showOverlay("Mission failed", "<p>You ran out of time.</p>");
  }

  function celebrate() {
    stopTimer();
    disableAll();
    var sec = Math.floor(state.timeLeftMs / 1000);
    clearState();
    askForNameAndSaveScore(sec);
  }

  function askForNameAndSaveScore(sec) {
    var timeStr = formatSeconds(sec);
    var ov = showOverlay(
      "Power Restored",
      "<p>You escaped with <strong>" + timeStr + "</strong> remaining.</p>" +
      "<p>Enter your team name to save your score:</p>" +
      "<div style='margin-top:.75rem;display:flex;gap:.5rem;justify-content:center;'>" +
      "<input type='text' id='lb-name' placeholder='Team name' style='padding:.5rem .7rem;border-radius:.5rem;border:1px solid #374151;background:#020617;color:#e5e7eb;min-width:180px;'>" +
      "<button id='lb-save' style='padding:.5rem .9rem;border-radius:.5rem;border:none;background:#16a34a;color:#fff;font-weight:600;cursor:pointer;'>Save</button>" +
      "</div>"
    );

    var input = document.getElementById("lb-name");
    var btn = document.getElementById("lb-save");

    if (input) input.focus();

    if (btn) {
      btn.addEventListener("click", function () {
        addScore(input.value.trim(), sec);
        ov.cover.remove();
        showLeaderboard();
      });
    }
  }

  // ---------- Build Rooms ----------
  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.setAttribute("data-index", i);

    div.innerHTML =
      "<h2 style='margin:0 0 .5rem 0'>" + room.title + "</h2>" +
      "<div class='q'>" + room.prompt + "</div>" +
      "<div class='controls' style='margin-top:.6rem;'>" +
        "<input type='text' placeholder='Type your answer...'>" +
        "<button class='submit'>Submit</button>" +
        "<button class='hint-btn'>Show Hint (-1:00)</button>" +
        "<button class='next' disabled>Next Room →</button>" +
      "</div>" +
      "<div class='hint-text' style='display:none;color:#9da7b1;margin-top:.4rem;'>Hint: " + (room.hint || "") + "</div>" +
      "<div class='feedback' style='margin-top:.3rem;'></div>";

    var input = div.querySelector("input");
    var submit = div.querySelector(".submit");
    var next = div.querySelector(".next");
    var hintBtn = div.querySelector(".hint-btn");
    var hintText = div.querySelector(".hint-text");
    var fb = div.querySelector(".feedback");

    // restore hint
    if (state.hintsUsed[i]) {
      hintText.style.display = "block";
      hintBtn.textContent = "Hint used (-1:00)";
      hintBtn.disabled = true;
    }

    // restore solved
    if (state.solved[i]) {
      fb.textContent = "Correct!";
      fb.className = "feedback ok";
      next.disabled = false;
    }

    submit.addEventListener("click", function () {
      var val = input.value.trim();
      submit.disabled = true;
      fb.textContent = "Checking...";
      fb.className = "feedback";

      verify(i, val).then(function (ok) {
        submit.disabled = false;
        if (ok) {
          state.solved[i] = true;
          fb.textContent = "Correct!";
          fb.className = "feedback ok";
          next.disabled = false;
          burstAtElement(submit);
          updateProgress();
          saveState();
        } else {
          fb.textContent = "Not yet — try again!";
          fb.className = "feedback err";
        }
      });
    });

    hintBtn.addEventListener("click", function () {
      if (state.hintsUsed[i]) return;
      state.hintsUsed[i] = true;
      hintText.style.display = "block";
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

  // ---------- Start Game ----------
  function startGame() {
    injectTimerCard();
    injectProgress();

    var saved = loadState();
    if (saved) {
      state.timeLeftMs = saved.timeLeftMs;
      state.current = saved.current;
      state.solved = saved.solved;
      state.hintsUsed = saved.hintsUsed;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
