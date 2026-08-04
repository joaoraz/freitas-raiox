import crypto from 'node:crypto';

/**
 * POST /api/lead
 *
 * Recebe as conversões das duas páginas do Raio-X e cria/atualiza o contato no
 * RD Station pela API de Conversão 1.3.
 *
 *   LP (/lp.html)     -> identificador raio-x-lp
 *                        marca a tag de segmentação que dispara a automação de e-mail
 *                        gera o token de identidade e grava em cf_raio_x_token
 *
 *   Material (/)      -> identificador raio-x-fale-com-especialista
 *                        é o "fale com a Freitas", o que vira negócio
 *
 * Identidade: o e-mail da automação leva ?t=<token> no link do material. O token
 * é o e-mail cifrado, então quem clica já vem identificado e não precisa digitar
 * o e-mail de novo. Isso evita a pessoa informar um endereço diferente e virar
 * um contato duplicado.
 *
 * Variáveis de ambiente (Vercel):
 *   RD_TOKEN_PUBLICO  token da API de Conversão do RD
 *   RAIOX_SECRET      segredo para cifrar/decifrar o token de identidade
 */

const RD_URL = 'https://www.rdstation.com.br/api/1.3/conversions';
const TAG_SEGMENTACAO = 'raio-x-lead';

const IDENTIFICADOR = {
  lp: 'raio-x-lp',
  diagnostico: 'raio-x-diagnostico',
  material: 'raio-x-fale-com-especialista',
};

// 'diagnostico' é enriquecimento silencioso: a pessoa terminou as 8 perguntas e
// já está identificada pelo token, então salvamos as respostas sem pedir nada.
// Só 'material' representa intenção comercial e serve de gatilho para o negócio.

// mapeia o que a página manda para as opções exatas cadastradas no RD
const IMPORTA_EXPORTA = {
  importa: 'Importa',
  exporta: 'Exporta',
  ambos: 'Ambos',
  nenhum: 'Nenhum',
  Importo: 'Importa',
  Exporto: 'Exporta',
  Ambos: 'Ambos',
  Nenhum: 'Nenhum',
};

const chave = () =>
  crypto.createHash('sha256').update(String(process.env.RAIOX_SECRET || '')).digest();

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dado = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dado]).toString('base64url');
}

function decifrar(token) {
  try {
    const b = Buffer.from(String(token), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const ehEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || ''));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN_RD = process.env.RD_TOKEN_PUBLICO;
  const SEGREDO = process.env.RAIOX_SECRET;

  // health check: diz só se a configuração chegou, nunca o valor
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      rd_token_presente: !!TOKEN_RD,
      raiox_secret_presente: !!SEGREDO,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ erro: 'method not allowed' });

  if (!TOKEN_RD || !SEGREDO) {
    return res.status(500).json({
      erro: 'variaveis de ambiente ausentes',
      rd_token_presente: !!TOKEN_RD,
      raiox_secret_presente: !!SEGREDO,
    });
  }

  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const origem = IDENTIFICADOR[b.origem] ? b.origem : 'material';

    // o token manda mais que o campo digitado: é a identidade de quem clicou no e-mail
    const emailDoToken = b.token ? decifrar(b.token) : null;
    const email = ehEmail(emailDoToken) ? emailDoToken : String(b.email || '').trim();

    if (!ehEmail(email)) return res.status(400).json({ erro: 'email invalido' });

    // o diagnóstico não pede nada na tela, então não exige nome
    if (origem !== 'diagnostico' && !String(b.nome || '').trim()) {
      return res.status(400).json({ erro: 'nome obrigatorio' });
    }

    const payload = {
      token_rdstation: TOKEN_RD,
      identificador: IDENTIFICADOR[origem],
      email,
      tags: ['raio-x-comex-2025'],
    };

    // no diagnóstico só o que foi respondido; nos outros, os dados do formulário
    if (origem !== 'diagnostico') {
      payload.nome = String(b.nome).trim();
      payload.empresa = String(b.empresa || '').trim();
      payload.telefone = String(b.telefone || '').trim();
      payload.cf_seu_cargo = String(b.cargo || '').trim();
    }

    if (b.importa_exporta) {
      const v = IMPORTA_EXPORTA[b.importa_exporta] || IMPORTA_EXPORTA[String(b.importa_exporta).toLowerCase()];
      if (v) payload.cf_sua_empresa_importa_ou_exporta_final = v;
    }

    // origem da visita, senão o RD registra "Desconhecido"
    const u = b.utm || {};
    if (u.source) payload.traffic_source = u.source;
    if (u.medium) payload.traffic_medium = u.medium;
    if (u.campaign) payload.traffic_campaign = u.campaign;
    if (u.content) payload.traffic_value = u.content;

    // respostas do diagnóstico, quando vierem
    const d = b.diagnostico || {};
    const DIAG = {
      score: 'cf_raio_x_score',
      faixa: 'cf_raio_x_faixa_de_maturidade',
      importou_12m: 'cf_raio_x_importou_nos_ultimos_12_meses',
      controle_tributos: 'cf_raio_x_controle_de_tributos',
      regime_especial: 'cf_raio_x_regime_especial',
      tempo_desembaraco: 'cf_raio_x_tempo_de_desembaraco',
      visibilidade_carga: 'cf_raio_x_visibilidade_da_carga',
      multa_ou_retencao: 'cf_raio_x_multa_ou_retencao',
      equipe_comex: 'cf_raio_x_equipe_de_comex',
      analisa_dados: 'cf_raio_x_analisa_dados',
    };
    for (const k in DIAG) if (d[k] !== undefined && d[k] !== null && d[k] !== '') payload[DIAG[k]] = String(d[k]);

    let tokenNovo = null;
    if (origem === 'lp') {
      payload.tags.push(TAG_SEGMENTACAO);
      tokenNovo = cifrar(email);
      // guardado no contato também, para o caso de precisarmos montar um link depois
      payload.cf_raio_x_token = tokenNovo;
    }

    const r = await fetch(RD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const corpo = await r.text();

    if (!r.ok) {
      console.error('RD respondeu', r.status, corpo.slice(0, 200));
      return res.status(502).json({ erro: 'rd_falhou', status: r.status });
    }

    // o token volta para o navegador guardar: é assim que a pessoa segue
    // identificada ao entrar no material logo depois do cadastro, sem precisar
    // de link no e-mail nem de digitar o e-mail outra vez
    return res.status(200).json({
      ok: true,
      origem,
      identificador: payload.identificador,
      ...(tokenNovo ? { token: tokenNovo } : {}),
    });
  } catch (e) {
    console.error('api/lead:', e);
    return res.status(500).json({ erro: 'falha interna' });
  }
}
