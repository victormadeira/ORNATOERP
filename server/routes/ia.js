import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import ai from '../services/ai.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// POST /api/ia/chat — consulta livre ao CRM
// ═══════════════════════════════════════════════════════
router.post('/chat', requireAuth, async (req, res) => {
    const { pergunta } = req.body;
    if (!pergunta) return res.status(400).json({ error: 'Pergunta obrigatória' });
    try {
        const resposta = await ai.queryCRM(pergunta);
        res.json({ resposta });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/ia/followups — listar follow-ups pendentes
// ═══════════════════════════════════════════════════════
router.get('/followups', requireAuth, (req, res) => {
    const followups = db.prepare(`
        SELECT f.*, c.nome as cliente_nome, c.tel as cliente_tel,
               o.numero as orc_numero, o.ambiente as orc_ambiente, o.valor_venda as orc_valor
        FROM ia_followups f
        LEFT JOIN clientes c ON f.cliente_id = c.id
        LEFT JOIN orcamentos o ON f.orc_id = o.id
        WHERE f.status = 'pendente'
        ORDER BY
            CASE f.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
            f.criado_em DESC
    `).all();
    res.json(followups);
});

// ═══════════════════════════════════════════════════════
// POST /api/ia/gerar-followups — gerar sugestões via IA
// ═══════════════════════════════════════════════════════
router.post('/gerar-followups', requireAuth, async (req, res) => {
    try {
        const results = await ai.generateFollowups();
        res.json({ gerados: results.length, followups: results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/ia/followups/:id — marcar como feito/ignorado
// ═══════════════════════════════════════════════════════
router.put('/followups/:id', requireAuth, (req, res) => {
    const { status } = req.body;
    if (!['feito', 'ignorado', 'pendente'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
    }
    db.prepare('UPDATE ia_followups SET status = ? WHERE id = ?').run(status, parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// POST /api/ia/resumo — gerar resumo semanal do CRM
// ═══════════════════════════════════════════════════════
router.post('/resumo', requireAuth, async (req, res) => {
    try {
        const resposta = await ai.queryCRM(
            'Faça um resumo executivo semanal completo: novos clientes, orçamentos criados, movimentações no funil de vendas, projetos em andamento, contas a receber próximas do vencimento, e quaisquer alertas importantes. Use bullet points e seja objetivo.'
        );
        res.json({ resumo: resposta });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// CRUD — Base de Conhecimento (ia_contexto)
// ═══════════════════════════════════════════════════════

// GET /api/ia/contexto
router.get('/contexto', requireAuth, (req, res) => {
    const items = db.prepare('SELECT * FROM ia_contexto ORDER BY criado_em DESC').all();
    res.json(items);
});

// POST /api/ia/contexto
router.post('/contexto', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { tipo, titulo, conteudo } = req.body;
    if (!tipo || !conteudo) return res.status(400).json({ error: 'Tipo e conteúdo obrigatórios' });
    const r = db.prepare('INSERT INTO ia_contexto (tipo, titulo, conteudo) VALUES (?, ?, ?)').run(tipo, titulo || '', conteudo);
    const item = db.prepare('SELECT * FROM ia_contexto WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(item);
});

// PUT /api/ia/contexto/:id
router.put('/contexto/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const id = parseInt(req.params.id);
    const { tipo, titulo, conteudo, ativo } = req.body;
    db.prepare('UPDATE ia_contexto SET tipo=?, titulo=?, conteudo=?, ativo=? WHERE id=?').run(
        tipo, titulo || '', conteudo, ativo ?? 1, id
    );
    res.json(db.prepare('SELECT * FROM ia_contexto WHERE id = ?').get(id));
});

// DELETE /api/ia/contexto/:id
router.delete('/contexto/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    db.prepare('DELETE FROM ia_contexto WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// POST /api/ia/gerar-conteudo — gerar conteúdo de marketing com IA
// ═══════════════════════════════════════════════════════
router.post('/gerar-conteudo', requireAuth, async (req, res) => {
    const { tipo, tema, tom, plataforma } = req.body;
    // tipo: 'post_instagram', 'copy_anuncio', 'descricao_projeto'
    if (!tipo) return res.status(400).json({ error: 'Tipo de conteúdo obrigatório' });

    try {
        const emp = db.prepare('SELECT nome, proposta_sobre FROM empresa_config WHERE id = 1').get();

        // Buscar dados reais para enriquecer
        const projRecentes = db.prepare(`
            SELECT o.cliente_nome, o.ambiente, o.valor_venda
            FROM projetos p JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.status IN ('concluido', 'em_andamento')
            ORDER BY p.atualizado_em DESC LIMIT 5
        `).all();

        const prompts = {
            post_instagram: `Você é o social media de uma marcenaria chamada "${emp?.nome || 'marcenaria'}".
${emp?.proposta_sobre ? `Sobre a empresa: ${emp.proposta_sobre}` : ''}
Projetos recentes: ${projRecentes.map(p => `${p.ambiente} para ${p.cliente_nome}`).join(', ') || 'diversos projetos de móveis planejados'}

Gere um POST para Instagram sobre: ${tema || 'móveis planejados sob medida'}.
Tom: ${tom || 'profissional e inspirador'}

Retorne APENAS:
1. Caption (com emojis e hashtags relevantes, max 300 caracteres)
2. Sugestão de imagem/foto para acompanhar`,

            copy_anuncio: `Você é um copywriter para anúncios de uma marcenaria: "${emp?.nome || 'marcenaria'}".
${emp?.proposta_sobre ? `Sobre: ${emp.proposta_sobre}` : ''}

Gere um texto de anúncio para ${plataforma || 'Meta Ads (Facebook/Instagram)'} sobre: ${tema || 'móveis planejados'}.
Tom: ${tom || 'persuasivo e direto'}

Retorne:
1. Headline (max 40 caracteres)
2. Texto principal (max 125 caracteres)
3. CTA sugerido
4. Público-alvo sugerido`,

            descricao_projeto: `Você é redator de portfólio de uma marcenaria: "${emp?.nome || 'marcenaria'}".

Gere uma descrição elegante para portfólio/site sobre: ${tema || 'projeto de móveis planejados'}.
Tom: ${tom || 'sofisticado e detalhista'}

Retorne:
1. Título atraente (max 60 caracteres)
2. Descrição (2-3 parágrafos curtos, max 300 palavras)
3. Tags/categorias sugeridas`,
        };

        const prompt = prompts[tipo] || prompts.post_instagram;
        const resposta = await ai.queryCRM(prompt);

        res.json({ conteudo: resposta, tipo, tema });

    } catch (e) {
        res.status(500).json({ error: e.message || 'Erro ao gerar conteúdo' });
    }
});

// ═══════════════════════════════════════════════════════
// CRUD — Conteúdo Marketing (calendário)
// ═══════════════════════════════════════════════════════

// GET /api/ia/marketing — listar conteúdos
router.get('/marketing', requireAuth, (req, res) => {
    const { status, plataforma } = req.query;
    let sql = 'SELECT * FROM conteudo_marketing WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (plataforma) { sql += ' AND plataforma = ?'; params.push(plataforma); }
    sql += ' ORDER BY COALESCE(data_publicar, criado_em) DESC';
    res.json(db.prepare(sql).all(...params));
});

// POST /api/ia/marketing — criar conteúdo
router.post('/marketing', requireAuth, (req, res) => {
    const { titulo, tipo, texto, plataforma, status, data_publicar } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título obrigatório' });

    const r = db.prepare(`
        INSERT INTO conteudo_marketing (user_id, titulo, tipo, texto, plataforma, status, data_publicar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, titulo, tipo || 'post', texto || '', plataforma || 'instagram', status || 'rascunho', data_publicar || null);

    res.json({ id: r.lastInsertRowid });
});

// PUT /api/ia/marketing/:id — atualizar conteúdo
router.put('/marketing/:id', requireAuth, (req, res) => {
    const { titulo, tipo, texto, plataforma, status, data_publicar } = req.body;
    db.prepare(`
        UPDATE conteudo_marketing
        SET titulo=?, tipo=?, texto=?, plataforma=?, status=?, data_publicar=?, atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(titulo, tipo || 'post', texto || '', plataforma || 'instagram', status || 'rascunho', data_publicar || null, parseInt(req.params.id));
    res.json({ ok: true });
});

// DELETE /api/ia/marketing/:id
router.delete('/marketing/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM conteudo_marketing WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GET /api/ia/base-conhecimento — gera prompt automático
// com toda a biblioteca, catálogo e regras do sistema
// ═══════════════════════════════════════════════════════
router.get('/base-conhecimento', requireAuth, (req, res) => {
    try {
        // Buscar caixas
        const caixas = db.prepare("SELECT nome, json_data FROM modulos_custom WHERE tipo_item='caixa' ORDER BY json_extract(json_data, '$.cat'), nome").all();
        // Buscar componentes
        const comps = db.prepare("SELECT nome, json_data FROM modulos_custom WHERE tipo_item='componente' ORDER BY nome").all();
        // Buscar materiais
        const materiais = db.prepare("SELECT cod, nome, tipo, unidade FROM biblioteca WHERE ativo=1 ORDER BY tipo, nome").all();
        // Buscar empresa
        const empresa = db.prepare("SELECT nome, cidade, estado FROM empresa LIMIT 1").get();

        // ── Montar seção CAIXAS ──
        const caixasPorCat = {};
        for (const cx of caixas) {
            const d = JSON.parse(cx.json_data);
            if (!caixasPorCat[d.cat]) caixasPorCat[d.cat] = [];
            caixasPorCat[d.cat].push({ nome: d.nome, desc: d.desc, coef: d.coef });
        }

        let secaoCaixas = '';
        for (const [cat, items] of Object.entries(caixasPorCat)) {
            secaoCaixas += `\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
            secaoCaixas += `| Caixa | Descricao | Coef |\n|-------|-----------|------|\n`;
            for (const it of items) {
                secaoCaixas += `| ${it.nome} | ${it.desc} | ${it.coef} |\n`;
            }
        }

        // ── Montar seção COMPONENTES ──
        let secaoComps = '| Componente | Descricao | Tem Frente |\n|------------|-----------|------------|\n';
        for (const cp of comps) {
            const d = JSON.parse(cp.json_data);
            const temFrente = d.frente_externa?.ativa ? 'Sim' : 'Nao';
            secaoComps += `| ${d.nome} | ${d.desc} | ${temFrente} |\n`;
        }

        // ── Montar seção MATERIAIS ──
        const matsPorTipo = {};
        for (const m of materiais) {
            if (!matsPorTipo[m.tipo]) matsPorTipo[m.tipo] = [];
            matsPorTipo[m.tipo].push(m);
        }

        let secaoMats = '';
        for (const [tipo, items] of Object.entries(matsPorTipo)) {
            const label = tipo === 'material' ? 'Chapas (MDF/MDP)' : tipo === 'ferragem' ? 'Ferragens' : tipo === 'acabamento' ? 'Acabamentos' : tipo === 'acessorio' ? 'Acessorios' : tipo;
            secaoMats += `\n### ${label}\n`;
            secaoMats += `| Codigo | Nome | Unidade |\n|--------|------|------|\n`;
            for (const it of items) {
                secaoMats += `| ${it.cod} | ${it.nome} | ${it.unidade} |\n`;
            }
        }

        // ── Pegar exemplo de caixa e componente ──
        const exCaixa = caixas.find(c => c.nome === 'Torre Quente') || caixas[0];
        const exComp = comps.find(c => c.nome === 'Gaveta') || comps[0];

        // ── Montar prompt completo ──
        const prompt = `# Base de Conhecimento — ${empresa?.nome || 'Marcenaria'} (Sistema Ornato ERP)

Voce e um assistente especialista em marcenaria planejada e interiores. Voce conhece profundamente o sistema Ornato ERP e deve ajudar a interpretar projetos de interiores (PDFs, imagens, descricoes) e traduzir para a estrutura de dados do sistema.

---

## 1. VISAO GERAL DO SISTEMA

O Ornato ERP e um sistema de orcamentos para marcenarias${empresa ? ` (${empresa.nome} — ${empresa.cidade}/${empresa.estado})` : ''}. Cada orcamento contem **ambientes** (ex: Cozinha, Quarto). Cada ambiente contem **modulos** (moveis). Cada modulo e composto por:

- **Caixa (caixaria)**: estrutura do movel — laterais, topo, base, fundo
- **Componentes**: itens internos ou frontais — gavetas, portas, prateleiras, nichos
- **Materiais**: chapas de MDF/MDP usadas
- **Ferragens**: dobradicas, corredicas, puxadores, perfis LED, etc.
- **Tamponamentos**: acabamentos externos visiveis (laterais, topo, rodape)

### Dimensoes do modulo
- **L** = Largura (mm), **A** = Altura (mm), **P** = Profundidade (mm)
- **Li** = Largura interna = L - 30 (2x espessura 15mm)
- **Ai** = Altura interna = A - 30
- **Pi** = Profundidade interna = P - 3 (fundo compensado 3mm)

---

## 2. CATALOGO DE CAIXAS (${caixas.length} modulos)
${secaoCaixas}

---

## 3. CATALOGO DE COMPONENTES (${comps.length} itens)
${secaoComps}

---

## 4. MATERIAIS DISPONIVEIS
${secaoMats}

---

## 5. ESTRUTURA JSON — CAIXA (exemplo)

\`\`\`json
${exCaixa ? JSON.stringify(JSON.parse(exCaixa.json_data), null, 2) : '{}'}
\`\`\`

### Campos:
- **pecas[].calc**: formula area (mm x mm). Variaveis: L, A, P, Li, Ai, Pi
- **pecas[].mat**: \`"int"\` (interno), \`"ext"\` (externo), \`"fundo"\` (compensado 3mm)
- **pecas[].fita**: lados com fita de borda: \`["f"]\` frente, \`["b"]\` base, \`["t"]\` topo, \`["all"]\` todos
- **tamponamentos[].face**: \`lat_esq\`, \`lat_dir\`, \`topo\`, \`base\`, \`frente\`, \`tras\`
- **coef**: multiplicador de perda/complexidade (ex: 0.35 = 35% adicional)

---

## 6. ESTRUTURA JSON — COMPONENTE (exemplo)

\`\`\`json
${exComp ? JSON.stringify(JSON.parse(exComp.json_data), null, 2) : '{}'}
\`\`\`

### Campos:
- **dimsAplicaveis**: quais dimensoes da caixa-pai ele usa (L, A, P)
- **vars**: variaveis customizaveis pelo usuario
- **varsDeriv**: variaveis derivadas. Ex: \`"Lg": "Li"\` = largura gaveta = largura interna caixa
- **frente_externa**: se ativa, gera peca de frente com material \`"ext_comp"\`
- **sub_itens[].ferrId**: codigo da ferragem na biblioteca
- **sub_itens[].qtdFormula**: formula para calcular quantidade

---

## 7. COMO INTERPRETAR UM PROJETO

### Passo 1: Identificar ambientes (comodos)
### Passo 2: Para cada movel, escolha a caixa mais adequada
### Passo 3: Identifique componentes (portas, gavetas, prateleiras, nichos)
### Passo 4: Mapeie materiais (ex: "MDF Freijo" → amad_medio)
### Passo 5: Identifique ferragens especiais

### Mapeamento de materiais:
| Nome no projeto | Codigo |
|-----------------|--------|
| MDF Freijo / Louro Freijo / Gianduia | amad_medio |
| MDF Areia / Lord / Sal Rosa / Cafelatte | amad_claro |
| MDF Nogueira / Gaia / Tramato | amad_escuro |
| MDF Branco / Branco TX | branco_tx15 |
| Cores especiais (Verde, Rosa, Cinza) | personalizado |

### Mapeamento de ferragens:
| Mencionado no projeto | Ferragem |
|----------------------|----------|
| "puxador cava" / "usinado" | puxCava |
| "fecho toque" / "tip-on" | tipOn |
| "corredica oculta" / "telescopica" | corrOculta |
| "pistao a gas" | pistGas |
| "perfil LED" / "fita LED" | perfilLed |

---

## 8. REGRAS DE NEGOCIO

1. **Fita de borda**: toda face visivel recebe fita. Faces ocultas nao.
2. **Fundo**: sempre compensado 3mm (comp3), exceto movel aberto atras.
3. **Tamponamento**: faces visiveis externas. Se encostado na parede, nao precisa.
4. **Dobradicas**: ate 900mm = 2un, 900-1600mm = 3un, acima = 4un.
5. **Corredica**: gavetas ate 400mm prof = corr400, acima = corr500.
6. **Porta fecho toque**: usa Tip-On, sem puxador aparente.
7. **Puxador cava**: usinado no MDF, sem ferragem adicional visivel.

---

## 9. DICAS

- "Armario superior" cozinha = Caixa Aerea
- "Armario inferior" cozinha = Caixa Baixa / Balcao
- "Mesa de cabeceira" = Comoda (menor)
- "Penteadeira" = Mesa / Escrivaninha
- "Lambri" / "revestimento parede" = Painel de Fechamento
- "Cristaleira" com vidro = Cristaleira + Porta com Vidro
- "Sapateira" dentro de closet = Sapateira Interna (componente)
- "Gaveta basculante" = Gaveta Basculante (componente)
- "Porta de correr com espelho" = Porta de Correr com Espelho (componente)

---

## 10. COMO CRIAR OS AMBIENTES

Ambientes sao os comodos/espacos do projeto. Cada ambiente agrupa os moveis daquele espaco. Siga estas regras:

### Identificacao de ambientes
- Cada comodo do projeto e um ambiente separado: Cozinha, Sala, Quarto Casal, Quarto Filho, Banheiro Suite, Closet, Lavanderia, Home Office, Area Gourmet, etc.
- Se o projeto tem planta baixa, identifique cada comodo pelo nome escrito na planta.
- Se o projeto e uma descricao textual, separe por comodo mencionado.
- Closet pode ser ambiente separado ou parte do Quarto — se o projeto separar, separe tambem.
- Varanda gourmet, area gourmet, espaco gourmet = um ambiente.
- Se houver mais de um quarto, diferencie: "Quarto Casal", "Quarto Filho 1", "Quarto Filho 2".

### Nomeacao dos ambientes
- Use nomes claros e descritivos em portugues.
- Exemplos: "Cozinha", "Sala de Estar", "Quarto Casal", "Suite Master", "Closet Suite", "Banheiro Social", "Lavanderia", "Home Office", "Area Gourmet", "Hall de Entrada"
- NAO use codigos ou abreviacoes. O nome do ambiente aparece no orcamento para o cliente.

### Distribuicao de moveis nos ambientes
- Cada movel vai no ambiente onde ele fica fisicamente.
- Painel de TV da sala vai em "Sala". Painel de TV do quarto vai em "Quarto Casal".
- Armarios de cozinha (superiores e inferiores) vao em "Cozinha".
- Se um movel serve a dois ambientes (ex: estante divisoria), coloque no ambiente principal.

### Ambiente sem moveis
- Se um comodo nao tem moveis planejados, NAO crie o ambiente.
- So crie ambientes que tenham pelo menos 1 modulo.

### Moveis tipicos por ambiente

| Ambiente | Moveis comuns (caixas) |
|----------|----------------------|
| Cozinha | Caixa Aérea (superiores), Caixa Baixa / Balcão (inferiores), Torre Quente (forno/micro), Ilha / Península, Despenseiro |
| Sala | Painel TV, Rack TV, Aparador / Buffet, Estante / Armário com Nichos, Adega / Wine Bar |
| Quarto Casal | Guarda-Roupa, Cômoda, Painel TV, Cabeceira, Mesa / Escrivaninha |
| Closet | Coluna / Torre Closet, Guarda-Roupa, Sapateira, Cômoda |
| Banheiro | Gabinete Banheiro, Painel Banheiro, Espelheira |
| Lavanderia | Armário Lavanderia, Caixa Aérea (superiores), Caixa Baixa / Balcão (inferiores) |
| Home Office | Home Office / Bancada, Estante / Armário com Nichos, Prateleira Avulsa |
| Quarto Filho | Guarda-Roupa, Cômoda, Mesa / Escrivaninha, Beliche / Mezzanine, Prateleira Avulsa |
| Area Gourmet | Caixa Aérea, Caixa Baixa / Balcão, Armário da Ilha Gourmet, Adega / Wine Bar |

### Dimensoes tipicas dos moveis (referencia em mm)

| Movel | Largura (L) | Altura (A) | Profundidade (P) |
|-------|-------------|------------|------------------|
| Armario superior cozinha | 400-1200 | 600-800 | 300-350 |
| Balcao/inferior cozinha | 400-1200 | 800-900 | 500-600 |
| Torre quente (forno/micro) | 600-700 | 2100-2400 | 550-650 |
| Guarda-roupa | 1500-3000 | 2400-2800 | 550-650 |
| Comoda | 800-1600 | 800-1000 | 400-500 |
| Painel TV | 1200-2200 | 900-1800 | 30-50 |
| Rack TV | 1200-2200 | 400-600 | 350-450 |
| Mesa/escrivaninha | 1000-1600 | 750-800 | 500-600 |
| Gabinete banheiro | 600-1200 | 550-800 | 400-500 |
| Estante | 800-1800 | 1800-2600 | 300-400 |
| Sapateira | 600-1000 | 1200-1800 | 300-400 |

---

## 11. FORMATO JSON PARA IMPORTACAO NO SISTEMA

Quando voce interpretar um projeto e quiser gerar o orcamento, voce DEVE gerar um JSON no formato abaixo. Este JSON sera importado diretamente no sistema Ornato ERP atraves do endpoint de importacao.

### Estrutura raiz

\`\`\`json
{
  "ambientes": [
    {
      "nome": "Nome do Ambiente (ex: Cozinha, Quarto Casal)",
      "itens": [
        { ... modulo 1 ... },
        { ... modulo 2 ... }
      ]
    }
  ]
}
\`\`\`

### Estrutura de cada ITEM (modulo/movel)

\`\`\`json
{
  "caixa": "Nome exato da caixa do catalogo",
  "nome": "Nome descritivo do movel (ex: Armario Sup Cozinha 1)",
  "L": 800,
  "A": 700,
  "P": 350,
  "qtd": 1,
  "matInt": "codigo_material_interno",
  "matExt": "codigo_material_externo",
  "componentes": [
    {
      "nome": "Nome exato do componente do catalogo",
      "qtd": 2,
      "vars": {
        "nomeVar": valor
      },
      "matExtComp": "codigo_material_frente"
    }
  ]
}
\`\`\`

### Campos obrigatorios por item

| Campo | Tipo | Descricao | Exemplo |
|-------|------|-----------|---------|
| \`caixa\` | string | **OBRIGATORIO**. Nome da caixa. Deve ser EXATAMENTE igual ao catalogo | \`"Caixa Aérea"\` |
| \`nome\` | string | Nome descritivo do movel para identificacao | \`"Armario Superior Pia"\` |
| \`L\` | number | Largura em milimetros | \`800\` |
| \`A\` | number | Altura em milimetros | \`700\` |
| \`P\` | number | Profundidade em milimetros | \`350\` |
| \`qtd\` | number | Quantidade (default: 1) | \`1\` |
| \`matInt\` | string | Codigo do material interno | \`"branco_tx15"\` |
| \`matExt\` | string | Codigo do material externo (face visivel) | \`"amad_medio"\` |
| \`componentes\` | array | Lista de componentes do movel | \`[...]\` |

### Campos de cada COMPONENTE

| Campo | Tipo | Descricao | Exemplo |
|-------|------|-----------|---------|
| \`nome\` | string | **OBRIGATORIO**. Nome do componente do catalogo | \`"Gaveta"\` |
| \`qtd\` | number | Quantidade deste componente | \`3\` |
| \`vars\` | object | Variaveis do componente (dimensoes, quantidade de divisoes, etc) | \`{ "ag": 200 }\` |
| \`matExtComp\` | string | Material da frente do componente | \`"amad_medio"\` |

### REGRA CRITICA: Nomes devem corresponder ao catalogo

Os nomes de \`caixa\` e \`componente.nome\` devem ser EXATAMENTE iguais aos nomes do catalogo (case-insensitive). Se o nome nao corresponder, o item sera ignorado e um aviso sera gerado.

#### Nomes de CAIXAS disponiveis:
${caixas.map(c => `- \`"${JSON.parse(c.json_data).nome}"\``).join('\n')}

#### Nomes de COMPONENTES disponiveis:
${comps.map(c => `- \`"${JSON.parse(c.json_data).nome}"\``).join('\n')}

### Variaveis comuns dos componentes

| Componente | Variavel | Descricao | Tipo |
|------------|----------|-----------|------|
| Porta | \`nPortas\` | Numero de folhas | number |
| Porta | \`Ap\` | Altura da porta (mm). Se omitido, usa Ai | number |
| Gaveta | \`ag\` | Altura da frente da gaveta (mm) | number |
| Prateleira | \`nBand\` | Numero de prateleiras | number |
| Nicho | \`an\` | Altura do nicho (mm) | number |
| Nicho | \`ln\` | Largura do nicho (mm). Se omitido, usa Li | number |
| Gaveta Basculante | \`ag\` | Altura da frente basculante (mm) | number |

### Codigos de materiais mais usados

| Codigo | Material |
|--------|----------|
${materiais.filter(m => m.tipo === 'material').map(m => `| \`"${m.cod}"\` | ${m.nome} |`).join('\n')}

### Codigos de ferragens (para referencia)

${materiais.filter(m => m.tipo === 'ferragem').map(m => `| \`"${m.cod}"\` | ${m.nome} |`).join('\n')}

### Codigos de acabamentos

${materiais.filter(m => m.tipo === 'acabamento').map(m => `| \`"${m.cod}"\` | ${m.nome} |`).join('\n')}

---

## 12. EXEMPLO COMPLETO DE JSON PARA IMPORTACAO

\`\`\`json
{
  "ambientes": [
    {
      "nome": "Cozinha",
      "itens": [
        {
          "caixa": "Caixa Aérea",
          "nome": "Armario Superior Pia",
          "L": 800,
          "A": 700,
          "P": 350,
          "matInt": "branco_tx15",
          "matExt": "amad_medio",
          "componentes": [
            {
              "nome": "Porta",
              "qtd": 1,
              "vars": { "nPortas": 2 },
              "matExtComp": "amad_medio"
            }
          ]
        },
        {
          "caixa": "Caixa Baixa / Balcão",
          "nome": "Balcao Pia",
          "L": 1200,
          "A": 850,
          "P": 550,
          "matInt": "branco_tx15",
          "matExt": "amad_medio",
          "componentes": [
            {
              "nome": "Gaveta",
              "qtd": 3,
              "vars": { "ag": 200 },
              "matExtComp": "amad_medio"
            },
            {
              "nome": "Porta",
              "qtd": 1,
              "vars": { "nPortas": 1 },
              "matExtComp": "amad_medio"
            }
          ]
        },
        {
          "caixa": "Torre Quente",
          "nome": "Torre para Forno e Micro-ondas",
          "L": 600,
          "A": 2200,
          "P": 600,
          "matInt": "branco_tx15",
          "matExt": "amad_medio",
          "componentes": [
            {
              "nome": "Nicho Aberto",
              "qtd": 2,
              "vars": { "an": 500 }
            },
            {
              "nome": "Gaveta",
              "qtd": 1,
              "vars": { "ag": 250 },
              "matExtComp": "amad_medio"
            }
          ]
        }
      ]
    },
    {
      "nome": "Quarto Casal",
      "itens": [
        {
          "caixa": "Guarda-Roupa",
          "nome": "Guarda-Roupa Casal",
          "L": 2500,
          "A": 2600,
          "P": 600,
          "matInt": "branco_tx15",
          "matExt": "amad_escuro",
          "componentes": [
            {
              "nome": "Porta de Correr",
              "qtd": 1,
              "vars": { "nPortas": 3 },
              "matExtComp": "amad_escuro"
            },
            {
              "nome": "Gaveta",
              "qtd": 6,
              "vars": { "ag": 200 },
              "matExtComp": "amad_escuro"
            },
            {
              "nome": "Prateleira",
              "qtd": 1,
              "vars": { "nBand": 5 }
            },
            {
              "nome": "Cabideiro",
              "qtd": 2
            }
          ]
        },
        {
          "caixa": "Cômoda",
          "nome": "Comoda Casal",
          "L": 1200,
          "A": 850,
          "P": 450,
          "matInt": "branco_tx15",
          "matExt": "amad_escuro",
          "componentes": [
            {
              "nome": "Gaveta",
              "qtd": 4,
              "vars": { "ag": 180 },
              "matExtComp": "amad_escuro"
            }
          ]
        },
        {
          "caixa": "Painel TV",
          "nome": "Painel TV Quarto",
          "L": 1800,
          "A": 1200,
          "P": 50,
          "matInt": "amad_escuro",
          "matExt": "amad_escuro",
          "componentes": []
        }
      ]
    }
  ]
}
\`\`\`

---

## 13. REGRAS PARA GERAR O JSON

1. **Identificar ambientes**: Cada comodo do projeto vira um objeto em \`ambientes[]\`.
2. **Cada movel vira um item**: Identificar a caixa mais adequada do catalogo.
3. **Dimensoes em mm**: SEMPRE em milimetros. Ex: 80cm = 800mm, 2.60m = 2600mm.
4. **Material padrao**: Se o projeto nao especificar cor/material, use \`"branco_tx15"\` para interno e deixe \`"matExt"\` vazio (o usuario define depois).
5. **Componentes**: Adicionar portas, gavetas, prateleiras, nichos conforme o projeto.
6. **Qtd default**: Se nao especificado, \`qtd: 1\`.
7. **Caixas similares**: Se o projeto menciona um movel que nao existe no catalogo mas e similar, use a caixa mais proxima e mencione a adaptacao no campo \`nome\`.
8. **Moveis repetidos**: Se o projeto tem 2 criados-mudos iguais, crie 1 item com \`qtd: 2\`.
9. **Sem componente no catalogo**: Se o componente nao existe, NAO inclua. O sistema ignorara e gerara um aviso. O usuario adicionara manualmente.
10. **Paineis/lambris/revestimentos**: Use caixa \`"Painel de Fechamento"\`.
11. **Sapateira dentro de closet**: E um componente \`"Sapateira Interna"\`, nao uma caixa.
12. **Cabeceira estofada**: E um componente \`"Cabeceira Estofada"\`, geralmente dentro de uma caixa \`"Painel de Cabeceira"\`.
13. **Forro de MDF**: Use caixa \`"Forro MDF"\` com L = comprimento e P = largura do forro.
14. **Beliche/Mezzanine**: Use caixa \`"Beliche / Mezzanine"\`.
15. **Despenseiro/armario com espaco para gas**: Use caixa \`"Despenseiro"\`.`;

        res.json({ prompt, stats: { caixas: caixas.length, componentes: comps.length, materiais: materiais.length } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
