from pathlib import Path
import re

path = Path('sweet-truck-jam/game.js')
s = path.read_text()

helper = r'''function garageBadgePlacement(host,trucks){
  const badgeW=34,badgeH=22,halfW=badgeW/2,halfH=badgeH/2;
  const ca=Math.cos(host.angle),sa=Math.sin(host.angle);
  const fx=ca,fy=sa,sx=-sa,sy=ca;

  const candidates=[
    {x:host.x+sx*(host.width/2+27),y:host.y+sy*(host.width/2+27)},
    {x:host.x-sx*(host.width/2+27),y:host.y-sy*(host.width/2+27)},
    {x:host.x+fx*(host.length/2+27),y:host.y+fy*(host.length/2+27)},
    {x:host.x-fx*(host.length/2+27),y:host.y-fy*(host.length/2+27)},
    {x:host.x+fx*(host.length/2+18)+sx*(host.width/2+18),y:host.y+fy*(host.length/2+18)+sy*(host.width/2+18)},
    {x:host.x+fx*(host.length/2+18)-sx*(host.width/2+18),y:host.y+fy*(host.length/2+18)-sy*(host.width/2+18)},
    {x:host.x-fx*(host.length/2+18)+sx*(host.width/2+18),y:host.y-fy*(host.length/2+18)+sy*(host.width/2+18)},
    {x:host.x-fx*(host.length/2+18)-sx*(host.width/2+18),y:host.y-fy*(host.length/2+18)-sy*(host.width/2+18)}
  ];

  function badgePoly(c){
    return[
      {x:c.x-halfW,y:c.y-halfH},
      {x:c.x+halfW,y:c.y-halfH},
      {x:c.x+halfW,y:c.y+halfH},
      {x:c.x-halfW,y:c.y+halfH}
    ];
  }
  function inYard(c){
    return c.x-halfW>=JAM.x+6&&c.x+halfW<=JAM.x+JAM.w-6&&
           c.y-halfH>=JAM.y+6&&c.y+halfH<=JAM.y+JAM.h-6;
  }

  for(const c of candidates){
    if(!inYard(c))continue;
    const p=badgePoly(c);
    if(trucks.some(t=>polyOverlap(p,truckPoly(t),6)))continue;
    return{x:c.x,y:c.y,w:badgeW,h:badgeH};
  }
  return null;
}
'''

marker = 'function addUndergroundGarage(gen,r,n){'
assert s.count(marker) == 1, f'Expected one garage function marker, found {s.count(marker)}'
s = s.replace(marker, helper + marker, 1)

new_func = r'''function addUndergroundGarage(gen,r,n){
  const profile=difficultyProfile(n);
  const forced=n>=6&&n%3===0;
  const wantsGarage=forced||(profile.garageChance>0&&r()<=profile.garageChance);
  if(!wantsGarage)return true;

  const free=gen.trucks.filter(t=>canDriveOut(t,gen.trucks));
  if(!free.length)return !forced;

  const early=free.filter(t=>{
    const i=gen.order.indexOf(t.id);
    return i>=0&&i<Math.min(6,gen.order.length);
  });
  const preferred=early.length?early:free;

  // A garage may only occupy a truck position if there is a separate clear
  // patch beside it for the remaining-truck counter.
  const eligible=[];
  for(const t of preferred){
    const badge=garageBadgePlacement(t,gen.trucks);
    if(badge)eligible.push({host:t,badge});
  }
  if(!eligible.length){
    for(const t of free){
      if(preferred.includes(t))continue;
      const badge=garageBadgePlacement(t,gen.trucks);
      if(badge)eligible.push({host:t,badge});
    }
  }
  if(!eligible.length)return !forced;

  const picked=choice(r,eligible);
  const host=picked.host,badge=picked.badge;
  const extra=n<7?2:n<12?rint(r,2,3):rint(r,3,4),queue=[];
  for(let i=0;i<extra;i++){
    queue.push({
      id:`g${i}_${host.id}`,
      x:host.x,y:host.y,angle:host.angle,
      kind:host.kind,length:host.length,width:host.width,
      capacity:host.capacity,color:'red',
      garageTruck:true,hideColor:false,revealed:true
    });
  }

  const pos=gen.order.indexOf(host.id);
  if(pos<0)return !forced;

  gen.order.splice(pos+1,0,...queue.map(t=>t.id));
  host.garageTruck=true;
  host.hideColor=false;
  host.revealed=true;
  gen.garage={
    x:host.x,y:host.y,angle:host.angle,
    length:host.length,width:host.width,
    currentId:host.id,queue,
    badgeX:badge.x,badgeY:badge.y,badgeW:badge.w,badgeH:badge.h
  };
  return true;
}'''

