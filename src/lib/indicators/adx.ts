
import { type Candle } from '@/lib/types';

// Helper: Smoothed Moving Average (SMMA / Wilder's MA)
const smma = (data: number[], period: number): number[] => {
    if (data.length < period) return [];
    const results: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i];
    }
    results.push(sum / period);
    for (let i = period; i < data.length; i++) {
        const prevSmma = results[results.length - 1];
        const nextSmma = (prevSmma * (period - 1) + data[i]) / period;
        results.push(nextSmma);
    }
    return results;
};

// Calculates the ADX (Average Directional Index)
export const calculateADX = (candles: Candle[], period: number): { adx: number[], pdi: number[], ndi: number[] } => {
    if (candles.length < period * 2) { // Need enough data for initial calculations and smoothing
        return { adx: [], pdi: [], ndi: [] };
    }

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    const trs: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevHigh = highs[i - 1];
        const prevLow = lows[i - 1];
        const prevClose = closes[i - 1];

        // True Range (TR)
        const tr1 = high - low;
        const tr2 = Math.abs(high - prevClose);
        const tr3 = Math.abs(low - prevClose);
        trs.push(Math.max(tr1, tr2, tr3));

        // Directional Movement (+DM, -DM)
        const upMove = high - prevHigh;
        const downMove = prevLow - low;

        const plusDM = (upMove > downMove && upMove > 0) ? upMove : 0;
        const minusDM = (downMove > upMove && downMove > 0) ? downMove : 0;
        plusDMs.push(plusDM);
        minusDMs.push(minusDM);
    }

    // Smooth TR, +DM, -DM
    const smoothedTR = smma(trs, period);
    const smoothedPlusDM = smma(plusDMs, period);
    const smoothedMinusDM = smma(minusDMs, period);
    
    // Align smoothed arrays by finding the start offset
    const offset = candles.length - smoothedTR.length;

    // Directional Indicators (+DI, -DI)
    const pdi: number[] = [];
    const ndi: number[] = [];
    const dxs: number[] = [];

    for (let i = 0; i < smoothedTR.length; i++) {
        const tr = smoothedTR[i];
        const pdiVal = tr === 0 ? 0 : (smoothedPlusDM[i] / tr) * 100;
        const ndiVal = tr === 0 ? 0 : (smoothedMinusDM[i] / tr) * 100;
        pdi.push(pdiVal);
        ndi.push(ndiVal);

        // Directional Index (DX)
        const diSum = pdiVal + ndiVal;
        const diDiff = Math.abs(pdiVal - ndiVal);
        const dx = diSum === 0 ? 0 : (diDiff / diSum) * 100;
        dxs.push(dx);
    }
    
    // Average Directional Index (ADX)
    const adx = smma(dxs, period);
    
    // Pad arrays to match original candle length
    const padArray = (arr: number[], totalLength: number) => {
      const padding = new Array(totalLength - arr.length).fill(NaN);
      return padding.concat(arr);
    };

    const finalAdx = padArray(adx, candles.length);
    const finalPdi = padArray(pdi, candles.length);
    const finalNdi = padArray(ndi, candles.length);
    
    return { adx: finalAdx, pdi: finalPdi, ndi: finalNdi };
};
