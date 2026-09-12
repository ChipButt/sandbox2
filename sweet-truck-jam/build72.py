from pathlib import Path
import re

src=Path('sweet-truck-jam/game71.js')
s=src.read_text()

def sub(pattern,repl,label,count=1):
    global s
    ns,n=re.subn(pattern,repl,s,count=count,flags=re.S)
    if n!=count:
        raise SystemExit(f'Build 72 patch failed: {label} ({n}/{count})')
    s=ns

sub(r"function difficultyProfile\(n\)\{.*?\n\}",'''function difficultyProfile(n){
  if(n<=2)return{minFree:2,maxFree:5,garageChance:.55,hiddenChance:.45,shuffleMoves:18,sweetAttempts:56,minParked:2,minForcedWrong:1};
  if(n<=4)return{minFree:2,maxFree:4,garageChance:.85,hiddenChance:.70,shuffleMoves:24,sweetAttempts:72,minParked:3,minForcedWrong:2};
  if(n<=7)return{minFree:1,maxFree:3,garageChance:1,hiddenChance:.88,shuffleMoves:30,sweetAttempts:84,minParked:3,minForcedWrong:3};
  if(n<=12)return{minFree:1,maxFree:3,garageChance:1,hiddenChance:.95,shuffleMoves:34,sweetAttempts:96,minParked:4,minForcedWrong:4};
  return{minFree:1,maxFree:2,garageChance:1,hiddenChance:.98,shuffleMoves:38,sweetAttempts:108,minParked:4,minForcedWrong:5};
}''','difficulty profile')

# A missing garage pocket must not force the whole level into the easy fallback.
s=s.replace('if(!free.length)return !forced;','if(!free.length)return true;',1)
s=s.replace('if(!eligible.length)return !forced;','if(!eligible.length)return true;',1)
s=s.replace('if(pos<0)return !forced;','if(pos<0)return true;',1)

sub(r"function assignChallengeColors\(gen,r,n\)\{.*?\n\}\nfunction rowsForTruckOrder",'''function assignChallengeColors(gen,r,n){
  const all=allGeneratedTrucks(gen),by=new Map(all.map(t=>[t.id,t]));
  const early=['red','blue','green','yellow'];
  const pressure=['cyan','orange','pink','purple','brown'];
  const palette=[...early,...pressure];

  // Colour by the actual release order. The first few removable trucks use a
  // palette deliberately absent from the next several trucks. The sweet queue
  // can then delay those early colours and force genuine parking decisions.
  for(let i=0;i<gen.order.length;i++){
    const t=by.get(gen.order[i]);if(!t)continue;
    if(i<4)t.color=early[i%early.length];
    else if(i<10)t.color=pressure[(i-4)%pressure.length];
    else{
      const prev=by.get(gen.order[i-1])?.color;
      const choices=palette.filter(c=>c!==prev);
      t.color=choice(r,choices.length?choices:palette);
    }
  }

  // Keep both high-tier colours in normal levels even if the order is short.
  if(all.length>=6){
    if(!all.some(t=>t.color==='purple'))all[Math.min(5,all.length-1)].color='purple';
    if(!all.some(t=>t.color==='brown'))all[Math.min(6,all.length-1)].color='brown';
  }
}
function rowsForTruckOrder''','challenge colours')

