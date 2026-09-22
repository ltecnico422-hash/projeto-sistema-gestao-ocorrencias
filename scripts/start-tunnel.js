(async () => {
  try {
    const { startTunnel } = await import('untun');
    console.log('[TUNNEL] Iniciando túnel seguro da Cloudflare...');

    const tunnel = await startTunnel({
      port: 3000
    });

    const url = await tunnel.getURL();

    console.log('==================================================');
    console.log(`[LINK DIRETO (SEM CÓDIGO/SENHA)]: ${url}`);
    console.log('==================================================');
  } catch (error) {
    console.error('[ERRO AO INICIAR TUNNEL]:', error);
  }
})();
