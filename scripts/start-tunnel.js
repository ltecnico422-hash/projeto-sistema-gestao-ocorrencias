(async () => {
  const port = process.env.PORT || 3000;

  try {
    const { startTunnel } = await import('untun');
    console.log('[TUNNEL] Tentando túnel Cloudflare via untun...');

    const tunnel = await startTunnel({ port });
    const url = await tunnel.getURL();

    console.log('==================================================');
    console.log(`[LINK PÚBLICO CLOUDFLARE]: ${url}`);
    console.log('==================================================');
    return;
  } catch (error) {
    console.warn('[AVISO] Cloudflare tunnel indisponível no momento. Iniciando LocalTunnel...');
  }

  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port });

    console.log('==================================================');
    console.log(`[LINK PÚBLICO (LOCALTUNNEL)]: ${tunnel.url}`);
    console.log('==================================================');

    tunnel.on('close', () => {
      console.log('[TUNNEL] Conexão do túnel encerrada.');
    });
  } catch (ltError) {
    console.error('[ERRO AO INICIAR TUNNEL]:', ltError.message);
  }
})();
