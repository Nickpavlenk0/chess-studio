import chess,json
from pathlib import Path
count=0
for path in Path('src/data/puzzles').glob('*.json'):
 p=json.loads(path.read_text());board=chess.Board(p['fen']);assert board.is_valid(),(path,board.status())
 for line in p['solutions']:
  b=board.copy()
  for uci in line:
   move=chess.Move.from_uci(uci);assert move in b.legal_moves,(path,uci);b.push(move);assert b.is_valid(),path
 count+=1
print(f'python-chess: {count} legal FENs and complete solutions validated')
