

import { type Candle, type Arrow, type DeltaRsiStrategy } from '@/lib/types';

// --- Type Definitions ---
export interface DeltaRsiSettings {
    rsiLength: number;
    window: number;
    degree: number;
    signalLength: number;
    strategy: DeltaRsiStrategy;
    useRmseFilter: boolean;
    rmseThreshold: number;
}

export interface DeltaRsiResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number; // The main D-RSI value
    arrows: Arrow[];
    reason?: 'RMSE Filtered';
}


// --- Matrix and Math Helper Functions (Direct translation from PineScript) ---

const matrix_get = (_A: number[], _i: number, _j: number, _nrows: number): number => {
    return _A[_i + _nrows * _j];
};

const matrix_set = (_A: number[], _value: number, _i: number, _j: number, _nrows: number): void => {
    _A[_i + _nrows * _j] = _value;
};

const transpose = (_A: number[], _nrows: number, _ncolumns: number): number[] => {
    const _AT = new Array(_nrows * _ncolumns).fill(0);
    for (let i = 0; i < _nrows; i++) {
        for (let j = 0; j < _ncolumns; j++) {
            matrix_set(_AT, matrix_get(_A, i, j, _nrows), j, i, _ncolumns);
        }
    }
    return _AT;
};

const multiply = (_A: number[], _B: number[], _nrowsA: number, _ncolumnsA: number, _ncolumnsB: number): number[] => {
    const _C = new Array(_nrowsA * _ncolumnsB).fill(0);
    const _nrowsB = _ncolumnsA;
    let elementC = 0.0;
    for (let i = 0; i < _nrowsA; i++) {
        for (let j = 0; j < _ncolumnsB; j++) {
            elementC = 0;
            for (let k = 0; k < _ncolumnsA; k++) {
                elementC += matrix_get(_A, i, k, _nrowsA) * matrix_get(_B, k, j, _nrowsB);
            }
            matrix_set(_C, elementC, i, j, _nrowsA);
        }
    }
    return _C;
};

const vnorm = (_X: number[], _n: number): number => {
    let _norm = 0.0;
    for (let i = 0; i < _n; i++) {
        _norm += Math.pow(_X[i], 2);
    }
    return Math.sqrt(_norm);
};

const qr_diag = (_A: number[], _nrows: number, _ncolumns: number): [number[], number[]] => {
    const _Q = new Array(_nrows * _ncolumns).fill(0);
    const _R = new Array(_ncolumns * _ncolumns).fill(0);
    const _a = new Array(_nrows).fill(0);
    let _r = 0.0;
    
    for (let i = 0; i < _nrows; i++) _a[i] = matrix_get(_A, i, 0, _nrows);
    _r = vnorm(_a, _nrows);
    
    matrix_set(_R, _r, 0, 0, _ncolumns);
    for (let i = 0; i < _nrows; i++) matrix_set(_Q, _a[i] / _r, i, 0, _nrows);

    if (_ncolumns > 1) {
        for (let k = 1; k < _ncolumns; k++) {
            for (let i = 0; i < _nrows; i++) _a[i] = matrix_get(_A, i, k, _nrows);
            for (let j = 0; j < k; j++) {
                _r = 0;
                for (let i = 0; i < _nrows; i++) _r += matrix_get(_Q, i, j, _nrows) * _a[i];
                matrix_set(_R, _r, j, k, _ncolumns);
                for (let i = 0; i < _nrows; i++) _a[i] -= _r * matrix_get(_Q, i, j, _nrows);
            }
            _r = vnorm(_a, _nrows);
            matrix_set(_R, _r, k, k, _ncolumns);
            for (let i = 0; i < _nrows; i++) matrix_set(_Q, _a[i] / _r, i, k, _nrows);
        }
    }
    return [_Q, _R];
};

const pinv = (_A: number[], _nrows: number, _ncolumns: number): number[] => {
    const [_Q, _R] = qr_diag(_A, _nrows, _ncolumns);
    const _QT = transpose(_Q, _nrows, _ncolumns);
    
    const _Rinv = new Array(_ncolumns * _ncolumns).fill(0);
    matrix_set(_Rinv, 1 / matrix_get(_R, 0, 0, _ncolumns), 0, 0, _ncolumns);

    if (_ncolumns > 1) {
        for (let j = 1; j < _ncolumns; j++) {
            for (let i = 0; i < j; i++) {
                let _r = 0.0;
                for (let k = i; k < j; k++) {
                    _r += matrix_get(_Rinv, i, k, _ncolumns) * matrix_get(_R, k, j, _ncolumns);
                }
                matrix_set(_Rinv, _r, i, j, _ncolumns);
            }
            for (let k = 0; k < j; k++) {
                matrix_set(_Rinv, -matrix_get(_Rinv, k, j, _ncolumns) / matrix_get(_R, j, j, _ncolumns), k, j, _ncolumns);
            }
            matrix_set(_Rinv, 1 / matrix_get(_R, j, j, _ncolumns), j, j, _ncolumns);
        }
    }
    return multiply(_Rinv, _QT, _ncolumns, _ncolumns, _nrows);
};

const norm_rmse = (x: number[], xhat: number[]): number => {
    if (x.length !== xhat.length) return Infinity;
    const n = x.length;
    let mse = 0.0;
    for (let i = 0; i < n; i++) {
        mse += Math.pow(x[i] - xhat[i], 2) / n;
    }
    const xmean = x.reduce((a, b) => a + b, 0) / n;
    return xmean === 0 ? Infinity : Math.sqrt(mse) / Math.abs(xmean);
};

