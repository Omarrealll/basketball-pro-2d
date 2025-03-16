// WebSocket connection
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.hostname === 'localhost' ? `${window.location.hostname}:3000` : window.location.host;
const ws = new WebSocket(`${wsProtocol}//${wsHost}`);
let playerId = null;
let currentRoom = null;
let gameState = {
    players: {},
    balls: {},
    powerups: []
};

// Game canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Sound effects (using base64 for portability)
const sounds = {
    bounce: new Audio('data:audio/wav;base64,UklGRqgAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YYQAAAAzAIAAzQD/ALUA/wCAADMAAADN/wAAtf8AAIAAMwAAAM3/AAC1/wAAgAAzAAAAzf8AALX/AACAAAAAMwDNAP8AtQD/AIAAMQAAAP3/AAC9/wAAgAAAAAAA'),
    score: new Audio('data:audio/wav;base64,UklGRn4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVAAAAB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AA=='),
    powerup: new Audio('data:audio/wav;base64,UklGRn4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVAAAAB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AA==')
};

// Power-up types
const POWERUP_TYPES = {
    DOUBLE_POINTS: { color: '#ffd700', duration: 10, symbol: '2×' },
    BIGGER_BALL: { color: '#4CAF50', duration: 15, symbol: '⚪' },
    SLOWER_BASKET: { color: '#2196F3', duration: 8, symbol: '⏱' },
    PERFECT_SHOT: { color: '#9C27B0', duration: 5, symbol: '🎯' }
};

// Game objects
const ball = {
    x: 100,
    y: 500,
    radius: 15,
    color: '#ff6b6b',
    velocityX: 0,
    velocityY: 0,
    isShot: false,
    rotation: 0,
    trail: []
};

const basket = {
    x: 700,
    y: 300,
    width: 60,
    height: 50,
    rimWidth: 10,
    color: '#e94560',
    netPoints: [],
    moveSpeed: 1,
    direction: 1
};

// Initialize net points
for (let i = 0; i < 10; i++) {
    basket.netPoints.push({
        x: basket.x + i * (basket.width / 9),
        y: basket.y + basket.height,
        baseY: basket.y + basket.height,
        velocity: 0
    });
}

// Game state
let score = 0;
let gameTime = 60;
let isGameOver = false;
let isPoweringUp = false;
let power = 0;
let mouseX = 0;
let mouseY = 0;
let activePowerups = new Map();

// Emotes system
const EMOTES = ['👍', '😄', '🎯', '🔥', '👏', '🏀'];
let lastEmoteTime = 0;

// Game modes and settings
const GAME_MODES = {
    CLASSIC: 'classic',
    BATTLE_ROYALE: 'battle_royale',
    TIME_ATTACK: 'time_attack',
    TRICK_SHOT: 'trick_shot',
    TOURNAMENT: 'tournament'
};

// Power-up effects
const POWER_UP_EFFECTS = {
    DOUBLE_POINTS: {
        apply: (player) => {
            player.pointsMultiplier = 2;
        },
        remove: (player) => {
            player.pointsMultiplier = 1;
        }
    },
    BIGGER_BALL: {
        apply: (player) => {
            player.ballSize *= 1.5;
        },
        remove: (player) => {
            player.ballSize /= 1.5;
        }
    },
    SLOWER_BASKET: {
        apply: (player) => {
            player.basketSpeed *= 0.5;
        },
        remove: (player) => {
            player.basketSpeed *= 2;
        }
    },
    PERFECT_SHOT: {
        apply: (player) => {
            player.perfectShot = true;
        },
        remove: (player) => {
            player.perfectShot = false;
        }
    },
    MULTI_BALL: {
        apply: (player) => {
            player.multipleBalls = true;
        },
        remove: (player) => {
            player.multipleBalls = false;
        }
    },
    GRAVITY_FLIP: {
        apply: (player) => {
            player.gravityMultiplier *= -1;
        },
        remove: (player) => {
            player.gravityMultiplier *= -1;
        }
    },
    SPEED_BOOST: {
        apply: (player) => {
            player.moveSpeed *= 1.5;
        },
        remove: (player) => {
            player.moveSpeed /= 1.5;
        }
    }
};

