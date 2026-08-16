// Configuração pública do front-end (nada secreto aqui — este arquivo é servido
// para o navegador). Segredos (token do CAPI, segredo do webhook) ficam em
// variáveis de ambiente no servidor, nunca aqui.

window.HOSPEDA_CONFIG = {
  // Cole o ID do seu Meta Pixel (Gerenciador de Eventos > Pixels).
  // Enquanto for null, o Pixel não inicializa (ver index.html) e nenhum evento
  // client-side é enviado — a Conversions API continua funcionando normalmente.
  metaPixelId: null,
};
