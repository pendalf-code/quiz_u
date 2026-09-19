const { describe, it } = require('node:test');
const assert = require('node:assert');

// Pure logic extracted from game.js
function normalizeGameData(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    if (Array.isArray(data.rounds)) return data.rounds;
    if (data.themes) return [data];
    return [data];
  }
  return [];
}

describe('Game Logic & Mechanics Tests', () => {

  describe('normalizeGameData', () => {
    it('returns empty array on falsy values', () => {
      assert.deepStrictEqual(normalizeGameData(null), []);
      assert.deepStrictEqual(normalizeGameData(undefined), []);
      assert.deepStrictEqual(normalizeGameData(''), []);
    });

    it('returns array as-is when input is already an array of rounds', () => {
      const rounds = [{ roundName: 'Раунд 1', themes: [] }];
      assert.strictEqual(normalizeGameData(rounds), rounds);
    });

    it('extracts rounds array when input is a pack object with rounds property', () => {
      const pack = {
        title: 'Тестовый пак',
        rounds: [
          { roundName: 'Раунд 1', themes: [] },
          { roundName: 'Раунд 2', themes: [] }
        ]
      };
      const normalized = normalizeGameData(pack);
      assert.strictEqual(normalized.length, 2);
      assert.strictEqual(normalized[0].roundName, 'Раунд 1');
      assert.strictEqual(normalized[1].roundName, 'Раунд 2');
    });

    it('wraps single-round theme object in an array', () => {
      const singleRound = {
        themes: [{ name: 'Тема 1', questions: [] }]
      };
      const normalized = normalizeGameData(singleRound);
      assert.strictEqual(normalized.length, 1);
      assert.strictEqual(normalized[0].themes[0].name, 'Тема 1');
    });
  });

  describe('Team Scoring & Stats', () => {
    it('correctly increments score and updates correct answer count', () => {
      const teams = [{ name: 'Команда 1', score: 100 }, { name: 'Команда 2', score: 50 }];
      const gameStats = {};

      function changeTeamScore(teamIdx, amount) {
        teams[teamIdx].score += amount;
        if (!gameStats[teamIdx]) gameStats[teamIdx] = { correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0 };
        if (amount > 0) gameStats[teamIdx].correct++;
        else if (amount < 0) gameStats[teamIdx].wrong++;
      }

      changeTeamScore(0, 300);
      assert.strictEqual(teams[0].score, 400);
      assert.strictEqual(gameStats[0].correct, 1);
      assert.strictEqual(gameStats[0].wrong, 0);

      changeTeamScore(1, -200);
      assert.strictEqual(teams[1].score, -150);
      assert.strictEqual(gameStats[1].correct, 0);
      assert.strictEqual(gameStats[1].wrong, 1);
    });

    it('applies score change to all teams uniformly', () => {
      const teams = [
        { name: 'Команда 1', score: 100 },
        { name: 'Команда 2', score: 200 },
        { name: 'Команда 3', score: 300 }
      ];

      function applyScoreChangeForAll(delta) {
        teams.forEach(t => t.score += delta);
      }

      applyScoreChangeForAll(100);
      assert.strictEqual(teams[0].score, 200);
      assert.strictEqual(teams[1].score, 300);
      assert.strictEqual(teams[2].score, 400);

      applyScoreChangeForAll(-50);
      assert.strictEqual(teams[0].score, 150);
      assert.strictEqual(teams[1].score, 250);
      assert.strictEqual(teams[2].score, 350);
    });
  });

  describe('Turn Cycling', () => {
    it('cycles sequentially through all teams and wraps around', () => {
      const teams = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
      let currentTurn = 0;

      function passTurn() {
        currentTurn = (currentTurn + 1) % teams.length;
      }

      passTurn();
      assert.strictEqual(currentTurn, 1); // Team B
      passTurn();
      assert.strictEqual(currentTurn, 2); // Team C
      passTurn();
      assert.strictEqual(currentTurn, 0); // Wraps to Team A
    });
  });

  describe('Winner Determination', () => {
    function determineWinners(teams) {
      let maxScore = -Infinity;
      teams.forEach(t => {
        if (t.score > maxScore) maxScore = t.score;
      });
      const winners = teams.filter(t => t.score === maxScore);
      return {
        isTie: winners.length > 1,
        maxScore,
        winners
      };
    }

    it('identifies single winner with highest score', () => {
      const teams = [
        { name: 'Альфа', score: 500 },
        { name: 'Бета', score: 800 },
        { name: 'Гамма', score: 300 }
      ];
      const result = determineWinners(teams);
      assert.strictEqual(result.isTie, false);
      assert.strictEqual(result.winners.length, 1);
      assert.strictEqual(result.winners[0].name, 'Бета');
      assert.strictEqual(result.maxScore, 800);
    });

    it('identifies tie (боевая ничья) when multiple teams share highest score', () => {
      const teams = [
        { name: 'Альфа', score: 700 },
        { name: 'Бета', score: 700 },
        { name: 'Гамма', score: 400 }
      ];
      const result = determineWinners(teams);
      assert.strictEqual(result.isTie, true);
      assert.strictEqual(result.winners.length, 2);
      assert.strictEqual(result.maxScore, 700);
    });
  });
});
