import { Router } from 'express';
import { generateFanoutQueries } from '../services/fanoutService.js';

const router = Router();

router.post('/fanout', async (req, res) => {
  try {
    const { main_query, domain, max_fanouts, provider } = req.body;

    if (!main_query || typeof main_query !== 'string' || !main_query.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'main_query is required and cannot be empty',
      });
    }

    const fanouts = parseInt(max_fanouts) || 10;
    if (fanouts < 1 || fanouts > 20) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'max_fanouts must be between 1 and 20',
      });
    }

    const aiProvider = ['openai', 'gemini', 'both'].includes(provider) ? provider : 'openai';

    const result = await generateFanoutQueries(
      main_query.trim(),
      domain || undefined,
      fanouts,
      aiProvider
    );

    res.json(result);
  } catch (error) {
    console.error('Error in /api/fanout:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
