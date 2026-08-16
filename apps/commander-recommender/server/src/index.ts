import express from 'express';
import compression from 'compression';
import cors from 'cors';
import recommendRouter from './routes/recommend';
import combosRouter from './routes/combos';
import metaRouter from './routes/meta';

const app = express();

// If CLIENT_ORIGIN is set (e.g. your deployed frontend's URL), restrict CORS
// to that origin. Otherwise allow any origin, which is fine for local dev
// and for a hobby project with no auth or sensitive data behind the API.
const clientOrigin = process.env.CLIENT_ORIGIN;
app.use(cors(clientOrigin ? { origin: clientOrigin } : undefined));

// Recommendation responses are large and extremely repetitive — the same
// handful of your cards is cited under many commanders — so they compress
// about 30:1. A 12.2 MB body measured here goes out as 0.41 MB.
//
// Left at the default level (6) deliberately: level 1 would save ~27ms of
// CPU and cost 0.49 MB on the wire, which is the wrong way round for a
// server that is nowhere near CPU-bound and clients that may be on a phone.
app.use(compression());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', recommendRouter);
app.use('/api', combosRouter);
app.use('/api', metaRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
