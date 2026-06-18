import { type Candle, type OneTwoThreeStrategy } from '@/lib/types';

export interface ReversalSignal {
    time: number;
    price: number;
    type: 'buy' | 'sell';
}

/**
 * Identifies 1-2-3 trend reversal patterns based on the selected strategy.
 * @param ohlc The candle history.
 * @param strategy The reversal strategy to use ('classic', 'aggressive', '2b').
 * @returns A reversal signal if a pattern completes on the latest candle, otherwise null.
 */
export function calculateOneTwoThreeReversal(ohlc: Candle[], strategy: OneTwoThreeStrategy): ReversalSignal | null {
    switch (strategy) {
        case 'classic':
            return classicStrategy(ohlc);
        case 'aggressive':
            return aggressiveStrategy(ohlc);
        case '2b':
            return twoBStrategy(ohlc);
        default:
            return null;
    }
}

// --- Classic (Confirmation) Strategy ---
function classicStrategy(ohlc: Candle[]): ReversalSignal | null {
    if (ohlc.length < 20) return null; // Need enough history to find pivots

    const latestCandle = ohlc[ohlc.length - 1];
    const history = ohlc.slice(0, ohlc.length - 1);

    // --- Look for a Bullish Reversal (Buy Signal) ---
    const [p1_buy, p2_buy] = findClassicPivots(history, 'down');
    if (p1_buy && p2_buy) {
        // Point 3 is the breakout: latest candle closes above Point 2's high
        if (latestCandle.close > p2_buy.high) {
            return { time: latestCandle.epoch, price: latestCandle.close, type: 'buy' };
        }
    }

    // --- Look for a Bearish Reversal (Sell Signal) ---
    const [p1_sell, p2_sell] = findClassicPivots(history, 'up');
    if (p1_sell && p2_sell) {
        // Point 3 is the breakout: latest candle closes below Point 2's low
        if (latestCandle.close < p2_sell.low) {
            return { time: latestCandle.epoch, price: latestCandle.close, type: 'sell' };
        }
    }

    return null;
}

// --- Aggressive (Anticipation) Strategy ---
function aggressiveStrategy(ohlc: Candle[]): ReversalSignal | null {
    if (ohlc.length < 10) return null; // Shorter lookback might be ok here

    const latestCandle = ohlc[ohlc.length - 1];
    const prevCandle = ohlc[ohlc.length - 2];
    const history = ohlc.slice(0, ohlc.length - 2);

    // Look for a turn at Point 3
    
    // Bullish (Buy) - looking for a higher low to form
    const [p1_buy] = findClassicPivots(history, 'down');
    if (p1_buy && latestCandle.low > p1_buy.low && latestCandle.close > prevCandle.close && prevCandle.low <= latestCandle.low) {
         return { time: latestCandle.epoch, price: latestCandle.close, type: 'buy' };
    }

    // Bearish (Sell) - looking for a lower high to form
    const [p1_sell] = findClassicPivots(history, 'up');
    if (p1_sell && latestCandle.high < p1_sell.high && latestCandle.close < prevCandle.close && prevCandle.high >= latestCandle.high) {
         return { time: latestCandle.epoch, price: latestCandle.close, type: 'sell' };
    }

    return null;
}


// --- 2B (Failed Breakout) Strategy ---
function twoBStrategy(ohlc: Candle[]): ReversalSignal | null {
    if (ohlc.length < 10) return null;

    const latestCandle = ohlc[ohlc.length - 1];
    const history = ohlc.slice(0, ohlc.length - 1);

    // Find the most recent significant low/high in the history
    let pivotLow: Candle | null = null;
    let pivotHigh: Candle | null = null;

    for (const candle of history) {
        if (!pivotLow || candle.low < pivotLow.low) pivotLow = candle;
        if (!pivotHigh || candle.high > pivotHigh.high) pivotHigh = candle;
    }

    // 2B Buy Signal (Failed Breakout below a low)
    if (pivotLow && latestCandle.low < pivotLow.low && latestCandle.close > pivotLow.low) {
        return { time: latestCandle.epoch, price: latestCandle.close, type: 'buy' };
    }
    
    // 2B Sell Signal (Failed Breakout above a high)
    if (pivotHigh && latestCandle.high > pivotHigh.high && latestCandle.close < pivotHigh.high) {
        return { time: latestCandle.epoch, price: latestCandle.close, type: 'sell' };
    }
    
    return null;
}


function findClassicPivots(ohlc: Candle[], trend: 'up' | 'down'): [Candle, Candle] | [null, null] {
    const lookbackPeriod = 20;
    const relevantHistory = ohlc.slice(-lookbackPeriod);

    if (relevantHistory.length < 5) return [null, null];

    if (trend === 'up') { // Find pivots for a BEARISH reversal (sell setup)
        // Find Point 1: The absolute highest high in the lookback period.
        let p1: Candle | null = null;
        let p1_index = -1;
        
        relevantHistory.forEach((candle, index) => {
            // Use >= to favor the most recent high in case of duplicates
            if (!p1 || candle.high >= p1.high) {
                p1 = candle;
                p1_index = index;
            }
        });

        if (!p1 || p1_index < 1) return [null, null];

        // Find Point 2: The lowest low *after* Point 1. This is the pullback.
        let p2: Candle | null = null;
        for (let i = p1_index + 1; i < relevantHistory.length; i++) {
            if (!p2 || relevantHistory[i].low < p2.low) {
                p2 = relevantHistory[i];
            }
        }
        
        // Sanity check: p2 must exist and must be lower than p1
        if (p2 && p1 && p2.low < p1.high) {
            return [p1, p2];
        }

    } else { // Find pivots for a BULLISH reversal (buy setup)
        // Find Point 1: The absolute lowest low in the lookback period.
        let p1: Candle | null = null;
        let p1_index = -1;

        relevantHistory.forEach((candle, index) => {
            // Use <= to favor the most recent low in case of duplicates
            if (!p1 || candle.low <= p1.low) {
                p1 = candle;
                p1_index = index;
            }
        });

        if (!p1 || p1_index < 1) return [null, null];

        // Find Point 2: The highest high *after* Point 1. This is the pullback.
        let p2: Candle | null = null;
        for (let i = p1_index + 1; i < relevantHistory.length; i++) {
            if (!p2 || relevantHistory[i].high > p2.high) {
                p2 = relevantHistory[i];
            }
        }

        // Sanity check: p2 must exist and must be higher than p1
        if (p2 && p1 && p2.high > p1.low) {
            return [p1, p2];
        }
    }

    return [null, null];
}
