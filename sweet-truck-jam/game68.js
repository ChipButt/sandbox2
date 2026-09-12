(async()=>{
  'use strict';

  function patch(source,from,to,label){
    if(!source.includes(from))throw new Error('Build 68 patch failed: '+label);
    return source.replace(from,to);
  }

  let source=await fetch('game67.js?v=67',{cache:'no-store'}).then(r=>{
    if(!r.ok)throw new Error('Unable to load Build 67 base');
    return r.text();
  });

  source=patch(source,
`const overlaySecondary=document.getElementById('overlaySecondary');`,
`const overlaySecondary=document.getElementById('overlaySecondary');
const overlayTertiary=document.getElementById('overlayTertiary');
const overlayRescue=document.getElementById('overlayRescue');`,
'overlay controls');

  source=patch(source,
`coins:250+(n-1)*15,time:0,rotationPhase:0,holdFast:false`,
`coins:250+(n-1)*15,time:0,rotationPhase:0,holdFast:false,stuckPaused:false,stuckPromptUntil:0`,
'stuck state');

  source=patch(source,
`function update(dt){
  state.time+=dt;`,
`function update(dt){
  if(state.stuckPaused)return;
  state.time+=dt;`,
'pause during stuck popup');

  source=patch(source,
`      for(let i=0;i<4;i++){
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
      }`,
`      // Peel the row toward the chosen truck. The physically closest sweet
      // gets the first departure delay, rather than always starting from the
      // same centre-side lane.
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
      }`,
'nearest-sweet loading order');

  source=patch(source,
`function checkEnd(){
  const garageDone=!state.garage||(!state.garage.currentId&&state.garage.queue.length===0);
  if(sweetsRemaining()===0&&state.yard.length===0&&garageDone&&state.slots.every(s=>!s.truck)&&state.motions.length===0){state.won=true;showResult(true);return}

  const active=state.slots.filter(s=>s.active),full=active.length>0&&active.every(s=>s.truck);
  if(full){
    const parkedColors=new Set(active.map(s=>s.truck.color));
    const possible=[...state.rotation.filter(Boolean),...state.leftFeed,...state.rightFeed];
    if(possible.length&&!possible.some(c=>parkedColors.has(c.color))){state.lost=true;showResult(false)}
  }
}`,
`function hasLoopGap(){
  for(let r=0;r<LOOP_ROWS;r++)if(gapAtRow(r))return true;
  return false;
}
function deadlockStatus(){
  if(state.won||state.lost)return{stuck:false};

  // Do not interrupt animations or a load/departure that is already in
  // progress: those actions can still create a legal move by themselves.
  if(state.motions.length||state.particles.some(p=>p.kind==='load'&&!p.arrived))return{stuck:false};
  if(state.slots.some(s=>s.truck&&((s.truck.pending||0)>0||s.truck.departScheduled)))return{stuck:false};

  const parked=state.slots
    .filter(s=>s.active&&s.truck)
    .map(s=>s.truck)
    .filter(t=>(t.loaded||0)+(t.pending||0)+4<=t.capacity);

  // Any matching row already on the loop will eventually reach the outlet.
  const loopColors=new Set(state.rotation.filter(Boolean).map(c=>c.color));
  if(parked.some(t=>loopColors.has(t.color)))return{stuck:false};

  // Feeder colours can only rescue the board if a real four-wide gap already
  // exists for a feeder row to enter through.
  if(hasLoopGap()){
    const feedColors=new Set([...state.leftFeed,...state.rightFeed].map(c=>c.color));
    if(parked.some(t=>feedColors.has(t.color)))return{stuck:false};
  }

  const reserved=new Set(state.motions.filter(m=>m.type==='dispatch').map(m=>m.slot));
  const openSlot=state.slots.some((s,i)=>s.active&&!s.truck&&!reserved.has(i));
  const clearYard=state.yard.filter(t=>canDriveOut(t,state.yard));

  // If a clear truck can still be sent to a normal open bay, the player has
  // a legal non-power-up move and should not be interrupted.
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
  if(info.boosters.length)options.push('power-ups: '+info.boosters.join(' / '));
  if(info.buySlot)options.push('buy the fifth parking space for 100 coins');
  overlayText.textContent=options.length
    ? 'There are no normal moves left. Continue to use '+options.join(', or ')+'.'
    : 'There are no normal moves left. You can restart the level or quit.';

  overlayPrimary.style.display='';
  overlayPrimary.disabled=false;
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
}`,
'deadlock detector and popup');

  source=patch(source,
`  state.motions.push({
    type:'dispatch',
    truck:t,`,
`  state.stuckPromptUntil=0;
  state.motions.push({
    type:'dispatch',
    truck:t,`,
'reset stuck prompt after dispatch');

  source=patch(source,
`  state.coins-=100;s.active=true;showToast('Fifth parking slot opened');`,
`  state.coins-=100;s.active=true;state.stuckPromptUntil=0;showToast('Fifth parking slot opened');`,
'reset stuck prompt after slot purchase');

  source=patch(source,
`  state.boosters.shuffle--;`,
`  state.boosters.shuffle--;state.stuckPromptUntil=0;`,
'reset stuck prompt after shuffle');

  source=patch(source,
`function showResult(win){overlay.classList.remove('hidden');overlayBadge.textContent=win?'✓':'!';overlayBadge.style.background=win?'#e4f7eb':'#ffe8e8';overlayBadge.style.color=win?'#2b9f5d':'#d14e4e';overlayTitle.textContent=win?'DELIVERED!':'PARKING FULL';overlayText.textContent=win?'Every sweet has been loaded and sent for delivery.':'The parking area is full and none of the parked trucks can take the next colour in the centre rotation.';overlayPrimary.textContent=win?'NEXT LEVEL':'TRY AGAIN';overlayPrimary.onclick=()=>start(win?level+1:level);overlaySecondary.onclick=()=>start(level)}`,
`function showResult(win){overlay.classList.remove('hidden');overlayBadge.textContent=win?'✓':'!';overlayBadge.style.background=win?'#e4f7eb':'#ffe8e8';overlayBadge.style.color=win?'#2b9f5d':'#d14e4e';overlayTitle.textContent=win?'DELIVERED!':'LEVEL OVER';overlayText.textContent=win?'Every sweet has been loaded and sent for delivery.':'Restart the level to try again.';overlayPrimary.style.display='';overlayPrimary.disabled=false;overlayPrimary.textContent=win?'NEXT LEVEL':'TRY AGAIN';overlayPrimary.onclick=()=>start(win?level+1:level);overlayRescue.style.display='none';overlaySecondary.style.display='';overlaySecondary.textContent='RESTART';overlaySecondary.onclick=()=>start(level);overlayTertiary.style.display='none'}`,
'result overlay cleanup');

  source+='\n//# sourceURL=game68-runtime.js\n';
  (0,eval)(source);
})().catch(err=>{
  console.error(err);
  const overlay=document.getElementById('overlay');
  if(overlay){
    overlay.classList.remove('hidden');
    document.getElementById('overlayBadge').textContent='!';
    document.getElementById('overlayTitle').textContent='LOAD ERROR';
    document.getElementById('overlayText').textContent='The latest game build could not start. Refresh to try again.';
  }
});
