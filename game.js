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
class Game {
    constructor() {
        this.initializeUI();
        this.setupCanvas();
        this.initializeGame();
        this.setupEventListeners();
        this.setupAudio();
        this.setupGameModes();
        this.setupParticleSystem();
    }

    initializeUI() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.menu = document.getElementById('menu');
        this.gameModeCards = document.querySelectorAll('.game-mode-card');
        this.powerupContainer = document.getElementById('powerup-container');
        this.comboCounter = document.getElementById('combo-counter');
        this.achievementsPopup = document.getElementById('achievements-popup');
        this.streakDisplay = document.getElementById('streak');
        
        // Set canvas size
        this.canvas.width = 800;
        this.canvas.height = 600;
        this.scale = 1;
    }

    initializeGame() {
        // Enhanced ball physics
        this.ball = {
            x: 100,
            y: 500,
            radius: 15,
            velocityX: 0,
            velocityY: 0,
            angularVelocity: 0,
            rotation: 0,
            isShot: false,
            trail: [],
            spin: 0,
            magnus: 0.3, // Magnus effect coefficient
            dragCoefficient: 0.001
        };

        // Enhanced basket with complex movement
        this.basket = {
            x: 700,
            y: 300,
            width: 60,
            height: 50,
            rimWidth: 10,
            backboardHeight: 120,
            backboardWidth: 10,
            rimElasticity: 0.6,
            netPoints: [],
            movePattern: 'figure8',
            patternPhase: 0,
            oscillationSpeed: 0.02,
            verticalRange: 100,
            horizontalRange: 50,
            rotation: 0,
            rotationSpeed: 0.1
        };

        // Initialize net physics
        for (let i = 0; i < 12; i++) {
            this.basket.netPoints.push({
                x: 0,
                y: 0,
                baseX: i * (this.basket.width / 11),
                baseY: this.basket.height,
                velocityX: 0,
                velocityY: 0
            });
        }

        // Advanced game state
        this.score = 0;
        this.streak = 0;
        this.bounceCount = 0;
        this.shotPower = 0;
        this.shotAngle = 0;
        this.isPoweringUp = false;
        this.comboMultiplier = 1;
        this.lastShotTime = 0;
        this.perfectShotStreak = 0;
        this.timeSlowFactor = 1;
        this.activeEffects = new Set();
        
        // Physics constants
        this.gravity = 0.5;
        this.airDensity = 0.0012;
        this.windSpeed = 0;
        this.windDirection = 0;
        this.temperature = 20; // Celsius
    }

    setupGameModes() {
        this.gameModes = {
            classic: {
                name: 'Classic',
                init: () => {
                    this.timeLeft = 60;
                    this.score = 0;
                    this.streak = 0;
                },
                update: () => {
                    this.timeLeft -= 1/60;
                    if (this.timeLeft <= 0) this.endGame();
                },
                onScore: () => {
                    this.score += 2 * (this.streak > 2 ? this.streak : 1);
                }
            },
            time_attack: {
                name: 'Time Attack',
                init: () => {
                    this.timeLeft = 30;
                    this.score = 0;
                    this.streak = 0;
                },
                update: () => {
                    this.timeLeft -= 1/60;
                    if (this.timeLeft <= 0) this.endGame();
                },
                onScore: () => {
                    this.score += 2;
                    this.timeLeft += 5; // Add 5 seconds for each basket
                    this.showTimeBonus('+5s');
                }
            },
            trick_shot: {
                name: 'Trick Shot',
                init: () => {
                    this.timeLeft = 60;
                    this.score = 0;
                    this.bounceCount = 0;
                    this.streak = 0;
                },
                update: () => {
                    this.timeLeft -= 1/60;
                    if (this.timeLeft <= 0) this.endGame();
                },
                onScore: () => {
                    const bounceMultiplier = Math.max(1, this.bounceCount);
                    const points = 2 * bounceMultiplier * (this.streak > 2 ? this.streak : 1);
                    this.score += points;
                    this.showPointsBonus(`+${points}`);
                }
            },
            survival: {
                name: 'Survival',
                init: () => {
                    this.lives = 3;
                    this.score = 0;
                    this.streak = 0;
                },
                update: () => {
                    if (this.lives <= 0) this.endGame();
                },
                onScore: () => {
                    this.score += 2 * (this.streak > 2 ? this.streak : 1);
                },
                onMiss: () => {
                    this.lives--;
                    this.showLivesLost();
                }
            }
        };

        this.currentMode = 'classic';
    }

    setupAudio() {
        this.sounds = {
            bounce: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-game-ball-tap-2073.wav'),
            score: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.wav'),
            powerup: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-game-powerup-2019.wav'),
            combo: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.wav'),
            gameOver: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-game-over-trombone-1940.wav')
        };

        Object.values(this.sounds).forEach(sound => {
            sound.load();
            sound.volume = 0.3;
        });
    }

    setupEventListeners() {
        // Game mode selection
        this.gameModeCards.forEach(card => {
            card.addEventListener('click', () => {
                this.gameModeCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.currentMode = card.dataset.mode;
            });
        });

        // Mouse/Touch controls
        if ('ontouchstart' in window) {
            this.setupTouchControls();
        } else {
            this.setupMouseControls();
        }

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.gameOver) {
                this.restartGame();
            }
        });
    }

    setupTouchControls() {
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!this.ball.isShot) {
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                this.startPowerUp(touch.clientX - rect.left, touch.clientY - rect.top);
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.isPoweringUp) {
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                this.updateAim(touch.clientX - rect.left, touch.clientY - rect.top);
            }
        });

        this.canvas.addEventListener('touchend', () => {
            if (this.isPoweringUp) {
                this.shootBall();
            }
        });
    }

    setupMouseControls() {
        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.ball.isShot) {
                const rect = this.canvas.getBoundingClientRect();
                this.startPowerUp(e.clientX - rect.left, e.clientY - rect.top);
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.updateAim(e.clientX - rect.left, e.clientY - rect.top);
        });

        this.canvas.addEventListener('mouseup', () => {
            if (this.isPoweringUp) {
                this.shootBall();
            }
        });
    }

    startGame() {
        const mode = this.gameModes[this.currentMode];
        mode.init();
        this.gameOver = false;
        this.isPoweringUp = false;
        this.power = 0;
        this.resetBall();
        this.activePowerups.clear();
        
        // Hide menu and show game UI
        this.menu.style.display = 'none';
        document.getElementById('game-ui').style.display = 'flex';
        
        // Start game loop
        this.gameLoop();
    }

    updateGame() {
        const mode = this.gameModes[this.currentMode];
        mode.update();

        if (this.ball.isShot) {
            this.updateBall();
            this.updatePowerups();
        }

        this.updateUI();
    }

    updateBall() {
        if (!this.ball.isShot) return;

        // Store trail with interpolation
        const trailSpacing = 5;
        const lastTrail = this.ball.trail[this.ball.trail.length - 1];
        if (!lastTrail || 
            Math.hypot(this.ball.x - lastTrail.x, this.ball.y - lastTrail.y) > trailSpacing) {
            this.ball.trail.push({
                x: this.ball.x,
                y: this.ball.y,
                rotation: this.ball.rotation
            });
            if (this.ball.trail.length > 15) this.ball.trail.shift();
        }

        // Create motion particles
        if (Math.hypot(this.ball.velocityX, this.ball.velocityY) > 5) {
            this.createParticles('TRAIL', this.ball.x, this.ball.y, 1);
        }

        // Apply Magnus force (spin effect)
        const magnusForceY = this.ball.spin * this.ball.velocityX * this.ball.magnus;
        const magnusForceX = -this.ball.spin * this.ball.velocityY * this.ball.magnus;

        // Apply wind effect
        const windEffect = this.calculateWindEffect();

        // Apply drag force
        const speed = Math.hypot(this.ball.velocityX, this.ball.velocityY);
        const dragMagnitude = this.ball.dragCoefficient * speed * speed;
        const dragForceX = -this.ball.velocityX * dragMagnitude / speed;
        const dragForceY = -this.ball.velocityY * dragMagnitude / speed;

        // Update velocities with all forces
        this.ball.velocityX += (magnusForceX + dragForceX + windEffect.x) * this.timeSlowFactor;
        this.ball.velocityY += (this.gravity + magnusForceY + dragForceY + windEffect.y) * this.timeSlowFactor;

        // Update position
        this.ball.x += this.ball.velocityX * this.timeSlowFactor;
        this.ball.y += this.ball.velocityY * this.timeSlowFactor;

        // Update rotation
        this.ball.rotation += this.ball.angularVelocity * this.timeSlowFactor;
        
        // Check collisions
        this.checkCollisions();
    }

    calculateWindEffect() {
        const time = Date.now() * 0.001;
        this.windSpeed = Math.sin(time * 0.1) * 0.1; // Varying wind speed
        this.windDirection = Math.sin(time * 0.05) * Math.PI; // Varying wind direction
        
        return {
            x: Math.cos(this.windDirection) * this.windSpeed,
            y: Math.sin(this.windDirection) * this.windSpeed
        };
    }

    checkCollisions() {
        // Wall collisions with realistic bounce
        if (this.ball.x - this.ball.radius < 0 || 
            this.ball.x + this.ball.radius > this.canvas.width) {
            this.ball.x = this.ball.x - this.ball.radius < 0 ? 
                         this.ball.radius : this.canvas.width - this.ball.radius;
            this.ball.velocityX *= -this.bounce;
            this.ball.spin *= -0.8; // Reverse spin on wall hit
            this.bounceCount++;
            this.createParticles('BOUNCE', this.ball.x, this.ball.y, 10);
            this.playSound('bounce');
        }

        // Ceiling collision
        if (this.ball.y - this.ball.radius < 0) {
            this.ball.y = this.ball.radius;
            this.ball.velocityY *= -this.bounce;
            this.bounceCount++;
            this.createParticles('BOUNCE', this.ball.x, this.ball.y, 10);
            this.playSound('bounce');
        }

        // Floor collision with friction
        if (this.ball.y + this.ball.radius > this.canvas.height) {
            this.ball.y = this.canvas.height - this.ball.radius;
            this.ball.velocityY *= -this.bounce;
            this.ball.velocityX *= 0.8; // Friction
            this.ball.spin *= 0.8; // Reduce spin
            this.bounceCount++;
            this.createParticles('BOUNCE', this.ball.x, this.ball.y, 10);
            this.playSound('bounce');
        }

        // Basket collision
        if (this.checkBasketCollision()) {
            this.handleScore();
        }
    }

    handleScore() {
        // Calculate score multiplier based on various factors
        let multiplier = 1;
        
        // Distance bonus
        const distance = Math.hypot(this.ball.x - 100, this.ball.y - 500);
        if (distance > 400) multiplier *= 1.5;
        if (distance > 600) multiplier *= 1.2;
        
        // Speed bonus (swish)
        const speed = Math.hypot(this.ball.velocityX, this.ball.velocityY);
        if (speed < 10) multiplier *= 1.2;
        
        // Bounce bonus
        multiplier *= (1 + this.bounceCount * 0.3);
        
        // Streak bonus
        if (this.streak > 2) multiplier *= (1 + (this.streak - 2) * 0.1);
        
        // Perfect timing bonus
        if (this.perfectShotStreak > 0) multiplier *= (1 + this.perfectShotStreak * 0.2);
        
        // Calculate final score
        const basePoints = 2;
        const points = Math.floor(basePoints * multiplier);
        
        // Update score and streak
        this.score += points;
        this.streak++;
        
        // Create score particles
        this.createParticles('SCORE', this.basket.x, this.basket.y, 20);
        
        // Show score popup
        this.showScorePopup(points, multiplier > 1.5);
        
        // Play appropriate sound
        this.playSound(speed < 10 ? 'swish' : 'score');
        
        // Reset ball
        this.resetBall();
        
        // Trigger special effects on impressive shots
        if (multiplier > 2) {
            this.triggerSlowMotion(0.5, 1);
        }
    }

    triggerSlowMotion(factor, duration) {
        this.timeSlowFactor = factor;
        setTimeout(() => {
            this.timeSlowFactor = 1;
        }, duration * 1000);
    }

    shootBall() {
        if (!this.ball.isShot) {
            const angle = Math.atan2(this.mouseY - this.ball.y, this.mouseX - this.ball.x);
            const power = Math.min(this.shotPower, 100);
            
            this.ball.velocityX = Math.cos(angle) * power * 0.2;
            this.ball.velocityY = Math.sin(angle) * power * 0.2;
            this.ball.spin = (this.mouseY - this.ball.y) * 0.01; // Add spin based on shot angle
            this.ball.isShot = true;
            
            // Reset shot parameters
            this.shotPower = 0;
            this.isPoweringUp = false;
            
            // Create shooting effect particles
            this.createParticles('TRAIL', this.ball.x, this.ball.y, 20);
        }
    }

    setupParticleSystem() {
        this.particles = [];
        this.particleTypes = {
            TRAIL: {
                lifetime: 0.5,
                size: 3,
                color: '#ff6b6b',
                gravity: 0.1,
                spread: 0.2
            },
            SCORE: {
                lifetime: 1,
                size: 5,
                color: '#ffd700',
                gravity: -0.5,
                spread: 1
            },
            BOUNCE: {
                lifetime: 0.3,
                size: 4,
                color: '#ffffff',
                gravity: 0,
                spread: 0.5
            }
        };
    }

    createParticles(type, x, y, count) {
        const settings = this.particleTypes[type];
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * settings.spread,
                vy: (Math.random() - 0.5) * settings.spread,
                life: settings.lifetime,
                maxLife: settings.lifetime,
                size: settings.size,
                color: settings.color,
                gravity: settings.gravity
            });
        }
    }

    updateParticles() {
        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.life -= 1/60;
            return p.life > 0;
        });
    }

    drawParticles() {
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life / p.maxLife;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;
    }

    showCombo() {
        this.comboCounter.textContent = `x${this.streak} COMBO!`;
        this.comboCounter.classList.add('show');
        setTimeout(() => {
            this.comboCounter.classList.remove('show');
        }, 1000);
    }

    showTimeBonus(text) {
        const bonus = document.createElement('div');
        bonus.className = 'time-bonus';
        bonus.textContent = text;
        document.body.appendChild(bonus);
        
        setTimeout(() => {
            bonus.remove();
        }, 1000);
    }

    showPointsBonus(text) {
        const bonus = document.createElement('div');
        bonus.className = 'points-bonus';
        bonus.textContent = text;
        document.body.appendChild(bonus);
        
        setTimeout(() => {
            bonus.remove();
        }, 1000);
    }

    showLivesLost() {
        const hearts = '❤️'.repeat(this.lives) + '🖤'.repeat(3 - this.lives);
        const lives = document.createElement('div');
        lives.className = 'lives-indicator';
        lives.textContent = hearts;
        document.body.appendChild(lives);
        
        setTimeout(() => {
            lives.remove();
        }, 1000);
    }

    endGame() {
        this.gameOver = true;
        this.playSound('gameOver');
        
        // Update high scores
        const highScore = localStorage.getItem(`highScore_${this.currentMode}`) || 0;
        if (this.score > highScore) {
            localStorage.setItem(`highScore_${this.currentMode}`, this.score);
        }
        
        // Show game over screen
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('best-streak').textContent = this.streak;
        document.getElementById('game-over').style.display = 'block';
    }

    restartGame() {
        this.startGame();
    }

    updateBasket() {
        const time = Date.now() * 0.001;
        
        switch (this.basket.movePattern) {
            case 'figure8':
                this.basket.x = 700 + Math.cos(time * this.basket.oscillationSpeed) * this.basket.horizontalRange;
                this.basket.y = 300 + Math.sin(2 * time * this.basket.oscillationSpeed) * this.basket.verticalRange;
                break;
            case 'circular':
                this.basket.x = 700 + Math.cos(time * this.basket.oscillationSpeed) * this.basket.horizontalRange;
                this.basket.y = 300 + Math.sin(time * this.basket.oscillationSpeed) * this.basket.verticalRange;
                break;
            case 'pendulum':
                this.basket.x = 700 + Math.sin(time * this.basket.oscillationSpeed) * this.basket.horizontalRange;
                break;
        }

        // Update basket rotation
        this.basket.rotation = Math.sin(time * this.basket.rotationSpeed) * 0.2;

        // Update net physics
        this.updateNetPhysics();
    }

    updateNetPhysics() {
        const netStiffness = 0.3;
        const netDamping = 0.8;
        const gravity = 0.2;

        this.basket.netPoints.forEach((point, i) => {
            // Calculate base position in basket space
            const baseX = this.basket.x + point.baseX * Math.cos(this.basket.rotation) -
                         point.baseY * Math.sin(this.basket.rotation);
            const baseY = this.basket.y + point.baseX * Math.sin(this.basket.rotation) +
                         point.baseY * Math.cos(this.basket.rotation);

            // Apply spring forces
            const dx = baseX - point.x;
            const dy = baseY - point.y;
            point.velocityX += dx * netStiffness;
            point.velocityY += dy * netStiffness;

            // Apply gravity
            point.velocityY += gravity;

            // Apply damping
            point.velocityX *= netDamping;
            point.velocityY *= netDamping;

            // Update position
            point.x += point.velocityX;
            point.y += point.velocityY;
        });
    }

    drawBasket() {
        this.ctx.save();
        
        // Transform for basket rotation
        this.ctx.translate(this.basket.x, this.basket.y);
        this.ctx.rotate(this.basket.rotation);
        
        // Draw backboard with glass effect
        this.ctx.fillStyle = '#ffffff33';
        this.ctx.fillRect(
            -this.basket.width/2 - this.basket.backboardWidth,
            -this.basket.backboardHeight/2,
            this.basket.backboardWidth,
            this.basket.backboardHeight
        );
        
        // Draw rim
        this.ctx.fillStyle = '#e94560';
        this.ctx.fillRect(-this.basket.width/2, -this.basket.rimWidth/2,
                         this.basket.width, this.basket.rimWidth);
        
        // Draw net
        this.ctx.beginPath();
        this.ctx.moveTo(-this.basket.width/2, 0);
        this.basket.netPoints.forEach((point, i) => {
            if (i === 0) {
                this.ctx.moveTo(point.x - this.basket.x, point.y - this.basket.y);
            } else {
                this.ctx.lineTo(point.x - this.basket.x, point.y - this.basket.y);
            }
        });
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw rim highlight
        this.ctx.shadowColor = '#ff0000';
        this.ctx.shadowBlur = 10;
        this.ctx.strokeStyle = '#ff6b6b';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(-this.basket.width/2, -this.basket.rimWidth/2,
                          this.basket.width, this.basket.rimWidth);
        
        this.ctx.restore();
    }

    checkBasketCollision() {
        return (
            this.ball.x > this.basket.x &&
            this.ball.x < this.basket.x + this.basket.width &&
            this.ball.y > this.basket.y &&
            this.ball.y < this.basket.y + this.basket.height &&
            this.ball.velocityY > 0  // Ball must be moving downward
        );
    }

    showScorePopup(points, isSpecial) {
        const popup = document.createElement('div');
        popup.className = 'score-popup' + (isSpecial ? ' special' : '');
        popup.textContent = `+${points}`;
        
        // Position popup near basket
        popup.style.left = `${this.basket.x}px`;
        popup.style.top = `${this.basket.y}px`;
        
        document.body.appendChild(popup);
        
        // Animate and remove
        setTimeout(() => popup.remove(), 1000);
    }

    updatePowerups() {
        for (const [type, data] of this.activePowerups.entries()) {
            data.timeLeft -= 1/60;
            if (data.timeLeft <= 0) {
                this.activePowerups.delete(type);
            }
        }
        
        if (this.activePowerups.size > 0) {
            const powerupText = Array.from(this.activePowerups.entries())
                .map(([type, data]) => `${POWERUP_TYPES[type].symbol} ${Math.ceil(data.timeLeft)}s`)
                .join(' ');
            document.getElementById('powerupIndicator').textContent = powerupText;
        } else {
            document.getElementById('powerupIndicator').style.display = 'none';
        }
    }

    showEmote(playerId, emote) {
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

    // ... rest of the existing methods ...
}

// Initialize game when page loads
window.addEventListener('load', () => {
    const game = new Game();
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