// Player class enhancement
class Player {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.score = 0;
        this.streak = 0;
        this.activePowerUps = new Map();
        this.achievements = new Set();
        this.ballSize = 15;
        this.basketSpeed = 1;
        this.moveSpeed = 5;
        this.gravityMultiplier = 1;
        this.pointsMultiplier = 1;
        this.perfectShot = false;
        this.multipleBalls = false;
    }

    update() {
        // Update power-up durations and remove expired ones
        for (const [powerUpId, powerUp] of this.activePowerUps.entries()) {
            if (Date.now() >= powerUp.expiryTime) {
                this.removePowerUp(powerUpId);
            }
        }
    }

    addPowerUp(powerUp) {
        const effect = POWER_UP_EFFECTS[powerUp.type];
        if (effect) {
            effect.apply(this);
            this.activePowerUps.set(powerUp.id, {
                type: powerUp.type,
                expiryTime: Date.now() + powerUp.duration * 1000
            });

            // Show power-up effect animation
            this.showPowerUpEffect(powerUp);
        }
    }

    removePowerUp(powerUpId) {
        const powerUp = this.activePowerUps.get(powerUpId);
        if (powerUp) {
            const effect = POWER_UP_EFFECTS[powerUp.type];
            if (effect) {
                effect.remove(this);
            }
            this.activePowerUps.delete(powerUpId);
        }
    }

    showPowerUpEffect(powerUp) {
        const effect = document.createElement('div');
        effect.className = 'power-up-effect';
        effect.style.backgroundColor = powerUp.color;
        effect.style.left = `${this.x}px`;
        effect.style.top = `${this.y}px`;
        document.body.appendChild(effect);

        // Animate and remove the effect
        setTimeout(() => {
            effect.remove();
        }, 1000);
    }
}

// Game class enhancement
class Game {
    constructor(canvas, socket) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.socket = socket;
        this.players = new Map();
        this.balls = new Map();
        this.powerUps = [];
        this.obstacles = [];
        this.gameMode = GAME_MODES.CLASSIC;
        this.timeRemaining = 180;
        this.tournament = null;
        
