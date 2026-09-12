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
  if(n<=2)return{minFree:2,maxFree:3,garageChance:.55,hiddenChance:.45,shuffleMoves:22,sweetAttempts:96,minParked:2,minForcedWrong:1};
  if(n<=4)return{minFree:1,maxFree:2,garageChance:.85,hiddenChance:.70,shuffleMoves:30,sweetAttempts:112,minParked:3,minForcedWrong:2};
  if(n<=7)return{minFree:1,maxFree:1,garageChance:1,hiddenChance:.88,shuffleMoves:38,sweetAttempts:128,minParked:3,minForcedWrong:3};
  if(n<=12)return{minFree:1,maxFree:1,garageChance:1,hiddenChance:.96,shuffleMoves:46,sweetAttempts:144,minParked:4,minForcedWrong:4};
  return{minFree:1,maxFree:1,garageChance:1,hiddenChance:.98,shuffleMoves:54,sweetAttempts:160,minParked:4,minForcedWrong:5};
}''','difficulty profile')

# A garage is a difficulty feature, not a reason to reject an otherwise strong board.
s=s.replace('if(!free.length)return !forced;','if(!free.length)return true;',1)
s=s.replace('if(!eligible.length)return !forced;','if(!eligible.length)return true;',1)
s=s.replace('if(pos<0)return !forced;','if(pos<0)return true;',1)

sub(r"function buildHardSweetRows\(gen,r,n\)\{.*?\n\}\nfunction applyHiddenTruckColours",'''function buildHardSweetRows(gen,r,n){
  const profile=difficultyProfile(n);
  const by=new Map(allGeneratedTrucks(gen).map(t=>[t.id,t]));
  const baseIds=[...gen.order];
  const originalBaseRows=rowsForTruckOrder(gen,baseIds);
  const mixedBaseRows=mixSweetRowColours(originalBaseRows,r);
  const mixedBaseResult=simulateParkingRows(gen,mixedBaseRows);
  const originalBaseResult=simulateParkingRows(gen,originalBaseRows);
  let best=mixedBaseResult.solvable?{rows:mixedBaseRows,result:mixedBaseResult,score:-1}:null;
  let hardBest=null;
  const emergency=originalBaseResult.solvable?{rows:originalBaseRows,result:originalBaseResult,score:-999999}:null;

  const attempts=profile.sweetAttempts||96;
  for(let attempt=0;attempt<attempts;attempt++){
    let ids=[...baseIds];

    if(attempt%5===0){
      ids=ids
        .map((id,i)=>({id,i,rank:(by.get(id)?._blockCount||0)*140+r()*45}))
        .sort((a,b)=>b.rank-a.rank||a.i-b.i)
        .map(x=>x.id);
    }else if(attempt%5===1||attempt%5===2){
      for(let i=ids.length-1;i>0;i--){
        const j=Math.floor(r()*(i+1));
        [ids[i],ids[j]]=[ids[j],ids[i]];
      }
    }else{
      if(ids.length>4){
        const shift=rint(r,1,Math.min(10,ids.length-2));
        ids=ids.slice(shift).concat(ids.slice(0,shift));
      }
      const moves=profile.shuffleMoves+rint(r,4,10);
      for(let m=0;m<moves;m++){
        if(ids.length<4)break;
        const from=rint(r,1,ids.length-1);
        const jump=rint(r,2,Math.min(12,from));
        const [id]=ids.splice(from,1);
        ids.splice(Math.max(0,from-jump),0,id);
      }
    }

    const rows=mixSweetRowColours(rowsForTruckOrder(gen,ids),r);
    const runStats=colourRunStats(rows);
    if(runStats.maxRun>5)continue;
    if(rows.length>=24&&runStats.smallBlocks<2)continue;
    const result=simulateParkingRows(gen,rows);
    if(!result.solvable)continue;

    const window=new Set(rows.slice(0,LOOP_ROWS));
    const early=baseIds.slice(0,Math.min(6,baseIds.length));
    let earlyMissing=0;
    for(const id of early){
      const t=by.get(id);
      if(t&&!window.has(t.color))earlyMissing++;
    }
    const slotPressure=result.maxParked>=4?1500:result.maxParked*360;
    const score=slotPressure+result.forcedWrong*90+earlyMissing*190+runStats.singleRows*2+runStats.smallBlocks*8;
    const candidate={rows,result,score};
    if(!best||score>best.score)best=candidate;
    if(result.maxParked>=profile.minParked&&result.forcedWrong>=profile.minForcedWrong){
      if(!hardBest||score>hardBest.score)hardBest=candidate;
    }
  }

  return hardBest||best||emergency;
}
function applyHiddenTruckColours''','hard sweet rows')

sub(r"function applyHiddenTruckColours\(gen,r,n\)\{.*?\n\}",'''function applyHiddenTruckColours(gen,r,n){
  const profile=difficultyProfile(n);if(profile.hiddenChance<=0)return;
  const hostId=gen.garage?.currentId;
  const candidates=gen.trucks.filter(t=>t.id!==hostId&&(t._blockCount||0)>=2).sort((a,b)=>(b._blockCount||0)-(a._blockCount||0));
  const maxHidden=n<3?3:n<5?5:n<8?7:n<13?10:12;let hidden=0;
  for(const t of candidates){if(hidden>=maxHidden)break;if(r()<profile.hiddenChance){t.hideColor=true;t.revealed=false;hidden++}}
  if(n>=3&&hidden<Math.min(2,candidates.length)){
    for(const t of candidates){
      if(hidden>=Math.min(2,candidates.length))break;
      if(!t.hideColor){t.hideColor=true;t.revealed=false;hidden++}
    }
  }
}''','hidden truck pressure')

sub(r"function buildRandomCluster\(n,R,relaxed=false\)\{.*?\n\}\nfunction finishGeneratedCluster",'''function buildRandomCluster(n,R,relaxed=false){
  const count=Math.min((relaxed?17:19)+Math.floor(n*.35),24),trucks=[];
  const cx=JAM.x+JAM.w/2,cy=JAM.y+JAM.h/2;

  for(let i=0;i<count;i++){
    let placed=false;
    for(let k=0;k<520&&!placed;k++){
      const kind=R()<.18?2:R()<.55?1:0;
      const length=[48,59,72][kind],width=[25,27,29][kind];
      const x=rint(R,JAM.x+34,JAM.x+JAM.w-34);
      const y=rint(R,JAM.y+34,JAM.y+JAM.h-34);

      const unit=Math.PI/4;
      const outward=Math.round(Math.atan2(y-cy,x-cx)/unit)*unit;
      const roll=R();
      let twist=0;
      const straightChance=n<=2?.66:n<=4?.50:n<=7?.38:.28;
      const sideChance=n<=2?.22:n<=4?.28:n<=7?.30:.30;
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
function finishGeneratedCluster''','denser cluster')

sub(r"function generateLevel\(n\)\{.*?\n\}\nfunction safeGeneratedCluster",'''function generateLevel(n){
  const profile=difficultyProfile(n);
  let best=null,validFound=0;
  for(let attempt=0;attempt<64;attempt++){
    const R=rng(n*73471+attempt*977+19),trucks=buildRandomCluster(n,R,false);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<profile.minFree||clear>profile.maxFree)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=finishGeneratedCluster(trucks,order,R,n);if(!gen)continue;
    const d=gen.difficulty||{};
    if((d.maxParked||0)<profile.minParked||(d.forcedWrong||0)<profile.minForcedWrong)continue;

    const blockTotal=trucks.reduce((sum,t)=>sum+(t._blockCount||0),0);
    const deep=trucks.filter(t=>(t._blockCount||0)>=2).length;
    const veryDeep=trucks.filter(t=>(t._blockCount||0)>=3).length;
    const actualFree=d.initialFree??clear;
    const score=(5-actualFree)*180+(d.maxParked||0)*420+(d.forcedWrong||0)*110+blockTotal*5+deep*70+veryDeep*120+(gen.garage?180:0);
    if(!best||score>best.score)best={gen,score};
    validFound++;
    if(validFound>=9)break;
  }
  return best?best.gen:fallbackLevel(n);
}
function challengeGeneratedCluster(trucks,order,R,n){
  const profile=difficultyProfile(n);
  for(const t of trucks)t._blockCount=blockingTruckIds(t,trucks).length;
  const gen={trucks,order:[...order],garage:null,sweetRows:[]};
  assignChallengeColors(gen,R,n);
  const sweet=buildHardSweetRows(gen,R,n);if(!sweet)return null;
  if(sweet.result.maxParked<Math.max(3,profile.minParked-1)||sweet.result.forcedWrong<Math.max(2,profile.minForcedWrong-1))return null;
  gen.sweetRows=sweet.rows;
  gen.difficulty={maxParked:sweet.result.maxParked,forcedWrong:sweet.result.forcedWrong,initialFree:trucks.filter(t=>canDriveOut(t,trucks)).length,challengeFallback:true};
  applyHiddenTruckColours(gen,R,n);
  return validateGeneratedLevel(gen)?gen:null;
}
function safeGeneratedCluster''','hard primary generation')

sub(r"function fallbackLevel\(n\)\{.*?\n\}\nfunction makeQueue",'''function fallbackLevel(n){
  const profile=difficultyProfile(n);

  // First fallback keeps all of the puzzle pressure except the garage. This
  // avoids the Build 71 problem where a failed normal seed became a trivial
  // colour-by-colour level.
  for(let attempt=0;attempt<140;attempt++){
    const R=rng(n*191+attempt*1297+401),trucks=buildRandomCluster(n,R,false);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<1||clear>Math.max(2,profile.maxFree+1))continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=challengeGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }
  for(let attempt=0;attempt<140;attempt++){
    const R=rng(0x72f00d+n*313+attempt*811),trucks=buildRandomCluster(n,R,true);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<1||clear>3)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=challengeGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }

  // Only an absolute last resort uses the guaranteed safe generator.
  for(let attempt=0;attempt<160;attempt++){
    const R=rng(0x72fade+n*421+attempt*919),trucks=buildRandomCluster(Math.max(1,Math.min(n,4)),R,true);if(!trucks)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=safeGeneratedCluster(trucks,order,R,n);if(gen)return gen;
  }
  throw new Error('Unable to create even a safe clustered level');
}
function makeQueue''','hard fallback')

sub(r"function start\(n\)\{\n  level=n;state=newState\(n\);",'''function start(n){
  level=n;state=newState(n);
  const dd=state.generated?.difficulty||state.difficulty||{};
  document.body.dataset.initialFree=String(dd.initialFree??'');
  document.body.dataset.maxParked=String(dd.maxParked??'');
  document.body.dataset.forcedWrong=String(dd.forcedWrong??'');
  document.body.dataset.safeFallback=dd.safeFallback?'1':'0';''','difficulty diagnostics')

Path('sweet-truck-jam/game72.js').write_text(s)
Path('sweet-truck-jam/game.js').write_text(s)
print('game72 generated',len(s))
