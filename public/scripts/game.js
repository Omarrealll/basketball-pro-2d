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

// Sound system
const AudioManager = {
    sounds: {
        bounce: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
        score: new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'),
        powerup: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
        swish: new Audio('https://assets.mixkit.co/active_storage/sfx/2643/2643-preview.mp3'),
        achievement: new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'),
        gameOver: new Audio('https://assets.mixkit.co/active_storage/sfx/1432/1432-preview.mp3'),
        menuClick: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3')
    },
    music: {
        menu: new Audio('https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3'),
        game: new Audio('https://assets.mixkit.co/active_storage/sfx/125/125-preview.mp3'),
        intense: new Audio('https://assets.mixkit.co/active_storage/sfx/127/127-preview.mp3')
    },
    currentMusic: null,
    isMuted: false,
    musicVolume: 0.3,
    sfxVolume: 0.5,

    init() {
        // Set up looping for music tracks
        Object.values(this.music).forEach(track => {
            track.loop = true;
            track.volume = this.musicVolume;
        });

        // Set up sound effects volume
        Object.values(this.sounds).forEach(sound => {
            sound.volume = this.sfxVolume;
        });

        // Add volume controls to the UI
        this.createVolumeControls();
    },

    createVolumeControls() {
        const controls = document.createElement('div');
        controls.id = 'volume-controls';
        controls.innerHTML = `
            <div class="volume-control">
                <label>Music: <span id="music-volume">30%</span></label>
                <input type="range" id="music-slider" min="0" max="100" value="30">
            </div>
            <div class="volume-control">
                <label>SFX: <span id="sfx-volume">50%</span></label>
                <input type="range" id="sfx-slider" min="0" max="100" value="50">
            </div>
            <button id="mute-toggle">🔊</button>
        `;
        document.body.appendChild(controls);

        // Add event listeners
        document.getElementById('music-slider').addEventListener('input', (e) => {
            this.setMusicVolume(e.target.value / 100);
        });

        document.getElementById('sfx-slider').addEventListener('input', (e) => {
            this.setSFXVolume(e.target.value / 100);
        });

        document.getElementById('mute-toggle').addEventListener('click', () => {
            this.toggleMute();
        });
    },

    playSound(soundName) {
        if (this.isMuted) return;
        const sound = this.sounds[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log('Error playing sound:', e));
        }
    },

    playMusic(trackName) {
        if (this.currentMusic) {
            this.currentMusic.pause();
            this.currentMusic.currentTime = 0;
        }
        
        const track = this.music[trackName];
        if (track && !this.isMuted) {
            track.play().catch(e => console.log('Error playing music:', e));
            this.currentMusic = track;
        }
    },

    setMusicVolume(volume) {
        this.musicVolume = volume;
        Object.values(this.music).forEach(track => {
            track.volume = volume;
        });
        document.getElementById('music-volume').textContent = `${Math.round(volume * 100)}%`;
    },

    setSFXVolume(volume) {
        this.sfxVolume = volume;
        Object.values(this.sounds).forEach(sound => {
            sound.volume = volume;
        });
        document.getElementById('sfx-volume').textContent = `${Math.round(volume * 100)}%`;
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        const button = document.getElementById('mute-toggle');
        button.textContent = this.isMuted ? '🔇' : '🔊';

        if (this.isMuted) {
            if (this.currentMusic) {
                this.currentMusic.pause();
            }
        } else {
            if (this.currentMusic) {
                this.currentMusic.play().catch(e => console.log('Error resuming music:', e));
            }
        }
    }
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
class BasketChaosPro {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        
        // Game state
        this.gameState = 'menu'; // menu, playing, gameOver
        this.players = [];
        this.ball = null;
        this.score = [0, 0];
        this.roundsToWin = 5;
        this.currentMode = 'classic';
        this.gravity = 0.5;
        this.windForce = 0;
        this.powerups = [];
        this.effects = [];
        this.combo = 0;
        this.maxCombo = 0;
        
        // Enhanced features
        this.powerupTypes = [
            { name: 'superJump', icon: '🦘', duration: 5000 },
            { name: 'giantBall', icon: '🏀', duration: 8000 },
            { name: 'timeFreeze', icon: '⌛', duration: 3000 },
            { name: 'antiGravity', icon: '🌠', duration: 4000 },
            { name: 'multiball', icon: '🎯', duration: 6000 },
            { name: 'tornado', icon: '🌪️', duration: 4000 }
        ];
        