        this.setupEventListeners();
        this.setupGameLoop();
    }

    setupEventListeners() {
        // ... existing event listeners ...

        this.socket.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case 'power_up_spawned':
                    this.handlePowerUpSpawn(data.powerUp);
                    break;
                case 'achievement_unlocked':
                    this.handleAchievementUnlock(data.achievement);
                    break;
                case 'tournament_match_ready':
                    this.handleTournamentMatch(data);
                    break;
                // ... existing cases ...
            }
        });
    }

    handlePowerUpSpawn(powerUp) {
        this.powerUps.push(powerUp);
        this.showPowerUpSpawnAnimation(powerUp);
    }

    handleAchievementUnlock(achievement) {
        this.showAchievementNotification(achievement);
        this.updateAchievementsDisplay();
    }

    handleTournamentMatch(data) {
        this.showTournamentMatchNotification(data);
        // Automatically join the match room
        this.socket.send(JSON.stringify({
            type: 'join_room',
            roomId: data.roomId,
            gameMode: GAME_MODES.TOURNAMENT
        }));
    }

    showAchievementNotification(achievement) {
        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <h3>Achievement Unlocked!</h3>
            <p>${achievement.name}</p>
            <p>${achievement.description}</p>
        `;
        document.body.appendChild(notification);

        // Animate and remove the notification
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 1000);
        }, 3000);
    }

    showPowerUpSpawnAnimation(powerUp) {
        const animation = document.createElement('div');
        animation.className = 'power-up-spawn';
        animation.style.backgroundColor = powerUp.color;
        animation.style.left = `${powerUp.x}px`;
        animation.style.top = `${powerUp.y}px`;
        document.body.appendChild(animation);

        // Remove the animation element after it's done
        setTimeout(() => animation.remove(), 1000);
    }

    showTournamentMatchNotification(data) {
        const notification = document.createElement('div');
        notification.className = 'tournament-notification';
        notification.innerHTML = `
            <h3>Tournament Match Ready!</h3>
            <p>Your opponent is waiting</p>
            <button onclick="this.parentElement.remove()">Let's Go!</button>
        `;
        document.body.appendChild(notification);
    }

    update() {
        // Update game state
        this.updatePlayers();
        this.updateBalls();
        this.updatePowerUps();
        this.updateObstacles();
        this.updateTime();

        // Check for collisions
        this.checkCollisions();

        // Update UI
        this.updateUI();
    }

    updatePlayers() {
        for (const player of this.players.values()) {
            player.update();
        }
    }

    updatePowerUps() {
        // Check for power-up collisions
        for (const powerUp of this.powerUps) {
            const player = this.players.get(this.socket.playerId);
            if (player && this.checkPowerUpCollision(player, powerUp)) {
                this.collectPowerUp(player, powerUp);
            }
        }
    }

    updateObstacles() {
        for (const obstacle of this.obstacles) {
            if (obstacle.type === 'platform' && obstacle.movementRange) {
                // Update moving platform position
                obstacle.x += obstacle.speed;
                if (obstacle.x > obstacle.startX + obstacle.movementRange || 
                    obstacle.x < obstacle.startX) {
                    obstacle.speed *= -1;
                }
            }
        }
    }

    updateTime() {
        if (this.timeRemaining > 0) {
            this.timeRemaining -= 1/60;
            if (this.timeRemaining <= 0) {
                this.handleGameEnd();
            }
        }
    }

    checkPowerUpCollision(player, powerUp) {
        const dx = player.x - powerUp.x;
        const dy = player.y - powerUp.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < 30; // Collision radius
    }

    collectPowerUp(player, powerUp) {
        // Remove power-up from the game
        this.powerUps = this.powerUps.filter(p => p.id !== powerUp.id);

        // Apply power-up effect to player
        player.addPowerUp(powerUp);

        // Notify server
        this.socket.send(JSON.stringify({
            type: 'power_up_used',
            powerUpId: powerUp.id
        }));
    }

    handleGameEnd() {
        // Show game end screen with stats
        const gameEndScreen = document.createElement('div');
        gameEndScreen.className = 'game-end-screen';
        gameEndScreen.innerHTML = `
            <h2>Game Over!</h2>
            <div class="stats">
                <p>Final Score: ${this.players.get(this.socket.playerId).score}</p>
                <p>Highest Streak: ${this.players.get(this.socket.playerId).highestStreak}</p>
                <p>Power-ups Collected: ${this.players.get(this.socket.playerId).activePowerUps.size}</p>
            </div>
            <button onclick="location.reload()">Play Again</button>
        `;
        document.body.appendChild(gameEndScreen);
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background based on game mode
        this.drawBackground();

        // Draw obstacles
        this.drawObstacles();

        // Draw power-ups
        this.drawPowerUps();

        // Draw players
        this.drawPlayers();

        // Draw balls
        this.drawBalls();

        // Draw UI
        this.drawUI();
    }

    drawBackground() {
        switch (this.gameMode) {
            case GAME_MODES.BATTLE_ROYALE:
                this.drawBattleRoyaleBackground();
                break;
            case GAME_MODES.TRICK_SHOT:
                this.drawTrickShotBackground();
                break;
            default:
                this.drawClassicBackground();
        }
    }

    drawBattleRoyaleBackground() {
        // Draw shrinking court
        const progress = this.timeRemaining / 300; // 5 minutes total
        const courtSize = Math.max(200, this.canvas.width * progress);
        const courtX = (this.canvas.width - courtSize) / 2;
        
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#666';
        this.ctx.fillRect(courtX, 0, courtSize, this.canvas.height);
    }

    drawTrickShotBackground() {
        // Draw special trick shot elements
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw bounce guides
        this.ctx.strokeStyle = '#444';
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        for (let i = 0; i < this.canvas.width; i += 100) {
            this.ctx.moveTo(i, 0);
            this.ctx.lineTo(i, this.canvas.height);
        }
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawClassicBackground() {
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawObstacles() {
        for (const obstacle of this.obstacles) {
            this.ctx.fillStyle = obstacle.type === 'wall' ? '#666' : '#444';
            this.ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            
            if (obstacle.type === 'barrier' && obstacle.health) {
                // Draw health bar
                this.ctx.fillStyle = '#f00';
                const healthHeight = (obstacle.health / 3) * obstacle.height;
                this.ctx.fillRect(obstacle.x, obstacle.y + obstacle.height - healthHeight, 
                    obstacle.width, healthHeight);
            }
        }
    }

    drawPowerUps() {
        for (const powerUp of this.powerUps) {
            this.ctx.fillStyle = powerUp.color;
            this.ctx.beginPath();
            this.ctx.arc(powerUp.x, powerUp.y, 15, 0, Math.PI * 2);
            this.ctx.fill();

            // Draw power-up icon or symbol
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(powerUp.type[0], powerUp.x, powerUp.y + 4);
        }
    }

    drawUI() {
        // Draw time remaining
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = Math.floor(this.timeRemaining % 60);
        this.ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, 
            this.canvas.width / 2, 30);

        // Draw active power-ups
        const player = this.players.get(this.socket.playerId);
        if (player) {
            let i = 0;
            for (const [powerUpId, powerUp] of player.activePowerUps) {
                const timeLeft = Math.ceil((powerUp.expiryTime - Date.now()) / 1000);
                this.ctx.fillStyle = POWER_UP_EFFECTS[powerUp.type].color;
                this.ctx.fillRect(10 + i * 60, 10, 50, 50);
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText(timeLeft, 35 + i * 60, 40);
                i++;
            }
        }

        // Draw streak counter
        if (player && player.streak > 0) {
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '36px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${player.streak}x`, this.canvas.width - 50, 50);
        }
    }
}

