

import { type OHLC, type LineData, type HistogramData } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface HistogramQQESettings {
    sf: number;
    rsiPeriod: number;
    wp: number;
    upperBound: number;
    lowerBound: number;
    arrowsOnZeroCross: boolean;
    arrowsOnSignalCross: boolean;
}

export interface HistogramQQEArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface HistogramQQEResult {
    qqeLine: LineData[];
    trendLine: LineData[];
    histogram: HistogramData[];
    arrows: HistogramQQEArrow[];
}


// --- Helper Functions ---
const iRSI = (closePrices: number[], period: number, index: number) => {
    if (index < period) return 50; // Not enough data, return neutral

    let gains = 0;
    let losses = 0;

    for (let i = index - period + 1; i <= index; i++) {
        const diff = closePrices[i] - closePrices[i-1];
        if (diff > 0) {
            gains += diff;
        } else {
            losses -= diff;
        }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

// --- Main Calculation ---
export function calculateHistogramQQE(
    ohlc: OHLC[],
    settings: HistogramQQESettings
): HistogramQQEResult {
    const { sf, rsiPeriod, wp, upperBound, lowerBound, arrowsOnZeroCross, arrowsOnSignalCross } = settings;
    
    const closePrices = ohlc.map(d => d.close);
    const bars = ohlc.length;

    if (bars < rsiPeriod * 2) {
        return { qqeLine: [], trendLine: [], histogram: [], arrows: [] };
    }

    // This large `work` array mimics the MQL4 static/global array structure.
    // It's not memory efficient but provides a direct translation of the logic.
    let work: number[][] = Array(bars).fill(0).map(() => Array(6).fill(0));
    // Indices for work array
    const iRsi = 0, iEma = 1, iEmm = 2, iQqe = 3, tQqe = 4, tQqs = 5;

    const alpha1 = 2.0 / (sf + 1.0);
    const alpha2 = 2.0 / (rsiPeriod * 2.0);

    const qqeLine: LineData[] = [];
    const trendLine: LineData[] = [];
    const histogram: HistogramData[] = [];
    const arrows: HistogramQQEArrow[] = [];
    
    // Calculation loop
    for (let i = 1; i < bars; i++) {
        // work[r] in MQL becomes work[i], work[r-1] becomes work[i-1]
        
        // work[i][iRsi] = work[i-1][iRsi] + alpha1 * (iRSI(...) - work[i-1][iRsi]);
        const rsiValue = iRSI(closePrices, rsiPeriod, i);
        work[i][iRsi] = work[i-1][iRsi] + alpha1 * (rsiValue - work[i-1][iRsi]);
        
        // work[i][iEma] = work[i-1][iEma] + alpha2 * (Math.abs(work[i-1][iRsi] - work[i][iRsi]) - work[i-1][iEma]);
        work[i][iEma] = work[i-1][iEma] + alpha2 * (Math.abs(work[i-1][iRsi] - work[i][iRsi]) - work[i-1][iEma]);
        
        // work[i][iEmm] = work[i-1][iEmm] + alpha2 * (work[i][iEma] - work[i-1][iEmm]);
        work[i][iEmm] = work[i-1][iEmm] + alpha2 * (work[i][iEma] - work[i-1][iEmm]);

        const rsi0 = work[i][iRsi];
        const rsi1 = work[i-1][iRsi];
        const dar = work[i][iEmm] * wp;
        let tr = work[i-1][iQqe];
        const dv = tr;

        if (rsi0 < tr) {
            tr = rsi0 + dar;
            if ((rsi1 < dv) && (tr > dv)) tr = dv;
        }
        if (rsi0 > tr) {
            tr = rsi0 - dar;
            if ((rsi1 > dv) && (tr < dv)) tr = dv;
        }
        
        work[i][iQqe] = tr;
        work[i][tQqe] = work[i-1][tQqe];
        work[i][tQqs] = work[i-1][tQqs];
        
        const rsiMa = work[i][iRsi] - 50;
        const trendVal = tr - 50;

        qqeLine.push({ time: ohlc[i].time, value: rsiMa });
        trendLine.push({ time: ohlc[i].time, value: trendVal });
        
        // Histogram Coloring
        if (rsiMa > (upperBound - 50)) {
            histogram.push({ time: ohlc[i].time, value: rsiMa, color: 'up' });
        } else if (rsiMa < (lowerBound - 50)) {
            histogram.push({ time: ohlc[i].time, value: rsiMa, color: 'down' });
        } else {
            histogram.push({ time: ohlc[i].time, value: rsiMa, color: 'mid' });
        }

        // Arrow Logic
        if (rsiMa > 0) work[i][tQqe] = 1;
        if (rsiMa < 0) work[i][tQqe] = -1;
        if (rsiMa > trendVal) work[i][tQqs] = 1;
        if (rsiMa < trendVal) work[i][tQqs] = -1;

        // Signal Cross (if enabled)
        if (arrowsOnSignalCross && work[i][tQqs] !== work[i-1][tQqs]) {
            if (work[i][tQqs] === 1) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: 'QQE Signal Cross Buy' });
            } else {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: 'QQE Signal Cross Sell' });
            }
        }

        // Zero Cross (if enabled)
        if (arrowsOnZeroCross && work[i][tQqe] !== work[i-1][tQqe]) {
            if (work[i][tQqe] === 1) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: 'QQE Zero Cross Buy' });
            } else {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: 'QQE Zero Cross Sell' });
            }
        }
    }

    return { qqeLine, trendLine, histogram, arrows };
}
