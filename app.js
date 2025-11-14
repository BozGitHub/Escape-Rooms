// app.js — dynamic questions, timer, hints (time penalty), disappearing locks, anti-F5
(function () {
  // ---------------- CONFIG ----------------
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    STATE_KEY: "escape_state_v1",
    SESSION_MAX_AGE_MS: 60 * 60 * 1000,
    // change this number to adjust hint penalty:
    // 60000 = 1 min, 300000 = 5 min, etc.
    HINT_PENALTY_MS: 60000
  };

  // ---------------- STATE ----------------
  var state = {
    timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60000,
    timerId: null,
    current: 0,
    solved: {},
    hintsUsed: {},
    lastUpdated: Date.now()
  };

  var ROOMS = [];

  // ---------------- HELPERS ----------------
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toStr(x) { return String(x == null ? "" : x); }

  function formatSeconds(s) {
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
  }

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
    box.innerHTML =
      "<h2 style='margin-top:0'>" + toStr(title) + "</h2>" +
      "<div class='q' style='margin-top:.5rem'>" + bodyHtml + "</div>";

    cover.appendChild(box);
    document.body.appendChild(cover);
  }

  function disableAll() {
    var els = document.querySelectorAll("input,button");
    for (var i = 0; i < els.length; i++) els[i].disabled = true;
  }

  // ---------------- SAVE / LOAD STATE ----------------
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

  // ---------------- QUESTIONS ----------------
  function loadQuestions() {
    return fetch("/questions.json")
      .then(function (res) { return res.json(); })
      .then(function (data) { ROOMS = data || []; })
      .catch(function () { ROOMS = []; });
  }

  // ---------------- TIMER (INLINE ONLY) ----------------
  function updateTimerDisplay() {
    var seconds = Math.floor(state.timeLeftMs / 1000);
    var text = formatSeconds(seconds);

    // update all inline timers
    var spans = document.querySelectorAll(".inline-tval");
    for (var i = 0; i < spans.length; i++) {
      spans[i].textContent = text;
    }
  }

  function startTimer() {
    stopTimer();
    function tick() {
      state.timeLeftMs = clamp(
        state.timeLeftMs - 1000,
        0,
        CONFIG.COUNTDOWN_MINUTES * 60000
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
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  function applyHintPenalty() {
    state.timeLeftMs = clamp(
      state.timeLeftMs - CONFIG.HINT_PENALTY_MS,
      0,
      CONFIG.COUNTDOWN_MINUTES * 60000
    );
    updateTimerDisplay();
    saveState();
  }

  // ---------------- VERIFY ANSWERS ----------------
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

  // ---------------- PROGRESS / LOCKS ----------------
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

  // ---------------- ENDINGS ----------------
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

  // ---------------- BUILD ROOM UI ----------------
  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.setAttribute("data-index", i);

    var penaltyMinutes = CONFIG.HINT_PENALTY_MS / 60000;

    div.innerHTML =
      "<h2 style='margin:0 0 .5rem 0'>" + room.title + "</h2>" +
      "<div class='q intro' style='margin-bottom:.4rem;'></div>" +
      "<div class='q prompt' style='white-space:pre-line;'></div>" +

      "<div class='inline-timer' " +
        "style='margin:0.6rem 0;font-size:1.4rem;font-weight:700;text-align:center;color:#ffd700;'>" +
        "⏱ <span class='inline-tval'>--:--</span>" +
      "</div>" +

      "<div class='controls' style='margin-top:.6rem;'>" +
        "<input type='text' placeholder='Type your answer...' aria-label='answer input'>" +
        "<button class='submit'>Submit</button>" +
        "<button class='hint-btn'>Show Hint (-" + penaltyMinutes + ":00)</button>" +
        "<button class='next' disabled>Next Room →</button>" +
      "</div>" +

      "<div class='hint-text' style='margin-top:.4rem; display:none; color:#9da7b1;'></div>" +
      "<div class='feedback' style='margin-top:.3rem;'></div>";

    var introEl = div.querySelector('.intro');
    var promptEl = div.querySelector('.prompt');
    var hintEl = div.querySelector('.hint-text');
    var submit = div.querySelector('.submit');
    var next = div.querySelector('.next');
    var hintBtn = div.querySelector('.hint-btn');
    var feedback = div.querySelector('.feedback');
    var input = div.querySelector('input');

    // Intro only on level 0
    if (i === 0) {
      introEl.textContent = room.intro || "";
    } else {
      introEl.textContent = "";
      introEl.style.display = "none";
    }

    promptEl.textContent = room.prompt || "";
    hintEl.textContent = "Hint: " + (room.hint || "");

    // Restore hint used
    if (state.hintsUsed[i]) {
      hintEl.style.display = 'block';
      hintBtn.textContent = "Hint used (-" + penaltyMinutes + ":00)";
      hintBtn.disabled = true;
    }

    // Restore solved
    if (state.solved[i]) {
      feedback.textContent = 'Correct!';
      next.disabled = false;
    }

    // Submit handler
    submit.addEventListener('click', function () {
      var val = input.value;
      submit.disabled = true;
      feedback.textContent = 'Checking...';

      verify(i, val).then(function (ok) {
        submit.disabled = false;
        if (ok) {
          state.solved[i] = true;
          feedback.textContent = 'Correct!';
          next.disabled = false;
          updateProgress();
          saveState();
        } else {
          flashIncorrect();
        }
      });
    });

    // Hint handler
    hintBtn.addEventListener('click', function () {
      if (state.hintsUsed[i]) return;
      state.hintsUsed[i] = true;
      hintEl.style.display = 'block';
      hintBtn.textContent = "Hint used (-" + penaltyMinutes + ":00)";
      hintBtn.disabled = true;
      applyHintPenalty();
      saveState();
    });

    // Next handler
    next.addEventListener('click', function () {
      var idx = parseInt(div.getAttribute('data-index'), 10);
      div.classList.remove('active');

      if (idx + 1 < ROOMS.length) {
        state.current = idx + 1;
        var nxt = document.querySelector('.room[data-index="' + (idx + 1) + '"]');
        if (nxt) nxt.classList.add('active');
        updateProgress();
        saveState();
      } else {
        celebrate();
      }
    });

    return div;
  }

  function buildRooms() {
    var roomsEl = document.getElementById('rooms');
    roomsEl.innerHTML = '';
    for (var i = 0; i < ROOMS.length; i++) {
      roomsEl.appendChild(makeRoom(i, ROOMS[i]));
    }
    // make sure inline timers show the current time on first render
    updateTimerDisplay();
  }

  // ---------------- GAME START ----------------
  function startGame() {
    // Load previous state (for anti-F5)
    var saved = loadState();
    if (saved && ROOMS.length) {
      state.timeLeftMs = saved.timeLeftMs;
      state.current = saved.current || 0;
      state.solved = saved.solved || {};
      state.hintsUsed = saved.hintsUsed || {};
    } else {
      clearState();
      state.timeLeftMs = CONFIG.COUNTDOWN_MINUTES * 60000;
      state.current = 0;
      state.solved = {};
      state.hintsUsed = {};
    }

    // Hide the story card at top after level 1
    var storyCard = document.querySelector('.card.story');
    if (storyCard) {
      if (state.current > 0 || Object.keys(state.solved).length > 0) {
        storyCard.style.display = 'none';
      }
    }

    // Insert progress card above rooms
    var prog = document.createElement('div');
    prog.id = 'progress';
    prog.className = 'card';
    prog.style.marginTop = '4rem';
    prog.innerHTML =
      "<div class='ptext'></div>" +
      "<div class='locks' style='font-size:1.4rem;margin-top:.3rem;'></div>";

    var wrap = document.querySelector('.wrap');
    var roomsEl = document.getElementById('rooms');
    wrap.insertBefore(prog, roomsEl);

    buildRooms();
    updateProgress();
    startTimer();
  }

  // ---------------- INIT ----------------
  function start() {
    loadQuestions().then(function () {
      startGame();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
