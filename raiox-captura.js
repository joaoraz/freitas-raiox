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

  /**
   * A origem tem que sobreviver ao caminho todo. Depois do cadastro a pessoa é
   * levada da LP para o material, e aí os UTMs já não estão mais na URL. Sem
   * guardar, o diagnóstico e o pedido de contato chegariam no RD como
   * "Desconhecido", e só a primeira conversão ficaria atribuída à campanha.
   */
  var CHAVE_UTM = 'raiox_utm';
  function utms() {
    var p = new URLSearchParams(location.search), o = {};
    ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) {
      var v = p.get('utm_' + k);
      if (v) o[k] = v;
    });
    if (Object.keys(o).length) {
      try { localStorage.setItem(CHAVE_UTM, JSON.stringify(o)); } catch (e) {}
      return o;
    }
    try { return JSON.parse(localStorage.getItem(CHAVE_UTM) || '{}'); } catch (e) { return {}; }
  }
  utms(); // grava logo na entrada, antes de qualquer navegação

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
  var aguardandoResultado = null;

  /**
   * Envia assim que as 8 estiverem respondidas. O score só aparece depois que a
   * pessoa abre o resultado, então damos 8 segundos por ele; se não abrir, as
   * respostas vão sem score. Antes o envio exigia o resultado aberto, e quem
   * respondia tudo sem clicar em "Ver diagnóstico" não gravava nada.
   */
  function salvarDiagnostico(forcar) {
    if (diagnosticoEnviado || !token()) return;
    if (Object.keys(respostas).length < 8) return;

    var res = lerResultado();
    if (res.score === null && !forcar) {
      if (!aguardandoResultado) {
        aguardandoResultado = setTimeout(function () { salvarDiagnostico(true); }, 8000);
      }
      return;
    }

    diagnosticoEnviado = true;
    if (aguardandoResultado) { clearTimeout(aguardandoResultado); aguardandoResultado = null; }
    var diag = JSON.parse(JSON.stringify(respostas));
    if (res.score !== null) diag.score = res.score;
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

  // mesmas opções cadastradas no campo cf_seu_cargo do RD, para o dado chegar padronizado
  var OPCOES_CARGO = ['Estagiário', 'Assistente/Auxiliar', 'Analista', 'Coordenador/Supervisor',
    'Gerente', 'Diretor/Proprietário', 'Outros'];

  /**
   * Âncora no campo de e-mail, não no botão.
   *
   * As duas páginas têm mais de um botão com o mesmo texto: na LP existe um
   * "Acessar material" no topo, e no material existe um "Solicitar diagnóstico"
   * que é o link de WhatsApp do diagnóstico. Procurar pelo texto do botão pega
   * o errado. O campo de e-mail é único, então subimos a partir dele até achar
   * o container que tem os campos e exatamente um botão de envio.
   */
  function acharFormulario() {
    var email = null;
    var ins = document.querySelectorAll('input');
    for (var i = 0; i < ins.length; i++) {
      if (ins[i].type === 'range') continue;
      if (CONFIG.campos.email.test(ins[i].placeholder || '')) { email = ins[i]; break; }
    }
    if (!email) return null;

    var caixa = email.parentElement;
    for (var k = 0; k < 6 && caixa; k++, caixa = caixa.parentElement) {
      var candidatos = [].slice.call(caixa.querySelectorAll('button')).filter(function (b) {
        return CONFIG.textoBotao.test(texto(b)) && !b.closest('a');
      });
      if (candidatos.length === 1 && caixa.querySelectorAll('input').length >= 3) {
        return { botao: candidatos[0], caixa: caixa };
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

  /** Monta um select com o visual do campo ao lado e esconde o input original. */
  function trocarPorLista(campo, id, rotulo, opcoes) {
    if (!campo || campo.getAttribute('data-raiox-lista')) return document.getElementById(id);
    campo.setAttribute('data-raiox-lista', '1');

    var sel = document.createElement('select');
    sel.id = id;
    copiaEstilo(campo, sel);
    sel.style.appearance = 'none';
    sel.style.cursor = 'pointer';
    sel.style.marginBottom = getComputedStyle(campo).marginBottom;

    var vazio = document.createElement('option');
    vazio.value = ''; vazio.textContent = rotulo; vazio.disabled = true; vazio.selected = true;
    sel.appendChild(vazio);
    opcoes.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o; op.textContent = o;
      sel.appendChild(op);
    });

    campo.style.display = 'none';
    campo.parentNode.insertBefore(sel, campo);
    return sel;
  }

  /**
   * Na LP, quem já tem token não precisa se cadastrar de novo. Em vez do
   * formulário, mostra o acesso direto ao material, com escape para quem
   * quiser cadastrar outro e-mail.
   */
  function mostrarAcessoLiberado(caixa, botao) {
    if (caixa.querySelector('[data-raiox="ja-tem-acesso"]')) return;

    [].slice.call(caixa.querySelectorAll('input, select')).forEach(function (e) {
      if (e.type !== 'range') e.style.display = 'none';
    });

    var bloco = document.createElement('div');
    bloco.setAttribute('data-raiox', 'ja-tem-acesso');
    bloco.style.cssText = 'font-size:14px;color:#3a3a6a;line-height:1.6;margin-bottom:14px';
    bloco.innerHTML = '<strong>Você já tem acesso.</strong><br>' +
      'Seu cadastro está salvo neste navegador, é só continuar. ' +
      '<a href="#" data-raiox="outro-email" style="color:#ce0f69;text-decoration:underline">Cadastrar outro e-mail</a>';
    botao.parentNode.insertBefore(bloco, botao);

    // o rótulo do botão já é "Acessar material", que serve. Não mexemos nele
    // porque o React reescreve o conteúdo a cada render.

    bloco.querySelector('[data-raiox="outro-email"]').addEventListener('click', function (ev) {
      ev.preventDefault();
      try { localStorage.removeItem(CHAVE_TOKEN); } catch (e) {}
      location.reload();
    });
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

  /**
   * Campos e botão nem sempre existem no mesmo render. Por isso a melhoria dos
   * campos roda a cada passada, e não só quando o botão é ligado. Antes, se o
   * botão surgisse primeiro, o cargo nunca virava lista.
   */
  function melhorarCampos(caixa, campos) {
    var selIE = caixa.querySelector('select');
    if (CONFIG.pedeImportaExporta && !selIE && !caixa.querySelector('[data-raiox="importa-exporta"]')) {
      var bloco = montarSelect(campos.email || campos.nome);
      var refBotao = caixa.querySelector('button');
      if (refBotao) refBotao.parentNode.insertBefore(bloco, refBotao);
      selIE = bloco.querySelector('select');
    }
    // Cargo continua campo de texto. Tentamos trocar por lista fechada, mas o
    // React remove o select injetado no render seguinte e o campo sumia da tela.
    // Para virar lista de verdade precisa ser feito no bundle, como o João fez
    // com o select de importa/exporta na LP.
    if (campos.telefone && campos.telefone.placeholder !== 'Telefone *') campos.telefone.placeholder = 'Telefone *';
    return { selIE: selIE, selCargo: null };
  }

  function ligar() {
    var f = acharFormulario();
    if (!f) return;

    var campos = {};
    for (var nome in CONFIG.campos) campos[nome] = acharCampo(f.caixa, CONFIG.campos[nome]);

    // quem já se cadastrou não preenche a LP de novo
    if (PAGINA === 'lp' && token()) {
      mostrarAcessoLiberado(f.caixa, f.botao);
      if (f.botao.getAttribute('data-raiox-ligado')) return;
      f.botao.setAttribute('data-raiox-ligado', '1');
      f.botao.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        location.href = '/';
      }, true);
      return;
    }

    melhorarCampos(f.caixa, campos);
    if (token() && campos.email) esconderEmail(campos.email);

    if (f.botao.getAttribute('data-raiox-ligado')) return;
    f.botao.setAttribute('data-raiox-ligado', '1');

    f.botao.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();

      // relê tudo na hora do envio: o React pode ter trocado os elementos
      for (var k in CONFIG.campos) campos[k] = acharCampo(f.caixa, CONFIG.campos[k]) || campos[k];
      var atuais = melhorarCampos(f.caixa, campos);
      var selIE = atuais.selIE || document.getElementById('raiox-importa-exporta');
      var selCargo = atuais.selCargo || document.getElementById('raiox-cargo');

      var dados = {};
      for (var n in campos) if (campos[n]) dados[n] = (campos[n].value || '').trim();
      var temToken = !!token();

      if (!dados.nome || !dados.empresa) return avisar(f.botao, 'Preencha nome e empresa.');
      if (!temToken && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email || '')) {
        return avisar(f.botao, 'Confira o e-mail.');
      }
      // cargo não bloqueia: se a lista não foi escolhida, vale o texto digitado
      if (campos.telefone && (dados.telefone || '').replace(/\D/g, '').length < 10) {
        return avisar(f.botao, 'Informe um telefone com DDD.');
      }
      if (selIE && !selIE.value) return avisar(f.botao, 'Selecione se a empresa importa ou exporta.');

      var payload = {
        origem: PAGINA,
        nome: dados.nome,
        email: dados.email || '',
        empresa: dados.empresa,
        cargo: (selCargo && selCargo.value) || dados.cargo || '',
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

        // O container do Freitas tem o acionador "Trigger - 1- Lead" escutando o
        // evento form_submit, e ele dispara as quatro tags de lead: Meta, GA4,
        // Google Ads e LinkedIn. Empurrando o mesmo evento, o Raio-X entra no
        // padrão que as outras iscas já usam, sem precisar de tag nova no GTM.
        window.dataLayer.push({ event: 'form_submit', raiox_pagina: PAGINA, raiox_identificador: j.identificador || '' });

        var av = botao.parentNode.querySelector('[data-raiox="aviso"]');
        if (av) av.textContent = '';

        // Na LP a pessoa entra no material na hora, ainda na mesma sessão. O token
        // vem na resposta e fica guardado, então ela segue identificada lá dentro
        // sem link especial no e-mail e sem digitar o e-mail de novo.
        if (PAGINA === 'lp') {
          if (j.token) { try { localStorage.setItem(CHAVE_TOKEN, j.token); } catch (e) {} }
          botao.textContent = 'Acesso liberado, abrindo...';
          setTimeout(function () { location.href = '/'; }, 900);
          return;
        }

        botao.textContent = 'Recebemos, obrigado!';
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
