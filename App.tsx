import React, { useState, useEffect } from 'react';
import { Plus, BookOpen, Trash2, Edit2, Play, Grid, Clock, Settings, Save, X, History, AlertTriangle, BrainCircuit, RefreshCw } from 'lucide-react';
import { QuestionBank, QuizSession, ViewState, Question, MistakeRecord, QuestionType } from './types';
import { FileUploader } from './components/FileUploader';
import { QuizView } from './components/QuizView';
import { ResultView } from './components/ResultView';
import { Button } from './components/Button';

// Mock storage keys
const STORAGE_KEY = 'smartquiz_banks_v1';
const SESSION_KEY = 'smartquiz_sessions_v1';
const MISTAKES_KEY = 'smartquiz_mistakes_v1';

// Threshold to remove from mistakes (mastery)
const MASTERY_THRESHOLD = 3;

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
             <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
               <AlertTriangle size={32} />
             </div>
             <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
             <p className="text-slate-500 mb-6 text-sm">
               {this.state.error?.message || "An unexpected error occurred. Please try refreshing the page."}
             </p>
             <Button onClick={() => window.location.reload()} className="w-full justify-center">
               <RefreshCw className="w-4 h-4 mr-2" />
               Reload Application
             </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [savedSessions, setSavedSessions] = useState<QuizSession[]>([]);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  
  const [view, setView] = useState<ViewState>('HOME');
  const [session, setSession] = useState<QuizSession | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  
  // Modals state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [bankToDelete, setBankToDelete] = useState<string | null>(null);

  // Exam Configuration
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [timeLimitInput, setTimeLimitInput] = useState<number>(0); // Minutes
  const [instantFeedback, setInstantFeedback] = useState<boolean>(true);

  // Editing state
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const apiKey = process.env.API_KEY || '';

  useEffect(() => {
    // Load banks
    const savedBanks = localStorage.getItem(STORAGE_KEY);
    if (savedBanks) {
      try {
        setBanks(JSON.parse(savedBanks));
      } catch (e) { console.error(e); }
    }
    
    // Load saved sessions
    const savedSess = localStorage.getItem(SESSION_KEY);
    if (savedSess) {
        try {
            setSavedSessions(JSON.parse(savedSess));
        } catch (e) { console.error(e); }
    }

    // Load mistakes
    const savedMistakes = localStorage.getItem(MISTAKES_KEY);
    if (savedMistakes) {
        try {
            setMistakes(JSON.parse(savedMistakes));
        } catch (e) { console.error(e); }
    }
  }, []);

  const saveBanks = (newBanks: QuestionBank[]) => {
    setBanks(newBanks);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newBanks));
  };
  
  const updateSavedSessions = (newSessions: QuizSession[]) => {
      setSavedSessions(newSessions);
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSessions));
  };

  const saveMistakes = (newMistakes: MistakeRecord[]) => {
      setMistakes(newMistakes);
      localStorage.setItem(MISTAKES_KEY, JSON.stringify(newMistakes));
  };

  // --------------------------------------------------------------------------
  // Mistake Logic
  // --------------------------------------------------------------------------
  const updateMistakesDatabase = (finishedSession: QuizSession) => {
    let currentMistakes = [...mistakes];
    let madeChanges = false;

    // Map existing mistakes for fast lookup
    const mistakeMap = new Map<string, MistakeRecord>();
    currentMistakes.forEach(m => mistakeMap.set(m.question.id, m));

    // Iterate through answers in the session
    Object.entries(finishedSession.answers).forEach(([qId, userIndices]) => {
        const question = finishedSession.questions.find(q => q.id === qId);
        if (!question) return;

        // Check Correctness
        const correctSet = new Set(question.correctIndices);
        const userSet = new Set(userIndices);
        let isRight = correctSet.size === userSet.size;
        if (isRight) for (let a of correctSet) if (!userSet.has(a)) isRight = false;

        const existingRecord = mistakeMap.get(qId);

        if (isRight) {
            // If correct and in mistakes, increment counter
            if (existingRecord) {
                existingRecord.consecutiveCorrect += 1;
                existingRecord.lastReviewed = Date.now();
                
                // Check Mastery
                if (existingRecord.consecutiveCorrect >= MASTERY_THRESHOLD) {
                    // Remove from map (will be filtered out when rebuilding list)
                    mistakeMap.delete(qId);
                }
                madeChanges = true;
            }
        } else {
            // If incorrect
            if (existingRecord) {
                // Reset consecutive correct
                existingRecord.consecutiveCorrect = 0;
                existingRecord.lastReviewed = Date.now();
            } else {
                // Add new mistake
                mistakeMap.set(qId, {
                    question,
                    consecutiveCorrect: 0,
                    lastReviewed: Date.now(),
                    originalBankName: finishedSession.bankName
                });
            }
            madeChanges = true;
        }
    });

    if (madeChanges) {
        saveMistakes(Array.from(mistakeMap.values()));
    }
  };

  const startMistakeReview = () => {
      if (mistakes.length === 0) return;
      
      const allQuestions = mistakes.map(m => m.question).sort(() => Math.random() - 0.5); // Shuffle
      
      const newSession: QuizSession = {
          id: Date.now().toString(),
          bankName: "Mistake Notebook Review",
          questions: allQuestions,
          currentQuestionIndex: 0,
          answers: {},
          status: 'active',
          startTime: Date.now(),
          lastUpdated: Date.now(),
          timeRemaining: 0, // Unlimited time for review usually
          config: {
              enableTimer: false,
              timeLimit: 0,
              instantFeedback: true // Review usually has feedback on
          }
      };
      
      setSession(newSession);
      setView('QUIZ');
  };

  // --------------------------------------------------------------------------
  // Bank Management
  // --------------------------------------------------------------------------

  const handleQuizGenerated = (name: string, questions: Question[]) => {
    const newBank: QuestionBank = {
      id: Date.now().toString(),
      name: name || `Question Bank ${banks.length + 1}`,
      createdAt: Date.now(),
      questions,
    };
    saveBanks([...banks, newBank]);
    setShowUpload(false);
  };

  const requestDeleteBank = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBankToDelete(id);
  };

  const confirmDeleteBank = () => {
    if (bankToDelete) {
      saveBanks(banks.filter(b => b.id !== bankToDelete));
      const newSelected = new Set(selectedBankIds);
      newSelected.delete(bankToDelete);
      setSelectedBankIds(newSelected);
      setBankToDelete(null);
    }
  };

  const startRename = (bank: QuestionBank, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBankId(bank.id);
    setEditName(bank.name);
  };

  const saveRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBankId) {
      const newBanks = banks.map(b => b.id === editingBankId ? { ...b, name: editName } : b);
      saveBanks(newBanks);
      setEditingBankId(null);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedBankIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedBankIds(newSet);
  };

  const openExamConfig = () => {
    if (selectedBankIds.size === 0) return;
    setShowConfigModal(true);
  };

  const startExam = () => {
    // Aggregate questions
    let allQuestions: Question[] = [];
    const selectedBanks = banks.filter(b => selectedBankIds.has(b.id));
    selectedBanks.forEach(b => {
      allQuestions = [...allQuestions, ...b.questions];
    });

    // Shuffle
    allQuestions = allQuestions.sort(() => Math.random() - 0.5);

    // Config logic
    const limitSeconds = timeLimitInput > 0 ? timeLimitInput * 60 : 0;
    
    // Create Bank Name String
    const displayTitle = selectedBanks.length > 1 ? `${selectedBanks[0].name} + ${selectedBanks.length - 1} others` : selectedBanks[0].name;

    const newSession: QuizSession = {
      id: Date.now().toString(),
      bankName: displayTitle,
      questions: allQuestions,
      currentQuestionIndex: 0,
      answers: {},
      status: 'active',
      startTime: Date.now(),
      lastUpdated: Date.now(),
      timeRemaining: limitSeconds > 0 ? limitSeconds : 0, // 0 means no countdown or count up
      config: {
          enableTimer: limitSeconds > 0,
          timeLimit: limitSeconds,
          instantFeedback: instantFeedback
      }
    };

    setSession(newSession);
    setShowConfigModal(false);
    setView('QUIZ');
  };
  
  const resumeSession = (savedSession: QuizSession) => {
      setSession(savedSession);
      const remaining = savedSessions.filter(s => s.id !== savedSession.id);
      updateSavedSessions(remaining);
      setView('QUIZ');
  };
  
  const deleteSavedSession = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      updateSavedSessions(savedSessions.filter(s => s.id !== id));
  };

  // Exit Logic
  const handleRequestExit = () => {
      setShowExitConfirm(true);
  };
  
  const confirmSaveAndExit = () => {
      if (session) {
          // Update mistakes based on what was answered so far
          updateMistakesDatabase(session);

          // Update last updated
          const updatedSession = { ...session, lastUpdated: Date.now() };
          const others = savedSessions.filter(s => s.id !== session.id);
          updateSavedSessions([updatedSession, ...others]);
      }
      setSession(null);
      setShowExitConfirm(false);
      setView('HOME');
  };
  
  const confirmDiscardAndExit = () => {
      setSession(null);
      setShowExitConfirm(false);
      setView('HOME');
  };

  // Completion Logic
  const handleExamComplete = (finalSession: QuizSession) => {
      // Use the final session state passed from QuizView to ensure we have the last answer and status
      if (finalSession) {
          updateMistakesDatabase(finalSession);
          setSession(finalSession); // Ensure App state matches final state
      } else if (session) {
          // Fallback if somehow not passed
          updateMistakesDatabase(session);
      }
      setView('RESULT');
  };

  // Main Render
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
                if (view === 'QUIZ') handleRequestExit();
                else setView('HOME');
            }}>
              <div className="bg-primary-600 text-white p-1.5 rounded-lg">
                <BookOpen size={20} />
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">SmartQuiz AI</h1>
            </div>
            {view === 'HOME' && (
              <Button size="sm" onClick={() => setShowUpload(!showUpload)} variant={showUpload ? 'secondary' : 'primary'}>
                {showUpload ? 'Cancel' : 'New Import'}
                {!showUpload && <Plus className="ml-2 w-4 h-4" />}
              </Button>
            )}
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {view === 'HOME' && (
            <>
              {showUpload && (
                <div className="mb-10 animate-fade-in-down">
                  <FileUploader onQuizGenerated={handleQuizGenerated} apiKey={apiKey} />
                </div>
              )}

              {/* Dashboard Stats / Mistake Notebook */}
              {!showUpload && (
                  <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Mistake Notebook Card */}
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-orange-200 p-6 flex flex-col justify-between relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                              <AlertTriangle size={100} className="text-orange-500" />
                          </div>
                          <div>
                              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-2">
                                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                                  Mistake Notebook
                              </h2>
                              <p className="text-slate-600 text-sm mb-4">
                                  Review questions you've missed. Correctly answer 3 times in a row to master them.
                              </p>
                              <div className="flex items-baseline gap-2">
                                  <span className="text-4xl font-bold text-slate-900">{mistakes.length}</span>
                                  <span className="text-slate-500 text-sm">questions pending</span>
                              </div>
                          </div>
                          <div className="mt-6">
                              <Button 
                                  onClick={startMistakeReview} 
                                  disabled={mistakes.length === 0}
                                  className="w-full bg-orange-600 hover:bg-orange-700 text-white border-transparent focus:ring-orange-500"
                              >
                                  <BrainCircuit className="w-4 h-4 mr-2" />
                                  Start Review Session
                              </Button>
                          </div>
                      </div>

                      {/* Quick Stats or Promo */}
                      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-center items-center text-center">
                          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3">
                              <BookOpen size={24} />
                          </div>
                          <h3 className="font-bold text-slate-900">Total Question Banks</h3>
                          <p className="text-3xl font-bold text-primary-600 mt-1">{banks.length}</p>
                          <p className="text-xs text-slate-400 mt-2">Upload more documents to grow your library</p>
                      </div>
                  </div>
              )}

              {/* Resume Section */}
              {!showUpload && savedSessions.length > 0 && (
                  <div className="mb-10">
                      <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4">
                          <History className="w-5 h-5 text-indigo-500" />
                          Continue Learning
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {savedSessions.map(s => {
                              const progress = Math.round((Object.keys(s.answers).length / s.questions.length) * 100);
                              return (
                                  <div key={s.id} onClick={() => resumeSession(s)} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all relative group">
                                      <div className="flex justify-between items-start mb-2">
                                          <h3 className="font-bold text-slate-800 truncate pr-6">{s.bankName}</h3>
                                          <button 
                                              onClick={(e) => deleteSavedSession(s.id, e)}
                                              className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3"
                                          >
                                              <X size={16} />
                                          </button>
                                      </div>
                                      <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                                          <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                                      </div>
                                      <div className="flex justify-between text-xs text-slate-500">
                                          <span>{progress}% Complete</span>
                                          <span>{new Date(s.lastUpdated).toLocaleDateString()}</span>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {/* Empty State */}
              {!showUpload && banks.length === 0 && savedSessions.length === 0 && mistakes.length === 0 && (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-100 rounded-full mb-6">
                    <BookOpen className="w-10 h-10 text-slate-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">No question banks yet</h2>
                  <p className="text-slate-500 max-w-md mx-auto mb-8">
                    Upload a PDF, Word doc, or text file with practice questions. AI will automatically structure them.
                  </p>
                  <Button onClick={() => setShowUpload(true)} size="lg">
                    <Plus className="w-5 h-5 mr-2" />
                    Import First Quiz
                  </Button>
                </div>
              )}

              {/* Bank Grid */}
              {banks.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Grid className="w-5 h-5 text-slate-400" />
                        Your Library
                      </h2>
                      {selectedBankIds.size > 0 && (
                        <div className="flex items-center gap-4 animate-fade-in">
                          <span className="text-sm text-slate-600 font-medium">
                            {selectedBankIds.size} selected
                          </span>
                          <Button onClick={openExamConfig} className="shadow-lg shadow-primary-500/20">
                            <Play className="w-4 h-4 mr-2 fill-current" />
                            Start Exam
                          </Button>
                        </div>
                      )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {banks.map(bank => (
                        <div 
                          key={bank.id}
                          onClick={() => toggleSelection(bank.id)}
                          className={`
                            group relative bg-white rounded-xl p-6 border-2 transition-all cursor-pointer hover:shadow-md
                            ${selectedBankIds.has(bank.id) 
                              ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' 
                              : 'border-slate-100 hover:border-primary-200'
                            }
                          `}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 mr-4">
                              {editingBankId === bank.id ? (
                                <form onSubmit={saveRename} onClick={e => e.stopPropagation()}>
                                  <input 
                                    autoFocus
                                    type="text" 
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onBlur={() => setEditingBankId(null)}
                                    className="w-full text-lg font-bold text-slate-900 border-b-2 border-primary-500 focus:outline-none bg-transparent"
                                  />
                                </form>
                              ) : (
                                <h3 className="text-lg font-bold text-slate-900 line-clamp-2 leading-snug">
                                  {bank.name}
                                </h3>
                              )}
                              <p className="text-xs text-slate-400 mt-1">
                                {new Date(bank.createdAt).toLocaleDateString()} • {bank.questions.length} Questions
                              </p>
                            </div>
                            <div className={`
                              w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
                              ${selectedBankIds.has(bank.id) ? 'bg-primary-500 border-primary-500' : 'border-slate-300'}
                            `}>
                              {selectedBankIds.has(bank.id) && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pt-2 border-t border-slate-100 mt-2 relative z-10">
                            <button 
                              onClick={(e) => startRename(bank, e)}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                              title="Rename"
                            >
                              <Edit2 size={16} />
                            </button>
                            <div className="flex-1" />
                            <button 
                              onClick={(e) => requestDeleteBank(bank.id, e)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          {view === 'QUIZ' && session && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 h-[calc(100vh-8rem)]">
              <QuizView 
                session={session}
                onUpdateSession={setSession}
                onComplete={handleExamComplete}
                onRequestExit={handleRequestExit}
              />
            </div>
          )}

          {view === 'RESULT' && session && (
            <ResultView 
              session={session} 
              onRetry={() => {
                setSession({
                  ...session,
                  currentQuestionIndex: 0,
                  answers: {},
                  status: 'active',
                  startTime: Date.now(),
                  timeRemaining: session.config.timeLimit // Reset timer
                });
                setView('QUIZ');
              }}
              onHome={() => setView('HOME')}
            />
          )}
        </main>

        {/* Exam Configuration Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-slate-500" />
                    Exam Settings
                  </h3>
              </div>
              <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        Time Limit (Minutes)
                    </label>
                    <input 
                        type="number" 
                        min="0"
                        value={timeLimitInput}
                        onChange={(e) => setTimeLimitInput(parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        placeholder="0 for no limit"
                    />
                    <p className="text-xs text-slate-400 mt-1">Set to 0 for unlimited time.</p>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div>
                        <span className="block font-medium text-slate-900">Instant Feedback</span>
                        <span className="text-xs text-slate-500">Show answers and explanations immediately after submitting.</span>
                    </div>
                    <button 
                        onClick={() => setInstantFeedback(!instantFeedback)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${instantFeedback ? 'bg-primary-600' : 'bg-slate-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${instantFeedback ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
              </div>
              <div className="p-6 border-t border-slate-100 flex gap-3 bg-slate-50">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowConfigModal(false)}>Cancel</Button>
                  <Button className="flex-1" onClick={startExam}>Start Exam</Button>
              </div>
            </div>
          </div>
        )}

        {/* Exit Confirmation Modal */}
        {showExitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden text-center">
              <div className="p-6">
                  <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Save size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Save Progress?</h3>
                  <p className="text-slate-500 text-sm">
                    You are about to exit the exam. Would you like to save your current progress so you can resume later?
                  </p>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                  <Button onClick={confirmSaveAndExit} className="w-full">
                    Save & Exit
                  </Button>
                  <Button variant="danger" onClick={confirmDiscardAndExit} className="w-full">
                    Discard & Exit
                  </Button>
                  <Button variant="ghost" onClick={() => setShowExitConfirm(false)} className="w-full">
                    Cancel
                  </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Bank Confirmation Modal */}
        {bankToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden text-center">
              <div className="p-6">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Question Bank?</h3>
                  <p className="text-slate-500 text-sm">
                    Are you sure you want to delete this question bank? This action cannot be undone.
                  </p>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                  <Button variant="danger" onClick={confirmDeleteBank} className="w-full">
                    Delete Permanently
                  </Button>
                  <Button variant="ghost" onClick={() => setBankToDelete(null)} className="w-full">
                    Cancel
                  </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}