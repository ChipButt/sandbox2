from pathlib import Path

p=Path('sweet-truck-jam/game67.js')
s=p.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'patch missing: {label}')
    s=s.replace(old,new,1)

rep("const overlaySecondary=document.getElementById('overlaySecondary');",
"const overlaySecondary=document.getElementById('overlaySecondary');\nconst overlayTertiary=document.getElementById('overlayTertiary');\nconst overlayRescue=document.getElementById('overlayRescue');",
'overlay controls')

rep("coins:250+(n-1)*15,time:0,rotationPhase:0,holdFast:false",
"coins:250+(n-1)*15,time:0,rotationPhase:0,holdFast:false,stuckPaused:false,stuckPromptUntil:0",
'stuck state')

rep("function update(dt){\n  state.time+=dt;",
"function update(dt){\n  if(state.stuckPaused)return;\n  state.time+=dt;",
'pause during popup')

old_load='''      for(let i=0;i<4;i++){
        const c=outletRow[i],cp=candyPos(base+i,1);
        state.particles.push({
          kind:'load',
          slotIndex,
          truckId:truck.id,
          color:c.color,
          sx:cp.x,sy:cp.y,
          c1x:LOAD_MOUTH.x,c1y:LOAD_MOUTH.y-8,
          c2x:lerp(LOAD_MOUTH.x,slot.x,.58),c2y:lerp(LOAD_MOUTH.y,slot.y-10,.64),
          tx:slot.x,ty:slot.y-10,
          t:0,
          delay:i*.052,
          duration:.43
        });
      }'''
new_load='''      // Peel toward the selected truck: the physically closest sweet goes first.
      const truckMouth={x:slot.x,y:slot.y-10};
      const peelOrder=[0,1,2,3]
        .map(i=>({i,cp:candyPos(base+i,1)}))
        .sort((a,b)=>dist2(a.cp,truckMouth)-dist2(b.cp,truckMouth));

      for(let order=0;order<peelOrder.length;order++){
        const item=peelOrder[order],i=item.i,cp=item.cp,c=outletRow[i];
        state.particles.push({
          kind:'load',
          slotIndex,
          truckId:truck.id,
          color:c.color,
          sx:cp.x,sy:cp.y,
          c1x:LOAD_MOUTH.x,c1y:LOAD_MOUTH.y-8,
          c2x:lerp(LOAD_MOUTH.x,slot.x,.58),c2y:lerp(LOAD_MOUTH.y,slot.y-10,.64),
          tx:slot.x,ty:slot.y-10,
          t:0,
          delay:order*.052,
          duration:.43
        });
      }'''
rep(old_load,new_load,'nearest sweet loading')

