from pathlib import Path
import re

root=Path('sweet-truck-jam')
path=root/'game.js'
index=root/'index.html'
s=path.read_text()

def replace_block(text,start_marker,end_marker,replacement):
    a=text.index(start_marker)
    b=text.index(end_marker,a)
    return text[:a]+replacement+text[b:]

# --- Garage footprint is permanent collision geometry ---------------------
old_poly_end='''function polyOverlap(a,b,gap=TRUCK_GAP){
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],ex=q.x-p.x,ey=q.y-p.y,l=Math.hypot(ex,ey)||1,ax=-ey/l,ay=ex/l;
    const A=project(a,ax,ay),B=project(b,ax,ay);
    // Exactly 3 px of separation is legal. Anything closer counts as a
    // collision so settled yard trucks retain a visible three-pixel gap.
    if(A[1]<=B[0]-gap||B[1]<=A[0]-gap)return false;
  }
  return true;
}
'''
new_poly_end=old_poly_end+'''function garageFootprintPoly(g,pad=0){
  if(!g)return null;
  const proxy={length:g.length+pad*2,width:g.width+pad*2};
  return truckPoly(proxy,g.x,g.y,g.angle);
}
function garageForTruckSet(trucks,explicitGarage=null){
  if(explicitGarage)return explicitGarage;
  return state&&trucks===state.yard?state.garage:null;
}
function truckCrossesGarage(t,x,y,g,pad=0){
  // The currently surfaced garage truck is the only vehicle allowed to
  // occupy its own garage tile. Every other truck treats it as solid ground.
  if(!g||t.id===g.currentId)return false;
  return polyOverlap(truckPoly(t,x,y),garageFootprintPoly(g,pad),0);
}
'''
if old_poly_end not in s: raise SystemExit('polyOverlap block not found')
s=s.replace(old_poly_end,new_poly_end,1)

old_can='''function canDriveOut(t,trucks){
  const dx=Math.cos(t.angle),dy=Math.sin(t.angle),others=trucks.filter(o=>o.id!==t.id);
  for(let d=7;d<520;d+=7){const x=t.x+dx*d,y=t.y+dy*d,p=truckPoly(t,x,y);for(const o of others)if(polyOverlap(p,truckPoly(o)))return false;if(!insideJam(t,x,y))return true}
  return true;
}'''
new_can='''function canDriveOut(t,trucks,explicitGarage=null){
  const dx=Math.cos(t.angle),dy=Math.sin(t.angle),others=trucks.filter(o=>o.id!==t.id);
  const garage=garageForTruckSet(trucks,explicitGarage);
  for(let d=7;d<520;d+=7){
    const x=t.x+dx*d,y=t.y+dy*d,p=truckPoly(t,x,y);
    for(const o of others)if(polyOverlap(p,truckPoly(o)))return false;
    if(truckCrossesGarage(t,x,y,garage,TRUCK_GAP))return false;
    if(!insideJam(t,x,y))return true;
  }
  return true;
}'''
if old_can not in s: raise SystemExit('canDriveOut block not found')
s=s.replace(old_can,new_can,1)

old_pos='''function truckPositionLegal(t,x,y,trucks){
  if(!truckFullyInsideJam(t,x,y,4))return false;
  const p=truckPoly(t,x,y);
  for(const o of trucks){
    if(o.id===t.id)continue;
    if(polyOverlap(p,truckPoly(o)))return false;
  }
  return true;
}'''
new_pos='''function truckPositionLegal(t,x,y,trucks,explicitGarage=null){
  if(!truckFullyInsideJam(t,x,y,4))return false;
  const p=truckPoly(t,x,y);
  for(const o of trucks){
    if(o.id===t.id)continue;
    if(polyOverlap(p,truckPoly(o)))return false;
  }
  const garage=garageForTruckSet(trucks,explicitGarage);
  if(truckCrossesGarage(t,x,y,garage,TRUCK_GAP))return false;
  return true;
}'''
if old_pos not in s: raise SystemExit('truckPositionLegal block not found')
s=s.replace(old_pos,new_pos,1)

# Exact one-truck garage footprint, rather than an oversized visual-only tile.
s=s.replace('const hatchHL=host.length/2+5;\n  const hatchHW=host.width/2+6;',
            'const hatchHL=host.length/2;\n  const hatchHW=host.width/2;',1)

