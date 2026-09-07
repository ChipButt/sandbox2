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
const ROTATION_CAPACITY=240;
const ROTATION_COLS=4;
const FEEDER_COLS=4;
const ROTATION_SPEED_ROWS=4.5;
const LOOP_ROWS=ROTATION_CAPACITY/ROTATION_COLS;
const LEFT_JOIN_ROW=12;
const RIGHT_JOIN_ROW=48;
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
  const pts=[];
  // Compact central conveyor loop. This is intentionally smaller than the
  // feeder stacks so the preview queues read as separate incoming supplies.
  const segs=[
    [[210,316],[178,319],[145,304],[134,264]],
    [[134,264],[122,214],[126,151],[154,116]],
    [[154,116],[182,88],[238,88],[267,112]],
    [[267,112],[294,138],[298,199],[289,248]],
    [[289,248],[282,290],[247,314],[210,316]]
  ];
  for(const seg of segs){for(let i=0;i<40;i++){const t=i/40,mt=1-t;pts.push({x:mt*mt*mt*seg[0][0]+3*mt*mt*t*seg[1][0]+3*mt*t*t*seg[2][0]+t*t*t*seg[3][0],y:mt*mt*mt*seg[0][1]+3*mt*mt*t*seg[1][1]+3*mt*t*t*seg[2][1]+t*t*t*seg[3][1]})}}
  pts.push({x:210,y:322});
  const dense=[]; let carry=0,prev=pts[0]; dense.push(prev);
  for(let i=1;i<pts.length;i++){
    const p=pts[i],dx=p.x-prev.x,dy=p.y-prev.y,d=Math.hypot(dx,dy); carry+=d;
    if(carry>=9){dense.push(p);carry=0} prev=p;
  }
  return dense;
}
candyPath=makeCandyPath();

function candyPos(index,phase=state?.rotationPhase||0){
  const row=Math.floor(index/ROTATION_COLS),col=index%ROTATION_COLS;
  const rowProgress=((row+phase)%LOOP_ROWS+LOOP_ROWS)%LOOP_ROWS;
  const pathProgress=rowProgress/LOOP_ROWS;
  const exact=pathProgress*(candyPath.length-1);
  const i0=Math.floor(exact),i1=(i0+1)%candyPath.length,t=exact-i0;
  const p0=candyPath[i0]||candyPath[0],p1=candyPath[i1]||candyPath[0];
  const x=lerp(p0.x,p1.x,t),y=lerp(p0.y,p1.y,t);
  let dx=p1.x-p0.x,dy=p1.y-p0.y;let len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
  const nx=-dy,ny=dx;const off=(col-(ROTATION_COLS-1)/2)*10.8;
  return{x:x+nx*off,y:y+ny*off};
}
function feederPos(side,index){
  const row=Math.floor(index/FEEDER_COLS),col=index%FEEDER_COLS;
  // Four-wide preview stacks continue upward beyond the visible screen. Only
  // the nearer upcoming rows are visible; deeper level contents stay hidden.
  const centreX=side==='left'?38:382;
  const y=286-row*12.8;
  const off=(col-(FEEDER_COLS-1)/2)*8.6;
  return{x:centreX+off,y};
}
function feederJoin(side,col){
  const row=side==='left'?LEFT_JOIN_ROW:RIGHT_JOIN_ROW;
  return candyPos(row*ROTATION_COLS+col,0);
}
function feederControl(side,col){
  const start=feederPos(side,col),join=feederJoin(side,col);
  // Gentle, shallow merge rather than a sharp curved launch.
  return{x:side==='left'?88:332,y:lerp(start.y,join.y,.66)};
}

