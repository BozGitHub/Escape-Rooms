// app.js — ES5 + server verify + robust rendering (external file)
(function(){
  function start(){
    var roomsEl = document.getElementById('rooms');
    if(!roomsEl){
      console.error('rooms container not found');
      return;
    }

    function toStr(x){ return String(x==null?'':x); }
    function nl2br(s){ return toStr(s).split('\n').join('<br>'); }
    function showFatal(msg){
      try{
        var card=document.createElement('div');
        card.className='card';
        card.style.borderColor='#ef4444';
        card.innerHTML='<strong>Error:</strong> '+toStr(msg);
        roomsEl.parentNode.insertBefore(card, roomsEl);
      }catch(e){}
    }

    // Server verify (Promise-based)
    function verify(levelIndex, answer){
      return new Promise(function(resolve){
        try{
          var payload=JSON.stringify({ level: levelIndex, answer: answer });
          fetch('/api/check', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: payload
          })
          .then(function(r){ if(!r||!r.ok){ return resolve(false); } return r.json(); })
          .then(function(data){ resolve(!!(data&&data.ok)); }, function(){ resolve(false); });
        }catch(e){ resolve(false); }
      });
    }

    // Levels (content only)
    var ROOMS = [
      { title:'Level 1 - VR Suite (Top Floor)',
        prompt:'Reality bends upstairs. Find the VR Suite on the top floor. Enter the room number8',
        hint:'Try the room code on the door.' },
      { title:'Level 2 - Fire Laboratory',
        prompt:'Descend one floor. Where heat meets safety, flames are studied not feared. Enter the room number or a label you find in the Fire Lab.',
        hint:'Look for controlled combustion equipment.' },
      { title:'Level 3 - 3D Printing Workshop',
        prompt:'Descend again. Where ideas become matter one layer at a time. Enter a printer model code or the room label you find (for example, MK3S or Prusa).',
        hint:'Check the machine tag.' },
      { title:'Level 4 - Motorsport and Composites Lab',
        prompt:'Go down two floors (skip one). Engines sleep and carbon weaves dream of speed. Enter the team name, a room label, or a code you find near the car.',
        hint:'Look near the steering wheel or composite layup.' },
      { title:'Level 5 - Simulation Lab (Lower Ground)',
        prompt:'Descend to the lower ground. What flies safely is rehearsed here first. Enter the room number or a keyword you find there (for example, Simulation or Sim Lab).',
        hint:'Check the door plaque or console.' },
      { title:'Level 6 - CNC Workshop Finale',
        prompt:'Final step. Creation obeys a number. From previous clues, determine the CNC program number (for example, 5 for a 5 axis hint). Enter that number now.',
        hint:'Think: axis count to program number.' }
    ];

    function makeRoom(i, room){
      var div=document.createElement('div');
      div.className='card room'+(i===0?' active':'');
      div.setAttribute('data-index', String(i));
      div.innerHTML='' +
        '<h2 style="margin:0 0 .5rem 0">'+room.title+'</h2>' +
        '<div class="q">'+nl2br(room.prompt)+'</div>' +
        '<div class="controls">' +
          '<input type="text" placeholder="Type your answer..." aria-label="answer input">' +
          '<button class="submit">Submit</button>' +
          '<button class="next" disabled>Next Room -></button>' +
        '</div>' +
        '<div class="feedback" aria-live="polite"></div>' +
        '<div class="hint">Hint: '+(room.hint||'')+'</div>';

      var input=div.querySelector('input');
      var submit=div.querySelector('.submit');
      var next=div.querySelector('.next');
      var fb=div.querySelector('.feedback');

      submit.addEventListener('click', function(){
        var val=input.value;
        submit.disabled=true; fb.textContent='Checking...'; fb.className='feedback';
        verify(i, val).then(function(ok){
          submit.disabled=false;
          if(ok){ fb.textContent='Correct!'; fb.className='feedback ok'; next.disabled=false; next.focus(); }
          else { fb.textContent='Not yet - try again!'; fb.className='feedback err'; }
        });
      });

      next.addEventListener('click', function(){
        var idx=parseInt(div.getAttribute('data-index'),10);
        div.classList.remove('active');
        if(idx+1<ROOMS.length){
          var nxt=document.querySelector('.room[data-index="'+(idx+1)+'"]');
          if(!nxt){ showFatal('Could not find next room'); return; }
          nxt.classList.add('active');
          var f=nxt.querySelector('input'); if(f) f.focus();
        } else { celebrate(); }
      });

      return div;
    }

    function build(){
      try{
        roomsEl.innerHTML='';
        for(var i=0;i<ROOMS.length;i++){ roomsEl.appendChild(makeRoom(i, ROOMS[i])); }
        var first=document.querySelector('.room[data-index="0"]');
        if(!first){ showFatal('Rooms failed to render'); }
      }catch(e){ showFatal(e && e.message ? e.message : 'render error'); }
    }

    function celebrate(){
      var canvas=document.querySelector('.confetti');
      if(!canvas) return;
      var ctx=canvas.getContext('2d');
      function resize(){ canvas.width=innerWidth; canvas.height=innerHeight; }
      resize(); addEventListener('resize',resize);
      var parts=[]; for(var i=0;i<200;i++){ parts.push({x:Math.random()*canvas.width,y:-10-Math.random()*canvas.height,r:2+Math.random()*4,vy:2+Math.random()*3,vx:(Math.random()-0.5)*1.5}); }
      var msg=document.createElement('div'); msg.className='card'; msg.style.position='fixed'; msg.style.left='50%'; msg.style.top='10%'; msg.style.transform='translateX(-50%)'; msg.style.zIndex='10'; msg.innerHTML='<h2>You escaped!</h2><p>Proceed to the CNC workshop and run your program.</p>'; document.body.appendChild(msg);
      var t=0; (function loop(){ ctx.clearRect(0,0,canvas.width,canvas.height); for(var j=0;j<parts.length;j++){ var p=parts[j]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.02; if(p.y>canvas.height+10){ p.y=-10; p.x=Math.random()*canvas.width; p.vy=2+Math.random()*3; } ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); } if(t++<1000) requestAnimationFrame(loop); })();
    }

    build();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
