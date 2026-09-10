from pathlib import Path
import re

path=Path('sweet-truck-jam/game.js')
s=path.read_text()

def replace_function_block(text,start_marker,end_marker,replacement):
    a=text.index(start_marker)
    b=text.index(end_marker,a)
    return text[:a]+replacement+text[b:]

difficulty=r'''function difficultyProfile(n){
  // Difficulty now controls actual puzzle pressure, not just cosmetics.
  // Even early levels require planning; later levels deliberately sit
  // close to the four-bay failure limit.
  if(n<=2)return{
    maxFree:3,garageChance:.25,hiddenChance:.20,shuffleMoves:8,sweetAttempts:70,
    minForcedWrong:2,minMaxParked:3,minDeep:2,minAvgBlocks:.65
  };
  if(n<=4)return{
    maxFree:3,garageChance:.65,hiddenChance:.55,shuffleMoves:10,sweetAttempts:85,
    minForcedWrong:3,minMaxParked:3,minDeep:3,minAvgBlocks:.85
  };
  if(n<=7)return{
    maxFree:3,garageChance:.90,hiddenChance:.75,shuffleMoves:12,sweetAttempts:100,
    minForcedWrong:4,minMaxParked:3,minDeep:4,minAvgBlocks:1.00
  };
  if(n<=12)return{
    maxFree:2,garageChance:1,hiddenChance:.88,shuffleMoves:14,sweetAttempts:115,
    minForcedWrong:5,minMaxParked:3,minDeep:5,minAvgBlocks:1.20
  };
  return{
    maxFree:2,garageChance:1,hiddenChance:.95,shuffleMoves:16,sweetAttempts:130,
    minForcedWrong:6,minMaxParked:3,minDeep:6,minAvgBlocks:1.35
  };
}
'''
s=replace_function_block(s,'function difficultyProfile(n){','function allGeneratedTrucks(gen){',difficulty)

hard_sweets=r'''function buildHardSweetRows(gen,r,n){
  const profile=difficultyProfile(n);
  let best=null;
  const order=[...gen.order];

  for(let attempt=0;attempt<profile.sweetAttempts;attempt++){
    let ids=[...order];

    // Phase-shift the sweets away from the truck-release order so several
    // legal truck choices occupy bays without immediately receiving sweets.
    if(ids.length>4){
      const maxShift=Math.min(7,ids.length-2);
      const shift=1+rint(r,0,maxShift-1);
      ids=ids.slice(shift).concat(ids.slice(0,shift));
    }

    if(attempt%5===4){
      for(let i=ids.length-1;i>0;i--){
        const j=Math.floor(r()*(i+1));
        [ids[i],ids[j]]=[ids[j],ids[i]];
      }
    }else{
      const moves=profile.shuffleMoves+rint(r,2,5);
      for(let m=0;m<moves;m++){
        if(ids.length<4)break;
        const from=rint(r,1,ids.length-1);
        const reach=Math.min(8,from);
        const to=Math.max(0,from-rint(r,1,Math.max(1,reach)));
        const [id]=ids.splice(from,1);
        ids.splice(to,0,id);
      }
    }

    const rows=rowsForTruckOrder(gen,ids);
    const result=simulateParkingRows(gen,rows);
    if(!result.solvable)continue;
    const score=result.maxParked*8+result.forcedWrong*4;
    if(!best||score>best.score)best={rows,result,score};
  }

  if(!best)return null;
  if(best.result.maxParked<profile.minMaxParked)return null;
  if(best.result.forcedWrong<profile.minForcedWrong)return null;
  return best;
}
'''
s=replace_function_block(s,'function buildHardSweetRows(gen,r,n){','function applyHiddenTruckColours(gen,r,n){',hard_sweets)

cluster=r'''function buildRandomCluster(n,R,relaxed=false){
  const count=Math.min((relaxed?17:18)+Math.floor(n*.25),21),trucks=[];
  const cx=JAM.x+JAM.w/2,cy=JAM.y+JAM.h/2;

  for(let i=0;i<count;i++){
    let placed=false;
    for(let k=0;k<520&&!placed;k++){
      const kind=R()<.20?2:R()<.58?1:0;
      const length=[48,59,72][kind],width=[25,27,29][kind];
      const x=rint(R,JAM.x+34,JAM.x+JAM.w-34);
      const y=rint(R,JAM.y+34,JAM.y+JAM.h-34);

      // Many more trucks point across or back into the pile. The solver still
      // proves a valid removal order, but the yard gains real blocker chains.
      const unit=Math.PI/4;
      const outward=Math.round(Math.atan2(y-cy,x-cx)/unit)*unit;
      const roll=R();
      const straightChance=n<=2?.48:n<=7?.34:.24;
      const sideChance=n<=2?.30:n<=7?.30:.28;
      const crossChance=n<=2?.16:n<=7?.22:.25;
      let twist=0;
      if(roll>straightChance){
        const sign=R()<.5?-1:1;
        if(roll<straightChance+sideChance)twist=sign;
        else if(roll<straightChance+sideChance+crossChance)twist=sign*2;
        else twist=sign*(R()<.72?3:4);
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
'''
s=replace_function_block(s,'function buildRandomCluster(n,R,relaxed=false){','function finishGeneratedCluster(',cluster)

