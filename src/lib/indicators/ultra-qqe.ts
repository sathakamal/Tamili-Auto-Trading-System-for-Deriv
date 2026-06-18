
import { type OHLC } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface UltraQQESettings {
    rsiPeriod: number;
    smoothingFactor: number;
    fastAtrMultiplier: number;
    slowAtrMultiplier: number;
}

export interface UltraQQEArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface UltraQQEResult {
    rsiLine: { time: number; value: number }[];
    fastAtrLine: { time: number; value: number }[];
    slowAtrLine: { time: number; value: number }[];
    arrows: UltraQQEArrow[];
}


// --- Helper Functions ---

const rsi = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);

    const result: (number | undefined)[] = new Array(period).fill(undefined);
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) {
            avgGain += change;
        } else {
            avgLoss -= change;
        }
    }
    avgGain /= period;
    avgLoss /= period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[period] = 100 - (100 / (1 + rs));

    for (let i = period + 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        let gain = change > 0 ? change : 0;
        let loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
    }
    return result;
};


const ema = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    const result: (number | undefined)[] = [];
    const multiplier = 2 / (period + 1);
    let prevEma: number | undefined = undefined;

    for (let i = 0; i < data.length; i++) {
        const currentValue = data[i];
        if (currentValue === undefined) {
            result.push(undefined);
        } else {
            if (prevEma === undefined) {
                // Find first valid value to start
                let sum = 0;
                let count = 0;
                for(let j = i; j >= 0; j--) {
                    if (data[j] !== undefined) {
                        sum += data[j]!;
                        count++;
                    }
                    if(count === period) break;
                }
                prevEma = count > 0 ? sum/count : currentValue;
            } else {
                prevEma = (currentValue - prevEma) * multiplier + prevEma;
            }
            result.push(prevEma);
        }
    }
    return result;
};

// Smoothed Moving Average (equivalent to Pine Script's WiMA)
const smma = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    const result: (number | undefined)[] = [];
    let prevSmma: number | undefined = undefined;
    
    for (let i = 0; i < data.length; i++) {
        const currentValue = data[i];
        if (currentValue === undefined) {
             result.push(undefined);
        } else {
            if (prevSmma === undefined) {
                let sum = 0;
                let count = 0;
                // Find first valid data to start sum
                for (let j = 0; j <= i; j++) {
                    if (data[j] !== undefined) {
                        sum += data[j]!;
                        count++;
                    }
                }
                if (count > 0) {
                   prevSmma = sum / count;
                }
            } else {
                prevSmma = (prevSmma * (period - 1) + currentValue) / period;
            }
             result.push(prevSmma);
        }
    }
    return result;
};


