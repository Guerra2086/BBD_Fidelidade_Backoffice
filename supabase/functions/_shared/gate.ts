import { SignJWT, jwtVerify } from 'npm:jose@5';

// "Gate session": o frontoffice não usa Supabase Auth (só uma palavra-passe partilhada).
// Depois de validar a password, gate-login emite este JWT, assinado com um segredo só do
// servidor (GATE_SESSION_SECRET). Todas as outras Edge Functions do frontoffice exigem
// este token no cabeçalho Authorization e recusam o pedido sem ele.
const ALG = 'HS256';
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias

function secretKey() {
  const secret = Deno.env.get('GATE_SESSION_SECRET');
  if (!secret) throw new Error('GATE_SESSION_SECRET não configurado.');
  return new TextEncoder().encode(secret);
}

export async function signGateToken(): Promise<string> {
  return new SignJWT({ v: 1 })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TTL_SECONDS)
    .sign(secretKey());
}

export async function verifyGateToken(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}