function truckPoly(t,x=t.x,y=t.y,angle=t.angle){
  const hl=t.length/2, hw=t.width/2,c=Math.cos(angle),s=Math.sin(angle);
  return [[-hl,-hw],[hl,-hw],[hl,hw],[-hl,hw]].map(([px,py])=>({x:x+px*c-py*s,y:y+px*s+py*c}));
}
function project(poly,ax,ay){let mn=Infinity,mx=-Infinity;for(const p of poly){const v=p.x*ax+p.y*ay;mn=Math.min(mn,v);mx=Math.max(mx,v)}return[mn,mx]}
function polyOverlap(a,b){
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],ex=q.x-p.x,ey=q.y-p.y,l=Math.hypot(ex,ey)||1,ax=-ey/l,ay=ex/l;
    const A=project(a,ax,ay),B=project(b,ax,ay); if(A[1]<B[0]+2||B[1]<A[0]+2)return false;
  } return true;
}
function insideJam(t,x=t.x,y=t.y){const p=truckPoly(t,x,y);return p.some(v=>v.x>JAM.x&&v.x<JAM.x+JAM.w&&v.y>JAM.y&&v.y<JAM.y+JAM.h)}
function canDriveOut(t,trucks){
  const dx=Math.cos(t.angle),dy=Math.sin(t.angle),others=trucks.filter(o=>o.id!==t.id);
  for(let d=7;d<520;d+=7){const x=t.x+dx*d,y=t.y+dy*d,p=truckPoly(t,x,y);for(const o of others)if(polyOverlap(p,truckPoly(o)))return false;if(!insideJam(t,x,y))return true}
  return true;
}
function initialClearCount(trucks){return trucks.filter(t=>canDriveOut(t,trucks)).length}
function removalOrder(trucks,r){const rem=trucks.map(t=>({...t})),out=[];while(rem.length){const free=rem.filter(t=>canDriveOut(t,rem));if(!free.length)return null;const t=choice(r,free);out.push(t.id);rem.splice(rem.findIndex(x=>x.id===t.id),1)}return out}

function validateGeneratedLevel(gen){
  if(!gen||!Array.isArray(gen.trucks)||!Array.isArray(gen.order)||gen.trucks.length!==gen.order.length)return false;
  if(gen.trucks.some(t=>t.capacity<=0||t.capacity%4!==0))return false;

  const remaining=gen.trucks.map(t=>({...t}));
  for(const id of gen.order){
    const idx=remaining.findIndex(t=>t.id===id);
    if(idx<0||!canDriveOut(remaining[idx],remaining))return false;
    remaining.splice(idx,1);
  }
  if(remaining.length)return false;

  const q=makeQueue(gen);
  if(q.length%4!==0)return false;
  for(let i=0;i<q.length;i+=4){
    if(q.slice(i,i+4).length!==4)return false;
    const c=q[i].color;
    if(q.slice(i,i+4).some(x=>x.color!==c))return false;
  }
  return q.length===gen.trucks.reduce((sum,t)=>sum+t.capacity,0);
}

