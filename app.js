// app.js — dynamic questions + hint buttons (-1min) + digital timer + progress + leaderboard hook
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25
  };

  var state = {
    timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
    timerId: null,
    current: 0,
    solved: {},
    hintsUsed: {}
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

  // ----------------- Load questions from questions.json -----------------
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
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    tEl.textContent = (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
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
    state.timeLeftMs = clamp(state.timeLeftMs - 60 * 1000, 0, CONFIG.COUNTDOWN_MINUTES * 60 * 1000);
    updateTimerDisplay();
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

  // ----------------- Progress (padlocks) -----------------
  function injectProgress() {
    var prog = document.createElement("div");
    prog.id = "progress";
    prog.className = "card";
    prog.style.marginTop = "4rem"; // below fixed timer
    prog.innerHTML =
      "<div class='ptext' style='margin-bottom:.3rem'></div>" +
      "<div class='locks' style='font-size:1.4rem'></div>";

    var wrap = document.querySelector(".wrap");
    var roomsEl = document.getElementById("rooms");
    wrap.insertBefore(prog, roomsEl);
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

  // ----------------- Confetti burst -----------------
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
    showOverlay(
      "Mission failed",
      "The building remains sealed. Power systems never recovered."
    );
  }

  function celebrate() {
    stopTimer();
    disableAll();
    var secondsRemaining = Math.floor(state.timeLeftMs / 1000);
    askForNameAndSaveScore(secondsRemaining);
  }

  // ----------------- Leaderboard front-end -----------------
  function askForNameAndSaveScore(secondsRemaining) {
    var minutes = Math.floor(secondsRemaining / 60);
    var seconds = secondsRemaining % 60;
    var timeStr =
      (minutes < 10 ? "0" + minutes : minutes) + ":" +
      (seconds < 10 ? "0" + seconds : seconds);

    var overlay = showOverlay(
      "Power Restored",
      "<p>You escaped with <strong>" + timeStr + "</strong> left on the clock.</p>" +
      "<p>Enter your team name to save your score to the leaderboard.</p>"
