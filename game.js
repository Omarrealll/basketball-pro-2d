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