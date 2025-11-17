// app.js — dynamic questions, timer, inline timer, auto‑advance, green flash, no Next button, intro only on Level 1
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

  /* Red flash for incorrect */
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

  /* GREEN FLASH FOR CORRECT */
  function flashCorrect() {
    var overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,255,0,0.35)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "20000";
    overlay.style.fontSize = "2rem";
    overlay.style.fontWeight = "800";
    overlay.style.color = "#003300";
    overlay.style.textShadow = "0 0 10px #fff";
    overlay.textContent = "Correct!";
    document.body.appendChild(overlay);
    setTimeout(function () {
      overlay.style.transition = "opacity .3s";
      overlay.style.opacity = "0";
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 300);
    }, 500);
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
      .then(res => res.json())
      .then(data => { ROOMS = data || []; })
      .catch(() => { ROOMS = []; });
  }

  /* Top clock */
  function injectTimerCard() {
    var card = document.createElement("div");
    card.id = "timer-card";
    card.className = "card";
    card.style.position = "fixed";
    card.style.top = "20px";
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
    document.querySelectorAll('.inline-tval').forEach(function(t){ t.textContent = el.textContent; });
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
      .then(r => r.ok ? r.json() : { ok: false })
      .then(d => !!(d && d.ok))
      .catch(() => false);
  }

  function updateProgress() {
    var total = ROOMS.length;
    var locksEl = document.querySelector("#progress .locks");
    var textEl = document.querySelector("#progress .ptext");
    var locked = "";
    var solvedCount = 0;
    for (var i = 0; i < total; i++) {
      if (state.solved[i]) solvedCount++; else locked += "🔒";
    }
    if (locksEl) locksEl.textContent = locked;
    if (textEl) textEl.textContent = "Level " + (state.current + 1) + " of " + total + "  (" + solvedCount + "/" + total + " unlocked)";
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

  /* BUILD EACH ROOM */
  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.setAttribute("data-index", i);

    div.innerHTML =
      "<h2 style='margin:0 0 .5rem 0'>" + room.title + "</h2>" +
      "<div class='q intro' style='margin-bottom:.4rem;'></div>" +
      "<div class='q prompt' style='white-space:pre-line;'></div>" +
      "<div class='inline-timer' style='margin:0.6rem 0;font-size:1.4rem;font-weight:700;text-align:center;color:#ffd700;'>⏱ <span class='inline-tval'>--:--</span></div>" +
      "<div class='controls' style='margin-top:.6rem;'>" +
      "  <input type='text' placeholder='Type your answer...' aria-label='answer input'>" +
      "  <button class='submit'>Submit</button>" +
      "  <button class='hint-btn'>Show Hint (-1:00)</button>" +
      "</div>" +
      "<div class='hint-text' style='margin-top:.4rem; display:none; color:#9da7b1;'></div>" +
      "<div class='feedback' style='margin-top:.3rem;'></div>";

    var introEl = div.querySelector('.intro');
    var promptEl = div.querySelector('.prompt');
    var hintEl = div.querySelector('.hint-text');
    var submit = div.querySelector('.submit');
    var hintBtn = div.querySelector('.hint-btn');
    var feedback = div.querySelector('.feedback');
    var input = div.querySelector('input');

    // INTRO ONLY ON LEVEL 0
    if (i === 0) introEl.textContent = room.intro || "";
    else { introEl.textContent = ""; introEl.style.display = "none"; }

    promptEl.textContent = room.prompt || "";
    hintEl.textContent = "Hint: " + (room.hint || "");

    if (state.hintsUsed[i]) {
      hintEl.style.display = 'block';
      hintBtn.textContent = 'Hint used (-1:00)';
      hintBtn.disabled = true;
    }

    /* SUBMIT HANDLER */
    submit.addEventListener('click', function () {
      var val = input.value;
      submit.disabled = true;
      feedback.textContent = 'Checking...';

      verify(i, val).then(function (ok) {
        submit.disabled = false;
        if (ok) {
          flashCorrect();
          state.solved[i] = true;
          feedback.textContent = 'Correct!';
          updateProgress();
          saveState();

          if (i === 0) {
            var storyCard = document.querySelector('.card.story');
            if (storyCard) storyCard.style.display = 'none';
          }

          // AUTO ADVANCE
          setTimeout(function () {
            var idx = i;
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
          }, 700);

        } else {
          flashIncorrect();
        }
      });
    });

    hintBtn.addEventListener('click', function () {
      if (state.hintsUsed[i]) return;
      state.hintsUsed[i] = true;
      hintEl.style.display = 'block';
      hintBtn.textContent = 'Hint used (-1:00)';
      hintBtn.disabled = true;
      deductOneMinute();
      saveState();
    });

    return div;
  }

  function buildRooms() {
    var roomsEl = document.getElementById('rooms');
    roomsEl.innerHTML = '';
    for (var i = 0; i < ROOMS.length; i++) roomsEl.appendChild(makeRoom(i, ROOMS[i]));
  }

  function startGame() {
    injectTimerCard();

    var prog = document.createElement('div');
    prog.id = 'progress';
    prog.className = 'card';
    prog.style.marginTop = '4rem';
    prog.innerHTML = "<div class='ptext'></div><div class='locks' style='font-size:1.4rem;margin-top:.3rem;'></div>";

    var wrap = document.querySelector('.wrap');
    var roomsEl = document.getElementById('rooms');
    wrap.insertBefore(prog, roomsEl);

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

    buildRooms();
    updateProgress();
    startTimer();
  }

  function formatSeconds(s) {
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
  }

  function start() {
    loadQuestions().then(() => startGame());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

})();
