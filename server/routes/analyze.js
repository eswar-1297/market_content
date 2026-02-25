import { Router } from 'express';
import { analyzeContent } from '../services/ruleEngine.js';

const router = Router();

/**
 * POST /api/analyze
 * Rule-based content analysis (no API key needed)
 * Body: { content: string, contentType: "html" | "text" }
 */
router.post('/', (req, res) => {
  try {
    const { content, contentType = 'text' } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Content is required and must be a string.'
      });
    }

    if (content.trim().length < 20) {
      return res.status(400).json({
        error: 'Content is too short. Please provide at least a few sentences to analyze.'
      });
    }

    const result = analyzeContent(content, contentType);
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze content.',
      details: error.message
    });
  }
});

export default router;
