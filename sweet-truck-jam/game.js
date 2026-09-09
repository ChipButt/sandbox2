(() => {
'use strict';

const W=420,H=900;
const JAM={x:24,y:510,w:372,h:300};
const SLOT_Y=423;
const COLORS={
  red:'#ef4055', blue:'#2f85e8', green:'#43bf62', yellow:'#ffd128', purple:'#a858dc',
  cyan:'#32c7d8', orange:'#f18a32', pink:'#ef65ad', brown:'#88502f'
};
const COLOR_NAMES=Object.keys(COLORS);
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const toast=document.getElementById('toast');
const overlay=document.getElementById('overlay');
const overlayBadge=document.getElementById('overlayBadge');
const overlayTitle=document.getElementById('overlayTitle');
const overlayText=document.getElementById('overlayText');
const overlayPrimary=document.getElementById('overlayPrimary');
const overlaySecondary=document.getElementById('overlaySecondary');

let dpr=1,scale=1,ox=0,oy=0,last=0,level=1,state=null,toastTimer=0;
let candyPath=[];
const ROTATION_CAPACITY=144;
const ROTATION_COLS=4;
const FEEDER_COLS=4;
const ROTATION_SPEED_ROWS=4.0;
const LOOP_ROWS=ROTATION_CAPACITY/ROTATION_COLS;
if(LOOP_ROWS>36)throw new Error('Central rotation may not exceed 36 rows');
const LEFT_JOIN_ROW=4;
const RIGHT_JOIN_ROW=21;
const OUTLET_ROW=13;
const OUTLET_SOURCE_ROW=(OUTLET_ROW-1+LOOP_ROWS)%LOOP_ROWS;
const LOAD_MOUTH={x:210,y:344};
const SWEET_RADIUS=7;
const CENTRAL_LANE_SPACING=13.2;
const FEED_LANE_SPACING=13.0;
const FEED_ROW_SPACING=14.5;
const FEED_CORNER_RADIUS=42;
const pointer={x:0,y:0};

function resize(){
  const r=canvas.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2.5);
  canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr);
  const sx=r.width/W, sy=r.height/H; scale=Math.min(sx,sy); ox=(r.width-W*scale)/2; oy=(r.height-H*scale)/2;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
}
addEventListener('resize',resize,{passive:true}); resize();

function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function rint(r,a,b){return Math.floor(r()*(b-a+1))+a}
function choice(r,a){return a[Math.floor(r()*a.length)]}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function ease(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2}
function easeOut(t){return 1-Math.pow(1-t,3)}
function angleLerp(a,b,t){let d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t}
function dist2(a,b){const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy}

function roundedRect(x,y,w,h,r,fill,stroke,line=1){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke()}
}
function text(s,x,y,size,fill='#fff',align='center',weight=900){ctx.fillStyle=fill;ctx.textAlign=align;ctx.textBaseline='middle';ctx.font=`${weight} ${size}px ui-rounded,system-ui,-apple-system`;ctx.fillText(s,x,y)}

