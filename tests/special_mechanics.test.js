const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Special Mechanics, Dynamic Question Types and Dev Testing', () => {
  const packsDir = path.join(__dirname, '..', 'паки вопросов');

  function getJsonFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getJsonFiles(fullPath));
      } else if (file.endsWith('.json')) {
        results.push(fullPath);
      }
    });
    return results;
  }

  describe('Packs Static Schema: No Hardcoded Special Question Types', () => {
    it('verifies that all pack JSONs under "паки вопросов" do not contain hardcoded "type" property on questions', () => {
      const files = getJsonFiles(packsDir);
      assert.ok(files.length >= 200, `Expected >= 200 pack files, got ${files.length}`);

      let violations = [];
      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(content);

        function checkNoType(obj, currentPath = '') {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach((item, idx) => checkNoType(item, `${currentPath}[${idx}]`));
          } else {
            if ('type' in obj && (obj.q || obj.cost || obj.a)) {
              violations.push(`${path.basename(file)}: ${currentPath}.type = "${obj.type}"`);
            }
            for (const key of Object.keys(obj)) {
              checkNoType(obj[key], `${currentPath}.${key}`);
            }
          }
        }

        checkNoType(data);
      });

      assert.strictEqual(
        violations.length,
        0,
        `Found questions with hardcoded "type" in packs:\n${violations.slice(0, 10).join('\n')}`
      );
    });
  });

  describe('Dynamic Special Question Assignment Logic (resetQuestionsProgress)', () => {
    // Exact algorithm from game.js
    function resetQuestionsProgress(gameData, config) {
      const {
        configAllowCat = true,
        configAllowAuction = true,
        configAllowAuctionLeader = true
      } = config;

      const totalRounds = gameData.length;

      gameData.forEach((round, roundIdx) => {
        if (!round.themes) return;
        let allRoundQuestions = [];
        let hasPredefinedSpecialTypes = false;

        round.themes.forEach(theme => {
          if (theme.questions) {
            theme.questions.forEach(q => {
              q.used = false;
              if (['cat', 'auction', 'auction_leader'].includes(q.type)) {
                hasPredefinedSpecialTypes = true;
              } else {
                q.type = 'normal';
              }
              allRoundQuestions.push(q);
            });
          }
        });

        const isFinalRound = (roundIdx === totalRounds - 1) ||
          (round.roundName && (round.roundName.toLowerCase().includes('финал') || round.roundName.toLowerCase().includes('final')));

        if (hasPredefinedSpecialTypes) {
          if (isFinalRound) {
            allRoundQuestions.forEach(q => {
              if (q.type === 'cat' || q.type === 'auction_leader') q.type = 'normal';
            });
          }
          return;
        }

        const totalQs = allRoundQuestions.length;
        if (totalQs > 4) {
          for (let i = allRoundQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allRoundQuestions[i], allRoundQuestions[j]] = [allRoundQuestions[j], allRoundQuestions[i]];
          }
          let pointer = 0;

          // Кот в мешке: во всех раундах, кроме финала
          if (configAllowCat && !isFinalRound) {
            let count = Math.max(1, Math.round(totalQs * 0.06));
            for (let i = 0; i < count; i++) {
              if (allRoundQuestions[pointer]) {
                allRoundQuestions[pointer].type = 'cat';
                pointer++;
              }
            }
          }

          // Вопрос со ставкой (для всех): разрешен во всех раундах, кроме финала
          if (configAllowAuction && !isFinalRound) {
            let count = Math.max(1, Math.round(totalQs * 0.06));
            for (let i = 0; i < count; i++) {
              if (allRoundQuestions[pointer]) {
                allRoundQuestions[pointer].type = 'auction';
                pointer++;
              }
            }
          }

          // Аукцион за право ответа (ставка на лидера): во всех раундах, кроме финала
          if (configAllowAuctionLeader && !isFinalRound) {
            let count = Math.max(1, Math.round(totalQs * 0.06));
            for (let i = 0; i < count; i++) {
              if (allRoundQuestions[pointer]) {
                allRoundQuestions[pointer].type = 'auction_leader';
                pointer++;
              }
            }
          }
        }
      });
    }

    function createSampleGameData() {
      return [
        {
          roundName: 'Раунд 1',
          themes: [
            {
              name: 'Тема 1',
              questions: [
                { q: 'Q1', a: 'A1', cost: 100 },
                { q: 'Q2', a: 'A2', cost: 200 },
                { q: 'Q3', a: 'A3', cost: 300 },
                { q: 'Q4', a: 'A4', cost: 400 },
                { q: 'Q5', a: 'A5', cost: 500 }
              ]
            },
            {
              name: 'Тема 2',
              questions: [
                { q: 'Q6', a: 'A6', cost: 100 },
                { q: 'Q7', a: 'A7', cost: 200 },
                { q: 'Q8', a: 'A8', cost: 300 },
                { q: 'Q9', a: 'A9', cost: 400 },
                { q: 'Q10', a: 'A10', cost: 500 }
              ]
            }
          ]
        },
        {
          roundName: 'Финал',
          themes: [
            {
              name: 'Финальная тема',
              questions: [
                { q: 'Final Q1', a: 'Final A1', cost: 1000 },
                { q: 'Final Q2', a: 'Final A2', cost: 1000 }
              ]
            }
          ]
        }
      ];
    }

    it('assigns cat, auction, and auction_leader in non-final rounds when all config flags are true', () => {
      const data = createSampleGameData();
      resetQuestionsProgress(data, {
        configAllowCat: true,
        configAllowAuction: true,
        configAllowAuctionLeader: true
      });

      const r1Questions = data[0].themes.flatMap(t => t.questions);
      assert.ok(r1Questions.some(q => q.type === 'cat'), 'Round 1 must have at least one cat question');
      assert.ok(r1Questions.some(q => q.type === 'auction'), 'Round 1 must have at least one auction question');
      assert.ok(r1Questions.some(q => q.type === 'auction_leader'), 'Round 1 must have at least one auction_leader question');
      assert.ok(r1Questions.some(q => q.type === 'normal'), 'Round 1 must retain normal questions');
    });

    it('does not assign cat questions when configAllowCat is false', () => {
      const data = createSampleGameData();
      resetQuestionsProgress(data, {
        configAllowCat: false,
        configAllowAuction: true,
        configAllowAuctionLeader: true
      });

      const r1Questions = data[0].themes.flatMap(t => t.questions);
      assert.strictEqual(r1Questions.some(q => q.type === 'cat'), false, 'Should have no cat questions when disabled');
      assert.ok(r1Questions.some(q => q.type === 'auction'), 'Auction questions still assigned');
      assert.ok(r1Questions.some(q => q.type === 'auction_leader'), 'Leader auction questions still assigned');
    });

    it('does not assign auction questions when configAllowAuction is false', () => {
      const data = createSampleGameData();
      resetQuestionsProgress(data, {
        configAllowCat: true,
        configAllowAuction: false,
        configAllowAuctionLeader: true
      });

      const r1Questions = data[0].themes.flatMap(t => t.questions);
      assert.ok(r1Questions.some(q => q.type === 'cat'), 'Cat questions still assigned');
      assert.strictEqual(r1Questions.some(q => q.type === 'auction'), false, 'Should have no auction questions when disabled');
      assert.ok(r1Questions.some(q => q.type === 'auction_leader'), 'Leader auction questions still assigned');
    });

    it('does not assign leader auction questions when configAllowAuctionLeader is false', () => {
      const data = createSampleGameData();
      resetQuestionsProgress(data, {
        configAllowCat: true,
        configAllowAuction: true,
        configAllowAuctionLeader: false
      });

      const r1Questions = data[0].themes.flatMap(t => t.questions);
      assert.ok(r1Questions.some(q => q.type === 'cat'), 'Cat questions still assigned');
      assert.ok(r1Questions.some(q => q.type === 'auction'), 'Auction questions still assigned');
      assert.strictEqual(r1Questions.some(q => q.type === 'auction_leader'), false, 'Should have no leader auction questions when disabled');
    });

    it('keeps all questions normal when all config flags are false', () => {
      const data = createSampleGameData();
      resetQuestionsProgress(data, {
        configAllowCat: false,
        configAllowAuction: false,
        configAllowAuctionLeader: false
      });

      const r1Questions = data[0].themes.flatMap(t => t.questions);
      assert.ok(r1Questions.every(q => q.type === 'normal'), 'All questions must remain normal when special types are disabled');
    });

    it('ensures all questions in the final round remain "normal"', () => {
      const data = createSampleGameData();
      resetQuestionsProgress(data, {
        configAllowCat: true,
        configAllowAuction: true,
        configAllowAuctionLeader: true
      });

      const finalQuestions = data[1].themes.flatMap(t => t.questions);
      assert.ok(finalQuestions.every(q => q.type === 'normal'), 'All final round questions must strictly be "normal"');
    });
  });

  describe('testLaunchQuestion Mock & Normalization Logic', () => {
    function simulateTestLaunchQuestion(type, currentTeams = null) {
      let isTestMode = true;
      let currentRoundIndex = 0;
      let currentThemeIdx = 0;
      let currentQuestionIdx = 0;
      let currentCost = 300;
      let activeTeamIdxForQuestion = null;
      let auctionBets = {};
      let teams = currentTeams;
      let currentTurnTeamIdx = 0;

      let normalizedType = type;
      if (type === 'secret') normalizedType = 'cat';
      if (type === 'auction_all') normalizedType = 'auction';

      if (!teams || teams.length < 2) {
        teams = [
          { name: "Команда 1 (Лидер)", score: 500 },
          { name: "Команда 2", score: 200 }
        ];
        currentTurnTeamIdx = 0;
      }

      const testQuestion = {
        q: `[ТЕСТ] Тестовый вопрос: "${normalizedType}"`,
        a: "Правильный ответ",
        cost: 300,
        type: normalizedType,
        used: false
      };

      return {
        isTestMode,
        currentRoundIndex,
        currentCost,
        activeTeamIdxForQuestion,
        auctionBets,
        normalizedType,
        teams,
        currentTurnTeamIdx,
        testQuestion
      };
    }

    it('correctly normalizes question types ("cat", "secret", "auction", "auction_all", "auction_leader")', () => {
      assert.strictEqual(simulateTestLaunchQuestion('cat').normalizedType, 'cat');
      assert.strictEqual(simulateTestLaunchQuestion('secret').normalizedType, 'cat');
      assert.strictEqual(simulateTestLaunchQuestion('auction').normalizedType, 'auction');
      assert.strictEqual(simulateTestLaunchQuestion('auction_all').normalizedType, 'auction');
      assert.strictEqual(simulateTestLaunchQuestion('auction_leader').normalizedType, 'auction_leader');
    });

    it('sets up mock teams if teams array is null or has fewer than 2 teams', () => {
      const resNull = simulateTestLaunchQuestion('cat', null);
      assert.strictEqual(resNull.teams.length, 2);
      assert.strictEqual(resNull.teams[0].name, 'Команда 1 (Лидер)');
      assert.strictEqual(resNull.teams[1].name, 'Команда 2');

      const resEmpty = simulateTestLaunchQuestion('cat', []);
      assert.strictEqual(resEmpty.teams.length, 2);

      const resOne = simulateTestLaunchQuestion('cat', [{ name: 'Solo', score: 100 }]);
      assert.strictEqual(resOne.teams.length, 2);
    });

    it('preserves existing teams if there are 2 or more teams', () => {
      const existing = [
        { name: 'Red', score: 400 },
        { name: 'Blue', score: 300 },
        { name: 'Green', score: 200 }
      ];
      const res = simulateTestLaunchQuestion('auction', existing);
      assert.strictEqual(res.teams, existing);
      assert.strictEqual(res.teams.length, 3);
    });

    it('sets test mode flag and clears active team index and auction bets', () => {
      const res = simulateTestLaunchQuestion('auction_leader');
      assert.strictEqual(res.isTestMode, true);
      assert.strictEqual(res.activeTeamIdxForQuestion, null);
      assert.deepStrictEqual(res.auctionBets, {});
      assert.strictEqual(res.testQuestion.type, 'auction_leader');
    });
  });
});
