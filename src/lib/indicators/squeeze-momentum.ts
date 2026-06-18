

import { type Candle, type Arrow } from '@/lib/types';

// --- Type Definitions ---
export interface SqueezeMomentumSettings {
    bbLength: number;
    bbMult: number;
    kcLength: number;
    kcMult: number;
}

export interface SqueezeMomentumResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number;
    arrows: Arrow[];
}


// --- Helper Functions ---

const sma = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    let sum = data.slice(0, period).reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
    for (let i = period; i < data.length; i++) {
        sum = sum - data[i - period] + data[i];
        result.push(sum / period);
    }
    return result;
};

const stdev = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = slice.reduce((acc, val) => acc + val, 0) / period;
        const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
        result.push(Math.sqrt(variance));
    }
    return result;
};

const linreg = (data: (number|undefined)[], period: number): (number | undefined)[] => {
    const result: (number | undefined)[] = [];
    for(let i = 0; i < data.length; i++) {
         if (i < period - 1) {
            result.push(undefined);
            continue;
        }

        const y = data.slice(i - period + 1, i + 1).filter(v => v !== undefined) as number[];
        if(y.length < period) {
             result.push(undefined);
             continue;
        }

        let sum_x = 0, sum_y = 0, sum_xy = 0, sum_xx = 0;
        for (let j = 0; j < period; j++) {
            sum_x += j;
            sum_y += y[j];
            sum_xy += j * y[j];
            sum_xx += j * j;
        }
        
        const slope = (period * sum_xy - sum_x * sum_y) / (period * sum_xx - sum_x * sum_x);
        const intercept = (sum_y - slope * sum_x) / period;

        result.push(intercept + slope * (period - 1 - 0));
    }
    return result;
};


// --- Main Squeeze Momentum Calculation ---
export function calculateSqueezeMomentum(
    ohlc: Candle[],
    settings: SqueezeMomentumSettings
): SqueezeMomentumResult {
    const { bbLength, bbMult, kcLength, kcMult } = settings;

    const source = ohlc.map(d => d.close);
    if (source.length < Math.max(bbLength, kcLength)) {
        return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }

    // --- Bollinger Bands ---
    const basis = sma(source, bbLength);
    const dev = stdev(source, bbLength);
    const upperBB = basis.map((val, i) => (val !== undefined && dev[i] !== undefined) ? val + bbMult * dev[i]! : undefined);
    const lowerBB = basis.map((val, i) => (val !== undefined && dev[i] !== undefined) ? val - bbMult * dev[i]! : undefined);
    
    // --- Keltner Channel ---
    const maKC = sma(source, kcLength);
    const rangeKC = ohlc.map((d, i) => i > 0 ? Math.max(d.high - d.low, Math.abs(d.high - ohlc[i - 1].close), Math.abs(d.low - ohlc[i-1].close)) : d.high - d.low);
    const rangema = sma(rangeKC, kcLength);
    const upperKC = maKC.map((val, i) => (val !== undefined && rangema[i] !== undefined) ? val + rangema[i]! * kcMult : undefined);
    const lowerKC = maKC.map((val, i) => (val !== undefined && rangema[i] !== undefined) ? val - rangema[i]! * kcMult : undefined);

    // --- Momentum Calculation ---
    const highestHigh = ohlc.map((_, i) => i < kcLength - 1 ? undefined : Math.max(...ohlc.slice(i-kcLength+1, i+1).map(d => d.high)));
    const lowestLow = ohlc.map((_, i) => i < kcLength - 1 ? undefined : Math.min(...ohlc.slice(i-kcLength+1, i+1).map(d => d.low)));
    const smaClose = sma(source, kcLength);

    const momentumSourceData: (number|undefined)[] = ohlc.map((d, i) => {
        if (highestHigh[i] !== undefined && lowestLow[i] !== undefined && smaClose[i] !== undefined) {
             const avg1 = (highestHigh[i]! + lowestLow[i]!) / 2;
             const avg2 = (avg1 + smaClose[i]!) / 2;
             return d.close - avg2;
        }
        return undefined;
    });
    
    const momentumValues = linreg(momentumSourceData, kcLength);

    // --- Generate Output ---
    const arrows: Arrow[] = [];
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    
    const latestMomentum = momentumValues[momentumValues.length-1];
    const prevMomentum = momentumValues[momentumValues.length-2];
    const latestCandle = ohlc[ohlc.length-1];

    if (latestMomentum !== undefined && prevMomentum !== undefined) {
        // Buy Signal: Crosses from below 0 to above 0
        if (prevMomentum <= 0 && latestMomentum > 0) {
            signal = 'BULLISH';
            arrows.push({ 
                time: latestCandle.epoch, 
                price: latestCandle.low, 
                direction: 'up', 
                type: 'crossover', 
                tooltip: 'Squeeze Buy' 
            });
        }
        // Sell Signal: Crosses from above 0 to below 0
        if (prevMomentum >= 0 && latestMomentum < 0) {
            signal = 'BEARISH';
            arrows.push({ 
                time: latestCandle.epoch, 
                price: latestCandle.high, 
                direction: 'down', 
                type: 'crossover', 
                tooltip: 'Squeeze Sell' 
            });
        }
    }
    
    return { signal, value: latestMomentum || 0, arrows };
}
