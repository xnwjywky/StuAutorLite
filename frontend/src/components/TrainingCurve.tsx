/**
 * MNIST 实时训练曲线 — Recharts
 * 即使无数据也展示坐标轴 + 占位区域，数据到来后渐进填充。
 */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  data?: { epoch: number; train_loss: number; val_loss: number; train_acc: number; val_acc: number }[];
  currentEpoch?: number;
  totalEpochs?: number;
}

function _placeholderData(epochs: number) {
  return Array.from({ length: epochs }, (_, i) => ({
    epoch: i + 1,
    train_loss: undefined as number | undefined,
    val_loss: undefined as number | undefined,
    train_acc: undefined as number | undefined,
    val_acc: undefined as number | undefined,
  }));
}

export default function TrainingCurve({ data = [], totalEpochs }: Props) {
  const displayData = data.length > 0 ? data : (totalEpochs ? _placeholderData(totalEpochs) : []);
  const hasData = data.length > 0;

  return (
    <div className="space-y-3">
      {/* Loss 曲线 — 始终展示坐标轴 */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 mb-1">损失曲线 (Loss)</h4>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={displayData.length > 0 ? displayData : [{ epoch: 1 }]} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="epoch" tick={{ fontSize: 10 }} domain={[1, 'dataMax']} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => v?.toFixed(4) || '-'} />
            <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
            {hasData && <Line type="monotone" dataKey="train_loss" name="训练损失" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} connectNulls />}
            {hasData && <Line type="monotone" dataKey="val_loss" name="验证损失" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 5" connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Accuracy 曲线 — 始终展示坐标轴 */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 mb-1">准确率曲线 (Accuracy)</h4>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={displayData.length > 0 ? displayData : [{ epoch: 1 }]} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="epoch" tick={{ fontSize: 10 }} domain={[1, 'dataMax']} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
            <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
            {hasData && <Line type="monotone" dataKey="train_acc" name="训练准确率" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} connectNulls />}
            {hasData && <Line type="monotone" dataKey="val_acc" name="验证准确率" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 5" connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
