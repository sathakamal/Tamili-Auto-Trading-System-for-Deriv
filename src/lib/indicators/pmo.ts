import { type Candle, type Arrow, type PmoStrategy } from '@/lib/types';

// --- Type Definitions ---
export interface PmoSettings {
    length1: number;
    length2: number;
    sigLength: number;
    strategy: PmoStrategy;
}

export interface PmoResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number; // The main PMO line value
    arrows: Arrow[];
}

// --- Helper: Custom Smoothing Function (calc_csf from original code) ---
const customSmooth = (data: number[], length: number): (number | undefined)[] => {
    if (length <= 1) return data;
    const sm = 2.0 / length;
    const result: (number | undefined)[] = [];
    let prevCsf: number | undefined = undefined;

    for (let i = 0; i < data.length; i++) {
        const src = data[i];
        if (prevCsf === undefined) {
            prevCsf = src;
        } else {
            prevCsf = (src - prevCsf) * sm + prevCsf;
        }
        result.push(prevCsf);
    }
    return result;
};


// --- Helper: Standard EMA ---
const ema = (data: (number|undefined)[], period: number): (number | undefined)[] => {
    if (period <= 1) return data;
    
    const result: (number|undefined)[] = [];
    const multiplier = 2 / (period + 1);
    let prevEma: number | undefined = undefined;

    for (let i = 0; i < data.length; i++) {
        const currentValue = data[i];
        if (currentValue === undefined) {
            result.push(prevEma);
            continue;
        }
        
        if (prevEma === undefined) {
            prevEma = currentValue;
        } else {
            prevEma = (currentValue - prevEma) * multiplier + prevEma;
        }
        result.push(prevEma);
    }
    return result;
};


// --- Main PMO Calculation ---
export function calculatePMO(
    ohlc: Candle[],
    settings: PmoSettings
): PmoResult {
    const { length1, length2, sigLength, strategy } = settings;
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const arrows: Arrow[] = [];

    if (strategy === 'disabled' || ohlc.length < Math.max(length1, length2, sigLength) + 2) {
        return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }

    // 1. Calculate Rate of Change (ROC)
    const roc: number[] = [0]; // First value has no ROC
    for (let i = 1; i < ohlc.length; i++) {
        const prevClose = ohlc[i - 1].close;
        const rocValue = (prevClose > 0) ? (ohlc[i].close / prevClose) * 100 : 100;
        roc.push(rocValue);
    }
    
    // 2. First Smoothing
    const pmoL2 = customSmooth(roc.map(r => r - 100), length1);

    // 3. Second Smoothing (and scaling)
    const pmoL = customSmooth(pmoL2.map(p => p !== undefined ? p * 10 : 0), length2);

    // 4. Signal Line
    const pmoS = ema(pmoL, sigLength);

    // --- Signal Logic ---
    const latestIndex = ohlc.length - 1;
    const prevIndex = latestIndex - 1;
    if (latestIndex < 1) return { signal, value: 0, arrows };
    
    const pmoVal = pmoL[latestIndex];
    const prevPmoVal = pmoL[prevIndex];
    const signalVal = pmoS[latestIndex];
    const prevSignalVal = pmoS[prevIndex];
    
    const latestCandle = ohlc[latestIndex];
    
    if (strategy === 'signal-cross') {
        if (pmoVal !== undefined && prevPmoVal !== undefined && signalVal !== undefined && prevSignalVal !== undefined) {
            // Buy signal: PMO crosses above Signal line
            if (pmoVal > signalVal && prevPmoVal <= prevSignalVal) {
                signal = 'BULLISH';
                arrows.push({ time: latestCandle.epoch, price: latestCandle.low, direction: 'up', type: 'crossover', tooltip: 'PMO Cross Up' });
            }
            // Sell signal: PMO crosses below Signal line
            if (pmoVal < signalVal && prevPmoVal >= prevSignalVal) {
                signal = 'BEARISH';
                arrows.push({ time: latestCandle.epoch, price: latestCandle.high, direction: 'down', type: 'crossover', tooltip: 'PMO Cross Down' });
            }
        }
    } else if (strategy === 'zero-cross') {
        if (pmoVal !== undefined && prevPmoVal !== undefined) {
            // Buy signal: PMO crosses above Zero line
            if (pmoVal > 0 && prevPmoVal <= 0) {
                signal = 'BULLISH';
                arrows.push({ time: latestCandle.epoch, price: latestCandle.low, direction: 'up', type: 'crossover', tooltip: 'PMO Zero Cross Up' });
            }
            // Sell signal: PMO crosses below Zero line
            if (pmoVal < 0 && prevPmoVal >= 0) {
                signal = 'BEARISH';
                arrows.push({ time: latestCandle.epoch, price: latestCandle.high, direction: 'down', type: 'crossover', tooltip: 'PMO Zero Cross Down' });
            }
        }
    }

    return { signal, value: pmoVal || 0, arrows };
}
