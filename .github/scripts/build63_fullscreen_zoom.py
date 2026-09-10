from pathlib import Path
import re

root = Path('sweet-truck-jam')
game = root / 'game.js'
index = root / 'index.html'

src = game.read_text()

old_resize = '''function resize(){
  const r=canvas.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr);
  const sx=r.width/W, sy=r.height/H; scale=Math.min(sx,sy); ox=(r.width-W*scale)/2; oy=(r.height-H*scale)/2;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
}'''
new_resize = '''function resize(){
  const r=canvas.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr);

  // Frame the game like the mobile reference: fill the entire screen and
  // sit slightly closer to the playfield instead of letterboxing the 420x900
  // design canvas. A small intentional crop is kept at the extreme outer
  // edges only; all interactive UI remains inside the visible safe frame.
  const sx=r.width/W, sy=r.height/H;
  const base=Math.max(sx,sy);
  const cameraZoom=1.03;
  scale=base*cameraZoom;
  ox=(r.width-W*scale)/2;
  oy=-4*scale;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
}'''
if old_resize not in src:
    raise SystemExit('resize block not found')
src = src.replace(old_resize, new_resize, 1)

old_boosters = "  const y=857,buttons=[{x:70,label:'AUTO',sub:state.boosters.auto},{x:165,label:fifthOpen?'5TH OPEN':'+ SLOT',sub:fifthOpen?'✓':'100'},{x:260,label:'SHUFFLE',sub:state.boosters.shuffle},{x:355,label:'SHOP',sub:'◈'}];"
new_boosters = "  const y=844,buttons=[{x:70,label:'AUTO',sub:state.boosters.auto},{x:165,label:fifthOpen?'5TH OPEN':'+ SLOT',sub:fifthOpen?'✓':'100'},{x:260,label:'SHUFFLE',sub:state.boosters.shuffle},{x:355,label:'SHOP',sub:'◈'}];"
if old_boosters not in src:
    raise SystemExit('booster row not found')
src = src.replace(old_boosters, new_boosters, 1)

game.write_text(src)
(root / 'game63.js').write_text(src)

html = index.read_text()
html = re.sub(r'style\.css\?v=\d+', 'style.css?v=63', html)
html = re.sub(r'game\d+\.js\?v=\d+', 'game63.js?v=63', html)
index.write_text(html)