# Garages are no longer occasional on established levels.
s=s.replace('const forced=n>=6&&n%3===0;', 'const forced=n>=5;',1)

# More trucks remain underground on harder levels.
s=s.replace('const extra=n<4?2:n<7?rint(r,2,3):n<12?rint(r,3,4):rint(r,4,5),queue=[];',
            'const extra=n<4?2:n<7?rint(r,3,4):n<12?rint(r,4,5):rint(r,5,7),queue=[];',1)

# Stronger difficulty profile, still without hard score thresholds that can
# strand level generation. Later levels target very few initial choices.
difficulty=r'''function difficultyProfile(n){
  if(n<=2)return{maxFree:5,garageChance:.35,hiddenChance:.30,shuffleMoves:12,sweetAttempts:64};
  if(n<=4)return{maxFree:4,garageChance:.72,hiddenChance:.55,shuffleMoves:16,sweetAttempts:76};
  if(n<=7)return{maxFree:3,garageChance:1,hiddenChance:.72,shuffleMoves:20,sweetAttempts:88};
  if(n<=12)return{maxFree:3,garageChance:1,hiddenChance:.84,shuffleMoves:24,sweetAttempts:100};
  return{maxFree:2,garageChance:1,hiddenChance:.92,shuffleMoves:28,sweetAttempts:112};
}
'''
s=replace_block(s,'function difficultyProfile(n){','function allGeneratedTrucks(gen){',difficulty)

# Make high parking pressure dominate the sweet-order search while still only
# choosing sequences already approved by simulateParkingRows().
old_score='const score=result.maxParked*120+result.forcedWrong*12+earlyMissing*28+runStats.singleRows*1.4+runStats.smallBlocks*5;'
new_score='''const slotPressure=result.maxParked>=4?900:result.maxParked*210;
    const score=slotPressure+result.forcedWrong*26+earlyMissing*70+runStats.singleRows*1.2+runStats.smallBlocks*4;'''
if old_score not in s: raise SystemExit('sweet difficulty score not found')
s=s.replace(old_score,new_score,1)

# Store the initial number of genuinely drivable trucks after the garage has
# become an obstacle, rather than the old pre-garage clear count.
s=s.replace('gen.sweetRows=sweet.rows;gen.difficulty={maxParked:sweet.result.maxParked,forcedWrong:sweet.result.forcedWrong,initialFree:initialClearCount(trucks)};',
            'gen.sweetRows=sweet.rows;gen.difficulty={maxParked:sweet.result.maxParked,forcedWrong:sweet.result.forcedWrong,initialFree:trucks.filter(t=>canDriveOut(t,trucks,gen.garage)).length};',1)

# Search more valid layouts, and heavily reward deep blocker chains and garage
# pressure. This ranks valid levels; it does not introduce a brittle minimum.
generate=r'''function generateLevel(n){
  const profile=difficultyProfile(n);
  let best=null,validFound=0;
  for(let attempt=0;attempt<42;attempt++){
    const R=rng(n*73471+attempt*977+19),trucks=buildRandomCluster(n,R,false);if(!trucks)continue;
    const clear=initialClearCount(trucks);if(clear<2||clear>profile.maxFree)continue;
    const order=removalOrder(trucks,R);if(!order)continue;
    const gen=finishGeneratedCluster(trucks,order,R,n);if(!gen)continue;

    const blockTotal=trucks.reduce((sum,t)=>sum+(t._blockCount||0),0);
    const deep=trucks.filter(t=>(t._blockCount||0)>=2).length;
    const veryDeep=trucks.filter(t=>(t._blockCount||0)>=3).length;
    const d=gen.difficulty||{};
    const actualFree=d.initialFree??clear;
    const score=(6-actualFree)*75+(d.maxParked||0)*180+(d.forcedWrong||0)*24+blockTotal*3+deep*35+veryDeep*60+(gen.garage?140:0);
    if(!best||score>best.score)best={gen,score};
    validFound++;
    if(validFound>=7)break;
  }
  return best?best.gen:fallbackLevel(n);
}
'''
s=replace_block(s,'function generateLevel(n){','function fallbackLevel(n){',generate)

