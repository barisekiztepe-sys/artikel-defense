/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Trophy, Play, RotateCcw, Zap, BookOpen, ArrowLeft, Infinity as InfinityIcon, Book, Shield, Timer, BarChart3, Languages, Calendar, CheckCircle2, Image as ImageIcon, LogIn, LogOut, User as UserIcon, HelpCircle, Settings, Volume2, VolumeX, Music } from 'lucide-react';
import { WORDS } from './words';
import { VERBS, PRONOUNS } from './verbs';
import { CARDS, CollectionCard } from './cards';
import { auth, db, googleProvider, signInWithPopup, collection, query, orderBy, limit, onSnapshot, setDoc, doc, serverTimestamp, getDoc } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

// Types
type GameInput = string;
type GameState = 'START' | 'PLAYING' | 'GAMEOVER';
type GameMode = 'STORY' | 'ENDLESS' | 'PLURAL' | 'VERBS' | 'VOCAB' | 'REVENGE';

interface DailyQuest {
  id: string;
  description: string;
  target: number;
  current: number;
  completed: boolean;
}

interface FallingItem {
  id: number;
  display: string;
  answer: string;
  meaning?: string;
  x: number;
  y: number;
  speed: number;
  type: 'WORD' | 'POWERUP';
  powerUpType?: 'SLOW' | 'SHIELD';
  options?: string[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [gameMode, setGameMode] = useState<GameMode>('STORY');
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(1000);
  const [highScore, setHighScore] = useState(0);
  const [shake, setShake] = useState(false);
  const [showWordList, setShowWordList] = useState(false);
  const [wordListTab, setWordListTab] = useState<'NOUNS' | 'PLURALS' | 'VERBS'>('NOUNS');
  const [showStats, setShowStats] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showGuide, setShowGuide] = useState<string | null>(null);
  const [seenGuides, setSeenGuides] = useState<string[]>([]);
  const [unlockedStage, setUnlockedStage] = useState(1);
  const [credits, setCredits] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [lastError, setLastError] = useState<{ word: string, correct: string } | null>(null);
  const [missedWords, setMissedWords] = useState<Record<string, number>>({});
  const [activeShield, setActiveShield] = useState(false);
  const [slowMoActive, setSlowMoActive] = useState(false);
  
  // Combo & Quests State
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [streak, setStreak] = useState(0);
  const [lastQuestDate, setLastQuestDate] = useState<string>('');
  
  // Firebase & Collection State
  const [user, setUser] = useState<User | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [unlockedCards, setUnlockedCards] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [lastOptions, setLastOptions] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  
  // Audio Context
  const audioCtx = useRef<AudioContext | null>(null);
  const musicOsc = useRef<OscillatorNode | null>(null);
  const musicGain = useRef<GainNode | null>(null);