const diff = (_src: (number|undefined)[], _window: number, _degree: number): [number | undefined, number | undefined] => {
    if (_src.length < _window) return [undefined, undefined];
    
    const _J = new Array(_window * (_degree + 1)).fill(0);
    for (let i = 0; i < _window; i++) {
        for (let j = 0; j <= _degree; j++) {
            matrix_set(_J, Math.pow(i, j), i, j, _window);
        }
    }

    const _Y_raw = _src.slice(-_window).reverse() as number[];
    if (_Y_raw.some(y => y === undefined)) return [undefined, undefined];

    const _C = pinv(_J, _window, _degree + 1);
    const _a_coef = multiply(_C, _Y_raw, _degree + 1, _window, 1);

    let _diff = 0.0;
    for (let i = 1; i <= _degree; i++) {
        _diff += i * _a_coef[i] * Math.pow(_window - 1, i - 1);
    }
    
    const _Y_hat = multiply(_J, _a_coef, _window, _degree + 1, 1);
    const _nrmse = norm_rmse(_Y_raw, _Y_hat);
    
    return [_diff, _nrmse];
};


// --- RSI and EMA Helpers ---

const calculateRSI = (closePrices: number[], period: number): (number | undefined)[] => {
    if (closePrices.length < period + 1) return new Array(closePrices.length).fill(undefined);

    const rsiValues: (number | undefined)[] = new Array(period).fill(undefined);
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;
    
    const initialRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(100 - (100 / (1 + initialRs)));
    
    for (let i = period + 1; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiValues.push(100 - (100 / (1 + rs)));
    }
    
    return rsiValues;
};

const ema = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    const result: (number | undefined)[] = [];
    if (data.length === 0 || period <= 0) return result;
    const multiplier = 2 / (period + 1);
    let currentEma: number | undefined = undefined;

    for (const val of data) {
        if (val !== undefined) {
            if (currentEma === undefined) {
                currentEma = val;
            } else {
                currentEma = (val - currentEma) * multiplier + currentEma;
            }
        }
        result.push(currentEma);
    }
    return result;
};


// --- Main Indicator Calculation ---
export function calculateDeltaRsi(
    ohlc: Candle[],
    settings: DeltaRsiSettings
): DeltaRsiResult {
    const { rsiLength, window, degree, signalLength, strategy, useRmseFilter, rmseThreshold } = settings;
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let reason: DeltaRsiResult['reason'] = undefined;
    const arrows: Arrow[] = [];

    const minBars = rsiLength + window;
    if (ohlc.length < minBars) {
        return { signal: 'NEUTRAL', value: 0, arrows: [], reason };
    }

    const closePrices = ohlc.map(c => c.close);
    const rsiSeries = calculateRSI(closePrices, rsiLength);
    
    const drsiSeries: (number | undefined)[] = [];
    const nrmseSeries: (number | undefined)[] = [];

    for (let i = 0; i < ohlc.length; i++) {
        if (i < minBars -1) {
            drsiSeries.push(undefined);
            nrmseSeries.push(undefined);
            continue;
        }
        const rsiSlice = rsiSeries.slice(0, i + 1);
        const [drsi, nrmse] = diff(rsiSlice, window, degree);
        drsiSeries.push(drsi);
        nrmseSeries.push(nrmse);
    }
    
    const signalLine = ema(drsiSeries, signalLength);

    // --- Signal Logic ---
    const i = ohlc.length - 1;
    const drsi = drsiSeries[i];
    const prevDrsi = drsiSeries[i-1];
    const prevDrsi2 = drsiSeries[i-2];
    const signalVal = signalLine[i];
    const prevSignalVal = signalLine[i-1];
    const latestCandle = ohlc[i];
    const nrmse = nrmseSeries[i];

    if (drsi !== undefined && prevDrsi !== undefined && signalVal !== undefined && prevSignalVal !== undefined && prevDrsi2 !== undefined) {
        let potentialSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

        switch (strategy) {
            case 'zero-crossing':
                if (drsi > 0 && prevDrsi <= 0) potentialSignal = 'BULLISH';
                if (drsi < 0 && prevDrsi >= 0) potentialSignal = 'BEARISH';
                break;
            case 'signal-crossing':
                if (drsi > signalVal && prevDrsi <= prevSignalVal) potentialSignal = 'BULLISH';
                if (drsi < signalVal && prevDrsi >= prevSignalVal) potentialSignal = 'BEARISH';
                break;
            case 'direction-change':
                if (drsi > prevDrsi && prevDrsi < prevDrsi2 && prevDrsi < 0) potentialSignal = 'BULLISH';
                if (drsi < prevDrsi && prevDrsi > prevDrsi2 && prevDrsi > 0) potentialSignal = 'BEARISH';
                break;
        }

        // Apply RMSE filter if enabled
        const rmseFilterPassed = !useRmseFilter || (nrmse !== undefined && (nrmse * 100) < rmseThreshold);

        if (potentialSignal !== 'NEUTRAL') {
            if (rmseFilterPassed) {
                signal = potentialSignal;
            } else {
                reason = 'RMSE Filtered';
            }
        }
    }
    
    if (signal !== 'NEUTRAL') {
         arrows.push({
            time: latestCandle.epoch,
            price: signal === 'BULLISH' ? latestCandle.low : latestCandle.high,
            direction: signal === 'BULLISH' ? 'up' : 'down',
            type: 'crossover',
            tooltip: `D-RSI ${signal}`
        });
    }

    return { signal, value: drsi || 0, arrows, reason };
}