function makeCandyPath(){
  // User-authored loop, with conveyor-style rounded motion through each
  // vertex. The supplied vertices still define the layout; only a short
  // tangent section around each corner is replaced by a smooth turn.
  const vertices=[
    {x:128.3,y:158.9},
    {x:130,y:280},
    {x:180,y:320},
    {x:280,y:320},
    {x:310,y:300},
    {x:310,y:190},
    {x:260,y:160},
    {x:220,y:120},
    {x:160,y:110}
  ];

  const cornerCut=22;
  const n=vertices.length;
  const corners=[];

  function unit(a,b){
    const dx=b.x-a.x,dy=b.y-a.y;
    const d=Math.hypot(dx,dy)||1;
    return{x:dx/d,y:dy/d,d};
  }

  for(let i=0;i<n;i++){
    const prev=vertices[(i-1+n)%n];
    const curr=vertices[i];
    const next=vertices[(i+1)%n];

    const incoming=unit(prev,curr);
    const outgoing=unit(curr,next);

    const cut=Math.min(
      cornerCut,
      incoming.d*.32,
      outgoing.d*.32
    );

    corners.push({
      vertex:curr,
      enter:{
        x:curr.x-incoming.x*cut,
        y:curr.y-incoming.y*cut
      },
      exit:{
        x:curr.x+outgoing.x*cut,
        y:curr.y+outgoing.y*cut
      }
    });
  }

  const raw=[];

  function addLine(a,b){
    const len=Math.hypot(b.x-a.x,b.y-a.y);
    const steps=Math.max(2,Math.ceil(len/2.5));
    for(let i=0;i<steps;i++){
      const t=i/steps;
      raw.push({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
    }
  }

  function addCorner(a,c,b){
    const approx=Math.hypot(c.x-a.x,c.y-a.y)+Math.hypot(b.x-c.x,b.y-c.y);
    const steps=Math.max(10,Math.ceil(approx/1.5));
    for(let i=0;i<steps;i++){
      const t=i/steps,q=1-t;
      raw.push({
        x:q*q*a.x+2*q*t*c.x+t*t*b.x,
        y:q*q*a.y+2*q*t*c.y+t*t*b.y
      });
    }
  }

  for(let i=0;i<n;i++){
    const current=corners[i];
    const next=corners[(i+1)%n];

    addCorner(current.enter,current.vertex,current.exit);
    addLine(current.exit,next.enter);
  }
  raw.push({...raw[0]});

  // Uniform arc-length resampling makes the belt speed physically constant
  // through both straights and bends.
  const cumulative=[0];
  for(let i=1;i<raw.length;i++){
    cumulative.push(cumulative[i-1]+Math.hypot(raw[i].x-raw[i-1].x,raw[i].y-raw[i-1].y));
  }

  const total=cumulative[cumulative.length-1];
  const dense=[];
  const sampleCount=540;
  let cursor=1;

  for(let i=0;i<sampleCount;i++){
    const target=i/(sampleCount-1)*total;
    while(cursor<cumulative.length-1&&cumulative[cursor]<target)cursor++;
    const a=raw[cursor-1],b=raw[cursor];
    const span=Math.max(.001,cumulative[cursor]-cumulative[cursor-1]);
    const u=(target-cumulative[cursor-1])/span;
    dense.push({x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u)});
  }

  return dense;
}
candyPath=makeCandyPath();

function loopPose(row,phase=state?.rotationPhase||0){
  const rowProgress=((row+phase)%LOOP_ROWS+LOOP_ROWS)%LOOP_ROWS;
  const exact=(rowProgress/LOOP_ROWS)*(candyPath.length-1);
  const i0=Math.floor(exact),i1=(i0+1)%candyPath.length,t=exact-i0;
  const p0=candyPath[i0]||candyPath[0],p1=candyPath[i1]||candyPath[0];
  const x=lerp(p0.x,p1.x,t),y=lerp(p0.y,p1.y,t);

  // Centred tangent = gradual row rotation through a bend instead of an
  // instantaneous pivot when crossing a sample boundary.
  const im1=(i0-2+candyPath.length)%candyPath.length;
  const ip2=(i1+2)%candyPath.length;
  const pa=candyPath[im1],pb=candyPath[ip2];
  let tx=pb.x-pa.x,ty=pb.y-pa.y;
  const len=Math.hypot(tx,ty)||1;tx/=len;ty/=len;

  return{x,y,tx,ty,nx:-ty,ny:tx};
}
function candyPos(index,phase=state?.rotationPhase||0){
  const row=Math.floor(index/ROTATION_COLS),col=index%ROTATION_COLS,p=loopPose(row,phase);
  const off=(col-(ROTATION_COLS-1)/2)*CENTRAL_LANE_SPACING;
  return{x:p.x+p.nx*off,y:p.y+p.ny*off};
}
function feederGeometry(side){
  const join=loopPose(side==='left'?LEFT_JOIN_ROW:RIGHT_JOIN_ROW,0);
  const outerX=side==='left'?6:414;
  const radius=FEED_CORNER_RADIUS;
  const mouth={x:side==='left'?join.x-43:join.x+43,y:join.y};
  return{join,outerX,radius,mouth};
}
function feederRowPose(side,rowVisual){
  const g=feederGeometry(side);
  const d=Math.max(0,rowVisual*FEED_ROW_SPACING);
  const R=g.radius;
  const tangentX=side==='left'?g.outerX+R:g.outerX-R;
  const horizontal=Math.max(0,side==='left'?g.mouth.x-tangentX:tangentX-g.mouth.x);
  const arc=R*Math.PI/2;

  if(d<=horizontal){
    return{
      x:side==='left'?g.mouth.x-d:g.mouth.x+d,
      y:g.mouth.y,
      tx:side==='left'?1:-1,ty:0,
      nx:0,ny:side==='left'?1:-1
    };
  }

  const q=d-horizontal;
  if(q<=arc){
    if(side==='left'){
      const phi=Math.PI/2+q/R;
      const cx=g.outerX+R,cy=g.mouth.y-R;
      const tx=Math.sin(phi),ty=-Math.cos(phi);
      return{x:cx+R*Math.cos(phi),y:cy+R*Math.sin(phi),tx,ty,nx:-ty,ny:tx};
    }
    const phi=Math.PI/2-q/R;
    const cx=g.outerX-R,cy=g.mouth.y-R;
    const tx=-Math.sin(phi),ty=Math.cos(phi);
    return{x:cx+R*Math.cos(phi),y:cy+R*Math.sin(phi),tx,ty,nx:-ty,ny:tx};
  }

  const vertical=q-arc;
  return{x:g.outerX,y:g.mouth.y-R-vertical,tx:0,ty:1,nx:-1,ny:0};
}
function feederRowPos(side,rowVisual,col){
  const p=feederRowPose(side,rowVisual);
  const off=(col-(FEEDER_COLS-1)/2)*FEED_LANE_SPACING;
  return{x:p.x+p.nx*off,y:p.y+p.ny*off};
}
function cubicPose(p0,p1,p2,p3,u){
  const q=1-u;
  const x=q*q*q*p0.x+3*q*q*u*p1.x+3*q*u*u*p2.x+u*u*u*p3.x;
  const y=q*q*q*p0.y+3*q*q*u*p1.y+3*q*u*u*p2.y+u*u*u*p3.y;
  let tx=3*q*q*(p1.x-p0.x)+6*q*u*(p2.x-p1.x)+3*u*u*(p3.x-p2.x);
  let ty=3*q*q*(p1.y-p0.y)+6*q*u*(p2.y-p1.y)+3*u*u*(p3.y-p2.y);
  const len=Math.hypot(tx,ty)||1;tx/=len;ty/=len;
  return{x,y,tx,ty,nx:-ty,ny:tx};
}
function feederEntryPoint(side,col,u,targetIndex){
  const start=feederRowPose(side,0);
  const target=loopPose(Math.floor(targetIndex/ROTATION_COLS),state.rotationPhase);
  const c1={x:start.x+start.tx*28,y:start.y+start.ty*28};
  const c2={x:target.x-target.tx*30,y:target.y-target.ty*30};
  const p=cubicPose(
    {x:start.x,y:start.y},c1,c2,{x:target.x,y:target.y},u
  );
  const off=(col-(FEEDER_COLS-1)/2)*FEED_LANE_SPACING;
  return{x:p.x+p.nx*off,y:p.y+p.ny*off};
}

function truckPoly(t,x=t.x,y=t.y,angle=t.angle){
  const hl=t.length/2, hw=t.width/2,c=Math.cos(angle),s=Math.sin(angle);
  return [[-hl,-hw],[hl,-hw],[hl,hw],[-hl,hw]].map(([px,py])=>({x:x+px*c-py*s,y:y+px*s+py*c}));
}
function project(poly,ax,ay){let mn=Infinity,mx=-Infinity;for(const p of poly){const v=p.x*ax+p.y*ay;mn=Math.min(mn,v);mx=Math.max(mx,v)}return[mn,mx]}
const TRUCK_GAP=3;
function polyOverlap(a,b,gap=TRUCK_GAP){
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],ex=q.x-p.x,ey=q.y-p.y,l=Math.hypot(ex,ey)||1,ax=-ey/l,ay=ex/l;
    const A=project(a,ax,ay),B=project(b,ax,ay);
    // Exactly 1 px of separation is legal. Anything closer counts as a
    // collision so settled yard trucks retain a visible one-pixel gap.
    if(A[1]<=B[0]-gap||B[1]<=A[0]-gap)return false;
  }
  return true;
}
function insideJam(t,x=t.x,y=t.y){const p=truckPoly(t,x,y);return p.some(v=>v.x>JAM.x&&v.x<JAM.x+JAM.w&&v.y>JAM.y&&v.y<JAM.y+JAM.h)}
function canDriveOut(t,trucks){
  const dx=Math.cos(t.angle),dy=Math.sin(t.angle),others=trucks.filter(o=>o.id!==t.id);
  for(let d=7;d<520;d+=7){const x=t.x+dx*d,y=t.y+dy*d,p=truckPoly(t,x,y);for(const o of others)if(polyOverlap(p,truckPoly(o)))return false;if(!insideJam(t,x,y))return true}
  return true;
}
function truckFullyInsideJam(t,x=t.x,y=t.y,margin=4){
  const p=truckPoly(t,x,y);
  return p.every(v=>
    v.x>=JAM.x+margin&&
    v.x<=JAM.x+JAM.w-margin&&
    v.y>=JAM.y+margin&&
    v.y<=JAM.y+JAM.h-margin
  );
}
function truckPositionLegal(t,x,y,trucks){
  if(!truckFullyInsideJam(t,x,y,4))return false;
  const p=truckPoly(t,x,y);
  for(const o of trucks){
    if(o.id===t.id)continue;
    if(polyOverlap(p,truckPoly(o)))return false;
  }
  return true;
}
function tryCompactStep(t,dx,dy,trucks,step=2.25){
  const len=Math.hypot(dx,dy);
  if(len<.001)return false;
  const nx=dx/len,ny=dy/len;
  const ox=t.x,oy=t.y;
  const tx=ox+nx*step,ty=oy+ny*step;

  if(truckPositionLegal(t,tx,ty,trucks)){
    t.x=tx;t.y=ty;
    return true;
  }

  // If the requested step would cross the 1 px clearance boundary, binary
  // search the remaining distance so the truck settles right up to that
  // boundary instead of stopping a whole compaction step away.
  let lo=0,hi=step;
  for(let i=0;i<12;i++){
    const mid=(lo+hi)/2;
    const x=ox+nx*mid,y=oy+ny*mid;
    if(truckPositionLegal(t,x,y,trucks))lo=mid;
    else hi=mid;
  }

  if(lo<=.015)return false;
  t.x=ox+nx*lo;
  t.y=oy+ny*lo;
  return true;
}
function compactTruckLayout(trucks){
  if(trucks.length<2)return trucks;

  // Repeatedly settle every vehicle into the occupied cluster. Each pass tries
  // the direct inward movement first, then the axis components and nearest
  // neighbour direction so a truck can use otherwise wasted pockets.
  let still=0;
  for(let pass=0;pass<180&&still<8;pass++){
    let moved=0;
    const cx=trucks.reduce((a,t)=>a+t.x,0)/trucks.length;
    const cy=trucks.reduce((a,t)=>a+t.y,0)/trucks.length;

    // Work from the outside in so exposed vehicles close the large gaps first.
    const ordered=[...trucks].sort((a,b)=>
      Math.hypot(b.x-cx,b.y-cy)-Math.hypot(a.x-cx,a.y-cy)
    );

    for(const t of ordered){
      const dx=cx-t.x,dy=cy-t.y;
      let did=false;

      // Primary pull toward the cluster.
      did=tryCompactStep(t,dx,dy,trucks,2.25);

      // If another truck blocks the diagonal route, try closing either axis.
      if(!did&&Math.abs(dx)>.75)did=tryCompactStep(t,Math.sign(dx),0,trucks,1.75);
      if(!did&&Math.abs(dy)>.75)did=tryCompactStep(t,0,Math.sign(dy),trucks,1.75);

      // Finally pull toward the nearest neighbour. This removes isolated
      // pockets that are not exactly on the centre-of-mass line.
      if(!did){
        let nearest=null,nearestD=Infinity;
        for(const o of trucks){
          if(o.id===t.id)continue;
          const d=(o.x-t.x)*(o.x-t.x)+(o.y-t.y)*(o.y-t.y);
          if(d<nearestD){nearest=o;nearestD=d}
        }
        if(nearest)did=tryCompactStep(t,nearest.x-t.x,nearest.y-t.y,trucks,1.5);
      }

      if(did)moved++;
    }

    if(moved===0)still++;
    else still=0;
  }

  // A final fine-grain settling pass closes sub-pixel-looking gaps left by the
  // coarse compaction above.
  for(let pass=0;pass<40;pass++){
    let moved=0;
    const cx=trucks.reduce((a,t)=>a+t.x,0)/trucks.length;
    const cy=trucks.reduce((a,t)=>a+t.y,0)/trucks.length;
    for(const t of trucks){
      const dx=cx-t.x,dy=cy-t.y;
      if(tryCompactStep(t,dx,dy,trucks,.65))moved++;
      else{
        if(Math.abs(dx)>.2&&tryCompactStep(t,Math.sign(dx),0,trucks,.5))moved++;
        else if(Math.abs(dy)>.2&&tryCompactStep(t,0,Math.sign(dy),trucks,.5))moved++;
      }
    }
    if(!moved)break;
  }

  return trucks;
}

