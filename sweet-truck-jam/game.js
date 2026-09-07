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
const ROTATION_COLS=5;
const FEEDER_COLS=6;
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
  const segs=[
    [[210,333],[168,340],[93,322],[78,267]],
    [[78,267],[62,213],[68,118],[116,82]],
    [[116,82],[172,38],[292,48],[337,107]],
    [[337,107],[375,157],[369,247],[331,294]],
    [[331,294],[300,329],[254,336],[222,329]]
  ];
  for(const s of segs){for(let i=0;i<40;i++){const t=i/40,mt=1-t;pts.push({x:mt*mt*mt*s[0][0]+3*mt*mt*t*s[1][0]+3*mt*t*t*s[2][0]+t*t*t*s[3][0],y:mt*mt*mt*s[0][1]+3*mt*mt*t*s[1][1]+3*mt*t*t*s[2][1]+t*t*t*s[3][1]})}}
  pts.push({x:222,y:329});
  const dense=[]; let carry=0,prev=pts[0]; dense.push(prev);
  for(let i=1;i<pts.length;i++){
    const p=pts[i],dx=p.x-prev.x,dy=p.y-prev.y,d=Math.hypot(dx,dy); carry+=d;
    if(carry>=9){dense.push(p);carry=0} prev=p;
  }
  return dense;
}
candyPath=makeCandyPath();

