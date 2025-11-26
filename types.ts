export enum QuestionType {
  SINGLE = 'Single Choice',
  MULTIPLE = 'Multiple Choice',
  JUDGMENT = 'True/False',
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndices: number[]; // 0-based indices
  explanation: string;
  type: QuestionType;
}

export interface QuestionBank {
  id: string;
  name: string;
  createdAt: number;
  questions: Question[];
}

export interface QuizConfig {
  enableTimer: boolean;
  timeLimit: number; // in seconds, 0 = no limit
  instantFeedback: boolean; // if true, shows correctness immediately
}

export interface QuizSession {
  id: string; // Unique ID for saving/resuming
  bankName: string; // Display name for the saved session
  questions: Question[];
  currentQuestionIndex: number;
  answers: Record<string, number[]>; // questionId -> selectedIndices
  status: 'active' | 'review' | 'finished';
  startTime: number;
  timeRemaining: number; // in seconds
  config: QuizConfig;
  lastUpdated: number;
}

export interface MistakeRecord {
  question: Question;
  consecutiveCorrect: number; // How many times answered correctly in a row
  lastReviewed: number;
  originalBankName?: string;
}

export type ViewState = 'HOME' | 'QUIZ' | 'RESULT';