pattern = r'function addUndergroundGarage\(gen,r,n\)\{.*?\n\}\nfunction assignChallengeColors'
s, count = re.subn(pattern, new_func + '\nfunction assignChallengeColors', s, count=1, flags=re.S)
assert count == 1, f'Failed replacing garage function: {count}'

old_finish = '''  const gen={trucks,order:[...order],garage:null,sweetRows:[]};
  addUndergroundGarage(gen,R,n);assignChallengeColors(gen,R,n);'''
new_finish = '''  const gen={trucks,order:[...order],garage:null,sweetRows:[]};
  if(!addUndergroundGarage(gen,R,n))return null;
  assignChallengeColors(gen,R,n);'''
assert s.count(old_finish) == 1, 'finishGeneratedCluster garage call not found'
s = s.replace(old_finish, new_finish)

old_state = '''    x:gen.garage.x,y:gen.garage.y,angle:gen.garage.angle,
    length:gen.garage.length,width:gen.garage.width,currentId:gen.garage.currentId,
    queue:gen.garage.queue.map(t=>({...t,state:'underground'}))'''
new_state = '''    x:gen.garage.x,y:gen.garage.y,angle:gen.garage.angle,
    length:gen.garage.length,width:gen.garage.width,currentId:gen.garage.currentId,
    badgeX:gen.garage.badgeX,badgeY:gen.garage.badgeY,badgeW:gen.garage.badgeW,badgeH:gen.garage.badgeH,
    queue:gen.garage.queue.map(t=>({...t,state:'underground'}))'''
assert s.count(old_state) == 1, 'newState garage block not found'
s = s.replace(old_state, new_state)

old_draw = '''  const remaining=g.queue.length;
  const bx=g.x+Math.cos(g.angle+Math.PI/2)*(g.width/2+16);
  const by=g.y+Math.sin(g.angle+Math.PI/2)*(g.width/2+16);
  roundedRect(bx-14,by-10,28,20,10,'#252c35','#fff',1.4);
  text('↓ '+String(remaining),bx,by,11,'#fff','center',1000);'''
new_draw = '''  const remaining=g.queue.length;
  const bx=g.badgeX??(g.x+Math.cos(g.angle+Math.PI/2)*(g.width/2+16));
  const by=g.badgeY??(g.y+Math.sin(g.angle+Math.PI/2)*(g.width/2+16));
  const bw=g.badgeW||34,bh=g.badgeH||22;
  roundedRect(bx-bw/2,by-bh/2,bw,bh,bh/2,'#252c35','#fff',1.4);
  text('↓ '+String(remaining),bx,by,11,'#fff','center',1000);'''
assert s.count(old_draw) == 1, 'drawGarage counter block not found'
s = s.replace(old_draw, new_draw)

# Preserve current requested systems.
assert 'const SWEET_RADIUS=7;' in s
assert 'const ROTATION_CAPACITY=144;' in s
assert 'const TRUCK_GAP=3;' in s
assert 'const rowProgress=((row-phase)%LOOP_ROWS+LOOP_ROWS)%LOOP_ROWS;' in s
assert 'const OUTLET_SOURCE_ROW=(OUTLET_ROW+1)%LOOP_ROWS;' in s
assert 'const sweetSpriteCache=new Map();' in s
assert 'function garageBadgePlacement(host,trucks)' in s
assert 'badgeX:badge.x' in s
assert 'if(!addUndergroundGarage(gen,R,n))return null;' in s

path.write_text(s)
Path('sweet-truck-jam/game57.js').write_text(s)

index = Path('sweet-truck-jam/index.html')
html = index.read_text()
html = re.sub(r'game(?:\d+)?\.js\?v=\d+', 'game57.js?v=57', html)
html = re.sub(r'style\.css\?v=\d+', 'style.css?v=57', html)
index.write_text(html)
