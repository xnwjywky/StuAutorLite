import { useState } from "react";

interface MarkdownEditorProps {
  initialContent: string;
  sessionId: string;
}

export default function MarkdownEditor({
  initialContent,
  sessionId: _sessionId,
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`}
            onClick={() => setPreview(false)}
          >
            编辑
          </button>
          <button
            className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`}
            onClick={() => setPreview(true)}
          >
            预览
          </button>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm">AI 润色</button>
          <button className="btn-primary text-sm">保存报告</button>
          <button className="btn-secondary text-sm">导出 PDF</button>
        </div>
      </div>

      {/* 编辑 / 预览区 */}
      {preview ? (
        <div className="prose max-w-none min-h-[400px] border rounded-lg p-4 bg-white">
          {/* TODO: 使用 markdown 渲染库 */}
          <pre className="whitespace-pre-wrap font-sans text-gray-700">
            {content}
          </pre>
        </div>
      ) : (
        <textarea
          className="w-full min-h-[400px] p-4 border rounded-lg font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}
    </div>
  );
}
