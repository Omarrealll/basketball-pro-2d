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
        
        // Game modes
        this.gameModes = {
            classic: { name: 'Classic', icon: '🏀', description: 'First to 5 points wins!' },
            timeAttack: { name: 'Time Attack', icon: '⏱️', description: 'Score as much as possible in 60 seconds!' },
            chaos: { name: 'Chaos', icon: '🌪️', description: 'Random events every 5 seconds!' },
            survival: { name: 'Survival', icon: '💪', description: 'Three misses and you\'re out!' },
            trickshot: { name: 'Trick Shot', icon: '🎯', description: 'Points multiply with each bounce!' },
            versus: { name: 'Versus', icon: '⚔️', description: 'Battle against another player!' }
        };
        
        // Initialize audio
        AudioManager.init();
        AudioManager.playMusic('menu');
        
        // Initialize controls
        this.initControls();
        this.initTouchControls();
        
        // Start game loop
        this.lastTime = 0;
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
        
        // Initialize UI elements
        this.initUI();
    }

    initUI() {
        // Make sure game UI is hidden initially
        document.getElementById('game-ui').style.display = 'none';
        
        // Make sure modals are hidden initially
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        
        // Create game mode cards
        const gameModeContainer = document.getElementById('game-modes');
        gameModeContainer.innerHTML = ''; // Clear any existing cards
        
        Object.entries(this.gameModes).forEach(([mode, data]) => {
            const card = document.createElement('div');
            card.className = 'game-mode-card';
            card.dataset.mode = mode;
            card.innerHTML = `
                <div class="game-mode-icon">${data.icon}</div>
                <h3>${data.name}</h3>
                <p>${data.description}</p>
            `;
            gameModeContainer.appendChild(card);
        });
        
        // Select first game mode by default
        const firstCard = document.querySelector('.game-mode-card');
        if (firstCard) {
            firstCard.classList.add('selected');
        }
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
        this.keys = {
            player1: { up: false, left: false, right: false },
            player2: { up: false, left: false, right: false }
        };
        
        window.addEventListener('keydown', (e) => {
            this.handleKeyPress(e.key, true);
        });
        
        window.addEventListener('keyup', (e) => {
            this.handleKeyPress(e.key, false);
        });
    }

    initTouchControls() {
        // Touch controls for mobile
        const touchArea = this.canvas;
        
        // Variables to track touch positions
        let touchStartX = 0;
        let touchStartY = 0;
        
        touchArea.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            
            // Check if touch is in the bottom half (for shooting)
            if (touchStartY > this.canvas.height / 2) {
                this.startShooting();
            }
        });
        
        touchArea.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const touchX = touch.clientX;
            
            // Move player based on touch position relative to start
            if (touchX < touchStartX - 20) {
                this.keys.player1.left = true;
                this.keys.player1.right = false;
            } else if (touchX > touchStartX + 20) {
                this.keys.player1.left = false;
                this.keys.player1.right = true;
            } else {
                this.keys.player1.left = false;
                this.keys.player1.right = false;
            }
        });
        
        touchArea.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            // Reset movement keys
            this.keys.player1.left = false;
            this.keys.player1.right = false;
            
            // If was shooting, release the shot
            if (this.isShooting) {
                this.shootBall();
            }
        });
    }

    handleKeyPress(key, isDown) {
        // Player 1 controls (WASD)
        if (key === 'w' || key === 'W') this.keys.player1.up = isDown;
        if (key === 'a' || key === 'A') this.keys.player1.left = isDown;
        if (key === 'd' || key === 'D') this.keys.player1.right = isDown;
        
        // Player 2 controls (Arrow keys)
        if (key === 'ArrowUp') this.keys.player2.up = isDown;
        if (key === 'ArrowLeft') this.keys.player2.left = isDown;
        if (key === 'ArrowRight') this.keys.player2.right = isDown;
        
        // Space bar for shooting
        if (key === ' ' && isDown) {
            this.startShooting();
        } else if (key === ' ' && !isDown && this.isShooting) {
            this.shootBall();
        }
    }

    startShooting() {
        if (this.gameState !== 'playing' || !this.ball || this.ball.isInAir) return;
        
        this.isShooting = true;
        this.shootPower = 0;
        this.maxShootPower = 20;
        this.shootPowerIncrement = 0.5;
        
        // Show power meter
        const powerMeter = document.querySelector('.power-meter');
        if (!powerMeter) {
            const meter = document.createElement('div');
            meter.className = 'power-meter';
            meter.innerHTML = '<div class="power-fill"></div>';
            document.getElementById('game-container').appendChild(meter);
        }
    }

    shootBall() {
        if (!this.isShooting || !this.ball || this.ball.isInAir) return;
        
        // Calculate shooting angle and power
        const power = this.shootPower;
        const angle = -Math.PI / 4; // 45 degrees upward
        
        // Apply force to the ball
        this.ball.vx = Math.cos(angle) * power;
        this.ball.vy = Math.sin(angle) * power;
        this.ball.isInAir = true;
        
        // Play sound
        AudioManager.playSound('bounce');
        
        // Reset shooting state
        this.isShooting = false;
        
        // Hide power meter
        const powerMeter = document.querySelector('.power-meter');
        if (powerMeter) {
            powerMeter.remove();
        }
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
        
        // Start game music
        AudioManager.playMusic('game');
        
        // Hide menu
        document.getElementById('menu').style.display = 'none';
        
        // Show game UI
        document.getElementById('game-ui').style.display = 'flex';
        
        // Reset UI elements
        document.getElementById('score-p1').textContent = '0';
        document.getElementById('score-p2').textContent = '0';
        document.getElementById('streak').textContent = '0';
        document.getElementById('combo-counter').style.display = 'none';
        
        // Set up timer if needed
        if (mode === 'timeAttack') {
            this.timeRemaining = 60;
            document.getElementById('timer-container').style.display = 'block';
            document.getElementById('timer').textContent = this.timeRemaining;
            this.timerInterval = setInterval(() => {
                this.timeRemaining--;
                document.getElementById('timer').textContent = this.timeRemaining;
                
                if (this.timeRemaining <= 0) {
                    clearInterval(this.timerInterval);
                    this.endGame();
                }
            }, 1000);
        } else {
            document.getElementById('timer-container').style.display = 'none';
        }
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

    animate(currentTime) {
        // Calculate delta time
        if (!this.lastTime) this.lastTime = currentTime;
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update game state
        if (this.gameState === 'playing') {
            this.update(deltaTime);
        }
        
        // Draw game
        this.draw();
        
        // Update shooting power if charging
        if (this.isShooting && this.shootPower < this.maxShootPower) {
            this.shootPower += this.shootPowerIncrement;
            
            // Update power meter
            const powerFill = document.querySelector('.power-fill');
            if (powerFill) {
                powerFill.style.width = `${(this.shootPower / this.maxShootPower) * 100}%`;
            }
            
            // If reached max power, shoot automatically
            if (this.shootPower >= this.maxShootPower) {
                this.shootBall();
            }
        }
        
        // Request next frame
        requestAnimationFrame(this.animate);
    }

    update(deltaTime) {
        // Update players
        this.players.forEach(player => {
            // Apply gravity
            player.velocityY += this.gravity;
            
            // Apply wind force
            player.velocityX += this.windForce;
            
            // Apply movement based on controls
            const controls = this.keys[`player${player.id}`];
            
            if (controls.left) {
                player.velocityX = -player.speed;
            } else if (controls.right) {
                player.velocityX = player.speed;
            } else {
                player.velocityX *= 0.8; // Friction
            }
            
            // Jump
            if (controls.up && !player.isJumping) {
                player.velocityY = -player.jumpForce;
                player.isJumping = true;
                AudioManager.playSound('bounce');
            }
            
            // Update position
            player.x += player.velocityX;
            player.y += player.velocityY;
            
            // Boundary checks
            if (player.x < 0) player.x = 0;
            if (player.x + player.width > this.canvas.width) player.x = this.canvas.width - player.width;
            
            // Floor collision
            if (player.y + player.height > this.canvas.height) {
                player.y = this.canvas.height - player.height;
                player.velocityY = 0;
                player.isJumping = false;
            }
        });
        
        // Update ball
        if (this.ball) {
            // Apply gravity
            this.ball.velocityY += this.gravity;
            
            // Apply wind
            this.ball.velocityX += this.windForce;
            
            // Update position
            this.ball.x += this.ball.velocityX;
            this.ball.y += this.ball.velocityY;
            
            // Boundary checks
            if (this.ball.x - this.ball.radius < 0) {
                this.ball.x = this.ball.radius;
                this.ball.velocityX *= -0.8; // Bounce with energy loss
                this.ball.bounces++;
                AudioManager.playSound('bounce');
            }
            
            if (this.ball.x + this.ball.radius > this.canvas.width) {
                this.ball.x = this.canvas.width - this.ball.radius;
                this.ball.velocityX *= -0.8;
                this.ball.bounces++;
                AudioManager.playSound('bounce');
            }
            
            // Floor collision
            if (this.ball.y + this.ball.radius > this.canvas.height) {
                this.ball.y = this.canvas.height - this.ball.radius;
                this.ball.velocityY *= -0.8;
                this.ball.bounces++;
                AudioManager.playSound('bounce');
                
                // If ball is moving very slowly after bounce, reset it
                if (Math.abs(this.ball.velocityY) < 2) {
                    this.resetBall();
                }
            }
            
            // Check for basket collision
            this.checkBasketCollision();
            
            // Check for player collision
            this.players.forEach(player => {
                this.checkPlayerBallCollision(player);
            });
        }
        
        // Spawn powerups randomly
        if (Math.random() < 0.005) { // 0.5% chance per frame
            this.spawnPowerup();
        }
        
        // Check for powerup collection
        this.checkPowerupCollection();
        
        // Update game mode specific logic
        this.updateGameMode(deltaTime);
    }

    checkBasketCollision() {
        // Simple basket implementation - can be enhanced
        const basketX = this.canvas.width * 0.75;
        const basketY = this.canvas.height * 0.4;
        const basketWidth = 100 * this.scale;
        const basketHeight = 10 * this.scale;
        
        // Check if ball is above the basket and falling down
        if (this.ball.velocityY > 0 && 
            this.ball.y + this.ball.radius > basketY && 
            this.ball.y - this.ball.radius < basketY + basketHeight &&
            this.ball.x > basketX && 
            this.ball.x < basketX + basketWidth) {
            
            // Score!
            this.score[this.ball.lastTouchedBy ? this.ball.lastTouchedBy - 1 : 0]++;
            
            // Update score display
            document.getElementById(`score-p${this.ball.lastTouchedBy || 1}`).textContent = 
                this.score[this.ball.lastTouchedBy ? this.ball.lastTouchedBy - 1 : 0];
            
            // Increment combo
            this.combo++;
            if (this.combo > this.maxCombo) {
                this.maxCombo = this.combo;
            }
            
            // Update streak display
            document.getElementById('streak').textContent = this.combo;
            
            // Show combo counter if combo > 1
            if (this.combo > 1) {
                const comboCounter = document.getElementById('combo-counter');
                comboCounter.textContent = `x${this.combo} COMBO!`;
                comboCounter.style.display = 'block';
                
                // Hide after 2 seconds
                setTimeout(() => {
                    comboCounter.style.display = 'none';
                }, 2000);
            }
            
            // Play sound
            AudioManager.playSound('score');
            
            // Reset ball
            this.resetBall();
            
            // Check for game end in classic mode
            if (this.currentMode === 'classic' && 
                (this.score[0] >= this.roundsToWin || this.score[1] >= this.roundsToWin)) {
                this.endGame();
            }
        }
    }

    checkPlayerBallCollision(player) {
        // Simple rectangular collision
        if (this.ball.x + this.ball.radius > player.x && 
            this.ball.x - this.ball.radius < player.x + player.width &&
            this.ball.y + this.ball.radius > player.y && 
            this.ball.y - this.ball.radius < player.y + player.height) {
            
            // Calculate bounce direction
            const centerX = player.x + player.width / 2;
            const centerY = player.y + player.height / 2;
            const dx = this.ball.x - centerX;
            const dy = this.ball.y - centerY;
            const angle = Math.atan2(dy, dx);
            
            // Apply bounce force
            const speed = Math.sqrt(this.ball.velocityX * this.ball.velocityX + this.ball.velocityY * this.ball.velocityY);
            this.ball.velocityX = Math.cos(angle) * speed * 1.2; // Slightly increase speed
            this.ball.velocityY = Math.sin(angle) * speed * 1.2;
            
            // Record which player last touched the ball
            this.ball.lastTouchedBy = player.id;
            
            // Play sound
            AudioManager.playSound('bounce');
        }
    }

    resetBall() {
        this.ball.x = this.canvas.width / 2;
        this.ball.y = this.canvas.height / 2;
        this.ball.velocityX = 0;
        this.ball.velocityY = 0;
        this.ball.bounces = 0;
        this.ball.isInAir = false;
    }

    endGame() {
        this.gameState = 'gameOver';
        
        // Stop timer if it exists
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        // Update game over screen
        document.getElementById('final-score').textContent = Math.max(...this.score);
        document.getElementById('best-streak').textContent = this.maxCombo;
        document.getElementById('total-bounces').textContent = this.ball ? this.ball.bounces : 0;
        document.getElementById('powerups-collected').textContent = this.powerupsCollected || 0;
        
        // Show game over screen
        document.getElementById('game-over').style.display = 'block';
        
        // Play game over sound
        AudioManager.playMusic('menu');
        AudioManager.playSound('gameOver');
    }

    updateGameMode(deltaTime) {
        switch (this.currentMode) {
            case 'chaos':
                // Random events every 5 seconds
                if (!this.lastEventTime || Date.now() - this.lastEventTime > 5000) {
                    this.triggerRandomEvent();
                    this.lastEventTime = Date.now();
                }
                break;
                
            case 'survival':
                // Game ends after 3 misses
                // This would need to track misses
                break;
                
            case 'trickshot':
                // Points multiply with each bounce
                break;
        }
    }

    triggerRandomEvent() {
        const events = [
            () => { this.gravity *= -1; setTimeout(() => { this.gravity *= -1; }, 3000); }, // Reverse gravity
            () => { this.windForce = (Math.random() - 0.5) * 2; setTimeout(() => { this.windForce = 0; }, 4000); }, // Random wind
            () => { this.ball.radius *= 2; setTimeout(() => { this.ball.radius /= 2; }, 5000); }, // Giant ball
            () => { this.spawnPowerup(); this.spawnPowerup(); } // Multiple powerups
        ];
        
        // Choose a random event
        const event = events[Math.floor(Math.random() * events.length)];
        event();
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

    drawGame() {
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

    updateBall() {
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

    handleCollisions() {
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

    updateBasket() {
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
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new BasketChaosPro();
    
    // Play Button
    document.getElementById('playButton').addEventListener('click', () => {
        AudioManager.playSound('menuClick');
        const selectedMode = document.querySelector('.game-mode-card.selected')?.dataset.mode || 'classic';
        game.startGame(selectedMode);
        document.getElementById('menu').style.display = 'none';
    });

    // Instructions Button
    document.getElementById('instructionsButton').addEventListener('click', () => {
        AudioManager.playSound('menuClick');
        document.getElementById('instructions').style.display = 'block';
    });

    // Close Instructions Button
    document.getElementById('closeInstructions').addEventListener('click', () => {
        AudioManager.playSound('menuClick');
        document.getElementById('instructions').style.display = 'none';
    });

    // Leaderboard Button
    document.getElementById('leaderboardButton').addEventListener('click', () => {
        AudioManager.playSound('menuClick');
        document.getElementById('leaderboard').style.display = 'block';
        updateLeaderboard('classic'); // Load classic mode leaderboard by default
    });

    // Close Leaderboard Button
    document.getElementById('closeLeaderboard').addEventListener('click', () => {
        AudioManager.playSound('menuClick');
        document.getElementById('leaderboard').style.display = 'none';
    });

    // Game Mode Selection
    const gameModeCards = document.getElementById('game-modes');
    Object.entries(game.gameModes).forEach(([mode, data]) => {
        const card = document.createElement('div');
        card.className = 'game-mode-card';
        card.dataset.mode = mode;
        card.innerHTML = `
            <div class="game-mode-icon">${data.icon}</div>
            <h3>${data.name}</h3>
            <p>${data.description}</p>
        `;
        card.addEventListener('click', () => {
            AudioManager.playSound('menuClick');
            document.querySelectorAll('.game-mode-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });
        gameModeCards.appendChild(card);
    });

    // Play Again Button
    document.getElementById('play-again').addEventListener('click', () => {
        AudioManager.playSound('menuClick');
        document.getElementById('game-over').style.display = 'none';
        game.startGame(game.currentMode);
    });

    // Change Mode Button
    document.getElementById('change-mode').addEventListener('click', () => {
        AudioManager.playSound('menuClick');
        document.getElementById('game-over').style.display = 'none';
        document.getElementById('menu').style.display = 'block';
    });

    // Leaderboard Tab Buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            AudioManager.playSound('menuClick');
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            updateLeaderboard(button.dataset.mode);
        });
    });

    // Initialize first game mode as selected
    document.querySelector('.game-mode-card').classList.add('selected');
});

function updateLeaderboard(mode) {
    fetch(`/api/leaderboard/${mode}`)
        .then(response => response.json())
        .then(data => {
            const content = document.getElementById('leaderboard-content');
            content.innerHTML = data.length ? data.map((entry, index) => `
                <div class="leaderboard-entry">
                    <span class="rank">#${index + 1}</span>
                    <span class="name">${entry.name}</span>
                    <span class="score">${entry.score}</span>
                </div>
            `).join('') : '<p>No scores yet!</p>';
        })
        .catch(error => {
            console.error('Error fetching leaderboard:', error);
            document.getElementById('leaderboard-content').innerHTML = '<p>Error loading leaderboard</p>';
        });
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

// Initialize chat system
function initChat() {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    
    // Show chat container when game starts
    document.getElementById('chat-container').style.display = 'block';
    
    // Handle chat form submission
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        
        if (message) {
            // Send message to server
            ws.send(JSON.stringify({
                type: 'chat_message',
                message: message
            }));
            
            // Clear input
            chatInput.value = '';
        }
    });
    
    // Handle incoming chat messages
    ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat_message') {
            // Add message to chat
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message';
            messageElement.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
            chatMessages.appendChild(messageElement);
            
            // Auto-scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });
}

// Update the BasketChaosPro class animate method
BasketChaosPro.prototype.animate = function(currentTime) {
    // Calculate delta time
    if (!this.lastTime) this.lastTime = currentTime;
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Update game state
    if (this.gameState === 'playing') {
        this.update(deltaTime);
    }
    
    // Draw game
    this.draw();
    
    // Update shooting power if charging
    if (this.isShooting && this.shootPower < this.maxShootPower) {
        this.shootPower += this.shootPowerIncrement;
        
        // Update power meter
        const powerFill = document.querySelector('.power-fill');
        if (powerFill) {
            powerFill.style.width = `${(this.shootPower / this.maxShootPower) * 100}%`;
        }
        
        // If reached max power, shoot automatically
        if (this.shootPower >= this.maxShootPower) {
            this.shootBall();
        }
    }
    
    // Request next frame
    requestAnimationFrame(this.animate);
};

// Update the BasketChaosPro class update method
BasketChaosPro.prototype.update = function(deltaTime) {
    // Update players
    this.players.forEach(player => {
        // Apply gravity
        player.velocityY += this.gravity;
        
        // Apply wind force
        player.velocityX += this.windForce;
        
        // Apply movement based on controls
        const controls = this.keys[`player${player.id}`];
        
        if (controls.left) {
            player.velocityX = -player.speed;
        } else if (controls.right) {
            player.velocityX = player.speed;
        } else {
            player.velocityX *= 0.8; // Friction
        }
        
        // Jump
        if (controls.up && !player.isJumping) {
            player.velocityY = -player.jumpForce;
            player.isJumping = true;
            AudioManager.playSound('bounce');
        }
        
        // Update position
        player.x += player.velocityX;
        player.y += player.velocityY;
        
        // Boundary checks
        if (player.x < 0) player.x = 0;
        if (player.x + player.width > this.canvas.width) player.x = this.canvas.width - player.width;
        
        // Floor collision
        if (player.y + player.height > this.canvas.height) {
            player.y = this.canvas.height - player.height;
            player.velocityY = 0;
            player.isJumping = false;
        }
    });
    
    // Update ball
    if (this.ball) {
        // Apply gravity
        this.ball.velocityY += this.gravity;
        
        // Apply wind
        this.ball.velocityX += this.windForce;
        
        // Update position
        this.ball.x += this.ball.velocityX;
        this.ball.y += this.ball.velocityY;
        
        // Boundary checks
        if (this.ball.x - this.ball.radius < 0) {
            this.ball.x = this.ball.radius;
            this.ball.velocityX *= -0.8; // Bounce with energy loss
            this.ball.bounces++;
            AudioManager.playSound('bounce');
        }
        
        if (this.ball.x + this.ball.radius > this.canvas.width) {
            this.ball.x = this.canvas.width - this.ball.radius;
            this.ball.velocityX *= -0.8;
            this.ball.bounces++;
            AudioManager.playSound('bounce');
        }
        
        // Floor collision
        if (this.ball.y + this.ball.radius > this.canvas.height) {
            this.ball.y = this.canvas.height - this.ball.radius;
            this.ball.velocityY *= -0.8;
            this.ball.bounces++;
            AudioManager.playSound('bounce');
            
            // If ball is moving very slowly after bounce, reset it
            if (Math.abs(this.ball.velocityY) < 2) {
                this.resetBall();
            }
        }
        
        // Check for basket collision
        this.checkBasketCollision();
        
        // Check for player collision
        this.players.forEach(player => {
            this.checkPlayerBallCollision(player);
        });
    }
    
    // Spawn powerups randomly
    if (Math.random() < 0.005) { // 0.5% chance per frame
        this.spawnPowerup();
    }
    
    // Check for powerup collection
    this.checkPowerupCollection();
    
    // Update game mode specific logic
    this.updateGameMode(deltaTime);
};

// Add a method to check for basket collision
BasketChaosPro.prototype.checkBasketCollision = function() {
    // Simple basket implementation - can be enhanced
    const basketX = this.canvas.width * 0.75;
    const basketY = this.canvas.height * 0.4;
    const basketWidth = 100 * this.scale;
    const basketHeight = 10 * this.scale;
    
    // Check if ball is above the basket and falling down
    if (this.ball.velocityY > 0 && 
        this.ball.y + this.ball.radius > basketY && 
        this.ball.y - this.ball.radius < basketY + basketHeight &&
        this.ball.x > basketX && 
        this.ball.x < basketX + basketWidth) {
        
        // Score!
        this.score[this.ball.lastTouchedBy ? this.ball.lastTouchedBy - 1 : 0]++;
        
        // Update score display
        document.getElementById(`score-p${this.ball.lastTouchedBy || 1}`).textContent = 
            this.score[this.ball.lastTouchedBy ? this.ball.lastTouchedBy - 1 : 0];
        
        // Increment combo
        this.combo++;
        if (this.combo > this.maxCombo) {
            this.maxCombo = this.combo;
        }
        
        // Update streak display
        document.getElementById('streak').textContent = this.combo;
        
        // Show combo counter if combo > 1
        if (this.combo > 1) {
            const comboCounter = document.getElementById('combo-counter');
            comboCounter.textContent = `x${this.combo} COMBO!`;
            comboCounter.style.display = 'block';
            
            // Hide after 2 seconds
            setTimeout(() => {
                comboCounter.style.display = 'none';
            }, 2000);
        }
        
        // Play sound
        AudioManager.playSound('score');
        
        // Reset ball
        this.resetBall();
        
        // Check for game end in classic mode
        if (this.currentMode === 'classic' && 
            (this.score[0] >= this.roundsToWin || this.score[1] >= this.roundsToWin)) {
            this.endGame();
        }
    }
};

// Add a method to check for player-ball collision
BasketChaosPro.prototype.checkPlayerBallCollision = function(player) {
    // Simple rectangular collision
    if (this.ball.x + this.ball.radius > player.x && 
        this.ball.x - this.ball.radius < player.x + player.width &&
        this.ball.y + this.ball.radius > player.y && 
        this.ball.y - this.ball.radius < player.y + player.height) {
        
        // Calculate bounce direction
        const centerX = player.x + player.width / 2;
        const centerY = player.y + player.height / 2;
        const dx = this.ball.x - centerX;
        const dy = this.ball.y - centerY;
        const angle = Math.atan2(dy, dx);
        
        // Apply bounce force
        const speed = Math.sqrt(this.ball.velocityX * this.ball.velocityX + this.ball.velocityY * this.ball.velocityY);
        this.ball.velocityX = Math.cos(angle) * speed * 1.2; // Slightly increase speed
        this.ball.velocityY = Math.sin(angle) * speed * 1.2;
        
        // Record which player last touched the ball
        this.ball.lastTouchedBy = player.id;
        
        // Play sound
        AudioManager.playSound('bounce');
    }
};

// Add a method to reset the ball
BasketChaosPro.prototype.resetBall = function() {
    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    this.ball.velocityX = 0;
    this.ball.velocityY = 0;
    this.ball.bounces = 0;
    this.ball.isInAir = false;
};

// Add a method to end the game
BasketChaosPro.prototype.endGame = function() {
    this.gameState = 'gameOver';
    
    // Stop timer if it exists
    if (this.timerInterval) {
        clearInterval(this.timerInterval);
    }
    
    // Update game over screen
    document.getElementById('final-score').textContent = Math.max(...this.score);
    document.getElementById('best-streak').textContent = this.maxCombo;
    document.getElementById('total-bounces').textContent = this.ball ? this.ball.bounces : 0;
    document.getElementById('powerups-collected').textContent = this.powerupsCollected || 0;
    
    // Show game over screen
    document.getElementById('game-over').style.display = 'block';
    
    // Play game over sound
    AudioManager.playMusic('menu');
    AudioManager.playSound('gameOver');
};

// Add a method to update game mode specific logic
BasketChaosPro.prototype.updateGameMode = function(deltaTime) {
    switch (this.currentMode) {
        case 'chaos':
            // Random events every 5 seconds
            if (!this.lastEventTime || Date.now() - this.lastEventTime > 5000) {
                this.triggerRandomEvent();
                this.lastEventTime = Date.now();
            }
            break;
            
        case 'survival':
            // Game ends after 3 misses
            // This would need to track misses
            break;
            
        case 'trickshot':
            // Points multiply with each bounce
            break;
    }
};

// Add a method to trigger random events for chaos mode
BasketChaosPro.prototype.triggerRandomEvent = function() {
    const events = [
        () => { this.gravity *= -1; setTimeout(() => { this.gravity *= -1; }, 3000); }, // Reverse gravity
        () => { this.windForce = (Math.random() - 0.5) * 2; setTimeout(() => { this.windForce = 0; }, 4000); }, // Random wind
        () => { this.ball.radius *= 2; setTimeout(() => { this.ball.radius /= 2; }, 5000); }, // Giant ball
        () => { this.spawnPowerup(); this.spawnPowerup(); } // Multiple powerups
    ];
    
    // Choose a random event
    const event = events[Math.floor(Math.random() * events.length)];
    event();
};

// ... existing code ... 