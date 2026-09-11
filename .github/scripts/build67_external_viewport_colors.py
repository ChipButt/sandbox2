from pathlib import Path
import re

root=Path('sweet-truck-jam')
game=root/'game.js'
index=root/'index.html'
style=root/'style.css'
s=game.read_text()

# Keep a direct handle to the visible game container so iOS Safari can be
# pinned to the visual viewport rather than the larger layout viewport.
old="const canvas=document.getElementById('game');\nconst ctx=canvas.getContext('2d');"
new="const app=document.getElementById('app');\nconst canvas=document.getElementById('game');\nconst ctx=canvas.getContext('2d');"
if old not in s:
    raise SystemExit('canvas declaration block not found')
s=s.replace(old,new,1)

old_resize='''function resize(){
  const r=canvas.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr);

  // Use the largest scale that keeps the entire 420x900 game frame visible.
  // This preserves the tight mobile framing without cropping the bottom of
  // the truck parking lot on shorter browser viewports.
  const sx=r.width/W, sy=r.height/H;
  scale=Math.min(sx,sy);
  ox=(r.width-W*scale)/2;
  oy=(r.height-H*scale)/2;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
}
addEventListener('resize',resize,{passive:true}); resize();'''
new_resize='''function resize(){
  // iOS Safari exposes a layout viewport that can be substantially taller
  // than the portion of the page actually visible between its browser bars.
  // Fit the game to the visual viewport so external-browser launches stay
  // centred and never leave a large false empty strip at the bottom.
  const vv=window.visualViewport;
  const vw=Math.max(1,Math.round(vv?.width||window.innerWidth||document.documentElement.clientWidth));
  const vh=Math.max(1,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight));
  const vx=vv?.offsetLeft||0,vy=vv?.offsetTop||0;

  app.style.width=`${vw}px`;
  app.style.height=`${vh}px`;
  app.style.transform=`translate(${vx}px,${vy}px)`;
  canvas.style.width=`${vw}px`;
  canvas.style.height=`${vh}px`;

  dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(vw*dpr);
  canvas.height=Math.round(vh*dpr);

  const sx=vw/W,sy=vh/H;
  scale=Math.min(sx,sy);
  ox=(vw-W*scale)/2;
  oy=(vh-H*scale)/2;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
}
addEventListener('resize',resize,{passive:true});
if(window.visualViewport){
  visualViewport.addEventListener('resize',resize,{passive:true});
  visualViewport.addEventListener('scroll',resize,{passive:true});
}
resize();
setTimeout(resize,80);
setTimeout(resize,350);'''
if old_resize not in s:
    raise SystemExit('resize block not found')
s=s.replace(old_resize,new_resize,1)

start=s.index('function assignChallengeColors(gen,r,n){')
end=s.index('function rowsForTruckOrder(gen,idOrder){',start)
assign=r'''function assignChallengeColors(gen,r,n){
  const physical=gen.trucks,all=allGeneratedTrucks(gen);

  // Purple and brown are now first-class gameplay colours. The previous
  // slice capped the palette at eight entries, which silently excluded brown.
  const palette=['red','blue','green','yellow','cyan','orange','pink','purple','brown'];
  const freeIds=new Set(physical.filter(t=>canDriveOut(t,physical)).map(t=>t.id));
  const freePalette=palette.slice(0,Math.min(4,palette.length));
  const blockedPalette=palette.slice(Math.max(0,palette.length-4));

  for(const t of physical){
    const blocks=t._blockCount||0;
    if(freeIds.has(t.id))t.color=choice(r,freePalette);
    else if(blocks>=2)t.color=choice(r,blockedPalette);
    else t.color=choice(r,palette);
  }
  if(gen.garage){
    for(const t of gen.garage.queue)t.color=choice(r,palette);
  }

  // Make both newly requested colours reliably part of every normal-sized
  // level rather than merely possible outcomes of the RNG. Prefer blocked
  // trucks so the added colours also increase puzzle variety.
  const targets=[...physical]
    .sort((a,b)=>(b._blockCount||0)-(a._blockCount||0));
  for(const required of ['purple','brown']){
    if(all.some(t=>t.color===required))continue;
    const target=targets.find(t=>!['purple','brown'].includes(t.color));
    if(target)target.color=required;
  }

  const deep=physical.filter(t=>!freeIds.has(t.id)&&(t._blockCount||0)>=2)
    .sort((a,b)=>(b._blockCount||0)-(a._blockCount||0));
  const reserved=palette.filter(c=>!freePalette.includes(c));
  if(deep.length&&reserved.length&&!['purple','brown'].includes(deep[0].color))deep[0].color=choice(r,reserved);
}
'''
s=s[:start]+assign+s[end:]

# Confirm the Build 66 garage collision model is still present while applying
# this independent viewport/colour patch.
for needle in [
    "const forced=n>=5;",
    "function truckCrossesGarage(t,x,y,g,pad=0)",
    "const SWEET_RADIUS=7;",
    "const ROTATION_CAPACITY=144;"
]:
    if needle not in s:
        raise SystemExit(f'expected current-build marker missing: {needle}')

game.write_text(s)
(root/'game67.js').write_text(s)

css=style.read_text()
old_app='#app{position:fixed;inset:0;display:grid;place-items:center;background:linear-gradient(#dfe8ef,#cdd9e3)}'
new_app='#app{position:absolute;left:0;top:0;width:100vw;height:100dvh;display:grid;place-items:center;background:linear-gradient(#dfe8ef,#cdd9e3);transform-origin:0 0}'
if old_app not in css:
    raise SystemExit('app CSS rule not found')
css=css.replace(old_app,new_app,1)
style.write_text(css)

html=index.read_text()
html=re.sub(r'style\.css\?v=\d+','style.css?v=67',html)
html=re.sub(r'game\d+\.js\?v=\d+','game67.js?v=67',html)
index.write_text(html)
