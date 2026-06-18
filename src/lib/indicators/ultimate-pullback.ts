
import { type Candle, type Arrow } from '@/lib/types';

// --- Type Definitions ---
export interface UltimatePullbackSettings {
    emaFastPeriod: number;
    emaSlowPeriod: number;
    rsiPeriod: number;
    rsiUpper: number;
    rsiLower: number;
    scoreThreshold: number;
}

export interface UltimatePullbackResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number; // The score
    arrows: Arrow[];
}


// --- Helper Functions ---

const ema = (candles: Candle[], period: number): number | null => {
    if (candles.length < period) return null;
    const closePrices = candles.map(c => c.close);
    const multiplier = 2 / (period + 1);
    
    let emaValue = closePrices.slice(0, period).reduce((a, b) => a + b, 0) / period; // Start with SMA

    for (let i = period; i < closePrices.length; i++) {
        emaValue = (closePrices[i] - emaValue) * multiplier + emaValue;
    }
    return emaValue;
};

const calculateRsi = (candles: Candle[], period: number): number => {
    if (candles.length < period + 1) return 50;
    
    const closePrices = candles.map(c => c.close);
    let gains = 0;
    let losses = 0;

    for (let i = closePrices.length - period; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i-1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

const isFormingHigherLows = (candles: Candle[]): boolean => {
    if (candles.length < 20) return false;
    const prices = candles.slice(-20);
    
    const lows: number[] = [];
    for (let i = 2; i < prices.length - 2; i++) {
        if (prices[i].low < prices[i-1].low && prices[i].low < prices[i-2].low &&
            prices[i].low < prices[i+1].low && prices[i].low < prices[i+2].low) {
            lows.push(prices[i].low);
        }
    }
    
    return lows.length >= 2 && lows[lows.length - 1] > lows[lows.length - 2];
};

const isFormingLowerHighs = (candles: Candle[]): boolean => {
    if (candles.length < 20) return false;
    const prices = candles.slice(-20);
    
    const highs: number[] = [];
    for (let i = 2; i < prices.length - 2; i++) {
        if (prices[i].high > prices[i-1].high && prices[i].high > prices[i-2].high &&
            prices[i].high > prices[i+1].high && prices[i].high > prices[i+2].high) {
            highs.push(prices[i].high);
        }
    }
    
    return highs.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2];
};


// --- Main Indicator Calculation ---
export function calculateUltimatePullback(
    ohlc: Candle[],
    settings: UltimatePullbackSettings
): UltimatePullbackResult {
    const { emaFastPeriod, emaSlowPeriod, rsiPeriod, rsiUpper, rsiLower, scoreThreshold } = settings;
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let score = 0;
    const arrows: Arrow[] = [];

    const requiredBars = Math.max(emaSlowPeriod, rsiPeriod) + 2;
    if (ohlc.length < requiredBars) {
        return { signal, value: 0, arrows };
    }
    
    const latestCandle = ohlc[ohlc.length - 1];
    const prevCandle = ohlc[ohlc.length - 2];

    const emaFast = ema(ohlc, emaFastPeriod);
    const emaSlow = ema(ohlc, emaSlowPeriod);
    const rsi = calculateRsi(ohlc, rsiPeriod);

    if (emaFast === null || emaSlow === null) {
        return { signal, value: 0, arrows };
    }

    // UPTREND LOGIC
    if (latestCandle.close > emaSlow && emaFast > emaSlow) {
        let bullishScore = 0;
        if (rsi <= rsiLower) { bullishScore += 30; }
        if (rsi <= rsiLower - 10) { bullishScore += 20; } // Deep pullback
        if (latestCandle.close <= emaFast * 1.003) { bullishScore += 25; }
        if (latestCandle.close > prevCandle.close) { bullishScore += 20; }
        if (isFormingHigherLows(ohlc)) { bullishScore += 15; }
        
        const last10 = ohlc.slice(-10);
        if (latestCandle.close === Math.min(...last10.map(c => c.close))) {
            bullishScore += 10;
        }

        if (bullishScore >= scoreThreshold) {
            signal = 'BULLISH';
            score = bullishScore;
            arrows.push({
                time: latestCandle.epoch,
                price: latestCandle.low,
                direction: 'up',
                type: 'crossover',
                tooltip: `UPB: ${score}%`
            });
        }
    }
    // DOWNTREND LOGIC
    else if (latestCandle.close < emaSlow && emaFast < emaSlow) {
        let bearishScore = 0;
        if (rsi >= rsiUpper) { bearishScore += 30; }
        if (rsi >= rsiUpper + 10) { bearishScore += 20; } // Strong bounce
        if (latestCandle.close >= emaFast * 0.997) { bearishScore += 25; }
        if (latestCandle.close < prevCandle.close) { bearishScore += 20; }
        if (isFormingLowerHighs(ohlc)) { bearishScore += 15; }

        const last10 = ohlc.slice(-10);
        if (latestCandle.close === Math.max(...last10.map(c => c.close))) {
            bearishScore += 10;
        }

        if (bearishScore >= scoreThreshold) {
            signal = 'BEARISH';
            score = bearishScore;
            arrows.push({
                time: latestCandle.epoch,
                price: latestCandle.high,
                direction: 'down',
                type: 'crossover',
                tooltip: `UPB: ${score}%`
            });
        }
    }

    return { signal, value: score, arrows };
}
