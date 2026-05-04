export const chartColors = {
  up: '#f5222d',
  down: '#52c41a',
  primary: '#1677ff',
  warning: '#fa8c16',
  purple: '#722ed1',
  orange: '#fa8c16',
  cyan: '#13c2c2',
  gray: '#999',
  grid: '#f0f0f0',
  text: '#666',
}

export const mobileKlineOption = (
  data: any[],
  opts?: { showMa?: boolean; visibleHighLow?: { highIdx: number; highVal: number; lowIdx: number; lowVal: number } | null },
) => {
  const showMa = opts?.showMa ?? true
  const dates = data.map((d: any) => d.date)
  const ohlc = data.map((d: any) => [d.open, d.close, d.low, d.high])
  const volumes = data.map((d: any) => d.volume)
  const volColors = data.map((d: any) => d.close >= d.open ? chartColors.up : chartColors.down)

  const dateLabelMap: Record<string, string> = {}
  dates.forEach((d, i) => {
    if (i === 0 || d.slice(0, 4) !== dates[i - 1]?.slice(0, 4)) dateLabelMap[d] = d
    else dateLabelMap[d] = d.slice(5)
  })

  const series: any[] = [
    {
      name: 'K线', type: 'candlestick', data: ohlc,
      animationDurationUpdate: 0,
      itemStyle: { color: chartColors.up, color0: chartColors.down, borderColor: chartColors.up, borderColor0: chartColors.down },
      xAxisIndex: 0, yAxisIndex: 0,
    },
  ]

  if (opts?.visibleHighLow) {
    const { highIdx, highVal, lowIdx, lowVal } = opts.visibleHighLow
    series[0].markPoint = {
      silent: true,
      symbol: 'none',
      label: { show: true, fontSize: 11 },
      data: [
        { name: `${highVal.toFixed(2)} →`, coord: [highIdx, highVal], label: { formatter: `${highVal.toFixed(2)} →`, position: 'top', distance: 3, color: '#f5222d', fontWeight: 600 } },
        { name: `← ${lowVal.toFixed(2)}`, coord: [lowIdx, lowVal], label: { formatter: `← ${lowVal.toFixed(2)}`, position: 'bottom', distance: 3, color: '#52c41a', fontWeight: 600 } },
      ],
    }
  }

  if (showMa) {
    const ma5 = data.map((d: any) => d.MA5 ?? null)
    const ma10 = data.map((d: any) => d.MA10 ?? null)
    const ma20 = data.map((d: any) => d.MA20 ?? null)
    series.push(
      { name: 'MA5', type: 'line', data: ma5, smooth: true, symbol: 'none', animationDurationUpdate: 0, lineStyle: { width: 1.5, color: '#f5222d' }, xAxisIndex: 0, yAxisIndex: 0 },
      { name: 'MA10', type: 'line', data: ma10, smooth: true, symbol: 'none', animationDurationUpdate: 0, lineStyle: { width: 1.5, color: '#fa8c16' }, xAxisIndex: 0, yAxisIndex: 0 },
      { name: 'MA20', type: 'line', data: ma20, smooth: true, symbol: 'none', animationDurationUpdate: 0, lineStyle: { width: 1.5, color: '#722ed1' }, xAxisIndex: 0, yAxisIndex: 0 },
    )
  }

  series.push({
    name: '成交量', type: 'bar', data: volumes,
    animationDurationUpdate: 0,
    xAxisIndex: 1, yAxisIndex: 1,
    itemStyle: { color: (p: any) => volColors[p.dataIndex] },
  })

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      triggerOn: 'click',
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      extraCssText: 'box-shadow: none;',
      formatter: () => '',
      axisPointer: {
        type: 'cross',
        crossStyle: { color: '#b0b8c1', width: 1, type: 'dashed' },
        label: { show: true, precision: 2, backgroundColor: '#333' },
      },
    },
    grid: [
      { left: 8, right: 8, top: 20, height: '56%' },
      { left: 8, right: 8, top: '76%', height: '20%' },
    ],
    xAxis: [
      { type: 'category', data: dates, axisLine: { onZero: false }, axisTick: { show: false }, axisLabel: { fontSize: 10, formatter: (v: string) => dateLabelMap[v] || v }, gridIndex: 0 },
      { type: 'category', data: dates, gridIndex: 1, axisTick: { show: false }, axisLabel: { show: false } },
    ],
    yAxis: [
      { type: 'value', scale: true, splitNumber: 5, axisLabel: { inside: true, fontSize: 10 }, gridIndex: 0 },
      { type: 'value', scale: true, splitNumber: 3, axisLabel: { inside: true, fontSize: 10, formatter: (v: number) => v >= 1e8 ? (v / 1e8).toFixed(1) + '亿' : v >= 1e4 ? (v / 1e4).toFixed(0) + '万' : v }, gridIndex: 1 },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: 75,
        end: 100,
        throttle: 0,
        minSpan: 5,
        maxSpan: 100,
        zoomOnMouseWheel: true,
        moveOnMouseWheel: true,
        moveOnMouseMove: true,
      },
    ],
    series,
  }
}

export const mobileMacdOption = (data: any[]) => {
  const dates = data.map((d: any) => d.date)
  const dif = data.map((d: any) => d.DIF ?? null)
  const dea = data.map((d: any) => d.DEA ?? null)
  const macd = data.map((d: any) => d.MACD ?? null)
  const macdColors = data.map((d: any) => (d.MACD ?? 0) >= 0 ? chartColors.up : chartColors.down)

  return {
    animation: true,
    animationDuration: 300,
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '3%', top: '6%', bottom: '6%' },
    xAxis: { type: 'category', data: dates, axisLabel: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
    series: [
      { name: 'DIF', type: 'line', data: dif, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: chartColors.primary } },
      { name: 'DEA', type: 'line', data: dea, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: chartColors.warning } },
      { name: 'MACD', type: 'bar', data: macd, itemStyle: { color: (p: any) => macdColors[p.dataIndex] } },
    ],
  }
}

export const mobileRsiOption = (data: any[]) => {
  const dates = data.map((d: any) => d.date)
  const rsi = data.map((d: any) => d.RSI ?? null)

  return {
    animation: true,
    animationDuration: 300,
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '3%', top: '6%', bottom: '6%' },
    xAxis: { type: 'category', data: dates, axisLabel: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 10 } },
    series: [{
      name: 'RSI', type: 'line', data: rsi, smooth: true, symbol: 'none',
      lineStyle: { width: 2, color: chartColors.purple },
      areaStyle: { color: 'rgba(114,46,209,0.06)' },
      markLine: {
        silent: true,
        data: [
          { yAxis: 70, label: { formatter: '超买', fontSize: 10 }, lineStyle: { color: chartColors.up, type: 'dashed' } },
          { yAxis: 30, label: { formatter: '超卖', fontSize: 10 }, lineStyle: { color: chartColors.down, type: 'dashed' } },
        ],
      },
    }],
  }
}
