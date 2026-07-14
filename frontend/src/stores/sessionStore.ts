import { create } from "zustand";
import type { ResearchSession, ResearchStage } from "../types";

interface SessionState {
  currentSession: ResearchSession | null;
  sessions: ResearchSession[];

  // Actions
  setCurrentSession: (session: ResearchSession) => void;
  setSessions: (sessions: ResearchSession[]) => void;
  updateStage: (stage: ResearchStage) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  currentSession: null,
  sessions: [],

  setCurrentSession: (session) => set({ currentSession: session }),

  setSessions: (sessions) => set({ sessions }),

  updateStage: (stage) =>
    set((state) => ({
      currentSession: state.currentSession
        ? { ...state.currentSession, current_stage: stage }
        : null,
    })),

  clearSession: () => set({ currentSession: null }),
}));
