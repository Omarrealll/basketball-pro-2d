require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const compression = require('compression');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(compression());
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Game constants
const GAME_MODES = {
    CLASSIC: 'classic',
    BATTLE_ROYALE: 'battle_royale',
    TIME_ATTACK: 'time_attack',
    TRICK_SHOT: 'trick_shot',
    TOURNAMENT: 'tournament'
};

const ACHIEVEMENTS = {
    FIRST_BASKET: { id: 'first_basket', name: 'First Basket', description: 'Score your first basket' },
    SHARP_SHOOTER: { id: 'sharp_shooter', name: 'Sharp Shooter', description: 'Score 5 baskets in a row' },
    POWER_COLLECTOR: { id: 'power_collector', name: 'Power Collector', description: 'Collect all power-up types' },
    CHAMPION: { id: 'champion', name: 'Champion', description: 'Win a tournament' },
    TRICK_MASTER: { id: 'trick_master', name: 'Trick Master', description: 'Score a basket with 3+ bounces' }
};

// Game state
const gameRooms = new Map();
const players = new Map();
const tournaments = new Map();
const leaderboards = {
    daily: new Map(),
    weekly: new Map(),
    allTime: new Map()
};

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Add player to the game
    players.set(socket.id, {
        id: socket.id,
        room: null,
        score: 0
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        const player = players.get(socket.id);
        if (player && player.room) {
            const room = gameRooms.get(player.room);
            if (room) {
                room.players.delete(socket.id);
                if (room.players.size === 0) {
                    gameRooms.delete(player.room);
                }
            }
        }
        players.delete(socket.id);
    });

    // Handle game events
    socket.on('create_tournament', (data) => {
        const roomId = Math.random().toString(36).substring(7);
        gameRooms.set(roomId, {
            id: roomId,
            name: data.name,
            players: new Set([socket.id]),
            state: 'waiting'
        });
        
        const player = players.get(socket.id);
        player.room = roomId;
        
        socket.join(roomId);
        socket.emit('tournament_created', { roomId });
    });

    socket.on('join_tournament', (data) => {
        const room = gameRooms.get(data.roomId);
        if (room && room.state === 'waiting') {
            room.players.add(socket.id);
            const player = players.get(socket.id);
            player.room = data.roomId;
            
            socket.join(data.roomId);
            if (room.players.size >= 2) {
                room.state = 'playing';
                io.to(data.roomId).emit('game_start');
            }
        }
    });

    socket.on('score_update', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.score = data.score;
            if (player.room) {
                io.to(player.room).emit('scores', {
                    playerId: socket.id,
                    score: data.score
                });
            }
        }
    });

    socket.on('emote', (data) => {
        const player = players.get(socket.id);
        if (player && player.room) {
            io.to(player.room).emit('player_emote', {
                playerId: socket.id,
                emote: data.emote
            });
        }
    });
});

// Helper functions
function createRoom(roomId, gameMode) {
    const room = {
        id: roomId,
        gameMode,
        players: {},
        gameState: {
            balls: {},
            powerUps: [],
            obstacles: generateObstacles(gameMode),
            timeRemaining: getGameDuration(gameMode)
        },
        settings: getGameSettings(gameMode)
    };
    gameRooms.set(roomId, room);
    return room;
}

function joinRoom(socket, room) {
    const player = players.get(socket.id);
    if (player.room) {
        socket.leave(player.room);
    }

    socket.join(room.id);
    player.room = room.id;
    room.players[socket.id] = createPlayerState(room);

    // Notify all players in the room
    io.to(room.id).emit('playerJoined', {
        playerId: socket.id,
        gameState: room.gameState,
        players: room.players
    });
}

function createPlayerState(room) {
    const positions = getStartPositions(room);
    const pos = positions[Object.keys(room.players).length] || positions[0];

    return {
        x: pos.x,
        y: pos.y,
        score: 0,
        streak: 0,
        powerUps: [],
        lastShotTime: 0
    };
}

function getStartPositions(room) {
    return [
        { x: 100, y: 500 },
        { x: 300, y: 500 },
        { x: 500, y: 500 },
        { x: 700, y: 500 }
    ];
}

function updateGameState(room, playerId, data) {
    room.players[playerId] = {
        ...room.players[playerId],
        ...data.playerState
    };

    if (data.ballState) {
        room.gameState.balls[playerId] = data.ballState;
    }

    updatePowerUps(room);
    updateObstacles(room);
    updateTime(room);
}

function updatePowerUps(room) {
    if (shouldSpawnPowerUp(room)) {
        const powerUp = generatePowerUp();
        room.gameState.powerUps.push(powerUp);
        io.to(room.id).emit('powerUpSpawned', { powerUp });
    }
}