function initialClearCount(trucks){return trucks.filter(t=>canDriveOut(t,trucks)).length}
function blockingTruckIds(t,trucks){
  const ids=new Set(),dx=Math.cos(t.angle),dy=Math.sin(t.angle);
  const others=trucks.filter(o=>o.id!==t.id);
  for(let d=5;d<540;d+=5){
    const x=t.x+dx*d,y=t.y+dy*d,p=truckPoly(t,x,y);
    for(const o of others)if(polyOverlap(p,truckPoly(o)))ids.add(o.id);
    if(!insideJam(t,x,y))break;
  }
  return[...ids];
}
function removalOrder(trucks,r){
  const rem=trucks.map(t=>({...t})),out=[];
  while(rem.length){
    const free=rem.filter(t=>canDriveOut(t,rem));
    if(!free.length)return null;

    // Prefer a move that exposes only a small number of new choices. This
    // creates longer blocker chains instead of instantly opening the yard.
    const scored=free.map(t=>{
      const after=rem.filter(x=>x.id!==t.id);
      const beforeFree=new Set(free.map(x=>x.id));
      const newly=after.filter(x=>!beforeFree.has(x.id)&&canDriveOut(x,after)).length;
      return{t,score:Math.abs(newly-1)+r()*.35};
    }).sort((x,y)=>x.score-y.score);

    const t=scored[Math.min(scored.length-1,Math.floor(r()*Math.min(2,scored.length)))].t;
    out.push(t.id);
    rem.splice(rem.findIndex(x=>x.id===t.id),1);
  }
  return out;
}
function difficultyProfile(n){
  if(n<=2)return{minFree:3,maxFree:5,minMulti:0,garageChance:0,hiddenChance:0,target:4};
  if(n<=4)return{minFree:2,maxFree:4,minMulti:.10,garageChance:.22,hiddenChance:.28,target:8};
  if(n<=7)return{minFree:2,maxFree:3,minMulti:.20,garageChance:.55,hiddenChance:.52,target:13};
  if(n<=12)return{minFree:2,maxFree:3,minMulti:.28,garageChance:.70,hiddenChance:.62,target:17};
  return{minFree:2,maxFree:2,minMulti:.34,garageChance:.78,hiddenChance:.72,target:21};
}
function allGeneratedTrucks(gen){
  return gen.garage?[...gen.trucks,...gen.garage.queue]:[...gen.trucks];
}
function maybeAddGarage(trucks,order,r,n,profile){
  if(profile.garageChance<=0||r()>profile.garageChance)return null;
  const free=trucks.filter(t=>canDriveOut(t,trucks));
  if(!free.length)return null;

  // The surface truck must be a genuinely selectable truck. Every later
  // underground truck uses the same physical footprint/direction, so once the
  // current one has escaped the next one is guaranteed to fit that space.
  const early=free.filter(t=>order.indexOf(t.id)>=0&&order.indexOf(t.id)<Math.min(6,order.length));
  const host=choice(r,early.length?early:free);
  const extra=n<7?2:n<12?rint(r,2,3):rint(r,3,4);
  const queue=[];

  for(let i=0;i<extra;i++){
    queue.push({
      id:`g${i}_${host.id}`,
      x:host.x,y:host.y,angle:host.angle,
      kind:host.kind,length:host.length,width:host.width,capacity:host.capacity,
      color:'red',garageTruck:true,hideColor:false
    });
  }

  const pos=order.indexOf(host.id);
  if(pos<0)return null;
  order.splice(pos+1,0,...queue.map(t=>t.id));

  host.garageTruck=true;
  host.hideColor=false;
  return{
    x:host.x,y:host.y,angle:host.angle,
    length:host.length,width:host.width,
    currentId:host.id,
    queue
  };
}
function assignChallengeColors(gen,r,n){
  const physical=gen.trucks;
  const all=allGeneratedTrucks(gen);
  const palette=COLOR_NAMES.slice(0,Math.min(5+Math.floor(n/4),8));
  const freeIds=new Set(physical.filter(t=>canDriveOut(t,physical)).map(t=>t.id));
  const freePalette=palette.slice(0,Math.max(3,palette.length-2));

  for(const t of all){
    const source=freeIds.has(t.id)?freePalette:palette;
    t.color=choice(r,source);
  }

  // Reserve one or two colours for trucks which are not initially available.
  // This makes the visible sweet colours and the immediately selectable
  // trucks deliberately diverge.
  if(palette.length>=5){
    const multi=physical
      .filter(t=>!freeIds.has(t.id)&&blockingTruckIds(t,physical).length>=2)
      .sort((x,y)=>blockingTruckIds(y,physical).length-blockingTruckIds(x,physical).length);
    const reserved=palette.slice(-Math.min(2,palette.length-3));
    for(let i=0;i<Math.min(reserved.length,multi.length);i++)multi[i].color=reserved[i];
  }

  // Garage colours are deliberately unconstrained once they are underground;
  // the player sees none of them until each truck surfaces.
  if(gen.garage){
    for(const t of gen.garage.queue)t.color=choice(r,palette);
  }
}
function buildIndependentSweetRows(gen,r){
  const byId=new Map(allGeneratedTrucks(gen).map(t=>[t.id,t]));
  const ranked=[];

  // Reverse-bias the sweet supply relative to the valid truck-removal path:
  // deeper blocked trucks tend to appear earlier, while early blocker trucks
  // tend to wait in the feeders. Random jitter prevents a predictable reverse
  // list and the row order is therefore genuinely independent of gen.order.
  for(let oi=0;oi<gen.order.length;oi++){
    const t=byId.get(gen.order[oi]);
    if(!t)continue;
    const rows=t.capacity/4;
    for(let k=0;k<rows;k++){
      ranked.push({color:t.color,rank:oi*1.35+r()*gen.order.length*.55});
    }
  }
  ranked.sort((a,b)=>b.rank-a.rank);

  // Break up long same-colour runs without destroying the deeper-truck bias.
  for(let i=1;i<ranked.length;i++){
    if(ranked[i].color===ranked[i-1].color){
      let swap=-1;
      for(let j=i+1;j<Math.min(ranked.length,i+10);j++){
        if(ranked[j].color!==ranked[i-1].color){swap=j;break}
      }
      if(swap>=0)[ranked[i],ranked[swap]]=[ranked[swap],ranked[i]];
    }
  }
  return ranked.map(x=>x.color);
}
function simulateParkingSequence(gen){
  if(!Array.isArray(gen.sweetRows)||!gen.sweetRows.length)return{solvable:false,maxParked:99,forcedWrong:0};

  const byId=new Map(allGeneratedTrucks(gen).map(t=>[t.id,t]));
  const available=gen.sweetRows.slice(0,LOOP_ROWS);
  const future=gen.sweetRows.slice(LOOP_ROWS);
  const parked=[];
  let maxParked=0,forcedWrong=0,consumed=0;

  function resolve(){
    let progress=true,safety=0;
    while(progress&&safety++<10000){
      progress=false;
      for(let ai=0;ai<available.length;ai++){
        const color=available[ai];
        const pi=parked.findIndex(p=>p.color===color&&p.need>0);
        if(pi<0)continue;

        parked[pi].need--;
        available.splice(ai,1);
        consumed++;
        if(future.length)available.push(future.shift());
        if(parked[pi].need<=0)parked.splice(pi,1);
        progress=true;
        break;
      }
    }
  }

  for(const id of gen.order){
    const t=byId.get(id);
    if(!t)return{solvable:false,maxParked:99,forcedWrong};

    const hasNow=available.includes(t.color);
    if(!hasNow)forcedWrong++;
    parked.push({id:t.id,color:t.color,need:t.capacity/4});
    maxParked=Math.max(maxParked,parked.length);

    resolve();
    if(parked.length>4)return{solvable:false,maxParked,forcedWrong};
  }

  resolve();
  return{
    solvable:parked.length===0&&future.length===0&&available.length===0,
    maxParked,
    forcedWrong,
    consumed
  };
}
function generationDifficultyScore(gen,parking){
  const physical=gen.trucks;
  const free=physical.filter(t=>canDriveOut(t,physical));
  const blockers=physical.map(t=>blockingTruckIds(t,physical).length);
  const multi=blockers.filter(n=>n>=2).length;
  const maxBlock=Math.max(0,...blockers);
  const freeColors=new Set(free.map(t=>t.color));
  const unavailableColors=new Set(physical.filter(t=>!canDriveOut(t,physical)&&!freeColors.has(t.color)).map(t=>t.color)).size;

  return(
    Math.max(0,6-free.length)*2.4+
    multi*.55+
    maxBlock*1.2+
    unavailableColors*1.8+
    Math.min(5,parking.forcedWrong)*1.25+
    parking.maxParked*1.2+
    (gen.garage?gen.garage.queue.length*1.1:0)
  );
}
function applyHiddenTruckColours(gen,r,n,profile){
  if(n<3||profile.hiddenChance<=0)return;
  const hostId=gen.garage?.currentId;
  const candidates=gen.trucks.filter(t=>
    t.id!==hostId&&
    blockingTruckIds(t,gen.trucks).length>=2
  );

  let hidden=0;
  for(const t of candidates){
    if(r()<profile.hiddenChance){
      t.hideColor=true;
      t.revealed=false;
      hidden++;
    }
  }

  // Once the mechanic is established, ensure a qualifying level actually
  // demonstrates it instead of occasionally randomising to zero hidden trucks.
  if(n>=5&&hidden===0&&candidates.length){
    candidates[0].hideColor=true;
    candidates[0].revealed=false;
  }
}
function validateGeneratedLevel(gen){
  if(!gen||!Array.isArray(gen.trucks)||!Array.isArray(gen.order)||!Array.isArray(gen.sweetRows))return false;
  const all=allGeneratedTrucks(gen);
  if(all.length!==gen.order.length)return false;
  if(new Set(gen.order).size!==gen.order.length)return false;
  if(all.some(t=>t.capacity<=0||t.capacity%4!==0))return false;

  // Geometry/garage solver: only the surfaced garage truck exists in the yard.
  const remaining=gen.trucks.map(t=>({...t}));
  const garageQueue=gen.garage?gen.garage.queue.map(t=>({...t})):[];
  let garageCurrent=gen.garage?.currentId||null;

  for(const id of gen.order){
    const idx=remaining.findIndex(t=>t.id===id);
    if(idx<0||!canDriveOut(remaining[idx],remaining))return false;
    const removed=remaining[idx];
    remaining.splice(idx,1);

    if(garageCurrent&&removed.id===garageCurrent){
      const next=garageQueue.shift();
      if(next){
        next.x=gen.garage.x;next.y=gen.garage.y;next.angle=gen.garage.angle;
        remaining.push(next);
        garageCurrent=next.id;
      }else garageCurrent=null;
    }
  }
  if(remaining.length||garageQueue.length)return false;

  const expectedRows=all.reduce((sum,t)=>sum+t.capacity/4,0);
  if(gen.sweetRows.length!==expectedRows)return false;

  const rowCounts=new Map();
  for(const color of gen.sweetRows)rowCounts.set(color,(rowCounts.get(color)||0)+1);
  const truckCounts=new Map();
  for(const t of all)truckCounts.set(t.color,(truckCounts.get(t.color)||0)+t.capacity/4);
  for(const [color,count] of truckCounts)if(rowCounts.get(color)!==count)return false;

  return simulateParkingSequence(gen).solvable;
}
function finalizeCandidate(trucks,baseOrder,r,n){
  const profile=difficultyProfile(n);
  const clear=initialClearCount(trucks);
  if(clear<profile.minFree||clear>profile.maxFree)return null;

  const multi=trucks.filter(t=>blockingTruckIds(t,trucks).length>=2).length;
  if(multi<trucks.length*profile.minMulti)return null;

  const order=[...baseOrder];
  const garage=maybeAddGarage(trucks,order,r,n,profile);
  const gen={trucks,order,garage,sweetRows:[]};
  assignChallengeColors(gen,r,n);

  let best=null;
  for(let sweetAttempt=0;sweetAttempt<80;sweetAttempt++){
    gen.sweetRows=buildIndependentSweetRows(gen,r);
    const parking=simulateParkingSequence(gen);
    if(!parking.solvable)continue;

    const score=generationDifficultyScore(gen,parking);
    if(!best||score>best.score)best={rows:[...gen.sweetRows],parking,score};
    if(score>=profile.target)break;
  }
  if(!best||best.score<profile.target)return null;

  gen.sweetRows=best.rows;
  gen.difficulty={score:best.score,maxParked:best.parking.maxParked,forcedWrong:best.parking.forcedWrong,initialFree:clear};
  applyHiddenTruckColours(gen,r,n,profile);

  return validateGeneratedLevel(gen)?gen:null;
}
function generateLevel(n){
  for(let attempt=0;attempt<280;attempt++){
    const R=rng(n*73471+attempt*977+19);
    const count=Math.min(16+Math.floor(n*.4),22);
    const trucks=[];

    for(let i=0;i<count;i++){
      let placed=false;
      for(let k=0;k<520&&!placed;k++){
        const kind=R()<.18?2:R()<.55?1:0;
        const length=[48,59,72][kind],width=[25,27,29][kind];
        const angle=choice(R,[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,5*Math.PI/4,3*Math.PI/2,7*Math.PI/4]);
        const t={
          id:`t${i}`,
          x:rint(R,JAM.x+34,JAM.x+JAM.w-34),
          y:rint(R,JAM.y+34,JAM.y+JAM.h-34),
          angle,length,width,
          capacity:[20,28,36][kind],kind,color:'red'
        };
        const poly=truckPoly(t);
        if(poly.some(p=>p.x<JAM.x+4||p.x>JAM.x+JAM.w-4||p.y<JAM.y+4||p.y>JAM.y+JAM.h-4))continue;
        if(trucks.some(o=>polyOverlap(poly,truckPoly(o))))continue;
        trucks.push(t);placed=true;
      }
    }
    if(trucks.length<count-2)continue;

    compactTruckLayout(trucks);

    const baseOrder=removalOrder(trucks,R);
    if(!baseOrder)continue;

    const gen=finalizeCandidate(trucks,baseOrder,R,n);
    if(gen)return gen;
  }
  return fallbackLevel(n);
}
function fallbackLevel(n){
  // A deterministic fallback remains solver-checked, but is intentionally
  // denser than the old two-column fallback so a rare generation miss does
  // not suddenly collapse the difficulty.
  const R=rng(n*91+4);
  const spots=[
    [74,552,0],[128,552,Math.PI],[184,552,0],[240,552,Math.PI],[296,552,0],[350,552,Math.PI],
    [82,606,Math.PI/2],[140,610,3*Math.PI/2],[202,610,Math.PI/2],[264,610,3*Math.PI/2],[330,610,Math.PI/2],
    [92,674,0],[154,674,Math.PI],[216,674,0],[278,674,Math.PI],[340,674,0]
  ];
  const trucks=[];
  for(let i=0;i<spots.length;i++){
    const kind=i%3===2?1:0;
    trucks.push({
      id:`t${i}`,x:spots[i][0],y:spots[i][1],angle:spots[i][2],
      kind,length:[48,59,72][kind],width:[25,27,29][kind],capacity:[20,28,36][kind],color:'red'
    });
  }
  // If the handcrafted packing happens to overlap after a future art-size
  // change, fall back to the previous guaranteed sparse pattern.
  const legal=trucks.every((t,i)=>truckFullyInsideJam(t,t.x,t.y,4)&&!trucks.slice(0,i).some(o=>polyOverlap(truckPoly(t),truckPoly(o))));
  if(!legal){
    const ys=[540,575,610,645,680,715,750,785];
    trucks.length=0;
    ys.forEach((y,i)=>{
      const kind=i%3,left=i%2===0;
      trucks.push({id:`t${i}`,x:left?82:338,y,angle:left?Math.PI:0,kind,length:[48,59,72][kind],width:[25,27,29][kind],capacity:[20,28,36][kind],color:'red'});
    });
  }

  compactTruckLayout(trucks);
  const order=removalOrder(trucks,R);
  if(!order)throw new Error('Guaranteed fallback unexpectedly unsolvable');

  // Relax only the numeric difficulty threshold for fallback; all actual
  // geometry, garage and four-slot parking solvability checks still apply.
  const profile=difficultyProfile(n),savedTarget=profile.target;
  profile.target=0;
  const clear=initialClearCount(trucks);
  const garage=maybeAddGarage(trucks,order,R,n,profile);
  const gen={trucks,order,garage,sweetRows:[]};
  assignChallengeColors(gen,R,n);

  for(let i=0;i<120;i++){
    gen.sweetRows=buildIndependentSweetRows(gen,R);
    if(simulateParkingSequence(gen).solvable){
      applyHiddenTruckColours(gen,R,n,profile);
      if(validateGeneratedLevel(gen))return gen;
    }
  }
  throw new Error('Fallback parking solver failed');
}
function makeQueue(gen){
  const q=[];let cid=0;
  for(const color of gen.sweetRows){
    for(let i=0;i<4;i++)q.push({id:`c${cid++}`,color,visualIndex:q.length,entryT:1});
  }
  return q;
}
function rowsAreValid(list){
  if(list.length%4!==0)return false;
  for(let i=0;i<list.length;i+=4){
    const row=list.slice(i,i+4);
    if(row.length!==4||row.some(c=>c.color!==row[0].color))return false;
  }
  return true;
}
function loopRowsAreValid(list){
  if(list.length!==ROTATION_CAPACITY)return false;
  for(let i=0;i<list.length;i+=4){
    const row=list.slice(i,i+4);
    const empty=row.every(c=>c==null);
    if(empty)continue;
    if(row.some(c=>c==null)||row.some(c=>c.color!==row[0].color))return false;
  }
  return true;
}
function splitSweetPools(gen){
  const all=makeQueue(gen);
  if(!rowsAreValid(all))throw new Error('Generated sweets do not form complete four-sweet rows');

  const take=Math.min(ROTATION_CAPACITY,Math.floor(all.length/4)*4);
  const rotation=all.splice(0,take);
  while(rotation.length<ROTATION_CAPACITY)rotation.push(null);

  const remainingRows=all.length/4;
  const leftRows=Math.ceil(remainingRows/2);
  const leftFeed=all.splice(0,leftRows*4),rightFeed=all;
  for(let r=0;r<leftFeed.length/4;r++)leftFeed[r*4].feedVisualRow=r;
  for(let r=0;r<rightFeed.length/4;r++)rightFeed[r*4].feedVisualRow=r;

  if(!loopRowsAreValid(rotation)||!rowsAreValid(leftFeed)||!rowsAreValid(rightFeed))throw new Error('Sweet pool row integrity failed');
  return{rotation,leftFeed,rightFeed};
}

