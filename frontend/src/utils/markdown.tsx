/**
 * 轻量 Markdown → HTML 渲染器
 *
 * 处理： # / ## / ### 标题、**加粗**、- 无序列表、数字列表、空行分隔段落
 * 不处理表格、代码块、图片等（这些保持原样用 <pre> 展示）。
 */
import type { ReactNode } from "react";

export function renderMarkdown(md: string): ReactNode {
  const lines = md.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;
  let inList = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();


    // ── 标题 ──
    if (trimmed.startsWith("### ")) {
      if (inList) { inList = false; }
      elements.push(
        <h3 key={i} className="text-base font-bold text-gray-800 mt-5 mb-1">
          {inlineMarkdown(trimmed.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      if (inList) { inList = false; }
      elements.push(
        <h2 key={i} className="text-lg font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-200">
          {inlineMarkdown(trimmed.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      if (inList) { inList = false; }
      elements.push(
        <h1 key={i} className="text-xl font-extrabold text-gray-900 mt-6 mb-3 pb-2 border-b-2 border-gray-300">
          {inlineMarkdown(trimmed.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // ── 表格行（以 | 开头） ── 保持等宽
    if (trimmed.startsWith("|")) {
      if (inList) { inList = false; }
      // 收集连续的表格行
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const tableContent = tableLines.join("\n");
      elements.push(
        <pre key={i} className="text-[11px] font-mono text-gray-600 bg-gray-50 rounded-lg p-3 my-2 overflow-x-auto whitespace-pre">
          {tableContent}
        </pre>
      );
      continue;
    }

    // ── 空行 ──
    if (trimmed === "") {
      if (inList) { inList = false; }
      i++;
      continue;
    }

    // ── 无序列表 ──
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        inList = true;
        // 收集连续列表项
        const listItems: string[] = [];
        while (i < lines.length) {
          const t = lines[i].trim();
          if (t.startsWith("- ") || t.startsWith("* ")) {
            listItems.push(t.slice(2));
            i++;
          } else if (t === "" && i + 1 < lines.length &&
                     (lines[i + 1].trim().startsWith("- ") || lines[i + 1].trim().startsWith("* "))) {
            i++;
          } else {
            break;
          }
        }
        elements.push(
          <ul key={i} className="list-disc list-inside space-y-1 my-2 text-sm text-gray-700">
            {listItems.map((item, idx) => (
              <li key={idx}>{inlineMarkdown(item)}</li>
            ))}
          </ul>
        );
        inList = false;
      }
      else { i++; }
      continue;
    }

    // ── 数字列表 ──
    if (/^\d+\.\s/.test(trimmed)) {
      if (!inList) {
        inList = true;
        const listItems: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s/, ""));
          i++;
        }
        elements.push(
          <ol key={i} className="list-decimal list-inside space-y-1 my-2 text-sm text-gray-700">
            {listItems.map((item, idx) => (
              <li key={idx}>{inlineMarkdown(item)}</li>
            ))}
          </ol>
        );
        inList = false;
      }
      else { i++; }
      continue;
    }

    // ── 普通段落 ──
    if (inList) { inList = false; }
    // 收集连续非空行作为段落
    const pLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" &&
           !lines[i].trim().startsWith("#") &&
           !lines[i].trim().startsWith("|") &&
           !lines[i].trim().startsWith("- ") &&
           !lines[i].trim().startsWith("* ") &&
           !/^\d+\.\s/.test(lines[i].trim())) {
      pLines.push(lines[i].trim());
      i++;
    }
    if (pLines.length > 0) {
      elements.push(
        <p key={i} className="text-sm text-gray-700 leading-relaxed my-1">
          {inlineMarkdown(pLines.join(" "))}
        </p>
      );
    } else {
      i++;
    }
  }

  return <div className="markdown-body">{elements}</div>;
}

/** 行内 Markdown：**加粗** */
function inlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