// Add CSS styles for new UI elements
const style = document.createElement('style');
style.textContent = `
    .power-up-effect {
        position: absolute;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        animation: pulse 1s ease-out;
        pointer-events: none;
    }

    .achievement-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        animation: slideIn 0.5s ease-out;
    }

    .tournament-notification {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 30px;
        border-radius: 15px;
        text-align: center;
    }

    .game-end-screen {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.95);
        color: white;
        padding: 40px;
        border-radius: 20px;
        text-align: center;
    }

    @keyframes pulse {
        from { transform: scale(1); opacity: 0.8; }
        to { transform: scale(2); opacity: 0; }
    }

    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    .fade-out {
        animation: fadeOut 1s ease-out;
    }

    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }

    button {
        background: #4CAF50;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
        margin-top: 20px;
    }

    button:hover {
        background: #45a049;
    }
`;

document.head.appendChild(style);

// WebSocket event handlers
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
        case 'init':
            playerId = data.playerId;
            showMainMenu();
            break;
            
        case 'room_created':
            currentRoom = data.roomId;
            updateRoomDisplay();
            showRoomMenu();
            break;
            
        case 'player_joined':
            gameState = data.gameState;
            updatePlayerList();
            break;
            
        case 'game_update':
            gameState = data.gameState;
            break;
            
        case 'shot_taken':
            if (data.playerId !== playerId) {
                showOtherPlayerShot(data.shotData);
            }
            break;
            
        case 'score_update':
            updateLeaderboard(data.globalRanking);
            if (data.playerId === playerId) {
                score = data.score;
            }
            break;
            
        case 'powerup_spawned':
            spawnPowerup(data.powerup);
            break;
            
        case 'powerup_collected':
            if (data.playerId === playerId) {
                activatePowerup(data.powerupType);
            }
            removePowerup(data.powerupId);
            break;
            
        case 'chat_message':
            addChatMessage(data.playerId, data.message);
            break;
            
        case 'emote':
            showEmote(data.playerId, data.emote);
            break;
    }
};

// UI Functions
function showMainMenu() {
    document.getElementById('mainMenu').style.display = 'block';
    document.getElementById('roomMenu').style.display = 'none';
    document.getElementById('gameOver').style.display = 'none';
}

function showRoomMenu() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('roomMenu').style.display = 'block';
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('roomDisplay').textContent = currentRoom;
    document.getElementById('roomCode').textContent = currentRoom;
}

function updatePlayerList() {
    const playerList = document.getElementById('playerList');
    playerList.innerHTML = '';
    
    Object.entries(gameState.players).forEach(([id, player]) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-info';
        playerDiv.innerHTML = `
            <div class="player-color" style="background-color: ${id === playerId ? '#4dabf7' : '#ff6b6b'}"></div>
            <span>Player ${id.substring(0, 4)} - Score: ${player.score}</span>
        `;
        playerList.appendChild(playerDiv);
    });
}

// Game Functions
function createRoom() {
    ws.send(JSON.stringify({ type: 'create_room' }));
}

function joinRoom() {
    const roomId = document.getElementById('roomInput').value;
    ws.send(JSON.stringify({ type: 'join_room', roomId }));
}

function leaveRoom() {
    ws.send(JSON.stringify({ type: 'leave_room' }));
    showMainMenu();
}

function startGame() {
    ws.send(JSON.stringify({ type: 'start_game' }));
    document.getElementById('roomMenu').style.display = 'none';
}

