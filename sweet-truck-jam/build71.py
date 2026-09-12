from pathlib import Path

src=Path('sweet-truck-jam/game70.js')
s=src.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'Build 71 patch missing: {label}')
    s=s.replace(old,new,1)

old_fallback='''function fallbackLevel(n){
  for(let attempt=0;attempt<60;attempt++){
    const R=rng(n*191+attempt*1297+401),trucks=buildRandomCluster(n,R,true);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<2||clear>7)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=finishGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }
  throw new Error('Unable to generate clustered level');
}'''

new_fallback='''function safeGeneratedCluster(trucks,order,R,n){
  // Emergency generation deliberately skips the garage, hidden-colour and
  // high-pressure sweet-order layers. Geometry and the removal order are
  // still solver checked, while sweet rows follow that valid truck order.
  // This gives every level number a guaranteed playable irregular board
  // instead of allowing startup to fail completely.
  for(const t of trucks)t._blockCount=blockingTruckIds(t,trucks).length;
  const gen={trucks,order:[...order],garage:null,sweetRows:[]};
  const palette=['red','blue','green','yellow','cyan','orange','pink','purple','brown'];
  const byId=new Map(trucks.map(t=>[t.id,t]));
  for(let i=0;i<order.length;i++){
    const t=byId.get(order[i]);
    if(t)t.color=palette[(i+Math.max(0,n-1))%Math.min(palette.length,Math.max(4,4+Math.floor(n/3)))];
  }
  gen.sweetRows=rowsForTruckOrder(gen,gen.order);
  gen.difficulty={
    maxParked:0,
    forcedWrong:0,
    initialFree:trucks.filter(t=>canDriveOut(t,trucks)).length,
    safeFallback:true
  };
  return validateGeneratedLevel(gen)?gen:null;
}
function fallbackLevel(n){
  // The former fallback repeated the same strict garage/colour/sweet-order
  // constraints and could still throw for many deterministic level seeds.
  // Here we retain the irregular packed truck generator, but relax only the
  // challenge layers until a solver-approved board is found.
  for(let attempt=0;attempt<96;attempt++){
    const R=rng(n*191+attempt*1297+401),trucks=buildRandomCluster(n,R,true);if(!trucks)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=safeGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }

  // Last-resort pass uses easier seeds and accepts any non-empty cluster with
  // a valid removal order. It remains an irregular truck cluster rather than
  // reverting to artificial rows or lanes.
  for(let attempt=0;attempt<160;attempt++){
    const R=rng(0x71f00d+n*313+attempt*811),trucks=buildRandomCluster(Math.max(1,Math.min(n,4)),R,true);if(!trucks)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=safeGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }
  throw new Error('Unable to create even a safe clustered level');
}'''
rep(old_fallback,new_fallback,'guaranteed safe fallback generator')

old_boot="""let saved=1;try{saved=parseInt(localStorage.getItem('sweet-fever-level')||'1',10)}catch(_){}start(Number.isFinite(saved)&&saved>0?saved:1);requestAnimationFrame(frame);
})();"""
new_boot="""function showStartupFailure(err,requestedLevel){
  console.error('Sweet Traffic Fever startup failed',err);
  overlay.classList.remove('hidden');
  overlayBadge.textContent='!';
  overlayBadge.style.background='#ffe8e8';
  overlayBadge.style.color='#d14e4e';
  overlayTitle.textContent='LEVEL LOAD ERROR';
  overlayText.textContent='Level '+requestedLevel+' could not be created. You can retry it or start again from Level 1.';
  overlayPrimary.textContent='RETRY LEVEL';
  overlayPrimary.onclick=()=>location.reload();
  overlaySecondary.textContent='START LEVEL 1';
  overlaySecondary.onclick=()=>{
    try{localStorage.setItem('sweet-fever-level','1')}catch(_){}
    location.reload();
  };
}

let saved=1;
try{saved=parseInt(localStorage.getItem('sweet-fever-level')||'1',10)}catch(_){}
const requestedLevel=Number.isFinite(saved)&&saved>0?saved:1;
try{
  start(requestedLevel);
  requestAnimationFrame(frame);
}catch(err){
  showStartupFailure(err,requestedLevel);
}
})();"""
rep(old_boot,new_boot,'non-blank startup recovery')

Path('sweet-truck-jam/game71.js').write_text(s)
Path('sweet-truck-jam/game.js').write_text(s)
print('game71 generated',len(s))
