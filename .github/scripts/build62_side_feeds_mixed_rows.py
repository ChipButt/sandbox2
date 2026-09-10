from pathlib import Path
import re

path=Path('sweet-truck-jam/game.js')
s=path.read_text()

assert 'game61' not in s  # game.js is source, not the cache-busting wrapper
assert 'const SWEET_RADIUS=7;' in s
assert 'const ROTATION_CAPACITY=144;' in s
assert 'function buildHardSweetRows(gen,r,n){' in s
assert 'function drawCrowdTrack(){' in s

# Limit the feeder preview to five upcoming rows. The remaining rows are
# conceptually still inside the off-screen side tubes.
if 'const FEED_VISIBLE_ROWS=5;' not in s:
    s=s.replace('const FEED_CORNER_RADIUS=42;','const FEED_CORNER_RADIUS=42;\nconst FEED_VISIBLE_ROWS=5;')

# Replace the old up-then-around feeder path with straight side-entry tubes.
a=s.index('function feederGeometry(side){')
b=s.index('function feederRowPos(side,rowVisual,col){',a)
side_feeders=r'''function feederGeometry(side){
  const join=loopPose(side==='left'?LEFT_JOIN_ROW:RIGHT_JOIN_ROW,0);
  const outerX=side==='left'?-12:W+12;
  const mouth={x:side==='left'?join.x-43:join.x+43,y:join.y};
  return{join,outerX,mouth};
}
function feederRowPose(side,rowVisual){
  const g=feederGeometry(side);
  const d=Math.max(0,rowVisual*FEED_ROW_SPACING);
  return{
    x:side==='left'?g.mouth.x-d:g.mouth.x+d,
    y:g.mouth.y,
    tx:side==='left'?1:-1,
    ty:0,
    nx:0,
    ny:1
  };
}
'''
s=s[:a]+side_feeders+s[b:]

# Mix row colours at the row level instead of keeping every truck's full
# capacity as one solid block. Most runs are single rows, with occasional
# deliberate runs of 2-5 rows. Counts are unchanged.
mixer=r'''function mixSweetRowColours(rows,r){
  const counts=new Map();
  for(const color of rows)counts.set(color,(counts.get(color)||0)+1);
  const out=[];
  let last=null,runsSinceBlock=0;

  function chooseWeighted(entries){
    // Bias toward colours with the most rows left so no single colour is
    // stranded as one huge block at the end, while retaining seed variety.
    const ranked=entries
      .map(([color,count])=>({color,count,rank:count+r()*Math.max(2,count*.35)}))
      .sort((a,b)=>b.rank-a.rank)
      .slice(0,Math.min(3,entries.length));
    const total=ranked.reduce((sum,x)=>sum+x.count,0);
    let roll=r()*total;
    for(const x of ranked){roll-=x.count;if(roll<=0)return x.color}
    return ranked[ranked.length-1].color;
  }

  while(out.length<rows.length){
    const remaining=[...counts.entries()].filter(([,count])=>count>0);
    if(!remaining.length)break;

    let choices=remaining.filter(([color])=>color!==last);
    if(!choices.length)choices=remaining;
    const color=chooseWeighted(choices);
    const available=counts.get(color)||0;

    // Roughly 70% of runs are single rows. Small blocks are sprinkled in,
    // and after several singles we deliberately insert a 2-5-row run.
    let run;
    const roll=r();
    if(runsSinceBlock>=5&&available>=2){
      run=2+rint(r,0,Math.min(3,available-2));
    }else if(roll<.70)run=1;
    else if(roll<.89)run=2;
    else if(roll<.96)run=3;
    else if(roll<.99)run=4;
    else run=5;
    run=Math.max(1,Math.min(5,available,run));

    for(let i=0;i<run;i++)out.push(color);
    counts.set(color,available-run);
    last=color;
    runsSinceBlock=run===1?runsSinceBlock+1:0;
  }

  return out;
}
function colourRunStats(rows){
  if(!rows.length)return{maxRun:0,singleRows:0,smallBlocks:0};
  let maxRun=0,singleRows=0,smallBlocks=0;
  for(let i=0;i<rows.length;){
    let j=i+1;while(j<rows.length&&rows[j]===rows[i])j++;
    const len=j-i;maxRun=Math.max(maxRun,len);
    if(len===1)singleRows++;
    else if(len<=5)smallBlocks++;
    i=j;
  }
  return{maxRun,singleRows,smallBlocks};
}
'''
insert=s.index('function buildHardSweetRows(gen,r,n){')
s=s[:insert]+mixer+s[insert:]

# Make the baseline and every candidate use the mixed row representation.
old="""  const baseRows=rowsForTruckOrder(gen,baseIds);\n  const baseResult=simulateParkingRows(gen,baseRows);\n  let best=baseResult.solvable?{rows:baseRows,result:baseResult,score:-1}:null;"""
new="""  const originalBaseRows=rowsForTruckOrder(gen,baseIds);\n  const mixedBaseRows=mixSweetRowColours(originalBaseRows,r);\n  const mixedBaseResult=simulateParkingRows(gen,mixedBaseRows);\n  const originalBaseResult=simulateParkingRows(gen,originalBaseRows);\n  let best=mixedBaseResult.solvable?{rows:mixedBaseRows,result:mixedBaseResult,score:-1}:null;\n  const emergency=originalBaseResult.solvable?{rows:originalBaseRows,result:originalBaseResult,score:-999999}:null;"""
assert old in s
s=s.replace(old,new,1)

