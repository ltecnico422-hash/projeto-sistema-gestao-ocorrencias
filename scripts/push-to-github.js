const fs = require('node:fs');
const path = require('node:path');

const REPO_OWNER = 'ltecnico422-hash';
const REPO_NAME = 'projeto-sistema-gestao-ocorrencias';
const BRANCH = 'main';

async function pushToGitHub(token, commitMessage = 'Atualização do sistema de ocorrências para deploy no Render') {
  if (!token) {
    console.error('ERRO: Nenhum token do GitHub fornecido.');
    process.exit(1);
  }

  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'System-Auto-Deploy',
    'Content-Type': 'application/json'
  };

  const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

  // 1. Obter SHA do último commit da branch main
  console.log(`[1/5] Obtendo referência da branch ${BRANCH}...`);
  const refRes = await fetch(`${apiBase}/git/ref/heads/${BRANCH}`, { headers });
  if (!refRes.ok) {
    const errText = await refRes.text();
    throw new Error(`Falha ao obter branch main: ${refRes.status} - ${errText}`);
  }
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha;

  // 2. Coletar arquivos do projeto para upload
  console.log(`[2/5] Lendo arquivos locais do projeto...`);
  const rootDir = path.resolve(__dirname, '..');
  const filesToUpload = [];

  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      // Ignora pastas proibidas
      if (
        relPath.startsWith('node_modules') ||
        relPath.startsWith('.git') ||
        relPath.startsWith('data') ||
        relPath.startsWith('.gemini') ||
        relPath.startsWith('.agents') ||
        relPath.endsWith('.sqlite') ||
        relPath.endsWith('.sqlite-wal') ||
        relPath.endsWith('.sqlite-shm') ||
        relPath === '.env' ||
        relPath.endsWith('.log')
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        filesToUpload.push({ relPath, fullPath });
      }
    }
  }

  walkDir(rootDir);
  console.log(`✓ Encontrados ${filesToUpload.length} arquivos para sincronizar.`);

  // 3. Criar blobs para cada arquivo no GitHub
  console.log(`[3/5] Enviando arquivos para o GitHub...`);
  const treeItems = [];

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i];
    const content = fs.readFileSync(file.fullPath);
    const isBinary = file.relPath.endsWith('.png') || file.relPath.endsWith('.ico') || file.relPath.endsWith('.jpg');

    const blobPayload = isBinary
      ? { content: content.toString('base64'), encoding: 'base64' }
      : { content: content.toString('utf8'), encoding: 'utf-8' };

    const blobRes = await fetch(`${apiBase}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(blobPayload)
    });

    if (!blobRes.ok) {
      throw new Error(`Erro ao enviar blob para ${file.relPath}: ${blobRes.status}`);
    }

    const blobData = await blobRes.json();
    treeItems.push({
      path: file.relPath,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    });

    process.stdout.write(`  -> [${i + 1}/${filesToUpload.length}] ${file.relPath}\n`);
  }

  // 4. Criar Tree e Commit
  console.log(`[4/5] Criando nova árvore e commit...`);
  const treeRes = await fetch(`${apiBase}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tree: treeItems })
  });

  if (!treeRes.ok) {
    const errText = await treeRes.text();
    throw new Error(`Erro ao criar tree: ${errText}`);
  }
  const treeData = await treeRes.json();

  const commitRes = await fetch(`${apiBase}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: commitMessage,
      tree: treeData.sha,
      parents: [latestCommitSha]
    })
  });

  if (!commitRes.ok) {
    const errText = await commitRes.text();
    throw new Error(`Erro ao criar commit: ${errText}`);
  }
  const commitData = await commitRes.json();
  const newCommitSha = commitData.sha;

  // 5. Atualizar o ponteiro da branch main
  console.log(`[5/5] Atualizando branch ${BRANCH} para o novo commit (${newCommitSha.slice(0, 7)})...`);
  const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: newCommitSha,
      force: true
    })
  });

  if (!updateRefRes.ok) {
    const errText = await updateRefRes.text();
    throw new Error(`Erro ao atualizar ref da branch main: ${errText}`);
  }

  console.log(`================================================================`);
  console.log(`✓ SUCESSO! Repositório atualizado no GitHub!`);
  console.log(`  Link: https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${newCommitSha}`);
  console.log(`  O Render detectará a nova versão e iniciará o deploy automaticamente.`);
  console.log(`================================================================`);
}

const token = process.argv[2] || process.env.GITHUB_TOKEN;
if (!token) {
  console.log('Uso: node scripts/push-to-github.js <SEU_TOKEN_GITHUB>');
  process.exit(1);
}

pushToGitHub(token).catch(err => {
  console.error('❌ Falha na atualização:', err.message);
  process.exit(1);
});
