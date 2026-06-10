require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

const PORT           = process.env.PORT || 3000;
const SUPABASE_URL   = process.env.SUPABASE_URL   || '';
const SUPABASE_ANON  = process.env.SUPABASE_ANON_KEY || '';

// Inyecta config de Supabase al frontend
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.SUPABASE_URL="${SUPABASE_URL}";window.SUPABASE_ANON_KEY="${SUPABASE_ANON}";`);
});

app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Polla NODO corriendo en :${PORT}`));
