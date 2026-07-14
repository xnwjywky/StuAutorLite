/** 测试 format 工具函数 */
import { describe, it, expect } from "vitest";
import { formatRuntime, formatPercent, formatDate } from "../format";

describe("formatRuntime", () => {
  it("<1ms 格式化", () => {
    expect(formatRuntime(0.3)).toBe("<1ms");
    expect(formatRuntime(0)).toBe("<1ms");
  });
  it("毫秒格式化", () => {
    expect(formatRuntime(15)).toBe("15ms");
    expect(formatRuntime(999)).toBe("999ms");
  });
  it("秒格式化", () => {
    expect(formatRuntime(1000)).toBe("1.00s");
    expect(formatRuntime(2550)).toBe("2.55s");
    expect(formatRuntime(10000)).toBe("10.00s");
  });
  it("大数值", () => {
    expect(formatRuntime(60000)).toBe("60.00s");
  });
});

describe("formatPercent", () => {
  it("格式化比例", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.0)).toBe("0%");
    expect(formatPercent(1.0)).toBe("100%");
    expect(formatPercent(0.333)).toBe("33%");
  });
});

describe("formatDate", () => {
  it("格式化 ISO 字符串", () => {
    const result = formatDate("2026-07-09T10:30:00Z");
    expect(result).toMatch(/2026\/07\/09/);
    expect(result).toMatch(/(10|18):30/); // 时区可能调整
  });
  it("处理无效日期", () => {
    const result = formatDate("invalid");
    // 不同 runtime 行为不同 (NaN/Invalid Date 均可接受)
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});
