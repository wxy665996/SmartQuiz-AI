import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, X, Clock, Eye, EyeOff, Save } from 'lucide-react';
import { QuestionType, QuizSession } from '../types';
import { Button } from './Button';

interface QuizViewProps {
  session: QuizSession;
  onUpdateSession: (newSession: QuizSession) => void;
  onComplete: (finalSession: QuizSession) => void;
  onRequestExit: () => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const QuizView: React.FC<QuizViewProps> = ({ session, onUpdateSession, onComplete, onRequestExit }) => {
  const currentQ = session.questions[session.currentQuestionIndex];
  const totalQ = session.questions.length;
  
  // Local state for UI
  const [showExplanationText, setShowExplanationText] = useState(true);
  const [localTimeRemaining, setLocalTimeRemaining] = useState(session.timeRemaining);

  // Loading state to prevent race conditions during submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer Effect
  useEffect(() => {
    if (session.status !== 'active') return;

    const timer = setInterval(() => {
      setLocalTimeRemaining((prev) => {
        // If we have a time limit and hit 0, auto submit (logic could be expanded)
        if (session.config.enableTimer && session.config.timeLimit > 0) {
           if (prev <= 1) {
             clearInterval(timer);
             // handle timeout? For now just stop at 0
             return 0;
           }
           return prev - 1;
        } else {
           // Count up (or simply decrement from high number if we want to track duration)
           return prev - 1; 
        }
      });
    }, 1000);

    return () => {
        clearInterval(timer);
        // CRITICAL FIX: Removed the onUpdateSession call here.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  // Update session with time when navigating or answering
  const updateSessionSafe = (updates: Partial<QuizSession>) => {
      onUpdateSession({ 
          ...session, 
          ...updates,
          timeRemaining: localTimeRemaining 
      });
  };

  const currentSelections = session.answers[currentQ.id] || [];
  
  // Derived state: Is the current question submitted?
  const [isSubmitted, setIsSubmitted] = useState(!!session.answers[currentQ.id]);
  
  const [draftSelection, setDraftSelection] = useState<number[]>(
    session.answers[currentQ.id] || []
  );

  // Reset local state on question change or answer update
  useEffect(() => {
    const hasAnswer = !!session.answers[currentQ.id];
    setIsSubmitted(hasAnswer);
    
    // If the prop has updated with the answer, we can stop loading
    if (hasAnswer) setIsSubmitting(false);

    setDraftSelection(session.answers[currentQ.id] || []);
    // Reset visibility of explanation to default (true) when moving to next question (only if not already submitted)
    if (!hasAnswer) setShowExplanationText(true);
  }, [currentQ.id, session.answers]);

  const handleDraftSelect = (index: number) => {
    if (isSubmitted) return;
    if (currentQ.type === QuestionType.MULTIPLE) {
      setDraftSelection(prev => 
        prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
      );
    } else {
      setDraftSelection([index]);
    }
  };

  const confirmAnswer = () => {
    if (draftSelection.length === 0) return;
    setIsSubmitting(true); // Start loading state
    const newAnswers = { ...session.answers, [currentQ.id]: draftSelection };
    
    // Update session - we do NOT optimistically set isSubmitted here.
    // We wait for the parent to update the prop via useEffect above.
    updateSessionSafe({ answers: newAnswers });
  };

  const handleNext = () => {
    if (session.currentQuestionIndex < totalQ - 1) {
      updateSessionSafe({ currentQuestionIndex: session.currentQuestionIndex + 1 });
    } else {
      // Finalize
      const finalSession = { 
        ...session, 
        status: 'finished' as const, 
        timeRemaining: localTimeRemaining 
      };
      
      // Update parent state
      onUpdateSession(finalSession);
      
      // Pass the fully updated session to completion handler to avoid stale state in App
      onComplete(finalSession);
    }
  };

  const handlePrev = () => {
    if (session.currentQuestionIndex > 0) {
      updateSessionSafe({ currentQuestionIndex: session.currentQuestionIndex - 1 });
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  // Check correctness for UI feedback - ROBUST COMPARISON
  const isDraftCorrect = useMemo(() => {
     if (!isSubmitted) return false;
     // Convert to strings to avoid "1" vs 1 mismatches
     const correctSet = new Set(currentQ.correctIndices.map(String));
     const userSet = new Set(draftSelection.map(String));
     
     if (correctSet.size !== userSet.size) return false;
     for (let a of correctSet) if (!userSet.has(a)) return false;
     return true;
  }, [isSubmitted, draftSelection, currentQ]);


  // Timer Color
  const timerColor = (session.config.enableTimer && localTimeRemaining < 60) ? 'text-red-600 animate-pulse' : 'text-slate-600';

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-100px)]">
      {/* Header / Progress */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => {
              updateSessionSafe({}); // Sync time before requesting exit
              onRequestExit();
          }}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Library
          </Button>
          <div className="text-sm font-medium text-slate-500">
            Question {session.currentQuestionIndex + 1} of {totalQ}
          </div>
        </div>

        <div className="flex items-center gap-4">
            {session.config.enableTimer && (
                <div className={`flex items-center gap-2 font-mono text-lg font-medium ${timerColor} bg-slate-100 px-3 py-1 rounded-lg`}>
                    <Clock className="w-4 h-4" />
                    {formatTime(localTimeRemaining)}
                </div>
            )}
            
            <span className={`px-2 py-1 text-xs rounded font-medium ${
                currentQ.type === QuestionType.MULTIPLE ? 'bg-purple-100 text-purple-700' :
                currentQ.type === QuestionType.JUDGMENT ? 'bg-orange-100 text-orange-700' :
                'bg-blue-100 text-blue-700'
            }`}>
                {currentQ.type}
            </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pr-2">
        <h2 className="text-xl font-semibold text-slate-900 mb-6 leading-relaxed">
          {currentQ.text}
        </h2>

        <div className="space-y-3">
          {currentQ.options.map((option, idx) => {
            let stateStyle = "border-slate-200 hover:border-primary-300 hover:bg-slate-50";
            let icon = null;

            const isSelected = draftSelection.includes(idx);
            const isCorrectOption = currentQ.correctIndices.includes(idx);

            // Logic: Show results if Submitted AND Instant Feedback is ON
            const showFeedback = isSubmitted && session.config.instantFeedback;

            if (showFeedback) {
              if (isCorrectOption) {
                stateStyle = "border-green-500 bg-green-50 text-green-800 ring-1 ring-green-500";
                icon = <Check className="w-5 h-5 text-green-600" />;
              } else if (isSelected && !isCorrectOption) {
                stateStyle = "border-red-500 bg-red-50 text-red-800 ring-1 ring-red-500";
                icon = <X className="w-5 h-5 text-red-600" />;
              } else {
                 stateStyle = "border-slate-100 opacity-60";
              }
            } else if (isSelected) {
               // Draft selection state
               stateStyle = "border-primary-500 bg-primary-50 ring-1 ring-primary-500";
            }

            return (
              <button
                key={idx}
                onClick={() => handleDraftSelect(idx)}
                disabled={isSubmitted || isSubmitting}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3 group ${stateStyle}`}
              >
                <div className={`
                   flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium
                   ${isSelected && !isSubmitted ? 'border-primary-500 bg-primary-500 text-white' : 'border-slate-300 text-slate-500'}
                   ${showFeedback && isCorrectOption ? '!border-green-600 !bg-green-600 text-white' : ''}
                   ${showFeedback && isSelected && !isCorrectOption ? '!border-red-500 !bg-red-500 text-white' : ''}
                   ${isSubmitted && isSelected && !showFeedback ? '!border-primary-500 !bg-primary-500 text-white' : ''}
                `}>
                  {String.fromCharCode(65 + idx)}
                </div>
                <span className="flex-1 pt-0.5">{option}</span>
                {icon && <div className="flex-shrink-0 pt-0.5">{icon}</div>}
              </button>
            );
          })}
        </div>

        {/* Feedback Section */}
        {isSubmitted && session.config.instantFeedback && (
          <div className={`mt-8 rounded-xl border overflow-hidden ${isDraftCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="p-4 flex items-center justify-between border-b border-black/5">
                <div className="flex items-center gap-2">
                    <span className={`font-bold ${isDraftCorrect ? 'text-green-700' : 'text-red-700'}`}>
                        {isDraftCorrect ? 'Correct Answer!' : 'Incorrect'}
                    </span>
                </div>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowExplanationText(!showExplanationText)}
                    className="h-8 px-2 text-slate-600 hover:bg-black/5"
                >
                    {showExplanationText ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                    {showExplanationText ? 'Hide' : 'Show'} Explanation
                </Button>
            </div>
            
            {showExplanationText && (
                <div className="p-6">
                    <div className="text-sm text-slate-700 mb-4">
                        <span className="font-semibold block mb-1">Correct Answer:</span>
                        <div className="flex gap-2">
                            {currentQ.correctIndices.map(i => (
                                <span key={i} className="inline-block px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-medium text-xs">
                                    {currentQ.options[i]}
                                </span>
                            ))}
                        </div>
                    </div>

                    {currentQ.explanation && (
                        <div>
                            <span className="font-semibold text-slate-900 block mb-1 text-sm">Explanation:</span>
                            <p className="text-slate-600 text-sm leading-relaxed">{currentQ.explanation}</p>
                        </div>
                    )}
                </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between bg-white z-10">
         <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={session.currentQuestionIndex === 0 || isSubmitting}>
                Previous
            </Button>
         </div>

         <div className="flex gap-3">
            {!isSubmitted ? (
                <>
                    <Button variant="ghost" onClick={handleSkip} disabled={isSubmitting}>Skip</Button>
                    <Button 
                        onClick={confirmAnswer} 
                        disabled={draftSelection.length === 0 || isSubmitting}
                        isLoading={isSubmitting}
                    >
                        Submit Answer
                    </Button>
                </>
            ) : (
                <Button onClick={handleNext} variant={session.currentQuestionIndex === totalQ - 1 ? 'secondary' : 'primary'}>
                    {session.currentQuestionIndex === totalQ - 1 ? 'Finish Exam' : 'Next Question'}
                    {session.currentQuestionIndex !== totalQ - 1 && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
            )}
         </div>
      </div>
      
      {/* Mini Navigator */}
      <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex gap-1.5">
              {session.questions.map((q, idx) => {
                  const status = session.answers[q.id];
                  let colorClass = "bg-slate-100 text-slate-400 hover:bg-slate-200";
                  
                  if (idx === session.currentQuestionIndex) {
                      colorClass = "ring-2 ring-primary-500 ring-offset-1 bg-white text-primary-600 border border-primary-200";
                  } else if (status) {
                      if (session.config.instantFeedback) {
                           // Color coded by correctness if feedback is on
                           const correctSet = new Set(q.correctIndices.map(String));
                           const userSet = new Set(status.map(String));
                           let isRight = correctSet.size === userSet.size;
                           if(isRight) for(let a of correctSet) if(!userSet.has(a)) isRight = false;
                           colorClass = isRight ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
                      } else {
                           // Neutral color if exam mode
                           colorClass = "bg-primary-100 text-primary-700";
                      }
                  }

                  return (
                      <button 
                        key={idx}
                        onClick={() => {
                            if (!isSubmitting) updateSessionSafe({ currentQuestionIndex: idx });
                        }}
                        disabled={isSubmitting}
                        className={`flex-shrink-0 w-8 h-8 rounded text-xs font-medium transition-all ${colorClass}`}
                      >
                          {idx + 1}
                      </button>
                  )
              })}
          </div>
      </div>
    </div>
  );
};