old_end='''function checkEnd(){
  const garageDone=!state.garage||(!state.garage.currentId&&state.garage.queue.length===0);
  if(sweetsRemaining()===0&&state.yard.length===0&&garageDone&&state.slots.every(s=>!s.truck)&&state.motions.length===0){state.won=true;showResult(true);return}

  const active=state.slots.filter(s=>s.active),full=active.length>0&&active.every(s=>s.truck);
  if(full){
    const parkedColors=new Set(active.map(s=>s.truck.color));
    const possible=[...state.rotation.filter(Boolean),...state.leftFeed,...state.rightFeed];
    if(possible.length&&!possible.some(c=>parkedColors.has(c.color))){state.lost=true;showResult(false)}
  }
}'''
new_end='''function hasLoopGap(){
  for(let r=0;r<LOOP_ROWS;r++)if(gapAtRow(r))return true;
  return false;
}
function deadlockStatus(){
  if(state.won||state.lost)return{stuck:false};
  if(state.motions.length||state.particles.some(p=>p.kind==='load'&&!p.arrived))return{stuck:false};
  if(state.slots.some(s=>s.truck&&((s.truck.pending||0)>0||s.truck.departScheduled)))return{stuck:false};

  const parked=state.slots
    .filter(s=>s.active&&s.truck)
    .map(s=>s.truck)
    .filter(t=>(t.loaded||0)+(t.pending||0)+4<=t.capacity);

  // A matching row already on the loop means normal play can still progress.
  const loopColors=new Set(state.rotation.filter(Boolean).map(c=>c.color));
  if(parked.some(t=>loopColors.has(t.color)))return{stuck:false};

  // Feeder sweets can rescue the board once an existing four-wide gap reaches them.
  if(hasLoopGap()){
    const feedColors=new Set([...state.leftFeed,...state.rightFeed].map(c=>c.color));
    if(parked.some(t=>feedColors.has(t.color)))return{stuck:false};
  }

  const reserved=new Set(state.motions.filter(m=>m.type==='dispatch').map(m=>m.slot));
  const openSlot=state.slots.some((s,i)=>s.active&&!s.truck&&!reserved.has(i));
  const clearYard=state.yard.filter(t=>canDriveOut(t,state.yard));
  if(openSlot&&clearYard.length)return{stuck:false};

  const buySlot=!!(state.slots[4]&&!state.slots[4].active&&state.coins>=100&&clearYard.length);
  const boosters=[];
  if(state.boosters.auto>0)boosters.push('AUTO x'+state.boosters.auto);
  if(state.boosters.shuffle>0)boosters.push('SHUFFLE x'+state.boosters.shuffle);
  return{stuck:true,buySlot,boosters,clearYard:clearYard.length};
}
function showStuckPopup(info){
  if(state.stuckPaused)return;
  state.stuckPaused=true;

  overlay.classList.remove('hidden');
  overlayBadge.textContent='!';
  overlayBadge.style.background='#fff0cc';
  overlayBadge.style.color='#d38813';
  overlayTitle.textContent='NO MOVES LEFT';

  const options=[];
  if(info.boosters.length)options.push('use '+info.boosters.join(' or '));
  if(info.buySlot)options.push('buy the fifth parking space for 100 coins');
  overlayText.textContent=options.length
    ? 'There are no normal moves left. You can '+options.join(', or ')+'.'
    : 'There are no normal moves left. Restart the level or quit.';

  const canContinue=info.boosters.length>0;
  overlayPrimary.style.display=canContinue?'':'none';
  overlayPrimary.disabled=!canContinue;
  overlayPrimary.textContent='CONTINUE';
  overlayPrimary.onclick=()=>{
    state.stuckPaused=false;
    state.stuckPromptUntil=state.time+8;
    overlay.classList.add('hidden');
  };

  overlayRescue.style.display=info.buySlot?'':'none';
  overlayRescue.textContent='BUY 5TH SPACE - 100';
  overlayRescue.onclick=()=>{
    state.stuckPaused=false;
    state.stuckPromptUntil=0;
    overlay.classList.add('hidden');
    unlockSlot();
    checkEnd();
  };

  overlaySecondary.style.display='';
  overlaySecondary.textContent='RESTART';
  overlaySecondary.onclick=()=>start(level);

  overlayTertiary.style.display='';
  overlayTertiary.textContent='QUIT';
  overlayTertiary.onclick=()=>{window.location.href='../'};
}
function checkEnd(){
  const garageDone=!state.garage||(!state.garage.currentId&&state.garage.queue.length===0);
  if(sweetsRemaining()===0&&state.yard.length===0&&garageDone&&state.slots.every(s=>!s.truck)&&state.motions.length===0){state.won=true;showResult(true);return}
  if(state.stuckPaused||state.time<(state.stuckPromptUntil||0))return;
  const deadlock=deadlockStatus();
  if(deadlock.stuck)showStuckPopup(deadlock);
}'''
rep(old_end,new_end,'deadlock detector')

rep("  state.motions.push({\n    type:'dispatch',\n    truck:t,",
"  state.stuckPromptUntil=0;\n  state.motions.push({\n    type:'dispatch',\n    truck:t,",
'dispatch resets prompt')

rep("  state.coins-=100;s.active=true;showToast('Fifth parking slot opened');",
"  state.coins-=100;s.active=true;state.stuckPromptUntil=0;showToast('Fifth parking slot opened');",
'slot purchase resets prompt')

rep("  state.boosters.shuffle--;",
"  state.boosters.shuffle--;state.stuckPromptUntil=0;",
'shuffle resets prompt')

old_result="function showResult(win){overlay.classList.remove('hidden');overlayBadge.textContent=win?'✓':'!';overlayBadge.style.background=win?'#e4f7eb':'#ffe8e8';overlayBadge.style.color=win?'#2b9f5d':'#d14e4e';overlayTitle.textContent=win?'DELIVERED!':'PARKING FULL';overlayText.textContent=win?'Every sweet has been loaded and sent for delivery.':'The parking area is full and none of the parked trucks can take the next colour in the centre rotation.';overlayPrimary.textContent=win?'NEXT LEVEL':'TRY AGAIN';overlayPrimary.onclick=()=>start(win?level+1:level);overlaySecondary.onclick=()=>start(level)}"
new_result="function showResult(win){overlay.classList.remove('hidden');overlayBadge.textContent=win?'✓':'!';overlayBadge.style.background=win?'#e4f7eb':'#ffe8e8';overlayBadge.style.color=win?'#2b9f5d':'#d14e4e';overlayTitle.textContent=win?'DELIVERED!':'LEVEL OVER';overlayText.textContent=win?'Every sweet has been loaded and sent for delivery.':'Restart the level to try again.';overlayPrimary.style.display='';overlayPrimary.disabled=false;overlayPrimary.textContent=win?'NEXT LEVEL':'TRY AGAIN';overlayPrimary.onclick=()=>start(win?level+1:level);overlayRescue.style.display='none';overlaySecondary.style.display='';overlaySecondary.textContent='RESTART';overlaySecondary.onclick=()=>start(level);overlayTertiary.style.display='none'}"
rep(old_result,new_result,'result popup cleanup')

Path('sweet-truck-jam/game69.js').write_text(s)
Path('sweet-truck-jam/game.js').write_text(s)
print('game69 generated',len(s))
