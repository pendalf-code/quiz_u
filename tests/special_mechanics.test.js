const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Special Mechanics, Pack Types and Dev Testing', () => {
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

  it('no question pack JSON file under "паки вопросов" contains a hardcoded "type" property', () => {
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

  it('dynamic game mechanics algorithm correctly assigns secret types based on settings', () => {
    function simulateAssignTypes(gameData, config) {
      const totalRounds = gameData.length;

      gameData.forEach((round, roundIdx) => {
        if (!round.themes) return;
        let allRoundQuestions = [];

        round.themes.forEach(theme => {
          if (theme.questions) {
            theme.questions.forEach(q => {
              q.used = false;
              q.type = 'normal';
              allRoundQuestions.push(q);
            });
          }
        });

        const isFinalRound = (roundIdx === totalRounds - 1) ||
          (round.roundName && (round.roundName.toLowerCase().includes('финал') || round.roundName.toLowerCase().includes('final')));

        const totalQs = allRoundQuestions.length;
        if (totalQs > 4 && !isFinalRound) {
          let pointer = 0;

          if (config.allowCat) {
            let count = Math.max(1, Math.round(totalQs * 0.06));
            for (let i = 0; i < count; i++) {
              if (allRoundQuestions[pointer]) {
                allRoundQuestions[pointer].type = 'cat';
                pointer++;
              }
            }
          }

          if (config.allowAuction) {
            let count = Math.max(1, Math.round(totalQs * 0.06));
            for (let i = 0; i < count; i++) {
              if (allRoundQuestions[pointer]) {
                allRoundQuestions[pointer].type = 'auction';
                pointer++;
              }
            }
          }

          if (config.allowAuctionLeader) {
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

    const testGameData = [
      {
        roundName: 'Раунд 1',
        themes: [
          { name: 'Тема 1', questions: [{ q: '1', a: '1', cost: 100 }, { q: '2', a: '2', cost: 200 }, { q: '3', a: '3', cost: 300 }] },
          { name: 'Тема 2', questions: [{ q: '4', a: '4', cost: 100 }, { q: '5', a: '5', cost: 200 }, { q: '6', a: '6', cost: 300 }] }
        ]
      },
      {
        roundName: 'Финал',
        themes: [
          { name: 'Финальная тема', questions: [{ q: 'F', a: 'F', cost: 1000 }] }
        ]
      }
    ];

    // Case 1: All features enabled
    simulateAssignTypes(testGameData, { allowCat: true, allowAuction: true, allowAuctionLeader: true });
    const r1Questions = testGameData[0].themes.flatMap(t => t.questions);
    assert.ok(r1Questions.some(q => q.type === 'cat'), 'Round 1 should contain a cat question');
    assert.ok(r1Questions.some(q => q.type === 'auction'), 'Round 1 should contain an auction question');
    assert.ok(r1Questions.some(q => q.type === 'auction_leader'), 'Round 1 should contain a leader auction question');

    const finalQuestions = testGameData[1].themes.flatMap(t => t.questions);
    assert.ok(finalQuestions.every(q => q.type === 'normal'), 'Final round questions must remain normal');

    // Case 2: Cat disabled in settings
    simulateAssignTypes(testGameData, { allowCat: false, allowAuction: true, allowAuctionLeader: true });
    const r1NoCat = testGameData[0].themes.flatMap(t => t.questions);
    assert.strictEqual(r1NoCat.some(q => q.type === 'cat'), false, 'When allowCat is false, no cat question should be assigned');
  });

  it('index.html contains splash overlay elements and dev test buttons', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="cat-splash-overlay"'), 'index.html must have cat-splash-overlay');
    assert.ok(html.includes('id="auction-splash-overlay"'), 'index.html must have auction-splash-overlay');
    assert.ok(html.includes("testLaunchQuestion('cat')"), 'Dev menu must support cat test launch');
    assert.ok(html.includes("testLaunchQuestion('auction')"), 'Dev menu must support auction test launch');
    assert.ok(html.includes("testLaunchQuestion('auction_leader')"), 'Dev menu must support leader auction test launch');
  });
});
