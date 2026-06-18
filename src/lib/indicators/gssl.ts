
import { type OHLC, type LineData } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export type MAType = "SMA" | "EMA" | "HMA" | "WMA" | "DEMA" | "TEMA" | "SMMA";

export interface GsslSettings {
    lb: number;
    maType: MAType;
    arrowsColor: { buy: string; sell: string };
    lineColors: { up: string; down: string; };
}

export interface GsslArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface GsslResult {
    upLine: LineData[];
    downLine: LineData[];
    arrows: GsslArrow[];
}

// --- MA Definitions ---
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

const ema = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const multiplier = 2 / (period + 1);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    result.push(ema);
    for (let i = period; i < data.length; i++) {
        ema = (data[i] - ema) * multiplier + ema;
        result.push(ema);
    }
    return result;
};

const wma = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    const weightSum = period * (period + 1) / 2;
    for (let i = period - 1; i < data.length; i++) {
        let weightedSum = 0;
        for (let j = 0; j < period; j++) {
            weightedSum += data[i - j] * (period - j);
        }
        result.push(weightedSum / weightSum);
    }
    return result;
};

const hma = (data: number[], period: number): (number | undefined)[] => {
    const halfPeriod = Math.round(period / 2);
    const sqrtPeriod = Math.round(Math.sqrt(period));
    const wma1 = wma(data, halfPeriod);
    const wma2 = wma(data, period);
    const diff = wma1.map((val, i) => (val !== undefined && wma2[i] !== undefined) ? 2 * val - wma2[i]! : undefined);
    return wma(diff.filter(v => v !== undefined) as number[], sqrtPeriod);
};

const dema = (data: number[], period: number): (number | undefined)[] => {
    const ema1 = ema(data, period);
    const ema2 = ema(ema1.filter(v => v !== undefined) as number[], period);
    const demaResult: (number|undefined)[] = [];
    let ema2Index = 0;
    for(let i = 0; i < ema1.length; i++){
        if(ema1[i] !== undefined){
            if(ema2[ema2Index] !== undefined){
                demaResult.push(2 * ema1[i]! - ema2[ema2Index]!);
            } else {
                demaResult.push(undefined);
            }
            ema2Index++;
        } else {
            demaResult.push(undefined);
        }
    }
    return demaResult;
};

const tema = (data: number[], period: number): (number | undefined)[] => {
    const ema1 = ema(data, period);
    const ema2 = ema(ema1.filter(v => v !== undefined) as number[], period);
    const ema3 = ema(ema2.filter(v => v !== undefined) as number[], period);
    const temaResult: (number|undefined)[] = [];

    let ema2Index = 0;
    let ema3Index = 0;
    for(let i=0; i < ema1.length; i++){
        if(ema1[i] !== undefined){
            if(ema2[ema2Index] !== undefined){
                if(ema3[ema3Index] !== undefined){
                     temaResult.push(3 * ema1[i]! - 3 * ema2[ema2Index]! + ema3[ema3Index]!);
                } else {
                    temaResult.push(undefined);
                }
                ema3Index++;
            } else {
                 temaResult.push(undefined);
            }
             ema2Index++;
        } else {
             temaResult.push(undefined);
        }
    }
    return temaResult;
};

const smma = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    let sum = data.slice(0, period).reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
    for (let i = period; i < data.length; i++) {
        const prevSmma = result[i-1]!;
        const nextSmma = (prevSmma * (period - 1) + data[i]) / period;
        result.push(nextSmma);
    }
    return result;
};


export const getMA = (type: MAType, data: number[], period: number) => {
    switch (type) {
        case 'SMA': return sma(data, period);
        case 'EMA': return ema(data, period);
        case 'HMA': return hma(data, period);
        case 'WMA': return wma(data, period);
        case 'DEMA': return dema(data, period);
        case 'TEMA': return tema(data, period);
        case 'SMMA': return smma(data, period);
        default: return sma(data, period);
    }
}

// --- Main GSSL Calculation ---
export function calculateGssl(
    ohlc: OHLC[],
    settings: GsslSettings
): GsslResult {
    const { lb, maType } = settings;

    if (ohlc.length < lb) {
        return { upLine: [], downLine: [], arrows: [] };
    }

    const highPrices = ohlc.map(d => d.high);
    const lowPrices = ohlc.map(d => d.low);

    const maH = getMA(maType, highPrices, lb);
    const maL = getMA(maType, lowPrices, lb);
    
    const upLine: LineData[] = [];
    const downLine: LineData[] = [];
    const arrows: GsslArrow[] = [];

    let trend = 0; // Pine script's bbb

    for (let i = 0; i < ohlc.length; i++) {
        const h = maH[i];
        const l = maL[i];
        const close = ohlc[i].close;

        if (h === undefined || l === undefined) {
            continue;
        }

        const prevTrend = trend;

        const inChannel = close < h && close > l;
        const belowChannel = close < h && close < l;

        if (inChannel) {
            trend = prevTrend;
        } else {
            trend = belowChannel ? -1 : 1;
        }
        
        const currentUp = trend === 1 ? l : h;
        const currentDown = trend === 1 ? h : l;
        
        upLine.push({ time: ohlc[i].time, value: currentUp });
        downLine.push({ time: ohlc[i].time, value: currentDown });

        // Arrow generation on trend change
        if (trend !== prevTrend && trend !== 0) {
            if (trend === 1) {
                 arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: 'GSSL Buy' });
            } else {
                 arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: 'GSSL Sell' });
            }
        }
    }

    return { upLine, downLine, arrows };
}
