// app.js — fixed stopwatch + realistic gold gradient padlocks (silent build)
(function () {
  var CONFIG = { COUNTDOWN_MINUTES: 25 };

  function start() {
    var roomsEl = document.getElementById("rooms");
    if (!roomsEl) return;

    var state = {
      timeLeftMs: CONFIG.COUNTDOWN_MINUTES * 60 * 1000,
      solved: {},
      locks: [],
      timerId: null,
      swTickTimer: null,
      swCanvas: null,
      swCtx: null
    };

    // Helpers
    function toStr(x){ return String(x==null?"":x); }
    function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

    // --- Verify (server call) ---
    function verify(level, answer){
      return fetch("/api/check", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ level, answer })
      })
      .then(r=>r.ok?r.json():{ok:false})
      .then(d=>!!(d && d.ok))
      .catch(()=>false);
    }

    // --- Gold Gradient Padlocks ---
    function injectLockStyles(){
      const css = `
        .locks{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
        .lock{width:34px;height:34px;display:inline-block;transform-origin:center;transition:transform .3s ease}
        .lock svg{width:34px;height:34px}
        .lock.open{animation:pulse .35s ease}
        .shackle{transform-origin:17px 10px;transition:transform .5s ease}
        .lock.open .shackle{transform:rotate(-45deg) translate(-2px,-2px)}
        .flash{opacity:0;transition:opacity .3s ease}
        .lock.open .flash{opacity:1}
        @keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
      `;
      const s=document.createElement("style"); s.textContent=css; document.head.appendChild(s);
    }

    function makeLockSVG(open){
      const NS="http://www.w3.org/2000/svg";
      const svg=document.createElementNS(NS,"svg");
      svg.setAttribute("viewBox","0 0 34 34");
      const gradId="g"+Math.random().toString(36).slice(2,7);
      const defs=document.createElementNS(NS,"defs");
      const grad=document.createElementNS(NS,"linearGradient");
      grad.setAttribute("id",gradId);
      grad.setAttribute("x1","0"); grad.setAttribute("y1","0"); grad.setAttribute("x2","0"); grad.setAttribute("y2","1");
      const stop1=document.createElementNS(NS,"stop"); stop1.setAttribute("offset","0%"); stop1.setAttribute("stop-color","#fcd34d");
      const stop2=document.createElementNS(NS,"stop"); stop2.setAttribute("offset","100%"); stop2.setAttribute("stop-color","#f59e0b");
      grad.appendChild(stop1); grad.appendChild(stop2); defs.appendChild(grad);
      svg.appendChild(defs);

      const body=document.createElementNS(NS,"rect");
      body.setAttribute("x","7"); body.setAttribute("y","12");
      body.setAttribute("width","20"); body.setAttribute("height","16");
      body.setAttribute("rx","3");
      body.setAttribute("fill","url(#"+gradId+")");
      body.setAttribute("stroke","#92400e"); body.setAttribute("stroke-width","1.6");

      const shackle=document.createElementNS(NS,"path");
      shackle.setAttribute("class","shackle");
      shackle.setAttribute("d","M11 12 V8a6 6 0 0 1 12 0v4");
      shackle.setAttribute("stroke","#d1d5db");
      shackle.setAttribute("stroke-width","2.2");
      shackle.setAttribute("fill","none");
      shackle.setAttribute("stroke-linecap","round");

      const flash=document.createElementNS(NS,"circle");
      flash.setAttribute("class","flash");
      flash.setAttribute("cx","24"); flash.setAttribute("cy","10");
      flash.setAttribute("r","3");
      flash.setAttribute("fill","#fff8db");

      svg.appendChild(body);
      svg.appendChild(shackle);
      svg.appendChild(flash);

      const wrap=document.createElement("div");
      wrap.className="lock"+(open?" open":"");
      wrap.appendChild(svg);
      return wrap;
    }

    function injectProgress(levels){
      injectLockStyles();
      const prog=document.createElement("div");
      prog.className="card";
      const title=document.createElement("div");
      title.textContent="Progress";
      const locks=document.createElement("div");
      locks.className="locks";
      prog.appendChild(title); prog.appendChild(locks);
      roomsEl.parentNode.insertBefore(prog, roomsEl);

      for(let i=0;i<levels;i++){
        const lock=makeLockSVG(false);
        locks.appendChild(lock);
        state.locks.push(lock);
      }
    }

    function updateProgress(total){
      for(let i=0;i<total;i++){
        if(state.solved[i]) state.locks[i].classList.add("open");
      }
    }

    // --- Stopwatch (Fixed Left, Corrected Orientation) ---
    function injectStopwatch(){
      const dock=document.createElement("div");
      dock.style.position="fixed";
      dock.style.left="16px";
      dock.style.top="20%";
      dock.style.zIndex="40";
      dock.style.display="flex";
      dock.style.flexDirection="column";
      dock.style.alignItems="center";
      dock.style.gap=".4rem";

      const canvas=document.createElement("canvas");
      canvas.width=140; canvas.height=140;

      const label=document.createElement("div");
      label.style.fontWeight="bold";
      label.style.fontSize="1.1rem";
      label.textContent="--:--";

      dock.appendChild(canvas);
      dock.appendChild(label);
      document.body.appendChild(dock);

      state.swCanvas=canvas;
      state.swCtx=canvas.getContext("2d");
      drawStopwatch(true);
      startStopwatch(label);
    }

    function drawStopwatch(first){
      const c=state.swCanvas, ctx=state.swCtx;
      if(!c) return;
      const w=c.width, h=c.height, cx=w/2, cy=h/2, R=60;
      ctx.clearRect(0,0,w,h);

      // rim
      const grad=ctx.createLinearGradient(0,0,0,h);
      grad.addColorStop(0,"#facc15");
      grad.addColorStop(1,"#f59e0b");
      ctx.lineWidth=8; ctx.strokeStyle=grad;
      ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();

      // face
      ctx.beginPath(); ctx.arc(cx,cy,R-8,0,Math.PI*2);
      ctx.fillStyle="#0b1220"; ctx.fill();

      // ticks (12 positions, correct rotation)
      ctx.save(); ctx.translate(cx,cy);
      for(let i=0;i<60;i++){
        const angle=(Math.PI/30)*i - Math.PI/2; // 12 at top
        ctx.rotate(angle - ctx.currentAngle || 0);
        ctx.beginPath();
        ctx.moveTo(0,-(R-12));
        ctx.lineTo(0,-(R-8+(i%5===0?2:0)));
        ctx.lineWidth=(i%5===0)?2:1;
        ctx.strokeStyle="#9da7b1";
        ctx.stroke();
        ctx.setTransform(1,0,0,1,cx,cy);
      }
      ctx.restore();

      // hand
      const sec=Math.floor(state.timeLeftMs/1000)%60;
      const angle=(sec/60)*2*Math.PI - Math.PI/2;
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0,5);
      ctx.lineTo(0,-(R-18));
      ctx.lineWidth=3; ctx.strokeStyle="#fbbf24"; ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,3.5,0,Math.PI*2); ctx.fillStyle="#fbbf24"; ctx.fill();
      ctx.restore();
    }

    function startStopwatch(label){
      if(state.swTickTimer) clearInterval(state.swTickTimer);
      state.swTickTimer=setInterval(()=>{
        drawStopwatch();
        const s=Math.max(0,Math.floor(state.timeLeftMs/1000));
        const mm=Math.floor(s/60), ss=s%60;
        label.textContent=(mm<10?"0":"")+mm+":"+(ss<10?"0":"")+ss;
      },1000);
      const s0=Math.floor(state.timeLeftMs/1000);
      label.textContent=(Math.floor(s0/60)).toString().padStart(2,"0")+":"+(s0%60).toString().padStart(2,"0");
    }

    // --- Timer countdown + fail ---
    function startTimer(){
      if(state.timerId) clearInterval(state.timerId);
      state.timerId=setInterval(()=>{
        state.timeLeftMs=clamp(state.timeLeftMs-1000,0,CONFIG.COUNTDOWN_MINUTES*60*1000);
        if(state.timeLeftMs<=0){
          clearInterval(state.timerId);
          onTimeUp();
        }
      },1000);
    }

    function onTimeUp(){
      disableAll();
      const o=document.createElement("div");
      o.style.position="fixed";
      o.style.inset="0";
      o.style.background="rgba(0,0,0,.7)";
      o.style.display="flex";
      o.style.alignItems="center";
      o.style.justifyContent="center";
      o.style.zIndex="50";
      const msg=document.createElement("div");
      msg.className="card";
      msg.style.maxWidth="700px";
      msg.style.textAlign="center";
      msg.innerHTML="<h2>Mission failed</h2><p>The building remains sealed. Power systems never recovered.</p>";
      o.appendChild(msg);
      document.body.appendChild(o);
    }

    function disableAll(){
      document.querySelectorAll("input,button").forEach(el=>el.disabled=true);
    }

    // --- Build simplified levels (same as before) ---
    const ROOMS=[
      {title:"VR Suite (Top Floor)",prompt:"Enter the VR Suite room code",hint:"Look at the door."},
      {title:"Fire Laboratory",prompt:"Enter the lab name",hint:"Window sticker"},
      {title:"3D Printing Workshop",prompt:"Enter printer model",hint:"Machine tag"},
      {title:"Motorsport & Composites",prompt:"Enter team or code",hint:"Steering wheel"},
      {title:"Simulation Lab",prompt:"Enter simulation keyword",hint:"Door plaque"},
      {title:"CNC Workshop",prompt:"Enter CNC program number",hint:"Axis count → number"}
    ];

    function makeRoom(i,room){
      const div=document.createElement("div");
      div.className="card room"+(i===0?" active":"");
      div.setAttribute("data-index",i);
      div.innerHTML=`
        <h2>${room.title}</h2>
        <div class="q">${room.prompt}</div>
        <div class="controls">
          <input type="text" placeholder="Type your answer...">
          <button class="submit">Submit</button>
          <button class="next" disabled>Next</button>
        </div>
        <div class="feedback"></div>
        <div class="hint">Hint: ${room.hint}</div>
      `;
      const input=div.querySelector("input");
      const submit=div.querySelector(".submit");
      const next=div.querySelector(".next");
      const fb=div.querySelector(".feedback");

      submit.addEventListener("click",()=>{
        const val=input.value;
        fb.textContent="Checking...";
        verify(i,val).then(ok=>{
          if(ok){
            fb.textContent="Correct!"; fb.className="feedback ok";
            state.solved[i]=true;
            state.locks[i].classList.add("open");
            next.disabled=false;
          } else {
            fb.textContent="Try again."; fb.className="feedback err";
          }
        });
      });

      next.addEventListener("click",()=>{
        div.classList.remove("active");
        if(i+1<ROOMS.length){
          const nxt=document.querySelector('.room[data-index="'+(i+1)+'"]');
          nxt.classList.add("active");
        } else {
          celebrate();
        }
      });
      return div;
    }

    function build(){
      roomsEl.innerHTML="";
      for(let i=0;i<ROOMS.length;i++){
        roomsEl.appendChild(makeRoom(i,ROOMS[i]));
      }
      injectProgress(ROOMS.length);
      injectStopwatch();
      startTimer();
    }

    function celebrate(){
      disableAll();
      const o=document.createElement("div");
      o.style.position="fixed";
      o.style.inset="0";
      o.style.background="rgba(0,0,0,.7)";
      o.style.display="flex";
      o.style.alignItems="center";
      o.style.justifyContent="center";
      o.style.zIndex="50";
      const msg=document.createElement("div");
      msg.className="card";
      msg.style.maxWidth="700px";
      msg.style.textAlign="center";
      msg.innerHTML="<h2>Power Restored</h2><p>You escaped! The CNC awaits.</p>";
      o.appendChild(msg);
      document.body.appendChild(o);
    }

    build();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start);
  else start();
})();
