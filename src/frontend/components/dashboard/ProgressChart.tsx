import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ProgressData {
  gameId: string;
  gameName: string;
  progress: number;
  nextMilestone: string;
}

interface ProgressChartProps {
  data: ProgressData[];
}

const ProgressChart: React.FC<ProgressChartProps> = ({ data }) => {
  const chartData = data.map(item => ({
    name: item.gameName.length > 10 ? item.gameName.substring(0, 10) + '...' : item.gameName,
    progress: item.progress,
    fullName: item.gameName,
    nextMilestone: item.nextMilestone
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold">{data.fullName}</p>
          <p className="text-blue-600">{`Progress: ${data.progress}%`}</p>
          <p className="text-gray-600 text-sm">{`Next: ${data.nextMilestone}`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar 
            dataKey="progress" 
            fill="#3B82F6"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProgressChart;