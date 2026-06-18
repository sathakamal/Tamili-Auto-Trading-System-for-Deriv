
import { type Candle, type Arrow } from '@/lib/types';

// --- Type Definitions ---
export interface AtrTrailingStopSettings {
    sensitivity: number;
    atrPeriod: number;
}

export interface AtrTrailingStopResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    arrows: Arrow[];
}


const calculateATR = (ohlc: Candle[], period: number): (number | undefined)[] => {
    if (ohlc.length < period) return new Array(ohlc.length).fill(undefined);

    const trValues: (number | undefined)[] = [undefined];
    for (let i = 1; i < ohlc.length; i++) {
        const high = ohlc[i].high;
        const low = ohlc[i].low;
        const prevClose = ohlc[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trValues.push(tr);
    }
    
    const atr: (number | undefined)[] = new Array(period).fill(undefined);
    
    let sum = 0;
    let validTRs = 0;
    for (let i = 1; i <= period; i++) {
        if(trValues[i] !== undefined) {
            sum += trValues[i]!;
            validTRs++;
        }
    }
    
    if (validTRs > 0) {
        atr[period] = sum / validTRs;
    }

    for (let i = period + 1; i < ohlc.length; i++) {
        const currentTR = trValues[i];
        const prevATR = atr[atr.length - 1]; // Use the last calculated ATR
        if (currentTR !== undefined && prevATR !== undefined) {
             atr.push(((prevATR * (period - 1)) + currentTR) / period);
        } else {
             atr.push(prevATR);
        }
    }
    
    while(atr.length < ohlc.length) atr.push(atr[atr.length - 1]);
    
    return atr;
};


// --- Main Indicator Calculation ---
export function calculateAtrTrailingStop(
    ohlc: Candle[],
    settings: AtrTrailingStopSettings
): AtrTrailingStopResult {
    const { sensitivity, atrPeriod } = settings;
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const arrows: Arrow[] = [];

    if (ohlc.length < atrPeriod + 2) {
        return { signal, arrows };
    }

    const src = ohlc.map(c => c.close);
    const atrValues = calculateATR(ohlc, atrPeriod);
    
    const nLoss = atrValues.map(atr => atr !== undefined ? sensitivity * atr : undefined);
    
    const xATRTrailingStop: (number | undefined)[] = [];
    let pos: (number | undefined)[] = [];
    
    for (let i = 0; i < ohlc.length; i++) {
        if (i === 0 || nLoss[i] === undefined) {
            xATRTrailingStop.push(undefined);
            pos.push(0);
            continue;
        }

        const prevStop = xATRTrailingStop[i - 1];
        
        if (prevStop === undefined) {
             xATRTrailingStop.push(src[i] + nLoss[i]!);
             pos.push(0);
             continue;
        }
        
        let currentStop: number;

        if (src[i] > prevStop && src[i - 1] > prevStop) {
            currentStop = Math.max(prevStop, src[i] - nLoss[i]!);
        } else if (src[i] < prevStop && src[i - 1] < prevStop) {
            currentStop = Math.min(prevStop, src[i] + nLoss[i]!);
        } else if (src[i] > prevStop) {
            currentStop = src[i] - nLoss[i]!;
        } else {
            currentStop = src[i] + nLoss[i]!;
        }
        xATRTrailingStop.push(currentStop);

        // Position flip state
        let currentPos = pos[i-1] || 0;
         if (src[i-1] < prevStop && src[i] > prevStop) {
            currentPos = 1;
        } else if (src[i-1] > prevStop && src[i] < prevStop) {
            currentPos = -1;
        }
        pos.push(currentPos);
    }

    // --- Generate final signal from the last bar ---
    const i = ohlc.length - 1;
    const latestSrc = src[i];
    const latestStop = xATRTrailingStop[i];
    const prevSrc = src[i-1];
    const prevStop = xATRTrailingStop[i-1];

    if(latestSrc && latestStop && prevSrc && prevStop) {
        const above = prevSrc <= prevStop && latestSrc > latestStop;
        const below = prevSrc >= prevStop && latestSrc < latestStop;

        const buy = latestSrc > latestStop && above;
        const sell = latestSrc < latestStop && below;
        
        if (buy) {
            signal = 'BULLISH';
            arrows.push({
                time: ohlc[i].epoch,
                price: ohlc[i].low,
                direction: 'up',
                type: 'crossover',
                tooltip: 'ATR Stop Buy'
            });
        } else if (sell) {
            signal = 'BEARISH';
            arrows.push({
                time: ohlc[i].epoch,
                price: ohlc[i].high,
                direction: 'down',
                type: 'crossover',
                tooltip: 'ATR Stop Sell'
            });
        }
    }
    
    return { signal, arrows };
}