function shouldSpawnPowerUp(room) {
    const lastSpawnTime = room.gameState.lastPowerUpSpawn || 0;
    return Date.now() - lastSpawnTime > room.settings.powerUpFrequency;
}

function generatePowerUp() {
    const types = [
        { type: 'DOUBLE_POINTS', duration: 10, color: '#ffd700' },
        { type: 'BIGGER_BALL', duration: 15, color: '#4CAF50' },
        { type: 'SLOWER_BASKET', duration: 8, color: '#2196F3' },
        { type: 'PERFECT_SHOT', duration: 5, color: '#9C27B0' },
        { type: 'MULTI_BALL', duration: 12, color: '#FF5722' }
    ];

    const powerUp = {
        id: uuidv4(),
        x: Math.random() * 700 + 50,
        y: Math.random() * 400 + 50,
        ...types[Math.floor(Math.random() * types.length)]
    };

    return powerUp;
}

function updateObstacles(room) {
    room.gameState.obstacles.forEach(obstacle => {
        if (obstacle.type === 'platform' && obstacle.movementRange) {
            obstacle.x += obstacle.speed;
            if (obstacle.x > obstacle.startX + obstacle.movementRange || 
                obstacle.x < obstacle.startX) {
                obstacle.speed *= -1;
            }
        }
    });
}

function updateTime(room) {
    if (room.gameState.timeRemaining > 0) {
        room.gameState.timeRemaining -= 1/60;
        if (room.gameState.timeRemaining <= 0) {
            handleGameEnd(room);
        }
    }
}

function handleGameEnd(room) {
    const scores = Object.entries(room.players)
        .map(([id, player]) => ({ id, score: player.score }))
        .sort((a, b) => b.score - a.score);

    io.to(room.id).emit('gameEnd', { scores });
    updateLeaderboards(scores);
}

function updateLeaderboards(scores) {
    scores.forEach(({ id, score }) => {
        const player = players.get(id);
        if (player) {
            player.stats.totalScore += score;
            updateDailyLeaderboard(id, score);
            updateWeeklyLeaderboard(id, score);
            updateAllTimeLeaderboard(id, score);
        }
    });
}

function handlePlayerDisconnect(playerId) {
    const player = players.get(playerId);
    if (player && player.room) {
        const room = gameRooms.get(player.room);
        if (room) {
            delete room.players[playerId];
            if (Object.keys(room.players).length === 0) {
                gameRooms.delete(player.room);
            } else {
                io.to(player.room).emit('playerLeft', { playerId });
            }
        }
    }
    players.delete(playerId);
}

// Game settings
function getGameSettings(gameMode) {
    const baseSettings = {
        gravity: 0.5,
        bounce: 0.6,
        airResistance: 0.99,
        powerUpFrequency: 10000,
        maxPlayers: 4
    };

    switch (gameMode) {
        case GAME_MODES.BATTLE_ROYALE:
            return {
                ...baseSettings,
                maxPlayers: 8,
                shrinkingCourt: true,
                eliminationScore: 20
            };
        case GAME_MODES.TIME_ATTACK:
            return {
                ...baseSettings,
                timeLimit: 120,
                bonusTimePerBasket: 5,
                powerUpFrequency: 5000
            };
        case GAME_MODES.TRICK_SHOT:
            return {
                ...baseSettings,
                minBouncesForPoints: 1,
                pointsMultiplier: 2,
                gravity: 0.4
            };
        default:
            return baseSettings;
    }
}

function getGameDuration(gameMode) {
    switch (gameMode) {
        case GAME_MODES.TIME_ATTACK:
            return 120; // 2 minutes
        case GAME_MODES.BATTLE_ROYALE:
            return 300; // 5 minutes
        default:
            return 180; // 3 minutes
    }
}

function generateObstacles(gameMode) {
    const obstacles = [];
    
    switch (gameMode) {
        case GAME_MODES.TRICK_SHOT:
            obstacles.push(
                { type: 'wall', x: 400, y: 300, width: 100, height: 10, bounce: 1.2 },
                { type: 'platform', x: 200, y: 400, width: 80, height: 10, movementRange: 100, speed: 2 }
            );
            break;
        case GAME_MODES.BATTLE_ROYALE:
            obstacles.push(
                { type: 'barrier', x: 300, y: 200, width: 20, height: 100, health: 3 },
                { type: 'barrier', x: 500, y: 300, width: 20, height: 100, health: 3 }
            );
            break;
    }
    
    return obstacles;
}

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
}); 