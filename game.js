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

// Game class
class Game {
    constructor(canvas, socket) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.socket = socket;
        this.gameMode = 'classic';
        this.isRunning = false;
        
        // Initialize sounds
        this.sounds = {
            bounce: new Audio('data:audio/wav;base64,UklGRqgAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YYQAAAAzAIAAzQD/ALUA/wCAADMAAADN/wAAtf8AAIAAMwAAAM3/AAC1/wAAgAAzAAAAzf8AALX/AACAAAAAMwDNAP8AtQD/AIAAMQAAAP3/AAC9/wAAgAAAAAAA'),
            score: new Audio('data:audio/wav;base64,UklGRn4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVAAAAB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AA=='),
            powerup: new Audio('data:audio/wav;base64,UklGRn4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVAAAAB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AA==')
        };

        // Initialize power-up types
        this.POWERUP_TYPES = {
            DOUBLE_POINTS: { color: '#ffd700', duration: 10, symbol: '2×' },
            BIGGER_BALL: { color: '#4CAF50', duration: 15, symbol: '⚪' },
            SLOWER_BASKET: { color: '#2196F3', duration: 8, symbol: '⏱' },
            PERFECT_SHOT: { color: '#9C27B0', duration: 5, symbol: '🎯' }
        };

        // Game objects
        this.ball = {
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

        this.basket = {
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
            this.basket.netPoints.push({
                x: this.basket.x + i * (this.basket.width / 9),
                y: this.basket.y + this.basket.height,
                baseY: this.basket.y + this.basket.height,
                velocity: 0
            });
        }

        // Game state
        this.score = 0;
        this.gameTime = 60;
        this.isGameOver = false;
        this.isPoweringUp = false;
        this.power = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.activePowerups = new Map();
        this.lastEmoteTime = 0;

        // Bind event listeners
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Set canvas size
        this.canvas.width = 800;
        this.canvas.height = 600;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.gameLoop();
    }

