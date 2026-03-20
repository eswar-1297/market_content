import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

/**
 * Microsoft Entra ID (Azure AD) JWT verification middleware.
 *
 * Validates the Bearer token sent from the MSAL-authenticated frontend.
 * Uses the new app registration (AUTH_CLIENT_ID / AUTH_TENANT_ID) — separate
 * from the SharePoint service principal (MS_CLIENT_ID / MS_TENANT_ID).
 *
 * On success, attaches req.user with { id, email, name, tenantId }.
 */

const AUTH_TENANT_ID = () => process.env.AUTH_TENANT_ID;
const AUTH_CLIENT_ID = () => process.env.AUTH_CLIENT_ID;

let _jwksClient = null;

function getJwksClient() {
  if (_jwksClient) return _jwksClient;
  const tenantId = AUTH_TENANT_ID();
  if (!tenantId) throw new Error('AUTH_TENANT_ID not configured');

  _jwksClient = jwksRsa({
    jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxAge: 86400000,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
  });
  return _jwksClient;
}

function getSigningKey(header) {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

export function requireAuth(req, res, next) {
  const tenantId = AUTH_TENANT_ID();
  const clientId = AUTH_CLIENT_ID();

  if (!tenantId || !clientId) {
    console.warn('Auth middleware: AUTH_TENANT_ID or AUTH_CLIENT_ID not set — skipping auth');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in with Microsoft.' });
  }

  const token = authHeader.split(' ')[1];

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  getSigningKey(decoded.header)
    .then(signingKey => {
      jwt.verify(
        token,
        signingKey,
        {
          algorithms: ['RS256'],
          audience: clientId,
          issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        },
        (err, payload) => {
          if (err) {
            console.error('Token verification failed:', err.message);
            return res.status(401).json({ error: 'Invalid or expired token. Please sign in again.' });
          }

          req.user = {
            id: payload.oid,
            email: payload.preferred_username || payload.email || payload.upn,
            name: payload.name,
            tenantId: payload.tid,
          };
          next();
        }
      );
    })
    .catch(err => {
      console.error('Failed to get signing key:', err.message);
      return res.status(401).json({ error: 'Authentication service unavailable' });
    });
}
