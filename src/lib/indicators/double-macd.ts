

import { type OHLC, type LineData } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface DoubleMACDSettings {
    fastMACD: { fastLen: number; slowLen: number; };
    slowMACD: { fastLen: number; slowLen: number; };
    useSmoothing: boolean;
    smoothingPeriod: number;
}

export interface DoubleMACDArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface DoubleMACDResult {
    fastMACDLine: LineData[];
    slowMACDLine: LineData[];
    arrows: DoubleMACDArrow[];
}


// --- Helper: Exponential Moving Average ---
const ema = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    const multiplier = 2 / (period + 1);

    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    result.push(ema);

    for (let i = period; i < data.length; i++) {
        ema = (data[i] - ema) * multiplier + ema;
        result.push(ema);
    }
    return result;
};

// --- Helper: Simple Moving Average for smoothing ---
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


// --- Helper: Calculate a single MACD line ---
const calculateMACDLine = (closePrices: number[], fastLen: number, slowLen: number): (number | undefined)[] => {
    if (closePrices.length < slowLen) return [];

    const fastMA = ema(closePrices, fastLen);
    const slowMA = ema(closePrices, slowLen);

    const macdLine: (number | undefined)[] = [];
    for (let i = 0; i < closePrices.length; i++) {
        if (fastMA[i] !== undefined && slowMA[i] !== undefined) {
            macdLine.push(fastMA[i]! - slowMA[i]!);
        } else {
            macdLine.push(undefined);
        }
    }
    return macdLine;
};


// --- Main Double MACD Calculation ---
export function calculateDoubleMACD(
    ohlc: OHLC[],
    settings: DoubleMACDSettings
): DoubleMACDResult {
    const { fastMACD, slowMACD, useSmoothing, smoothingPeriod } = settings;
    const closePrices = ohlc.map(d => d.close);
    
    const maxLen = Math.max(fastMACD.slowLen, slowMACD.slowLen);
    if (closePrices.length < maxLen) {
        return { fastMACDLine: [], slowMACDLine: [], arrows: [] };
    }

    // 1. Calculate the two raw MACD lines
    let fastMACDValues = calculateMACDLine(closePrices, fastMACD.fastLen, fastMACD.slowLen);
    let slowMACDValues = calculateMACDLine(closePrices, slowMACD.fastLen, slowMACD.slowLen);

    // 2. Optionally apply smoothing
    if (useSmoothing) {
        fastMACDValues = sma(fastMACDValues, smoothingPeriod);
        slowMACDValues = sma(slowMACDValues, smoothingPeriod);
    }

    // 3. Initialize result arrays
    const fastMACDLine: LineData[] = [];
    const slowMACDLine: LineData[] = [];
    const arrows: DoubleMACDArrow[] = [];

    // 4. Loop through data to generate signals and format output
    for (let i = 1; i < ohlc.length; i++) {
        const time = ohlc[i].time;
        const fastVal = fastMACDValues[i];
        const slowVal = slowMACDValues[i];
        
        const prevFastVal = fastMACDValues[i-1];
        const prevSlowVal = slowMACDValues[i-1];

        // Format lines for charting
        if (time !== undefined && fastVal !== undefined) {
            fastMACDLine.push({ time, value: fastVal });
        }
        if (time !== undefined && slowVal !== undefined) {
            slowMACDLine.push({ time, value: slowVal });
        }

        // Arrow Logic based on user's specified strategy
        if (fastVal !== undefined && slowVal !== undefined && prevFastVal !== undefined && prevSlowVal !== undefined) {
            // Buy Signal: Fast crosses over Slow
            if (prevFastVal <= prevSlowVal && fastVal > slowVal) {
                 arrows.push({ 
                    time: ohlc[i].time, 
                    price: ohlc[i].low, 
                    type: 'buy', 
                    text: 'Double MACD Buy' 
                });
            }
            
            // Sell Signal: Fast crosses under Slow
            if (prevFastVal >= prevSlowVal && fastVal < slowVal) {
                 arrows.push({ 
                    time: ohlc[i].time, 
                    price: ohlc[i].high, 
                    type: 'sell', 
                    text: 'Double MACD Sell' 
                });
            }
        }
    }

    return { fastMACDLine, slowMACDLine, arrows };
}