    stop() {
        this.isRunning = false;
    }

    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = event.clientX - rect.left;
        this.mouseY = event.clientY - rect.top;
    }

    handleMouseDown(event) {
        if (this.isGameOver) return;
        this.isPoweringUp = true;
        this.power = 0;
    }

    handleMouseUp(event) {
        if (this.isGameOver || !this.isPoweringUp) return;
        this.isPoweringUp = false;
        this.shootBall();
    }

    shootBall() {
        const angle = Math.atan2(this.mouseY - this.ball.y, this.mouseX - this.ball.x);
        const power = Math.min(this.power, 100);
        this.ball.velocityX = Math.cos(angle) * power * 0.2;
        this.ball.velocityY = Math.sin(angle) * power * 0.2;
        this.ball.isShot = true;
        this.sounds.bounce.play();
    }

    gameLoop() {
        if (!this.isRunning) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update game state
        this.update();

        // Draw game objects
        this.draw();

        // Request next frame
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    update() {
        // Update power meter
        if (this.isPoweringUp) {
            this.power = Math.min(this.power + 2, 100);
        }

        // Update ball position
        if (this.ball.isShot) {
            this.ball.x += this.ball.velocityX;
            this.ball.y += this.ball.velocityY;
            this.ball.velocityY += 0.5; // Gravity
            this.ball.rotation += this.ball.velocityX * 0.1;

            // Ball trail
            this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
            if (this.ball.trail.length > 10) {
                this.ball.trail.shift();
            }

            // Check for collisions
            this.checkCollisions();
        }

        // Update basket movement
        this.basket.y += this.basket.moveSpeed * this.basket.direction;
        if (this.basket.y > this.canvas.height - 100 || this.basket.y < 100) {
            this.basket.direction *= -1;
        }

        // Update net physics
        this.updateNet();
    }

    draw() {
        // Draw background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw ball trail
        this.drawBallTrail();

        // Draw ball
        this.drawBall();

        // Draw basket
        this.drawBasket();

        // Draw power meter
        if (this.isPoweringUp) {
            this.drawPowerMeter();
        }

        // Draw score
        this.drawScore();
    }

    drawBallTrail() {
        this.ctx.beginPath();
        this.ball.trail.forEach((pos, i) => {
            const alpha = i / this.ball.trail.length;
            this.ctx.strokeStyle = `rgba(255, 107, 107, ${alpha})`;
            this.ctx.lineWidth = 2;
            if (i === 0) {
                this.ctx.moveTo(pos.x, pos.y);
            } else {
                this.ctx.lineTo(pos.x, pos.y);
            }
        });
        this.ctx.stroke();
    }

    drawBall() {
        this.ctx.save();
        this.ctx.translate(this.ball.x, this.ball.y);
        this.ctx.rotate(this.ball.rotation);
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = this.ball.color;
        this.ctx.fill();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw ball lines
        this.ctx.beginPath();
        this.ctx.moveTo(-this.ball.radius, 0);
        this.ctx.lineTo(this.ball.radius, 0);
        this.ctx.moveTo(0, -this.ball.radius);
        this.ctx.lineTo(0, this.ball.radius);
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawBasket() {
        // Draw backboard
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(this.basket.x + this.basket.width, 
                         this.basket.y - 50, 
                         10, 
                         100);

        // Draw rim
        this.ctx.beginPath();
        this.ctx.moveTo(this.basket.x, this.basket.y);
        this.ctx.lineTo(this.basket.x + this.basket.width, this.basket.y);
        this.ctx.strokeStyle = this.basket.color;
        this.ctx.lineWidth = this.basket.rimWidth;
        this.ctx.stroke();

        // Draw net
        this.drawNet();
    }

    drawNet() {
        this.ctx.beginPath();
        this.ctx.moveTo(this.basket.netPoints[0].x, this.basket.netPoints[0].y);
        for (let i = 1; i < this.basket.netPoints.length; i++) {
            const point = this.basket.netPoints[i];
            this.ctx.lineTo(point.x, point.y);
        }
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }

    updateNet() {
        this.basket.netPoints.forEach(point => {
            const targetY = point.baseY;
            const dy = targetY - point.y;
            point.velocity += dy * 0.1;
            point.velocity *= 0.8;
            point.y += point.velocity;
        });
    }

    drawPowerMeter() {
        const meterWidth = 200;
        const meterHeight = 20;
        const x = (this.canvas.width - meterWidth) / 2;
        const y = this.canvas.height - 50;

        // Draw background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, meterWidth, meterHeight);

        // Draw power level
        this.ctx.fillStyle = `hsl(${120 * (1 - this.power / 100)}, 100%, 50%)`;
        this.ctx.fillRect(x, y, meterWidth * (this.power / 100), meterHeight);

        // Draw border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, meterWidth, meterHeight);
    }

    drawScore() {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 20, 40);
    }

    checkCollisions() {
        // Check wall collisions
        if (this.ball.x < this.ball.radius || this.ball.x > this.canvas.width - this.ball.radius) {
            this.ball.velocityX *= -0.8;
            this.sounds.bounce.play();
        }
        if (this.ball.y < this.ball.radius) {
            this.ball.velocityY *= -0.8;
            this.sounds.bounce.play();
        }

        // Check basket collision
        if (this.ball.y > this.basket.y - this.ball.radius && 
            this.ball.y < this.basket.y + this.ball.radius && 
            this.ball.x > this.basket.x && 
            this.ball.x < this.basket.x + this.basket.width) {
            
            if (this.ball.velocityY > 0) {
                this.score += 2;
                this.sounds.score.play();
                this.resetBall();
            }
        }

        // Reset ball if it goes off screen
        if (this.ball.y > this.canvas.height + 50) {
            this.resetBall();
        }
    }

    resetBall() {
        this.ball.x = 100;
        this.ball.y = 500;
        this.ball.velocityX = 0;
        this.ball.velocityY = 0;
        this.ball.isShot = false;
        this.ball.rotation = 0;
        this.ball.trail = [];
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