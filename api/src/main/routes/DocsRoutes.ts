import express from 'express';
import { openApiSpec } from '../docs/openapi';

// Swagger UI is loaded from a CDN, so this page needs its own, looser Content-Security-Policy
// than the one helmet applies to the JSON API.
const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self'",
].join('; ');

const loadDocsRoutes = function (app: express.Application) {
  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app.route(`${baseUrl}/docs/openapi.json`).get((_req: any, res: any) => {
    res.json(openApiSpec);
  });

  app.route(`${baseUrl}/docs`).get((_req: any, res: any) => {
    res.setHeader('Content-Security-Policy', DOCS_CSP);
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ICAN API</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: '${baseUrl}/docs/openapi.json', dom_id: '#swagger-ui', deepLinking: true });
    </script>
  </body>
</html>`);
  });
};

export default loadDocsRoutes;