        // Game modes
        this.gameModes = {
            classic: { name: 'Classic', icon: '🏀', description: 'First to 5 points wins!' },
            timeAttack: { name: 'Time Attack', icon: '⏱️', description: 'Score as much as possible in 60 seconds!' },
            chaos: { name: 'Chaos', icon: '🌪️', description: 'Random events every 5 seconds!' },
            survival: { name: 'Survival', icon: '💪', description: 'Three misses and you\'re out!' },
            trickshot: { name: 'Trick Shot', icon: '🎯', description: 'Points multiply with each bounce!' },
            versus: { name: 'Versus', icon: '⚔️', description: 'Battle against another player!' }
        };

        // Sound effects
        this.sounds = {
            bounce: new Audio('/assets/sounds/bounce.mp3'),
            score: new Audio('/assets/sounds/score.mp3'),
            powerup: new Audio('/assets/sounds/powerup.mp3'),
            crowd: new Audio('/assets/sounds/crowd.mp3'),
            music: new Audio('/assets/sounds/background.mp3')
        };

        // Initialize controls
        this.initControls();
        
        // Start game loop
        this.lastTime = 0;
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    setupCanvas() {
        // Make canvas responsive
        const resize = () => {
            const width = Math.min(800, window.innerWidth - 20);
            const height = (width * 3) / 4;
            this.canvas.width = width;
            this.canvas.height = height;
            this.scale = width / 800; // Base scale for all game objects
        };
        
        window.addEventListener('resize', resize);
        resize();
    }