  const playSound = (type: 'hit' | 'miss' | 'powerup' | 'gameover') => {
    if (!soundEnabled) return;
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'hit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'miss') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'powerup') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.3);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'gameover') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.5);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  };

  // Background Music System
  useEffect(() => {
    if (musicEnabled) {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtx.current;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, ctx.currentTime); // A2
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      
      musicOsc.current = osc;
      musicGain.current = gain;

      // Simple "melody" loop
      const interval = setInterval(() => {
        const freqs = [110, 130.81, 146.83, 164.81]; // A2, C3, D3, E3
        const freq = freqs[Math.floor(Math.random() * freqs.length)];
        osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 0.5);
      }, 4000);

      return () => {
        clearInterval(interval);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        setTimeout(() => osc.stop(), 500);
      };
    }
  }, [musicEnabled]);

  const speak = (text: string, isPlural: boolean = false) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };
  
  // Progression State
  const [stage, setStage] = useState(1);
  const [chapterProgress, setChapterProgress] = useState(0);
  const [isBossFight, setIsBossFight] = useState(false);
  const [showStageClear, setShowStageClear] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemsRef = useRef<FallingItem[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const requestRef = useRef<number>(null);
  const lastSpawnRef = useRef<number>(0);
  const speedMultiplierRef = useRef<number>(1);
  const nextIdRef = useRef<number>(0);

  // Firebase Auth & Leaderboard
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Load user profile
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserProfile(data);
          setUnlockedCards(data.unlockedCards || []);
          if (data.highScore > highScore) setHighScore(data.highScore);
          if (data.unlockedStage > unlockedStage) setUnlockedStage(data.unlockedStage);
          if (data.credits > credits) setCredits(data.credits);
        } else {
          // Create initial profile
          const initialProfile = {
            uid: u.uid,
            displayName: u.displayName,
            photoURL: u.photoURL,
            highScore: 0,
            streak: 0,
            unlockedCards: [],
            unlockedStage: 1,
            credits: 0
          };
          await setDoc(doc(db, 'users', u.uid), initialProfile);
          setUserProfile(initialProfile);
        }
      } else {
        setUserProfile(null);
        setUnlockedCards([]);
      }
    });

    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
    const unsubscribeLeaderboard = onSnapshot(q, (snapshot) => {
      const scores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaderboard(scores);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeLeaderboard();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = () => auth.signOut();

  const unlockCard = async (cardId: string) => {
    if (!user || unlockedCards.includes(cardId)) return;
    const newUnlocked = [...unlockedCards, cardId];
    setUnlockedCards(newUnlocked);
    await setDoc(doc(db, 'users', user.uid), { unlockedCards: newUnlocked }, { merge: true });
    playSound('powerup');
  };

  // Load stats and quests
  useEffect(() => {
    const savedStats = localStorage.getItem('artikel-defense-stats');
    if (savedStats) setMissedWords(JSON.parse(savedStats));

    const savedSeenGuides = localStorage.getItem('artikel-defense-seen-guides');
    if (savedSeenGuides) setSeenGuides(JSON.parse(savedSeenGuides));
    else {
      // First time user - show main guide
      setShowGuide('MAIN');
    }

    const savedUnlockedStage = localStorage.getItem('artikel-defense-unlocked-stage');
    if (savedUnlockedStage) setUnlockedStage(parseInt(savedUnlockedStage));

    const savedCredits = localStorage.getItem('artikel-defense-credits');
    if (savedCredits) setCredits(parseInt(savedCredits));

    const savedSound = localStorage.getItem('artikel-defense-sound');
    if (savedSound !== null) setSoundEnabled(savedSound === 'true');

    const savedMusic = localStorage.getItem('artikel-defense-music');
    if (savedMusic !== null) setMusicEnabled(savedMusic === 'true');

    const savedQuests = localStorage.getItem('artikel-defense-quests');
    const savedStreak = localStorage.getItem('artikel-defense-streak');
    const savedDate = localStorage.getItem('artikel-defense-quest-date');
    
    const today = new Date().toDateString();
    
    if (savedDate === today && savedQuests) {
      setQuests(JSON.parse(savedQuests));
      setStreak(parseInt(savedStreak || '0'));
      setLastQuestDate(savedDate);
    } else {
      // Generate new quests for the day
      const newQuests: DailyQuest[] = [
        { id: 'score', description: 'Score 500 points in any mode', target: 500, current: 0, completed: false },
        { id: 'correct', description: 'Get 20 correct answers', target: 20, current: 0, completed: false },
        { id: 'endless', description: 'Reach 200 score in Endless mode', target: 200, current: 0, completed: false }
      ];
      setQuests(newQuests);
      setLastQuestDate(today);
      localStorage.setItem('artikel-defense-quest-date', today);
      localStorage.setItem('artikel-defense-quests', JSON.stringify(newQuests));
      
      // Check streak
      if (savedDate) {
        const lastDate = new Date(savedDate);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastDate.toDateString() === yesterday.toDateString()) {
          // Streak continues (will be updated when quests done)
        } else if (lastDate.toDateString() !== today) {
          setStreak(0);
          localStorage.setItem('artikel-defense-streak', '0');
        }
      }
    }
  }, []);

  const updateQuests = useCallback((type: 'score' | 'correct' | 'mode_score', value: number, mode?: GameMode) => {
    setQuests(prev => {
      const updated = prev.map(q => {
        if (q.completed) return q;
        let newValue = q.current;
        if (q.id === 'score' && type === 'score') newValue += value;
        if (q.id === 'correct' && type === 'correct') newValue += value;
        if (q.id === 'endless' && type === 'mode_score' && mode === 'ENDLESS') newValue = Math.max(newValue, value);
        
        const completed = newValue >= q.target;
        return { ...q, current: newValue, completed };
      });

      localStorage.setItem('artikel-defense-quests', JSON.stringify(updated));
      
      // Check if all completed for streak
      if (updated.every(q => q.completed) && prev.some(q => !q.completed)) {
        setStreak(s => {
          const newS = s + 1;
          localStorage.setItem('artikel-defense-streak', newS.toString());
          return newS;
        });
      }
      
      return updated;
    });
  }, []);

  const trackMiss = (word: string) => {
    setMissedWords(prev => {
      const updated = { ...prev, [word]: (prev[word] || 0) + 1 };
      localStorage.setItem('artikel-defense-stats', JSON.stringify(updated));
      return updated;
    });
  };

  const PROGRESS_TARGET = isBossFight ? 25 : 10;

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('artikel-defense-highscore');
    if (saved) setHighScore(parseInt(saved));
  }, []);

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('artikel-defense-highscore', score.toString());
    }
  }, [score, highScore]);

  const getChapterPool = useCallback(() => {
    if (gameMode === 'ENDLESS') return WORDS;
    if (gameMode === 'PLURAL') return WORDS.filter(w => w.plural);
    if (gameMode === 'VERBS') return VERBS;
    if (gameMode === 'VOCAB') return [...WORDS, ...VERBS];
    if (gameMode === 'REVENGE') {
      const sortedMissed = Object.entries(missedWords)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([word]) => word);
      
      // Only include nouns (WORDS) that were specifically missed as Article questions
      // (When Article is missed, display is just w.word. When Vocab is missed, display is 'art word')
      return WORDS.filter(w => {
        return sortedMissed.includes(w.word);
      });
    }

    if (isBossFight) {
      const chapterIndex = Math.floor((stage - 1) / 5);
      const start = chapterIndex * 50;
      const end = (chapterIndex + 1) * 50;
      return WORDS.slice(start, end);
    } else {
      const chapterIndex = Math.floor((stage - 1) / 5);
      const stageInChapter = (stage - 1) % 5;
      const start = (chapterIndex * 50) + (stageInChapter * 10);
      const end = start + 10;
      return WORDS.slice(start, end);
    }
  }, [stage, isBossFight, gameMode]);

  const spawnItem = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Random Power-up spawn in Endless
    if (gameMode === 'ENDLESS' && Math.random() < 0.05) {
      const type = Math.random() < 0.5 ? 'SLOW' : 'SHIELD';
      itemsRef.current.push({
        id: nextIdRef.current++,
        display: type === 'SLOW' ? '⏱️' : '🛡️',
        answer: 'POWERUP',
        type: 'POWERUP',
        powerUpType: type,
        x: 50 + Math.random() * (canvas.width - 100),
        y: -50,
        speed: 2
      });
      return;
    }

    const pool = getChapterPool();
    if (pool.length === 0) return;
    
    const item = pool[Math.floor(Math.random() * pool.length)];
    const padding = 50;
    const x = padding + Math.random() * (canvas.width - padding * 2);
    
    const baseSpeed = slowMoActive ? 0.3 : 0.8;
    const speedVariation = Math.random() * 0.5;
    
    let display = '';
    let answer = '';
    let meaning = '';
    let options: string[] | undefined = undefined;

    if (gameMode === 'VOCAB') {
      const isVerb = 'infinitive' in item;
      display = isVerb ? (item as any).infinitive : `${(item as any).art} ${(item as any).word}`;
      answer = item.meaning;
      meaning = item.meaning;
      
      const allMeanings = [...WORDS.map(w => w.meaning), ...VERBS.map(v => v.meaning)];
      const distractors = allMeanings
        .filter(m => m !== answer)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
      options = [answer, ...distractors].sort(() => Math.random() - 0.5);
      
      // Trigger re-render for buttons if it's the first or target item
      setLastOptions(options);
    } else if (gameMode === 'VERBS') {
      const v = item as typeof VERBS[0];
      const p = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)];
      display = `${p.pronoun} ${v.root}...`;
      answer = p.ending;
      meaning = v.meaning;
    } else if (gameMode === 'PLURAL') {
      const w = item as any; // Using any to access pType safely
      display = w.word;
      answer = w.pType;
      meaning = w.meaning;
    } else {
      const w = item as typeof WORDS[0];
      display = w.word;
      answer = w.art;
      meaning = w.meaning;
    }

    itemsRef.current.push({
      id: nextIdRef.current++,
      display,
      answer,
      meaning,
      options,
      x,
      y: -50,
      speed: (baseSpeed + speedVariation) * speedMultiplierRef.current * (isBossFight ? 1.2 : 1),
      type: 'WORD'
    });
  }, [getChapterPool, isBossFight, speedMultiplierRef, gameMode, slowMoActive]);

  const nextStage = useCallback(() => {
    setShowStageClear(false);
    const nextS = stage + 1;
    setStage(nextS);
    
    if (gameMode === 'STORY' && nextS > unlockedStage) {
      setUnlockedStage(nextS);
      localStorage.setItem('artikel-defense-unlocked-stage', nextS.toString());
      if (user) {
        setDoc(doc(db, 'users', user.uid), { unlockedStage: nextS }, { merge: true });
      }
    }

    setChapterProgress(0);
    setIsBossFight(nextS % 5 === 0);
    itemsRef.current = [];
    particlesRef.current = [];
  }, [stage, unlockedStage, gameMode, user]);

  const handleInput = (input: GameInput) => {
    if (gameState !== 'PLAYING' || showStageClear) return;

    let lowestItemIndex = -1;
    let maxY = -Infinity;

    itemsRef.current.forEach((item, i) => {
      if (item.y > maxY) {
        maxY = item.y;
        lowestItemIndex = i;
      }
    });

    if (lowestItemIndex !== -1) {
      const target = itemsRef.current[lowestItemIndex];
      
      if (target.type === 'POWERUP') {
        // Collect powerup regardless of button if it's the lowest? 
        // Actually let's make it so any button collects it if it's the lowest
        playSound('powerup');
        if (target.powerUpType === 'SLOW') {
          setSlowMoActive(true);
          setTimeout(() => setSlowMoActive(false), 5000);
        } else {
          setActiveShield(true);
        }
        itemsRef.current.splice(lowestItemIndex, 1);
        return;
      }

      if (target.answer === input) {
        // Correct!
        playSound('hit');
        if (gameMode === 'PLURAL') {
          const wordObj = WORDS.find(w => w.word === target.display);
          if (wordObj?.plural) speak(wordObj.plural);
        } else {
          speak(target.display.split(' ')[1] || target.display);
        }

        let points = 10;
        if (gameMode === 'ENDLESS') {
          const newCombo = combo + 1;
          setCombo(newCombo);
          setMaxCombo(m => Math.max(m, newCombo));
          // Combo bonus: +2 points per combo level after 5
          if (newCombo >= 5) points += Math.min(40, (newCombo - 4) * 2);
        }

        const newScore = score + points;
        setScore(newScore);
        setCredits(c => {
          const nextC = c + points;
          localStorage.setItem('artikel-defense-credits', nextC.toString());
          if (user) {
            setDoc(doc(db, 'users', user.uid), { credits: nextC }, { merge: true });
          }
          return nextC;
        });
        updateQuests('correct', 1);
        updateQuests('score', points);
        if (gameMode === 'ENDLESS') updateQuests('mode_score', newScore, 'ENDLESS');
        
        // Unlock cards based on score
        if (newScore >= 100) unlockCard('pretzel');
        if (newScore >= 500) unlockCard('currywurst');
        if (newScore >= 1000) unlockCard('autobahn');
        if (newScore >= 2000) unlockCard('oktoberfest');
        if (newScore >= 5000) unlockCard('brandenburg');
        if (newScore >= 10000) unlockCard('castle');

        if (gameMode === 'STORY' || gameMode === 'PLURAL' || gameMode === 'VERBS') {
          setChapterProgress(p => {
            const nextP = p + 1;
            if (nextP >= PROGRESS_TARGET) {
              setShowStageClear(true);
              setTimeout(nextStage, 2000);
            }
            return nextP;
          });
        } else {
          if (newScore % 100 === 0) speedMultiplierRef.current += 0.1;
        }
        
        createExplosion(target.x, target.y, '#4ade80');
        itemsRef.current.splice(lowestItemIndex, 1);
      } else {
        // Wrong!
        if (activeShield) {
          setActiveShield(false);
          createExplosion(target.x, target.y, '#60a5fa');
          itemsRef.current.splice(lowestItemIndex, 1);
          return;
        }

        playSound('miss');
        trackMiss(target.display);
        setCombo(0);
        if (gameMode !== 'ENDLESS') {
          setLastError({ word: target.display, correct: target.answer });
          setGameState('GAMEOVER');
          playSound('gameover');
        } else {
          setHp(h => Math.max(0, h - 100));
          createExplosion(target.x, target.y, '#f87171');
          triggerShake();
          itemsRef.current.splice(lowestItemIndex, 1);
        }
      }
    }
  };

  const update = (time: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'PLAYING') {
      const spawnInterval = gameMode === 'ENDLESS' 
        ? Math.max(1000, 2500 - (score * 0.5))
        : 2000;
        
      if (time - lastSpawnRef.current > spawnInterval) {
        spawnItem();
        lastSpawnRef.current = time;
      }

      itemsRef.current.forEach((item, index) => {
        item.y += item.speed;

        if (item.y > canvas.height - 100) {
          if (item.type === 'POWERUP') {
            itemsRef.current.splice(index, 1);
            return;
          }
          if (activeShield) {
            setActiveShield(false);
            createExplosion(item.x, item.y, '#60a5fa');
            itemsRef.current.splice(index, 1);
            return;
          }
          setCombo(0);
          playSound('miss');
          if (gameMode !== 'ENDLESS') {
            setLastError({ word: item.display, correct: item.answer });
            setGameState('GAMEOVER');
            playSound('gameover');
          } else {
            setHp(h => Math.max(0, h - 100));
            createExplosion(item.x, item.y, '#f87171');
            triggerShake();
            itemsRef.current.splice(index, 1);
          }
          return;
        }

        ctx.save();
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 15;
        ctx.shadowColor = item.type === 'POWERUP' ? '#60a5fa' : '#fff';
        
        const metrics = ctx.measureText(item.display);
        const wWidth = metrics.width + 30;
        const wHeight = 40;
        
        ctx.beginPath();
        ctx.roundRect(item.x - wWidth/2, item.y - wHeight/2, wWidth, wHeight, 20);
        ctx.fillStyle = item.type === 'POWERUP' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = item.type === 'POWERUP' ? '#60a5fa' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.fillText(item.display, item.x, item.y + 8);
        ctx.restore();
      });

      particlesRef.current.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) {
          particlesRef.current.splice(index, 1);
          return;
        }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      if (gameMode === 'ENDLESS' && hp <= 0) {
        if (score > highScore) {
          setHighScore(score);
          localStorage.setItem('artikel-defense-highscore', score.toString());
          
          if (user) {
            setDoc(doc(db, 'users', user.uid), { highScore: score }, { merge: true });
            setDoc(doc(collection(db, 'leaderboard')), {
              uid: user.uid,
              displayName: user.displayName,
              photoURL: user.photoURL,
              score: score,
              mode: gameMode,
              timestamp: serverTimestamp()
            });
          }
        }
        setGameState('GAMEOVER');
        playSound('gameover');
      }
    }

    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, hp, score, spawnItem, gameMode, activeShield, slowMoActive]);

  const startGame = (mode: GameMode) => {
    setGameMode(mode);
    setScore(0);
    setHp(1000);
    
    if (mode === 'STORY') {
      setStage(unlockedStage);
      setIsBossFight(unlockedStage % 5 === 0);
    } else {
      setStage(1);
      setIsBossFight(false);
    }

    setChapterProgress(0);
    setShowStageClear(false);
    setLastError(null);
    setActiveShield(false);
    setSlowMoActive(false);
    setCombo(0);
    setMaxCombo(0);
    itemsRef.current = [];
    particlesRef.current = [];
    speedMultiplierRef.current = 1;
    setGameState('PLAYING');
    lastSpawnRef.current = 0; // Spawn immediately
    setLastOptions([]);

    if (!seenGuides.includes(mode)) {
      setShowGuide(mode);
    }
  };

  const closeGuide = () => {
    if (showGuide && showGuide !== 'MAIN' && !seenGuides.includes(showGuide)) {
      const newSeen = [...seenGuides, showGuide];
      setSeenGuides(newSeen);
      localStorage.setItem('artikel-defense-seen-guides', JSON.stringify(newSeen));
    } else if (showGuide === 'MAIN') {
      const newSeen = [...seenGuides, 'MAIN'];
      setSeenGuides(newSeen);
      localStorage.setItem('artikel-defense-seen-guides', JSON.stringify(newSeen));
    }
    setShowGuide(null);
  };

  const getGuideContent = (key: string) => {
    switch (key) {
      case 'MAIN': return {
        title: 'WELCOME TO ARTIKEL DEFENSE',
        desc: 'Master German through fast-paced neon action. Choose a mode to start learning. Defend the bottom line by selecting the correct answers for falling words!'
      };
      case 'STORY': return {
        title: 'STORY MODE',
        desc: 'Defend against falling words by selecting the correct article (DER/DIE/DAS). Reach the streak target to clear stages and face bosses!'
      };
      case 'ENDLESS': return {
        title: 'ENDLESS MODE',
        desc: 'Survival mode! HP decreases over time and when you miss. Collect power-ups and build combos for high scores!'
      };
      case 'PLURAL': return {
        title: 'PLURAL MODE',
        desc: 'Match the singular noun to its correct plural ending. Speed increases as you progress!'
      };
      case 'VERBS': return {
        title: 'VERBS MODE',
        desc: 'Conjugate the verbs correctly based on the pronoun shown. Master German verb endings!'
      };
      case 'VOCAB': return {
        title: 'VOCAB MATCH',
        desc: 'Match the German word or verb to its correct English meaning. Expand your vocabulary!'
      };
      case 'REVENGE': return {
        title: 'REVENGE MODE',
        desc: "Face your demons! This mode only features words you've missed in previous games. Perfect for targeted practice!"
      };
      default: return { title: '', desc: '' };
    }
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        color
      });
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 300);
  };

  const lowestItem = itemsRef.current.reduce((lowest, current) => {
    return (!lowest || current.y > lowest.y) ? current : lowest;
  }, null as FallingItem | null);

  // Update lastOptions
  useEffect(() => {
    if (lowestItem?.options) {
      setLastOptions(lowestItem.options);
    }
  }, [lowestItem]);

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden font-sans text-white ${shake ? 'animate-shake' : ''}`}>
      {/* Combo Glow Effect */}
      <AnimatePresence>
        {combo >= 5 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 z-0 pointer-events-none border-[12px] transition-colors duration-500 ${
              combo >= 20 ? 'border-red-500/30 shadow-[inset_0_0_100px_rgba(239,68,68,0.4)]' :
              combo >= 10 ? 'border-orange-500/20 shadow-[inset_0_0_60px_rgba(249,115,22,0.3)]' :
              'border-blue-500/10 shadow-[inset_0_0_40px_rgba(59,130,246,0.2)]'
            }`}
          />
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="absolute inset-0 z-0" />

      {/* HUD */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-0 left-0 w-full p-6 flex flex-col gap-4 z-10 pointer-events-none">
          {/* Progress Bar */}
          {(gameMode === 'STORY' || gameMode === 'PLURAL' || gameMode === 'VERBS') && (
            <div className="absolute top-0 left-0 w-full h-1 bg-white/10 overflow-hidden">
              <motion.div 
                className="h-full bg-blue-500 shadow-[0_0_15px_#3b82f6]"
                initial={{ width: 0 }}
                animate={{ width: `${(chapterProgress / PROGRESS_TARGET) * 100}%` }}
              />
            </div>
          )}
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <span className="text-xl font-bold tabular-nums">{score}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-xs uppercase tracking-widest opacity-50">
                  High: {highScore}
                </div>
                {gameMode === 'ENDLESS' && combo >= 2 && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-orange-500">
                    <Zap className="w-4 h-4 fill-current" />
                    <span className="text-sm font-black italic">{combo} COMBO</span>
                  </motion.div>
                )}
                {activeShield && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-blue-400">
                    <Shield className="w-4 h-4" />
                    <span className="text-[10px] font-bold">SHIELD ON</span>
                  </motion.div>
                )}
                {slowMoActive && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-yellow-400">
                    <Timer className="w-4 h-4" />
                    <span className="text-[10px] font-bold">SLOW-MO</span>
                  </motion.div>
                )}
              </div>
            </div>

            {gameMode === 'ENDLESS' && (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                  <Heart className={`w-5 h-5 ${hp < 300 ? 'text-red-500 animate-pulse' : 'text-red-400'}`} />
                  <span className="text-xl font-bold tabular-nums">{hp}</span>
                </div>
                <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    className="h-full bg-red-500"
                    initial={{ width: '100%' }}
                    animate={{ width: `${(hp / 1000) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {gameMode === 'STORY' && (
            <div className="flex flex-col items-center gap-2 mt-2">
              <div className={`px-4 py-1 rounded-full text-xs font-black tracking-[0.3em] uppercase ${isBossFight ? 'bg-red-600 text-white animate-pulse' : 'bg-white/10 text-white/60'}`}>
                {isBossFight ? 'Boss Fight' : `Stage ${stage}`}
              </div>
              <div className="w-full max-w-[200px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full ${isBossFight ? 'bg-red-500' : 'bg-blue-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(chapterProgress / PROGRESS_TARGET) * 100}%` }}
                />
              </div>
              <div className="text-[10px] uppercase tracking-widest opacity-30">
                {chapterProgress} / {PROGRESS_TARGET} STREAK
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 w-full p-6 pb-12 z-20">
        {gameMode === 'VOCAB' ? (
          <div className="grid grid-cols-1 gap-2">
            {(lowestItem?.options || lastOptions).map((opt, i) => (
              <ControlButton 
                key={i} 
                label={opt.toUpperCase()} 
                compact
                color={i === 0 ? "bg-blue-600" : i === 1 ? "bg-purple-600" : "bg-orange-600"} 
                shadow={i === 0 ? "shadow-[0_0_20px_rgba(37,99,235,0.6)]" : i === 1 ? "shadow-[0_0_20px_rgba(147,51,234,0.6)]" : "shadow-[0_0_20px_rgba(234,88,12,0.6)]"}
                onClick={() => handleInput(opt)} 
              />
            ))}
          </div>
        ) : gameMode === 'VERBS' ? (
          <div className="grid grid-cols-2 gap-3">
            <ControlButton compact label="-E" color="bg-blue-600" shadow="shadow-[0_0_20px_rgba(37,99,235,0.6)]" onClick={() => handleInput('e')} />
            <ControlButton compact label="-ST" color="bg-red-600" shadow="shadow-[0_0_20px_rgba(220,38,38,0.6)]" onClick={() => handleInput('st')} />
            <ControlButton compact label="-T" color="bg-green-600" shadow="shadow-[0_0_20px_rgba(22,163,74,0.6)]" onClick={() => handleInput('t')} />
            <ControlButton compact label="-EN" color="bg-purple-600" shadow="shadow-[0_0_20px_rgba(147,51,234,0.6)]" onClick={() => handleInput('en')} />
          </div>
        ) : gameMode === 'PLURAL' ? (
          <div className="grid grid-cols-2 gap-3">
            <ControlButton compact label="-E" color="bg-blue-600" shadow="shadow-[0_0_20px_rgba(37,99,235,0.6)]" onClick={() => handleInput('e')} />
            <ControlButton compact label="-N / -EN" color="bg-red-600" shadow="shadow-[0_0_20px_rgba(220,38,38,0.6)]" onClick={() => handleInput('n')} />
            <ControlButton compact label="-ER" color="bg-green-600" shadow="shadow-[0_0_20px_rgba(22,163,74,0.6)]" onClick={() => handleInput('er')} />
            <div className="grid grid-cols-2 gap-3">
              <ControlButton compact label="-S" color="bg-purple-600" shadow="shadow-[0_0_20px_rgba(147,51,234,0.6)]" onClick={() => handleInput('s')} />
              <ControlButton compact label="NONE" color="bg-orange-600" shadow="shadow-[0_0_20px_rgba(234,88,12,0.6)]" onClick={() => handleInput('none')} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <ControlButton label="DER" color="bg-blue-600" shadow="shadow-[0_0_20px_rgba(37,99,235,0.6)]" onClick={() => handleInput('der')} />
            <ControlButton label="DIE" color="bg-red-600" shadow="shadow-[0_0_20px_rgba(220,38,38,0.6)]" onClick={() => handleInput('die')} />
            <ControlButton label="DAS" color="bg-green-600" shadow="shadow-[0_0_20px_rgba(22,163,74,0.6)]" onClick={() => handleInput('das')} />
          </div>
        )}
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {showWordList && (
          <motion.div key="wordlist-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex flex-col gap-4 border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowWordList(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <ArrowLeft className="w-8 h-8" />
                </button>
                <h2 className="text-3xl font-black italic tracking-tighter">WORD LIST</h2>
              </div>
              
              <div className="flex bg-white/5 p-1 rounded-xl gap-1">
                {(['NOUNS', 'PLURALS', 'VERBS'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setWordListTab(tab)}
                    className={`flex-1 py-2 rounded-lg text-xs font-black tracking-widest transition-all ${
                      wordListTab === tab ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-20">
              {wordListTab === 'NOUNS' && Array.from({ length: Math.ceil(WORDS.length / 10) }).map((_, i) => (
                <div key={i} className="space-y-4">
                  <h3 className="text-blue-500 font-black tracking-widest text-sm uppercase flex items-center gap-2">
                    <span className="w-8 h-px bg-blue-500/30"></span> Chapter {i + 1} <span className="flex-1 h-px bg-blue-500/30"></span>
                  </h3>
                  <div className="grid gap-2">
                    {WORDS.slice(i * 10, (i + 1) * 10).map((w) => (
                      <div key={`${w.word}-${i}`} className="bg-white/5 rounded-xl p-4 flex items-center justify-between border border-white/5">
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${w.art === 'der' ? 'bg-blue-600' : w.art === 'die' ? 'bg-red-600' : 'bg-green-600'}`}>
                            {w.art}
                          </span>
                          <span className="text-lg font-bold">{w.word}</span>
                        </div>
                        <span className="text-white/40 italic text-sm">{w.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {wordListTab === 'PLURALS' && (
                <div className="grid gap-2">
                  {WORDS.filter(w => w.plural).map((w) => (
                    <div key={`plural-${w.word}`} className="bg-white/5 rounded-xl p-4 flex flex-col gap-2 border border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold">{w.word}</span>
                        <ArrowLeft className="w-4 h-4 rotate-180 text-white/20" />
                        <span className="text-lg font-bold text-purple-400">{w.plural}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-black">
                        <span className="text-white/40 italic">{w.meaning}</span>
                        <span className="bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded">Ending: -{w.pType?.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {wordListTab === 'VERBS' && (
                <div className="grid gap-2">
                  {VERBS.map((v) => (
                    <div key={`verb-${v.infinitive}`} className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/5">
                      <div className="flex justify-between items-center">
                        <span className="text-xl font-black italic text-orange-400 uppercase">{v.infinitive}</span>
                        <span className="text-white/40 italic text-sm">{v.meaning}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {PRONOUNS.map((p, pIdx) => (
                          <div key={pIdx} className="bg-black/40 p-2 rounded-lg flex justify-between items-center">
                            <span className="text-[10px] text-white/40 uppercase font-black">{p.pronoun}</span>
                            <span className="text-sm font-bold">{v.root}<span className="text-orange-400">{p.ending}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {showStageClear && (
          <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.5 }} className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
            <div className="text-center">
              <motion.div animate={{ rotate: [0, -5, 5, 0] }} transition={{ repeat: Infinity, duration: 0.5 }}>
                <Zap className="w-20 h-20 text-yellow-400 mx-auto mb-4 fill-current" />
              </motion.div>
              <h2 className="text-5xl font-black italic tracking-tighter">{isBossFight ? 'BOSS DEFEATED!' : 'STAGE CLEAR!'}</h2>
              <p className="text-white/60 uppercase tracking-[0.3em] text-sm mt-2">Next Level Loading...</p>
            </div>
          </motion.div>
        )}

        {showStats && (
          <motion.div key="stats-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex items-center gap-4 border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <button onClick={() => setShowStats(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ArrowLeft className="w-8 h-8" />
              </button>
              <h2 className="text-3xl font-black italic tracking-tighter">STATISTICS</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <h3 className="text-red-500 font-black tracking-widest text-sm uppercase">Most Confused Words</h3>
              {Object.entries(missedWords).length === 0 ? (
                <p className="text-white/40 italic">No mistakes yet! Keep it up.</p>
              ) : (
                (Object.entries(missedWords) as [string, number][])
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([word, count], i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-4 flex items-center justify-between border border-white/5">
                      <span className="text-lg font-bold">{word}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-red-500 font-bold">{count}</span>
                        <span className="text-white/20 text-xs uppercase">Mistakes</span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </motion.div>
        )}

        {showQuests && (
          <motion.div key="quests-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex items-center gap-4 border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <button onClick={() => setShowQuests(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ArrowLeft className="w-8 h-8" />
              </button>
              <h2 className="text-3xl font-black italic tracking-tighter">DAILY QUESTS</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-blue-400 font-black mb-1">Current Streak</p>
                  <p className="text-4xl font-black italic">{streak} DAYS</p>
                </div>
                <Calendar className="w-12 h-12 text-blue-500 opacity-50" />
              </div>

              <div className="space-y-4">
                {quests.map((q) => (
                  <div key={q.id} className={`p-4 rounded-xl border transition-all ${q.completed ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <p className={`font-bold ${q.completed ? 'text-green-400' : 'text-white'}`}>{q.description}</p>
                      {q.completed && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase tracking-widest font-black opacity-40">
                        <span>Progress</span>
                        <span>{Math.min(q.current, q.target)} / {q.target}</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          className={`h-full ${q.completed ? 'bg-green-500' : 'bg-blue-500'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${(Math.min(q.current, q.target) / q.target) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {quests.every(q => q.completed) && (
                <div className="p-6 bg-green-500/20 border border-green-500/30 rounded-2xl text-center">
                  <Trophy className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="font-black text-green-400 uppercase tracking-widest">All Quests Done!</p>
                  <p className="text-xs text-green-400/60 mt-1">Streak updated. See you tomorrow!</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {showShop && (
          <motion.div key="shop-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowShop(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <ArrowLeft className="w-8 h-8" />
                </button>
                <h2 className="text-3xl font-black italic tracking-tighter">POWER-UP SHOP</h2>
              </div>
              <div className="flex items-center gap-2 bg-yellow-500/20 text-yellow-500 px-4 py-2 rounded-full border border-yellow-500/30 font-black italic">
                <Zap className="w-4 h-4 fill-current" /> {credits}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <button 
                  disabled={credits < 500}
                  onClick={() => {
                    const newCredits = credits - 500;
                    setCredits(newCredits);
                    setActiveShield(true);
                    playSound('powerup');
                    localStorage.setItem('artikel-defense-credits', newCredits.toString());
                    if (user) {
                      setDoc(doc(db, 'users', user.uid), { credits: newCredits }, { merge: true });
                    }
                  }}
                  className={`flex items-center gap-4 p-6 rounded-3xl border transition-all ${credits >= 500 ? 'bg-blue-600/10 border-blue-500/30 hover:bg-blue-600/20' : 'bg-white/5 border-white/10 opacity-50'}`}
                >
                  <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                    <Shield className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-bold text-lg">SHIELD GENERATOR</h3>
                    <p className="text-xs text-white/40">Protects you from one miss.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-yellow-500 italic">500 ZAP</p>
                  </div>
                </button>

                <button 
                  disabled={credits < 300}
                  onClick={() => {
                    const newCredits = credits - 300;
                    setCredits(newCredits);
                    setSlowMoActive(true);
                    setTimeout(() => setSlowMoActive(false), 8000);
                    playSound('powerup');
                    localStorage.setItem('artikel-defense-credits', newCredits.toString());
                    if (user) {
                      setDoc(doc(db, 'users', user.uid), { credits: newCredits }, { merge: true });
                    }
                  }}
                  className={`flex items-center gap-4 p-6 rounded-3xl border transition-all ${credits >= 300 ? 'bg-yellow-600/10 border-yellow-500/30 hover:bg-yellow-600/20' : 'bg-white/5 border-white/10 opacity-50'}`}
                >
                  <div className="w-12 h-12 bg-yellow-500/20 rounded-2xl flex items-center justify-center">
                    <Timer className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-bold text-lg">TIME WARP</h3>
                    <p className="text-xs text-white/40">Slows down time for 8 seconds.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-yellow-500 italic">300 ZAP</p>
                  </div>
                </button>

                <button 
                  disabled={credits < 1000}
                  onClick={() => {
                    const newCredits = credits - 1000;
                    setCredits(newCredits);
                    setHp(h => Math.min(1000, h + 500));
                    playSound('powerup');
                    localStorage.setItem('artikel-defense-credits', newCredits.toString());
                    if (user) {
                      setDoc(doc(db, 'users', user.uid), { credits: newCredits }, { merge: true });
                    }
                  }}
                  className={`flex items-center gap-4 p-6 rounded-3xl border transition-all ${credits >= 1000 ? 'bg-green-600/10 border-green-500/30 hover:bg-green-600/20' : 'bg-white/5 border-white/10 opacity-50'}`}
                >
                  <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center">
                    <Heart className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-bold text-lg">REPAIR KIT</h3>
                    <p className="text-xs text-white/40">Restores 50% of your HP.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-yellow-500 italic">1000 ZAP</p>
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {showSettings && (
          <motion.div key="settings-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <ArrowLeft className="w-8 h-8" />
                </button>
                <h2 className="text-3xl font-black italic tracking-tighter">SETTINGS</h2>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 bg-white/5 rounded-[32px] border border-white/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                      {soundEnabled ? <Volume2 className="w-6 h-6 text-blue-400" /> : <VolumeX className="w-6 h-6 text-red-400" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">SOUND EFFECTS</h3>
                      <p className="text-xs text-white/40">Game actions and feedback</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      localStorage.setItem('artikel-defense-sound', next.toString());
                    }}
                    className={`w-14 h-8 rounded-full transition-all relative ${soundEnabled ? 'bg-blue-600' : 'bg-white/10'}`}
                  >
                    <motion.div 
                      animate={{ x: soundEnabled ? 24 : 4 }}
                      className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-white/5 rounded-[32px] border border-white/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center">
                      <Music className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">AMBIENT MUSIC</h3>
                      <p className="text-xs text-white/40">Atmospheric neon background</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !musicEnabled;
                      setMusicEnabled(next);
                      localStorage.setItem('artikel-defense-music', next.toString());
                    }}
                    className={`w-14 h-8 rounded-full transition-all relative ${musicEnabled ? 'bg-purple-600' : 'bg-white/10'}`}
                  >
                    <motion.div 
                      animate={{ x: musicEnabled ? 24 : 4 }}
                      className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
                    />
                  </button>
                </div>
              </div>

              <div className="p-6 bg-blue-600/10 border border-blue-500/20 rounded-[32px] space-y-4">
                <h3 className="font-black italic text-lg tracking-tight text-blue-400 uppercase">Pro Tips</h3>
                <ul className="space-y-3 text-sm text-white/60">
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                    Focus on the lowest word first to prevent damage.
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                    Endless mode combos multiply your score significantly.
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                    Use the Shop to buy a Shield before a difficult Boss Fight.
                  </li>
                </ul>
              </div>

              <div className="pt-8 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Artikel Defense v1.2.0</p>
              </div>
            </div>
          </motion.div>
        )}

        {showSettings && (
          <motion.div key="settings-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <ArrowLeft className="w-8 h-8" />
                </button>
                <h2 className="text-3xl font-black italic tracking-tighter">SETTINGS</h2>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 bg-white/5 rounded-[32px] border border-white/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                      {soundEnabled ? <Volume2 className="w-6 h-6 text-blue-400" /> : <VolumeX className="w-6 h-6 text-red-400" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">SOUND EFFECTS</h3>
                      <p className="text-xs text-white/40">Game actions and feedback</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      localStorage.setItem('artikel-defense-sound', next.toString());
                    }}
                    className={`w-14 h-8 rounded-full transition-all relative ${soundEnabled ? 'bg-blue-600' : 'bg-white/10'}`}
                  >
                    <motion.div 
                      animate={{ x: soundEnabled ? 24 : 4 }}
                      className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-white/5 rounded-[32px] border border-white/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center">
                      <Music className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">AMBIENT MUSIC</h3>
                      <p className="text-xs text-white/40">Atmospheric neon background</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !musicEnabled;
                      setMusicEnabled(next);
                      localStorage.setItem('artikel-defense-music', next.toString());
                    }}
                    className={`w-14 h-8 rounded-full transition-all relative ${musicEnabled ? 'bg-purple-600' : 'bg-white/10'}`}
                  >
                    <motion.div 
                      animate={{ x: musicEnabled ? 24 : 4 }}
                      className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
                    />
                  </button>
                </div>
              </div>

              <div className="p-6 bg-blue-600/10 border border-blue-500/20 rounded-[32px] space-y-4">
                <h3 className="font-black italic text-lg tracking-tight text-blue-400 uppercase">Pro Tips</h3>
                <ul className="space-y-3 text-sm text-white/60">
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                    Focus on the lowest word first to prevent damage.
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                    Endless mode combos multiply your score significantly.
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                    Use the Shop to buy a Shield before a difficult Boss Fight.
                  </li>
                </ul>
              </div>

              <div className="pt-8 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Artikel Defense v1.2.0</p>
              </div>
            </div>
          </motion.div>
        )}

        {showGuide && (
          <motion.div 
            key="guide-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white/10 border border-white/20 p-8 rounded-[40px] max-w-sm w-full text-center relative overflow-hidden"
            >
              <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-500/20 blur-[80px]" />
              <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-500/20 blur-[80px]" />
              
              <div className="w-16 h-16 bg-white text-black rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                <HelpCircle className="w-8 h-8" />
              </div>
              
              <h3 className="text-2xl font-black italic tracking-tighter mb-4 uppercase">
                {getGuideContent(showGuide).title}
              </h3>
              
              <p className="text-white/70 leading-relaxed mb-8 text-sm">
                {getGuideContent(showGuide).desc}
              </p>
              
              <button 
                onClick={closeGuide}
                className="w-full bg-white text-black py-4 rounded-2xl font-black text-lg hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]"
              >
                GOT IT!
              </button>
            </motion.div>
          </motion.div>
        )}

        {showLeaderboard && (
          <motion.div key="leaderboard-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex items-center gap-4 border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <button onClick={() => setShowLeaderboard(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ArrowLeft className="w-8 h-8" />
              </button>
              <h2 className="text-3xl font-black italic tracking-tighter">LEADERBOARD</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {leaderboard.map((entry, idx) => (
                <div key={entry.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${entry.uid === user?.uid ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/10'}`}>
                  <span className="text-2xl font-black italic text-white/20 w-8">{idx + 1}</span>
                  <img src={entry.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-white/20" referrerPolicy="no-referrer" />
                  <div className="flex-1">
                    <p className="font-bold">{entry.displayName}</p>
                    <p className="text-[10px] uppercase tracking-widest opacity-40">{entry.mode} MODE</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black italic">{entry.score}</p>
                    <p className="text-[10px] uppercase tracking-widest text-blue-400 font-black">POINTS</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {showCollection && (
          <motion.div key="collection-screen" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col">
            <div className="p-6 flex items-center gap-4 border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <button onClick={() => setShowCollection(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ArrowLeft className="w-8 h-8" />
              </button>
              <h2 className="text-3xl font-black italic tracking-tighter">COLLECTION</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4 pb-20">
              {CARDS.map((card) => {
                const isUnlocked = unlockedCards.includes(card.id);
                return (
                  <div key={card.id} className={`relative aspect-[3/4] rounded-2xl overflow-hidden border transition-all ${isUnlocked ? 'border-white/20' : 'border-white/5 opacity-40 grayscale'}`}>
                    <img src={card.image} alt={card.title} className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 w-full p-3">
                      <p className="text-xs font-black italic uppercase tracking-widest">{card.title}</p>
                      {!isUnlocked && <p className="text-[8px] opacity-60">LOCKED</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {gameState === 'START' && (
          <motion.div key="start-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl p-8 text-center overflow-y-auto">
            <div className="absolute top-6 left-6 flex gap-2">
              <button 
                onClick={() => setShowGuide('MAIN')}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-all text-white/60 hover:text-white"
              >
                <HelpCircle className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-all text-white/60 hover:text-white"
              >
                <Settings className="w-6 h-6" />
              </button>
            </div>
            <div className="absolute top-6 right-6 flex items-center gap-3">
              <div className="flex items-center gap-2 bg-yellow-500/20 text-yellow-500 px-4 py-2 rounded-full border border-yellow-500/30 font-black italic">
                <Zap className="w-4 h-4 fill-current" /> {credits}
              </div>
              {user ? (
                <div className="flex items-center gap-3 bg-white/5 p-2 pr-4 rounded-full border border-white/10">
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                  <button onClick={logout} className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300">LOGOUT</button>
                </div>
              ) : (
                <button onClick={login} className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full font-black text-[10px] tracking-widest hover:bg-blue-400 transition-all">
                  <LogIn className="w-4 h-4" /> LOGIN
                </button>
              )}
            </div>

            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="w-full max-w-md mx-auto space-y-6">
              <div className="text-center mb-8">
                <h1 className="text-6xl font-black tracking-tighter mb-2 italic leading-none">ARTIKEL<br/><span className="text-blue-500">DEFENSE</span></h1>
                <p className="text-white/40 text-sm font-medium tracking-wide uppercase">German Language Combat System</p>
              </div>
              
              {/* Primary Action */}
              <button 
                onClick={() => startGame('STORY')} 
                className="group relative w-full flex flex-col items-center justify-center bg-white text-black py-6 rounded-[32px] font-black hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_50px_rgba(255,255,255,0.15)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-3 text-2xl relative z-10">
                  <Book className="w-7 h-7 fill-current" /> STORY MODE
                </div>
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-50 mt-1 relative z-10">
                  STAGE {unlockedStage} • CHAPTER {Math.floor((unlockedStage - 1) / 5) + 1}
                </span>
              </button>

              {/* Game Modes Grid */}
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => startGame('ENDLESS')} 
                  className="flex flex-col items-start p-5 bg-blue-600/10 border border-blue-500/20 rounded-3xl hover:bg-blue-600/20 transition-all group"
                >
                  <InfinityIcon className="w-6 h-6 text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
                  <span className="font-black text-sm tracking-tight">ENDLESS</span>
                  <span className="text-[8px] opacity-40 uppercase font-bold tracking-widest">High Score</span>
                </button>
                
                <button 
                  onClick={() => startGame('VOCAB')} 
                  className="flex flex-col items-start p-5 bg-green-600/10 border border-green-500/20 rounded-3xl hover:bg-green-600/20 transition-all group"
                >
                  <Zap className="w-6 h-6 text-green-400 mb-3 fill-current group-hover:scale-110 transition-transform" />
                  <span className="font-black text-sm tracking-tight">VOCAB MATCH</span>
                  <span className="text-[8px] opacity-40 uppercase font-bold tracking-widest">Quick Reflex</span>
                </button>

                <button 
                  onClick={() => startGame('PLURAL')} 
                  className="flex flex-col items-start p-5 bg-purple-600/10 border border-purple-500/20 rounded-3xl hover:bg-purple-600/20 transition-all group"
                >
                  <Languages className="w-6 h-6 text-purple-400 mb-3 group-hover:scale-110 transition-transform" />
                  <span className="font-black text-sm tracking-tight">PLURALS</span>
                  <span className="text-[8px] opacity-40 uppercase font-bold tracking-widest">Grammar</span>
                </button>

                <button 
                  onClick={() => startGame('VERBS')} 
                  className="flex flex-col items-start p-5 bg-orange-600/10 border border-orange-500/20 rounded-3xl hover:bg-orange-600/20 transition-all group"
                >
                  <Zap className="w-6 h-6 text-orange-400 mb-3 fill-current group-hover:scale-110 transition-transform" />
                  <span className="font-black text-sm tracking-tight">VERBS</span>
                  <span className="text-[8px] opacity-40 uppercase font-bold tracking-widest">Conjugation</span>
                </button>

                {Object.keys(missedWords).length > 0 && (
                  <button 
                    onClick={() => startGame('REVENGE')} 
                    className="col-span-2 flex items-center gap-4 p-4 bg-red-600/10 border border-red-500/20 rounded-3xl hover:bg-red-600/20 transition-all group"
                  >
                    <div className="w-10 h-10 bg-red-500/20 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                      <RotateCcw className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="text-left">
                      <span className="block font-black text-sm tracking-tight">REVENGE MODE</span>
                      <span className="text-[8px] opacity-40 uppercase font-bold tracking-widest">Master your mistakes</span>
                    </div>
                  </button>
                )}
              </div>

              {/* Utility Bar */}
              <div className="grid grid-cols-4 gap-2">
                <UtilityButton icon={<Zap className="w-5 h-5 fill-current" />} label="SHOP" onClick={() => setShowShop(true)} color="text-yellow-400" />
                <UtilityButton icon={<ImageIcon className="w-5 h-5" />} label="CARDS" onClick={() => setShowCollection(true)} color="text-purple-400" />
                <UtilityButton icon={<Trophy className="w-5 h-5" />} label="TOP 10" onClick={() => setShowLeaderboard(true)} color="text-blue-400" />
                <UtilityButton 
                  icon={<Calendar className="w-5 h-5" />} 
                  label="QUESTS" 
                  onClick={() => setShowQuests(true)} 
                  color="text-green-400" 
                  badge={quests.some(q => !q.completed)}
                />
              </div>

              {/* Bottom Info */}
              <div className="flex items-center justify-center gap-6 pt-4">
                <button onClick={() => setShowWordList(true)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
                  <BookOpen className="w-4 h-4" /> WORD LIST
                </button>
                <div className="w-1 h-1 bg-white/10 rounded-full" />
                <button onClick={() => setShowStats(true)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
                  <BarChart3 className="w-4 h-4" /> STATISTICS
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div key="gameover-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-950/90 backdrop-blur-2xl p-8 text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <h2 className="text-7xl font-black tracking-tighter mb-4">GAME OVER</h2>
              
              {gameMode === 'STORY' && lastError && (
                <div className="mb-8 p-6 bg-black/40 rounded-2xl border border-white/10">
                  <p className="text-white/40 uppercase tracking-widest text-xs mb-2">Correct Article for</p>
                  <p className="text-4xl font-black mb-2">{lastError.word}</p>
                  <p className={`text-2xl font-black uppercase px-4 py-1 rounded-lg inline-block ${
                    lastError.correct === 'der' ? 'bg-blue-600' : 
                    lastError.correct === 'die' ? 'bg-red-600' : 'bg-green-600'
                  }`}>
                    {lastError.correct}
                  </p>
                </div>
              )}

              {gameMode === 'PLURAL' && lastError && (
                <div className="mb-8 p-6 bg-black/40 rounded-2xl border border-white/10">
                  <p className="text-white/40 uppercase tracking-widest text-xs mb-2">Plural Form of {lastError.word}</p>
                  <p className="text-4xl font-black mb-2 text-purple-400">
                    {WORDS.find(w => w.word === lastError.word)?.plural}
                  </p>
                  <p className="text-sm text-white/40 uppercase tracking-widest">Ending: -{lastError.correct.toUpperCase()}</p>
                </div>
              )}

              {gameMode === 'VERBS' && lastError && (
                <div className="mb-8 p-6 bg-black/40 rounded-2xl border border-white/10">
                  <p className="text-white/40 uppercase tracking-widest text-xs mb-2">Correct Conjugation</p>
                  <p className="text-4xl font-black mb-2 text-orange-400">{lastError.word}{lastError.correct}</p>
                  <p className="text-sm text-white/40 uppercase tracking-widest">Ending: -{lastError.correct.toUpperCase()}</p>
                </div>
              )}

              {(gameMode === 'VOCAB' || gameMode === 'REVENGE') && lastError && (
                <div className="mb-8 p-6 bg-black/40 rounded-2xl border border-white/10">
                  <p className="text-white/40 uppercase tracking-widest text-xs mb-2">Meaning of</p>
                  <p className="text-4xl font-black mb-2">{lastError.word}</p>
                  <p className="text-2xl font-black text-green-400 uppercase">{lastError.correct}</p>
                </div>
              )}

              <div className="flex flex-col gap-1 mb-12">
                <span className="text-white/40 uppercase tracking-widest text-xs">Final Score</span>
                <span className="text-8xl font-black">{score}</span>
              </div>
              
              <button onClick={() => startGame(gameMode)} className="flex items-center gap-3 bg-white text-black px-12 py-5 rounded-2xl font-black text-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)]">
                <RotateCcw className="w-8 h-8" /> TRY AGAIN
              </button>
              <button onClick={() => setGameState('START')} className="mt-4 text-white/40 uppercase tracking-widest text-xs hover:text-white transition-colors">Back to Menu</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-0 pointer-events-none z-40 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20" />
    </div>
  );
}

function ControlButton({ label, color, shadow, onClick, compact }: { label: string, color: string, shadow: string, onClick: () => void, key?: any, compact?: boolean }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.05, brightness: 1.2 }}
      whileTap={{ scale: 0.95 }} 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick} 
      className={`${color} ${shadow} ${compact ? 'h-14 text-xl' : 'h-24 text-3xl'} rounded-2xl flex items-center justify-center font-black tracking-tighter border-t border-white/30 active:brightness-125 transition-all px-4 text-center relative overflow-hidden group`}
    >
      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      <span className="relative z-10">{label}</span>
    </motion.button>
  );
}

function UtilityButton({ icon, label, onClick, color, badge }: { icon: ReactNode, label: string, onClick: () => void, color: string, badge?: boolean }) {
  return (
    <motion.button 
      whileHover={{ y: -5, backgroundColor: 'rgba(255,255,255,0.1)' }}
      whileTap={{ scale: 0.9 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick} 
      className="flex flex-col items-center justify-center gap-1 p-3 bg-white/5 border border-white/10 rounded-2xl transition-all relative group"
    >
      <div className={`${color} group-hover:scale-110 transition-transform`}>{icon}</div>
      <span className="text-[8px] font-black tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">{label}</span>
      {badge && (
        <motion.span 
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-black" 
        />
      )}
    </motion.button>
  );
}