function spawnPowerup(powerup) {
    gameState.powerups.push(powerup);
}

function removePowerup(powerupId) {
    gameState.powerups = gameState.powerups.filter(p => p.id !== powerupId);
}

function activatePowerup(type) {
    const powerup = POWERUP_TYPES[type];
    activePowerups.set(type, {
        timeLeft: powerup.duration,
        effect: powerup
    });
    
    document.getElementById('powerupIndicator').style.display = 'block';
    document.getElementById('powerupIndicator').textContent = `${powerup.symbol} ${powerup.duration}s`;
    
    playSound('powerup');
}

function updatePowerups() {
    for (const [type, data] of activePowerups.entries()) {
        data.timeLeft -= 1/60;
        if (data.timeLeft <= 0) {
            activePowerups.delete(type);
        }
    }
    
    if (activePowerups.size > 0) {
        const powerupText = Array.from(activePowerups.entries())
            .map(([type, data]) => `${POWERUP_TYPES[type].symbol} ${Math.ceil(data.timeLeft)}s`)
            .join(' ');
        document.getElementById('powerupIndicator').textContent = powerupText;
    } else {
        document.getElementById('powerupIndicator').style.display = 'none';
    }
}

function showEmote(playerId, emote) {
    const player = gameState.players[playerId];
    if (!player) return;
    
    const emoteDiv = document.createElement('div');
    emoteDiv.className = 'emoji-reaction';
    emoteDiv.textContent = emote;
    emoteDiv.style.left = `${player.x}px`;
    emoteDiv.style.top = `${player.y - 30}px`;
    document.getElementById('gameContainer').appendChild(emoteDiv);
    
    setTimeout(() => emoteDiv.remove(), 1000);
}

// Chat Functions
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const message = e.target.value.trim();
        if (message) {
            ws.send(JSON.stringify({
                type: 'chat_message',
                message
            }));
            e.target.value = '';
        }
    }
});

