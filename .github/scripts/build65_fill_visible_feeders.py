from pathlib import Path
import re

root = Path('sweet-truck-jam')
game = root / 'game.js'
index = root / 'index.html'

src = game.read_text()

old_const = "const FEED_VISIBLE_ROWS=5;"
new_const = "const FEED_VISIBLE_MARGIN=SWEET_RADIUS*1.5;"
if old_const not in src:
    raise SystemExit('FEED_VISIBLE_ROWS constant not found')
src = src.replace(old_const, new_const, 1)

old_block = '''    // One shared visual-row position for all four sweets. Only the nearest
    // five rows are visible; the rest stay hidden in the off-screen side tube.
    if(leader.feedVisualRow<FEED_VISIBLE_ROWS){
      for(let col=0;col<4;col++){
        const p=feederRowPos(side,leader.feedVisualRow,col);
        drawSweetAt(p,row[col].color,SWEET_RADIUS);
      }
    }'''
new_block = '''    // One shared visual-row position for all four sweets. Draw every row whose
    // centre is still inside the visible side-tube section. Rows further back
    // remain off-screen, but no visible stretch of an active feeder is left
    // empty while more rows are waiting behind it.
    const centre=feederRowPose(side,leader.feedVisualRow);
    const visible=side==='left'
      ? centre.x>=-FEED_VISIBLE_MARGIN
      : centre.x<=W+FEED_VISIBLE_MARGIN;
    if(visible){
      for(let col=0;col<4;col++){
        const p=feederRowPos(side,leader.feedVisualRow,col);
        drawSweetAt(p,row[col].color,SWEET_RADIUS);
      }
    }'''
if old_block not in src:
    raise SystemExit('feeder visibility block not found')
src = src.replace(old_block, new_block, 1)

game.write_text(src)
(root / 'game65.js').write_text(src)

html = index.read_text()
html = re.sub(r'style\.css\?v=\d+', 'style.css?v=65', html)
html = re.sub(r'game\d+\.js\?v=\d+', 'game65.js?v=65', html)
index.write_text(html)
