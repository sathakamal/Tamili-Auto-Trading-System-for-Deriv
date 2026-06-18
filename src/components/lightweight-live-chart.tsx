

"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createChart, IChartApi, ISeriesApi, UTCTimestamp, LineStyle, CrosshairMode, ColorType, IPriceLine, PriceLineOptions, SeriesMarker, Time, TimeRange, ITimeScaleApi, ILineSeries, LineWidth, PriceLine } from 'lightweight-charts';
import { type Tick, type Candle, type Arrow, type TrendLine } from '@/lib/types';

export interface ChartApi {
    zoomIn: () => void;
    zoomOut: () => void;
    scrollToRealTime: () => void;
    getChart: () => IChartApi | null;
    update: (data: Tick | Candle) => void;
}

type ChartData = Tick | Candle;

interface LightweightLiveChartProps {
  dataType: 'ticks' | 'candles';
  data: ChartData[];
  signals: Arrow[];
  chartApiRef: React.RefObject<ChartApi | null>;
}

const LightweightLiveChartInternal = forwardRef<ChartApi, LightweightLiveChartProps>(({ dataType, data, signals, chartApiRef }, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area' | 'Candlestick'> | null>(null);
  
  useImperativeHandle(chartApiRef, () => ({
    zoomIn: () => {
        const timeScale = chartRef.current?.timeScale();
        if (!timeScale) return;
        const range = timeScale.getVisibleLogicalRange();
        if (range) {
            const center = (range.from + range.to) / 2;
            const newRange = { from: center - (range.to - range.from) / 4, to: center + (range.to - range.from) / 4 };
            timeScale.setVisibleLogicalRange(newRange);
        }
    },
    zoomOut: () => {
        const timeScale = chartRef.current?.timeScale();
        if (!timeScale) return;
        const range = timeScale.getVisibleLogicalRange();
        if (range) {
            const center = (range.from + range.to) / 2;
            const newRange = { from: center - (range.to - range.from), to: center + (range.to - range.from) };
            timeScale.setVisibleLogicalRange(newRange);
        }
    },
    scrollToRealTime: () => chartRef.current?.timeScale().scrollToRealTime(),
    getChart: () => chartRef.current,
    update: (updateData: Tick | Candle) => {
        if (!seriesRef.current) return;
        
        const chartData = {
            ...updateData,
            time: updateData.epoch as UTCTimestamp,
            value: (updateData as Tick).price
        };
        
        seriesRef.current.update(chartData);
    },
  }), []);


  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartTextColor = '#64748b'; // slate-500
    const chartGridColor = '#334155'; // slate-700
    const chartBorderColor = '#475569'; // slate-600


    const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        layout: { 
            background: { type: ColorType.Solid, color: 'transparent' }, 
            textColor: chartTextColor
        },
        grid: { 
            vertLines: { color: chartGridColor, style: LineStyle.Dotted }, 
            horzLines: { color: chartGridColor, style: LineStyle.Dotted } 
        },
        timeScale: { 
          timeVisible: true, 
          secondsVisible: true, 
          borderColor: chartBorderColor,
          rightOffset: 15,
        },
        rightPriceScale: { borderColor: chartBorderColor },
        crosshair: { mode: CrosshairMode.Normal },
        handleScroll: true,
        handleScale: {
            pinch: true,
            mouseWheel: true,
        },
    });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) { return; }
      const { width, height } = entries[0].contentRect;
      chart.resize(width, height);
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
        resizeObserver.disconnect();
        if (chartRef.current) {
            try { chartRef.current.remove(); } catch(e){}
        }
        chartRef.current = null;
        seriesRef.current = null;
    };
  }, []); 

  useEffect(() => {
    if (!chartRef.current) return;

    if (seriesRef.current) {
        try { chartRef.current.removeSeries(seriesRef.current); } catch (e) {}
        seriesRef.current = null;
    }
    
    const areaLineColor = '#06b6d4'; // cyan-500
    const areaTopColor = 'rgba(6, 182, 212, 0.4)';
    const areaBottomColor = 'rgba(6, 182, 212, 0)';

    const candleUpColor = '#22c55e'; // green-500
    const candleDownColor = '#ef4444'; // red-500

    if (dataType === 'ticks') {
        const areaSeries = chartRef.current.addAreaSeries({
            lineColor: areaLineColor,
            topColor: areaTopColor,
            bottomColor: areaBottomColor,
            lineWidth: 2,
        });
        seriesRef.current = areaSeries as ISeriesApi<'Area'>;
    } else { // candles
        const candleSeries = chartRef.current.addCandlestickSeries({
            upColor: candleUpColor,
            downColor: candleDownColor,
            borderVisible: false,
            wickUpColor: candleUpColor,
            wickDownColor: candleDownColor,
        });
        seriesRef.current = candleSeries as ISeriesApi<'Candlestick'>;
    }

  }, [dataType]);


  useEffect(() => {
    if (!seriesRef.current || !data) return;

    const uniqueData = data.filter((d, i, arr) => i === 0 || d.epoch > arr[i-1].epoch);

    let chartData;
    if (dataType === 'ticks') {
      chartData = (uniqueData as Tick[]).map(tick => ({
        time: tick.epoch as UTCTimestamp,
        value: tick.price,
      }));
      (seriesRef.current as ISeriesApi<'Area'>).setData(chartData);
    } else {
      chartData = (uniqueData as Candle[]).map(candle => ({
        time: candle.epoch as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));
      (seriesRef.current as ISeriesApi<'Candlestick'>).setData(chartData);
    }
    
    const markers: SeriesMarker<Time>[] = signals
      .filter(signal => typeof signal.time === 'number' && signal.time > 0 && typeof signal.price === 'number')
      .map(signal => {
        let color = signal.direction === 'up' ? '#22c55e' : '#ef4444';
        let shape: 'arrowUp' | 'arrowDown' = signal.direction === 'up' ? 'arrowUp' : 'arrowDown';
        let position: 'belowBar' | 'aboveBar' = signal.direction === 'up' ? 'belowBar' : 'aboveBar';
        
        return {
          time: signal.time as UTCTimestamp,
          position: position,
          color: color,
          shape: shape,
          text: signal.tooltip,
          size: 1,
        };
      })
      .filter((marker): marker is SeriesMarker<Time> => marker !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));

    seriesRef.current.setMarkers(markers);
    
  }, [data, dataType, signals]);
  
  return (
    <div ref={chartContainerRef} className="w-full h-full relative" />
  );
});
LightweightLiveChartInternal.displayName = 'LightweightLiveChartInternal';


const LightweightLiveChart = forwardRef<HTMLDivElement, Omit<LightweightLiveChartProps, 'chartApiRef'>>((props, ref) => {
    return <LightweightLiveChartInternal {...props} chartApiRef={props.chartApiRef as any} ref={ref as any} />;
});
LightweightLiveChart.displayName = 'LightweightLiveChart';


export default LightweightLiveChart;
