import React from "react";

export function AdminTrendChart({ points, color, unit }) {
  if (points.length < 2) {
    return <div className="admin-empty-chart">Za prikaz trenda sta potrebna vsaj dva vnosa.</div>;
  }

  const values = points.map((point) => Number(point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 360;
  const height = 84;
  const stepX = width / (points.length - 1);
  const y = (value) => height - ((Number(value) - min) / range) * (height - 20) - 10;
  const coordinates = points.map((point, index) => `${index * stepX},${y(point.value)}`).join(" ");

  return (
    <div className="admin-trend">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trend vrednosti v ${unit}`}>
        <defs>
          <linearGradient id={`trend-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${height} ${coordinates} ${width},${height}`}
          fill={`url(#trend-${color.replace("#", "")})`}
        />
        <polyline points={coordinates} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={point.date} cx={index * stepX} cy={y(point.value)} r="3.5" fill="#fffdf8" stroke={color} strokeWidth="2" />
        ))}
      </svg>
      <div className="admin-trend__legend">
        <span>{points[0].date.slice(5)} · {points[0].value}{unit}</span>
        <span>{points.at(-1).date.slice(5)} · {points.at(-1).value}{unit}</span>
      </div>
    </div>
  );
}