function makeSlots(){
  const xs=[90,150,210,270,330];
  return xs.map((x,i)=>({x,y:SLOT_Y,w:46,h:72,type:i===4?'plus':'normal',active:i<4,truck:null}));
}
function newState(n){
  const gen=generateLevel(n),pools=splitSweetPools(gen);
  const all=allGeneratedTrucks(gen);
  const garage=gen.garage?{
    x:gen.garage.x,y:gen.garage.y,angle:gen.garage.angle,
    length:gen.garage.length,width:gen.garage.width,
    currentId:gen.garage.currentId,
    queue:gen.garage.queue.map(t=>({...t,state:'underground'}))
  }:null;

  return{
    level:n,
    yard:gen.trucks.map(t=>({...t,state:'yard'})),
    all:new Map(all.map(t=>[t.id,{...t}])),
    garage,
    difficulty:gen.difficulty||null,
    rotation:pools.rotation,leftFeed:pools.leftFeed,rightFeed:pools.rightFeed,
    slots:makeSlots(),motions:[],particles:[],boarding:null,departures:[],
    won:false,lost:false,boosters:{shuffle:2,auto:2},coins:250+(n-1)*15,
    time:0,rotationPhase:0,holdFast:false
  };
}
function sweetsRemaining(){
  return state.rotation.filter(Boolean).length+state.leftFeed.length+state.rightFeed.length;
}
function gapAtRow(rowIndex){
  const base=rowIndex*ROTATION_COLS,row=state.rotation.slice(base,base+4);
  return row.length===4&&row.every(c=>c==null);
}
function insertFeederRow(rowIndex,side){
  const source=side==='left'?state.leftFeed:state.rightFeed;
  if(source.length<4||!gapAtRow(rowIndex))return false;

  const row=source.splice(0,4);
  if(row.length!==4||row.some(c=>c.color!==row[0].color))throw new Error('Feeder supplied an invalid row');

  const base=rowIndex*ROTATION_COLS;
  row[0].entryT=0;
  row[0].entrySide=side;

  for(let i=0;i<4;i++)state.rotation[base+i]=row[i];
  return true;
}
function processFeederJunctions(){
  // The travelling gap reaches the left merge first. While any left rows remain,
  // the right merge is deliberately inactive.
  if(state.leftFeed.length>=4)insertFeederRow(LEFT_JOIN_ROW,'left');
  else if(state.rightFeed.length>=4)insertFeederRow(RIGHT_JOIN_ROW,'right');
}