// --- Main QQE Calculation ---
export function calculateUltraQQE(
    ohlc: OHLC[],
    settings: UltraQQESettings
): UltraQQEResult {
    const { rsiPeriod, smoothingFactor, fastAtrMultiplier, slowAtrMultiplier } = settings;
    const closePrices = ohlc.map(d => d.close);
    
    if (closePrices.length < rsiPeriod) {
        return { rsiLine: [], fastAtrLine: [], slowAtrLine: [], arrows: [] };
    }

    // RSIndex= ema(rsi(close,RSI), SF)
    const rsiValues = rsi(closePrices, rsiPeriod);
    const rsIndex = ema(rsiValues, smoothingFactor);

    // AtrRsi= WiMA(TR, 14), where TR is abs(RSIndex - RSIndex[1])
    const rsiTrueRange: (number | undefined)[] = [undefined];
    for (let i = 1; i < rsIndex.length; i++) {
        if(rsIndex[i] !== undefined && rsIndex[i - 1] !== undefined) {
           rsiTrueRange.push(Math.abs(rsIndex[i]! - rsIndex[i - 1]!));
        } else {
           rsiTrueRange.push(undefined);
        }
    }
    const atrRsi = smma(rsiTrueRange, 14);

    // SmoothedAtrRsi= WiMA(AtrRsi, 14)
    const smoothedAtrRsi = smma(atrRsi, 14);

    // --- Bands and Trend Calculation ---
    const fastAtrRsiTl: (number | undefined)[] = [];
    const slowAtrRsiTl: (number | undefined)[] = [];
    const arrows: UltraQQEArrow[] = [];
    
    let longband: number | undefined;
    let shortband: number | undefined;
    let trend: number = 1;
    
    let longband1: number | undefined;
    let shortband1: number | undefined;
    let trend1: number = 1;

    for (let i = 0; i < ohlc.length; i++) {
        const rsiVal = rsIndex[i];
        const prevRsiVal = rsIndex[i-1];
        const smoothedAtr = smoothedAtrRsi[i];
        
        const prevLongband = longband;
        const prevShortband = shortband;
        const prevTrend = trend;
        
        const prevLongband1 = longband1;
        const prevShortband1 = shortband1;
        const prevTrend1 = trend1;


        if (rsiVal === undefined || smoothedAtr === undefined) {
            fastAtrRsiTl.push(undefined);
            slowAtrRsiTl.push(undefined);
            continue;
        }

        // --- Fast ATR Trend Line ---
        const deltaFast = smoothedAtr * fastAtrMultiplier;
        const newshortband = rsiVal + deltaFast;
        const newlongband = rsiVal - deltaFast;
        
        longband = (prevRsiVal !== undefined && prevLongband !== undefined && rsiVal > prevLongband && prevRsiVal > prevLongband)
            ? Math.max(prevLongband, newlongband)
            : newlongband;

        shortband = (prevRsiVal !== undefined && prevShortband !== undefined && rsiVal < prevShortband && prevRsiVal < prevShortband)
            ? Math.min(prevShortband, newshortband)
            : newshortband;
        
        if (prevRsiVal !== undefined && prevShortband !== undefined && rsiVal > prevShortband && prevRsiVal <= prevShortband) { // Crossover
            trend = 1;
        } else if (prevRsiVal !== undefined && prevLongband !== undefined && rsiVal < prevLongband && prevRsiVal >= prevLongband) { // Crossunder
            trend = -1;
        } else {
            trend = prevTrend;
        }

        const currentFastAtrTl = trend === 1 ? longband : shortband;
        fastAtrRsiTl.push(currentFastAtrTl);

        // --- Slow ATR Trend Line ---
        const deltaSlow = smoothedAtr * slowAtrMultiplier;
        const newshortband1 = rsiVal + deltaSlow;
        const newlongband1 = rsiVal - deltaSlow;
        
        longband1 = (prevRsiVal !== undefined && prevLongband1 !== undefined && rsiVal > prevLongband1 && prevRsiVal > prevLongband1)
            ? Math.max(prevLongband1, newlongband1)
            : newlongband1;

        shortband1 = (prevRsiVal !== undefined && prevShortband1 !== undefined && rsiVal < prevShortband1 && prevRsiVal < prevShortband1)
            ? Math.min(prevShortband1, newshortband1)
            : newshortband1;

        if (prevRsiVal !== undefined && prevShortband1 !== undefined && rsiVal > prevShortband1 && prevRsiVal <= prevShortband1) {
            trend1 = 1;
        } else if (prevRsiVal !== undefined && prevLongband1 !== undefined && rsiVal < prevLongband1 && prevRsiVal >= prevLongband1) {
            trend1 = -1;
        } else {
            trend1 = prevTrend1;
        }

        const currentSlowAtrTl = trend1 === 1 ? longband1 : shortband1;
        slowAtrRsiTl.push(currentSlowAtrTl);

        // --- Arrow Logic (RSIndex crossing Fast ATR TL) ---
        const prevFastAtrTl = fastAtrRsiTl[i-1];
        if (prevRsiVal !== undefined && prevFastAtrTl !== undefined) {
             if (rsiVal > prevFastAtrTl && prevRsiVal <= prevFastAtrTl) { // Crossover up
                 arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: 'QQE Buy' });
             }
             if (rsiVal < prevFastAtrTl && prevRsiVal >= prevFastAtrTl) { // Crossover down
                 arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: 'QQE Sell' });
             }
        }
    }
    
    const rsiLine = rsIndex.map((value, i) => ({ time: ohlc[i].time, value })).filter(d => d.value !== undefined) as {time: number, value: number}[];
    const fastAtrLine = fastAtrRsiTl.map((value, i) => ({ time: ohlc[i].time, value })).filter(d => d.value !== undefined) as {time: number, value: number}[];
    const slowAtrLine = slowAtrRsiTl.map((value, i) => ({ time: ohlc[i].time, value })).filter(d => d.value !== undefined) as {time: number, value: number}[];

    return { rsiLine, fastAtrLine, slowAtrLine, arrows };
}
