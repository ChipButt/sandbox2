from pathlib import Path

src=Path('sweet-truck-jam/game67.js').read_text()

def rep(old,new,label):
    global src
    if old not in src:
        raise SystemExit(f'patch missing: {label}')
    src=src.replace(old,new,1)

old_load='''      for(let i=0;i<4;i++){
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
      }'''
new_load='''      // The sweet physically closest to the chosen truck peels off first.
      const truckMouth={x:slot.x,y:slot.y-10};
      const peelOrder=[0,1,2,3]
        .map(i=>({i,cp:candyPos(base+i,1)}))
        .sort((a,b)=>dist2(a.cp,truckMouth)-dist2(b.cp,truckMouth));

      for(let order=0;order<peelOrder.length;order++){
        const item=peelOrder[order],i=item.i,cp=item.cp,c=outletRow[i];
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
          delay:order*.052,
          duration:.43
        });
      }'''
rep(old_load,new_load,'nearest sweet loading')

# Mark the DOM after the first successful render so the CI smoke test can
# distinguish a genuinely running game from a syntactically valid blank page.
old_frame="function frame(ts){const dt=Math.min(.10,(ts-last)/1000||.016);last=ts;update(dt);drawBackground();drawQueue(dt);drawSlotsAndParked();drawGarage();drawYard();drawMotions();drawParticles();drawTopUI();drawBoosters();requestAnimationFrame(frame)}"
new_frame="function frame(ts){const dt=Math.min(.10,(ts-last)/1000||.016);last=ts;update(dt);drawBackground();drawQueue(dt);drawSlotsAndParked();drawGarage();drawYard();drawMotions();drawParticles();drawTopUI();drawBoosters();if(document.body.dataset.gameReady!=='1')document.body.dataset.gameReady='1';requestAnimationFrame(frame)}"
rep(old_frame,new_frame,'ready marker')

Path('sweet-truck-jam/game70.js').write_text(src)
Path('sweet-truck-jam/game.js').write_text(src)
print('game70 generated',len(src))