old2="""    const rows=rowsForTruckOrder(gen,ids);\n    const result=simulateParkingRows(gen,rows);\n    if(!result.solvable)continue;"""
new2="""    const rows=mixSweetRowColours(rowsForTruckOrder(gen,ids),r);\n    const runStats=colourRunStats(rows);\n    if(runStats.maxRun>5)continue;\n    if(rows.length>=24&&runStats.smallBlocks<2)continue;\n    const result=simulateParkingRows(gen,rows);\n    if(!result.solvable)continue;"""
assert old2 in s
s=s.replace(old2,new2,1)

old3='    const score=result.maxParked*120+result.forcedWrong*12+earlyMissing*28;'
new3='    const score=result.maxParked*120+result.forcedWrong*12+earlyMissing*28+runStats.singleRows*1.4+runStats.smallBlocks*5;'
assert old3 in s
s=s.replace(old3,new3,1)

old4='  return best;\n}\nfunction applyHiddenTruckColours'
new4='  return best||emergency;\n}\nfunction applyHiddenTruckColours'
assert old4 in s
s=s.replace(old4,new4,1)

# Only render a short preview from each side feeder. Rows deeper than this are
# off-screen/inside the tube and become visible only as they advance.
old5="""    // One shared visual-row position for all four sweets. No per-sweet feeder motion.\n    for(let col=0;col<4;col++){\n      const p=feederRowPos(side,leader.feedVisualRow,col);\n      drawSweetAt(p,row[col].color,SWEET_RADIUS);\n    }"""
new5="""    // One shared visual-row position for all four sweets. Only the nearest\n    // five rows are visible; the rest stay hidden in the off-screen side tube.\n    if(leader.feedVisualRow<FEED_VISIBLE_ROWS){\n      for(let col=0;col<4;col++){\n        const p=feederRowPos(side,leader.feedVisualRow,col);\n        drawSweetAt(p,row[col].color,SWEET_RADIUS);\n      }\n    }"""
assert old5 in s
s=s.replace(old5,new5,1)

# Replace the visible feeder track: no vertical/top section, only horizontal
# tubes entering from the left and right edges and joining the central loop.
a=s.index('function drawCrowdTrack(){')
b=s.index('function drawParkingApron(){',a)
track=r'''function drawCrowdTrack(){
  ctx.save();
  ctx.lineJoin='round';
  ctx.lineCap='butt';

  // Top-up tubes now enter only from the screen sides. Nothing wraps down
  // from above, so the player only sees the few rows nearest each junction.
  for(const side of ['left','right']){
    const g=feederGeometry(side);
    const target=loopPose(side==='left'?LEFT_JOIN_ROW:RIGHT_JOIN_ROW,0);
    const c1={x:g.mouth.x+(side==='left'?28:-28),y:g.mouth.y};
    const c2={x:target.x-target.tx*30,y:target.y-target.ty*30};
    const edgeX=side==='left'?-80:W+80;

    for(const stroke of [
      {w:68,c:'#aebbc4'},
      {w:62,c:'#f7fafc'},
      {w:56,c:'#d6e0e6'}
    ]){
      ctx.beginPath();
      ctx.moveTo(edgeX,g.mouth.y);
      ctx.lineTo(g.mouth.x,g.mouth.y);
      ctx.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,target.x,target.y);
      ctx.strokeStyle=stroke.c;ctx.lineWidth=stroke.w;ctx.stroke();
    }
  }

  ctx.lineCap='round';
  for(const stroke of [
    {w:72,c:'#aebbc4'},
    {w:66,c:'#f7fafc'},
    {w:60,c:'#d6e0e6'}
  ]){
    ctx.beginPath();
    candyPath.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle=stroke.c;ctx.lineWidth=stroke.w;ctx.stroke();
  }

  const outlet=loopPose(OUTLET_ROW,0);
  for(const stroke of [
    {w:72,c:'#aebbc4'},
    {w:66,c:'#f7fafc'},
    {w:60,c:'#778798'}
  ]){
    ctx.beginPath();
    ctx.moveTo(outlet.x,outlet.y);
    ctx.bezierCurveTo(outlet.x,315,LOAD_MOUTH.x,330,LOAD_MOUTH.x,350);
    ctx.strokeStyle=stroke.c;ctx.lineWidth=stroke.w;ctx.stroke();
  }
  ctx.restore();
}
'''
s=s[:a]+track+s[b:]

assert 'const FEED_VISIBLE_ROWS=5;' in s
assert 'function mixSweetRowColours(rows,r){' in s
assert 'if(runStats.maxRun>5)continue;' in s
assert "ctx.moveTo(edgeX,g.mouth.y);" in s
assert "ctx.moveTo(g.outerX,-100);" not in s
assert 'const SWEET_RADIUS=7;' in s
assert 'const ROTATION_CAPACITY=144;' in s
assert 'badgeAttachX:gen.garage.badgeAttachX' in s

path.write_text(s)
Path('sweet-truck-jam/game62.js').write_text(s)

index=Path('sweet-truck-jam/index.html')
html=index.read_text()
html=re.sub(r'game(?:\d+)?\.js\?v=\d+','game62.js?v=62',html)
html=re.sub(r'style\.css\?v=\d+','style.css?v=62',html)
index.write_text(html)
