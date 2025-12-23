import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GenerationParams {
  max_tokens: number;
  temperature: number;
  top_p: number;
}

export interface RunHistoryItem {
  id: string;
  timestamp: number;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  output: string;
  params: GenerationParams;
  type: 'completion' | 'chat';
}

interface AppState {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  
  history: RunHistoryItem[];
  addToHistory: (item: RunHistoryItem) => void;
  clearHistory: () => void;
  
  activeModelId: string;
  setActiveModelId: (id: string) => void;
  
  generationParams: GenerationParams;
  setGenerationParams: (params: Partial<GenerationParams>) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      apiKey: null,
      setApiKey: (key) => set({ apiKey: key }),
      
      history: [],
      addToHistory: (item) => set((state) => ({ history: [item, ...state.history] })),
      clearHistory: () => set({ history: [] }),
      
      activeModelId: 'microsoft/Phi-3.5-mini-instruct',
      setActiveModelId: (id) => set({ activeModelId: id }),
      
      generationParams: {
        max_tokens: 512,
        temperature: 0.7,
        top_p: 0.9,
      },
      setGenerationParams: (params) => 
        set((state) => ({ 
          generationParams: { ...state.generationParams, ...params } 
        })),
    }),
    {
      name: 'hf-lab-storage',
    }
  )
);
