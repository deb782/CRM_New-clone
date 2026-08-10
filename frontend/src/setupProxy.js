// Serve the Agrocorp CRM (Laravel on :8000) through the React dev server so the
// Emergent preview URL renders the app. The platform reserves /api for port 8001,
// so the frontend calls /crm-api/* which we rewrite to /api/* on the way to Laravel.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    createProxyMiddleware({
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
      ws: false,
      logLevel: 'silent',
      pathRewrite: { '^/crm-api/': '/api/' },
    })
  );
};
