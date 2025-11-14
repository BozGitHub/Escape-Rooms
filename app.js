// app.js — dynamic questions, timer, hints (-time), disappearing locks, anti-F5
(function () {
  // ---------------- CONFIG ----------------
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    STATE_KEY: "escape_state_v1",
    SESSION_MAX_AGE_MS: 60 * 60 * 1000,
    HINT_PENALTY_MS: 60000   // change to 300000 for -5 minutes
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
      setTimeout(() => overlay.remove(), 300);
    }, 600);
  }

  function showOverlay(title, html) {
    var cover = document.createElement("div");
    cover.style.position = "fixed";
    cover.style.inset = "0";
    cover.style.background = "rgba(0,0,0,0.75)";
    cover.style.backdropFilter = "blur(2px)";
    cover.style.display = "flex";
    cover.style.alignItems = "center";
    cover.style.justifyContent = "center";
    cover.style.zIndex = "9999";

    var box = document.createElement("div");
    box.className = "card";
    box.style.maxWidth = "720px";
    box.style.textAlign = "center";
    box.innerHTML = `
      <h2 style="margin-top:0">${toStr(title)}</h2>
      <div class="q" style="margin-top:.5rem">${html}</div>
    `;

    cover.appendChild(box);
    document.body.appendChild(cover);
  }

  function disableAll() {
    document.querySelectorAll("input,button").forEach(b => b.disabled = true);
  }

  // ---------------- SAVE / LOAD ----------------
  function saveState() {
    try {
      state.lastUpdated = Date.now();
      localStorage.setItem(CONFIG.STATE_KEY, JSON.stringify(state));
    } catch { }
  }

  function loadState() {
    try {
      var data = JSON.parse(localStorage.getItem(CONFIG.STATE_KEY));
      if (!data) return null;

      if (Date.now() - (data.lastUpdated || 0) > CONFIG.SESSION_MAX_AGE_MS) {
        localStorage.removeItem(CONFIG.STATE_KEY);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  function clearState() {
    try { localStorage.removeItem(CONFIG.STATE_KEY); } catch { }
  }

  // ---------------- QUESTIONS ----------------
  function loadQuestions() {
    return fetch("/questions.json")
      .then(r => r.json())
      .then(json => ROOMS = json || [])
      .catch(() => ROOMS = []);
  }

  // ---------------- TIMER ----------------
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

    card.innerHTML = `
      <div style="font-size:0.8rem;color:#9da7b1;">Time left</div>
      <div class="tval" style="font-size:1.8rem;font-weight:700;">--:--</div>
      <div style="margin-top:4px;font-size:.75rem;color:#aaa;">Hint costs time</div>
    `;

    document.body.appendChild(card);
  }

  function formatSeconds(s) {
    let m = Math.floor(s / 60);
    let sec = s % 60;
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
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

  function deductHintPenalty() {
    state.timeLeftMs = clamp(state.timeLeftMs - CONFIG.HINT_PENALTY_MS, 0, CONFIG.COUNTDOWN_MINUTES * 60000);
    updateTimerDisplay();
    saveState();
  }

  // ---------------- VERIFY ----------------
  function verify(levelIndex, answer) {
    return fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: levelIndex, answer })
    })
      .then(r => r.ok ? r.json() : { ok: false })
      .then(res => !!res.ok)
      .catch(() => false);
  }

  // ---------------- PROGRESS ----------------
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
      `Level ${state.current + 1} of ${total} (${solvedCount}/${total} unlocked)`;
  }

  // ---------------- ENDINGS ----------------
  function failMission() {
    disableAll();
    clearState();
    showOverlay("Mission failed", "You ran out of time.");
  }

  function celebrate() {
    disableAll();
    stopTimer();
    clearState();
    showOverlay("Escaped!", "You restored power and escaped!");
  }

  // ---------------- ROOM BUILDER ----------------
  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.setAttribute("data-index", i);

    div.innerHTML = `
      <h2 style="margin:0 0 .5rem 0">${room.title}</h2>
      <div class="q intro" style="margin-bottom:.4rem;"></div>
      <div class="q prompt" style="white-space:pre-line;"></div>

      <div class="inline-timer"
        style="margin:0.6rem 0;font-size:1.4rem;font-weight:700;text-align:center;color:#ffd700;">
        ⏱ <span class="inline-tval">--:--</span>
      </div>

      <div class="controls" style="margin-top:.6rem;">
        <input type="text" placeholder="Type your answer..." aria-label="answer input">
        <button class="submit">Submit</button>
        <button class="hint-btn">Show Hint (-1:00)</button>
        <button class="next" disabled>Next Room →</button>
      </div>

      <div class="hint-text" style="margin-top:.4rem; display:none; color:#9da7b1;"></div>
      <div class="feedback" style="margin-top:.3rem;"></div>
    `;

    var introEl = div.querySelector(".intro");
    var promptEl = div.querySelector(".prompt");
    var hintEl = div.querySelector(".hint-text");
    var submit = div.querySelector(".submit");
    var next = div.querySelector(".next");
    var hintBtn = div.querySelector(".hint-btn");
    var feedback = div.querySelector(".feedback");
    var input = div.querySelector("input");

    // Intro only level 1
    if (i === 0) {
      introEl.textContent = room.intro || "";
    } else {
      introEl.style.display = "none";
    }

    promptEl.textContent = room.prompt || "";
    hintEl.textContent = "Hint: " + (room.hint || "");

    // Restore hint used
    if (state.hintsUsed[i]) {
      hintEl.style.display = "block";
      hintBtn.textContent = "Hint used (-1:00)";
      hintBtn.disabled = true;
    }

    // Restore solved
    if (state.solved[i]) {
      feedback.textContent = "Correct!";
      next.disabled = false;
    }

    // SUBMIT
    submit.addEventListener("click", function () {
      var val = input.value;
      submit.disabled = true;
      feedback.textContent = "Checking...";

      verify(i, val).then(ok => {
        submit.disabled = false;

        if (ok) {
          state.solved[i] = true;
          feedback.textContent = "Correct!";
          next.disabled = false;
          updateProgress();
          saveState();
        } else {
          flashIncorrect();
        }
      });
    });

    // HINT
    hintBtn.addEventListener("click", function () {
      if (state.hintsUsed[i]) return;

      state.hintsUsed[i] = true;
      hintEl.style.display = "block";
      hintBtn.textContent = "Hint used (-1:00)";
      hintBtn.disabled = true;

      deductHintPenalty();
      saveState();
    });

    // NEXT
    next.addEventListener("click", function () {
      var idx = parseInt(div.getAttribute("data-index"), 10);

      div.classList.remove("active");

      if (idx + 1 < ROOMS.length) {
        state.current = idx + 1;
        document.querySelector(`.room[data-index="${idx + 1}"]`)
          .classList.add("active");

        updateProgress();
        saveState();
      } else {
        celebrate();
      }
    });

    return div;
  }

  // ---------------- BUILD ----------------
  function buildRooms() {
    var roomsEl = document.getElementById("rooms");
    roomsEl.innerHTML = "";
    ROOMS.forEach((room, i) => roomsEl.appendChild(makeRoom(i, room)));
  }

  function startGame() {
    // Hide long story after level 1
    var storyCard = document.querySelector(".card.story");
    if (storyCard && (state.current > 0 || Object.keys(state.solved).length > 0)) {
      storyCard.style.display = "none";
    }

    injectTimerCard();

    // Progress bar
    var prog = document.createElement("div");
    prog.id = "progress";
    prog.className = "card";
    prog.style.marginTop = "4rem";
    prog.innerHTML = `
      <div class="ptext"></div>
      <div class="locks" style="font-size:1.4rem;margin-top:.3rem;"></div>
    `;

    var wrap = document.querySelector(".wrap");
    wrap.insertBefore(prog, document.getElementById("rooms"));

    // Load saved state (anti F5)
    var saved = loadState();
    if (saved && ROOMS.length) {
      state = Object.assign(state, saved);
    } else {
      clearState();
    }

    buildRooms();
    updateProgress();
    startTimer();
  }

  // ---------------- INIT ----------------
  function start() {
    loadQuestions().then(startGame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