function addChatMessage(senderId, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.textContent = `Player ${senderId.substring(0, 4)}: ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Emote System
document.addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E') {
        const now = Date.now();
        if (now - lastEmoteTime > 1000) {
            const emote = EMOTES[Math.floor(Math.random() * EMOTES.length)];
            ws.send(JSON.stringify({
                type: 'emote',
                emote
            }));
            lastEmoteTime = now;
        }
    }
});

// Original game functions with multiplayer modifications
function updateBall() {
    if (ball.isShot) {
        // Store trail
        ball.trail.push({x: ball.x, y: ball.y});
        if (ball.trail.length > 10) ball.trail.shift();
        
        // Apply physics with power-ups
        const gravityMultiplier = activePowerups.has('PERFECT_SHOT') ? 0.3 : 1;
        ball.velocityY += gravity * gravityMultiplier;
        
        const resistanceMultiplier = activePowerups.has('PERFECT_SHOT') ? 0.995 : airResistance;
        ball.velocityX *= resistanceMultiplier;
        ball.velocityY *= resistanceMultiplier;
        
        ball.x += ball.velocityX;
        ball.y += ball.velocityY;
        
        ball.rotation += ball.velocityX * 0.1;
        
        handleCollisions();
        
        // Send ball state to server
        ws.send(JSON.stringify({
            type: 'game_update',
            ballState: {
                x: ball.x,
                y: ball.y,
                velocityX: ball.velocityX,
                velocityY: ball.velocityY,
                rotation: ball.rotation
            }
        }));
    }
}

function handleCollisions() {
    // Floor collision
    if (ball.y + ball.radius > canvas.height) {
        ball.y = canvas.height - ball.radius;
        ball.velocityY = -ball.velocityY * bounce;
        playSound('bounce');
    }
    
    // Wall collisions
    if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
        ball.velocityX = -ball.velocityX * bounce;
        playSound('bounce');
    }
    
    // Basket collision
    if (checkBasketCollision()) {
        let points = 2;
        if (activePowerups.has('DOUBLE_POINTS')) points *= 2;
        if (Math.abs(ball.velocityY) < 5) points++; // Swish bonus
        
        score += points;
        ws.send(JSON.stringify({
            type: 'score_update',
            score: score
        }));
        
        playSound('score');
        resetBall();
    }
    
    // Power-up collisions
    gameState.powerups.forEach(powerup => {
        const dx = ball.x - powerup.x;
        const dy = ball.y - powerup.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < ball.radius + 15) {
            ws.send(JSON.stringify({
                type: 'powerup_collected',
                powerupId: powerup.id,
                powerupType: powerup.type
            }));
        }
    });
}

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw other players
    Object.entries(gameState.players).forEach(([id, player]) => {
        if (id !== playerId) {
            ctx.fillStyle = '#ff6b6b';
            ctx.fillRect(player.x, player.y, 40, 80);
        }
    });
    
    // Draw power-ups
    gameState.powerups.forEach(powerup => {
        const type = POWERUP_TYPES[powerup.type];
        ctx.beginPath();
        ctx.arc(powerup.x, powerup.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = type.color;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(type.symbol, powerup.x, powerup.y + 6);
    });
    
    // Draw basket with power-up effects
    const originalMoveSpeed = basket.moveSpeed;
    if (activePowerups.has('SLOWER_BASKET')) {
        basket.moveSpeed *= 0.5;
    }
    updateBasket();
    basket.moveSpeed = originalMoveSpeed;
    
    // Draw ball with power-up effects
    const originalRadius = ball.radius;
    if (activePowerups.has('BIGGER_BALL')) {
        ball.radius *= 1.5;
    }
    
    // Draw ball trail
    ball.trail.forEach((pos, i) => {
        const alpha = i / ball.trail.length;
        ctx.fillStyle = `rgba(255, 107, 107, ${alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, ball.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Draw ball
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-ball.radius, 0);
    ctx.lineTo(ball.radius, 0);
    ctx.stroke();
    ctx.restore();
    
    ball.radius = originalRadius;
    
    // Draw basket
    ctx.fillStyle = basket.color;
    ctx.fillRect(basket.x, basket.y, basket.width, basket.rimWidth);
    ctx.fillRect(basket.x, basket.y, basket.rimWidth, basket.height);
    
    // Draw net
    ctx.beginPath();
    ctx.moveTo(basket.netPoints[0].x, basket.netPoints[0].y);
    basket.netPoints.forEach(point => {
        ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    
    // Draw aim line
    if (isPoweringUp) {
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(mouseX, mouseY);
        ctx.strokeStyle = `rgba(255, 255, 255, ${power/100})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw power meter
        ctx.fillStyle = `hsl(${120 * (1 - power/100)}, 100%, 50%)`;
        ctx.fillRect(10, 10, power * 2, 20);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(10, 10, 200, 20);
    }
    
    // Update UI
    document.getElementById('score').textContent = score;
    document.getElementById('time').textContent = Math.ceil(gameTime);
}

function gameLoop() {
    if (!isGameOver) {
        if (isPoweringUp && power < 100) {
            power += 2;
        }
        
        updateBall();
        updatePowerups();
        drawGame();
        
        gameTime -= 1/60;
        
        if (gameTime <= 0) {
            endGame();
        }
    }
    requestAnimationFrame(gameLoop);
}

function endGame() {
    isGameOver = true;
    document.getElementById('gameOver').style.display = 'block';
    document.getElementById('finalScore').textContent = score;
}

function restartGame() {
    score = 0;
    gameTime = 60;
    isGameOver = false;
    consecutiveBaskets = 0;
    document.getElementById('gameOver').style.display = 'none';
    resetBall();
}

function checkBasketCollision() {
    return (
        ball.x > basket.x &&
        ball.x < basket.x + basket.width &&
        ball.y > basket.y &&
        ball.y < basket.y + basket.height &&
        ball.velocityY > 0  // Ball must be moving downward
    );
}

function updateBasket() {
    // Move basket
    basket.y += basket.moveSpeed * basket.direction;
    
    // Reverse direction at boundaries
    if (basket.y < 100 || basket.y > 400) {
        basket.direction *= -1;
    }
    
    // Update net physics
    basket.netPoints.forEach((point, i) => {
        const targetY = i === 0 || i === basket.netPoints.length - 1 
            ? point.baseY 
            : (basket.netPoints[i-1].y + basket.netPoints[i+1].y) / 2;
        
        point.velocity += (targetY - point.y) * 0.1;
        point.velocity *= 0.8;
        point.y += point.velocity;
        
        point.x = basket.x + i * (basket.width / 9);
        point.baseY = basket.y + basket.height;
    });
}

// Start with main menu
showMainMenu();
gameLoop(); 