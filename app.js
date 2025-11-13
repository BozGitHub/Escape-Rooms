// app.js — dynamic questions + hint buttons (-1 minute) + protected answers
(function () {

  var CONFIG = {
    COUNTDOWN_MINUTES: 25
  };

  var state = {
    timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
    timerId: null,
    solved: {},
    hintsUsed: {}
  };

  var ROOMS = [];

  // ------------------------ Load Questions ------------------------
  function loadQuestions() {
    return fetch("/questions.json")
      .then(res => res.json())
      .then(data => { ROOMS = data; })
      .catch(err => {
        console.error("Failed to load questions.json", err);
        ROOMS = [];
      });
  }

  // ------------------------ Timer ------------------------
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

  function startTimer() {
    stopTimer();
    var tEl = document.querySelector("#timer-card .tval");

    function tick() {
      state.timeLeftMs = Math.max(0, state.timeLeftMs - 1000);
      var s = Math.floor(state.timeLeftMs / 1000);
      var mm = Math.floor(s / 60);
      var ss = s % 60;

      tEl.textContent =
        (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);

      if (state.timeLeftMs <= 0) {
        stopTimer();
        failMission();
      }
    }

    state.timerId = setInterval(tick, 1000);
    tick();
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function deductOneMinute() {
    state.timeLeftMs = Math.max(0, state.timeLeftMs - 60 * 1000);
  }

  // ------------------------ Server verify ------------------------
  function verify(levelIndex, answer) {
    return fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: levelIndex, answer: answer })
    })
      .then(r => r.json())
      .then(d => !!d.ok)
      .catch(() => false);
  }

  // ------------------------ Progress ------------------------
  function injectProgress() {
    var prog = document.createElement("div");
    prog.id = "progress";
    prog.className = "card";
    prog.style.marginTop = "4rem";

    prog.innerHTML =
      "<div class='ptext' style='margin-bottom:.3rem'></div>" +
      "<div class='locks' style='font-size:1.4rem'></div>";

    document.querySelector(".wrap").insertBefore(prog, document.getElementById("rooms"));
    updateProgress();
  }

  function updateProgress() {
    var total = ROOMS.length;
    var solvedCount = Object.values(state.solved).filter(Boolean).length;

    var locksStr = "";
    for (var i = 0; i < total; i++) {
      locksStr += state.solved[i] ? "🔓" : "🔒";
    }

    var ptext = document.querySelector("#progress .ptext");
    var locks = document.querySelector("#progress .locks");

    ptext.textContent =
      "Level " + (solvedCount + 1) + " of " + total +
      "  (" + solvedCount + "/" + total + " unlocked)";

    locks.textContent = locksStr;
  }

  // ------------------------ Fail / Win ------------------------
  function failMission() {
    disableAll();
    showOverlay(
      "Mission Failed",
      "Time has expired. The building remains sealed."
    );
  }

  function showOverlay(title, msg) {
    var cover = document.createElement("div");
    cover.style.position = "fixed";
    cover.style.inset = "0";
    cover.style.background = "rgba(0,0,0,.76)";
    cover.style.backdropFilter = "blur(2px)";
    cover.style.display = "flex";
    cover.style.alignItems = "center";
    cover.style.justifyContent = "center";
    cover.style.zIndex = "9999";

    var box = document.createElement("div");
    box.className = "card";
    box.style.maxWidth = "700px";
    box.style.textAlign = "center";
    box.innerHTML =
      "<h2>" + title + "</h2>" +
      "<p class='q'>" + msg + "</p>";

    cover.appendChild(box);
    document.body.appendChild(cover);
  }

  function disableAll() {
    document.querySelectorAll("input,button").forEach(e => e.disabled = true);
  }

  // ------------------------ Build Rooms ------------------------
  function makeRoom(i, room) {
    var div = document.createElement("div");
    div.className = "card room" + (i === 0 ? " active" : "");
    div.setAttribute("data-index", i);

    div.innerHTML =
      "<h2>" + room.title + "</h2>" +
      "<div class='q intro'></div>" +
      "<div class='q prompt' style='white-space:pre-line; margin-top:.4rem;'></div>" +
      "<div class='controls'>" +
        "<input type='text' placeholder='Type your answer...'>" +
        "<button class='submit'>Submit</button>" +
        "<button class='hint-btn'>Show Hint (-1:00)</button>" +
        "<button class='next' disabled>Next →</button>" +
      "</div>" +
      "<div class='hint-text' style='margin-top:.4rem; display:none; color:#9da7b1;'></div>" +
      "<div class='feedback'></div>";

    var introEl = div.querySelector(".intro");
    var promptEl = div.querySelector(".prompt");
    var hintEl = div.querySelector(".hint-text");
    var submit = div.querySelector(".submit");
    var next = div.querySelector(".next");
    var hintBtn = div.querySelector(".hint-btn");
    var feedback = div.querySelector(".feedback");
    var input = div.querySelector("input");

    introEl.textContent = room.intro;
    promptEl.textContent = room.prompt;
    hintEl.textContent = "Hint: " + room.hint;

    // Submit
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
        } else {
          feedback.textContent = "Incorrect — try again.";
        }
      });
    });

    // Hint button
    hintBtn.addEventListener("click", function () {
      if (state.hintsUsed[i]) return;

      hintEl.style.display = "block";
      state.hintsUsed[i] = true;

      deductOneMinute();
      hintBtn.textContent = "Hint used (-1:00)";
      hintBtn.disabled = true;
    });

    // Next
    next.addEventListener("click", function () {
      div.classList.remove("active");
      var nxt = document.querySelector('.room[data-index="' + (i + 1) + '"]');
      if (nxt) nxt.classList.add("active");
      else showOverlay("Power Restored", "You escaped!");
    });

    return div;
  }

  function build() {
    var roomsEl = document.getElementById("rooms");
    roomsEl.innerHTML = "";
    ROOMS.forEach((rm, i) => roomsEl.appendChild(makeRoom(i, rm)));
  }

  // Start after loading questions
  function start() {
    loadQuestions()
      .then(() => {
        injectTimerCard();
        injectProgress();
        build();
        startTimer();
      });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else
    start();

})();
