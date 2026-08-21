import type { ErrorRequestHandler } from 'express';

/**
 * Last-resort catch for anything that reaches here uncaught — a route's own
 * try/catch (see combos.ts's SpellbookError handling) always wins first.
 * Without this registered, an uncaught throw fell through to Express's own
 * default handler: an HTML page with a stack trace, not a JSON API error
 * (docs/rules-audit.md item 18). The client only ever gets a generic
 * message; the real error (and its stack) goes to the server log.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  console.error(err);
  // Per Express's own error-handling docs: once headers are sent, the only
  // safe move is to delegate to Express's built-in handler, which closes
  // the connection — calling res.json() here would throw a second error.
  if (res.headersSent) {
    next(err);
    return;
  }
  // express.json() throws a SyntaxError with status 400 when the request
  // body isn't valid JSON, before any route handler runs — a client mistake,
  // not a server failure. Every route validates its own body and answers its
  // own status code once it does run (see combos.ts's SpellbookError
  // handling), so this is the only non-500 status body-parser can hand us.
  // Reporting it as a generic 500 mislabels a bad request as a server
  // incident to anything that branches on status code.
  if (err instanceof SyntaxError && (err as SyntaxError & { status?: number }).status === 400) {
    res.status(400).json({ error: 'Request body is not valid JSON.' });
    return;
  }
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
};
