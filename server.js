const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('.'));

// Game rooms
const rooms = new Map();
const playerScores = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
    const playerId = uuidv4();
    let currentRoom = null;

    console.log(`Player ${playerId} connected`);

    // Send player their ID
    ws.send(JSON.stringify({
        type: 'init',
        playerId: playerId
    }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'join_room':
                handleJoinRoom(ws, playerId, data.roomId);
                break;
            case 'create_room':
                handleCreateRoom(ws, playerId);
                break;
            case 'game_update':
                handleGameUpdate(ws, playerId, data);
                break;
            case 'shot_taken':
                handleShotTaken(ws, playerId, data);
                break;
            case 'score_update':
                handleScoreUpdate(ws, playerId, data);
                break;
        }
    });

    ws.on('close', () => {
        handlePlayerDisconnect(playerId);
    });
});

function handleCreateRoom(ws, playerId) {
    const roomId = uuidv4().substring(0, 6);
    const room = {
        id: roomId,
        players: new Map([[playerId, ws]]),
        gameState: {
            players: {},
            balls: {},
            scores: {}
        }
    };

    room.gameState.players[playerId] = {
        x: 100,
        y: 500,
        score: 0
    };

    rooms.set(roomId, room);
    
    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: roomId
    }));
}

function handleJoinRoom(ws, playerId, roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room not found'
        }));
        return;
    }

    if (room.players.size >= 4) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room is full'
        }));
        return;
    }

    room.players.set(playerId, ws);
    room.gameState.players[playerId] = {
        x: 100 + (room.players.size - 1) * 100,
        y: 500,
        score: 0
    };

    // Notify all players in the room
    broadcastToRoom(room, {
        type: 'player_joined',
        playerId: playerId,
        gameState: room.gameState
    });
}

function handleGameUpdate(ws, playerId, data) {
    const room = findPlayerRoom(playerId);
    if (!room) return;

    room.gameState.players[playerId] = data.playerState;
    if (data.ballState) {
        room.gameState.balls[playerId] = data.ballState;
    }

    broadcastToRoom(room, {
        type: 'game_update',
        gameState: room.gameState
    });
}

function handleShotTaken(ws, playerId, data) {
    const room = findPlayerRoom(playerId);
    if (!room) return;

    broadcastToRoom(room, {
        type: 'shot_taken',
        playerId: playerId,
        shotData: data.shotData
    });
}

function handleScoreUpdate(ws, playerId, data) {
    const room = findPlayerRoom(playerId);
    if (!room) return;

    room.gameState.players[playerId].score = data.score;
    
    // Update global leaderboard
    playerScores.set(playerId, {
        score: data.score,
        timestamp: Date.now()
    });

    broadcastToRoom(room, {
        type: 'score_update',
        playerId: playerId,
        score: data.score,
        globalRanking: calculateGlobalRanking(playerId)
    });
}

function handlePlayerDisconnect(playerId) {
    const room = findPlayerRoom(playerId);
    if (!room) return;

    room.players.delete(playerId);
    delete room.gameState.players[playerId];
    delete room.gameState.balls[playerId];

    if (room.players.size === 0) {
        rooms.delete(room.id);
    } else {
        broadcastToRoom(room, {
            type: 'player_left',
            playerId: playerId,
            gameState: room.gameState
        });
    }
}

function findPlayerRoom(playerId) {
    for (const [roomId, room] of rooms) {
        if (room.players.has(playerId)) {
            return room;
        }
    }
    return null;
}

function broadcastToRoom(room, message) {
    room.players.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

function calculateGlobalRanking(playerId) {
    const scores = Array.from(playerScores.entries())
        .map(([id, data]) => ({
            id,
            score: data.score,
            timestamp: data.timestamp
        }))
        .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp);

    return {
        rank: scores.findIndex(s => s.id === playerId) + 1,
        totalPlayers: scores.length,
        topScores: scores.slice(0, 10)
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 