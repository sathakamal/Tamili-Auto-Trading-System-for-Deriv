
import { type OHLC, type LineData, type HistogramData } from '@/lib/types';

// --- Type Definitions ---
export interface TrendDirectionForceIndexSettings {
    trendPeriod: number;
    smoothPeriod: number;
    smoothPhase: number;
}

export interface TrendDirectionForceIndexArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface TrendDirectionForceIndexResult {
    tdfiLine: LineData[];
    histogram: HistogramData[];
    arrows: TrendDirectionForceIndexArrow[];
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


// --- Helper: A more accurate translation of the complex iSmooth function ---
class Smoother {
    private wrk: number[][] = [];
    private bars: number = 0;

    public smooth(price: number, length: number, phase: number, i: number): number {
        if (length <= 1) return price;

        if (this.bars !== i + 1) {
            this.bars = i + 1;
            while(this.wrk.length < this.bars) {
                this.wrk.push(new Array(10).fill(0));
            }
        }
        
        if (i === 0) {
            for (let k = 0; k < 7; k++) this.wrk[i][k] = price;
            for (let k = 7; k < 10; k++) this.wrk[i][k] = 0;
            return price;
        }
        
        const len1 = Math.max(Math.log(Math.sqrt(0.5 * (length - 1))) / Math.log(2.0) + 2.0, 0);
        const pow1 = Math.max(len1 - 2.0, 0.5);
        const del1 = price - this.wrk[i - 1][5]; // bsmax
        const del2 = price - this.wrk[i - 1][6]; // bsmin

        this.wrk[i][7] = Math.abs(del1) > Math.abs(del2) ? Math.abs(del1) : Math.abs(del2); // volty
        
        const forBar = Math.min(i, 10);
        const prevVsum = this.wrk[i-1][8];
        const prevVolty = i >= forBar ? this.wrk[i - forBar][7] : 0;
        this.wrk[i][8] = prevVsum + this.wrk[i][7] - prevVolty; // vsum

        this.wrk[i][9] = this.wrk[i-1][9] + (2.0 / (Math.max(4.0 * length, 30) + 1.0)) * (this.wrk[i][8] - this.wrk[i-1][9]); // avolty

        let dVolty = (this.wrk[i][9] > 0) ? this.wrk[i][7] / this.wrk[i][9] : 0;
        if (dVolty > Math.pow(len1, 1.0 / pow1)) dVolty = Math.pow(len1, 1.0 / pow1);
        if (dVolty < 1) dVolty = 1.0;

        const pow2 = Math.pow(dVolty, pow1);
        const len2 = Math.sqrt(0.5 * (length - 1)) * len1;
        const Kv = Math.pow(len2 / (len2 + 1), Math.sqrt(pow2));

        if (del1 > 0) this.wrk[i][5] = price; else this.wrk[i][5] = price - Kv * del1;
        if (del2 < 0) this.wrk[i][6] = price; else this.wrk[i][6] = price - Kv * del2;

        const R = Math.max(Math.min(phase, 100), -100) / 100.0 + 1.5;
        const beta = 0.45 * (length - 1) / (0.45 * (length - 1) + 2);
        const alpha = Math.pow(beta, pow2);

        this.wrk[i][0] = price + alpha * (this.wrk[i - 1][0] - price);
        this.wrk[i][1] = (price - this.wrk[i][0]) * (1 - beta) + beta * this.wrk[i - 1][1];
        this.wrk[i][2] = this.wrk[i][0] + R * this.wrk[i][1];
        this.wrk[i][3] = (this.wrk[i][2] - this.wrk[i - 1][4]) * Math.pow((1 - alpha), 2) + Math.pow(alpha, 2) * this.wrk[i - 1][3];
        this.wrk[i][4] = this.wrk[i - 1][4] + this.wrk[i][3];

        return this.wrk[i][4];
    }
}


// --- Main Indicator Calculation ---
export function calculateTrendDirectionForceIndex(
    ohlc: OHLC[],
    settings: TrendDirectionForceIndexSettings
): TrendDirectionForceIndexResult {
    const { trendPeriod, smoothPeriod, smoothPhase } = settings;
    const triggerUp = 0.1;
    const triggerDown = -0.1;
    
    if (ohlc.length < trendPeriod * 2) {
        return { tdfiLine: [], histogram: [], arrows: [] };
    }

    const closePrices = ohlc.map(d => d.close);
    const mma = ema(closePrices, trendPeriod);
    
    // Create a stateful class instance for smoothing
    const smoother = new Smoother();
    
    const workTrend: { mma: number | undefined, smma: number | undefined, tdf: number | undefined }[] = [];
    const alpha = 2.0 / (trendPeriod + 1.0);

    for (let i = 0; i < ohlc.length; i++) {
        const currentMma = mma[i];
        let currentSmma: number | undefined = undefined;
        let currentTdf: number | undefined = undefined;

        if (currentMma !== undefined) {
            const prevSmma = i > 0 ? workTrend[i-1].smma : undefined;
            currentSmma = (prevSmma !== undefined) ? prevSmma + alpha * (currentMma - prevSmma) : currentMma;

            const prevMma = i > 0 ? mma[i-1] : undefined;
            const impetmma = (prevMma !== undefined) ? currentMma - prevMma : 0;
            const impetsmma = (prevSmma !== undefined && i > 1 && workTrend[i-1].smma !== undefined) ? currentSmma - workTrend[i-1].smma! : 0;
            
            const divma = (prevSmma !== undefined) ? Math.abs(currentMma - currentSmma) : 0;
            const averimpet = (impetmma + impetsmma) / 2.0;

            currentTdf = divma * Math.pow(averimpet, 3);
        }
        workTrend.push({ mma: currentMma, smma: currentSmma, tdf: currentTdf });
    }

    const tdfiLine: LineData[] = [];
    const histogram: HistogramData[] = [];
    const arrows: TrendDirectionForceIndexArrow[] = [];
    const trendStates: (number | undefined)[] = new Array(ohlc.length).fill(undefined);

    for (let i = 0; i < ohlc.length; i++) {
        let smoothedTdfi: number | undefined = undefined;
        
        const tdfLookback = Math.min(i + 1, trendPeriod * 3);
        let absHighest = 0;
        for (let j = 0; j < tdfLookback; j++) {
            const tdfVal = workTrend[i - j]?.tdf;
            if (tdfVal !== undefined) {
                absHighest = Math.max(absHighest, Math.abs(tdfVal));
            }
        }
        
        const rawTdf = workTrend[i]?.tdf;
        if (rawTdf !== undefined) {
            const normalizedTdf = absHighest > 0 ? rawTdf / absHighest : 0;
            smoothedTdfi = smoother.smooth(normalizedTdf, smoothPeriod, smoothPhase, i);
        }
        
        const prevTrend = i > 0 ? trendStates[i-1] : 0;
        let currentTrend = prevTrend;

        if (smoothedTdfi !== undefined) {
            if (smoothedTdfi > triggerUp) currentTrend = 1;
            if (smoothedTdfi < triggerDown) currentTrend = -1;
        }
        trendStates[i] = currentTrend;

        let color = 'neutral';
        if (currentTrend === 1) color = 'up';
        if (currentTrend === -1) color = 'down';

        if (smoothedTdfi !== undefined) {
            tdfiLine.push({ time: ohlc[i].time, value: smoothedTdfi, color: color });
            histogram.push({ time: ohlc[i].time, value: smoothedTdfi, color: color });
        }
        
        if (currentTrend !== prevTrend) {
            if (currentTrend === 1) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: 'TDFI Buy' });
            } else if (currentTrend === -1) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: 'TDFI Sell' });
            }
        }
    }

    return { tdfiLine, histogram, arrows };
}