sub(r"function buildHardSweetRows\(gen,r,n\)\{.*?\n\}\nfunction applyHiddenTruckColours",'''function buildHardSweetRows(gen,r,n){
  const profile=difficultyProfile(n);
  const baseIds=[...gen.order];
  const originalRows=rowsForTruckOrder(gen,baseIds);
  const originalResult=simulateParkingRows(gen,originalRows);
  let best=originalResult.solvable?{rows:originalRows,result:originalResult,score:-999999}:null;
  let hardBest=null;

  const attempts=profile.sweetAttempts||64;
  for(let attempt=0;attempt<attempts;attempt++){
    let ids=[...baseIds];

    // The important change from Build 71: do NOT remix every colour back
    // across the first 36 rows. Move whole truck-sized colour blocks instead,
    // so early removable trucks can genuinely have no matching sweets visible.
    if(attempt<12&&ids.length>7){
      const delay=Math.min(3+(attempt%3),Math.max(3,ids.length-4));
      const early=ids.splice(0,Math.min(3,ids.length));
      const insert=Math.min(delay,ids.length);
      ids.splice(insert,0,...early);
      if(attempt%2&&ids.length>10){
        const [extra]=ids.splice(0,1);
        ids.splice(Math.min(insert+4,ids.length),0,extra);
      }
    }else if(attempt%3===0){
      const shift=ids.length>5?rint(r,3,Math.min(8,ids.length-2)):1;
      ids=ids.slice(shift).concat(ids.slice(0,shift));
    }else if(attempt%3===1){
      for(let i=ids.length-1;i>0;i--){
        const j=Math.floor(r()*(i+1));
        [ids[i],ids[j]]=[ids[j],ids[i]];
      }
    }else{
      const moves=profile.shuffleMoves;
      for(let m=0;m<moves;m++){
        if(ids.length<5)break;
        const from=rint(r,1,ids.length-1);
        const jump=rint(r,1,Math.min(8,from));
        const [id]=ids.splice(from,1);
        ids.splice(Math.max(0,from-jump),0,id);
      }
    }

    const rows=rowsForTruckOrder(gen,ids);
    const result=simulateParkingRows(gen,rows);
    if(!result.solvable)continue;

    const score=(result.maxParked>=4?1800:result.maxParked*420)+result.forcedWrong*120;
    const candidate={rows,result,score};
    if(!best||score>best.score)best=candidate;
    if(result.maxParked>=profile.minParked&&result.forcedWrong>=profile.minForcedWrong){
      if(!hardBest||score>hardBest.score)hardBest=candidate;
    }
  }

  return hardBest||best;
}
function applyHiddenTruckColours''','hard sweet rows')

sub(r"function applyHiddenTruckColours\(gen,r,n\)\{.*?\n\}",'''function applyHiddenTruckColours(gen,r,n){
  const profile=difficultyProfile(n);if(profile.hiddenChance<=0)return;
  const hostId=gen.garage?.currentId;
  const candidates=gen.trucks.filter(t=>t.id!==hostId&&(t._blockCount||0)>=2).sort((a,b)=>(b._blockCount||0)-(a._blockCount||0));
  const maxHidden=n<3?3:n<5?5:n<8?7:n<13?9:11;let hidden=0;
  for(const t of candidates){if(hidden>=maxHidden)break;if(r()<profile.hiddenChance){t.hideColor=true;t.revealed=false;hidden++}}
  if(n>=3&&hidden<Math.min(2,candidates.length)){
    for(const t of candidates){if(hidden>=Math.min(2,candidates.length))break;if(!t.hideColor){t.hideColor=true;t.revealed=false;hidden++}}
  }
}''','hidden pressure')

sub(r"function buildRandomCluster\(n,R,relaxed=false\)\{.*?\n\}\nfunction finishGeneratedCluster",'''function buildRandomCluster(n,R,relaxed=false){
  const count=Math.min((relaxed?15:17)+Math.floor(n*.35),22),trucks=[];
  const cx=JAM.x+JAM.w/2,cy=JAM.y+JAM.h/2;

  for(let i=0;i<count;i++){
    let placed=false;
    for(let k=0;k<450&&!placed;k++){
      const kind=R()<.18?2:R()<.55?1:0;
      const length=[48,59,72][kind],width=[25,27,29][kind];
      const x=rint(R,JAM.x+34,JAM.x+JAM.w-34);
      const y=rint(R,JAM.y+34,JAM.y+JAM.h-34);
      const unit=Math.PI/4;
      const outward=Math.round(Math.atan2(y-cy,x-cx)/unit)*unit;
      const roll=R();
      let twist=0;
      const straightChance=n<=2?.68:n<=4?.54:n<=7?.44:.36;
      const sideChance=n<=2?.22:n<=4?.27:n<=7?.30:.32;
      if(roll>straightChance){
        const sign=R()<.5?-1:1;
        twist=roll<straightChance+sideChance?sign:sign*2;
      }
      const angle=outward+twist*unit;
      const t={id:`t${i}`,x,y,angle,length,width,capacity:[20,28,36][kind],kind,color:'red'};
      const poly=truckPoly(t);
      if(poly.some(p=>p.x<JAM.x+4||p.x>JAM.x+JAM.w-4||p.y<JAM.y+4||p.y>JAM.y+JAM.h-4))continue;
      if(trucks.some(o=>polyOverlap(poly,truckPoly(o))))continue;
      trucks.push(t);placed=true;
    }
  }
  if(trucks.length<count-2)return null;
  compactTruckLayout(trucks);
  return trucks;
}
function finishGeneratedCluster''','harder irregular cluster')

