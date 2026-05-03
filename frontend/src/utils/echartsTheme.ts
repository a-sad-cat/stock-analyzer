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

export const mobileKlineOption = (data: any[], opts?: { showMa?: boolean }) => {
  const showMa = opts?.showMa ?? true
  const dates = data.map((d: any) => d.date)
  const ohlc = data.map((d: any) => [d.open, d.close, d.low, d.high])
  const volumes = data.map((d: any) => d.volume)
  const volColors = data.map((d: any) => d.close >= d.open ? chartColors.up : chartColors.down)

  const series: any[] = [
    {
      name: 'K线', type: 'candlestick', data: ohlc,
      itemStyle: { color: chartColors.up, color0: chartColors.down, borderColor: chartColors.up, borderColor0: chartColors.down },
      xAxisIndex: 0, yAxisIndex: 0,
    },
  ]

  if (showMa) {
    const ma5 = data.map((d: any) => d.MA5 ?? null)
    const ma10 = data.map((d: any) => d.MA10 ?? null)
    const ma20 = data.map((d: any) => d.MA20 ?? null)
    series.push(
      { name: 'MA5', type: 'line', data: ma5, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#f5222d' }, xAxisIndex: 0, yAxisIndex: 0 },
      { name: 'MA10', type: 'line', data: ma10, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#fa8c16' }, xAxisIndex: 0, yAxisIndex: 0 },
      { name: 'MA20', type: 'line', data: ma20, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#722ed1' }, xAxisIndex: 0, yAxisIndex: 0 },
    )
  }

  series.push({
    name: '成交量', type: 'bar', data: volumes,
    xAxisIndex: 1, yAxisIndex: 1,
    itemStyle: { color: (p: any) => volColors[p.dataIndex] },
  })

  const formatVol = (v: number) => {
    if (!v) return '0'
    if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
    if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'
    return v.toFixed(0)
  }

  return {
    animation: true,
    animationDuration: 300,
    tooltip: {
      trigger: 'axis',
      triggerOn: 'click',
      axisPointer: {
        type: 'cross',
        crossStyle: { color: '#b0b8c1', width: 1, type: 'dashed' },
        label: { show: true, precision: 2, backgroundColor: '#333' },
      },
      formatter: (params: any) => {
        const k = params.find((p: any) => p.seriesName === 'K线')
        const v = params.find((p: any) => p.seriesName === '成交量')
        if (!k) return ''
        const d = k.data
        return [
          `<div style="font-size:12px;line-height:1.8">`,
          `<div style="margin-bottom:4px;color:#999">${k.axisValue}</div>`,
          `<div>开盘: <b>${d[0]?.toFixed(2) ?? '-'}</b></div>`,
          `<div>收盘: <b>${d[1]?.toFixed(2) ?? '-'}</b></div>`,
          `<div>最高: <b style="color:#f5222d">${d[3]?.toFixed(2) ?? '-'}</b></div>`,
          `<div>最低: <b style="color:#52c41a">${d[2]?.toFixed(2) ?? '-'}</b></div>`,
          v ? `<div>成交量: <b>${formatVol(v.data)}</b></div>` : '',
          `</div>`,
        ].join('')
      },
    },
    legend: { data: showMa ? ['K线', 'MA5', 'MA10', 'MA20'] : ['K线'], top: 0, textStyle: { fontSize: 11 } },
    grid: [
      { left: '3%', right: '3%', top: '14%', height: '54%' },
      { left: '3%', right: '3%', top: '74%', height: '18%' },
    ],
    xAxis: [
      { type: 'category', data: dates, axisLine: { onZero: false }, axisTick: { show: false }, axisLabel: { fontSize: 10 }, gridIndex: 0 },
      { type: 'category', data: dates, gridIndex: 1, axisTick: { show: false }, axisLabel: { show: false } },
    ],
    yAxis: [
      { type: 'value', scale: true, axisLabel: { fontSize: 10 }, gridIndex: 0 },
      { type: 'value', scale: true, axisLabel: { fontSize: 10, formatter: (v: number) => v >= 1e8 ? (v / 1e8).toFixed(1) + '亿' : v >= 1e4 ? (v / 1e4).toFixed(0) + '万' : v }, gridIndex: 1 },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: 75,
        end: 100,
        throttle: 30,
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