function generateLevel(n){
  for(let attempt=0;attempt<180;attempt++){
    const R=rng(n*73471+attempt*977+19),count=Math.min(17+Math.floor(n*.35),22),trucks=[];
    for(let i=0;i<count;i++){
      let placed=false;
      for(let k=0;k<450&&!placed;k++){
        const kind=R()<.18?2:R()<.55?1:0;
        const length=[48,59,72][kind],width=[25,27,29][kind];
        const a=choice(R,[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,5*Math.PI/4,3*Math.PI/2,7*Math.PI/4]);
        const t={id:`t${i}`,x:rint(R,JAM.x+34,JAM.x+JAM.w-34),y:rint(R,JAM.y+34,JAM.y+JAM.h-34),angle:a,length,width,capacity:[20,28,36][kind],kind,color:'red'};
        const poly=truckPoly(t); if(poly.some(p=>p.x<JAM.x+4||p.x>JAM.x+JAM.w-4||p.y<JAM.y+4||p.y>JAM.y+JAM.h-4))continue;
        if(trucks.some(o=>polyOverlap(poly,truckPoly(o))))continue; trucks.push(t);placed=true;
      }
    }
    if(trucks.length<count-2)continue;
    const clear=initialClearCount(trucks); if(clear<2||clear>Math.max(6,trucks.length*.62))continue;
    const order=removalOrder(trucks,R); if(!order)continue;
    const palette=COLOR_NAMES.slice(0,Math.min(5+Math.floor(n/5),8));
    const colorPlan=[]; for(let i=0;i<order.length;i++){let c=choice(R,palette);if(i>0&&c===colorPlan[i-1]&&R()<.7)c=choice(R,palette.filter(x=>x!==c));colorPlan.push(c)}
    const byId=new Map(trucks.map(t=>[t.id,t])); order.forEach((id,i)=>byId.get(id).color=colorPlan[i]);
    const gen={trucks,order};
    if(validateGeneratedLevel(gen))return gen;
  }
  return fallbackLevel(n);
}
function fallbackLevel(n){
  const R=rng(n*91+4);
  const ys=[540,575,610,645,680,715,750,785];
  const trucks=ys.map((y,i)=>{
    const kind=i%3;
    const left=i%2===0;
    return{
      id:`t${i}`,
      x:left?82:338,
      y,
      angle:left?Math.PI:0,
      kind,
      length:[48,59,72][kind],
      width:[25,27,29][kind],
      capacity:[20,28,36][kind],
      color:choice(R,COLOR_NAMES.slice(0,5))
    };
  });
  const order=removalOrder(trucks,R);
  if(!order)throw new Error('Guaranteed fallback unexpectedly unsolvable');
  const gen={trucks,order};
  if(!validateGeneratedLevel(gen))throw new Error('Fallback validation failed');
  return gen;
}
function makeQueue(gen){
  const by=new Map(gen.trucks.map(t=>[t.id,t])),q=[];let cid=0;
  for(const id of gen.order){
    const t=by.get(id);
    if(!t||t.capacity%4!==0)throw new Error('Invalid truck capacity for 4-sweet rows');
    for(let i=0;i<t.capacity;i++)q.push({id:`c${cid++}`,color:t.color,visualIndex:q.length,entryT:1});
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
  leftFeed.forEach((c,i)=>c.feedVisualIndex=i);
  rightFeed.forEach((c,i)=>c.feedVisualIndex=i);

  if(!loopRowsAreValid(rotation)||!rowsAreValid(leftFeed)||!rowsAreValid(rightFeed))throw new Error('Sweet pool row integrity failed');
  return{rotation,leftFeed,rightFeed};
}
function makeSlots(){
  const xs=[90,150,210,270,330];
  return xs.map((x,i)=>({x,y:SLOT_Y,w:46,h:72,type:i===4?'plus':'normal',active:i<4,truck:null}));
}
function newState(n){
  const gen=generateLevel(n),pools=splitSweetPools(gen);
  return{level:n,yard:gen.trucks.map(t=>({...t,state:'yard'})),all:new Map(gen.trucks.map(t=>[t.id,{...t}])),rotation:pools.rotation,leftFeed:pools.leftFeed,rightFeed:pools.rightFeed,slots:makeSlots(),motions:[],particles:[],boarding:null,departures:[],won:false,lost:false,boosters:{shuffle:2,auto:2},coins:250+(n-1)*15,time:0,rotationPhase:0,holdFast:false};
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
  for(let i=0;i<4;i++){
    const c=row[i],fp=feederPos(side,i);
    c.entryT=0;
    c.entryFrom={x:fp.x,y:fp.y};
    c.entryControl=feederControl(side,i);
    c.entryJoin=feederJoin(side,i);
    state.rotation[base+i]=c;
  }
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
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  // central rotation track
  ctx.beginPath();candyPath.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#aebbc4';ctx.lineWidth=52;ctx.stroke();
  ctx.beginPath();candyPath.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#f7fafc';ctx.lineWidth=46;ctx.stroke();
  ctx.beginPath();candyPath.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#d6e0e6';ctx.lineWidth=40;ctx.stroke();

  // Four-wide feeder lanes connect into the centre loop through empty curved
  // junctions. Waiting feeder sweets stop before the junction, so they never overlap
  // the circulating sweets; only an actively transferred row crosses the connector.
  for(const side of ['left','right']){
    const x=side==='left'?38:382;
    const join=side==='left'?{x:112,y:265}:{x:308,y:252};
    const control=side==='left'?{x:72,y:284}:{x:348,y:278};
    for(const stroke of [
      {w:40,c:'#aebbc4'},
      {w:36,c:'#f7fafc'},
      {w:32,c:'#d6e0e6'}
    ]){
      ctx.beginPath();
      ctx.moveTo(x,22);
      ctx.lineTo(x,300);
      ctx.quadraticCurveTo(control.x,control.y,join.x,join.y);
      ctx.strokeStyle=stroke.c;ctx.lineWidth=stroke.w;ctx.stroke();
    }
  }
  ctx.restore();
  roundedRect(185,317,50,43,15,'#778798','#f7fafc',4);
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
function drawFeederCandy(c,side,index,dt){
  if(c.feedVisualIndex==null)c.feedVisualIndex=index;
  c.feedVisualIndex+=(index-c.feedVisualIndex)*Math.min(1,dt*8);
  const p=feederPos(side,c.feedVisualIndex),col=COLORS[c.color];
  ctx.save();ctx.translate(p.x,p.y);ctx.beginPath();ctx.arc(1.4,2.1,5.1,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.17)';ctx.fill();ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.beginPath();ctx.arc(-1.6,-1.7,1.45,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.43)';ctx.fill();ctx.restore();
}
function drawQueue(dt){
  for(let i=state.leftFeed.length-1;i>=0;i--)drawFeederCandy(state.leftFeed[i],'left',i,dt);
  for(let i=state.rightFeed.length-1;i>=0;i--)drawFeederCandy(state.rightFeed[i],'right',i,dt);

  for(let i=state.rotation.length-1;i>=0;i--){
    const c=state.rotation[i];
    if(!c)continue;

    if(c.entryT<1)c.entryT=Math.min(1,c.entryT+dt*1.85);
    if(c.entryT<1&&c.entryFrom){
      const to=candyPos(i),u=ease(c.entryT);
      let x,y;
      if(u<.78){
        const v=u/.78,q=1-v,cp=c.entryControl||c.entryFrom,jp=c.entryJoin||to;
        x=q*q*c.entryFrom.x+2*q*v*cp.x+v*v*jp.x;
        y=q*q*c.entryFrom.y+2*q*v*cp.y+v*v*jp.y;
      }else{
        const v=(u-.78)/.22,jp=c.entryJoin||c.entryFrom;
        x=lerp(jp.x,to.x,v);y=lerp(jp.y,to.y,v);
      }
      const col=COLORS[c.color];ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.arc(0,0,5.2,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.restore();
    }else{
      const p=candyPos(i),col=COLORS[c.color];
      ctx.save();ctx.translate(p.x,p.y);ctx.beginPath();ctx.arc(1.5,2.3,5.3,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fill();ctx.beginPath();ctx.arc(0,0,5.2,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.beginPath();ctx.arc(-1.7,-1.8,1.6,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.45)';ctx.fill();ctx.restore();
    }
  }
}

function drawTruck(t,x=t.x,y=t.y,a=t.angle,parked=false){
  ctx.save();ctx.translate(x,y);ctx.rotate(a);
  const L=t.length,WW=t.width,body=COLORS[t.color]||'#999';
  // shadow
  ctx.save();ctx.translate(2.5,3.5);roundedRect(-L/2,-WW/2,L,WW,6,'rgba(35,45,56,.24)');ctx.restore();
  // wheels
  ctx.fillStyle='#28303a';for(const sx of [-L*.28,L*.28]){roundedRect(sx-5,-WW/2-2,10,4,2,'#252b33');roundedRect(sx-5,WW/2-2,10,4,2,'#252b33')}
  // body
  roundedRect(-L/2,-WW/2,L,WW,6,body,'rgba(83,53,40,.22)',1.5);
  // cargo roof
  roundedRect(-L/2+3,-WW/2+3,L*.64-3,WW-6,4,shade(body,-.05),'rgba(255,255,255,.18)',1);
  // cab front on +x
  roundedRect(L*.16,-WW/2+3,L*.31,WW-6,4,shade(body,.04),'rgba(255,255,255,.22)',1);
  ctx.fillStyle='rgba(217,244,255,.85)';roundedRect(L*.31,-WW/2+5,L*.11,WW-10,2,'rgba(207,239,250,.9)');
  if(!parked){
    ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=3.2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(10,0);ctx.stroke();ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(3,-6);ctx.lineTo(3,6);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}
function shade(hex,amt){const n=parseInt(hex.slice(1),16),r=clamp((n>>16)+255*amt,0,255),g=clamp(((n>>8)&255)+255*amt,0,255),b=clamp((n&255)+255*amt,0,255);return`rgb(${r|0},${g|0},${b|0})`}

function drawYard(){
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
    drawTruck(t,x,y);
  }
}
function drawSlotsAndParked(){
  for(let i=0;i<state.slots.length;i++){const s=state.slots[i],t=s.truck;if(!t)continue;drawTruck(t,s.x,s.y,-Math.PI/2,true);const left=t.capacity-(t.loaded||0);text(String(left),s.x,s.y+s.h/2+13,14,'#ffd743','center',1000);ctx.strokeStyle='rgba(66,50,20,.25)'}
}
function drawMotions(){for(const m of state.motions){const p=motionPose(m);drawTruck(m.truck,p.x,p.y,p.a,true)}}
function motionPose(m){
  const t=clamp(m.t/m.duration,0,1);
  if(m.type==='dispatch'){
    if(t<.38){const u=ease(t/.38);return{x:lerp(m.sx,m.ex,u),y:lerp(m.sy,m.ey,u),a:m.sa}}
    const u=easeOut((t-.38)/.62),q=1-u;return{x:q*q*m.ex+2*q*u*m.cx+u*u*m.tx,y:q*q*m.ey+2*q*u*m.cy+u*u*m.ty,a:angleLerp(m.sa,-Math.PI/2,u)}
  }
  if(m.type==='depart'){
    const u=easeOut(t);return{x:lerp(m.sx,m.tx,u),y:lerp(m.sy,m.ty,u),a:angleLerp(-Math.PI/2,0,u)}
  }
  return{x:m.sx,y:m.sy,a:m.sa}
}
function drawParticles(){
  for(const p of state.particles){const u=clamp(p.t/p.duration,0,1),q=1-u,x=q*q*p.sx+2*q*u*p.cx+u*u*p.tx,y=q*q*p.sy+2*q*u*p.cy+u*u*p.ty - Math.sin(u*Math.PI)*5;ctx.globalAlpha=1-u*.18;ctx.beginPath();ctx.arc(x,y,4.8*(1-u*.10),0,Math.PI*2);ctx.fillStyle=COLORS[p.color];ctx.fill();ctx.beginPath();ctx.arc(x-1.5,y-1.5,1.3,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.48)';ctx.fill();ctx.globalAlpha=1}
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
  for(const p of state.particles)p.t+=dt;state.particles=state.particles.filter(p=>p.t<p.duration);

  updateRotationConveyor(dt);
}
function finishMotion(m){
  if(m.type==='dispatch'){
    const s=state.slots[m.slot];s.truck=m.truck;m.truck.loaded=0;m.truck.state='parked';
    if(!state.boarding)beginBoardingIfPossible();
  }else if(m.type==='depart'){
    const s=state.slots[m.slot];s.truck=null;beginBoardingIfPossible();checkEnd();
  }
}
function frontRowColor(){
  // Next occupied row that will reach the outlet, ignoring travelling gaps.
  for(let r=LOOP_ROWS-1;r>=0;r--){
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
  let mult=1;
  if(allTrucksCommitted)mult*=2;
  if(state.holdFast)mult*=2;
  return mult;
}
function updateRotationConveyor(dt){
  state.rotationPhase+=dt*ROTATION_SPEED_ROWS*conveyorSpeedMultiplier();
  while(state.rotationPhase>=1){
    state.rotationPhase-=1;
    advanceLoopOneRow();
  }
}
function advanceLoopOneRow(){
  const base=(LOOP_ROWS-1)*ROTATION_COLS;
  const outletRow=state.rotation.slice(base,base+4);
  const isGap=outletRow.every(c=>c==null);
  if(!isGap&&(outletRow.some(c=>c==null)||outletRow.some(c=>c.color!==outletRow[0].color)))throw new Error('Invalid row reached outlet');

  let wrapped=outletRow;
  if(!isGap){
    const rowColor=outletRow[0].color;
    const slotIndex=state.slots.findIndex(s=>s.truck&&s.truck.color===rowColor&&((s.truck.loaded||0)+4)<=s.truck.capacity);

    if(slotIndex>=0){
      const slot=state.slots[slotIndex],truck=slot.truck;
      for(let i=0;i<4;i++){
        const c=outletRow[i],cp=candyPos(base+i,1),lateral=(i-1.5)*4.5;
        state.particles.push({
          color:c.color,
          sx:cp.x,sy:cp.y,
          cx:lerp(cp.x,slot.x,.55)+lateral,
          cy:Math.min(cp.y,slot.y)-24,
          tx:slot.x+lateral,ty:slot.y-8,
          t:0,duration:.34
        });
      }
      truck.loaded=(truck.loaded||0)+4;
      if(truck.loaded>=truck.capacity)setTimeout(()=>startDeparture(slotIndex),110);
      wrapped=[null,null,null,null]; // the departing row leaves a real travelling gap
    }
  }

  // Advance every physical row one slot around the loop. The outlet row wraps to slot 0
  // unless it was diverted to a truck, in which case a four-wide empty gap wraps instead.
  state.rotation=[...wrapped,...state.rotation.slice(0,base)];

  // A feeder may fill the gap ONLY when that gap reaches its actual merge position.
  processFeederJunctions();

  if(!loopRowsAreValid(state.rotation))throw new Error('Rotation row integrity lost');
  checkEnd();
}
function startDeparture(slotIndex){
  if(!state||state.won||state.lost)return;const s=state.slots[slotIndex],t=s?.truck;if(!t)return;s.truck=null;
  state.motions.push({type:'depart',truck:t,slot:slotIndex,sx:s.x,sy:s.y,sa:-Math.PI/2,tx:W+90,ty:360,t:0,duration:.55});
  checkEnd();
}
function checkEnd(){
  if(sweetsRemaining()===0&&state.yard.length===0&&state.slots.every(s=>!s.truck)&&state.motions.length===0){state.won=true;showResult(true);return}

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
    if(others.some(o=>polyOverlap(p,truckPoly(o))))return Math.max(3,d-1);
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
function dispatchTruck(t){
  const open=state.slots.findIndex(s=>s.active&&!s.truck&&!state.motions.some(m=>m.type==='dispatch'&&m.slot===state.slots.indexOf(s)));
  if(open<0){showToast('No free parking slot');return}
  if(!canDriveOut(t,state.yard)){blockedBump(t);return}
  state.yard=state.yard.filter(x=>x.id!==t.id);
  const dir={x:Math.cos(t.angle),y:Math.sin(t.angle)};let d=0,ex=t.x,ey=t.y;while(d<520){d+=10;ex=t.x+dir.x*d;ey=t.y+dir.y*d;if(!insideJam(t,ex,ey))break}
  const slot=state.slots[open],cx=clamp((ex+slot.x)/2+(slot.y-ey)*.18,30,W-30),cy=clamp(Math.min(ey,slot.y)-55,350,485);
  state.motions.push({type:'dispatch',truck:t,slot:open,sx:t.x,sy:t.y,sa:t.angle,ex,ey,cx,cy,tx:slot.x,ty:slot.y,t:0,duration:.78});
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

function frame(ts){const dt=Math.min(.033,(ts-last)/1000||.016);last=ts;update(dt);drawBackground();drawQueue(dt);drawSlotsAndParked();drawYard();drawMotions();drawParticles();drawTopUI();drawBoosters();requestAnimationFrame(frame)}

let saved=1;try{saved=parseInt(localStorage.getItem('sweet-fever-level')||'1',10)}catch(_){}start(Number.isFinite(saved)&&saved>0?saved:1);requestAnimationFrame(frame);
})();