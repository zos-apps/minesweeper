import { useState, useCallback, useEffect } from 'react';
import type { AppProps } from '@zos-apps/config';
import { useTimer, useHighScore } from '@zos-apps/config';

interface Cell {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
}

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
};

type Difficulty = keyof typeof DIFFICULTIES;

const Minesweeper: React.FC<AppProps> = ({ onClose: _onClose }) => {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost'>('playing');
  const [flagCount, setFlagCount] = useState(0);
  const [started, setStarted] = useState(false);

  const { rows, cols, mines } = DIFFICULTIES[difficulty];
  
  // Timer using shared hook
  const { elapsed: time, start: startTimer, stop: stopTimer, reset: resetTimer } = useTimer(false);
  
  // Best times per difficulty (lower is better)
  const { highScore: bestTimeEasy, updateHighScore: updateBestEasy } = useHighScore('minesweeper-easy', 999);
  const { highScore: bestTimeMedium, updateHighScore: updateBestMedium } = useHighScore('minesweeper-medium', 999);
  const { highScore: bestTimeHard, updateHighScore: updateBestHard } = useHighScore('minesweeper-hard', 999);
  
  const bestTimes: Record<Difficulty, number> = {
    easy: bestTimeEasy,
    medium: bestTimeMedium,
    hard: bestTimeHard,
  };
  
  const updateBestTime = (diff: Difficulty, newTime: number) => {
    const currentBest = bestTimes[diff];
    if (newTime < currentBest) {
      if (diff === 'easy') updateBestEasy(newTime);
      else if (diff === 'medium') updateBestMedium(newTime);
      else updateBestHard(newTime);
      return true;
    }
    return false;
  };

  const initGame = useCallback(() => {
    const newGrid: Cell[][] = Array(rows).fill(null).map(() =>
      Array(cols).fill(null).map(() => ({
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborMines: 0,
      }))
    );

    // Place mines
    let placed = 0;
    while (placed < mines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c].isMine = true;
        placed++;
      }
    }

    // Calculate neighbor counts
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!newGrid[r][c].isMine) {
          let count = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && newGrid[nr][nc].isMine) {
                count++;
              }
            }
          }
          newGrid[r][c].neighborMines = count;
        }
      }
    }

    setGrid(newGrid);
    setGameState('playing');
    setFlagCount(0);
    setStarted(false);
    resetTimer();
  }, [rows, cols, mines, resetTimer]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Stop timer when game ends
  useEffect(() => {
    if (gameState !== 'playing' && started) {
      stopTimer();
    }
  }, [gameState, started, stopTimer]);

  const reveal = useCallback((r: number, c: number) => {
    if (gameState !== 'playing') return;
    if (!started) {
      setStarted(true);
      startTimer();
    }

    const cell = grid[r]?.[c];
    if (!cell || cell.isRevealed || cell.isFlagged) return;

    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
    
    if (cell.isMine) {
      // Game over - reveal all mines
      newGrid.forEach(row => row.forEach(c => { if (c.isMine) c.isRevealed = true; }));
      setGrid(newGrid);
      setGameState('lost');
      return;
    }

    // Flood fill reveal
    const stack = [[r, c]];
    while (stack.length > 0) {
      const [cr, cc] = stack.pop()!;
      if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
      if (newGrid[cr][cc].isRevealed || newGrid[cr][cc].isFlagged) continue;
      
      newGrid[cr][cc].isRevealed = true;
      
      if (newGrid[cr][cc].neighborMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            stack.push([cr + dr, cc + dc]);
          }
        }
      }
    }

    setGrid(newGrid);

    // Check win
    const unrevealed = newGrid.flat().filter(c => !c.isRevealed).length;
    if (unrevealed === mines) {
      setGameState('won');
    }
  }, [grid, gameState, started, rows, cols, mines, startTimer]);

  const toggleFlag = useCallback((r: number, c: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (gameState !== 'playing') return;
    
    const cell = grid[r]?.[c];
    if (!cell || cell.isRevealed) return;

    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
    newGrid[r][c].isFlagged = !newGrid[r][c].isFlagged;
    setGrid(newGrid);
    setFlagCount(f => newGrid[r][c].isFlagged ? f + 1 : f - 1);
  }, [grid, gameState]);

  const getCellContent = (cell: Cell) => {
    if (cell.isFlagged) return '🚩';
    if (!cell.isRevealed) return '';
    if (cell.isMine) return '💣';
    if (cell.neighborMines === 0) return '';
    return cell.neighborMines;
  };

  const getNumberColor = (n: number) => {
    const colors = ['', 'text-blue-600', 'text-green-600', 'text-red-600', 'text-purple-800', 'text-red-800', 'text-cyan-600', 'text-black', 'text-gray-600'];
    return colors[n] || '';
  };

  const isNewBest = gameState === 'won' && time < bestTimes[difficulty];

  return (
    <div className="h-full flex flex-col bg-gray-200 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 bg-gray-300 p-3 rounded border-2 border-gray-400">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl bg-black text-red-500 px-2 py-1 rounded">
            {String(mines - flagCount).padStart(3, '0')}
          </span>
        </div>
        
        <button
          onClick={initGame}
          className="text-3xl hover:scale-110 transition-transform"
        >
          {gameState === 'won' ? '😎' : gameState === 'lost' ? '😵' : '🙂'}
        </button>
        
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-xl bg-black text-red-500 px-2 py-1 rounded">
            {String(Math.min(time, 999)).padStart(3, '0')}
          </span>
          {bestTimes[difficulty] < 999 && (
            <span className="text-xs text-gray-600">Best: {bestTimes[difficulty]}s</span>
          )}
        </div>
      </div>

      {/* Difficulty selector */}
      <div className="flex gap-2 mb-4 justify-center">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={`px-3 py-1 rounded capitalize ${difficulty === d ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div
          className="inline-grid gap-0 bg-gray-400 p-1 border-4 border-gray-500"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                onClick={() => reveal(r, c)}
                onContextMenu={e => toggleFlag(r, c, e)}
                className={`
                  w-6 h-6 text-xs font-bold flex items-center justify-center
                  ${cell.isRevealed
                    ? 'bg-gray-300 border border-gray-400'
                    : 'bg-gray-400 border-2 border-t-gray-200 border-l-gray-200 border-r-gray-600 border-b-gray-600 hover:bg-gray-350'
                  }
                  ${cell.isMine && cell.isRevealed ? 'bg-red-500' : ''}
                  ${getNumberColor(cell.neighborMines)}
                `}
              >
                {getCellContent(cell)}
              </button>
            ))
          )}
        </div>
      </div>

      {gameState !== 'playing' && (
        <div className={`mt-4 text-center ${gameState === 'won' ? 'text-green-600' : 'text-red-600'}`}>
          <div className="text-xl font-bold">
            {gameState === 'won' ? '🎉 You Won!' : '💥 Game Over!'}
          </div>
          {gameState === 'won' && (
            <div className="text-sm mt-1">
              Time: {time}s {isNewBest && updateBestTime(difficulty, time) && '🏆 New Record!'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Minesweeper;
