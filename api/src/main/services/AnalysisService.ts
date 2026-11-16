import dotenv from 'dotenv';
import { AnalyzeResponse } from '../types/services/AnalysisService';
import { prepareForClassifier } from '../utils/prepareForClassifier';

dotenv.config();

class AnalysisService {
  async classify(text: string): Promise<AnalyzeResponse> {
    const analyzerUrl = process.env.ANALYZER_SERVICE_URL;
    if (!analyzerUrl) {
      throw new Error('ERROR: ANALYZER_SERVICE_URL is not configured');
    }

    let response: Response;
    try {
      response = await fetch(`${analyzerUrl}/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Markdown headings and lists make the classifier split clauses in the wrong places.
        body: JSON.stringify({ text: prepareForClassifier(text) }),
      });
    } catch {
      throw new Error('ERROR: Analyzer service unavailable');
    }

    if (!response.ok) {
      throw new Error(`ERROR: Analyzer service responded with status ${response.status}`);
    }

    return (await response.json()) as AnalyzeResponse;
  }
}

export default AnalysisService;