    initControls() {
        // Keyboard controls
        const keys = {
            player1: { up: 'w', left: 'a', right: 'd' },
            player2: { up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight' }
        };
        
        this.controls = {
            player1: { up: false, left: false, right: false },
            player2: { up: false, left: false, right: false }
        };

        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e.key, true);
        });

        document.addEventListener('keyup', (e) => {
            this.handleKeyPress(e.key, false);
        });

        // Touch controls for mobile
        if ('ontouchstart' in window) {
            this.initTouchControls();
        }
    }

    initTouchControls() {
        const touchZones = {
            left: { x: 0, w: this.canvas.width * 0.3 },
            middle: { x: this.canvas.width * 0.3, w: this.canvas.width * 0.4 },
            right: { x: this.canvas.width * 0.7, w: this.canvas.width * 0.3 }
        };

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const x = touch.clientX - this.canvas.offsetLeft;
            
            if (x < touchZones.left.x + touchZones.left.w) {
                this.controls.player1.left = true;
            } else if (x > touchZones.right.x) {
                this.controls.player1.right = true;
            } else {
                this.controls.player1.up = true;
            }
        });

        this.canvas.addEventListener('touchend', () => {
            Object.keys(this.controls.player1).forEach(key => {
                this.controls.player1[key] = false;
            });
        });
    }

    handleKeyPress(key, isDown) {
        const { player1, player2 } = this.controls;
        
        switch(key) {
            case 'w': player1.up = isDown; break;
            case 'a': player1.left = isDown; break;
            case 'd': player1.right = isDown; break;
            case 'ArrowUp': player2.up = isDown; break;
            case 'ArrowLeft': player2.left = isDown; break;
            case 'ArrowRight': player2.right = isDown; break;
        }
    }

    spawnPowerup() {
        if (Math.random() < 0.02 && this.powerups.length < 3) { // 2% chance each frame
            const type = this.powerupTypes[Math.floor(Math.random() * this.powerupTypes.length)];
            const x = Math.random() * (this.canvas.width - 40) + 20;
            const y = Math.random() * (this.canvas.height / 2) + 20;
            
            this.powerups.push({
                type,
                x,
                y,
                width: 30 * this.scale,
                height: 30 * this.scale,
                collected: false,
                spawnTime: Date.now()
            });
        }
    }

    applyPowerup(player, powerup) {
        this.sounds.powerup.play();
        const duration = powerup.type.duration;
        
        switch(powerup.type.name) {
            case 'superJump':
                player.jumpForce *= 1.5;
                setTimeout(() => { player.jumpForce /= 1.5; }, duration);
                break;
            case 'giantBall':
                this.ball.radius *= 2;
                setTimeout(() => { this.ball.radius /= 2; }, duration);
                break;
            case 'timeFreeze':
                const oldGravity = this.gravity;
                this.gravity = 0.1;
                setTimeout(() => { this.gravity = oldGravity; }, duration);
                break;
            case 'antiGravity':
                this.gravity *= -1;
                setTimeout(() => { this.gravity *= -1; }, duration);
                break;
            case 'multiball':
                this.spawnExtraBalls();
                break;
            case 'tornado':
                this.startTornado();
                break;
        }
    }

    spawnExtraBalls() {
        for (let i = 0; i < 2; i++) {
            const extraBall = { ...this.ball };
            extraBall.x += (Math.random() - 0.5) * 50;
            extraBall.y -= Math.random() * 50;
            this.balls.push(extraBall);
        }
        setTimeout(() => {
            this.balls = [this.ball];
        }, 6000);
    }

    startTornado() {
        this.tornado = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            radius: 100,
            strength: 2,
            duration: 4000,
            startTime: Date.now()
        };
    }

    updateTornado() {
        if (!this.tornado) return;
        
        const elapsed = Date.now() - this.tornado.startTime;
        if (elapsed > this.tornado.duration) {
            this.tornado = null;
            return;
        }

        // Move all objects towards tornado center
        [this.ball, ...this.players].forEach(obj => {
            const dx = this.tornado.x - obj.x;
            const dy = this.tornado.y - obj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < this.tornado.radius) {
                const force = (1 - dist / this.tornado.radius) * this.tornado.strength;
                obj.velocityX += (dx / dist) * force;
                obj.velocityY += (dy / dist) * force;
            }
        });
    }

    animate(currentTime) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch(this.gameState) {
            case 'menu':
                this.drawMenu();
                break;
            case 'playing':
                this.update(deltaTime);
                this.draw();
                break;
            case 'gameOver':
                this.drawGameOver();
                break;
        }

        requestAnimationFrame(this.animate);
    }

    update(deltaTime) {
        // Update game physics
        this.updatePlayers(deltaTime);
        this.updateBall(deltaTime);
        this.updatePowerups();
        this.updateTornado();
        this.checkCollisions();
        this.checkScore();
        
        // Random events in chaos mode
        if (this.currentMode === 'chaos' && Math.random() < 0.005) {
            this.triggerRandomEvent();
        }
    }

    triggerRandomEvent() {
        const events = [
            () => { this.gravity *= -1; setTimeout(() => { this.gravity *= -1; }, 3000); },
            () => { this.windForce = (Math.random() - 0.5) * 2; setTimeout(() => { this.windForce = 0; }, 4000); },
            () => { this.startTornado(); },
            () => { this.ball.radius *= Math.random() + 0.5; setTimeout(() => { this.ball.radius = 15; }, 5000); },
            () => { this.players.forEach(p => p.jumpForce *= 1.5); setTimeout(() => { this.players.forEach(p => p.jumpForce /= 1.5); }, 3000); }
        ];

        const randomEvent = events[Math.floor(Math.random() * events.length)];
        randomEvent();
    }

    draw() {
        // Draw background
        this.drawBackground();
        
        // Draw game elements
        this.drawPlayers();
        this.drawBall();
        this.drawPowerups();
        this.drawEffects();
        this.drawUI();
        
        if (this.tornado) {
            this.drawTornado();
        }
    }

    drawBackground() {
        // Gradient background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#2a2a2a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Court lines
        this.ctx.strokeStyle = '#ffffff33';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height - 100);
        this.ctx.lineTo(this.canvas.width, this.canvas.height - 100);
        this.ctx.stroke();
    }

    drawTornado() {
        const elapsed = Date.now() - this.tornado.startTime;
        const alpha = Math.max(0, 1 - elapsed / this.tornado.duration);
        
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.arc(this.tornado.x, this.tornado.y, this.tornado.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.fill();
        
        // Draw swirl effect
        for (let i = 0; i < 5; i++) {
            const angle = (Date.now() / 1000 + i / 5) * Math.PI * 2;
            const x = this.tornado.x + Math.cos(angle) * this.tornado.radius * 0.5;
            const y = this.tornado.y + Math.sin(angle) * this.tornado.radius * 0.5;
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, 5, 0, Math.PI * 2);
            this.ctx.fillStyle = 'white';
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }

    startGame(mode) {
        this.currentMode = mode;
        this.gameState = 'playing';
        this.score = [0, 0];
        this.combo = 0;
        this.maxCombo = 0;
        this.powerups = [];
        this.effects = [];
        
        // Initialize players
        this.players = [
            this.createPlayer(1, this.canvas.width * 0.25),
            this.createPlayer(2, this.canvas.width * 0.75)
        ];
        
        // Initialize ball
        this.ball = this.createBall();
        
        // Start background music
        this.sounds.music.loop = true;
        this.sounds.music.play();
    }

    createPlayer(id, x) {
        return {
            id,
            x,
            y: this.canvas.height - 150,
            width: 40 * this.scale,
            height: 60 * this.scale,
            velocityX: 0,
            velocityY: 0,
            speed: 5,
            jumpForce: 15,
            isJumping: false,
            color: id === 1 ? '#4CAF50' : '#2196F3'
        };
    }

    createBall() {
        return {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            radius: 15 * this.scale,
            velocityX: 0,
            velocityY: 0,
            bounces: 0,
            lastTouchedBy: null
        };
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BasketChaosPro();
});

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

    #volume-controls {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        padding: 15px;
        border-radius: 10px;
        z-index: 1000;
    }

    .volume-control {
        margin: 10px 0;
        color: white;
    }

    .volume-control input[type="range"] {
        width: 100px;
        margin-left: 10px;
    }

    #mute-toggle {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 5px;
    }

    #mute-toggle:hover {
        opacity: 0.8;
    }

    .score-popup {
        position: absolute;
        color: white;
        font-size: 24px;
        font-weight: bold;
        text-shadow: 0 0 10px rgba(0,0,0,0.5);
        pointer-events: none;
        animation: scorePopup 1s ease-out forwards;
    }
    
    .score-popup.special {
        color: #ffd700;
        font-size: 32px;
        text-shadow: 0 0 15px rgba(255,215,0,0.5);
    }
    
    @keyframes scorePopup {
        0% { transform: translateY(0); opacity: 1; }
        100% { transform: translateY(-50px); opacity: 0; }
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
    
    AudioManager.playSound('powerup');
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

// Initialize menu handlers
document.addEventListener('DOMContentLoaded', () => {
    // Add click sound to menu buttons
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => {
            AudioManager.playSound('menuClick');
        });
    });
});

