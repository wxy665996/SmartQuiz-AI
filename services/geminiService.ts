import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Question, QuestionType } from "../types";

const parseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: {
            type: Type.STRING,
            description: "The content of the question in the original language of the document.",
          },
          type: {
            type: Type.STRING,
            description: "The type of question. Expected values: 'Single Choice', 'Multiple Choice', 'True/False'.",
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of possible answers in the original language.",
          },
          correctIndices: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: "Array of 0-based indices corresponding to the correct options.",
          },
          explanation: {
            type: Type.STRING,
            description: "Detailed explanation of why the answer is correct (in original language).",
          },
        },
        required: ["text", "type", "options", "correctIndices", "explanation"],
      },
    },
  },
  required: ["questions"],
};

// Helper to attempt repairing truncated JSON
function repairJSON(jsonStr: string): string {
  try {
    JSON.parse(jsonStr);
    return jsonStr;
  } catch (e) {
    // continue
  }

  let trimmed = jsonStr.trim();
  if (trimmed.startsWith("```json")) trimmed = trimmed.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  if (trimmed.startsWith("```")) trimmed = trimmed.replace(/^```\s*/, "").replace(/\s*```$/, "");

  const openBracket = trimmed.indexOf('[');
  if (openBracket === -1) return "{}";

  const lastComma = trimmed.lastIndexOf("},");
  if (lastComma > openBracket) {
      return trimmed.substring(0, lastComma + 1) + "]}";
  }
  if (trimmed.endsWith("}")) {
    return trimmed + "]}"; 
  }

  return trimmed;
}

// Split text into safe chunks to avoid token limits
function chunkText(text: string, chunkSize: number = 12000): string[] {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = "";
  
  for (const line of lines) {
    if ((currentChunk + line).length > chunkSize) {
      if (currentChunk.trim()) chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += line + "\n";
  }
  if (currentChunk.trim()) chunks.push(currentChunk);
  return chunks;
}

export const parseDocumentToQuiz = async (
  documentText: string,
  apiKey: string
): Promise<Question[]> => {
  if (!apiKey) throw new Error("API Key is required");

  const ai = new GoogleGenAI({ apiKey });
  const modelId = "gemini-2.5-flash";

  // Split document into manageable chunks
  const chunks = chunkText(documentText);
  let allQuestions: Question[] = [];

  console.log(`Processing ${chunks.length} chunks...`);

  // Process chunks in parallel (limit concurrency if needed, but 3-5 chunks is usually fine)
  const chunkPromises = chunks.map(async (chunk, index) => {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            {
              text: `Analyze the following text segment (Part ${index + 1} of a document) and extract all practice questions, quizzes, or exam items.
              
              Text Segment:
              """
              ${chunk}
              """
              
              IMPORTANT: 
              1. Output 'text', 'options', and 'explanation' in the SAME language as the document (e.g., Chinese).
              2. Format output strictly as JSON.
              3. If a question is cut off at the beginning or end of this segment, IGNORE it. Only extract complete questions.
              
              Type Mapping:
              - '${QuestionType.SINGLE}' (Use for 单选题 / Single Choice)
              - '${QuestionType.MULTIPLE}' (Use for 多选题 / Multiple Choice / Checkbox)
              - '${QuestionType.JUDGMENT}' (Use for 判断题 / True/False)

              Rules:
              - Clean extracted options (remove 'A.', 'B.', '1)' prefixes).
              - Determine 0-based correct indices.
              - Provide an explanation in the original language.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: parseSchema,
          temperature: 0.1,
          safetySettings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        },
      });

      let text = response.text;
      if (!text && response.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = response.candidates[0].content.parts[0].text;
      }

      if (!text) return [];

      text = text.trim();
      if (text.startsWith("```json")) text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      else if (text.startsWith("```")) text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // Try repair
        const repaired = repairJSON(text);
        try { data = JSON.parse(repaired); } catch (e2) { return []; }
      }

      if (data && Array.isArray(data.questions)) {
        return data.questions;
      }
      return [];

    } catch (err) {
      console.warn(`Failed to process chunk ${index}:`, err);
      return [];
    }
  });

  const results = await Promise.all(chunkPromises);

  // Flatten results
  results.forEach(qs => {
    allQuestions = [...allQuestions, ...qs];
  });

  if (allQuestions.length === 0) {
     // If pure text extraction failed to yield results, user might have uploaded something else or empty.
     // But we return empty array here and let FileUploader handle the error message.
     return [];
  }

  // Post-processing: Assign unique IDs and normalize
  return allQuestions.map((q: any, index: number) => {
      let type = q.type;
      if (typeof type === 'string') {
        const lower = type.toLowerCase();
        if (lower.includes('multiple') || lower.includes('check') || lower.includes('多选')) type = QuestionType.MULTIPLE;
        else if (lower.includes('true') || lower.includes('false') || lower.includes('judgment') || lower.includes('判断')) type = QuestionType.JUDGMENT;
        else type = QuestionType.SINGLE;
      } else {
        type = QuestionType.SINGLE;
      }

      return {
        ...q,
        type,
        id: `q-${Date.now()}-${index}`,
      };
  });
};