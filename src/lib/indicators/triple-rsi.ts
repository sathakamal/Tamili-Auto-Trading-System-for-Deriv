

import { type OHLC, type LineData } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface TripleRsiSettings {
    rsiPeriod1: number;
    rsiPeriod2: number;
    rsiPeriod3: number;
    useRsiLevel50: boolean;
    useSmoothing: boolean;
    smoothingPeriod: number;
}

export interface TripleRsiArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface TripleRsiResult {
    rsiLine1: LineData[];
    rsiLine2: LineData[];
    rsiLine3: LineData[];
    arrows: TripleRsiArrow[];
}

// --- Helper: Standard RSI Calculation ---
const calculateRSI = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) {
        return new Array(data.length).fill(undefined);
    }

    const result: (number | undefined)[] = new Array(period).fill(undefined);
    let avgGain = 0;
    let avgLoss = 0;

    // Calculate initial average gain and loss
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
    result.push(100 - (100 / (1 + rs)));

    // Calculate subsequent RSI values
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
    }
    
    // Ensure result array has same length as input data
    while (result.length < data.length) {
        result.unshift(undefined);
    }
    
    return result;
};

// Simple Moving Average for smoothing
const sma = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    if (period <= 1) return data;

    const result: (number | undefined)[] = [];
    const validData = data.map((d, i) => (d !== undefined ? { value: d, index: i } : null)).filter(Boolean) as { value: number; index: number }[];
    
    if (validData.length < period) {
        return new Array(data.length).fill(undefined);
    }

    const smaResults: { [index: number]: number } = {};
    
    let sum = 0;
    for(let i=0; i<period; i++) {
        sum += validData[i].value;
    }
    smaResults[validData[period-1].index] = sum / period;

    for (let i = period; i < validData.length; i++) {
        sum = sum - validData[i-period].value + validData[i].value;
        smaResults[validData[i].index] = sum / period;
    }

    for (let i = 0; i < data.length; i++) {
        result.push(smaResults[i]);
    }

    return result;
};


// --- Main Triple RSI Calculation ---
export function calculateTripleRsi(
    ohlc: OHLC[],
    settings: TripleRsiSettings
): TripleRsiResult {
    const { rsiPeriod1, rsiPeriod2, rsiPeriod3, useRsiLevel50, useSmoothing, smoothingPeriod } = settings;
    const closePrices = ohlc.map(d => d.close);
    
    const maxPeriod = Math.max(rsiPeriod1, rsiPeriod2, rsiPeriod3);
    if (ohlc.length < maxPeriod + 1) { // Need one extra for comparison
        return { rsiLine1: [], rsiLine2: [], rsiLine3: [], arrows: [] };
    }

    // 1. Calculate the three RSI lines
    let rsi1 = calculateRSI(closePrices, rsiPeriod1);
    let rsi2 = calculateRSI(closePrices, rsiPeriod2);
    let rsi3 = calculateRSI(closePrices, rsiPeriod3);

    // 2. Optionally smooth the RSI lines
    if (useSmoothing && smoothingPeriod > 1) {
        rsi1 = sma(rsi1, smoothingPeriod);
        rsi2 = sma(rsi2, smoothingPeriod);
        rsi3 = sma(rsi3, smoothingPeriod);
    }

    // 3. Determine the trend based on RSI relationships
    const trend: (number | undefined)[] = new Array(ohlc.length).fill(0);
    const arrows: TripleRsiArrow[] = [];
    
    for (let i = 1; i < ohlc.length; i++) {
        const r1 = rsi1[i];
        const r2 = rsi2[i];
        const r3 = rsi3[i];

        let currentTrend: number | undefined = undefined;

        if (r1 !== undefined && r2 !== undefined && r3 !== undefined) {
            // Buy condition
            const buyCondition = r1 > r2 && r2 > r3;
            const buyLevelCondition = useRsiLevel50 ? (r1 > 50 && r2 > 50 && r3 > 50) : true;
            if (buyCondition && buyLevelCondition) {
                currentTrend = 1;
            }

            // Sell condition
            const sellCondition = r1 < r2 && r2 < r3;
            const sellLevelCondition = useRsiLevel50 ? (r1 < 50 && r2 < 50 && r3 < 50) : true;
            if (sellCondition && sellLevelCondition) {
                currentTrend = -1;
            }
        }
        
        let prevTrend = trend[i-1];
        if (prevTrend === undefined) {
             for(let j = i - 2; j >= 0; j--) {
                if (trend[j] !== undefined) {
                    prevTrend = trend[j];
                    break;
                }
             }
        }
        if (prevTrend === undefined) prevTrend = 0;

        if (currentTrend === undefined) {
             trend[i] = prevTrend;
        } else {
             trend[i] = currentTrend;
        }


        // 4. Generate arrows on trend change
        if (trend[i] !== prevTrend && trend[i] !== 0) {
            if (trend[i] === 1) {
                arrows.push({
                    time: ohlc[i].time,
                    price: ohlc[i].low,
                    type: 'buy',
                    text: 'Triple RSI Buy'
                });
            } else if (trend[i] === -1) {
                arrows.push({
                    time: ohlc[i].time,
                    price: ohlc[i].high,
                    type: 'sell',
                    text: 'Triple RSI Sell'
                });
            }
        }
    }
    
    // 5. Format results for charting
    const rsiLine1: LineData[] = rsi1.map((value, i) => ({ time: ohlc[i].time as UTCTimestamp, value: value! })).filter(d => d.value !== undefined);
    const rsiLine2: LineData[] = rsi2.map((value, i) => ({ time: ohlc[i].time as UTCTimestamp, value: value! })).filter(d => d.value !== undefined);
    const rsiLine3: LineData[] = rsi3.map((value, i) => ({ time: ohlc[i].time as UTCTimestamp, value: value! })).filter(d => d.value !== undefined);

    return { rsiLine1, rsiLine2, rsiLine3, arrows };
}