// Start with main menu
showMainMenu();
gameLoop();

// Add new CSS styles for enhanced visual effects
const newStyles = `
    .power-meter {
        position: absolute;
        left: 20px;
        top: 20px;
        width: 200px;
        height: 20px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid white;
        border-radius: 10px;
        overflow: hidden;
    }

    .power-fill {
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #FFC107, #F44336);
        transition: width 0.1s;
    }

    .score-popup {
        position: absolute;
        color: white;
        font-size: 24px;
        font-weight: bold;
        text-shadow: 0 0 10px rgba(0,0,0,0.5);
        pointer-events: none;
        animation: scorePopup 1s ease-out forwards;
    }

    .score-popup.special {
        color: #ffd700;
        font-size: 32px;
        text-shadow: 0 0 15px rgba(255,215,0,0.5);
        animation: specialScorePopup 1s ease-out forwards;
    }

    @keyframes scorePopup {
        0% { transform: scale(0.5) translateY(0); opacity: 0; }
        20% { transform: scale(1.2) translateY(-10px); opacity: 1; }
        100% { transform: scale(1) translateY(-50px); opacity: 0; }
    }

    @keyframes specialScorePopup {
        0% { transform: scale(0.5) translateY(0) rotate(-10deg); opacity: 0; }
        20% { transform: scale(1.5) translateY(-20px) rotate(10deg); opacity: 1; }
        100% { transform: scale(1) translateY(-80px) rotate(-10deg); opacity: 0; }
    }

    .wind-indicator {
        position: absolute;
        right: 20px;
        top: 20px;
        background: rgba(0, 0, 0, 0.5);
        padding: 10px;
        border-radius: 5px;
        color: white;
        font-family: Arial, sans-serif;
    }

    .streak-counter {
        position: absolute;
        left: 50%;
        top: 20px;
        transform: translateX(-50%);
        font-size: 36px;
        color: #ffd700;
        text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        opacity: 0;
        transition: opacity 0.3s;
    }

    .streak-counter.visible {
        opacity: 1;
    }
`;

document.head.appendChild(document.createElement('style')).textContent = newStyles; 