
"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createChart, IChartApi, ISeriesApi, UTCTimestamp, LineStyle, CrosshairMode, ColorType, Time, ITimeScaleApi, HistogramSeriesOptions, LineSeriesOptions, TimeRange } from 'lightweight-charts';
import { LineData, HistogramData } from '@/lib/types';

export interface IndicatorChartApi {
    getChart: () => IChartApi | null;
}

export interface IndicatorData {
    mainLine?: LineData[];
    secondLine?: LineData[];
    histogram?: HistogramData[];
}

interface IndicatorChartProps {
  data: IndicatorData;
  lineColors: {
    mainLine?: string;
    signalLine?: string;
    histUp?: string;
    histDown?: string;
  };
  indicatorType: string;
  chartApiRef: React.RefObject<IndicatorChartApi | null>;
}

const IndicatorChartInternal = forwardRef<IndicatorChartApi, IndicatorChartProps>(({ data, lineColors, indicatorType, chartApiRef }, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  const seriesRefs = useRef<{ [key: string]: ISeriesApi<any> | null }>({});

  useImperativeHandle(chartApiRef, () => ({
    getChart: () => chartRef.current,
  }), []);

  // Effect for creating and managing the chart instance
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const isDarkMode = document.documentElement.classList.contains('dark');
    const chartTextColor = isDarkMode ? '#C9D1D9' : '#333';
    const chartGridColor = isDarkMode ? '#2A2E39' : '#EAECEF';

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
          borderColor: chartGridColor,
        },
        rightPriceScale: { borderColor: chartGridColor, autoScale: true, },
        crosshair: { mode: CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false,
    });
    chartRef.current = chart;
    
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
          const { width, height } = entries[0].contentRect;
          chart.resize(width, height);
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
        resizeObserver.disconnect();
        if (chartRef.current) {
          try { chartRef.current.remove(); } catch(e) {}
        }
        chartRef.current = null;
    };
  }, []); 

  // Effect for managing series and data updates
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    // --- SAFE CLEANUP ---
    Object.values(seriesRefs.current).forEach(series => {
      if (series) try { chart.removeSeries(series); } catch (e) { /* ignore */ }
    });
    seriesRefs.current = {};


    // --- ADD/UPDATE SERIES ---
    if (indicatorType === 'tick_macd_mtf') {
        const macdSeries = chart.addLineSeries({ color: lineColors.mainLine, lineWidth: 2, title: 'MACD' });
        const signalSeries = chart.addLineSeries({ color: lineColors.signalLine, lineWidth: 2, title: 'Signal' });
        const histSeries = chart.addHistogramSeries({ base: 0, priceFormat: { type: 'volume' } });
        
        if (data.mainLine) macdSeries.setData(data.mainLine.map(d => ({...d, time: d.time as UTCTimestamp})));
        if (data.secondLine) signalSeries.setData(data.secondLine.map(d => ({...d, time: d.time as UTCTimestamp})));
        if (data.histogram) {
            const histData = data.histogram.map((d, i) => {
                const prev = i > 0 ? data.histogram?.[i-1]?.value : 0;
                return {
                    time: d.time as UTCTimestamp,
                    value: d.value,
                    color: d.value >= 0 ? (lineColors.histUp || '#26A69A') : (lineColors.histDown || '#EF5350')
                }
            });
            histSeries.setData(histData);
        }

        seriesRefs.current.mainLine = macdSeries;
        seriesRefs.current.secondLine = signalSeries;
        seriesRefs.current.histogram = histSeries;
    }

  }, [indicatorType, data, lineColors]); // Re-run when indicator, data or settings change
  
  return (
    <div ref={chartContainerRef} className="w-full h-full relative" />
  );
});
IndicatorChartInternal.displayName = 'IndicatorChartInternal';

const IndicatorChart = forwardRef<HTMLDivElement, Omit<IndicatorChartProps, 'chartApiRef'>>((props, ref) => {
    return <IndicatorChartInternal {...props} chartApiRef={props.chartApiRef as any} ref={ref as any} />;
});
IndicatorChart.displayName = 'IndicatorChart';

export default IndicatorChart;

    