import React, { useCallback, useState, useEffect } from 'react';
import { Upload, AlertCircle, CheckCircle, FileType } from 'lucide-react';
import { Button } from './Button';
import { parseDocumentToQuiz } from '../services/geminiService';
import { Question } from '../types';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Handle potential ESM default export mismatch for pdfjs-dist
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

interface FileUploaderProps {
  onQuizGenerated: (name: string, questions: Question[]) => void;
  apiKey: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onQuizGenerated, apiKey }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safely initialize PDF worker on mount, NOT at module level
  useEffect(() => {
    const initWorker = async () => {
      if (typeof window !== 'undefined' && pdfjs) {
        try {
           const workerUrl = `https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
           if (pdfjs.GlobalWorkerOptions) {
             pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
           } else {
             (pdfjs as any).GlobalWorkerOptions = { workerSrc: workerUrl };
           }
        } catch (e) {
          console.warn("PDF worker init warning:", e);
        }
      }
    };
    initWorker();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) validateAndSetFile(droppedFile);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (file: File) => {
    const fileName = file.name.toLowerCase();
    
    // Check for .doc specifically to give a helpful message
    if (file.type === 'application/msword' || fileName.endsWith('.doc')) {
        setError("Old Word format (.doc) is not supported. Please save as .docx or .pdf.");
        return;
    }

    const validExtensions = ['.pdf', '.txt', '.docx'];
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValid) {
      setError("Supported formats: .pdf, .docx, .txt");
      return;
    }
    
    if (file.size > 20 * 1024 * 1024) { // 20MB
      setError("File size must be under 20MB.");
      return;
    }
    setFile(file);
    setError(null);
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    
    if (!pdfjs) {
        throw new Error("PDF Library failed to load. Please try refreshing the page.");
    }

    // Use the resolved pdfjs object here
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + "\n\n";
    }
    return fullText;
  };

  const processFile = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      let extractedText = "";
      const fileName = file.name.toLowerCase();

      // 1. DOCX Extraction
      if (fileName.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
           try {
               const arrayBuffer = await file.arrayBuffer();
               // mammoth might be a default export or named export depending on environment
               const mammothLib = (mammoth as any).default || mammoth;
               
               if (!mammothLib || !mammothLib.extractRawText) {
                   throw new Error("Word processor library not initialized.");
               }
               
               const result = await mammothLib.extractRawText({ arrayBuffer });
               extractedText = result.value;
           } catch (docxError: any) {
               console.error("Docx parsing error", docxError);
               throw new Error(`Failed to read Word document: ${docxError.message || 'Unknown error'}`);
           }
      } 
      // 2. PDF Extraction
      else if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
           try {
               extractedText = await extractTextFromPDF(file);
           } catch (pdfError: any) {
               console.error("PDF parsing error", pdfError);
               throw new Error("Failed to read PDF. It might be password protected or a scanned image (OCR not supported in browser).");
           }
      }
      // 3. Text Extraction
      else {
          extractedText = await file.text();
      }

      if (!extractedText || !extractedText.trim()) {
          throw new Error("The document appears to be empty or text could not be extracted.");
      }

      // Send raw text to service for chunked processing
      const questions = await parseDocumentToQuiz(extractedText, apiKey);
      
      if (questions.length === 0) {
        throw new Error("No questions found. The document might not contain recognizable question formats.");
      }
      
      // Use filename as initial bank name (remove extension)
      const name = file.name.replace(/\.[^/.]+$/, "");
      onQuizGenerated(name, questions);
      setFile(null);
      
    } catch (err: any) {
      console.error("Processing error:", err);
      setError(err.message || "Failed to process file.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-800 mb-2">Import Quiz</h3>
      <p className="text-slate-500 text-sm mb-6">
        Upload a document (.pdf, .docx, .txt) containing questions. 
        <br/>
        <span className="text-xs text-slate-400">Large files will be automatically split and processed to extract all questions.</span>
      </p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 flex flex-col items-center justify-center min-h-[200px]
          ${isDragging 
            ? 'border-primary-500 bg-primary-50 scale-[1.02]' 
            : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'
          }
          ${isProcessing ? 'opacity-75 pointer-events-none' : ''}
        `}
      >
        <input
          type="file"
          accept=".pdf,.txt,.docx"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isProcessing}
        />
        
        {file ? (
          <div className="text-center z-10 pointer-events-none">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={24} />
            </div>
            <p className="font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="text-center z-10 pointer-events-none">
            <div className="w-12 h-12 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Upload size={24} />
            </div>
            <p className="font-medium text-slate-900">Click to upload or drag and drop</p>
            <p className="text-xs text-slate-500 mt-1">PDF, DOCX, or Text supported</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center">
          <AlertCircle size={16} className="mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {file && (
        <div className="mt-6 flex justify-end">
          <Button
            onClick={processFile}
            isLoading={isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Analyzing Document (this may take a moment)...' : 'Generate Question Bank'}
          </Button>
        </div>
      )}
    </div>
  );
};