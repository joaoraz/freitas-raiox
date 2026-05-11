export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nome, empresa, email, cargo, telefone, campo1, campo2, code } = req.body;
    if (!email || !nome || !code) return res.status(400).json({ error: 'nome, email e code obrigatórios' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'comercial@freitascomex.com.br';
    const FROM = process.env.FROM_EMAIL || 'Freitas Comex <onboarding@resend.dev>';
    const DASH_URL = process.env.DASHBOARD_URL || 'https://freitas-raiox.vercel.app/dashboard.html';
    const LOGO_URL = process.env.LOGO_URL || 'https://freitas-raiox.vercel.app/logo-freitas.png';
    const firstName = nome.split(' ')[0];

    const C_PRIMARY = '#2c2d65', C_SECONDARY = '#ce0f69', C_ACCENT = '#ff9e1b';
    const C_MUTED = '#5a5a8a', C_DIM = '#9595b8', C_CARD = '#F7F6FB', C_BORDER = '#E5E2F0';

    const leadEmail = {
      from: FROM, to: [email],
      subject: `${code} — Seu acesso ao Raio-X do Comex Brasileiro`,
      html: `<body style="margin:0;padding:0;background:${C_CARD};font-family:-apple-system,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C_CARD};padding:32px 16px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
<tr><td style="background:linear-gradient(135deg,${C_PRIMARY} 0%,${C_SECONDARY} 100%);padding:36px 32px;border-radius:16px 16px 0 0;text-align:center">
<img src="${LOGO_URL}" alt="Freitas" width="140" style="margin:0 auto 16px;display:block;filter:brightness(0) invert(1)" />
<h1 style="color:#FFF;font-size:20px;font-weight:800;margin:0">Raio-X do Comércio Exterior Brasileiro</h1>
<p style="color:rgba(255,255,255,0.7);font-size:13px;margin:8px 0 0">Seu código de acesso exclusivo</p>
</td></tr>
<tr><td style="background:#FFF;padding:36px 32px">
<p style="font-size:16px;color:${C_PRIMARY};line-height:1.6;margin:0">Olá, <strong>${firstName}</strong>!</p>
<p style="font-size:14px;color:${C_MUTED};line-height:1.7;margin:16px 0 0">Obrigado pelo interesse no nosso material de inteligência. Use o código abaixo junto com este e-mail para acessar o dashboard interativo do Raio-X do Comex Brasileiro 2026.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="background:${C_CARD};border:2px dashed ${C_BORDER};border-radius:12px;padding:24px;text-align:center">
<p style="font-size:11px;font-weight:700;color:${C_DIM};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">Código de acesso</p>
<p style="font-size:32px;font-weight:800;color:${C_SECONDARY};letter-spacing:0.15em;font-family:Courier New,monospace;margin:0">${code}</p>
<p style="font-size:12px;color:${C_DIM};margin:8px 0 0">Vinculado a: ${email}</p>
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px">
<a href="${DASH_URL}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,${C_SECONDARY},${C_ACCENT});color:#FFF;text-decoration:none;border-radius:28px;font-weight:800;font-size:15px">Abrir o Dashboard</a>
</td></tr></table>
<p style="font-size:12px;color:${C_DIM};margin:24px 0 0;text-align:center">Guarde este e-mail para acessar novamente.</p>
</td></tr>
<tr><td style="background:${C_CARD};padding:24px 32px;border-radius:0 0 16px 16px;text-align:center">
<p style="font-size:11px;color:${C_DIM};margin:0">© 2026 Freitas Comex · Itajaí (SC) · freitascomex.com.br</p>
</td></tr></table></td></tr></table></body>`
    };

    const notifyEmail = {
      from: FROM, to: [NOTIFY_TO],
      subject: `[Lead Raio-X] ${nome} — ${empresa}`,
      html: `<body style="font-family:-apple-system,sans-serif;margin:0;padding:0;background:${C_CARD}">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:${C_CARD}"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#FFF;border-radius:12px;overflow:hidden">
<tr><td style="background:${C_PRIMARY};padding:20px 24px"><h2 style="color:#FFF;font-size:16px;margin:0;font-weight:800">Novo lead — Raio-X Comex</h2></td></tr>
<tr><td style="padding:24px"><table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
<tr><td style="padding:8px 0;color:${C_DIM};width:130px">Nome</td><td style="padding:8px 0;color:${C_PRIMARY};font-weight:700">${nome}</td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">Empresa</td><td style="padding:8px 0;color:${C_PRIMARY};font-weight:700">${empresa}</td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">Cargo</td><td style="padding:8px 0;color:${C_PRIMARY}">${cargo || '—'}</td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">E-mail</td><td style="padding:8px 0"><a href="mailto:${email}" style="color:${C_SECONDARY}">${email}</a></td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">Telefone</td><td style="padding:8px 0;color:${C_PRIMARY}">${telefone || '—'}</td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">Volume/ano</td><td style="padding:8px 0;color:${C_PRIMARY}">${campo1 || '—'}</td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">Setor</td><td style="padding:8px 0;color:${C_PRIMARY}">${campo2 || '—'}</td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">Código</td><td style="padding:8px 0;color:${C_SECONDARY};font-weight:800;font-family:monospace">${code}</td></tr>
<tr><td style="padding:8px 0;color:${C_DIM}">Data</td><td style="padding:8px 0;color:${C_PRIMARY}">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>
</table></td></tr></table></td></tr></table></body>`
    };

    const results = await Promise.allSettled([
      fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(leadEmail) }),
      fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(notifyEmail) })
    ]);
    const leadResult = results[0].status === 'fulfilled' ? await results[0].value.json() : { error: results[0].reason };
    return res.status(200).json({ ok: true, emailId: leadResult.id || null });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}