# Validation must respect the permanent garage tile as each successive garage
# truck is surfaced. The local currentId changes during the simulated solve.
old_validate='''  const remaining=gen.trucks.map(t=>({...t})),underground=gen.garage?gen.garage.queue.map(t=>({...t})):[];let garageCurrent=gen.garage?.currentId||null;
  for(const id of gen.order){
    const idx=remaining.findIndex(t=>t.id===id);if(idx<0||!canDriveOut(remaining[idx],remaining))return false;
    const removed=remaining[idx];remaining.splice(idx,1);
    if(garageCurrent&&removed.id===garageCurrent){
      const next=underground.shift();if(next){next.x=gen.garage.x;next.y=gen.garage.y;next.angle=gen.garage.angle;remaining.push(next);garageCurrent=next.id}else garageCurrent=null;
    }
  }'''
new_validate='''  const remaining=gen.trucks.map(t=>({...t})),underground=gen.garage?gen.garage.queue.map(t=>({...t})):[];let garageCurrent=gen.garage?.currentId||null;
  for(const id of gen.order){
    const activeGarage=gen.garage?{...gen.garage,currentId:garageCurrent}:null;
    const idx=remaining.findIndex(t=>t.id===id);if(idx<0||!canDriveOut(remaining[idx],remaining,activeGarage))return false;
    const removed=remaining[idx];remaining.splice(idx,1);
    if(garageCurrent&&removed.id===garageCurrent){
      const next=underground.shift();if(next){next.x=gen.garage.x;next.y=gen.garage.y;next.angle=gen.garage.angle;remaining.push(next);garageCurrent=next.id}else garageCurrent=null;
    }
  }'''
if old_validate not in s: raise SystemExit('validate garage simulation block not found')
s=s.replace(old_validate,new_validate,1)

# The garage tile remains drawn permanently. Only the counter disappears once
# there is no current/queued garage truck.
s=s.replace("  if(!g||(!g.currentId&&g.queue.length===0))return;\n  ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);\n  roundedRect(-g.length/2-5,-g.width/2-6,g.length+10,g.width+12,7,'#2d3540','#f3c64c',2);",
            "  if(!g)return;\n  ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);\n  roundedRect(-g.length/2,-g.width/2,g.length,g.width,7,'#2d3540','#f3c64c',2);",1)
s=s.replace("  ctx.restore();\n  const remaining=g.queue.length;\n  const bx=g.badgeX", "  ctx.restore();\n  if(!g.currentId&&g.queue.length===0)return;\n  const remaining=g.queue.length;\n  const bx=g.badgeX",1)

# A blocked truck can bump toward the garage but must stop before its body ever
# overlaps the garage footprint.
blocked=r'''function blockedTravelDistance(t,trucks){
  const dx=Math.cos(t.angle),dy=Math.sin(t.angle),others=trucks.filter(o=>o.id!==t.id);
  const garage=garageForTruckSet(trucks);
  let lastSafe=0;
  for(let d=3;d<520;d+=3){
    const x=t.x+dx*d,y=t.y+dy*d,p=truckPoly(t,x,y);
    if(others.some(o=>polyOverlap(p,truckPoly(o))))return Math.max(3,lastSafe||d-3);
    if(truckCrossesGarage(t,x,y,garage,0))return Math.max(3,lastSafe);
    if(!insideJam(t,x,y))return null;
    lastSafe=d;
  }
  return null;
}
'''
s=replace_block(s,'function blockedTravelDistance(t,trucks){','function blockedBump(t){',blocked)

assert 'const forced=n>=5;' in s
assert 'truckCrossesGarage' in s
assert 'result.maxParked>=4?900' in s
assert 'validFound>=7' in s
assert 'const SWEET_RADIUS=7;' in s
assert 'const ROTATION_CAPACITY=144;' in s
assert 'FEED_VISIBLE_MARGIN' in s

path.write_text(s)
(root/'game66.js').write_text(s)

html=index.read_text()
html=re.sub(r'style\.css\?v=\d+','style.css?v=66',html)
html=re.sub(r'game\d+\.js\?v=\d+','game66.js?v=66',html)
index.write_text(html)
