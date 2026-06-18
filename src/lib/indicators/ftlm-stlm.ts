
import { type OHLC, type LineData, type HistogramData } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface FtlnStlmSettings {
    arrowsOnMomentumChange: boolean;
    arrowsOnZeroCross: boolean;
}

export interface FtlnStlmArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface FtlnStlmResult {
    histogram: HistogramData[];
    arrows: FtlnStlmArrow[];
}

// FIR filter coefficients from the original MQL4 code
const FTLM_COEFF1 = [
    0.4360409450, 0.3658689069, 0.2460452079, 0.1104506886, -0.0054034585,
    -0.0760367731, -0.0933058722, -0.0670110374, -0.0190795053, 0.0259609206,
    0.0502044896, 0.0477818607, 0.0249252327, -0.0047706151, -0.0272432537,
    -0.0338917071, -0.0244141482, -0.0055774838, 0.0128149838, 0.0226522218,
    0.0208778257, 0.0100299086, -0.0036771622, -0.0136744850, -0.0160483392,
    -0.0108597376, -0.0016060704, 0.0069480557, 0.0110573605, 0.0095711419,
    0.0040444064, -0.0023824623, -0.0067093714, -0.0072003400, -0.0047717710,
    0.0005541115, 0.0007860160, 0.0130129076, 0.0040364019
];

const FTLM_COEFF2 = [
    -0.0025097319, 0.0513007762, 0.1142800493, 0.1699342860, 0.2025269304,
    0.2025269304, 0.1699342860, 0.1142800493, 0.0513007762, -0.0025097319,
    -0.0353166244, -0.0433375629, -0.0311244617, -0.0088618137, 0.0120580088,
    0.0233183633, 0.0221931304, 0.0115769653, -0.0022157966, -0.0126536111,
    -0.0157416029, -0.0113395830, -0.0025905610, 0.0059521459, 0.0105212252,
    0.0096970755, 0.0046585685, -0.0017079230, -0.0063513565, -0.0074539350,
    -0.0050439973, -0.0007459678, 0.0032271474, 0.0051357867, 0.0044454862,
    0.0018784961, -0.0011065767, -0.0031162862, -0.0033443253, -0.0022163335,
    0.0002573669, 0.0003650790, 0.0060440751, 0.0018747783
];

const applyFilter = (data: number[], coeffs: number[], index: number): number | undefined => {
    if (index < coeffs.length - 1) return undefined;
    let sum = 0;
    for (let j = 0; j < coeffs.length; j++) {
        sum += coeffs[j] * data[index - j];
    }
    return sum;
};

export function calculateFtlnStlm(
    ohlc: OHLC[],
    settings: FtlnStlmSettings
): FtlnStlmResult {
    const { arrowsOnMomentumChange, arrowsOnZeroCross } = settings;
    const closePrices = ohlc.map(d => d.close);
    const maxLookback = Math.max(FTLM_COEFF1.length, FTLM_COEFF2.length);

    if (closePrices.length < maxLookback + 1) {
        return { histogram: [], arrows: [] };
    }

    const histogram: HistogramData[] = [];
    const arrows: FtlnStlmArrow[] = [];
    
    let prevFtlm: number | undefined = undefined;

    for (let i = 1; i < ohlc.length; i++) {
        // --- FTLM Calculation ---
        const value11 = applyFilter(closePrices, FTLM_COEFF1, i);
        const value21 = applyFilter(closePrices, FTLM_COEFF2, i);
        const currentFtlm = (value11 !== undefined && value21 !== undefined) ? value11 - value21 : undefined;

        // --- Histogram Logic & Arrow Generation ---
        if (currentFtlm !== undefined) {
             const color = (prevFtlm !== undefined && currentFtlm > prevFtlm) ? 'up' : 'down';
             histogram.push({ time: ohlc[i].time, value: currentFtlm, color: color });

             // --- Momentum Change Signal ---
             if (arrowsOnMomentumChange) {
                 const prevColor = (i > 1 && histogram[histogram.length-2]) ? histogram[histogram.length-2].color : undefined;
                 if(prevColor && color !== prevColor) {
                     if (color === 'up') {
                        arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: 'FTLM Momentum Buy' });
                     } else {
                        arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: 'FTLM Momentum Sell' });
                     }
                 }
             }
             
             // --- Zero Cross Signal ---
             if (arrowsOnZeroCross && prevFtlm !== undefined) {
                 if (currentFtlm > 0 && prevFtlm <= 0) {
                     arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: 'FTLM Zero Cross Buy' });
                 }
                 if (currentFtlm < 0 && prevFtlm >= 0) {
                     arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: 'FTLM Zero Cross Sell' });
                 }
             }
        }
        
        if (currentFtlm !== undefined) {
            prevFtlm = currentFtlm;
        }
    }
    
    return { histogram, arrows };
}
