"""Optional engine audit. Usage: STOCKFISH_PATH=/path/to/stockfish python scripts/audit-engine.py"""
import os,json,chess,chess.engine
from pathlib import Path
engine=chess.engine.SimpleEngine.popen_uci(os.environ.get('STOCKFISH_PATH','.engine/stockfish/stockfish-linux-x86-64-universal'))
engine.configure({'Threads':2,'Hash':128});report=[]
for file in sorted(Path('src/data/puzzles').glob('*.json')):
 p=json.loads(file.read_text());b=chess.Board(p['fen']);assert b.is_valid();steps=[]
 for i,move in enumerate(p['solutions'][0]):
  m=chess.Move.from_uci(move);assert m in b.legal_moves
  if i%2==0:
   infos=engine.analyse(b,chess.engine.Limit(depth=20),multipv=min(4,b.legal_moves.count()))
   best=infos[0]['score'].pov(b.turn);given=engine.analyse(b,chess.engine.Limit(depth=20),root_moves=[m])['score'].pov(b.turn)
   steps.append({'fen':b.fen(),'accepted':move,'best':infos[0]['pv'][0].uci(),'score':str(given),'top':[{'uci':x['pv'][0].uci(),'score':str(x['score'].pov(b.turn))} for x in infos]})
   print(p['id'],i,move,'best',infos[0]['pv'][0].uci(),str(best),'given',str(given),flush=True)
   assert given.score(mate_score=100000)>0
  b.push(m)
 if 'Мат в ' in p['category'] or p['category'] in ('Завлечение фигуры','Отвлечение защитника'):assert b.is_checkmate()
 report.append({'id':p['id'],'engine':'Stockfish 19','depth':20,'validFen':True,'steps':steps,'finalCheckmate':b.is_checkmate()})
engine.quit();Path('docs/content-verification.json').write_text(json.dumps({'schemaVersion':1,'verifiedAt':'2026-10-27','puzzles':report},ensure_ascii=False,indent=2)+'\n')