function start(n){
  level=n;state=newState(n);
  if(!loopRowsAreValid(state.rotation)||!rowsAreValid(state.leftFeed)||!rowsAreValid(state.rightFeed))throw new Error('Level started with an invalid sweet row');
  if(state.rotation.length!==144)throw new Error('Central loop must contain exactly 36 row slots');
  overlay.classList.add('hidden');saveLevel();showToast('Tap a truck with a clear path');
}
function saveLevel(){try{localStorage.setItem('sweet-fever-level',String(level))}catch(_){}}

function drawBackground(){
  ctx.clearRect(-ox/scale,-oy/scale,W+2*ox/scale,H+2*oy/scale);
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#e9f0f4');g.addColorStop(1,'#cbd8e1');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // top tiled plaza
  ctx.fillStyle='#e4edf2';ctx.fillRect(0,0,W,365);ctx.strokeStyle='rgba(111,136,151,.16)';ctx.lineWidth=1;
  for(let x=0;x<W;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,365);ctx.stroke()}for(let y=0;y<365;y+=28){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  drawCrowdTrack(); drawParkingApron(); drawJamField();
}
function drawCrowdTrack(){
  ctx.save();
  ctx.lineJoin='round';

  // Draw feeder tubes first so the central loop masks the connector overlap.
  // Use butt caps so the feeder endpoint itself cannot create a rounded bulb.
  ctx.lineCap='butt';
  for(const side of ['left','right']){
    const g=feederGeometry(side);
    const R=g.radius;
    const tangentX=side==='left'?g.outerX+R:g.outerX-R;
    const target=loopPose(side==='left'?LEFT_JOIN_ROW:RIGHT_JOIN_ROW,0);
    const c1={x:g.mouth.x+(side==='left'?28:-28),y:g.mouth.y};
    const c2={x:target.x-target.tx*30,y:target.y-target.ty*30};

    for(const stroke of [
      {w:68,c:'#aebbc4'},
      {w:62,c:'#f7fafc'},
      {w:56,c:'#d6e0e6'}
    ]){
      ctx.beginPath();
      ctx.moveTo(g.outerX,-100);
      ctx.lineTo(g.outerX,g.mouth.y-R);
      ctx.quadraticCurveTo(g.outerX,g.mouth.y,tangentX,g.mouth.y);
      ctx.lineTo(g.mouth.x,g.mouth.y);
      ctx.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,target.x,target.y);
      ctx.strokeStyle=stroke.c;ctx.lineWidth=stroke.w;ctx.stroke();
    }
  }

  // Draw the central loop over the feeder endpoints. This leaves only the
  // intended opening/connection visible and removes the overlapping bulb.
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
function drawParkingApron(){
  ctx.save();ctx.beginPath();ctx.moveTo(8,366);ctx.quadraticCurveTo(18,352,38,352);ctx.lineTo(382,352);ctx.quadraticCurveTo(402,352,412,366);ctx.lineTo(420,487);ctx.lineTo(0,487);ctx.closePath();ctx.fillStyle='#85899c';ctx.fill();ctx.strokeStyle='#f4f7f9';ctx.lineWidth=4;ctx.stroke();ctx.restore();
  for(const s of state.slots)drawSlot(s);
  ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,488);ctx.lineTo(W,488);ctx.stroke();
}
function drawSlot(s){
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(-.06);
  if(!s.active){
    roundedRect(-s.w/2,-s.h/2,s.w,s.h,8,'rgba(57,64,83,.28)','rgba(37,44,61,.60)',2);
    text('+',0,-8,28,'#55dc54','center',1000);
    text('100',0,16,10,'#ffe24b','center',1000);
  }else{
    roundedRect(-s.w/2,-s.h/2,s.w,s.h,8,'rgba(110,120,143,.2)','#bcc5d2',2);
  }
  ctx.restore();
}
function drawJamField(){
  const g=ctx.createLinearGradient(0,JAM.y,0,JAM.y+JAM.h);g.addColorStop(0,'#d8e0e7');g.addColorStop(1,'#cbd5de');ctx.fillStyle=g;ctx.fillRect(JAM.x,JAM.y,JAM.w,JAM.h);
  ctx.strokeStyle='rgba(255,255,255,.58)';ctx.lineWidth=2;ctx.strokeRect(JAM.x+1,JAM.y+1,JAM.w-2,JAM.h-2);
}
function drawTopUI(){
  circleButton(34,31,23,'#2f6eac','↻');circleButton(386,31,23,'#2f6eac','Ⅱ');
  text(`Level ${state.level}`,210,24,22,'#2b3443','center',1000);text(`● ${state.coins}`,210,50,12,'#b78600','center',1000);
}
function circleButton(x,y,r,fill,label){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#f5f8fb';ctx.stroke();text(label,x,y+1,label==='Ⅱ'?18:23,'#fff','center',1000)}
function drawBoosters(){
  const fifthOpen=state.slots[4]?.active;
  const y=857,buttons=[{x:70,label:'AUTO',sub:state.boosters.auto},{x:165,label:fifthOpen?'5TH OPEN':'+ SLOT',sub:fifthOpen?'✓':'100'},{x:260,label:'SHUFFLE',sub:state.boosters.shuffle},{x:355,label:'SHOP',sub:'◈'}];
  for(const b of buttons){ctx.beginPath();ctx.arc(b.x,y,34,0,Math.PI*2);ctx.fillStyle='#2f74ad';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#f6fbff';ctx.stroke();text(b.label,b.x,y-4,10,'#fff','center',1000);text(String(b.sub),b.x,y+14,12,b.label==='SHOP'||b.x===165?'#ffde43':'#dff5ff','center',1000)}
}

function drawCandy(c,index){
  const p=candyPos(c.visualIndex);const col=COLORS[c.color];
  ctx.save();ctx.translate(p.x,p.y);ctx.beginPath();ctx.arc(1.5,2.3,5.3,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fill();ctx.beginPath();ctx.arc(0,0,5.2,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
  ctx.beginPath();ctx.arc(-1.7,-1.8,1.6,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.45)';ctx.fill();ctx.restore();
}
function drawSweetAt(p,color,r=SWEET_RADIUS){
  ctx.save();ctx.translate(p.x,p.y);
  ctx.beginPath();ctx.arc(1.9,2.8,r+.15,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.17)';ctx.fill();
  ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=COLORS[color];ctx.fill();
  ctx.beginPath();ctx.arc(-2.2,-2.3,2.0,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.43)';ctx.fill();
  ctx.restore();
}
function drawFeederRows(feed,side,dt){
  const rowCount=Math.floor(feed.length/4);
  const rowSpeed=ROTATION_SPEED_ROWS*conveyorSpeedMultiplier();

  for(let r=rowCount-1;r>=0;r--){
    const row=feed.slice(r*4,r*4+4);
    if(row.length!==4)continue;
    const leader=row[0];

    if(leader.feedVisualRow==null)leader.feedVisualRow=r;
    const delta=r-leader.feedVisualRow;
    const maxMove=rowSpeed*dt;
    leader.feedVisualRow+=Math.sign(delta||0)*Math.min(Math.abs(delta),maxMove);

    // One shared visual-row position for all four sweets. No per-sweet feeder motion.
    for(let col=0;col<4;col++){
      const p=feederRowPos(side,leader.feedVisualRow,col);
      drawSweetAt(p,row[col].color,SWEET_RADIUS);
    }
  }
}
function drawQueue(dt){
  drawFeederRows(state.leftFeed,'left',dt);
  drawFeederRows(state.rightFeed,'right',dt);

  const rowSpeed=ROTATION_SPEED_ROWS*conveyorSpeedMultiplier();

  // Draw the central loop row-by-row so four sweets can never desynchronise.
  for(let r=LOOP_ROWS-1;r>=0;r--){
    const base=r*4,row=state.rotation.slice(base,base+4);
    if(row.length!==4||row.every(c=>c==null))continue;
    if(row.some(c=>c==null))throw new Error('Partial central row');

    const leader=row[0];
    let entryU=null;
    if(leader.entryT<1&&leader.entrySide){
      leader.entryT=Math.min(1,leader.entryT+dt*rowSpeed);
      entryU=ease(leader.entryT);
    }

    for(let col=0;col<4;col++){
      const p=entryU==null
        ? candyPos(base+col)
        : feederEntryPoint(leader.entrySide,col,entryU,base+col);
      drawSweetAt(p,row[col].color,SWEET_RADIUS);
    }
  }
}

function drawTruck(t,x=t.x,y=t.y,a=t.angle,parked=false,hidden=false){
  ctx.save();ctx.translate(x,y);ctx.rotate(a);
  const L=t.length,WW=t.width;
  const body=hidden?'#20242a':(COLORS[t.color]||'#999');

  ctx.save();ctx.translate(2.5,3.5);roundedRect(-L/2,-WW/2,L,WW,6,'rgba(35,45,56,.24)');ctx.restore();

  ctx.fillStyle='#28303a';
  for(const sx of [-L*.28,L*.28]){
    roundedRect(sx-5,-WW/2-2,10,4,2,'#252b33');
    roundedRect(sx-5,WW/2-2,10,4,2,'#252b33');
  }

  roundedRect(-L/2,-WW/2,L,WW,6,body,'rgba(83,53,40,.22)',1.5);
  roundedRect(-L/2+3,-WW/2+3,L*.64-3,WW-6,4,shade(body,-.05),'rgba(255,255,255,.18)',1);
  roundedRect(L*.16,-WW/2+3,L*.31,WW-6,4,shade(body,.04),'rgba(255,255,255,.22)',1);
  roundedRect(L*.31,-WW/2+5,L*.11,WW-10,2,'rgba(207,239,250,.9)');

  if(hidden){
    ctx.fillStyle='#fff';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`1000 ${Math.max(17,Math.min(24,WW*.78))}px ui-rounded,system-ui,-apple-system`;
    ctx.fillText('?',-L*.08,0);
  }else if(!parked){
    ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=3.2;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(10,0);ctx.stroke();
    ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(3,-6);ctx.lineTo(3,6);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}
function shade(hex,amt){const n=parseInt(hex.slice(1),16),r=clamp((n>>16)+255*amt,0,255),g=clamp(((n>>8)&255)+255*amt,0,255),b=clamp((n&255)+255*amt,0,255);return`rgb(${r|0},${g|0},${b|0})`}

function refreshHiddenTruckReveals(){
  if(!state)return;
  for(const t of state.yard){
    if(t.hideColor&&!t.revealed&&canDriveOut(t,state.yard))t.revealed=true;
  }
}
function drawGarage(){
  const g=state.garage;
  if(!g)return;

  ctx.save();
  ctx.translate(g.x,g.y);
  ctx.rotate(g.angle);

  // Underground hatch remains visible around the surfaced truck footprint.
  roundedRect(-g.length/2-5,-g.width/2-6,g.length+10,g.width+12,7,'#2d3540','#f3c64c',2);
  ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=2;
  for(let x=-g.length/2+4;x<g.length/2-3;x+=11){
    ctx.beginPath();ctx.moveTo(x,-g.width/2-3);ctx.lineTo(x+8,g.width/2+3);ctx.stroke();
  }
  ctx.restore();

  // Count only trucks still underground. Their colours are never previewed.
  const remaining=g.queue.length;
  const bx=g.x+Math.cos(g.angle+Math.PI/2)*(g.width/2+16);
  const by=g.y+Math.sin(g.angle+Math.PI/2)*(g.width/2+16);
  roundedRect(bx-14,by-10,28,20,10,'#252c35','#fff',1.4);
  text('↓ '+String(remaining),bx,by,11,'#fff','center',1000);
}
function drawYard(){
  refreshHiddenTruckReveals();
  for(const t of state.yard){
    let x=t.x,y=t.y;
    if(t.bump){
      const u=clamp(t.bump.t/t.bump.duration,0,1);
      let travel;
      if(u<.42)travel=easeOut(u/.42)*t.bump.distance;
      else if(u<.56)travel=t.bump.distance;
      else travel=(1-ease((u-.56)/.44))*t.bump.distance;
      x+=Math.cos(t.angle)*travel;
      y+=Math.sin(t.angle)*travel;
    }
    const hidden=!!(t.hideColor&&!t.revealed);
    drawTruck(t,x,y,t.angle,false,hidden);
  }
}
function drawSlotsAndParked(){
  for(let i=0;i<state.slots.length;i++){const s=state.slots[i],t=s.truck;if(!t)continue;drawTruck(t,s.x,s.y,-Math.PI/2,true);const left=t.capacity-(t.loaded||0);text(String(left),s.x,s.y+s.h/2+13,14,'#ffd743','center',1000);ctx.strokeStyle='rgba(66,50,20,.25)'}
}
function buildSmoothRoute(points,cornerRadius=28){
  const clean=[];
  for(const p of points){
    const last=clean[clean.length-1];
    if(!last||Math.hypot(p.x-last.x,p.y-last.y)>1.5)clean.push({x:p.x,y:p.y});
  }
  if(clean.length<2)return{samples:clean.map((p,i)=>({...p,d:i})),total:0};

  const raw=[];
  function addPoint(p){
    const last=raw[raw.length-1];
    if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.15)raw.push({x:p.x,y:p.y});
  }
  function addLine(a,b){
    const len=Math.hypot(b.x-a.x,b.y-a.y);
    const steps=Math.max(1,Math.ceil(len/3));
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      addPoint({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
    }
  }
  function addQuad(a,c,b){
    const approx=Math.hypot(c.x-a.x,c.y-a.y)+Math.hypot(b.x-c.x,b.y-c.y);
    const steps=Math.max(8,Math.ceil(approx/2));
    for(let i=1;i<=steps;i++){
      const t=i/steps,q=1-t;
      addPoint({
        x:q*q*a.x+2*q*t*c.x+t*t*b.x,
        y:q*q*a.y+2*q*t*c.y+t*t*b.y
      });
    }
  }
  function unit(a,b){
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
    return{x:dx/d,y:dy/d,d};
  }

  addPoint(clean[0]);
  let cursor={...clean[0]};

  for(let i=1;i<clean.length-1;i++){
    const prev=clean[i-1],corner=clean[i],next=clean[i+1];
    const incoming=unit(prev,corner);
    const outgoing=unit(corner,next);
    const cut=Math.min(cornerRadius,incoming.d*.42,outgoing.d*.42);

    const enter={
      x:corner.x-incoming.x*cut,
      y:corner.y-incoming.y*cut
    };
    const exit={
      x:corner.x+outgoing.x*cut,
      y:corner.y+outgoing.y*cut
    };

    addLine(cursor,enter);
    addQuad(enter,corner,exit);
    cursor=exit;
  }
  addLine(cursor,clean[clean.length-1]);

  // Re-sample by physical distance. This removes speed pulses at waypoints
  // and gives the route a conveyor/road-like constant spatial resolution.
  const cumulative=[0];
  for(let i=1;i<raw.length;i++){
    cumulative.push(cumulative[i-1]+Math.hypot(raw[i].x-raw[i-1].x,raw[i].y-raw[i-1].y));
  }
  const total=cumulative[cumulative.length-1]||0;
  const samples=[];
  const count=Math.max(2,Math.ceil(total/2)+1);
  let cursorIndex=1;

  for(let n=0;n<count;n++){
    const target=n/(count-1)*total;
    while(cursorIndex<cumulative.length-1&&cumulative[cursorIndex]<target)cursorIndex++;
    const a=raw[Math.max(0,cursorIndex-1)],b=raw[cursorIndex]||a;
    const span=Math.max(.001,cumulative[cursorIndex]-cumulative[Math.max(0,cursorIndex-1)]);
    const u=clamp((target-cumulative[Math.max(0,cursorIndex-1)])/span,0,1);
    samples.push({x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u),d:target});
  }
  return{samples,total};
}
function sampleRoute(route,u){
  const a=route.samples;
  if(!a.length)return{x:0,y:0,a:0};
  if(a.length===1)return{x:a[0].x,y:a[0].y,a:0};

  const target=clamp(u,0,1)*route.total;
  let lo=1,hi=a.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(a[mid].d<target)lo=mid+1;
    else hi=mid;
  }
  const i=lo,p0=a[i-1],p1=a[i];
  const span=Math.max(.001,p1.d-p0.d);
  const v=clamp((target-p0.d)/span,0,1);
  const x=lerp(p0.x,p1.x,v),y=lerp(p0.y,p1.y,v);

  // Use a wider centred tangent so the truck rotates progressively through
  // the rounded bend instead of twitching from sample to sample.
  const prev=a[Math.max(0,i-3)],next=a[Math.min(a.length-1,i+3)];
  return{x,y,a:Math.atan2(next.y-prev.y,next.x-prev.x)};
}

function drawMotions(){
  for(const m of state.motions){
    const p=motionPose(m);
    drawTruck(m.truck,p.x,p.y,p.a,true);
  }
}
function motionPose(m){
  const t=clamp(m.t/m.duration,0,1);
  if(m.route){
    const p=sampleRoute(m.route,ease(t));
    if(m.type==='depart'&&t<m.reverseUntil){
      const blend=clamp((t-(m.reverseUntil-.12))/.12,0,1);
      p.a=angleLerp(-Math.PI/2,p.a,blend);
    }
    return p;
  }
  return{x:m.sx,y:m.sy,a:m.sa};
}

function drawParticles(){
  for(const p of state.particles){
    const local=p.t-(p.delay||0);
    if(local<0){
      ctx.beginPath();ctx.arc(p.sx,p.sy,SWEET_RADIUS,0,Math.PI*2);ctx.fillStyle=COLORS[p.color];ctx.fill();
      ctx.beginPath();ctx.arc(p.sx-2.2,p.sy-2.2,2,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.48)';ctx.fill();
      continue;
    }
    const raw=clamp(local/p.duration,0,1),u=ease(raw),q=1-u;
    const c1x=p.c1x??p.cx??p.sx,c1y=p.c1y??p.cy??p.sy;
    const c2x=p.c2x??p.cx??p.tx,c2y=p.c2y??p.cy??p.ty;
    const x=q*q*q*p.sx+3*q*q*u*c1x+3*q*u*u*c2x+u*u*u*p.tx;
    const y=q*q*q*p.sy+3*q*q*u*c1y+3*q*u*u*c2y+u*u*u*p.ty;
    ctx.globalAlpha=1-raw*.12;
    ctx.beginPath();ctx.arc(x,y,SWEET_RADIUS*(1-raw*.06),0,Math.PI*2);ctx.fillStyle=COLORS[p.color];ctx.fill();
    ctx.beginPath();ctx.arc(x-2.2,y-2.2,2,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.48)';ctx.fill();
    ctx.globalAlpha=1;
  }
}

function update(dt){
  state.time+=dt;
  for(const t of state.yard){
    if(t.bump){
      t.bump.t+=dt;
      if(t.bump.t>=t.bump.duration)t.bump=null;
    }
  }
  for(const m of state.motions)m.t+=dt;
  for(let i=state.motions.length-1;i>=0;i--){const m=state.motions[i];if(m.t>=m.duration){state.motions.splice(i,1);finishMotion(m)}}
  for(const p of state.particles){
    p.t+=dt;
    if(p.kind==='load'&&!p.arrived&&p.t>=(p.delay||0)+p.duration){
      p.arrived=true;
      completeSweetLoad(p);
    }
  }
  state.particles=state.particles.filter(p=>p.t<(p.delay||0)+p.duration+.03);

  updateRotationConveyor(dt);
}
function surfaceNextGarageTruck(previousId){
  const g=state.garage;
  if(!g||g.currentId!==previousId)return;

  const next=g.queue.shift();
  if(!next){
    g.currentId=null;
    return;
  }

  next.x=g.x;next.y=g.y;next.angle=g.angle;
  next.state='yard';
  next.revealed=true;
  next.hideColor=false;
  state.yard.push(next);
  g.currentId=next.id;
}
function finishMotion(m){
  if(m.type==='dispatch'){
    const slot=state.slots[m.slot];
    slot.truck=m.truck;
    m.truck.loaded=0;m.truck.pending=0;m.truck.departScheduled=false;
    m.truck.state='parked';m.truck.revealed=true;

    surfaceNextGarageTruck(m.truck.id);
    if(!state.boarding)beginBoardingIfPossible();
  }else if(m.type==='depart'){
    const slot=state.slots[m.slot];
    slot.truck=null;
    beginBoardingIfPossible();
    checkEnd();
  }
}
function frontRowColor(){
  for(let d=0;d<LOOP_ROWS;d++){
    const r=(OUTLET_SOURCE_ROW-d+LOOP_ROWS)%LOOP_ROWS;
    const row=state.rotation.slice(r*4,r*4+4);
    if(row.every(c=>c==null))continue;
    if(row.some(c=>c==null)||row.some(c=>c.color!==row[0].color))throw new Error('Malformed loop row');
    return row[0].color;
  }
  return null;
}
function beginBoardingIfPossible(){}
function updateBoarding(){}

function conveyorSpeedMultiplier(){
  const dispatching=state.motions.some(m=>m.type==='dispatch');
  const allTrucksCommitted=state.yard.length===0&&!dispatching;
  // Either condition requests fast mode; both together still mean 2x, never 4x.
  return (allTrucksCommitted||state.holdFast)?2:1;
}
function updateRotationConveyor(dt){
  state.rotationPhase+=dt*ROTATION_SPEED_ROWS*conveyorSpeedMultiplier();
  while(state.rotationPhase>=1){
    state.rotationPhase-=1;
    advanceLoopOneRow();
  }
}
function advanceLoopOneRow(){
  const base=OUTLET_SOURCE_ROW*ROTATION_COLS;
  const outletRow=state.rotation.slice(base,base+4);
  const isGap=outletRow.every(c=>c==null);
  if(!isGap&&(outletRow.some(c=>c==null)||outletRow.some(c=>c.color!==outletRow[0].color)))throw new Error('Invalid row reached outlet');

  if(!isGap){
    const rowColor=outletRow[0].color;
    const slotIndex=state.slots.findIndex(s=>{
      if(!s.truck||s.truck.color!==rowColor)return false;
      const used=(s.truck.loaded||0)+(s.truck.pending||0);
      return used+4<=s.truck.capacity;
    });

    if(slotIndex>=0){
      const slot=state.slots[slotIndex],truck=slot.truck;
      truck.pending=(truck.pending||0)+4;

      for(let i=0;i<4;i++){
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
      }

      for(let i=0;i<4;i++)state.rotation[base+i]=null;
    }
  }

  // Every row advances one physical position around the loop. Any removed row
  // therefore becomes a real travelling 4-wide gap.
  state.rotation=[
    ...state.rotation.slice(state.rotation.length-ROTATION_COLS),
    ...state.rotation.slice(0,state.rotation.length-ROTATION_COLS)
  ];

  processFeederJunctions();

  if(!loopRowsAreValid(state.rotation))throw new Error('Rotation row integrity lost');
  checkEnd();
}
function completeSweetLoad(p){
  const slot=state.slots[p.slotIndex],truck=slot?.truck;
  if(!truck||truck.id!==p.truckId)return;
  truck.loaded=(truck.loaded||0)+1;
  truck.pending=Math.max(0,(truck.pending||0)-1);

  if(truck.loaded>=truck.capacity&&truck.pending===0&&!truck.departScheduled){
    truck.departScheduled=true;
    setTimeout(()=>startDeparture(p.slotIndex),120);
  }
}
function startDeparture(slotIndex){
  if(!state||state.won||state.lost)return;
  const slot=state.slots[slotIndex],truck=slot?.truck;
  if(!truck)return;

  slot.truck=null;
  const topY=JAM.y-54;
  const exitLeft=slot.x<W/2;
  const points=[
    {x:slot.x,y:slot.y},
    {x:slot.x,y:topY},
    {x:exitLeft?-70:W+70,y:topY}
  ];
  const route=buildSmoothRoute(points,28);
  state.motions.push({
    type:'depart',
    truck,
    slot:slotIndex,
    route,
    t:0,
    duration:Math.max(.7,route.total/225),
    reverseUntil:.28
  });
  checkEnd();
}
function checkEnd(){
  const garageDone=!state.garage||(!state.garage.currentId&&state.garage.queue.length===0);
  if(sweetsRemaining()===0&&state.yard.length===0&&garageDone&&state.slots.every(s=>!s.truck)&&state.motions.length===0){state.won=true;showResult(true);return}

  const active=state.slots.filter(s=>s.active),full=active.length>0&&active.every(s=>s.truck);
  if(full){
    const parkedColors=new Set(active.map(s=>s.truck.color));
    const possible=[...state.rotation.filter(Boolean),...state.leftFeed,...state.rightFeed];
    if(possible.length&&!possible.some(c=>parkedColors.has(c.color))){state.lost=true;showResult(false)}
  }
}

function blockedTravelDistance(t,trucks){
  const dx=Math.cos(t.angle),dy=Math.sin(t.angle),others=trucks.filter(o=>o.id!==t.id);
  for(let d=3;d<520;d+=3){
    const p=truckPoly(t,t.x+dx*d,t.y+dy*d);
    if(others.some(o=>polyOverlap(p,truckPoly(o))))return Math.max(3,d);
    if(!insideJam(t,t.x+dx*d,t.y+dy*d))return null;
  }
  return null;
}
function blockedBump(t){
  if(t.bump)return;
  const d=blockedTravelDistance(t,state.yard);
  if(d==null)return;
  t.bump={t:0,duration:.58,distance:d};
  navigator.vibrate?.([12,25,22]);
}
function yardExitSide(t){
  const dx=Math.cos(t.angle),dy=Math.sin(t.angle);
  const candidates=[];
  if(dx>1e-4)candidates.push({side:'right',d:(JAM.x+JAM.w-t.x)/dx});
  if(dx<-1e-4)candidates.push({side:'left',d:(JAM.x-t.x)/dx});
  if(dy>1e-4)candidates.push({side:'bottom',d:(JAM.y+JAM.h-t.y)/dy});
  if(dy<-1e-4)candidates.push({side:'top',d:(JAM.y-t.y)/dy});
  const valid=candidates.filter(c=>c.d>=0).sort((a,b)=>a.d-b.d);
  return valid[0]?.side||'top';
}
function dispatchTruck(t){
  const open=state.slots.findIndex(s=>s.active&&!s.truck&&!state.motions.some(m=>m.type==='dispatch'&&m.slot===state.slots.indexOf(s)));
  if(open<0){showToast('No free parking slot');return}
  if(!canDriveOut(t,state.yard)){blockedBump(t);return}

  t.revealed=true;
  state.yard=state.yard.filter(x=>x.id!==t.id);

  const dir={x:Math.cos(t.angle),y:Math.sin(t.angle)};
  const exitSide=yardExitSide(t);

  // First leave the jam exactly in the direction the truck is pointing.
  let d=0,ex=t.x,ey=t.y;
  while(d<560){
    d+=4;
    ex=t.x+dir.x*d;
    ey=t.y+dir.y*d;
    if(!insideJam(t,ex,ey))break;
  }

  // Continue farther outside before asking the truck to turn. This is the
  // manoeuvring space shown around the parking rectangle in the reference.
  const manoeuvreRun=34;
  const mx=ex+dir.x*manoeuvreRun;
  const my=ey+dir.y*manoeuvreRun;

  const laneClearance=54;
  const nominalLeft=JAM.x-laneClearance;
  const nominalRight=JAM.x+JAM.w+laneClearance;
  const nominalTop=JAM.y-laneClearance;
  const nominalBottom=JAM.y+JAM.h+laneClearance;

  const slot=state.slots[open];
  const points=[
    {x:t.x,y:t.y},
    {x:ex,y:ey},
    {x:mx,y:my}
  ];

  if(exitSide==='left'){
    // Red arrows: up the left edge, then right across the top.
    const leftX=Math.min(nominalLeft,mx);
    const topY=Math.min(nominalTop,my);
    points.push(
      {x:leftX,y:my},
      {x:leftX,y:topY},
      {x:slot.x,y:topY},
      {x:slot.x,y:slot.y}
    );
  }else if(exitSide==='right'){
    // Red arrows: up the right edge, then left across the top.
    const rightX=Math.max(nominalRight,mx);
    const topY=Math.min(nominalTop,my);
    points.push(
      {x:rightX,y:my},
      {x:rightX,y:topY},
      {x:slot.x,y:topY},
      {x:slot.x,y:slot.y}
    );
  }else if(exitSide==='bottom'){
    // Red arrows: left along the bottom, up the left edge, then right across
    // the top toward the chosen parking bay.
    const bottomY=Math.max(nominalBottom,my);
    const leftX=Math.min(nominalLeft,mx);
    const topY=nominalTop;
    points.push(
      {x:mx,y:bottomY},
      {x:leftX,y:bottomY},
      {x:leftX,y:topY},
      {x:slot.x,y:topY},
      {x:slot.x,y:slot.y}
    );
  }else{
    // Already exited through the top: keep moving outward, then turn onto the
    // top circulation lane and approach the parking bay horizontally.
    const topY=Math.min(nominalTop,my);
    points.push(
      {x:mx,y:topY},
      {x:slot.x,y:topY},
      {x:slot.x,y:slot.y}
    );
  }

  const route=buildSmoothRoute(points,30);
  state.motions.push({
    type:'dispatch',
    truck:t,
    slot:open,
    route,
    t:0,
    duration:Math.max(.78,route.total/235)
  });
  navigator.vibrate?.(12);
}
function hitTruck(x,y){
  for(let i=state.yard.length-1;i>=0;i--){const t=state.yard[i],c=Math.cos(-t.angle),s=Math.sin(-t.angle),dx=x-t.x,dy=y-t.y,lx=dx*c-dy*s,ly=dx*s+dy*c;if(Math.abs(lx)<=t.length/2+5&&Math.abs(ly)<=t.width/2+7)return t}return null
}
function handleTap(x,y){
  if(state.won||state.lost)return;
  if(Math.hypot(x-34,y-31)<28){start(level);return}
  if(Math.hypot(x-386,y-31)<28){showToast('Paused');return}
  if(y>820){
    if(Math.hypot(x-70,y-857)<40)return autoMove();
    if(Math.hypot(x-165,y-857)<40)return unlockSlot();
    if(Math.hypot(x-260,y-857)<40)return shuffleGroups();
    if(Math.hypot(x-355,y-857)<40){showToast('Shop placeholder');return}
  }
  const locked=state.slots[4];
  if(locked&&!locked.active&&Math.abs(x-locked.x)<=locked.w*.7&&Math.abs(y-locked.y)<=locked.h*.65)return unlockSlot();
  const t=hitTruck(x,y);if(t)dispatchTruck(t);
}
function autoMove(){if(state.boosters.auto<=0){showToast('No AUTO boosts left');return}const targetColor=frontRowColor();const candidates=state.yard.filter(t=>t.color===targetColor&&canDriveOut(t,state.yard));if(!candidates.length){showToast('No matching clear truck');return}state.boosters.auto--;dispatchTruck(candidates[0])}
function unlockSlot(){
  const s=state.slots[4];
  if(!s||s.active){showToast('Fifth parking slot already open');return}
  if(state.coins<100){showToast('100 coins needed');return}
  state.coins-=100;s.active=true;showToast('Fifth parking slot opened');
}
function shuffleGroups(){
  if(state.boosters.shuffle<=0){showToast('No shuffle available');return}
  const rowSlots=[];
  for(let r=0;r<LOOP_ROWS;r++)rowSlots.push(state.rotation.slice(r*4,r*4+4));
  const occupied=rowSlots.map((row,i)=>({row,i})).filter(x=>!x.row.every(c=>c==null));
  if(occupied.length<2){showToast('No shuffle available');return}

  state.boosters.shuffle--;
  const fixed=occupied[occupied.length-1];
  const movable=occupied.slice(0,-1).map(x=>x.row);
  for(let j=movable.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1));[movable[j],movable[k]]=[movable[k],movable[j]]}

  let m=0;
  for(const item of occupied){
    const row=item===fixed?fixed.row:movable[m++];
    for(let c=0;c<4;c++)state.rotation[item.i*4+c]=row[c];
  }
  showToast('Current rotation rows shuffled');
}
function showToast(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1300)}
function showResult(win){overlay.classList.remove('hidden');overlayBadge.textContent=win?'✓':'!';overlayBadge.style.background=win?'#e4f7eb':'#ffe8e8';overlayBadge.style.color=win?'#2b9f5d':'#d14e4e';overlayTitle.textContent=win?'DELIVERED!':'PARKING FULL';overlayText.textContent=win?'Every sweet has been loaded and sent for delivery.':'The parking area is full and none of the parked trucks can take the next colour in the centre rotation.';overlayPrimary.textContent=win?'NEXT LEVEL':'TRY AGAIN';overlayPrimary.onclick=()=>start(win?level+1:level);overlaySecondary.onclick=()=>start(level)}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}

