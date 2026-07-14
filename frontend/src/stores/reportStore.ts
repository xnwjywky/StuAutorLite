import { create } from "zustand";
import type { ResearchReport } from "../types";

interface ReportState {
  report: ResearchReport | null;
  isGenerating: boolean;

  // Actions
  setReport: (report: ResearchReport) => void;
  setGenerating: (generating: boolean) => void;
  updateContent: (markdown: string) => void;
  clearReport: () => void;
}

export const useReportStore = create<ReportState>((set) => ({
  report: null,
  isGenerating: false,

  setReport: (report) => set({ report }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  updateContent: (content_markdown) =>
    set((state) => ({
      report: state.report ? { ...state.report, content_markdown } : null,
    })),
  clearReport: () => set({ report: null, isGenerating: false }),
}));