finishing=r'''function layoutDifficultyMetrics(trucks){
  const counts=trucks.map(t=>t._blockCount||0);
  return{
    deep2:counts.filter(v=>v>=2).length,
    deep3:counts.filter(v=>v>=3).length,
    avg:counts.length?counts.reduce((a,b)=>a+b,0)/counts.length:0
  };
}
function finishGeneratedCluster(trucks,order,R,n,relaxed=false){
  for(const t of trucks)t._blockCount=blockingTruckIds(t,trucks).length;
  const profile=difficultyProfile(n);
  const metrics=layoutDifficultyMetrics(trucks);
  const initialFree=initialClearCount(trucks);

  const freeLimit=profile.maxFree+(relaxed?1:0);
  const minDeep=Math.max(1,Math.floor(profile.minDeep*(relaxed?.72:1)));
  const minAvg=profile.minAvgBlocks*(relaxed?.78:1);
  if(initialFree<2||initialFree>freeLimit)return null;
  if(metrics.deep2<minDeep||metrics.avg<minAvg)return null;

  const gen={trucks,order:[...order],garage:null,sweetRows:[]};
  if(!addUndergroundGarage(gen,R,n))return null;
  assignChallengeColors(gen,R,n);
  const sweet=buildHardSweetRows(gen,R,n);
  if(!sweet)return null;

  const wrongFloor=Math.max(1,profile.minForcedWrong-(relaxed?1:0));
  const parkedFloor=Math.max(2,profile.minMaxParked-(relaxed?1:0));
  if(sweet.result.forcedWrong<wrongFloor||sweet.result.maxParked<parkedFloor)return null;

  gen.sweetRows=sweet.rows;
  gen.difficulty={
    maxParked:sweet.result.maxParked,
    forcedWrong:sweet.result.forcedWrong,
    initialFree,
    deepBlockers:metrics.deep2,
    veryDeepBlockers:metrics.deep3,
    avgBlockers:+metrics.avg.toFixed(2),
    score:Math.round(sweet.score+metrics.deep2*3+metrics.deep3*4+(5-initialFree)*5+(gen.garage?8:0))
  };
  applyHiddenTruckColours(gen,R,n);
  return validateGeneratedLevel(gen)?gen:null;
}
function generateLevel(n){
  const profile=difficultyProfile(n);
  for(let attempt=0;attempt<34;attempt++){
    const R=rng(n*73471+attempt*977+19);
    const trucks=buildRandomCluster(n,R,false);
    if(!trucks)continue;
    const clear=initialClearCount(trucks);
    if(clear<2||clear>profile.maxFree)continue;
    const order=removalOrder(trucks,R);
    if(!order)continue;
    const gen=finishGeneratedCluster(trucks,order,R,n,false);
    if(gen)return gen;
  }
  return fallbackLevel(n);
}
function fallbackLevel(n){
  for(let attempt=0;attempt<110;attempt++){
    const R=rng(n*191+attempt*1297+401);
    const trucks=buildRandomCluster(n,R,true);
    if(!trucks)continue;
    const clear=initialClearCount(trucks);
    if(clear<2||clear>difficultyProfile(n).maxFree+1)continue;
    const order=removalOrder(trucks,R);
    if(!order)continue;
    const gen=finishGeneratedCluster(trucks,order,R,n,true);
    if(gen)return gen;
  }
  throw new Error('Unable to generate sufficiently difficult clustered level');
}
'''
s=replace_function_block(s,'function finishGeneratedCluster(','function makeQueue(gen){',finishing)

s=re.sub(
    r"const extra=n<7\?2:n<12\?rint\(r,2,3\):rint\(r,3,4\),queue=\[\];",
    "const extra=n<=2?2:n<=4?rint(r,2,3):n<=7?rint(r,3,4):n<=12?rint(r,4,5):rint(r,5,6),queue=[];",
    s,count=1
)
s=s.replace(
    "const maxHidden=n<5?2:n<8?4:n<13?6:8;let hidden=0;",
    "const maxHidden=n<=2?2:n<=4?4:n<=7?6:n<=12?8:10;let hidden=0;"
)

assert 'minForcedWrong:6' in s
assert 'const straightChance=n<=2?.48:n<=7?.34:.24;' in s
assert 'Unable to generate sufficiently difficult clustered level' in s
assert 'badgeAttachX:gen.garage.badgeAttachX' in s
assert 'const SWEET_RADIUS=7;' in s
assert 'const ROTATION_CAPACITY=144;' in s
assert 'const TRUCK_GAP=3;' in s

path.write_text(s)
Path('sweet-truck-jam/game59.js').write_text(s)

index=Path('sweet-truck-jam/index.html')
html=index.read_text()
html=re.sub(r'game(?:\d+)?\.js\?v=\d+','game59.js?v=59',html)
html=re.sub(r'style\.css\?v=\d+','style.css?v=59',html)
index.write_text(html)
