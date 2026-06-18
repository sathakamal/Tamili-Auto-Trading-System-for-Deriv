

import { type OHLC, type LineData } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface RsiIchimokuSettings {
    rsiPeriod: number;
    tenkan: number;
    kijun: number;
    senkou: number;
    useSmoothing: boolean;
    smoothingPeriod: number;
}

export interface RsiIchimokuArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface RsiIchimokuResult {
    tenkanLine: LineData[];
    kijunLine: LineData[];
    spanALine: LineData[];
    spanBLine: LineData[];
    chinkouLine: LineData[];
    arrows: RsiIchimokuArrow[];
}

// --- Helper: RSI Calculation on a specific price type ---
const calculateRSIOnPrice = (prices: number[], period: number): (number | undefined)[] => {
    if (prices.length < period) {
        return new Array(prices.length).fill(undefined);
    }
    const result: (number | undefined)[] = new Array(period).fill(undefined);
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));

    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
    }
    
    while(result.length < prices.length) {
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


// --- Main RSI Ichimoku Calculation ---
export function calculateRsiIchimoku(
    ohlc: OHLC[],
    settings: RsiIchimokuSettings
): RsiIchimokuResult {
    const { rsiPeriod, tenkan, kijun, senkou, useSmoothing, smoothingPeriod } = settings;
    const totalLookback = Math.max(rsiPeriod, tenkan, kijun, senkou);

    if (ohlc.length < totalLookback + rsiPeriod) {
        return { tenkanLine: [], kijunLine: [], spanALine: [], spanBLine: [], chinkouLine: [], arrows: [] };
    }

    // 1. Calculate RSI for High, Low, and Close prices
    const rsiHigh = calculateRSIOnPrice(ohlc.map(d => d.high), rsiPeriod);
    const rsiLow = calculateRSIOnPrice(ohlc.map(d => d.low), rsiPeriod);
    const rsiClose = calculateRSIOnPrice(ohlc.map(d => d.close), rsiPeriod);

    const tenkanLine: LineData[] = [];
    const kijunLine: LineData[] = [];
    const spanALine: LineData[] = [];
    const spanBLine: LineData[] = [];
    const chinkouLine: LineData[] = [];
    const arrows: RsiIchimokuArrow[] = [];
    
    // Internal buffers for calculation
    let tenkanBuffer: (number | undefined)[] = [];
    let kijunBuffer: (number | undefined)[] = [];

    for (let i = 0; i < ohlc.length; i++) {
        // --- Tenkan Sen ---
        if (i < tenkan - 1) {
            tenkanBuffer.push(undefined);
        } else {
            const highSlice = rsiHigh.slice(i - tenkan + 1, i + 1).filter(v => v !== undefined) as number[];
            const lowSlice = rsiLow.slice(i - tenkan + 1, i + 1).filter(v => v !== undefined) as number[];
            if (highSlice.length > 0 && lowSlice.length > 0) {
                const highestRsi = Math.max(...highSlice);
                const lowestRsi = Math.min(...lowSlice);
                tenkanBuffer.push((highestRsi + lowestRsi) / 2);
            } else {
                tenkanBuffer.push(undefined);
            }
        }
        
        // --- Kijun Sen ---
        if (i < kijun - 1) {
            kijunBuffer.push(undefined);
        } else {
            const highSlice = rsiHigh.slice(i - kijun + 1, i + 1).filter(v => v !== undefined) as number[];
            const lowSlice = rsiLow.slice(i - kijun + 1, i + 1).filter(v => v !== undefined) as number[];
            if (highSlice.length > 0 && lowSlice.length > 0) {
                const highestRsi = Math.max(...highSlice);
                const lowestRsi = Math.min(...lowSlice);
                kijunBuffer.push((highestRsi + lowestRsi) / 2);
            } else {
                kijunBuffer.push(undefined);
            }
        }
    }
    
    // Apply smoothing if enabled
    if (useSmoothing && smoothingPeriod > 1) {
        tenkanBuffer = sma(tenkanBuffer, smoothingPeriod);
        kijunBuffer = sma(kijunBuffer, smoothingPeriod);
    }
    
    // Fill the chartable lines and generate signals
    for (let i = 1; i < ohlc.length; i++) {
        const time = ohlc[i].time;
        
        // --- Fill lines for charting ---
        const tenkanVal = tenkanBuffer[i];
        const kijunVal = kijunBuffer[i];

        if (tenkanVal !== undefined) tenkanLine.push({ time, value: tenkanVal });
        if (kijunVal !== undefined) kijunLine.push({ time, value: kijunVal });

        // --- Senkou Span A & B (shifted) ---
        const spanAVal = (tenkanBuffer[i] !== undefined && kijunBuffer[i] !== undefined) ? (tenkanBuffer[i]! + kijunBuffer[i]!) / 2 : undefined;
        if (spanAVal !== undefined && (i + kijun) < ohlc.length) {
            spanALine.push({ time: ohlc[i + kijun].time, value: spanAVal });
        }
        
        if (i >= senkou - 1) {
            const highSlice = rsiHigh.slice(i - senkou + 1, i + 1).filter(v => v !== undefined) as number[];
            const lowSlice = rsiLow.slice(i - senkou + 1, i + 1).filter(v => v !== undefined) as number[];
            if (highSlice.length > 0 && lowSlice.length > 0) {
                 const highestRsi = Math.max(...highSlice);
                 const lowestRsi = Math.min(...lowSlice);
                 const spanBVal = (highestRsi + lowestRsi) / 2;
                 if ((i + kijun) < ohlc.length) {
                     spanBLine.push({ time: ohlc[i + kijun].time, value: spanBVal });
                 }
            }
        }
        
        // --- Chinkou Span (shifted) ---
        const chinkouVal = rsiClose[i];
        if (chinkouVal !== undefined && (i - kijun) >= 0) {
             chinkouLine.push({ time: ohlc[i - kijun].time, value: chinkouVal });
        }

        // --- Arrow Logic: Tenkan/Kijun Cross ---
        const prevTenkanVal = tenkanBuffer[i-1];
        const prevKijunVal = kijunBuffer[i-1];
        if (tenkanVal !== undefined && kijunVal !== undefined && prevTenkanVal !== undefined && prevKijunVal !== undefined) {
            // Buy signal: Tenkan crosses above Kijun
            if (prevTenkanVal <= prevKijunVal && tenkanVal > kijunVal) {
                 arrows.push({ time, price: ohlc[i].low, type: 'buy', text: 'RSI Ichimoku Buy' });
            }
            // Sell signal: Tenkan crosses below Kijun
            if (prevTenkanVal >= prevKijunVal && tenkanVal < kijunVal) {
                 arrows.push({ time, price: ohlc[i].high, type: 'sell', text: 'RSI Ichimoku Sell' });
            }
        }
    }
    
    // Sort shifted lines by time for correct rendering
    spanALine.sort((a,b) => a.time - b.time);
    spanBLine.sort((a,b) => a.time - b.time);
    chinkouLine.sort((a,b) => a.time - b.time);
    
    return { tenkanLine, kijunLine, spanALine, spanBLine, chinkouLine, arrows };
}