sub(r"function generateLevel\(n\)\{.*?\n\}\nfunction safeGeneratedCluster",'''function generateLevel(n){
  const profile=difficultyProfile(n);
  let best=null,validFound=0;
  for(let attempt=0;attempt<44;attempt++){
    const R=rng(n*73471+attempt*977+19),trucks=buildRandomCluster(n,R,false);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<profile.minFree||clear>profile.maxFree)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=finishGeneratedCluster(trucks,order,R,n);if(!gen)continue;
    const d=gen.difficulty||{};
    if((d.maxParked||0)<profile.minParked||(d.forcedWrong||0)<profile.minForcedWrong)continue;
    const blockTotal=trucks.reduce((sum,t)=>sum+(t._blockCount||0),0);
    const deep=trucks.filter(t=>(t._blockCount||0)>=2).length;
    const score=(7-(d.initialFree??clear))*130+(d.maxParked||0)*500+(d.forcedWrong||0)*130+blockTotal*4+deep*55+(gen.garage?160:0);
    if(!best||score>best.score)best={gen,score};
    validFound++;
    if(validFound>=5)break;
  }
  return best?best.gen:fallbackLevel(n);
}
function challengeGeneratedCluster(trucks,order,R,n){
  const profile=difficultyProfile(n);
  for(const t of trucks)t._blockCount=blockingTruckIds(t,trucks).length;
  const gen={trucks,order:[...order],garage:null,sweetRows:[]};
  assignChallengeColors(gen,R,n);
  const sweet=buildHardSweetRows(gen,R,n);if(!sweet)return null;
  const minParked=Math.max(3,profile.minParked-1),minWrong=Math.max(2,profile.minForcedWrong-1);
  if(sweet.result.maxParked<minParked||sweet.result.forcedWrong<minWrong)return null;
  gen.sweetRows=sweet.rows;
  gen.difficulty={maxParked:sweet.result.maxParked,forcedWrong:sweet.result.forcedWrong,initialFree:trucks.filter(t=>canDriveOut(t,trucks)).length,challengeFallback:true};
  applyHiddenTruckColours(gen,R,n);
  return validateGeneratedLevel(gen)?gen:null;
}
function safeGeneratedCluster''','hard primary generation')

sub(r"function fallbackLevel\(n\)\{.*?\n\}\nfunction makeQueue",'''function fallbackLevel(n){
  const profile=difficultyProfile(n);
  for(let attempt=0;attempt<72;attempt++){
    const R=rng(n*191+attempt*1297+401),trucks=buildRandomCluster(n,R,true);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<1||clear>Math.max(5,profile.maxFree+2))continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=challengeGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }
  for(let attempt=0;attempt<120;attempt++){
    const R=rng(0x72fade+n*421+attempt*919),trucks=buildRandomCluster(Math.max(1,Math.min(n,4)),R,true);if(!trucks)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=safeGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }
  throw new Error('Unable to create even a safe clustered level');
}
function makeQueue''','hard fallback')

sub(r"function start\(n\)\{\n  level=n;state=newState\(n\);",'''function start(n){
  level=n;state=newState(n);
  const dd=state.difficulty||{};
  document.body.dataset.initialFree=String(dd.initialFree??'');
  document.body.dataset.maxParked=String(dd.maxParked??'');
  document.body.dataset.forcedWrong=String(dd.forcedWrong??'');
  document.body.dataset.safeFallback=dd.safeFallback?'1':'0';''','difficulty diagnostics')

Path('sweet-truck-jam/game72.js').write_text(s)
Path('sweet-truck-jam/game.js').write_text(s)
print('game72 generated',len(s))
