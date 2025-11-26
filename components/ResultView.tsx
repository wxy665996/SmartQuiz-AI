import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Question, QuizSession } from '../types';
import { Button } from './Button';
import { RotateCcw, Home } from 'lucide-react';

interface ResultViewProps {
  session: QuizSession;
  onRetry: () => void;
  onHome: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ session, onRetry, onHome }) => {
  let correctCount = 0;
  let skippedCount = 0;
  let incorrectCount = 0;

  session.questions.forEach(q => {
    const answer = session.answers[q.id];
    if (!answer || answer.length === 0) {
      skippedCount++;
      return;
    }
    
    // Robust comparison handles potential string vs number type mismatches from JSON parsing
    const correctSet = new Set(q.correctIndices.map(String));
    const userSet = new Set(answer.map(String));
    
    let isRight = correctSet.size === userSet.size;
    if (isRight) {
      for (let a of correctSet) if (!userSet.has(a)) isRight = false;
    }
    
    if (isRight) correctCount++;
    else incorrectCount++;
  });

  const total = session.questions.length;
  // Prevent NaN if total is 0
  const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const data = [
    { name: 'Correct', value: correctCount, color: '#22c55e' },
    { name: 'Incorrect', value: incorrectCount, color: '#ef4444' },
    { name: 'Skipped', value: skippedCount, color: '#94a3b8' },
  ].filter(d => d.value > 0);

  return (
    <div className="max-w-3xl mx-auto p-6 text-center">
      <h2 className="text-3xl font-bold text-slate-900 mb-2">Exam Complete!</h2>
      <p className="text-slate-500 mb-8">Here is how you performed</p>

      <div className="grid md:grid-cols-2 gap-8 items-center mb-12">
        <div className="h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-4xl font-bold text-slate-800">{percentage}%</span>
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Score</span>
            </div>
        </div>

        <div className="grid grid-cols-1 gap-4 text-left">
            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                <p className="text-sm text-green-600 font-medium">Correct Answers</p>
                <p className="text-2xl font-bold text-green-700">{correctCount} <span className="text-sm font-normal opacity-75">/ {total}</span></p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                <p className="text-sm text-red-600 font-medium">Incorrect Answers</p>
                <p className="text-2xl font-bold text-red-700">{incorrectCount}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-sm text-slate-600 font-medium">Skipped</p>
                <p className="text-2xl font-bold text-slate-700">{skippedCount}</p>
            </div>
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={onHome} size="lg">
            <Home className="w-5 h-5 mr-2" />
            Back to Library
        </Button>
        <Button onClick={onRetry} size="lg">
            <RotateCcw className="w-5 h-5 mr-2" />
            Retake Exam
        </Button>
      </div>
    </div>
  );
};