let pressInfo=null;
function eventToGame(e){
  const r=canvas.getBoundingClientRect();
  return{x:(e.clientX-r.left-ox)/scale,y:(e.clientY-r.top-oy)/scale};
}
function inTruckSelectionArea(x,y){
  return x>=JAM.x&&x<=JAM.x+JAM.w&&y>=JAM.y&&y<=JAM.y+JAM.h;
}
canvas.addEventListener('pointerdown',e=>{
  e.preventDefault();
  const p=eventToGame(e);
  pointer.x=p.x;pointer.y=p.y;
  pressInfo={x:p.x,y:p.y,started:performance.now(),moved:false,inYard:inTruckSelectionArea(p.x,p.y)};
  if(pressInfo.inYard)state.holdFast=true;
  try{canvas.setPointerCapture(e.pointerId)}catch(_){}
},{passive:false});
canvas.addEventListener('pointermove',e=>{
  if(!pressInfo)return;
  const p=eventToGame(e);
  if(Math.hypot(p.x-pressInfo.x,p.y-pressInfo.y)>10)pressInfo.moved=true;
},{passive:false});
function finishPress(e,cancelled=false){
  if(!pressInfo)return;
  const info=pressInfo;pressInfo=null;
  state.holdFast=false;
  if(cancelled)return;
  const held=performance.now()-info.started;
  if(!info.moved&&held<320)handleTap(info.x,info.y);
}
canvas.addEventListener('pointerup',e=>{e.preventDefault();finishPress(e,false)},{passive:false});
canvas.addEventListener('pointercancel',e=>finishPress(e,true),{passive:false});
canvas.addEventListener('lostpointercapture',e=>{if(pressInfo)finishPress(e,true)},{passive:false});

function frame(ts){const dt=Math.min(.033,(ts-last)/1000||.016);last=ts;update(dt);drawBackground();drawQueue(dt);drawSlotsAndParked();drawGarage();drawYard();drawMotions();drawParticles();drawTopUI();drawBoosters();requestAnimationFrame(frame)}

let saved=1;try{saved=parseInt(localStorage.getItem('sweet-fever-level')||'1',10)}catch(_){}start(Number.isFinite(saved)&&saved>0?saved:1);requestAnimationFrame(frame);
})();