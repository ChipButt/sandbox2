from pathlib import Path
import re

path = Path('sweet-truck-jam/game.js')
s = path.read_text()


def replace_block(text, start_marker, end_marker, replacement):
    a = text.index(start_marker)
    b = text.index(end_marker, a)
    return text[:a] + replacement + text[b:]


difficulty = r'''function difficultyProfile(n){
  // Keep the proven cluster-generator limits, but make the puzzle pressure
  // substantially stronger through colour uncertainty and sweet sequencing.
  if(n<=2)return{maxFree:5,garageChance:.32,hiddenChance:.28,shuffleMoves:10,sweetAttempts:48};
  if(n<=4)return{maxFree:5,garageChance:.50,hiddenChance:.48,shuffleMoves:12,sweetAttempts:56};
  if(n<=7)return{maxFree:4,garageChance:.68,hiddenChance:.64,shuffleMoves:14,sweetAttempts:64};
  if(n<=12)return{maxFree:4,garageChance:.78,hiddenChance:.74,shuffleMoves:16,sweetAttempts:72};
  return{maxFree:4,garageChance:.86,hiddenChance:.82,shuffleMoves:18,sweetAttempts:80};
}
'''
s = replace_block(s, 'function difficultyProfile(n){', 'function allGeneratedTrucks(gen){', difficulty)

assign = r'''function assignChallengeColors(gen,r,n){
  const physical=gen.trucks,all=allGeneratedTrucks(gen);
  const palette=COLOR_NAMES.slice(0,Math.min(5+Math.floor((n+2)/3),8));
  const freeIds=new Set(physical.filter(t=>canDriveOut(t,physical)).map(t=>t.id));
  const freePalette=palette.slice(0,Math.min(3,palette.length));
  const blockedPalette=palette.slice(Math.max(0,palette.length-Math.min(3,palette.length)));

  // Exposed trucks mostly use one part of the palette while deeply blocked
  // trucks favour another. The sweet sequencer can then put blocked colours
  // early without accidentally feeding every immediately-selectable truck.
  for(const t of physical){
    const blocks=t._blockCount||0;
    if(freeIds.has(t.id))t.color=choice(r,freePalette);
    else if(blocks>=2)t.color=choice(r,blockedPalette);
    else t.color=choice(r,palette);
  }
  if(gen.garage){
    for(const t of gen.garage.queue)t.color=choice(r,palette);
  }

  // Guarantee at least one deeply blocked truck uses a colour outside the
  // exposed-truck palette whenever the palette is large enough.
  const deep=physical.filter(t=>!freeIds.has(t.id)&&(t._blockCount||0)>=2)
    .sort((a,b)=>(b._blockCount||0)-(a._blockCount||0));
  const reserved=palette.filter(c=>!freePalette.includes(c));
  if(deep.length&&reserved.length)deep[0].color=choice(r,reserved);
}
'''
s = replace_block(s, 'function assignChallengeColors(gen,r,n){', 'function rowsForTruckOrder(gen,idOrder){', assign)

