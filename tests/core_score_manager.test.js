const { describe, it } = require('node:test');
const assert = require('node:assert');
const ScoreManager = require('../js/core/ScoreManager.js');

describe('Core: ScoreManager Tests', () => {
    it('initializes with default teams if none provided', () => {
        const sm = new ScoreManager();
        const teams = sm.getTeams();
        assert.strictEqual(teams.length, 2);
        assert.strictEqual(teams[0].name, 'Команда 1');
        assert.strictEqual(teams[0].score, 0);
    });

    it('manages team additions, removals and renames', () => {
        const sm = new ScoreManager([{ name: 'Альфа', score: 100 }]);
        assert.strictEqual(sm.getTeams().length, 1);

        sm.addTeam('Бета', 50);
        assert.strictEqual(sm.getTeams().length, 2);
        assert.strictEqual(sm.getTeams()[1].name, 'Бета');
        assert.strictEqual(sm.getTeams()[1].score, 50);

        sm.renameTeam(1, 'Гамма');
        assert.strictEqual(sm.getTeams()[1].name, 'Гамма');

        sm.removeTeam(0);
        assert.strictEqual(sm.getTeams().length, 1);
        assert.strictEqual(sm.getTeams()[0].name, 'Гамма');
    });

    it('correctly tracks scoring and game statistics', () => {
        const sm = new ScoreManager([
            { name: 'Знатоки', score: 0 },
            { name: 'Умники', score: 0 }
        ]);

        sm.changeScore(0, 300, 'normal');
        sm.changeScore(1, -200, 'normal');
        sm.changeScore(0, 500, 'auction');
        sm.changeScore(1, 100, 'cat');

        const teams = sm.getTeams();
        assert.strictEqual(teams[0].score, 800);
        assert.strictEqual(teams[1].score, -100);

        const stats = sm.gameStats;
        assert.strictEqual(stats[0].correct, 2);
        assert.strictEqual(stats[0].auctions, 1);
        assert.strictEqual(stats[1].wrong, 1);
        assert.strictEqual(stats[1].cats, 1);
    });

    it('indexes statistics by team id and preserves them after team removal', () => {
        const sm = new ScoreManager([
            { id: 'team_a', name: 'Команда А', score: 0 },
            { id: 'team_b', name: 'Команда Б', score: 0 },
            { id: 'team_c', name: 'Команда В', score: 0 }
        ]);

        sm.changeScore('team_a', 200, 'normal');
        sm.changeScore('team_b', -100, 'normal');
        sm.changeScore('team_c', 400, 'cat');

        // Verify retrieval by ID
        assert.strictEqual(sm.getTeamStats('team_a').correct, 1);
        assert.strictEqual(sm.getTeamStats('team_b').wrong, 1);
        assert.strictEqual(sm.getTeamStats('team_c').cats, 1);

        // Remove middle team (team_b)
        sm.removeTeam(1);

        const remainingTeams = sm.getTeams();
        assert.strictEqual(remainingTeams.length, 2);
        assert.strictEqual(remainingTeams[0].id, 'team_a');
        assert.strictEqual(remainingTeams[1].id, 'team_c');

        // team_c is now at index 1, its stats must remain intact and aligned
        assert.strictEqual(sm.getTeamStats('team_c').cats, 1);
        assert.strictEqual(sm.getTeamStats(1).cats, 1);
        assert.strictEqual(sm.gameStats[1].cats, 1);
        assert.strictEqual(sm.gameStats['team_c'].cats, 1);

        // team_b stats should be cleaned up
        assert.strictEqual(sm.getTeamStats('team_b'), null);
    });

    it('applies score change to all teams uniformly', () => {
        const sm = new ScoreManager([
            { name: 'T1', score: 100 },
            { name: 'T2', score: 200 }
        ]);

        sm.applyScoreChangeForAll(150);
        assert.strictEqual(sm.getTeams()[0].score, 250);
        assert.strictEqual(sm.getTeams()[1].score, 350);

        sm.applyScoreChangeForAll(-50);
        assert.strictEqual(sm.getTeams()[0].score, 200);
        assert.strictEqual(sm.getTeams()[1].score, 300);
    });

    it('handles auction bets and max allowed bet calculations', () => {
        const sm = new ScoreManager([
            { name: 'Богачи', score: 1500 },
            { name: 'Новички', score: 200 }
        ]);

        // Nominal question cost is 500
        assert.strictEqual(sm.getMaxAllowedBet(0, 500), 1500);
        assert.strictEqual(sm.getMaxAllowedBet(1, 500), 500); // minimum allowed is nominal

        sm.setAuctionBet(0, 1200);
        sm.setAuctionBet(1, 500);

        assert.strictEqual(sm.getAuctionBet(0), 1200);
        assert.strictEqual(sm.getAuctionBet(1), 500);

        sm.clearAuctionBets();
        assert.strictEqual(sm.getAuctionBet(0), 0);
    });

    it('cycles turn sequentially and wraps around', () => {
        const sm = new ScoreManager([
            { name: 'A' },
            { name: 'B' },
            { name: 'C' }
        ]);

        assert.strictEqual(sm.getTurnTeam().name, 'A');
        sm.passTurn();
        assert.strictEqual(sm.getTurnTeam().name, 'B');
        sm.passTurn();
        assert.strictEqual(sm.getTurnTeam().name, 'C');
        sm.passTurn();
        assert.strictEqual(sm.getTurnTeam().name, 'A');
    });

    it('determines single winner and tie (боевая ничья)', () => {
        const sm = new ScoreManager();

        // Single winner
        sm.setTeams([
            { name: 'A', score: 400 },
            { name: 'B', score: 900 },
            { name: 'C', score: 600 }
        ]);
        let win = sm.determineWinners();
        assert.strictEqual(win.isTie, false);
        assert.strictEqual(win.winners.length, 1);
        assert.strictEqual(win.winners[0].name, 'B');
        assert.strictEqual(win.maxScore, 900);

        // Tie
        sm.setTeams([
            { name: 'A', score: 800 },
            { name: 'B', score: 800 },
            { name: 'C', score: 300 }
        ]);
        win = sm.determineWinners();
        assert.strictEqual(win.isTie, true);
        assert.strictEqual(win.winners.length, 2);
        assert.strictEqual(win.maxScore, 800);
    });
});
