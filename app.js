// app.js — Immersive edition: intros, progress, countdown, sounds, dramatic finale (ES5)
(function () {
  // ---------- CONFIG ----------
  var CONFIG = {
    COUNTDOWN_MINUTES: 20, // set your game time here
    typingMsPerChar: 14,   // intro typewriter speed
  };

  function start() {
    var roomsEl = document.getElementById("rooms");
    if (!roomsEl) return;

    // ---------- STATE ----------
    var state = {
      current: 0,
      solved: {}, // {0:true, 1:true ...}
      startedAt: Date.now(),
      timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
      timerId: null,
      soundsEnabled: false,
      ac: null, // AudioContext
      ambient: null, // ambient sound node
    };

    // ---------- HELPERS ----------
    function toStr(x) { return String(x == null ? "" : x); }
    function nl2br(s) { return toStr(s).split("\n").join("<br>"); }
    function showFatal(msg) {
      try {
        var card = document.createElement("div");
        card.className = "card";
        card.style.borderColor = "#ef4444";
        card.innerHTML = "<strong>Error:</strong> " + toStr(msg);
        roomsEl.parentNode.insertBefore(card, roomsEl);
      } catch (e) {}
    }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    // ---------- SERVER VERIFY ----------
    function verify(levelIndex, answer) {
      return new Promise(function (resolve) {
        try {
          var payload = JSON.stringify({ level: levelIndex, answer: answer });
          fetch("/api/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          })
            .then(function (r) { if (!r || !r.ok) return resolve(false); return r.json(); })
            .then(function (data) { resolve(!!(data && data.ok)); }, function () { resolve(false); });
        } catch (e) { resolve(false); }
      });
    }

    // ---------- AUDIO (embedded with WebAudio; no files needed) ----------
    function ensureAudio() {
      if (state.ac) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      state.ac = new AC();
      state.soundsEnabled = true;
    }

    // gentle “correct” ping
    function playPing() {
      try {
        ensureAudio(); if (!state.ac) return;
        var ctx = state.ac;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.24);
      } catch (e) {}
    }

    // subtle ambient hum per room (no files; low-volume oscillators + filter)
    function startAmbient(roomIndex) {
      try {
        ensureAudio(); if (!state.ac) return;
        stopAmbient();
        var ctx = state.ac;

        var o1 = ctx.createOscillator();
        var o2 = ctx.createOscillator();
        var lfo = ctx.createOscillator();
        var lfoGain = ctx.createGain();
        var g = ctx.createGain();
        var filt = ctx.createBiquadFilter();

        // different base “room tones”
        var base = [110, 140, 180, 120, 200, 160][roomIndex % 6] || 150;

        o1.type = "sine"; o1.frequency.value = base;
        o2.type = "sine"; o2.frequency.value = base * 2;

        lfo.type = "sine"; lfo.frequency.value = 0.15;
        lfoGain.gain.value = 20; // depth for subtle vibrato
        lfo.connect(lfoGain);
        lfoGain.connect(o1.frequency);

        filt.type = "lowpass";
        filt.frequency.value = 1200;

        g.gain.value = 0.03; // very quiet ambient

        o1.connect(filt); o2.connect(filt);
        filt.connect(g); g.connect(ctx.destination);

        o1.start(); o2.start(); lfo.start();

        state.ambient = { o1: o1, o2: o2, lfo: lfo, g: g, filt: filt };
      } catch (e) {}
    }
    function stopAmbient() {
      try {
        if (!state.ambient) return;
        var a = state.ambient;
        a.o1.stop(); a.o2.stop(); a.lfo.stop();
        a.o1.disconnect(); a.o2.disconnect(); a.lfo.disconnect();
        a.filt.disconnect(); a.g.disconnect();
      } catch (e) {}
      state.ambient = null;
    }

    // confetti burst on button
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
        var parts = []; var n = 60, i;
        for (i = 0; i < n; i++) {
          parts.push({ x: cx, y: cy, r: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 1) * 6, a: 1 });
        }
        var t0 = performance.now();
        function step(t) {
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

    // ---------- UI: PROGRESS + TIMER ----------
    function injectTopBar() {
      // progress
      var prog = document.createElement("div");
      prog.id = "progress";
      prog.className = "card";
      prog.style.marginTop = "1rem";
      prog.style.display = "flex";
      prog.style.alignItems = "center";
      prog.style.justifyContent = "space-between";
      prog.innerHTML = "<div class='ptext'>Progress</div><div class='pticks'></div>";
      roomsEl.parentNode.insertBefore(prog, roomsEl);

      // timer
      var timer = document.createElement("div");
      timer.id = "timer";
      timer.className = "card";
      timer.style.marginTop = "1rem";
      timer.style.display = "flex";
      timer.style.alignItems = "center";
      timer.style.justifyContent = "space-between";
      timer.innerHTML = "<div>Time Remaining</div><div class='tval' style='font-weight:700;letter-spacing:.5px'>--:--</div>";
      prog.parentNode.insertBefore(timer, roomsEl);

      // hint to enable audio (once)
      var snd = document.createElement("div");
      snd.id = "soundHint";
      snd.className = "card";
      snd.style.marginTop = "1rem";
      snd.innerHTML = "<strong>Sound:</strong> Tap here to enable audio effects.";
      snd.style.cursor = "pointer";
      snd.addEventListener("click", function () { ensureAudio(); snd.remove(); });
      timer.parentNode.insertBefore(snd, roomsEl);

      updateProgress();
      startTimer();
    }

    function updateProgress() {
      var total = ROOMS.length;
      var solvedCount = 0;
      for (var k in state.solved) if (state.solved[k]) solvedCount++;
      var locks = "";
      for (var i = 0; i < total; i++) {
        locks += (state.solved[i] ? "🔓" : "🔒");
      }
      var ptext = document.querySelector("#progress .ptext");
      var pt = document.querySelector("#progress .pticks");
      if (ptext) ptext.textContent = "Level " + (state.current + 1) + " of " + total;
      if (pt) pt.textContent = locks + "  (" + solvedCount + "/" + total + ")";
    }

    function startTimer() {
      stopTimer();
      var tEl = document.querySelector("#timer .tval");
      function tick() {
        state.timeLeftMs = clamp(state.timeLeftMs - 1000, 0, CONFIG.COUNTDOWN_MINUTES * 60 * 1000);
        var s = Math.floor(state.timeLeftMs / 1000);
        var mm = Math.floor(s / 60);
        var ss = s % 60;
        if (tEl) tEl.textContent = (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
        if (state.timeLeftMs <= 0) { stopTimer(); onTimeUp(); }
      }
      state.timerId = setInterval(tick, 1000);
      tick();
    }
    function stopTimer() {
      if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    }

    function onTimeUp() {
      stopAmbient();
      disableAll();
      dramaticOverlay("Time’s up!", "Power systems failed before you could restore the building. Security doors remain locked…<br><br><em>Ask a supervisor to reset the scenario and try again.</em>");
    }

    function disableAll() {
      var inputs = document.querySelectorAll("input, button");
      for (var i = 0; i < inputs.length; i++) inputs[i].disabled = true;
    }

    // ---------- DRAMATIC OVERLAY ----------
    function dramaticOverlay(title, bodyHtml) {
      var cover = document.createElement("div");
      cover.style.position = "fixed";
      cover.style.inset = "0";
      cover.style.background = "rgba(0,0,0,.7)";
      cover.style.backdropFilter = "blur(2px)";
      cover.style.display = "flex";
      cover.style.alignItems = "center";
      cover.style.justifyContent = "center";
      cover.style.zIndex = "50";

      var box = document.createElement("div");
      box.className = "card";
      box.style.maxWidth = "720px";
      box.style.textAlign = "center";

      box.innerHTML = "<h2 style='margin-top:0'>" + toStr(title) + "</h2><div class='q' style='margin-top:.5rem'>" + bodyHtml + "</div>";
      cover.appendChild(box);
      document.body.appendChild(cover);
      return cover;
    }

    // ---------- CONTENT ----------
    var ROOMS = [
      {
        title: "Level 1 - VR Suite (Top Floor)",
        intro: "Reality bends upstairs. Diagnostic beacons pulse along the corridor, pointing you toward a door with a bright visor icon.",
        prompt: "Find the VR Suite on the top floor. Enter the room number or keyword you see there (for example, VR204 or VR Suite).",
        hint: "Try the room code on the door.",
      },
      {
        title: "Level 2 - Fire Laboratory",
        intro: "Heat shields line the walls, and a red warning lamp ticks overhead. A placard explains controlled combustion.",
        prompt: "Where heat meets safety, flames are studied — not feared. Enter the room name or a label you find.",
        hint: "Look for the window sticker or main door label.",
      },
      {
        title: "Level 3 - 3D Printing Workshop",
        intro: "A soft whirr rises and falls. Spools of filament gleam like neon spirals under strip lighting.",
        prompt: "Where ideas become matter, one layer at a time. Enter a printer model code or room label (e.g., MK3S, Prusa).",
        hint: "Check the machine tag.",
      },
      {
        title: "Level 4 - Motorsport & Composites Lab",
        intro: "A chassis sleeps on stands. Sheets of carbon fiber wait like black silk — speed, patiently woven.",
        prompt: "Enter the team name, a room label, or a code you find near the car.",
        hint: "Look near the steering wheel or composite layup.",
      },
      {
        title: "Level 5 - Simulation Lab (Lower Ground)",
        intro: "Panels glow in the dark. A digital horizon rolls across the screens — the safest place to crash.",
        prompt: "Enter the room number or a keyword you find there (e.g., Simulation, Sim Lab).",
        hint: "Check the door plaque or console.",
      },
      {
        title: "Level 6 - CNC Workshop Finale",
        intro: "The air smells faintly of coolant. A spindle blinks ready — all it needs is the right program number.",
        prompt: "From previous clues, enter the CNC program number (e.g., 5 for a 5-axis hint).",
        hint: "Think: axis count → program number.",
      },
      // If you later add a 7th level, just append another object here.
    ];

    // ---------- UI BUILD ----------
    function typeIntro(div, text, done) {
      var introEl = document.createElement("div");
      introEl.className = "q";
      introEl.style.opacity = ".95";
      introEl.style.marginBottom = ".5rem";
      introEl.innerHTML = ""; // typewriter effect
      div.insertBefore(introEl, div.firstChild.nextSibling); // under <h2>

      var i = 0, out = "";
      function step() {
        out += text.charAt(i++);
        introEl.innerHTML = out;
        if (i < text.length) setTimeout(step, CONFIG.typingMsPerChar);
        else if (done) done();
      }
      if (text && text.length) step(); else if (done) done();
    }

    function makeRoom(i, room) {
      var div = document.createElement("div");
      div.className = "card room" + (i === 0 ? " active" : "");
      div.setAttribute("data-index", String(i));
      div.innerHTML =
        '<h2 style="margin:0 0 .5rem 0">' + room.title + "</h2>" +
        '<div class="q" style="display:none"></div>' + // placeholder for prompt after intro
        '<div class="controls">' +
        '<input type="text" placeholder="Type your answer..." aria-label="answer input">' +
        '<button class="submit">Submit</button>' +
        '<button class="next" disabled>Next Room -></button>' +
        "</div>" +
        '<div class="feedback" aria-live="polite"></div>' +
        '<div class="hint">Hint: ' + (room.hint || "") + "</div>";

      var input = div.querySelector("input");
      var submit = div.querySelector(".submit");
      var next = div.querySelector(".next");
      var fb = div.querySelector(".feedback");
      var promptEl = div.querySelectorAll(".q")[1]; // the second .q

      // When room becomes active: show intro (typewriter), then prompt; start ambient
      function onActivate() {
        state.current = i;
        updateProgress();
        startAmbient(i);

        // typewriter intro, then show prompt body
        var afterIntro = function () {
          promptEl.style.display = "block";
          promptEl.innerHTML = nl2br(room.prompt);
          if (input) input.focus();
        };
        typeIntro(div, room.intro || "", afterIntro);
      }

      // Submit handler
      submit.addEventListener("click", function () {
        ensureAudio();
        var val = input.value;
        submit.disabled = true;
        fb.textContent = "Checking...";
        fb.className = "feedback";
        verify(i, val).then(function (ok) {
          submit.disabled = false;
          if (ok) {
            state.solved[i] = true;
            fb.textContent = "Correct!";
            fb.className = "feedback ok";
            playPing();
            burstAtElement(submit);
            next.disabled = false;
            next.focus();
            updateProgress();
          } else {
            fb.textContent = "Not yet — try again!";
            fb.className = "feedback err";
          }
        });
      });

      next.addEventListener("click", function () {
        var idx = parseInt(div.getAttribute("data-index"), 10);
        div.classList.remove("active");
        stopAmbient();
        if (idx + 1 < ROOMS.length) {
          var nxt = document.querySelector('.room[data-index="' + (idx + 1) + '"]');
          if (!nxt) { showFatal("Could not find next room"); return; }
          nxt.classList.add("active");
          // trigger onActivate for the next room
          activateRoom(nxt);
        } else {
          celebrate();
        }
      });

      // attach a hook to run when shown
      div._onActivate = onActivate;
      return div;
    }

    function build() {
      try {
        roomsEl.innerHTML = "";
        for (var i = 0; i < ROOMS.length; i++) { roomsEl.appendChild(makeRoom(i, ROOMS[i])); }
        injectTopBar();
        var first = document.querySelector('.room[data-index="0"]');
        if (!first) { showFatal("Rooms failed to render"); return; }
        first.classList.add("active");
        activateRoom(first);
      } catch (e) { showFatal(e && e.message ? e.message : "render error"); }
    }

    function activateRoom(roomDiv) {
      if (roomDiv && typeof roomDiv._onActivate === "function") roomDiv._onActivate();
    }

    // Dramatic final overlay + confetti
    function celebrate() {
      stopTimer();
      stopAmbient();
      var cover = dramaticOverlay(
        "Power Restored",
        "Systems reboot cascade across the building. Vent fans spin up, displays flicker awake, and the security doors release with a heavy clunk.<br><br><strong>You escaped.</strong> Make your way to the CNC — your program is ready to run."
      );
      // full-screen confetti (reuse background canvas)
      (function fullConfetti() {
        var canvas = document.querySelector(".confetti");
        if (!canvas) return;
        var ctx = canvas.getContext("2d");
        function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
        resize(); addEventListener("resize", resize);
        var parts = [];
        for (var i = 0; i < 220; i++) {
          parts.push({ x: Math.random() * canvas.width, y: Math.random() * -canvas.height, r: 2 + Math.random() * 4, vy: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 1.5 });
        }
        var t = 0; (function loop() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (var j = 0; j < parts.length; j++) {
            var p = parts[j]; p.x += p.vx; p.y += p.vy; p.vy += 0.02;
            if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width; p.vy = 2 + Math.random() * 3; }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          }
          if (t++ < 1400) requestAnimationFrame(loop);
        })();
      })();
    }

    // ---------- GO ----------
    build();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