hard = r'''function buildHardSweetRows(gen,r,n){
  const profile=difficultyProfile(n);
  const by=new Map(allGeneratedTrucks(gen).map(t=>[t.id,t]));
  const baseIds=[...gen.order];
  const baseRows=rowsForTruckOrder(gen,baseIds);
  const baseResult=simulateParkingRows(gen,baseRows);
  let best=baseResult.solvable?{rows:baseRows,result:baseResult,score:-1}:null;

  const attempts=profile.sweetAttempts||48;
  for(let attempt=0;attempt<attempts;attempt++){
    let ids=[...baseIds];

    if(attempt%4===0){
      // Pull deeply blocked trucks toward the front of the sweet supply. Add
      // seeded noise so equal-depth trucks do not form a repetitive pattern.
      ids=ids
        .map((id,i)=>({id,i,rank:(by.get(id)?._blockCount||0)*100+r()*35}))
        .sort((a,b)=>b.rank-a.rank||a.i-b.i)
        .map(x=>x.id);
    }else if(attempt%4===1){
      // Full shuffles discover high-pressure but still solver-approved orders.
      for(let i=ids.length-1;i>0;i--){
        const j=Math.floor(r()*(i+1));
        [ids[i],ids[j]]=[ids[j],ids[i]];
      }
    }else{
      // Start from the intended release order, phase shift it, then make many
      // local forward jumps. This produces coherent-looking difficult queues.
      if(ids.length>4){
        const shift=rint(r,1,Math.min(7,ids.length-2));
        ids=ids.slice(shift).concat(ids.slice(0,shift));
      }
      const moves=profile.shuffleMoves+rint(r,2,5);
      for(let m=0;m<moves;m++){
        if(ids.length<4)break;
        const from=rint(r,1,ids.length-1);
        const jump=rint(r,1,Math.min(8,from));
        const [id]=ids.splice(from,1);
        ids.splice(Math.max(0,from-jump),0,id);
      }
    }

    const rows=rowsForTruckOrder(gen,ids);
    const result=simulateParkingRows(gen,rows);
    if(!result.solvable)continue;

    // Reward exactly the things the player experiences as pressure: parking
    // slots tied up, removable trucks whose colour is not yet represented on
    // the loop, and repeated wrong-colour commitments.
    const window=new Set(rows.slice(0,LOOP_ROWS));
    const early=baseIds.slice(0,Math.min(4,baseIds.length));
    let earlyMissing=0;
    for(const id of early){
      const t=by.get(id);
      if(t&&!window.has(t.color))earlyMissing++;
    }
    const score=result.maxParked*120+result.forcedWrong*12+earlyMissing*28;
    if(!best||score>best.score)best={rows,result,score};
  }

  return best;
}
'''
s = replace_block(s, 'function buildHardSweetRows(gen,r,n){', 'function applyHiddenTruckColours(gen,r,n){', hard)

# Let more deeply blocked trucks stay unknown, but only trucks that already
# satisfy the existing >=2-blocker rule are eligible.
s = s.replace(
    'const maxHidden=n<5?2:n<8?4:n<13?6:8;let hidden=0;',
    'const maxHidden=n<5?3:n<8?5:n<13?7:9;let hidden=0;',
    1
)

# Garage queues add uncertainty without changing the proven garage mechanics.
s = re.sub(
    r"const extra=n<7\?2:n<12\?rint\(r,2,3\):rint\(r,3,4\),queue=\[\];",
    "const extra=n<4?2:n<7?rint(r,2,3):n<12?rint(r,3,4):rint(r,4,5),queue=[];",
    s,
    count=1
)

# Do not reject layouts more aggressively. Instead, sample several already
# valid layouts and choose the hardest of them. If none are found, the existing
# fallback remains unchanged.
generate = r'''function generateLevel(n){
  const profile=difficultyProfile(n);
  let best=null,validFound=0;
  for(let attempt=0;attempt<24;attempt++){
    const R=rng(n*73471+attempt*977+19),trucks=buildRandomCluster(n,R,false);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<2||clear>profile.maxFree)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=finishGeneratedCluster(trucks,order,R,n);if(!gen)continue;

    const blockTotal=trucks.reduce((sum,t)=>sum+(t._blockCount||0),0);
    const d=gen.difficulty||{};
    const score=(7-clear)*22+(d.maxParked||0)*90+(d.forcedWrong||0)*10+blockTotal+(gen.garage?12:0);
    if(!best||score>best.score)best={gen,score};
    validFound++;
    if(validFound>=4)break;
  }
  return best?best.gen:fallbackLevel(n);
}
'''
s = replace_block(s, 'function generateLevel(n){', 'function fallbackLevel(n){', generate)

assert 'sweetAttempts:80' in s
assert 'result.maxParked*120' in s
assert 'validFound>=4' in s
assert 'badgeAttachX:gen.garage.badgeAttachX' in s
assert 'const SWEET_RADIUS=7;' in s
assert 'const ROTATION_CAPACITY=144;' in s
assert 'const TRUCK_GAP=3;' in s

path.write_text(s)
Path('sweet-truck-jam/game61.js').write_text(s)

index=Path('sweet-truck-jam/index.html')
html=index.read_text()
html=re.sub(r'game(?:\d+)?\.js\?v=\d+','game61.js?v=61',html)
html=re.sub(r'style\.css\?v=\d+','style.css?v=61',html)
index.write_text(html)
