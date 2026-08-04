/**
 * Raio-X do Comex 2025 — captura de lead
 * Raz · 04/08/2026
 *
 * Um arquivo serve as duas páginas:
 *   /lp.html  cadastro, vai pro RD e marca a tag que dispara o e-mail com o material
 *   /         "Fale com um especialista", vai pro RD e vira negócio
 *
 * Identidade: o link do e-mail vem com ?t=<token>. Com token, o campo de e-mail
 * some e a pessoa não tem como informar outro endereço, então a conversão cai no
 * mesmo contato. Sem token (veio do anúncio, ou link compartilhado), o campo
 * aparece normalmente.
 *
 * Não depende de classe nem de estilo do bundle: acha o formulário pelo texto do
 * botão e as respostas do diagnóstico ouvindo os cliques.
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/lead';
  var PAGINA = /lp\.html$/i.test(location.pathname) ? 'lp' : 'material';
  var CHAVE_TOKEN = 'raiox_t';

  // ------------------------------------------------------------------ token
  (function guardaToken() {
    try {
      var t = new URLSearchParams(location.search).get('t');
      if (t) localStorage.setItem(CHAVE_TOKEN, t);
    } catch (e) {}
  })();

  function token() {
    try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch (e) { return ''; }
  }

  // -------------------------------------------------------------- utilidades
  function dl(evento, extra) {
    window.dataLayer = window.dataLayer || [];
    var d = { event: evento, raiox_pagina: PAGINA };
    if (extra) for (var k in extra) d[k] = extra[k];
    window.dataLayer.push(d);
  }

  function utms() {
    var p = new URLSearchParams(location.search), o = {};
    ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) {
      var v = p.get('utm_' + k);
      if (v) o[k] = v;
    });
    return o;
  }

  function texto(el) { return (el && el.innerText ? el.innerText : '').trim(); }

  // --------------------------------------------------- diagnóstico (8 respostas)
  var CHAVES = ['importou_12m', 'controle_tributos', 'regime_especial', 'tempo_desembaraco',
    'visibilidade_carga', 'multa_ou_retencao', 'equipe_comex', 'analisa_dados'];
  var respostas = {};

  function blocoDiagnostico() {
    var divs = document.querySelectorAll('div');
    for (var i = divs.length - 1; i >= 0; i--) {
      var t = texto(divs[i]);
      if (t.length > 3000) continue;
      if (/importou nos últimos 12 meses/i.test(t) && /Analisa dados das importa/i.test(t)) return divs[i];
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    var bloco = blocoDiagnostico();
    if (!bloco || !bloco.contains(btn)) return;
    var botoes = [].slice.call(bloco.querySelectorAll('button')).slice(0, 24);
    var idx = botoes.indexOf(btn);
    if (idx < 0) return;
    respostas[CHAVES[Math.floor(idx / 3)]] = texto(btn);
    guardaRespostas();
    if (Object.keys(respostas).length === 8) dl('raiox_diagnostico_concluido');
  }, true);

  // Guarda as respostas no navegador. Serve para quem chegou sem token: as
  // respostas seguem junto quando (e se) a pessoa preencher o formulário.
  var CHAVE_DIAG = 'raiox_diag';
  function guardaRespostas() {
    try { localStorage.setItem(CHAVE_DIAG, JSON.stringify(respostas)); } catch (e) {}
  }
  (function recupera() {
    try {
      var s = JSON.parse(localStorage.getItem(CHAVE_DIAG) || '{}');
      for (var k in s) if (CHAVES.indexOf(k) >= 0) respostas[k] = s[k];
    } catch (e) {}
  })();

  /**
   * Quando a pessoa abre o resultado e já está identificada pelo token, as 8
   * respostas e o score vão pro RD na hora, sem pedir nada. Isso enriquece o
   * contato; quem vira negócio é só o formulário de "Fale com um especialista".
   */
  var diagnosticoEnviado = false;
  function salvarDiagnostico() {
    if (diagnosticoEnviado || !token()) return;
    if (Object.keys(respostas).length < 8) return;
    var res = lerResultado();
    if (res.score === null) return; // ainda não abriu o resultado

    diagnosticoEnviado = true;
    var diag = JSON.parse(JSON.stringify(respostas));
    diag.score = res.score;
    if (res.faixa) diag.faixa = res.faixa;

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origem: 'diagnostico', token: token(), diagnostico: diag, utm: utms(), pagina: location.href })
    })
      .then(function (r) { if (r.ok) dl('raiox_diagnostico_salvo', { raiox_score: res.score }); })
      .catch(function () { diagnosticoEnviado = false; });
  }

  // o resultado aparece depois de um clique, então checamos logo após qualquer um
  document.addEventListener('click', function () { setTimeout(salvarDiagnostico, 400); }, true);

  /**
   * O cartão de resultado mostra o número, a linha "de 100" e a faixa abaixo.
   * O preview do topo tem um "73/100" fixo que NÃO é o score de ninguém, por isso
   * a busca é restrita ao cartão que tem "de 100" e o botão "Refazer".
   */
  function lerResultado() {
    var divs = document.querySelectorAll('div');
    for (var i = divs.length - 1; i >= 0; i--) {
      var t = texto(divs[i]);
      if (t.length > 900) continue;
      if (!/\bde 100\b/.test(t) || !/Refazer/i.test(t)) continue;
      var linhas = t.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      var pos = -1;
      for (var k = 0; k < linhas.length; k++) if (/^de 100$/i.test(linhas[k])) { pos = k; break; }
      if (pos < 1) continue;
      var score = parseInt(linhas[pos - 1], 10);
      return {
        score: isNaN(score) ? null : score,
        faixa: linhas[pos + 1] && linhas[pos + 1].length < 40 ? linhas[pos + 1] : null
      };
    }
    return { score: null, faixa: null };
  }

  // ------------------------------------------------------------- formulários
  var CONFIG = {
    lp: {
      textoBotao: /Acessar material/i,
      campos: { nome: /Como podemos te chamar/i, email: /E-mail corporativo/i, empresa: /Empresa que voc/i, cargo: /Cargo/i },
      pedeImportaExporta: false
    },
    material: {
      textoBotao: /Solicitar diagn/i,
      campos: { nome: /Nome completo/i, email: /E-mail corporativo/i, empresa: /^Empresa$/i, cargo: /Cargo/i, telefone: /Telefone/i },
      pedeImportaExporta: true
    }
  }[PAGINA];

  var OPCOES_IE = ['Importa', 'Exporta', 'Ambos', 'Nenhum'];

  function acharFormulario() {
    var botoes = document.querySelectorAll('button');
    for (var i = 0; i < botoes.length; i++) {
      if (!CONFIG.textoBotao.test(texto(botoes[i]))) continue;
      if (botoes[i].closest('a')) continue; // o botão de WhatsApp do diagnóstico é um link
      var caixa = botoes[i].parentElement;
      for (var k = 0; k < 4 && caixa; k++, caixa = caixa.parentElement) {
        if (caixa.querySelectorAll('input[type=text], input:not([type]), input[type=email]').length >= 3) {
          return { botao: botoes[i], caixa: caixa };
        }
      }
    }
    return null;
  }

  function acharCampo(caixa, regex) {
    var ins = caixa.querySelectorAll('input');
    for (var i = 0; i < ins.length; i++) {
      if (ins[i].type === 'range') continue;
      if (regex.test(ins[i].placeholder || '')) return ins[i];
    }
    return null;
  }

  function copiaEstilo(de, para) {
    if (!de) return;
    var cs = getComputedStyle(de);
    ['padding', 'borderRadius', 'border', 'fontSize', 'boxSizing', 'color', 'fontFamily'].forEach(function (p) {
      para.style[p] = cs[p];
    });
    para.style.width = '100%';
    para.style.outline = 'none';
  }

  function montarSelect(modelo) {
    var wrap = document.createElement('div');
    wrap.setAttribute('data-raiox', 'importa-exporta');
    wrap.style.marginBottom = '8px';
    var sel = document.createElement('select');
    sel.id = 'raiox-importa-exporta';
    sel.required = true;
    copiaEstilo(modelo, sel);
    sel.style.appearance = 'none';
    sel.style.cursor = 'pointer';

    var vazio = document.createElement('option');
    vazio.value = ''; vazio.textContent = 'Sua empresa importa ou exporta? *';
    vazio.disabled = true; vazio.selected = true;
    sel.appendChild(vazio);
    OPCOES_IE.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o; op.textContent = o;
      sel.appendChild(op);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  function esconderEmail(campoEmail) {
    if (!campoEmail || campoEmail.getAttribute('data-raiox-oculto')) return;
    campoEmail.setAttribute('data-raiox-oculto', '1');
    campoEmail.style.display = 'none';

    var aviso = document.createElement('div');
    aviso.setAttribute('data-raiox', 'identificado');
    aviso.style.cssText = 'font-size:12.5px;color:#5a5a8a;background:#f7f6fb;border-radius:8px;padding:10px 12px;margin-bottom:8px;line-height:1.5';
    aviso.innerHTML = 'Vamos usar o e-mail do seu cadastro. ' +
      '<a href="#" data-raiox="trocar" style="color:#ce0f69;text-decoration:underline">Usar outro e-mail</a>';
    campoEmail.parentNode.insertBefore(aviso, campoEmail);

    aviso.querySelector('[data-raiox="trocar"]').addEventListener('click', function (ev) {
      ev.preventDefault();
      try { localStorage.removeItem(CHAVE_TOKEN); } catch (e) {}
      campoEmail.style.display = '';
      campoEmail.removeAttribute('data-raiox-oculto');
      aviso.remove();
      campoEmail.focus();
    });
  }

  function ligar() {
    var f = acharFormulario();
    if (!f || f.botao.getAttribute('data-raiox-ligado')) return;
    f.botao.setAttribute('data-raiox-ligado', '1');

    var campos = {};
    for (var nome in CONFIG.campos) campos[nome] = acharCampo(f.caixa, CONFIG.campos[nome]);

    var selIE = f.caixa.querySelector('select');
    if (CONFIG.pedeImportaExporta && !selIE && !f.caixa.querySelector('[data-raiox="importa-exporta"]')) {
      var bloco = montarSelect(campos.email || campos.nome);
      f.botao.parentNode.insertBefore(bloco, f.botao);
      selIE = bloco.querySelector('select');
    }

    if (token() && campos.email) esconderEmail(campos.email);

    f.botao.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();

      var dados = {};
      for (var n in campos) if (campos[n]) dados[n] = (campos[n].value || '').trim();
      var temToken = !!token();

      if (!dados.nome || !dados.empresa) return avisar(f.botao, 'Preencha nome e empresa.');
      if (!temToken && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email || '')) {
        return avisar(f.botao, 'Confira o e-mail.');
      }
      if (selIE && !selIE.value) return avisar(f.botao, 'Selecione se a empresa importa ou exporta.');

      var payload = {
        origem: PAGINA,
        nome: dados.nome,
        email: dados.email || '',
        empresa: dados.empresa,
        cargo: dados.cargo || '',
        telefone: dados.telefone || '',
        token: token(),
        pagina: location.href,
        utm: utms()
      };
      if (selIE) payload.importa_exporta = selIE.value;

      if (PAGINA === 'material') {
        payload.diagnostico = JSON.parse(JSON.stringify(respostas));
        var res = lerResultado();
        if (res.score !== null) payload.diagnostico.score = res.score;
        if (res.faixa) payload.diagnostico.faixa = res.faixa;
      }

      enviar(f.botao, payload);
    }, true);
  }

  function avisar(botao, msg) {
    var alvo = botao.parentNode.querySelector('[data-raiox="aviso"]');
    if (!alvo) {
      alvo = document.createElement('div');
      alvo.setAttribute('data-raiox', 'aviso');
      alvo.style.cssText = 'font-size:12px;color:#c0392b;margin-top:8px;text-align:center';
      botao.parentNode.insertBefore(alvo, botao.nextSibling);
    }
    alvo.textContent = msg;
  }

  function enviar(botao, payload) {
    var rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Enviando...';

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        dl('raiox_lead', { raiox_identificador: j.identificador || '' });
        botao.textContent = PAGINA === 'lp' ? 'Pronto! Enviamos por e-mail.' : 'Recebemos, obrigado!';
        var av = botao.parentNode.querySelector('[data-raiox="aviso"]');
        if (av) av.textContent = '';
      })
      .catch(function (e) {
        botao.disabled = false;
        botao.textContent = rotulo;
        avisar(botao, 'Não deu pra enviar agora. Tente de novo em instantes.');
        dl('raiox_lead_erro', { raiox_erro: String(e).slice(0, 80) });
      });
  }

  ligar();
  new MutationObserver(function () { ligar(); })
    .observe(document.body, { childList: true, subtree: true });
})();
