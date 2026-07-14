interface PagePlaceholderProps {
  title: string;
  step: number;
  description?: string;
  hint?: string;
}

export default function PagePlaceholder({
  title,
  step,
  description,
  hint,
}: PagePlaceholderProps) {
  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="card text-center py-16">
        {/* 步骤编号 */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 text-primary-600 text-2xl font-bold mb-6">
          {step}
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-3">{title}</h1>

        {description && (
          <p className="text-gray-500 max-w-md mx-auto mb-4">{description}</p>
        )}

        {hint && (
          <div className="inline-block bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700">
            {hint}
          </div>
        )}

        <p className="text-gray-400 text-sm mt-8">
          此页面将在后续版本中实现完整功能
        </p>
      </div>
    </div>
  );
}
