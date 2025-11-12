// app.js — Silent + Gold SVG padlocks + Left Analog Stopwatch (ticks) + Dramatic fail/finale
(function () {
  var CONFIG = {
    COUNTDOWN_MINUTES: 25,        // 25-minute mission
    typingMsPerChar: 14           // intro typewriter speed
  };

  function start() {
    var roomsEl = document.getElementById("rooms");
    if (!roomsEl) return;

    // ---------- STATE ----------
    var state = {
      current: 0,
      solved: {},                       // {0:true,1:true,...}
      timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
      timerId: null,
      locks: [],
      // stopwatch
      swCanvas: null,
      swCtx: null,
      swTickTimer: null
    };

    // ---------- HELPERS ----------
    function toStr(x){ return String(x==null?"":x); }
    function nl2br(s){ return toStr(s).split("\n").join("<br>"); }
    function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
    function showFatal(msg){
      try {
        var card=document.createElement("div");
        card.className="card";
        card.style.borderColor="#ef4444";
        card.innerHTML="<strong>Error:</strong> "+toStr(msg);
        roomsEl.parentNode.insertBefore(card, roomsEl);
      } catch(e){}
    }

    // ---------- SERVER VERIFY ----------
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
          .then(function(data){ resolve(!!(data&&data.ok)); }, function(){ resolve(false); });
        }catch(e){ resolve(false); }
      });
    }

    // ---------- CONFETTI BURST ----------
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
        var parts=[]; for(var i=0;i<60;i++){
          parts.push({ x:cx, y:cy, r:2+Math.random()*3, vx:(Math.random()-0.5)*6, vy:(Math.random()-1)*6, a:1 });
        }
        function step(){
          ctx.clearRect(0,0,canvas.width,canvas.height);
          for(var j=0;j<parts.length;j++){
            var p=parts[j]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.a*=0.97;
            ctx.globalAlpha=Math.max(0,p.a); ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
          }
          if(parts[0].a>0.1) requestAnimationFrame(step);
          else document.body.removeChild(canvas);
        }
        requestAnimationFrame(step);
      }catch(e){}
    }

    // ---------- PROGRESS: GOLD PADLOCKS ----------
    function injectLockStyles(){
      var css = ""
        + ".locks{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}"
        + ".lock{width:30px;height:30px;display:inline-block}"
        + ".lock svg{width:30px;height:30px;display:block}"
        + ".lock .shackle{transform-origin:15px 10px;transition:transform .4s ease}"
        + ".lock .shine{opacity:0;transition:opacity .4s ease}"
        + ".lock.open .shackle{transform:rotate(-45deg) translate(-2px,-2px)}"
        + ".lock.open .shine{opacity:1}";
      var s=document.createElement("style"); s.textContent=css; document.head.appendChild(s);
    }

    function makeLockSVG(isOpen){
      var NS="http://www.w3.org/2000/svg";
      var svg=document.createElementNS(NS,"svg");
      svg.setAttribute("viewBox","0 0 30 30"); svg.setAttribute("aria-hidden","true");
      var gold="#fbbf24", goldDark="#a16207", shine="#fff8db";
      var body=document.createElementNS(NS,"rect");
      body.setAttribute("x","6"); body.setAttribute("y","12");
      body.setAttribute("width","18"); body.setAttribute("height","13");
      body.setAttribute("rx","3"); body.setAttribute("fill",gold);
      body.setAttribute("stroke",goldDark); body.setAttribute("stroke-width","1.6");
      var hole=document.createElementNS(NS,"circle");
      hole.setAttribute("cx","15"); hole.setAttribute("cy","19"); hole.setAttribute("r","2.3"); hole.setAttribute("fill",goldDark);
      var shackle=document.createElementNS(NS,"path");
      shackle.setAttribute("class","shackle");
      shackle.setAttribute("d","M9 12 V9a6 6 0 0 1 12 0v3");
      shackle.setAttribute("fill","none"); shackle.setAttribute("stroke",goldDark);
      shackle.setAttribute("stroke-width","2"); shackle.setAttribute("stroke-linecap","round");
      var hi=document.createElementNS(NS,"path");
      hi.setAttribute("class","shine"); hi.setAttribute("d","M8 13 h5 v2 h-5 z"); hi.setAttribute("fill",shine);
      svg.appendChild(body); svg.appendChild(hole); svg.appendChild(shackle); svg.appendChild(hi);
      var wrap=document.createElement("div"); wrap.className="lock"+(isOpen?" open":""); wrap.appendChild(svg);
      return wrap;
    }

    function injectProgress(totalLevels){
      injectLockStyles();
      var prog=document.createElement("div");
      prog.id="progress"; prog.className="card"; prog.style.marginTop="1rem";
      var top=document.createElement("div");
      top.style.display="flex"; top.style.alignItems="center"; top.style.justifyContent="space-between";
      var title=document.createElement("div"); title.className="ptext"; title.textContent="Progress";
      var locks=document.createElement("div"); locks.className="locks";
      top.appendChild(title); top.appendChild(locks); prog.appendChild(top);
      roomsEl.parentNode.insertBefore(prog, roomsEl);

      state.locks = [];
      for(var i=0;i<totalLevels;i++){ var l=makeLockSVG(false); state.locks.push(l); locks.appendChild(l); }
      updateProgress(totalLevels);
    }

    function updateProgress(total){
      var ptext=document.querySelector("#progress .ptext");
      if(ptext) ptext.textContent="Level "+(state.current+1)+" of "+total;
      for(var i=0;i<state.locks.length;i++){
        if(state.solved[i]) state.locks[i].classList.add("open");
        else state.locks[i].classList.remove("open");
      }
    }

    // ---------- ANALOG STOPWATCH (fixed left) ----------
    function injectStopwatch(){
      var dock=document.createElement("div");
      dock.id="stopwatchDock";
      dock.style.position="fixed";
      dock.style.left="16px";
      dock.style.top="20%";
      dock.style.zIndex="40";
      dock.style.display="flex";
      dock.style.flexDirection="column";
      dock.style.alignItems="center";
      dock.style.gap=".5rem";
      dock.style.pointerEvents="none"; // visual only

      var canvas=document.createElement("canvas");
      canvas.width=140; canvas.height=140; canvas.style.filter="drop-shadow(0 6px 20px rgba(0,0,0,.35))";
      var label=document.createElement("div");
      label.className="card";
      label.style.padding=".4rem .7rem";
      label.style.fontWeight="800";
      label.style.letterSpacing="1px";
      label.style.pointerEvents="auto"; // allow text selection
      label.textContent="--:--";

      dock.appendChild(canvas); dock.appendChild(label);
      document.body.appendChild(dock);

      state.swCanvas = canvas;
      state.swCtx = canvas.getContext("2d");
      drawStopwatch(); // initial frame
      startStopwatchTick(label); // starts immediately on load
    }

    function startStopwatchTick(labelEl){
      if(state.swTickTimer) clearInterval(state.swTickTimer);
      state.swTickTimer = setInterval(function(){
        drawStopwatch();
        // update digital readout (mm:ss)
        var s = Math.floor(state.timeLeftMs/1000);
        var mm = Math.floor(s/60), ss = s%60;
        labelEl.textContent = (mm<10?"0"+mm:mm)+":"+(ss<10?"0"+ss:ss);
      }, 1000);
      // also set the label immediately
      var s0 = Math.floor(state.timeLeftMs/1000);
      var mm0 = Math.floor(s0/60), ss0 = s0%60;
      labelEl.textContent = (mm0<10?"0"+mm0:mm0)+":"+(ss0<10?"0"+ss0:ss0);
    }

    function drawStopwatch(){
      var c = state.swCanvas; if(!c) return;
      var ctx = state.swCtx; var w=c.width, h=c.height;
      ctx.clearRect(0,0,w,h);

      var cx=w/2, cy=h/2, R=60;

      // Gold rim
      ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
      ctx.lineWidth=8; ctx.strokeStyle="#fbbf24"; ctx.stroke();

      // Inner dark face
      ctx.beginPath(); ctx.arc(cx,cy,R-8,0,Math.PI*2);
      ctx.fillStyle="#0b1220"; ctx.fill();

      // Tick marks (12 major)
      ctx.save();
      ctx.translate(cx,cy);
      for(var i=0;i<60;i++){
        ctx.rotate(Math.PI/30);
        ctx.beginPath();
        ctx.moveTo(0,-(R-12));
        ctx.lineTo(0,-(R-8 + (i%5===0?2:0)));
        ctx.lineWidth = (i%5===0)?2:1;
        ctx.strokeStyle="#9da7b1";
        ctx.stroke();
      }
      ctx.restore();

      // Hand: tick once per second based on seconds remaining
      var s = Math.max(0, Math.floor(state.timeLeftMs/1000));
      var sec = s % 60;
      var ang = -Math.PI/2 + (sec / 60) * Math.PI*2; // start at top, move clockwise
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0,6);
      ctx.lineTo(0,-(R-18));
      ctx.lineWidth=3;
      ctx.strokeStyle="#fbbf24";
      ctx.stroke();
      // center hub
      ctx.beginPath(); ctx.arc(0,0,3.5,0,Math.PI*2);
      ctx.fillStyle="#fbbf24"; ctx.fill();
      ctx.restore();
    }

    // ---------- COUNTDOWN TIMER ----------
    function startTimer(){
      stopTimer();
      state.timerId = setInterval(function(){
        state.timeLeftMs = clamp(state.timeLeftMs - 1000, 0, CONFIG.COUNTDOWN_MINUTES*60*1000);
        if(state.timeLeftMs <= 0){ stopTimer(); onTimeUp(); }
      }, 1000);
    }
    function stopTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }

    function onTimeUp(){
      disableAll();
      dramaticOverlay("Mission failed", "The building remains sealed. Power systems never recovered.");
    }
    function disableAll(){
      var els=document.querySelectorAll("input,button");
      for(var i=0;i<els.length;i++) els[i].disabled = true;
    }

    // ---------- OVERLAY ----------
    function dramaticOverlay(title, bodyHtml){
      var cover=document.createElement("div");
      cover.style.position="fixed"; cover.style.inset="0"; cover.style.background="rgba(0,0,0,.7)";
      cover.style.backdropFilter="blur(2px)"; cover.style.display="flex";
      cover.style.alignItems="center"; cover.style.justifyContent="center"; cover.style.zIndex="50";
      var box=document.createElement("div"); box.className="card"; box.style.maxWidth="720px"; box.style.textAlign="center";
      box.innerHTML="<h2 style='margin-top:0'>"+toStr(title)+"</h2><div class='q' style='margin-top:.5rem'>"+bodyHtml+"</div>";
      cover.appendChild(box); document.body.appendChild(cover);
      return cover;
    }

    // ---------- CONTENT (dynamic; add more levels by appending) ----------
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

    // ---------- BUILD ----------
    function typeIntro(div, text, done){
      var introEl=document.createElement("div");
      introEl.className="q"; introEl.style.opacity=".95"; introEl.style.marginBottom=".5rem"; introEl.innerHTML="";
      div.insertBefore(introEl, div.firstChild.nextSibling);
      var i=0, out=""; function step(){ out += text.charAt(i++); introEl.innerHTML=out; if(i<text.length) setTimeout(step, CONFIG.typingMsPerChar); else if(done) done(); }
      if(text && text.length) step(); else if(done) done();
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
        state.current=i;
        updateProgress(ROOMS.length);
        var afterIntro=function(){
          promptEl.style.display="block"; promptEl.innerHTML=nl2br(room.prompt);
          if(input) input.focus();
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
          nxt.classList.add("active"); activateRoom(nxt);
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
        injectProgress(ROOMS.length);
        injectStopwatch();             // fixed left stopwatch
        startTimer();                  // countdown starts on load
        var first=document.querySelector('.room[data-index="0"]');
        if(!first){ showFatal("Rooms failed to render"); return; }
        first.classList.add("active"); activateRoom(first);
      } catch(e){ showFatal(e && e.message ? e.message : "render error"); }
    }

    function activateRoom(roomDiv){
      if(roomDiv && typeof roomDiv._onActivate==="function") roomDiv._onActivate();
    }

    function celebrate(){
      stopTimer();
      if(state.swTickTimer) { clearInterval(state.swTickTimer); state.swTickTimer=null; }
      var cover=dramaticOverlay("Power Restored",
        "Systems reboot cascade across the building. Vent fans spin up, displays flicker awake, and the security doors release with a heavy clunk.<br><br><strong>You escaped.</strong> Make your way to the CNC — your program is ready to run.");
      // full-screen confetti
      (function(){
        var canvas=document.querySelector(".confetti"); if(!canvas) return;
        var ctx=canvas.getContext("2d");
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

    // GO
    build();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
