import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Game Constants
const PLAYER_SIZE = 40;
const OBSTACLE_WIDTH = 70;
const OBSTACLE_MIN_HEIGHT = SCREEN_HEIGHT * 0.32; // Reduced from 0.35
const INITIAL_SPEED = 4.0; // Slowed down from 4.5
const SPEED_INCREMENT = 0.06; // Even slower scaling
const GRAVITY_ACCEL = 0.45; // Gentler gravity
const TERMINAL_VELOCITY = 9; // Lower max speed

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface Obstacle {
    id: number;
    x: number;
    height: number;
    isTop: boolean;
    passed?: boolean;
}

export default function GravityFlux() {
    const [gameState, setGameState] = useState<GameState>('START');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);

    // Animation / Physics values
    const playerY = useSharedValue(SCREEN_HEIGHT / 2);
    const playerRotation = useSharedValue(0);
    const playerVelocity = useRef(0);
    const isGravityInverted = useRef(false);
    const [obstacles, setObstacles] = useState<Obstacle[]>([]);

    const frameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const lastSpawnType = useRef<'TOP' | 'BOTTOM' | 'BOTH'>('TOP');

    const startGame = () => {
        setGameState('PLAYING');
        setScore(0);
        playerY.value = SCREEN_HEIGHT / 2;
        playerRotation.value = 0;
        playerVelocity.current = 0;
        isGravityInverted.current = false;
        setObstacles([]);
        lastTimeRef.current = performance.now();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const gameOver = () => {
        if (gameState !== 'PLAYING') return;
        setGameState('GAME_OVER');
        if (score > highScore) setHighScore(score);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };

    const flipGravity = () => {
        if (gameState !== 'PLAYING') return;

        isGravityInverted.current = !isGravityInverted.current;
        playerVelocity.current = isGravityInverted.current ? -3 : 3; // Give a little nudge

        playerRotation.value = withSpring(isGravityInverted.current ? 180 : 0);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    };

    // Game Loop
    const update = useCallback((time: number) => {
        if (gameState !== 'PLAYING') return;

        // Spawning Logic (Followed/Staggered Pattern)
        const spawnInterval = Math.max(1200 - (score * 15), 700); // More room between obstacles
        if (time - lastTimeRef.current > spawnInterval) {
            // Determine next type for "followed" feel
            let nextType: 'TOP' | 'BOTTOM' | 'BOTH';
            const rand = Math.random();

            if (rand < 0.6) {
                // Switch top/bottom for slalom feel
                nextType = lastSpawnType.current === 'TOP' ? 'BOTTOM' : 'TOP';
            } else if (rand < 0.85) {
                // Same as before
                nextType = lastSpawnType.current;
            } else {
                // Challenge gate
                nextType = 'BOTH';
            }

            const newObstacles: Obstacle[] = [];
            const obsHeight = OBSTACLE_MIN_HEIGHT + Math.random() * 60; // Random length variety

            if (nextType === 'TOP' || nextType === 'BOTH') {
                newObstacles.push({
                    id: Date.now(),
                    x: SCREEN_WIDTH,
                    height: obsHeight,
                    isTop: true,
                });
            }
            if (nextType === 'BOTTOM' || nextType === 'BOTH') {
                newObstacles.push({
                    id: Date.now() + 1,
                    x: SCREEN_WIDTH,
                    height: obsHeight,
                    isTop: false,
                });
            }

            setObstacles(prev => [...prev, ...newObstacles].filter(o => o.x > -100));
            lastSpawnType.current = nextType;
            lastTimeRef.current = time;
        }

        // Move obstacles and check collisions
        setObstacles(prev => {
            const currentSpeed = INITIAL_SPEED + (score * SPEED_INCREMENT);
            const updated = prev.map(o => ({ ...o, x: o.x - currentSpeed }));

            const pTop = playerY.value;
            const pBottom = playerY.value + PLAYER_SIZE;
            const pLeft = SCREEN_WIDTH * 0.2;
            const pRight = pLeft + PLAYER_SIZE;

            for (const o of updated) {
                // Collision Detection
                if (o.isTop) {
                    if (pRight > o.x && pLeft < o.x + OBSTACLE_WIDTH && pTop < o.height) {
                        gameOver();
                    }
                } else {
                    if (pRight > o.x && pLeft < o.x + OBSTACLE_WIDTH && pBottom > SCREEN_HEIGHT - o.height) {
                        gameOver();
                    }
                }

                // Scoring (per column, not per box)
                if (o.x + OBSTACLE_WIDTH < pLeft && !o.passed) {
                    o.passed = true;
                    // Only add score once per x-position if it's a 'BOTH' spawn
                    const hasScoreAlreadyInThisFrame = updated.some(other => other.x === o.x && other.id !== o.id && other.passed);
                    if (!hasScoreAlreadyInThisFrame) {
                        setScore(s => s + 1);
                        Haptics.selectionAsync();
                    }
                }
            }
            return updated;
        });

        // Physics
        const accel = isGravityInverted.current ? -GRAVITY_ACCEL : GRAVITY_ACCEL;
        playerVelocity.current += accel;

        if (playerVelocity.current > TERMINAL_VELOCITY) playerVelocity.current = TERMINAL_VELOCITY;
        if (playerVelocity.current < -TERMINAL_VELOCITY) playerVelocity.current = -TERMINAL_VELOCITY;

        playerY.value += playerVelocity.current;

        // Boundaries
        if (playerY.value < 0 || playerY.value > SCREEN_HEIGHT - PLAYER_SIZE) {
            gameOver();
        }

        frameRef.current = requestAnimationFrame(update);
    }, [gameState, playerY, score]);

    useEffect(() => {
        if (gameState === 'PLAYING') {
            frameRef.current = requestAnimationFrame(update);
        }
        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [gameState, update]);

    const playerAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: playerY.value },
            { rotateZ: `${playerRotation.value}deg` },
        ],
    }));

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <View style={styles.background} />

            {gameState === 'PLAYING' && (
                <>
                    <Text style={styles.scoreText}>{score}</Text>

                    {obstacles.map(o => (
                        <View
                            key={o.id}
                            style={[
                                styles.obstacle,
                                {
                                    left: o.x,
                                    top: o.isTop ? 0 : SCREEN_HEIGHT - o.height,
                                    height: o.height,
                                    borderBottomLeftRadius: o.isTop ? 20 : 0,
                                    borderBottomRightRadius: o.isTop ? 20 : 0,
                                    borderTopLeftRadius: o.isTop ? 0 : 20,
                                    borderTopRightRadius: o.isTop ? 0 : 20,
                                }
                            ]}
                        />
                    ))}

                    <Animated.View style={[styles.player, playerAnimatedStyle]}>
                        <View style={styles.eye} />
                    </Animated.View>

                    <TouchableOpacity
                        activeOpacity={1}
                        style={styles.touchArea}
                        onPress={flipGravity}
                    />
                </>
            )}

            {/* Menus */}
            {gameState === 'START' && (
                <View style={styles.overlay}>
                    <Text style={styles.title}>FLUX RUNNER</Text>
                    <Text style={styles.subtitle}>Avoid the Staggered Pillars</Text>
                    <TouchableOpacity style={styles.button} onPress={startGame}>
                        <Text style={styles.buttonText}>START MISSION</Text>
                    </TouchableOpacity>
                </View>
            )}

            {gameState === 'GAME_OVER' && (
                <View style={styles.overlay}>
                    <Text style={styles.gameOverTitle}>GAME OVER</Text>
                    <Text style={styles.finalScore}>SCORE: {score}</Text>
                    <Text style={styles.highScore}>RECORD: {highScore}</Text>
                    <TouchableOpacity style={styles.button} onPress={startGame}>
                        <Text style={styles.buttonText}>TRY AGAIN</Text>
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050505',
    },
    background: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#050505',
    },
    touchArea: {
        ...StyleSheet.absoluteFillObject,
    },
    player: {
        position: 'absolute',
        left: SCREEN_WIDTH * 0.2,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
        backgroundColor: '#00f2ff',
        borderRadius: 12,
        shadowColor: '#00f2ff',
        shadowOpacity: 1,
        shadowRadius: 15,
        elevation: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eye: {
        width: 8,
        height: 8,
        backgroundColor: '#0a0a0a',
        borderRadius: 4,
        marginLeft: 15,
    },
    obstacle: {
        position: 'absolute',
        width: OBSTACLE_WIDTH,
        backgroundColor: '#ff0055',
        shadowColor: '#ff0055',
        shadowOpacity: 0.8,
        shadowRadius: 15,
        elevation: 15,
    },
    scoreText: {
        position: 'absolute',
        top: 60,
        width: '100%',
        textAlign: 'center',
        fontSize: 120,
        color: 'rgba(255, 255, 255, 0.08)',
        fontWeight: '900',
    },
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    title: {
        fontSize: 56,
        color: '#00f2ff',
        fontWeight: '900',
        letterSpacing: 4,
        marginBottom: 10,
        textAlign: 'center',
        textShadowColor: '#00f2ff',
        textShadowRadius: 15,
    },
    subtitle: {
        fontSize: 18,
        color: '#555',
        marginBottom: 60,
        letterSpacing: 1,
    },
    gameOverTitle: {
        fontSize: 48,
        color: '#ff0055',
        fontWeight: '900',
        marginBottom: 20,
        textShadowColor: '#ff0055',
        textShadowRadius: 15,
    },
    finalScore: {
        fontSize: 28,
        color: '#fff',
        marginBottom: 10,
        fontWeight: '700',
    },
    highScore: {
        fontSize: 16,
        color: '#333',
        marginBottom: 50,
    },
    button: {
        paddingHorizontal: 40,
        paddingVertical: 18,
        borderRadius: 15,
        borderWidth: 2,
        borderColor: '#00f2ff',
    },
    buttonText: {
        color: '#00f2ff',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 2,
    },
});
