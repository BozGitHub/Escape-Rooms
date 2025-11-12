// app.js — Immersive (Silent) + Gold SVG padlocks + Big Timer (dynamic levels)
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,  // ← your 25-minute timer
    typingMsPerChar: 14
  };

  function start() {
    var roomsEl = document.getElementById("rooms");
    if (!roomsEl) return;

    // --- State ---
    var state = {
      current: 0,
      solved: {},               // {0:true, 1:true, ...}
      timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
      timerId: null,
      locks: []                 // array of SVG lock elements
    };

    // --- Helpers ---
    function toStr(x){ return String(x==null?"":x); }
    function nl2br(s){ return toStr(s).split("\n").join("<br>"); }
    function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
    function showFatal(msg){
      try{
        var card=document.createElement("div");
        card.className="card";
        card.style.borderColor="#ef4444";
        card.innerHTML="<strong>Error:</strong> "+toStr(msg);
        roomsEl.parentNode.insertBefore(card, roomsEl);
      }catch(e){}
    }

    // --- Server verify ---
    function verify(levelIndex, answer){
      return new Promise(function(resolve){
        try{
          var payload=JSON.stringify({ level: levelIndex, answer: answer });
          fetch("/api/check", {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: payload
          })
          .then(function(r){ if(!r||!r.ok) return resolve(false); return r.json(); })
          .then(function(data){ resolve(!!(data && data.ok)); }, function(){ resolve(false); });
        }catch(e){ resolve(false); }
      });
    }

    // --- Confetti burst at element ---
    function burstAtElement(el){
      try{
        var rect = el.getBoundingClientRect();
        var cx = rect.left + rect.width/2;
        var cy = rect.top + rect.height/2;
        var canvas = document.createElement("canvas");
        canvas.className="confetti-burst";
        canvas.style.position="fixed";
        canvas.style.left="0"; canvas.style.top="0";
        canvas.style.pointerEvents="none";
        canvas.style.zIndex="20";
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        document.body.appendChild(canvas);
        var ctx = canvas.getContext("2d");
        var parts = []; var i;
        for(i=0;i<60;i++){
          parts.push({ x:cx, y:cy, r:2+Math.random()*3, vx:(Math.random()-0.5)*6, vy:(Math.random()-1)*6, a:1 });
        }
        function step(){
          ctx.clearRect(0,0,canvas.width,canvas.height);
          for(var j=0;j<parts.length;j++){
            var p=parts[j];
            p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.a*=0.97;
            ctx.globalAlpha = Math.max(0,p.a);
            ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
          }
          if(parts[0].a>0.1) requestAnimationFrame(step);
          else document.body.removeChild(canvas);
        }
        requestAnimationFrame(step);
      }catch(e){}
    }

    // --- Progress (gold SVG padlocks) + Big Timer ---
    function injectStyles(){
      // Small CSS just for locks + big timer
      var css = ""
        + ".locks{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}"
        + ".lock{width:28px;height:28px;display:inline-block}"
        + ".lock svg{width:28px;height:28px;display:block}"
        + ".lock .shackle{transform-origin:14px 10px;transition:transform .35s ease}"
        + ".lock .shine{opacity:0;transition:opacity .35s ease}"
        + ".lock.open .shackle{transform:rotate(-28deg) translate(-1px,-1px)}"
        + ".lock.open .shine{opacity:1}"
        + "#bigTimer .tval{font-size:2rem;font-weight:800;letter-spacing:1px}";
      var s = document.createElement("style"); s.textContent = css;
      document.head.appendChild(s);
    }

    function makeLockSVG(isOpen){
      var NS = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(NS,"svg");
      svg.setAttribute("viewBox","0 0 28 28");
      svg.setAttribute("aria-hidden","true");
      // Colors
      var gold = "#fbbf24";     // padlock body
      var goldDark = "#a16207"; // outlines
      var shine = "#fff8db";

      // body
      var body = document.createElementNS(NS,"rect");
      body.setAttribute("x","6"); body.setAttribute("y","12");
      body.setAttribute("width","16"); body.setAttribute("height","12");
      body.setAttribute("rx","3");
      body.setAttribute("fill", gold);
      body.setAttribute("stroke", goldDark);
      body.setAttribute("stroke-width","1.5");

      // keyhole
      var hole = document.createElementNS(NS,"circle");
      hole.setAttribute("cx","14"); hole.setAttribute("cy","18");
      hole.setAttribute("r","2.2");
      hole.setAttribute("fill", goldDark);

      // shackle
      var shackle = document.createElementNS(NS,"path");
      shackle.setAttribute("class","shackle");
      shackle.setAttribute("d","M9 12 V9a5 5 0 0 1 10 0v3");
      shackle.setAttribute("fill","none");
      shackle.setAttribute("stroke", goldDark);
      shackle.setAttribute("stroke-width","2");
      shackle.setAttribute("stroke-linecap","round");

      // shine highlight
      var hi = document.createElementNS(NS,"path");
      hi.setAttribute("class","shine");
      hi.setAttribute("d","M8 13 h4 v2 h-4 z");
      hi.setAttribute("fill", shine);

      svg.appendChild(body);
      svg.appendChild(hole);
      svg.appendChild(shackle);
      svg.appendChild(hi);

      var wrap = document.createElement("div");
      wrap.className = "lock" + (isOpen ? " open" : "");
      wrap.appendChild(svg);
      return wrap;
    }

    function injectTopBar(totalLevels){
      injectStyles();

      // Progress card with locks
      var prog = document.createElement("div");
      prog.id = "progress";
      prog.className = "card";
      prog.style.marginTop = "1rem";
      var top = document.createElement("div");
      top.style.display="flex";
      top.style.alignItems="center";
      top.style.justifyContent="space-between";
      var title = document.createElement("div");
      title.className = "ptext";
      title.textContent = "Progress";
      var locks = document.createElement("div");
      locks.className = "locks";
      top.appendChild(title);
      top.appendChild(locks);
      prog.appendChild(top);
      roomsEl.parentNode.insertBefore(prog, roomsEl);

      // Create dynamic locks
      state.locks = [];
      for(var i=0;i<totalLevels;i++){
        var lockEl = makeLockSVG(false);
        state.locks.push(lockEl);
        locks.appendChild(lockEl);
      }

      // Big Timer card
      var timer = document.createElement("div");
      timer.id = "bigTimer";
      timer.className = "card";
      timer.style.marginTop = "1rem";
      timer.style.textAlign = "center";
      timer.innerHTML = "<div>Time Remaining</div><div class='tval'>--:--</div>";
      prog.parentNode.insertBefore(timer, roomsEl);

      updateProgress(totalLevels);
      startTimer();
    }

    function updateProgress(total){
      // Update label
      var ptext = document.querySelector("#progress .ptext");
      if (ptext) ptext.textContent = "Level " + (state.current+1) + " of " + total;

      // Update locks (open solved)
      for(var i=0;i<state.locks.length;i++){
        if (state.solved[i]) state.locks[i].classList.add("open");
        else state.locks[i].classList.remove("open");
      }
    }

    function startTimer(){
      stopTimer();
      var tEl = document.querySelector("#bigTimer .tval");
      function tick(){
        state.timeLeftMs = clamp(state.timeLeftMs - 1000, 0, CONFIG.COUNTDOWN_MINUTES*60*1000);
        var s = Math.floor(state.timeLeftMs/1000);
        var mm = Math.floor(s/60);
        var ss = s % 60;
        if (tEl) tEl.textContent = (mm<10?"0"+mm:mm)+":"+(ss<10?"0"+ss:ss);
        if (state.timeLeftMs <= 0){ stopTimer(); onTimeUp(); }
      }
      state.timerId = setInterval(tick, 1000);
      tick();
    }
    function stopTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }

    function onTimeUp(){
      disableAll();
      dramaticOverlay("Time’s up!",
        "Power systems failed before you could restore the building.<br><br><em>Ask a supervisor to reset the scenario and try again.</em>");
    }
    function disableAll(){ var els=document.querySelectorAll("input,button"); for(var i=0;i<els.length;i++) els[i].disabled=true; }

    // --- Dramatic overlay ---
    function dramaticOverlay(title, bodyHtml){
      var cover=document.createElement("div");
      cover.style.position="fixed"; cover.style.inset="0";
      cover.style.background="rgba(0,0,0,.7)"; cover.style.backdropFilter="blur(2px)";
      cover.style.display="flex"; cover.style.alignItems="center"; cover.style.justifyContent="center";
      cover.style.zIndex="50";
      var box=document.createElement("div");
      box.className="card"; box.style.maxWidth="720px"; box.style.textAlign="center";
      box.innerHTML="<h2 style='margin-top:0'>"+toStr(title)+"</h2><div class='q' style='margin-top:.5rem'>"+bodyHtml+"</div>";
      cover.appendChild(box); document.body.appendChild(cover);
      return cover;
    }

    // --- Rooms content (add more levels by pushing into this array) ---
    var ROOMS = [
      { title: "Level 1 - VR Suite (Top Floor)",
        intro: "Reality bends upstairs. Diagnostic beacons pulse along the corridor, pointing you toward a door with a bright visor icon.",
        prompt: "Find the VR Suite on the top floor. Enter the room number or keyword you see there (e.g., VR204 or VR Suite).",
        hint: "Try the room code on the door." },
      { title: "Level 2 - Fire Laboratory",
        intro: "Heat shields line the walls, and a red warning lamp ticks overhead. A placard explains controlled combustion.",
        prompt: "Where heat meets safety, flames are studied — not feared. Enter the room name or a label you find.",
        hint: "Look for the window sticker or main door label." },
      { title: "Level 3 - 3D Printing Workshop",
        intro: "A soft whirr rises and falls. Spools of filament gleam like neon spirals under strip lighting.",
        prompt: "Where ideas become matter, one layer at a time. Enter a printer model code or room label (e.g., MK3S, Prusa).",
        hint: "Check the machine tag." },
      { title: "Level 4 - Motorsport & Composites Lab",
        intro: "A chassis sleeps on stands. Sheets of carbon fiber wait like black silk — speed, patiently woven.",
        prompt: "Enter the team name, a room label, or a code you find near the car.",
        hint: "Look near the steering wheel or composite layup." },
      { title: "Level 5 - Simulation Lab (Lower Ground)",
        intro: "Panels glow in the dark. A digital horizon rolls across the screens — the safest place to crash.",
        prompt: "Enter the room number or a keyword you find there (e.g., Simulation, Sim Lab).",
        hint: "Check the door plaque or console." },
      { title: "Level 6 - CNC Workshop Finale",
        intro: "The air smells faintly of coolant. A spindle blinks ready — all it needs is the right program number.",
        prompt: "From previous clues, enter the CNC program number (e.g., 5 for a 5-axis hint).",
        hint: "Think: axis count → program number." }
    ];

    // --- Build UI ---
    function typeIntro(div, text, done){
      var introEl = document.createElement("div");
      introEl.className = "q";
      introEl.style.opacity = ".95";
      introEl.style.marginBottom = ".5rem";
      introEl.innerHTML = "";
      div.insertBefore(introEl, div.firstChild.nextSibling); // under <h2>

      var i=0, out="";
      function step(){
        out += text.charAt(i++);
        introEl.innerHTML = out;
        if(i<text.length) setTimeout(step, CONFIG.typingMsPerChar);
        else if (done) done();
      }
      if(text && text.length) step(); else if (done) done();
    }

    function makeRoom(i, room){
      var div=document.createElement("div");
      div.className="card room"+(i===0?" active":"");
      div.setAttribute("data-index", String(i));
      div.innerHTML =
        '<h2 style="margin:0 0 .5rem 0">'+room.title+'</h2>'+
        '<div class="q" style="display:none"></div>'+
        '<div class="controls">'+
          '<input type="text" placeholder="Type your answer..." aria-label="answer input">'+
          '<button class="submit">Submit</button>'+
          '<button class="next" disabled>Next Room -></button>'+
        '</div>'+
        '<div class="feedback" aria-live="polite"></div>'+
        '<div class="hint">Hint: '+(room.hint||'')+'</div>';

      var input=div.querySelector("input");
      var submit=div.querySelector(".submit");
      var next=div.querySelector(".next");
      var fb=div.querySelector(".feedback");
      var promptEl=div.querySelectorAll(".q")[1];

      function onActivate(){
        state.current = i;
        updateProgress(ROOMS.length);
        var afterIntro = function(){
          promptEl.style.display="block";
          promptEl.innerHTML = nl2br(room.prompt);
          if (input) input.focus();
        };
        typeIntro(div, room.intro||"", afterIntro);
      }

      submit.addEventListener("click", function(){
        var val=input.value;
        submit.disabled=true; fb.textContent="Checking..."; fb.className="feedback";
        verify(i, val).then(function(ok){
          submit.disabled=false;
          if(ok){
            state.solved[i]=true;
            fb.textContent="Correct!"; fb.className="feedback ok";
            burstAtElement(submit);
            next.disabled=false; next.focus();
            updateProgress(ROOMS.length);
          } else {
            fb.textContent="Not yet — try again!"; fb.className="feedback err";
          }
        });
      });

      next.addEventListener("click", function(){
        var idx=parseInt(div.getAttribute("data-index"),10);
        div.classList.remove("active");
        if(idx+1<ROOMS.length){
          var nxt=document.querySelector('.room[data-index="'+(idx+1)+'"]');
          if(!nxt){ showFatal("Could not find next room"); return; }
          nxt.classList.add("active");
          activateRoom(nxt);
        } else {
          celebrate();
        }
      });

      div._onActivate = onActivate;
      return div;
    }

    function build(){
      try{
        roomsEl.innerHTML="";
        for(var i=0;i<ROOMS.length;i++){ roomsEl.appendChild(makeRoom(i, ROOMS[i])); }
        injectTopBar(ROOMS.length);
        var first=document.querySelector('.room[data-index="0"]');
        if(!first){ showFatal("Rooms failed to render"); return; }
        first.classList.add("active");
        activateRoom(first);
      }catch(e){ showFatal(e && e.message ? e.message : "render error"); }
    }

    function activateRoom(roomDiv){
      if(roomDiv && typeof roomDiv._onActivate==="function") roomDiv._onActivate();
    }

    function celebrate(){
      stopTimer();
      var cover = dramaticOverlay(
        "Power Restored",
        "Systems reboot cascade across the building. Vent fans spin up, displays flicker awake, and the security doors release with a heavy clunk.<br><br><strong>You escaped.</strong> Make your way to the CNC — your program is ready to run."
      );
      // Full-screen confetti
      (function(){
        var canvas = document.querySelector(".confetti");
        if(!canvas) return;
        var ctx = canvas.getContext("2d");
        function resize(){ canvas.width=innerWidth; canvas.height=innerHeight; }
        resize(); addEventListener("resize",resize);
        var parts=[]; for(var i=0;i<220;i++){
          parts.push({ x:Math.random()*canvas.width, y:Math.random()*-canvas.height, r:2+Math.random()*4, vy:2+Math.random()*3, vx:(Math.random()-0.5)*1.5 });
        }
        var t=0; (function loop(){
          ctx.clearRect(0,0,canvas.width,canvas.height);
          for(var j=0;j<parts.length;j++){
            var p=parts[j]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.02;
            if(p.y>canvas.height+10){ p.y=-10; p.x=Math.random()*canvas.width; p.vy=2+Math.random()*3; }
            ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
          }
          if(t++<1400) requestAnimationFrame(loop);
        })();
      })();
    }

    // Go!
    build();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
