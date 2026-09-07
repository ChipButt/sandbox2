(() => {
  'use strict';

  const COLS = 8;
  const ROWS = 10;
  const PALETTE = [
    { id: 'red',    hex: '#ef4455' },
    { id: 'blue',   hex: '#2f80ed' },
    { id: 'green',  hex: '#35b969' },
    { id: 'yellow', hex: '#f3bd2e' },
    { id: 'purple', hex: '#9959d8' },
    { id: 'pink',   hex: '#ed68ad' },
    { id: 'orange', hex: '#ee8c35' },
    { id: 'cyan',   hex: '#31bad4' }
  ];

  const els = {
    yard: document.getElementById('yard'),
    queue: document.getElementById('queueWindow'),
    remaining: document.getElementById('remainingCount'),
    holding: document.getElementById('holdingSlots'),
    loading: document.getElementById('loadingTruck'),
    level: document.getElementById('levelNumber'),
    coins: document.getElementById('coinCount'),
    hint: document.getElementById('tapHint'),
    undo: document.getElementById('undoBtn'),
    shuffle: document.getElementById('shuffleBtn'),
    slot: document.getElementById('slotBtn'),
    hintBtn: document.getElementById('hintBtn'),
    undoCount: document.getElementById('undoCount'),
    shuffleCount: document.getElementById('shuffleCount'),
    slotCount: document.getElementById('slotCount'),
    hintCount: document.getElementById('hintCount'),
    resultModal: document.getElementById('resultModal'),
    modalEmoji: document.getElementById('modalEmoji'),
    modalTitle: document.getElementById('modalTitle'),
    modalText: document.getElementById('modalText'),
    modalAction: document.getElementById('modalAction'),
    restartFromModal: document.getElementById('restartFromModal'),
    settingsModal: document.getElementById('settingsModal'),
    settingsBtn: document.getElementById('settingsBtn'),
    closeSettings: document.getElementById('closeSettings'),
    restartBtn: document.getElementById('restartBtn'),
    soundToggle: document.getElementById('soundToggle'),
    vibrationToggle: document.getElementById('vibrationToggle')
  };

  let state;
  let busy = false;
  let audioCtx = null;
  const persisted = loadSave();
  const motionLayer = document.createElement('div');
  motionLayer.className = 'motion-layer';
  document.body.appendChild(motionLayer);

  function loadSave() {
    try {
      return JSON.parse(localStorage.getItem('sweet-truck-jam-save')) || {};
    } catch (_) {
      return {};
    }
  }

  function save() {
    localStorage.setItem('sweet-truck-jam-save', JSON.stringify({
      level: state.level,
      coins: state.coins,
      sound: els.soundToggle.checked,
      vibration: els.vibrationToggle.checked
    }));
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function shuffleArray(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function cellsOf(truck) {
    const cells = [];
    for (let i = 0; i < truck.len; i++) {
      cells.push(truck.axis === 'h'
        ? { x: truck.x + i, y: truck.y }
        : { x: truck.x, y: truck.y + i });
    }
    return cells;
  }

  function occupancy(trucks) {
    const map = new Map();
    trucks.forEach(t => cellsOf(t).forEach(c => map.set(`${c.x},${c.y}`, t.id)));
    return map;
  }

  function blockersFor(truck, trucks) {
    const occ = occupancy(trucks);
    const blockers = new Set();
    if (truck.axis === 'h') {
      const front = truck.dir > 0 ? truck.x + truck.len : truck.x - 1;
      const end = truck.dir > 0 ? COLS - 1 : 0;
      const step = truck.dir > 0 ? 1 : -1;
      for (let x = front; truck.dir > 0 ? x <= end : x >= end; x += step) {
        const id = occ.get(`${x},${truck.y}`);
        if (id && id !== truck.id) blockers.add(id);
      }
    } else {
      const front = truck.dir > 0 ? truck.y + truck.len : truck.y - 1;
      const end = truck.dir > 0 ? ROWS - 1 : 0;
      const step = truck.dir > 0 ? 1 : -1;
      for (let y = front; truck.dir > 0 ? y <= end : y >= end; y += step) {
        const id = occ.get(`${truck.x},${y}`);
        if (id && id !== truck.id) blockers.add(id);
      }
    }
    return [...blockers];
  }

  function clearTrucks(trucks) {
    return trucks.filter(t => blockersFor(t, trucks).length === 0);
  }

  function removalOrder(trucks, rng) {
    const remaining = trucks.map(t => ({ ...t }));
    const order = [];
    while (remaining.length) {
      const free = clearTrucks(remaining);
      if (!free.length) return null;
      const pick = free[Math.floor(rng() * free.length)];
      order.push(pick.id);
      remaining.splice(remaining.findIndex(t => t.id === pick.id), 1);
    }
    return order;
  }

  function findForcedPair(trucks, rng) {
    const initialFree = clearTrucks(trucks);
    shuffleArray(initialFree, rng);
    for (const a of initialFree) {
      const after = trucks.filter(t => t.id !== a.id);
      const freeAfter = clearTrucks(after);
      const newlyFree = freeAfter.filter(b => !initialFree.some(f => f.id === b.id));
      if (newlyFree.length) {
        return { a: a.id, b: newlyFree[Math.floor(rng() * newlyFree.length)].id, initialFree: initialFree.map(t => t.id) };
      }
    }
    return null;
  }

  function makeRandomTrucks(level, rng) {
    const target = Math.min(8 + Math.floor((level - 1) * 0.7), 16);
    const trucks = [];
    let tries = 0;
    while (trucks.length < target && tries < 600) {
      tries++;
      const axis = rng() < 0.5 ? 'h' : 'v';
      const len = rng() < (level > 4 ? 0.38 : 0.20) ? 3 : 2;
      const x = axis === 'h' ? randInt(rng, 0, COLS - len) : randInt(rng, 0, COLS - 1);
      const y = axis === 'v' ? randInt(rng, 0, ROWS - len) : randInt(rng, 0, ROWS - 1);
      const dir = rng() < 0.5 ? -1 : 1;
      const candidate = { id: `t${trucks.length}`, x, y, len, axis, dir, capacity: len * 2, color: null };
      const occupied = occupancy(trucks);
      if (cellsOf(candidate).some(c => occupied.has(`${c.x},${c.y}`))) continue;
      trucks.push(candidate);
    }
    return trucks;
  }

  function fallbackLevel(level) {
    const raw = [
      ['t0',0,1,2,'h',1], ['t1',3,1,2,'v',1], ['t2',3,4,2,'h',-1], ['t3',6,0,2,'v',1],
      ['t4',1,6,3,'h',1], ['t5',5,5,2,'v',-1], ['t6',0,8,2,'h',1], ['t7',4,8,3,'h',-1]
    ];
    const trucks = raw.map((r,i) => ({ id:r[0], x:r[1], y:r[2], len:r[3], axis:r[4], dir:r[5], capacity:r[3]*2, color: PALETTE[i%3].id }));
    const order = removalOrder(trucks, seeded(level * 77 + 9)) || trucks.map(t=>t.id);
    return { trucks, order, queueOrder: order };
  }

  function generateLevel(level) {
    for (let attempt = 0; attempt < 350; attempt++) {
      const rng = seeded(level * 10007 + attempt * 97 + 31);
      const trucks = makeRandomTrucks(level, rng);
      if (trucks.length < 7) continue;
      const order = removalOrder(trucks, rng);
      if (!order) continue;
      const pair = findForcedPair(trucks, rng);
      if (!pair) continue;

      const colorCount = Math.min(3 + Math.floor((level - 1) / 3), 6);
      const colors = PALETTE.slice(0, colorCount);
      const byId = new Map(trucks.map(t => [t.id, t]));
      const colorB = colors[0];
      const colorA = colors[1] || colors[0];
      byId.get(pair.b).color = colorB.id;
      byId.get(pair.a).color = colorA.id;

      const initialFreeSet = new Set(pair.initialFree);
      trucks.forEach(t => {
        if (t.color) return;
        let choices = colors;
        if (initialFreeSet.has(t.id) && colors.length > 1) choices = colors.slice(1);
        t.color = choices[Math.floor(rng() * choices.length)].id;
      });

      const remaining = trucks.map(t => ({ ...t }));
      const customOrder = [pair.a, pair.b];
      for (const id of customOrder) {
        const idx = remaining.findIndex(t => t.id === id);
        if (idx < 0 || blockersFor(remaining[idx], remaining).length) { customOrder.length = 0; break; }
        remaining.splice(idx, 1);
      }
      if (!customOrder.length) continue;
      while (remaining.length) {
        const free = clearTrucks(remaining);
        if (!free.length) { customOrder.length = 0; break; }
        const pick = free[Math.floor(rng() * free.length)];
        customOrder.push(pick.id);
        remaining.splice(remaining.findIndex(t => t.id === pick.id), 1);
      }
      if (!customOrder.length) continue;

      const queueOrder = [pair.b, pair.a, ...customOrder.slice(2)];
      const holdingSlots = level < 4 ? 5 : level < 9 ? 4 : 4;
      return { trucks, order: customOrder, queueOrder, holdingSlots };
    }
    const fb = fallbackLevel(level);
    fb.holdingSlots = 5;
    return fb;
  }

  function buildQueue(levelData) {
    const byId = new Map(levelData.trucks.map(t => [t.id, t]));
    const q = [];
    levelData.queueOrder.forEach(id => {
      const t = byId.get(id);
      for (let i = 0; i < t.capacity; i++) q.push(t.color);
    });
    return q;
  }

  function freshState(level) {
    let generated;
    try {
      generated = generateLevel(level);
      if (!generated || !generated.trucks?.length || !generated.queueOrder?.length) throw new Error('Invalid generated level');
    } catch (error) {
      console.error('Level generation failed; using fallback level.', error);
      generated = fallbackLevel(level);
      generated.holdingSlots = 5;
    }
    return {
      level,
      coins: persisted.coins ?? 250,
      trucks: generated.trucks.map(t => ({ ...t })),
      originalLevelData: JSON.parse(JSON.stringify(generated)),
      queue: buildQueue(generated),
      holding: [],
      holdingSlots: generated.holdingSlots,
      history: [],
      boosters: { undo: 3, shuffle: 2, slot: 1, hint: 3 },
      activeLoad: null,
      finished: false
    };
  }

  function startLevel(level) {
    busy = false;
    state = freshState(level);
    els.resultModal.classList.add('hidden');
    renderAll();
    save();
  }

  function renderAll() {
    els.level.textContent = state.level;
    els.coins.textContent = state.coins;
    renderQueue();
    renderHolding();
    renderYard();
    renderBoosters();
    setHint('Tap a truck that has a clear path out');
  }

  function renderQueue() {
    els.queue.innerHTML = '';
    els.remaining.textContent = state.queue.length;
    const visible = state.queue.slice(0, 13);
    visible.forEach((color, i) => {
      const dot = document.createElement('div');
      dot.className = `sweet${i === 0 ? ' next' : ''}`;
      dot.style.background = colorHex(color);
      dot.title = color;
      els.queue.appendChild(dot);
    });
    if (state.queue.length > visible.length) {
      const more = document.createElement('span');
      more.className = 'queue-more';
      more.textContent = `+${state.queue.length - visible.length}`;
      els.queue.appendChild(more);
    }
  }

  function renderHolding() {
    els.holding.innerHTML = '';
    for (let i = 0; i < state.holdingSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'hold-slot';
      const id = state.holding[i];
      if (id) slot.appendChild(makeMiniTruck(getTruckAnywhere(id)));
      els.holding.appendChild(slot);
    }
    const locked = Math.max(0, 6 - state.holdingSlots);
    for (let i = 0; i < locked; i++) {
      const slot = document.createElement('div');
      slot.className = 'hold-slot locked';
      els.holding.appendChild(slot);
    }
  }

  function renderLoading() {
    els.loading.innerHTML = '';
    if (!state.activeLoad) return;
    const t = getTruckAnywhere(state.activeLoad);
    const mini = makeMiniTruck(t);
    mini.classList.add('loading');
    els.loading.appendChild(mini);
  }

  function makeMiniTruck(truck) {
    const mini = document.createElement('div');
    mini.className = 'mini-truck';
    mini.dataset.truckId = truck.id;
    mini.style.setProperty('--truck', colorHex(truck.color));
    mini.title = `${truck.color} truck`;
    return mini;
  }

  function renderYard() {
    els.yard.innerHTML = '';
    els.yard.style.setProperty('--cols', COLS);
    els.yard.style.setProperty('--rows', ROWS);
    state.trucks.forEach(truck => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `truck ${truck.axis} ${truck.dir > 0 ? 'positive' : 'negative'}`;
      el.dataset.id = truck.id;
      el.style.setProperty('--truck', colorHex(truck.color));
      el.style.left = `${truck.x / COLS * 100}%`;
      el.style.top = `${truck.y / ROWS * 100}%`;
      el.style.width = `${(truck.axis === 'h' ? truck.len : 1) / COLS * 100}%`;
      el.style.height = `${(truck.axis === 'v' ? truck.len : 1) / ROWS * 100}%`;
      el.setAttribute('aria-label', `${truck.color} delivery truck, capacity ${truck.capacity}, facing ${dirWord(truck)}`);
      el.innerHTML = `<div class="truck-inner"><span class="truck-arrow">${arrow(truck)}</span><span class="truck-capacity">${truck.capacity}</span></div>`;
      el.addEventListener('click', () => tapTruck(truck.id, el));
      els.yard.appendChild(el);
    });
  }

  function renderBoosters() {
    els.undoCount.textContent = state.boosters.undo;
    els.shuffleCount.textContent = state.boosters.shuffle;
    els.slotCount.textContent = state.boosters.slot;
    els.hintCount.textContent = state.boosters.hint;
    els.undo.disabled = state.boosters.undo <= 0 || state.history.length === 0 || busy || state.finished;
    els.shuffle.disabled = state.boosters.shuffle <= 0 || state.queue.length < 2 || busy || state.finished;
    els.slot.disabled = state.boosters.slot <= 0 || state.holdingSlots >= 6 || busy || state.finished;
    els.hintBtn.disabled = state.boosters.hint <= 0 || busy || state.finished;
  }

  function arrow(t) {
    if (t.axis === 'h') return t.dir > 0 ? '→' : '←';
    return t.dir > 0 ? '↓' : '↑';
  }

  function dirWord(t) {
    if (t.axis === 'h') return t.dir > 0 ? 'right' : 'left';
    return t.dir > 0 ? 'down' : 'up';
  }

  function colorHex(id) {
    return PALETTE.find(c => c.id === id)?.hex || '#777';
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({
      trucks: state.trucks,
      queue: state.queue,
      holding: state.holding,
      holdingSlots: state.holdingSlots,
      boosters: state.boosters,
      coins: state.coins
    }));
  }

  function restore(snap) {
    state.trucks = snap.trucks;
    state.queue = snap.queue;
    state.holding = snap.holding;
    state.holdingSlots = snap.holdingSlots;
    state.boosters = snap.boosters;
    state.coins = snap.coins;
    state.activeLoad = null;
    state.finished = false;
    busy = false;
    renderAll();
  }

  async function tapTruck(id, el) {
    if (busy || state.finished) return;
    const truck = state.trucks.find(t => t.id === id);
    if (!truck) return;
    const blockers = blockersFor(truck, state.trucks);
    if (blockers.length) {
      el.classList.remove('blocked');
      void el.offsetWidth;
      el.classList.add('blocked');
      setHint('That truck is blocked', 'bad');
      vibrate(35);
      tone(150, .05);
      return;
    }

    const front = state.queue[0];
    const canLoadNow = front === truck.color;
    if (!canLoadNow && state.holding.length >= state.holdingSlots) {
      setHint('No free holding bay for that colour', 'bad');
      vibrate([40, 35, 60]);
      tone(120, .10);
      checkDeadlock();
      return;
    }

    state.history.push(snapshot());
    if (state.history.length > 20) state.history.shift();
    busy = true;
    renderBoosters();

    const destination = canLoadNow
      ? els.loading
      : els.holding.children[state.holding.length];

    setHint(canLoadNow
      ? `${capitalize(truck.color)} truck heading to loading`
      : `${capitalize(truck.color)} truck heading to a holding bay`);

    await animateYardTruckTo(truck, el, destination);
    state.trucks = state.trucks.filter(t => t.id !== id);
    renderYard();

    if (canLoadNow) {
      await loadTruck(truck);
    } else {
      state.holding.push(id);
      renderHolding();
      setHint(`${capitalize(truck.color)} truck waiting in a holding bay`);
      tone(280, .05);
    }

    renderQueue();
    await processHolding();
    busy = false;
    renderBoosters();
    evaluateEnd();
  }

  async function loadTruck(truck) {
    state.activeLoad = truck.id;
    renderLoading();
    await sleep(55);

    let loaded = 0;
    while (loaded < truck.capacity && state.queue[0] === truck.color) {
      const sweetEl = els.queue.querySelector('.sweet');
      const truckEl = els.loading.querySelector('.mini-truck');
      if (sweetEl && truckEl) await animateSweetIntoTruck(sweetEl, truckEl);
      state.queue.shift();
      loaded++;
      renderQueue();
      pulseLoadingTruck();
      tone(650 + loaded * 18, .035);
      await sleep(35);
    }

    if (loaded) {
      state.coins += Math.max(1, Math.floor(loaded / 2));
      els.coins.textContent = state.coins;
      setHint(`Loaded ${loaded} ${truck.color} sweets`, 'good');
    }

    await sleep(120);
    await animateLoadingTruckAway(truck);
    state.activeLoad = null;
    renderLoading();
  }

  async function processHolding() {
    let moved = true;
    while (moved && state.queue.length) {
      moved = false;
      const next = state.queue[0];
      const idx = state.holding.findIndex(id => getTruckAnywhere(id)?.color === next);
      if (idx >= 0) {
        const id = state.holding[idx];
        const truck = getTruckAnywhere(id);
        const source = els.holding.querySelector(`[data-truck-id="${id}"]`);
        setHint(`${capitalize(truck.color)} truck moving from holding to loading`, 'good');
        if (source) await animateBetweenElements(truck, source, els.loading, 420);
        state.holding.splice(idx, 1);
        renderHolding();
        await loadTruck(truck);
        moved = true;
      }
    }
  }

  async function animateYardTruckTo(truck, sourceEl, targetEl) {
    if (!sourceEl || !targetEl) return;
    const src = sourceEl.getBoundingClientRect();
    const yard = els.yard.getBoundingClientRect();
    const target = targetEl.getBoundingClientRect();
    const clone = makeMotionClone(sourceEl, src);
    sourceEl.style.visibility = 'hidden';

    let exitX = 0;
    let exitY = 0;
    const pad = 22;
    if (truck.axis === 'h' && truck.dir > 0) exitX = yard.right - src.left + pad;
    if (truck.axis === 'h' && truck.dir < 0) exitX = yard.left - src.right - pad;
    if (truck.axis === 'v' && truck.dir > 0) exitY = yard.bottom - src.top + pad;
    if (truck.axis === 'v' && truck.dir < 0) exitY = yard.top - src.bottom - pad;

    tone(500, .045);
    vibrate(15);
    await runMotion(clone, [
      { transform: 'translate(0px, 0px) scale(1)', offset: 0 },
      { transform: `translate(${exitX}px, ${exitY}px) scale(1)`, offset: 1 }
    ], 300, 'cubic-bezier(.25,.65,.3,1)');

    const dx = target.left + target.width / 2 - (src.left + src.width / 2);
    const dy = target.top + target.height / 2 - (src.top + src.height / 2);
    const scale = Math.max(.34, Math.min(.72, Math.min(
      Math.max(24, target.width * .72) / src.width,
      Math.max(20, target.height * .64) / src.height
    )));
    const turn = truck.axis === 'v' ? (truck.dir > 0 ? -90 : 90) : (truck.dir > 0 ? 0 : 180);
    const midX = (exitX + dx) / 2 + (dy - exitY) * .10;
    const midY = (exitY + dy) / 2 - (dx - exitX) * .06;

    await runMotion(clone, [
      { transform: `translate(${exitX}px, ${exitY}px) rotate(0deg) scale(1)`, offset: 0 },
      { transform: `translate(${midX}px, ${midY}px) rotate(${turn * .55}deg) scale(${(1 + scale) / 2})`, offset: .55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${turn}deg) scale(${scale})`, offset: 1 }
    ], 470, 'cubic-bezier(.2,.72,.25,1)');

    clone.remove();
  }

  async function animateBetweenElements(truck, sourceEl, targetEl, duration = 400) {
    const src = sourceEl.getBoundingClientRect();
    const target = targetEl.getBoundingClientRect();
    const clone = makeMotionClone(sourceEl, src);
    sourceEl.style.visibility = 'hidden';
    const dx = target.left + target.width / 2 - (src.left + src.width / 2);
    const dy = target.top + target.height / 2 - (src.top + src.height / 2);
    const midX = dx * .48 + dy * .10;
    const midY = dy * .48 - dx * .08;
    await runMotion(clone, [
      { transform: 'translate(0px,0px) scale(1)', offset: 0 },
      { transform: `translate(${midX}px,${midY}px) scale(1.08)`, offset: .5 },
      { transform: `translate(${dx}px,${dy}px) scale(.9)`, offset: 1 }
    ], duration, 'cubic-bezier(.25,.72,.25,1)');
    clone.remove();
  }

  async function animateSweetIntoTruck(sourceEl, targetEl) {
    const src = sourceEl.getBoundingClientRect();
    const target = targetEl.getBoundingClientRect();
    const clone = sourceEl.cloneNode(true);
    clone.classList.add('motion-sweet');
    Object.assign(clone.style, {
      left: `${src.left}px`,
      top: `${src.top}px`,
      width: `${src.width}px`,
      height: `${src.height}px`
    });
    motionLayer.appendChild(clone);
    const dx = target.left + target.width * .42 - (src.left + src.width / 2);
    const dy = target.top + target.height * .52 - (src.top + src.height / 2);
    const lift = Math.min(-42, dy - 25);
    await runMotion(clone, [
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * .48}px,${lift}px) scale(.92)`, opacity: 1, offset: .48 },
      { transform: `translate(${dx}px,${dy}px) scale(.42)`, opacity: .95, offset: .9 },
      { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0, offset: 1 }
    ], 220, 'cubic-bezier(.2,.7,.25,1)');
    clone.remove();
  }

  function pulseLoadingTruck() {
    const el = els.loading.querySelector('.mini-truck');
    if (!el || !el.animate) return;
    el.animate([
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-2px) scale(1.06)' },
      { transform: 'translateY(0) scale(1)' }
    ], { duration: 130, easing: 'ease-out' });
  }

  async function animateLoadingTruckAway(truck) {
    const sourceEl = els.loading.querySelector('.mini-truck');
    if (!sourceEl) return;
    const src = sourceEl.getBoundingClientRect();
    const clone = makeMotionClone(sourceEl, src);
    sourceEl.style.visibility = 'hidden';
    const dx = window.innerWidth - src.left + 90;
    tone(560, .05);
    await runMotion(clone, [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(22px,0) scale(1.03)', opacity: 1, offset: .18 },
      { transform: `translate(${dx}px,0) scale(1)`, opacity: .9, offset: 1 }
    ], 460, 'cubic-bezier(.32,.65,.3,1)');
    clone.remove();
  }

  function makeMotionClone(sourceEl, rect) {
    const clone = sourceEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('motion-copy');
    Object.assign(clone.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      visibility: 'visible'
    });
    motionLayer.appendChild(clone);
    return clone;
  }

  function runMotion(el, keyframes, duration, easing) {
    if (!el.animate) {
      const last = keyframes[keyframes.length - 1];
      Object.assign(el.style, last);
      return sleep(duration);
    }
    const anim = el.animate(keyframes, { duration, easing, fill: 'forwards' });
    return anim.finished.catch(() => {});
  }

  function getTruckAnywhere(id) {
    return state.originalLevelData.trucks.find(t => t.id === id) || state.trucks.find(t => t.id === id);
  }

  function evaluateEnd() {
    if (state.queue.length === 0 && state.trucks.length === 0 && state.holding.length === 0) {
      state.finished = true;
      state.coins += 25;
      save();
      showResult(true);
      return;
    }
    checkDeadlock();
    save();
  }

  function checkDeadlock() {
    if (!state.queue.length) return false;
    const front = state.queue[0];
    if (state.holding.some(id => getTruckAnywhere(id)?.color === front)) return false;
    const free = clearTrucks(state.trucks);
    if (free.some(t => t.color === front)) return false;
    if (state.holding.length < state.holdingSlots && free.length) return false;
    if (state.holding.length >= state.holdingSlots) {
      state.finished = true;
      showResult(false);
      return true;
    }
    return false;
  }

  function showResult(win) {
    els.resultModal.classList.remove('hidden');
    if (win) {
      els.modalEmoji.textContent = '✓';
      els.modalTitle.textContent = 'DELIVERED!';
      els.modalText.textContent = 'Every sweet is on its way.';
      els.modalAction.textContent = 'NEXT LEVEL';
      els.modalAction.onclick = () => startLevel(state.level + 1);
      tone(780, .08); setTimeout(() => tone(980, .11), 90);
    } else {
      els.modalEmoji.textContent = '!';
      els.modalTitle.textContent = 'YARD FULL';
      els.modalText.textContent = 'The holding bays are full and the next sweets cannot be loaded.';
      els.modalAction.textContent = 'TRY AGAIN';
      els.modalAction.onclick = () => startLevel(state.level);
      tone(130, .16);
    }
    renderBoosters();
  }

  function setHint(text, kind = '') {
    els.hint.textContent = text;
    els.hint.className = `tap-hint ${kind}`.trim();
  }

  function useUndo() {
    if (busy || !state.history.length || state.boosters.undo <= 0 || state.finished) return;
    const remainingUses = state.boosters.undo - 1;
    const snap = state.history.pop();
    restore(snap);
    state.boosters.undo = remainingUses;
    renderBoosters();
    setHint('Last move undone', 'good');
    tone(430, .05);
  }

  function useShuffle() {
    if (busy || state.boosters.shuffle <= 0 || state.queue.length < 2 || state.finished) return;
    state.history.push(snapshot());
    state.boosters.shuffle--;
    const first = state.queue[0];
    const rest = state.queue.slice(1);
    shuffleArray(rest);
    state.queue = [first, ...rest];
    renderQueue();
    renderBoosters();
    setHint('Remaining sweets shuffled');
    tone(600, .05);
    save();
  }

  function useExtraSlot() {
    if (busy || state.boosters.slot <= 0 || state.holdingSlots >= 6 || state.finished) return;
    state.history.push(snapshot());
    state.boosters.slot--;
    state.holdingSlots++;
    renderHolding();
    renderBoosters();
    setHint('One extra holding bay opened', 'good');
    tone(720, .07);
    save();
  }

  function useHint() {
    if (busy || state.boosters.hint <= 0 || state.finished) return;
    state.boosters.hint--;
    const front = state.queue[0];
    let choice = clearTrucks(state.trucks).find(t => t.color === front);
    if (!choice) choice = clearTrucks(state.trucks)[0];
    document.querySelectorAll('.truck.hint').forEach(x => x.classList.remove('hint'));
    if (choice) {
      const el = document.querySelector(`.truck[data-id="${choice.id}"]`);
      el?.classList.add('hint');
      setTimeout(() => el?.classList.remove('hint'), 2200);
      setHint(choice.color === front ? 'This truck can load the next sweets' : 'This clear truck will free up the yard');
    }
    renderBoosters();
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function vibrate(pattern) {
    if (els.vibrationToggle.checked && navigator.vibrate) navigator.vibrate(pattern);
  }

  function tone(freq, duration) {
    if (!els.soundToggle.checked) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.setValueAtTime(.045, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  els.undo.addEventListener('click', useUndo);
  els.shuffle.addEventListener('click', useShuffle);
  els.slot.addEventListener('click', useExtraSlot);
  els.hintBtn.addEventListener('click', useHint);
  els.restartFromModal.addEventListener('click', () => startLevel(state.level));
  els.settingsBtn.addEventListener('click', () => els.settingsModal.classList.remove('hidden'));
  els.closeSettings.addEventListener('click', () => { els.settingsModal.classList.add('hidden'); save(); });
  els.restartBtn.addEventListener('click', () => { els.settingsModal.classList.add('hidden'); startLevel(state.level); });
  els.soundToggle.addEventListener('change', save);
  els.vibrationToggle.addEventListener('change', save);

  els.soundToggle.checked = persisted.sound !== false;
  els.vibrationToggle.checked = persisted.vibration !== false;
  startLevel(Math.max(1, persisted.level || 1));
})();