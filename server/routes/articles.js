import express from 'express';
import { getArticles, getAuthors } from '../services/articlesService.js';

const router = express.Router();

router.get('/articles', async (req, res) => {
  try {
    const { author, period } = req.query;
    const articles = await getArticles({ author, period });
    res.json({ articles, total: articles.length });
  } catch (err) {
    console.error('Articles fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

router.get('/articles/authors', async (req, res) => {
  try {
    const authors = await getAuthors();
    res.json({ authors });
  } catch (err) {
    console.error('Authors fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch authors' });
  }
});

export default router;