function candyPos(index){
  const row=Math.floor(index/ROTATION_COLS),col=index%ROTATION_COLS;
  const rows=Math.ceil(ROTATION_CAPACITY/ROTATION_COLS);
  const progress=rows<=1?0:row/(rows-1);
  const pi=Math.min(candyPath.length-1,Math.round(progress*(candyPath.length-1)));
  const p=candyPath[pi]||candyPath[candyPath.length-1];
  const p2=candyPath[Math.min(pi+1,candyPath.length-1)]||p;
  let dx=p2.x-p.x,dy=p2.y-p.y;let len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
  const nx=-dy,ny=dx; const off=(col-(ROTATION_COLS-1)/2)*10.6;
  return{x:p.x+nx*off,y:p.y+ny*off};
}
function feederPos(side,index){
  const row=Math.floor(index/FEEDER_COLS),col=index%FEEDER_COLS;
  const baseX=side==='left'?42:378;
  const y=66+row*9.3;
  const off=(col-(FEEDER_COLS-1)/2)*8.7;
  const curve=Math.min(1,row/22);
  return{x:baseX+off+(side==='left'?1:-1)*curve*16,y};
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

function generateLevel(n){
  for(let attempt=0;attempt<180;attempt++){
    const R=rng(n*73471+attempt*977+19),count=Math.min(17+Math.floor(n*.35),22),trucks=[];
    for(let i=0;i<count;i++){
      let placed=false;
      for(let k=0;k<450&&!placed;k++){
        const kind=R()<.18?2:R()<.55?1:0;
        const length=[48,59,72][kind],width=[25,27,29][kind];
        const a=choice(R,[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,5*Math.PI/4,3*Math.PI/2,7*Math.PI/4]);
        const t={id:`t${i}`,x:rint(R,JAM.x+34,JAM.x+JAM.w-34),y:rint(R,JAM.y+34,JAM.y+JAM.h-34),angle:a,length,width,capacity:[20,26,34][kind],kind,color:'red'};
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
    return{trucks,order};
  }
  return fallbackLevel(n);
}
function fallbackLevel(n){
  const data=[
    [70,555,0,0],[140,552,Math.PI/2,1],[208,552,Math.PI/4,0],[292,555,Math.PI,1],[350,570,Math.PI/2,0],
    [82,635,Math.PI/2,1],[150,628,0,0],[220,632,Math.PI,2],[306,630,3*Math.PI/4,0],[355,650,Math.PI/2,1],
    [65,735,0,2],[150,724,7*Math.PI/4,0],[235,725,Math.PI/2,1],[320,730,Math.PI,1]
  ];
  const r=rng(n*91+4);const trucks=data.map((a,i)=>{const kind=a[3],t={id:`t${i}`,x:a[0],y:a[1],angle:a[2],kind,length:[48,59,72][kind],width:[25,27,29][kind],capacity:[20,26,34][kind],color:choice(r,COLOR_NAMES.slice(0,5))};return t});
  const order=removalOrder(trucks,r)||trucks.map(t=>t.id);return{trucks,order};
}
function makeQueue(gen){const by=new Map(gen.trucks.map(t=>[t.id,t])),q=[];let cid=0;for(const id of gen.order){const t=by.get(id);for(let i=0;i<t.capacity;i++)q.push({id:`c${cid++}`,color:t.color,visualIndex:q.length,entryT:1})}return q}
function splitSweetPools(gen){
  const all=makeQueue(gen);
  const rotation=all.splice(0,Math.min(ROTATION_CAPACITY,all.length));
  rotation.forEach((c,i)=>{c.visualIndex=i;c.entryT=1});
  const leftCount=Math.ceil(all.length/2);
  const leftFeed=all.splice(0,leftCount),rightFeed=all;
  return{rotation,leftFeed,rightFeed};
}
function makeSlots(){
  const xs=[90,150,210,270,330];
  return xs.map((x,i)=>({x,y:SLOT_Y,w:46,h:72,type:i===4?'plus':'normal',active:i<4,truck:null}));
}
function newState(n){
  const gen=generateLevel(n),pools=splitSweetPools(gen);
  return{level:n,yard:gen.trucks.map(t=>({...t,state:'yard'})),all:new Map(gen.trucks.map(t=>[t.id,{...t}])),rotation:pools.rotation,leftFeed:pools.leftFeed,rightFeed:pools.rightFeed,slots:makeSlots(),motions:[],particles:[],boarding:null,departures:[],won:false,lost:false,boosters:{shuffle:2,auto:2},coins:250+(n-1)*15,time:0};
}
function sweetsRemaining(){return state.rotation.length+state.leftFeed.length+state.rightFeed.length}
function refillRotation(){
  while(state.rotation.length<ROTATION_CAPACITY&&(state.leftFeed.length||state.rightFeed.length)){
    const source=state.leftFeed.length?state.leftFeed:state.rightFeed;
    const side=state.leftFeed.length?'left':'right';
    const c=source.shift();
    const fp=feederPos(side,0);
    c.visualIndex=state.rotation.length;
    c.entryT=0;
    c.entryFrom={x:fp.x,y:fp.y};
    state.rotation.push(c);
  }
}
function start(n){level=n;state=newState(n);overlay.classList.add('hidden');saveLevel();showToast('Tap a truck with a clear path');}
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
  ctx.beginPath();candyPath.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#aebbc4';ctx.lineWidth=88;ctx.stroke();
  ctx.beginPath();candyPath.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#f7fafc';ctx.lineWidth=78;ctx.stroke();
  ctx.beginPath();candyPath.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#d6e0e6';ctx.lineWidth=70;ctx.stroke();

  // left and right feeder channels: left drains completely before right begins
  for(const side of ['left','right']){
    const x=side==='left'?42:378,join=side==='left'?84:336;
    ctx.beginPath();ctx.moveTo(x,58);ctx.lineTo(x,215);ctx.quadraticCurveTo(x,265,join,286);
    ctx.strokeStyle='#aebbc4';ctx.lineWidth=61;ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,58);ctx.lineTo(x,215);ctx.quadraticCurveTo(x,265,join,286);
    ctx.strokeStyle='#f7fafc';ctx.lineWidth=53;ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,58);ctx.lineTo(x,215);ctx.quadraticCurveTo(x,265,join,286);
    ctx.strokeStyle='#d6e0e6';ctx.lineWidth=46;ctx.stroke();
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
function drawFeederCandy(c,side,index){
  const p=feederPos(side,index),col=COLORS[c.color];
  ctx.save();ctx.translate(p.x,p.y);ctx.beginPath();ctx.arc(1.4,2.1,5.1,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.17)';ctx.fill();ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.beginPath();ctx.arc(-1.6,-1.7,1.45,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.43)';ctx.fill();ctx.restore();
}
function drawQueue(dt){
  // preview feeders remain visible while only the centre rotation is playable
  for(let i=state.leftFeed.length-1;i>=0;i--)drawFeederCandy(state.leftFeed[i],'left',i);
  for(let i=state.rightFeed.length-1;i>=0;i--)drawFeederCandy(state.rightFeed[i],'right',i);

  for(let i=state.rotation.length-1;i>=0;i--){
    const c=state.rotation[i],target=i;
    c.visualIndex+=(target-c.visualIndex)*Math.min(1,dt*5.5);
    if(c.entryT<1)c.entryT=Math.min(1,c.entryT+dt*2.8);
    if(c.entryT<1&&c.entryFrom){
      const to=candyPos(c.visualIndex),u=easeOut(c.entryT);
      const x=lerp(c.entryFrom.x,to.x,u),y=lerp(c.entryFrom.y,to.y,u);
      const col=COLORS[c.color];ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.arc(0,0,5.2,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.restore();
    }else drawCandy(c,i);
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

function drawYard(){for(const t of state.yard){let x=t.x,y=t.y;if(t.shake>0){x+=Math.sin(state.time*70)*4*(t.shake/.3)}drawTruck(t,x,y)}}
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
  for(const t of state.yard)if(t.shake>0)t.shake=Math.max(0,t.shake-dt);
  for(const m of state.motions)m.t+=dt;
  for(let i=state.motions.length-1;i>=0;i--){const m=state.motions[i];if(m.t>=m.duration){state.motions.splice(i,1);finishMotion(m)}}
  for(const p of state.particles)p.t+=dt;state.particles=state.particles.filter(p=>p.t<p.duration);
  updateBoarding(dt);
}
function finishMotion(m){
  if(m.type==='dispatch'){
    const s=state.slots[m.slot];s.truck=m.truck;m.truck.loaded=0;m.truck.state='parked';
    if(!state.boarding)beginBoardingIfPossible();
  }else if(m.type==='depart'){
    const s=state.slots[m.slot];s.truck=null;beginBoardingIfPossible();checkEnd();
  }
}
function beginBoardingIfPossible(){
  if(state.boarding||!state.rotation.length)return;
  const color=state.rotation[0].color;
  const idx=state.slots.findIndex(s=>s.truck&&s.truck.color===color&&(s.truck.loaded||0)<s.truck.capacity);
  if(idx>=0)state.boarding={slot:idx,timer:.18};
}
function updateBoarding(dt){
  if(!state.boarding){beginBoardingIfPossible();return}
  const b=state.boarding,s=state.slots[b.slot],t=s?.truck;if(!t){state.boarding=null;return}
  if(!state.rotation.length||state.rotation[0].color!==t.color){state.boarding=null;return}
  b.timer-=dt;if(b.timer>0)return;b.timer=.12;
  const c=state.rotation.shift();const cp=candyPos(c.visualIndex);
  state.particles.push({color:c.color,sx:cp.x,sy:cp.y,cx:lerp(cp.x,s.x,.55),cy:Math.min(cp.y,s.y)-24,tx:s.x,ty:s.y-8,t:0,duration:.32});
  t.loaded=(t.loaded||0)+1;
  refillRotation();
  if(t.loaded>=t.capacity){state.boarding=null;setTimeout(()=>startDeparture(b.slot),90)}
}
function startDeparture(slotIndex){
  if(!state||state.won||state.lost)return;const s=state.slots[slotIndex],t=s?.truck;if(!t)return;s.truck=null;
  state.motions.push({type:'depart',truck:t,slot:slotIndex,sx:s.x,sy:s.y,sa:-Math.PI/2,tx:W+90,ty:360,t:0,duration:.55});
  beginBoardingIfPossible();
}
function checkEnd(){
  if(sweetsRemaining()===0&&state.yard.length===0&&state.slots.every(s=>!s.truck)&&state.motions.length===0){state.won=true;showResult(true);return}
  const active=state.slots.filter(s=>s.active),full=active.every(s=>s.truck);
  if(full&&state.rotation.length){const c=state.rotation[0].color;if(!active.some(s=>s.truck&&s.truck.color===c)){state.lost=true;showResult(false)}}
}

function dispatchTruck(t){
  const open=state.slots.findIndex(s=>s.active&&!s.truck&&!state.motions.some(m=>m.type==='dispatch'&&m.slot===state.slots.indexOf(s)));
  if(open<0){showToast('No free parking slot');return}
  if(!canDriveOut(t,state.yard)){showToast('That truck is blocked');shakeTruck(t);return}
  state.yard=state.yard.filter(x=>x.id!==t.id);
  const dir={x:Math.cos(t.angle),y:Math.sin(t.angle)};let d=0,ex=t.x,ey=t.y;while(d<520){d+=10;ex=t.x+dir.x*d;ey=t.y+dir.y*d;if(!insideJam(t,ex,ey))break}
  const s=state.slots[open];const cx=clamp((ex+s.x)/2+(s.y-ey)*.18,30,W-30),cy=clamp(Math.min(ey,s.y)-55,350,485);
  state.motions.push({type:'dispatch',truck:t,slot:open,sx:t.x,sy:t.y,sa:t.angle,ex,ey,cx,cy,tx:s.x,ty:s.y,t:0,duration:.78});
  showToast(`${cap(t.color)} truck dispatched`);navigator.vibrate?.(12);
}
function shakeTruck(t){t.shake=.3}

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
function autoMove(){if(state.boosters.auto<=0){showToast('No AUTO boosts left');return}const targetColor=state.rotation[0]?.color;const candidates=state.yard.filter(t=>t.color===targetColor&&canDriveOut(t,state.yard));if(!candidates.length){showToast('No matching clear truck');return}state.boosters.auto--;dispatchTruck(candidates[0])}
function unlockSlot(){
  const s=state.slots[4];
  if(!s||s.active){showToast('Fifth parking slot already open');return}
  if(state.coins<100){showToast('100 coins needed');return}
  state.coins-=100;s.active=true;showToast('Fifth parking slot opened');
}
function shuffleGroups(){
  if(state.boosters.shuffle<=0||state.rotation.length<2){showToast('No shuffle available');return}
  state.boosters.shuffle--;const groups=[];let i=0;
  while(i<state.rotation.length){const c=state.rotation[i].color,g=[];while(i<state.rotation.length&&state.rotation[i].color===c)g.push(state.rotation[i++]);groups.push(g)}
  for(let j=groups.length-1;j>1;j--){const k=1+Math.floor(Math.random()*j);[groups[j],groups[k]]=[groups[k],groups[j]]}
  state.rotation=groups.flat();state.rotation.forEach((c,i)=>c.visualIndex=i);showToast('Current rotation shuffled');
}

function showToast(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1300)}
function showResult(win){overlay.classList.remove('hidden');overlayBadge.textContent=win?'✓':'!';overlayBadge.style.background=win?'#e4f7eb':'#ffe8e8';overlayBadge.style.color=win?'#2b9f5d':'#d14e4e';overlayTitle.textContent=win?'DELIVERED!':'PARKING FULL';overlayText.textContent=win?'Every sweet has been loaded and sent for delivery.':'The parking area is full and none of the parked trucks can take the next colour in the centre rotation.';overlayPrimary.textContent=win?'NEXT LEVEL':'TRY AGAIN';overlayPrimary.onclick=()=>start(win?level+1:level);overlaySecondary.onclick=()=>start(level)}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}

canvas.addEventListener('pointerdown',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left-ox)/scale;pointer.y=(e.clientY-r.top-oy)/scale;handleTap(pointer.x,pointer.y)},{passive:false});

function frame(ts){const dt=Math.min(.033,(ts-last)/1000||.016);last=ts;update(dt);drawBackground();drawQueue(dt);drawSlotsAndParked();drawYard();drawMotions();drawParticles();drawTopUI();drawBoosters();requestAnimationFrame(frame)}

let saved=1;try{saved=parseInt(localStorage.getItem('sweet-fever-level')||'1',10)}catch(_){}start(Number.isFinite(saved)&&saved>0?saved:1);requestAnimationFrame(frame);
})();