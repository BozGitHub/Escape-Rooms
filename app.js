// app.js — dynamic questions, intros, hint penalty note, disappearing locks, shatter animation
(function () {

  //--------------------------------------------------
  // CONFIG
  //--------------------------------------------------
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,
    STATE_KEY: "escape_state_v3",
    SCORES_KEY: "escape_scores_v1",
    SESSION_MAX_AGE_MS: 60 * 60 * 1000, // 1 hour
    HINT_PENALTY_MS: 60000              // 1 minute
  };

  //--------------------------------------------------
  // GAME STATE
  //--------------------------------------------------
  var state = {
    timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
    timerId: null,
    current: 0,
    solved: {},
    hintsUsed: {},
    lastUpdated: Date.now()
  };

  var ROOMS = [];

  //--------------------------------------------------
  // HELPERS
  //--------------------------------------------------
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toStr(x) { return String(x == null ? "" : x); }

  function disableAll() {
    document.querySelectorAll("input,button").forEach(function (el) {
      el.disabled = true;
    });
  }

  //--------------------------------------------------
  // OVERLAY
  //--------------------------------------------------
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
      "<h2 style='margin-top:0'>" + title + "</h2>" +
      "<div class='q'>" + bodyHtml + "</div>";

    cover.appendChild(box);
    document.body.appendChild(cover);

    return { cover: cover, box: box };
  }

  //--------------------------------------------------
  // SAVE RESTORE STATE
  //--------------------------------------------------
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
    } catch (e) { }
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
    try { localStorage.removeItem(CONFIG.STATE_KEY); } catch (e) { }
  }

  //--------------------------------------------------
  // LEADERBOARD STORAGE
  //--------------------------------------------------
  function getScores() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.SCORES_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveScores(a) {
    localStorage.setItem(CONFIG.SCORES_KEY, JSON.stringify(a));
  }

  function addScore(name, secondsRemaining) {
    var scores = getScores();
    scores.push({
      name: name || "Unnamed team",
      secondsRemaining,
      timeLeftText: formatSeconds(secondsRemaining),
      date: new Date().toISOString().slice(0, 10)
    });
    scores.sort((a, b) => b.secondsRemaining - a.secondsRemaining);
    saveScores(scores);
  }

  //--------------------------------------------------
  // FORMAT TIME
  //--------------------------------------------------
  function formatSeconds(s) {
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return (m < 10 ? "0" + m : m) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  //--------------------------------------------------
  // LOAD QUESTIONS.JSON
  //--------------------------------------------------
  function loadQuestions() {
    return fetch("/questions.json")
      .then(res => res.json())
      .then(data => { ROOMS = data || []; })
      .catch(() => { ROOMS = []; });
  }

  //--------------------------------------------------
  // TIMER
  //--------------------------------------------------
  function injectTimerCard() {
  var card = document.createElement("div");
  card.id = "timer-card";
  card.className = "card";

  // Better placement (below header, above padlocks)
  card.style.position = "relative";
  card.style.margin = "1.5rem auto 0 auto"; 
  card.style.maxWidth = "260px";
  card.style.textAlign = "center";
  card.style.padding = "0.6rem 1.2rem";

  card.innerHTML =
    "<div style='font-size:0.8rem;color:#9da7b1;'>Time left</div>" +
    "<div class='tval' style='font-size:1.8rem;font-weight:700;'>--:--</div>" +
    "<div style='font-size:0.75rem;margin-top:.25rem;color:#eab308;'>Hints deduct 1 minute</div>";

  // Insert BELOW <header> but ABOVE progress locks
  var header = document.querySelector("header");
  header.insertAdjacentElement("afterend", card);
}

  function updateTimerDisplay() {
    var tEl = document.querySelector("#timer-card .tval");
    if (!tEl) return;
    tEl.textContent = formatSeconds(Math.floor(state.timeLeftMs / 1000));
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

  function deductHintTime() {
    state.timeLeftMs = clamp(state.timeLeftMs - CONFIG.HINT_PENALTY_MS, 0, CONFIG.COUNTDOWN_MINUTES * 60000);
    updateTimerDisplay();
    saveState();
  }

  //--------------------------------------------------
  // VERIFY ANSWERS VIA API
  //--------------------------------------------------
  function verify(level, answer) {
    return fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, answer })
    })
      .then(r => r.ok ? r.json() : { ok: false })
      .then(d => !!d.ok)
      .catch(() => false);
  }

  //--------------------------------------------------
  // SHATTER ANIMATION FOR LOCKS
  //--------------------------------------------------
  function shatterLock(el) {
    if (!el) return;
    el.style.transition = "transform 0.4s ease, opacity 0.4s ease";
    el.style.transform = "scale(1.4) rotate(25deg)";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 400);
  }

  //--------------------------------------------------
  // PROGRESS BAR
  //--------------------------------------------------
  function injectProgressBar() {
    var wrap = document.querySelector(".wrap");
    var roomsEl = document.getElementById("rooms");

    var card = document.createElement("div");
    card.id = "progress";
    card.className = "card";
    card.style.marginTop = "1rem";
    card.style.textAlign = "center";

    card.innerHTML =
      "<div class='ptext' style='margin-bottom:.25rem;'></div>" +
      "<div class='locks' style='font-size:1.7rem;display:flex;justify-content:center;gap:.35rem;'></div>";

    wrap.insertBefore(card, roomsEl);

    updateProgress();
  }

  function updateProgress() {
    var pt = document.querySelector("#progress .ptext");
    var lockBox = document.querySelector("#progress .locks");

    if (!pt || !lockBox) return;

    var total = ROOMS.length;
    var solved = Object.keys(state.solved).length;

    pt.textContent = "Level " + (state.current + 1) + " of " + total;

    lockBox.innerHTML = "";

    for (let i = 0; i < total; i++) {
      if (state.solved[i]) {
        let gone = document.createElement("span");
        gone.textContent = "🔓";
        gone.style.opacity = "0.45";
        lockBox.appendChild(gone);
      } else {
        let lock = document.createElement("span");
        lock.textContent = "🔒";
        lock.dataset.index = i;
        lock.style.cursor = "default";
        lockBox.appendChild(lock);
      }
    }
  }

  //--------------------------------------------------
  // FAIL & SUCCESS
  //--------------------------------------------------
  function failMission() {
    disableAll();
    clearState();
    showOverlay("Mission Failed", "<p>You ran out of time. The building remains sealed.</p>");
  }

  function celebrate() {
    stopTimer();
    disableAll();
    var secondsRemaining = Math.floor(state.timeLeftMs / 1000);
    clearState();
    askForName(secondsRemaining);
  }

  function askForName(secondsRemaining) {
    var timeStr = formatSeconds(secondsRemaining);
    var ov = showOverlay(
      "Power Restored!",
      "<p>You escaped with <strong>" + timeStr + "</strong> remaining.</p>" +
      "<p>Enter your team name:</p>" +
      "<input id='teamname' style='padding:.5rem;width:70%;margin-top:.5rem;border-radius:.4rem;'>\
       <button id='saven' style='margin-top:.7rem;padding:.45rem 1rem;border:none;border-radius:.4rem;background:#16a34a;color:white;cursor:pointer;'>Save</button>"
    );

    document.getElementById("saven").onclick = function () {
      var name = document.getElementById("teamname").value.trim();
      addScore(name, secondsRemaining);
      ov.cover.remove();
      showLeaderboard();
    };
  }

  function showLeaderboard() {
    var scores = getScores();
    if (!scores.length) {
      showOverlay("Leaderboard", "<p>No scores yet.</p>");
      return;
    }

    var html = "<table style='width:100%;font-size:.95rem;'>\
                 <tr><th>#</th><th>Team</th><th>Time</th><th>Date</th></tr>";

    scores.forEach((s, i) => {
      html += "<tr>\
                 <td>" + (i + 1) + "</td>\
                 <td>" + s.name + "</td>\
                 <td>" + s.timeLeftText + "</td>\
                 <td>" + s.date + "</td>\
               </tr>";
    });

    html += "</table>";

    showOverlay("Leaderboard", html);
  }

  //--------------------------------------------------
  // BUILD ONE ROOM
  //--------------------------------------------------
  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === state.current ? " active" : "");
    div.dataset.index = i;

    div.innerHTML =
      "<h2>" + toStr(room.title) + "</h2>" +
      "<div class='q intro' style='color:#9da7b1;margin-bottom:.35rem;'>" + toStr(room.intro || "") + "</div>" +
      "<div class='q prompt' style='white-space:pre-line;'>" + toStr(room.prompt || "") + "</div>" +
      "<div class='controls' style='margin-top:.6rem;'>\
         <input type='text' placeholder='Answer…'>\
         <button class='submit'>Submit</button>\
         <button class='hint'>Hint (-1:00)</button>\
         <button class='next' disabled>Next →</button>\
       </div>\
       <div class='hint-text' style='display:none;color:#9da7b1;margin-top:.4rem;'>Hint: " + toStr(room.hint || "") + "</div>\
       <div class='feedback' style='margin-top:.4rem;'></div>";

    var input = div.querySelector("input");
    var sub = div.querySelector(".submit");
    var nxt = div.querySelector(".next");
    var hintBtn = div.querySelector(".hint");
    var hintTxt = div.querySelector(".hint-text");
    var fb = div.querySelector(".feedback");

    // Restore hint usage
    if (state.hintsUsed[i]) {
      hintTxt.style.display = "block";
      hintBtn.textContent = "Hint used";
      hintBtn.disabled = true;
    }

    // Restore solved
    if (state.solved[i]) {
      fb.textContent = "Correct!";
      nxt.disabled = false;
    }

    // Submit listener
    sub.onclick = function () {
      fb.textContent = "Checking…";
      sub.disabled = true;

      verify(i, input.value).then(ok => {
        sub.disabled = false;
        if (ok) {
          fb.textContent = "Correct!";
          state.solved[i] = true;
          nxt.disabled = true; // will enable after lock shatter

          // SHATTER LOCK
          var lock = document.querySelector('#progress .locks span[data-index="' + i + '"]');
          shatterLock(lock);

          setTimeout(() => {
            nxt.disabled = false;
          }, 300);

          updateProgress();
          saveState();
        } else {
          fb.textContent = "Not yet — try again!";
        }
      });
    };

    // Hint button
    hintBtn.onclick = function () {
      if (state.hintsUsed[i]) return;

      state.hintsUsed[i] = true;
      hintTxt.style.display = "block";
      hintBtn.textContent = "Hint used";
      hintBtn.disabled = true;

      deductHintTime();
      saveState();
    };

    // Next room
    nxt.onclick = function () {
      div.classList.remove("active");
      if (i + 1 < ROOMS.length) {
        state.current = i + 1;
        document.querySelector('.room[data-index="' + (i + 1) + '"]').classList.add("active");
        updateProgress();
        saveState();
      } else {
        celebrate();
      }
    };

    return div;
  }

  //--------------------------------------------------
  // BUILD ALL ROOMS
  //--------------------------------------------------
  function buildRooms() {
    var el = document.getElementById("rooms");
    el.innerHTML = "";
    for (var i = 0; i < ROOMS.length; i++) {
      el.appendChild(makeRoom(i, ROOMS[i]));
    }
  }

  //--------------------------------------------------
  // INIT GAME
  //--------------------------------------------------
  function startGame() {
    injectTimerCard();
    injectProgressBar();

    var saved = loadState();
    if (saved && ROOMS.length) {
      state.timeLeftMs = saved.timeLeftMs;
      state.current = saved.current || 0;
      state.solved = saved.solved || {};
      state.hintsUsed = saved.hintsUsed || {};
    }

    buildRooms();
    updateProgress();
    startTimer();
  }

  function start() {
    loadQuestions().then(startGame);
  }

  if (document.readyState == "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else start();

})();
