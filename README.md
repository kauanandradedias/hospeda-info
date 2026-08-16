# Hospeda Info — landing page + checador de domínio para advogados

Landing page (preto/dourado) para venda de e-mail profissional a escritórios
de advocacia, com um checador de disponibilidade de domínio que consulta o
Registro.br em tempo real.

## Estrutura

```
index.html         landing page
styles.css          tema preto/dourado
script.js           front-end do checador de domínio
api/check-domain.js função serverless (Node) que consulta o Registro.br
```

## Como funciona a verificação de domínio

O front-end nunca consulta o Registro.br diretamente — isso não seria possível
(WHOIS é protocolo TCP puro, não HTTP) nem recomendado (o Registro.br limita
a taxa de consultas por IP). Em vez disso:

1. O usuário digita o e-mail completo que gostaria de ter (ex.:
   `contato@seuescritorio.adv.br`) no formulário.
2. `script.js` envia `POST /api/check-domain { email }` para a função
   serverless em `api/check-domain.js`.
3. A função:
   - extrai o domínio da parte depois do `@`;
   - valida que é um domínio `.br` (é o único registro que o RDAP usado
     conhece) — caso contrário, responde `400` com um erro amigável;
   - consulta o domínio no
     [RDAP público do Registro.br](https://rdap.registro.br) —
     `GET https://rdap.registro.br/domain/<dominio>`:
     - `404` → domínio não encontrado → **disponível**
     - `200` → domínio encontrado → **indisponível**
     - qualquer outra resposta → **indeterminado** (peça para tentar de novo)
   - guarda o resultado em cache de memória por 10 minutos, para não repetir
     consultas ao Registro.br em pouco tempo.
4. O resultado volta em JSON e é exibido na "certidão de disponibilidade".

RDAP é o sucessor oficial do WHOIS (JSON em vez de texto livre) e é o jeito
correto de automatizar essa consulta. Ainda assim, o Registro.br pode aplicar
limites de taxa por IP — por isso os resultados ficam em cache. Em produção
com tráfego alto, troque o cache em memória por um KV externo (ex.: Upstash
Redis), já que instâncias serverless são efêmeras.

**Sobre o `.adv.br`:** só pode ser registrado por advogado ou sociedade de
advocacia com inscrição ativa na OAB. Essa validação é feita pelo Registro.br
no momento do **registro** do domínio, não na consulta de disponibilidade —
por isso o checador funciona normalmente para qualquer domínio `.br` que o
visitante digitar (`.adv.br`, `.com.br` etc.), mas vale deixar essa exigência
clara para o cliente antes da contratação.

## Rodando localmente

O checador depende de uma função serverless, então abrir o `index.html`
direto no navegador não é suficiente (o `/api/check-domain` não vai existir).
Duas opções:

**Sem instalar nada** — use o `dev-server.js` incluído neste projeto:

```bash
node dev-server.js
```

Isso sobe o site e a função `api/check-domain.js` juntos em
`http://localhost:3000`.

**Com a CLI da Vercel** (mais fiel ao ambiente de produção):

```bash
npm install -g vercel
vercel dev
```

## Deploy

Pronto para Vercel (zero config — a pasta `api/` já é reconhecida
automaticamente):

```bash
vercel deploy
```

Se preferir Netlify, mova `api/check-domain.js` para `netlify/functions/`,
ajuste a assinatura do handler para o formato do Netlify Functions, e troque
a URL chamada em `script.js` de `/api/check-domain` para
`/.netlify/functions/check-domain`.

## Para personalizar antes de publicar

- **Preços dos planos** (`index.html`, seção `#planos`) são valores de
  referência.
- **Botões "Contratar"** apontam para `#verificar` (âncora na página). Troque
  por um link real de checkout/contratação quando existir.
