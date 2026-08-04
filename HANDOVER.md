# Handover — Raio-X do Comex 2025 (freitas-raiox)

Este doc existe pra você e eu (João, Raz) não sobrepormos versão. Lê antes de editar qualquer arquivo.

## O projeto

Material rico de topo de funil da Freitas Comex: uma LP de captura + um material interativo (simulador de landed cost, custos ocultos, jornada da importação, diagnóstico, análise setorial). Cliente final: leads B2B de importadores.

## Repo e deploy

- **Repo:** [joaoraz/freitas-raiox](https://github.com/joaoraz/freitas-raiox) (público)
- **Branch única:** `main` (sem staging/dev por enquanto)
- **Deploy automático em todo push pro `main`:**
  - GitHub Pages: https://joaoraz.github.io/freitas-raiox/
  - Vercel: https://freitas-raiox.vercel.app/ (deploy hook GitHub → Vercel ativo)
- **URLs em produção:**
  - LP de captura: `/lp.html`
  - Material rico: `/index.html`
  - (a intenção é inverter isso — ver Pendências)

## Estrutura dos arquivos

Só existem dois arquivos que importam:

- `lp.html` — página de captura
- `index.html` — material rico completo

**⚠️ Detalhe crítico:** ambos são **bundles React minificados** exportados como Artifact do Claude.ai. **Não existe source JSX no repo.** Todo `.jsx`/`.tsx` foi transpilado, minificado e vive dentro dos `<script>` inline desses HTMLs.

Consequência prática: pra editar, você abre o `.html`, acha a string ou o pedaço de JS que quer mudar (com `grep -oE`) e faz replace exato. Não formata, não prettifica, não roda linter — quebra os handlers minificados na hora.

## Regras de convivência (não sobrepor versão)

1. **SEMPRE** `git pull --rebase origin main` antes de começar a editar. O deploy é automático, então commits desatualizados viram merge conflict feio.
2. **Antes de mexer**, avisar no WhatsApp/Slack: "vou mexer no `lp.html` agora, previsão 30min". Assim o outro para. Bloco atômico: um dev por arquivo, não em paralelo.
3. **Um commit por mudança lógica.** Mensagem descritiva: "Update lp.html — X + Y". Não empilhar 5 coisas em um commit.
4. **Testar localmente antes do push.** Vercel/Pages não é sandbox.
   ```
   cd freitas-raiox && python3 -m http.server 4747
   # abre http://127.0.0.1:4747/lp.html e http://127.0.0.1:4747/index.html
   ```
5. **Push imediato depois do commit.** Não deixa commit local esquecido — o outro dev fica cego pra tua mudança.
6. **Nunca `git push --force`** no `main`. Se der conflito, resolve com rebase interativo local e push normal.

## Como editar no bundle minificado

A técnica é sempre a mesma:

1. **Achar a string ou expressão** que representa o que quer mudar. Textos PT-BR aparecem escapados (ex: `"Ex-tarif\xE1rio"`).
   ```
   grep -oE '.{40}"trecho a achar".{40}' lp.html
   ```
2. **Confirmar que a string é única** no arquivo (senão o replace vai pegar lugar errado).
   ```
   grep -c 'trecho a achar' lp.html
   ```
3. **Fazer replace exato** — preservando toda a estrutura JS ao redor (vírgulas, parênteses, escape de acentos).
4. **Testar local** e só depois push.

### Padrões comuns no bundle

- Objeto de estilo React: `style:{width:"100%",padding:"13px 16px",...}`
- Elemento JSX: `(0,h.jsx)("input",{...props...})` ou `(0,h.jsx)("div",{children:[...]})`
- Container com múltiplos filhos: `(0,h.jsxs)("div",{...,children:[X,Y,Z]})`
- Paleta de cores: variável `w` no `lp.html`, `j` no `index.html`. Ambas expõem `navy`, `magenta`, `orange`, `gray100..900`, etc.
- Icons Lucide: variáveis curtas (`tD`, `eD`, `Hd`). Reutilizar dos itens existentes é mais seguro que inventar.

### Erros comuns a evitar

- Inserir função anônima dentro do componente pai (redefine a cada render, React destrói e recria o filho — foi por isso que o form perdia foco antes; agora tá inline).
- Trocar aspas duplas por simples: quebra o parse.
- Editar espaços dentro de `${...}` de template strings — pode invalidar o token minificado.

## O que já foi feito (histórico curto)

Toda mudança recente veio do parecer técnico do **Victor Orsi (Freitas)** — cadeia de e-mail com Jéssica/Isabela/Agnes.

### LP (`lp.html`)

- Hero reescrita abrindo em dor de margem/precificação de carga, não em produto.
- Card do form virou "Seu acesso está a 30 segundos" + micro-copy amigável.
- Placeholders humanizados ("Como podemos te chamar?", "Empresa que você representa").
- **Novo campo obrigatório:** `select` "Você importa ou exporta?" com opções Importo / Exporto / Ambos.
- Fix de bug de foco: inputs agora são elementos inline (antes eram gerados por wrapper `s` que re-renderizava, quebrando o foco → só digitava 1 letra por vez).
- CTA disabled agora usa navy com `opacity:0.35` em vez de cinza-morto.

### Material rico (`index.html`)

- **Simulador de Landed Cost:** bloco laranja "AJUSTE A GORDURA DA OPERAÇÃO" com armazenagem por modal (Aéreo 1,3% / FCL 2,0% / LCL 5,5% do FOB) + recomendação 5-10% de margem de segurança. Cálculo do simulador NÃO foi alterado — só complemento visual.
- **Simulador:** bloco rosa "Posicionamento Freitas" com `~1,61% do custo de importação` (top 5 clientes, referência histórica, não tabela oficial).
- **Custos Ocultos:** dois cards novos.
  - `Frete Internacional` (5-10% do FOB) como 1º card — antes faltava.
  - `Honorários Freitas` (~0,53% do FOB) como último card com ícone positivo — comparação visual com os custos evitáveis.

## Pendências (prioridade alta → baixa)

1. **Form NÃO envia nada.** O handler é `u=()=>{...||l(!0)}` — só muda estado local. Sem `fetch`, sem `/api/`. Todo lead capturado desde o lançamento foi perdido.
   - Antes existia `api/send-code.js` (Vercel serverless com Resend). Foi apagado num commit anterior.
   - Vercel Functions ainda funciona no projeto (só a função foi deletada).
   - **Solução aprovada:** integrar com RD Station via Vercel Function. Precisa: token RD + confirmar se quer notificação por e-mail interno também.
2. **Analytics (GA4).** Adicionar tag no `<head>` de `lp.html` e `index.html`.
3. **Pixel Meta.** Snippet + evento de conversão no submit do form (quando conectar).
4. **Reorganizar URLs.** `index.html` vira LP de captura (URL raiz do site), material rico vai pra outra rota. Pensar em gate de acesso — mas pode ser URL pública (leitura confirmada com João).
5. **`~/api/send-code.js`** pode ser restaurado (existe no git history, commit `8b8404b` — `git show 8b8404b:api/send-code.js`). Serve de base pra Vercel Function nova.

## Fluxo típico de edição (recap)

```
# 1. atualizar
cd freitas-raiox
git pull --rebase origin main

# 2. avisar no chat que vai mexer

# 3. rodar local
python3 -m http.server 4747
# abre localhost:4747/lp.html no browser, testa

# 4. editar arquivo (grep pra achar, replace exato)

# 5. testar de novo local

# 6. commit + push
git add -A
git commit -m "Update lp.html — descrição curta"
git push origin main

# 7. confirmar no ar (~30-60s pra Pages, ~10s pra Vercel)
curl -s https://joaoraz.github.io/freitas-raiox/lp.html | grep 'coisa que mudou'
```

## Créditos

- **Parecer técnico:** Victor Orsi (Freitas Comex)
- **Coordenação:** Jéssica Aguiar / Isabela / Agnes Buttei
- **Dev:** João Sartor (Raz Consulting) + Marco Monteiro (Freitas)

## Sincronização (leve, dois canais)

Sem burocracia — só o mínimo pra não sobrepor versão.

### Síncrono — WhatsApp direto (João ↔ Marco)

Pra quando um dos dois vai começar a editar AGORA. Duas mensagens só:

- **Início:** "vou mexer em `lp.html` — [o que] — [previsão]"
- **Fim:** "pushei, tá no ar" (colar link se ajudar)

Regra simples: se o outro não confirmou fim, **não começa** a editar o mesmo arquivo. Se for arquivo diferente (você em `index.html`, eu em `lp.html`), vai em paralelo sem problema.

### Assíncrono — GitHub Watch

Todo mundo com Watch → "All Activity" no repo. Cada push chega por e-mail em ~30s. Assim:

- Se eu commitar às 15:03, você vê às 15:04.
- Se subir bug, qualquer um dos dois abre issue no repo — `New issue` na aba Issues.
- Pendências que não são "faça agora" viram issue (com label opcional: `pendente`, `bug`, `melhoria`).

Ativar Watch: https://github.com/joaoraz/freitas-raiox → botão `Watch` → `All Activity`.

### Fluxo em uma linha

`git pull --rebase` → aviso no WhatsApp → edita → testa local → commit + push → aviso "pushei" no WhatsApp.

## Contatos

- **João Sartor** (Raz) — joao@razconsulting.com.br — WhatsApp: (confirmar)
- **Marco Monteiro** (Freitas) — (email + WhatsApp a confirmar)
