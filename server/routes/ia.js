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
        const empresa = db.prepare("SELECT nome, cidade, estado FROM empresa_config LIMIT 1").get();

        // ── Montar seção CAIXAS ──
        const caixasPorCat = {};
        for (const cx of caixas) {
            const d = JSON.parse(cx.json_data);
            if (!caixasPorCat[d.cat]) caixasPorCat[d.cat] = [];
            caixasPorCat[d.cat].push({ nome: d.nome, desc: d.desc, coef: d.coef, dims: (d.dimsAplicaveis || ['L','A','P']).join(',') });
        }

        let secaoCaixas = '';
        for (const [cat, items] of Object.entries(caixasPorCat)) {
            secaoCaixas += `\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
            secaoCaixas += `| Caixa | Descricao | Coef | Dims |\n|-------|-----------|------|------|\n`;
            for (const it of items) {
                secaoCaixas += `| ${it.nome} | ${it.desc} | ${it.coef} | ${it.dims} |\n`;
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

### Dimensoes aplicaveis (dimsAplicaveis)
Nem todos os modulos usam as 3 dimensoes. O campo **dimsAplicaveis** de cada caixa define quais sao necessarias:
- **Paineis planos** (Painel Ripado, Painel de Fechamento, Cabeceira, Espelho Organico): usam apenas **L e A** — a profundidade e a espessura da chapa (15mm), nao precisa informar P.
- **Painel TV**: usa **L, A e P** — porque possui prateleira interna que precisa de profundidade.
- **Prateleira Avulsa, Forro MDF**: usam apenas **L e P** — a altura e a espessura da chapa, nao precisa informar A.
- **Caixas completas** (Caixa Alta, Baixa, Aerea, etc.): usam **L, A e P**.
- Ao gerar o JSON de importacao, informe **apenas as dimensoes aplicaveis**. Dimensoes nao aplicaveis serao ignoradas pelo sistema.
- A coluna **Dims** na tabela de caixas abaixo indica quais dimensoes cada modulo usa.

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
| MDF Freijo / Louro Freijo / Gianduia / Ipê / Carvalho Natural | amad_medio |
| MDF Areia / Lord / Sal Rosa / Cafelatte / Creme / Bege / Amendoa | amad_claro |
| MDF Nogueira / Nogueira Caiena / Gaia / Tramato / Castanho / Wenge / Tabaco | amad_escuro |
| MDF Branco / Branco TX / Branco Polar / Off White | branco_tx15 |
| MDF Branco Ultra / Branco Premium / Alto Brilho Branco | branco_ultra |
| MDF Preto / Preto TX / Preto Fosco | preto_tx |
| MDF Laca / Laqueado | laca15 |
| Cinza Fossil / Cinza Grafite / Cinza Marte / Cinza (qualquer tom) | personalizado |
| Coloridos (Verde, Rosa, Azul, Vinho, Terracota, Mostarda) | personalizado |
| Material nao identificado / Sob medida / Especial | personalizado |

### Regra matInt vs matExt:
- **matInt**: material das pecas estruturais internas (laterais, topo, base, fundo). Geralmente MDF branco ou mais barato.
- **matExt**: material das faces visiveis externas (tamponamentos, porta de correr no guarda-roupa). Geralmente o material nobre do projeto.
- **matExtComp**: material da frente dos componentes (porta de abrir, gaveta). Geralmente o material nobre.
- Se o projeto especifica apenas UM material para tudo (ex: "MDF Nogueira Caiena em todas as pecas"), use o mesmo codigo em matInt, matExt e matExtComp.
- Se o movel e bipartido (ex: "interior branco, frente Nogueira"), use matInt diferente de matExt/matExtComp.

### Mapeamento de ferragens:
| Mencionado no projeto | Ferragem |
|----------------------|----------|
| "puxador cava" / "usinado" / "puxador integrado" / "sem puxador aparente" | puxCava |
| "fecho toque" / "tip-on" / "push open" | tipOn |
| "corredica oculta" / "telescopica" / "full extension oculta" | corrOculta |
| "pistao a gas" / "porta basculante" / "articulador" | pistGas |
| "perfil LED" / "fita LED" / "iluminacao interna" / "LED embutido" | perfilLed |
| "trilho de correr" / "porta deslizante" / "porta de correr" | trilhoCorrer |
| "articulador" / "porta articulada" / "porta rebativel" | articulador |
| "lixeira deslizante" / "lixeira embutida" | lixeiraDesliz |

---

## 8. REGRAS DE NEGOCIO

1. **Fita de borda**: toda face visivel recebe fita. Faces ocultas nao.
2. **Fundo**: sempre compensado 3mm (comp3), exceto movel aberto atras.
3. **Tamponamento**: faces visiveis externas. Se encostado na parede, nao precisa.
4. **Dobradicas**: ate 900mm = 2un, 900-1600mm = 3un, acima = 4un.
5. **Corredica**: SEMPRE usar corredica oculta (corrOculta ou corrFH) como padrao. NAO usar corr400/corr500 (corredica normal) — a marcenaria trabalha exclusivamente com corredicas ocultas.
6. **Porta fecho toque**: usa Tip-On, sem puxador aparente.
7. **Puxador cava**: usinado no MDF, sem ferragem adicional visivel.
8. **Porta componente**: use a variavel nPortas para o NUMERO DE FOLHAS. O componente "Porta" gera 1 frente para cada folha. Uma porta de 2 folhas = nPortas: 2.
9. **Gaveta**: ag = altura da frente em mm. Gaveta padrao cozinha = 150-200mm, gaveta roupa = 200-250mm, gavetao = 300-400mm.
10. **Prateleira**: nBand = numero de prateleiras internas. Nao inclui base e topo da caixa.
11. **Painel Ripado / Muxarabi**: estes itens sao tratados pelo motor de ripado. Use caixa="Painel Ripado" ou caixa="Painel Muxarabi". O sistema converte automaticamente para o motor correto. Informe L (largura total) e A (altura total).
12. **Alturas por tipo de caixa** (CRITICO — respeitar para nao gerar modulos impossiveis):
    - Caixa Aerea: A entre 300-800mm (modulo SUSPENSO na parede). Se A > 800mm, use "Armario Alto" ou "Caixa Alta".
    - Caixa Baixa / Balcao: A entre 700-950mm (modulo apoiado no chao, sob bancada).
    - Caixa Alta / Armario Alto: A entre 1800-2800mm (modulo alto do chao ao teto).
    - Torre Quente: A entre 2000-2500mm.
    - Guarda-Roupa: A entre 2200-2800mm.
    - Rack TV: A entre 300-600mm.
    - Comoda: A entre 700-1100mm.
    - Gabinete Banheiro: A entre 500-850mm.
    - Espelheira: A entre 600-1300mm.
    - Cabeceira: A entre 800-1500mm (painel, nao movel alto).
    - Painel TV / Painel de Fechamento: A livre (painel de parede, pode ir do chao ao teto).
13. **Ap (altura da porta) — REGRA CRITICA**:
    - Ap NUNCA pode ser maior que Ai (altura interna = A - 30mm).
    - Se omitir Ap, o sistema usa Ai automaticamente. Prefira omitir quando a porta ocupa toda a altura interna.
    - Se o modulo tem MULTIPLOS GRUPOS de portas em alturas diferentes (ex: portas superiores + portas inferiores), calcule: Ap do grupo inferior = Ai - Ap do grupo superior - 15mm (divisoria). Exemplo: modulo A=1900 → Ai=1870. Se portas sup Ap=500, portas inf Ap = 1870 - 500 - 15 = 1355mm.
    - NUNCA use Ap = A (altura total do modulo). O correto e Ap <= Ai.
    - Portas de Painel de Fechamento sao excecao: Ap pode ser igual a A pois nao tem estrutura de caixa.
14. **Validacao de componentes dentro do modulo**:
    - A soma das alturas dos componentes frontais (portas + gavetas) NAO pode ultrapassar Ai.
    - Exemplo: modulo A=850 → Ai=820. Se tem 3 gavetas ag=200 (=600mm total) + 1 porta, entao Ap da porta deve ser no maximo 820 - 600 - folgas = ~200mm.
    - Componentes sem frente (Prateleira, Cabideiro, Nicho Aberto) ficam ATRAS das portas, nao somam na frente.
15. **Espessura da chapa**: a caixa padrao usa MDF 15mm. Ai = A - 30 (2x15mm), Li = L - 30. Usar esses valores como referencia ao calcular Ap e dimensoes internas.

---

## 9. DICAS

- "Armario superior" cozinha = Caixa Aerea
- "Armario inferior" / "balcao" cozinha = Caixa Baixa / Balcao
- "Mesa de cabeceira" / "criado mudo" = Comoda (menor, L 400-600mm)
- "Penteadeira" / "mesa maquiagem" = Comoda (L 800-1200mm) ou Mesa / Escrivaninha
- "Lambri" / "revestimento parede" / "painel de fundo" = Painel de Fechamento (P=18-30mm)
- "Cristaleira" com vidro = Cristaleira + Porta com Vidro
- "Sapateira" dentro de closet = Sapateira Interna (componente)
- "Gaveta basculante" = Gaveta Basculante (componente)
- "Porta de correr com espelho" = Porta de Correr com Espelho (componente)
- "Porta de correr MDF" = Porta de Correr (componente)
- "Painel ripado" / "painel com ripas" / "ripado decorativo" = caixa "Painel Ripado"
- "Muxarabi" / "painel muxarabi" = caixa "Painel Muxarabi"
- "Nicho aberto" / "nicho decorativo" = Nicho Aberto (componente, vars: an=altura em mm)
- "Nichos iluminados" = Nicho Iluminado (componente)
- "Maleiro" = Maleiro (componente) — prateleira fixa no topo do guarda-roupa
- "Cabideiro" / "cabide de roupas" = Cabideiro (componente) — nao tem vars
- "Espelheira" banheiro = Espelheira (caixa) com Porta (componente, matExtComp = vidro ou espelho)
- "Torre forno micro" = Torre Quente com Nicho Aberto (para o forno) + Porta acima/abaixo
- "Bancada suspensa" = Caixa Baixa / Balcao com A reduzida (ex: A=300-400mm)
- "Painel cabeceira" = Cabeceira (caixa) com Cabeceira Estofada (componente) se tiver estofado
- "Guarda-roupa com espelho" = Guarda-Roupa + Porta de Correr com Espelho (componente)
- "Porta toque" / "push open" / "sem puxador" = Porta Fecho Toque (componente). Se a porta for de vidro, use matExtComp="vidro_incol"
- "Porta pivotante" em painel de fechamento = Porta (componente) com Ap igual a A do painel (excecao a regra de Ap <= Ai)
- "Mesa redonda" / "mesa lateral redonda" / "movel curvo" = Movel Curvo (caixa coef=1.0, alta complexidade)
- "Armario coluna" / "armario estreito alto" cozinha = se A > 800mm, usar "Armario Alto" e NAO "Caixa Aerea"
- Quando o movel tem portas em DUAS alturas diferentes (ex: aerea em cima + portas grandes embaixo), criar 2 entradas de "Porta" com Ap diferentes
- "Envoltorio 21mm" / "porta embutida" = porte com bordas internas visiveis, nao afeta o JSON
- Ferragens especificas no nome (ex: "puxador Granado Zen", "metalon chumbo fosco") = incluir no campo nome para referencia, nao gera ferragem automatica

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

| Movel | Largura (L) | Altura (A) | Profundidade (P) | Dims |
|-------|-------------|------------|------------------|------|
| Armario superior cozinha | 400-1200 | 600-800 | 300-350 | L,A,P |
| Balcao/inferior cozinha | 400-1200 | 800-900 | 500-600 | L,A,P |
| Torre quente (forno/micro) | 600-700 | 2100-2400 | 550-650 | L,A,P |
| Guarda-roupa | 1500-3000 | 2400-2800 | 550-650 | L,A,P |
| Comoda | 800-1600 | 800-1000 | 400-500 | L,A,P |
| Painel TV | 1200-2200 | 900-1800 | 300-500 | L,A,P |
| Painel Ripado | 1000-3000 | 1500-2800 | — | L,A |
| Painel de Fechamento | 500-3000 | 500-2800 | — | L,A |
| Cabeceira | 1400-2200 | 800-1500 | — | L,A |
| Prateleira Avulsa | 600-1800 | — | 200-400 | L,P |
| Forro MDF | 1000-3000 | — | 500-2000 | L,P |
| Rack TV | 1200-2200 | 400-600 | 350-450 | L,A,P |
| Mesa/escrivaninha | 1000-1600 | 750-800 | 500-600 | L,A,P |
| Gabinete banheiro | 600-1200 | 550-800 | 400-500 | L,A,P |
| Estante | 800-1800 | 1800-2600 | 300-400 | L,A,P |
| Sapateira | 600-1000 | 1200-1800 | 300-400 | L,A,P |

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
| \`A\` | number | Altura em mm. **Omitir se a caixa nao usa A** (ex: Prateleira Avulsa, Forro MDF) | \`700\` |
| \`P\` | number | Profundidade em mm. **Omitir se a caixa nao usa P** (ex: Painel Ripado, Painel de Fechamento, Cabeceira, Espelho Organico). Painel TV USA P (tem prateleira). | \`350\` |
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

### Variaveis dos componentes (COMPLETO)

| Componente | Variavel | Descricao | Tipo | Exemplo |
|------------|----------|-----------|------|---------|
| Porta | \`nPortas\` | Numero de folhas (1=simples, 2=dupla, 4=quadrupla) | number | \`2\` |
| Porta | \`Ap\` | Altura da porta em mm. Omitir = usa altura interna Ai | number | \`700\` |
| Porta com Vidro | \`nPortas\` | Numero de folhas com vidro | number | \`2\` |
| Porta com Vidro | \`Ap\` | Altura da porta (mm) | number | \`800\` |
| Porta de Correr | \`nPortas\` | Numero de folhas deslizantes | number | \`2\` |
| Porta de Correr com Espelho | \`nPortas\` | Numero de folhas com espelho | number | \`3\` |
| Porta Basculante | \`nPortas\` | Numero de folhas basculantes | number | \`1\` |
| Porta Fecho Toque | \`nPortas\` | Numero de folhas push-open | number | \`2\` |
| Porta Ripada | \`nPortas\` | Numero de folhas ripadas | number | \`2\` |
| Porta com Friso | \`nPortas\` | Numero de folhas com friso | number | \`2\` |
| Porta com Muxarabi | \`nPortas\` | Numero de folhas com muxarabi | number | \`1\` |
| Porta com Palhinha | \`nPortas\` | Numero de folhas com palhinha | number | \`2\` |
| Porta Provencal | \`nPortas\` | Numero de folhas provencal | number | \`2\` |
| Porta Perfil Aluminio | \`nPortas\` | Numero de folhas perfil alu | number | \`2\` |
| Gaveta | \`ag\` | Altura da frente da gaveta (mm). Padrao 200mm | number | \`180\` |
| Gavetao | \`ag\` | Altura do gavetao (mm). Padrao 300mm | number | \`350\` |
| Gaveta Basculante | \`ag\` | Altura da frente basculante (mm) | number | \`200\` |
| Gaveta Organizadora | \`ag\` | Altura da gaveta organizadora (mm) | number | \`150\` |
| Prateleira | \`nBand\` | Numero de prateleiras internas | number | \`3\` |
| Prateleira com LED | \`nBand\` | Numero de prateleiras iluminadas | number | \`4\` |
| Prateleira Borda Curva | \`nBand\` | Numero de prateleiras curvas | number | \`2\` |
| Nicho Aberto | \`an\` | Altura do nicho (mm) | number | \`350\` |
| Nicho Aberto | \`ln\` | Largura do nicho (mm). Omitir = usa Li | number | \`400\` |
| Nicho Iluminado | \`an\` | Altura do nicho iluminado (mm) | number | \`350\` |
| Divisoria Vertical | — | Sem variaveis. Divide internamente | — | — |
| Maleiro | — | Sem variaveis. Prateleira fixa no topo | — | — |
| Cabideiro | — | Sem variaveis. Tubo na altura de roupas | — | — |
| Sapateira Interna | — | Sem variaveis. Modulo de sapateira | — | — |
| Cabeceira Estofada | — | Sem variaveis. Painel estofado frontal | — | — |
| Lixeira Deslizante | — | Sem variaveis. Lixeira embutida pull-out | — | — |

### CRITICO: Como usar Porta corretamente
- Cada grupo de portas de MESMA altura e material = 1 entrada de componente
- Se um armario tem 2 portas superiores (A=800mm) e 2 portas inferiores (A=600mm): use 2 entradas separadas de "Porta"
- Exemplo: \`{ "nome": "Porta", "qtd": 1, "vars": { "nPortas": 2, "Ap": 800 }, "matExtComp": "amad_escuro" }\`
- O campo \`qtd\` no componente multiplica o custo. Para 2 grupos de 2 portas com mesma altura: use 1 entrada com nPortas=2 e qtd=2 (ou 2 entradas com nPortas=2 e qtd=1).
- **VALIDACAO Ap**: Ap NUNCA pode ser maior que Ai (= A - 30). Se omitir Ap, usa Ai inteiro. Excecao: portas em Painel de Fechamento podem ter Ap = A.
- **EXEMPLO com 2 grupos**: Armario Alto A=1900mm (Ai=1870mm). Portas superiores Ap=500. Portas inferiores Ap = 1870 - 500 - 15 (divisoria) = 1355mm.
  \`\`\`json
  "componentes": [
    { "nome": "Porta", "qtd": 1, "vars": { "nPortas": 2, "Ap": 500 }, "matExtComp": "..." },
    { "nome": "Porta", "qtd": 1, "vars": { "nPortas": 2, "Ap": 1355 }, "matExtComp": "..." }
  ]
  \`\`\`

### ERROS COMUNS A EVITAR
1. **Ap = A**: Errado. Use Ap <= Ai (= A - 30). Exceto em Painel de Fechamento.
2. **Caixa Aerea com A > 800mm**: Use "Armario Alto" ou "Caixa Alta".
3. **corr400/corr500 como corredica**: Use corrOculta ou corrFH (corredica oculta).
4. **Componentes sobrando na frente**: soma de (todas portas Ap + todas gavetas ag) nao pode passar de Ai.
5. **Painel Ripado como caixa normal**: O sistema converte automaticamente para o motor de ripado. Nao adicione componentes ao Painel Ripado.
6. **matExtComp em componente sem frente**: Prateleira, Cabideiro, Nicho Aberto, Divisoria nao tem frente — nao colocar matExtComp.
7. **Porta de Correr sem Ap**: Omitir Ap em porta de correr = usa Ai inteiro. Isso e correto para guarda-roupa.

### Codigos de materiais mais usados

| Codigo | Material |
|--------|----------|
${materiais.filter(m => m.tipo === 'material').map(m => `| \`"${m.cod}"\` | ${m.nome} |`).join('\n')}

### Codigos de ferragens (para referencia)

| Codigo | Ferragem |
|--------|----------|
${materiais.filter(m => m.tipo === 'ferragem').map(m => `| \`"${m.cod}"\` | ${m.nome} |`).join('\n')}

### Codigos de acabamentos

| Codigo | Acabamento |
|--------|------------|
${materiais.filter(m => m.tipo === 'acabamento').map(m => `| \`"${m.cod}"\` | ${m.nome} |`).join('\n')}

### Codigos de acessorios

| Codigo | Acessorio |
|--------|-----------|
${materiais.filter(m => m.tipo === 'acessorio').map(m => `| \`"${m.cod}"\` | ${m.nome} |`).join('\n')}

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
          "P": 350,
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
3b. **Dimensoes aplicaveis**: Consultar a coluna **Dims** do catalogo de caixas (secao 2). Informar APENAS as dimensoes listadas. Ex: Painel Ripado = L,A (nao informar P). Prateleira Avulsa = L,P (nao informar A). Painel TV = L,A,P (informar P pois tem prateleira). Informar dimensoes nao aplicaveis causa erro no calculo.
4. **Material padrao**: Se o projeto nao especificar cor/material, use \`"branco_tx15"\` para interno e deixe \`"matExt"\` vazio (o usuario define depois).
5. **Componentes**: Adicionar portas, gavetas, prateleiras, nichos conforme o projeto.
6. **Qtd default**: Se nao especificado, \`qtd: 1\`.
7. **Caixas similares**: Se o projeto menciona um movel que nao existe no catalogo mas e similar, use a caixa mais proxima e mencione a adaptacao no campo \`nome\`.
8. **Moveis repetidos**: Se o projeto tem 2 criados-mudos iguais, crie 1 item com \`qtd: 2\`.
9. **Sem componente no catalogo**: Se o componente nao existe, NAO inclua. O sistema ignorara e gerara um aviso. O usuario adicionara manualmente.
10. **Paineis/lambris/revestimentos**: Use caixa \`"Painel de Fechamento"\`.
11. **Sapateira dentro de closet**: E um componente \`"Sapateira Interna"\`, nao uma caixa.
12. **Cabeceira estofada**: E um componente \`"Cabeceira Estofada"\`, geralmente dentro de uma caixa \`"Cabeceira"\`.
13. **Forro de MDF**: Use caixa \`"Forro MDF"\` com L = comprimento e P = largura do forro.
14. **Beliche/Mezzanine**: Use caixa \`"Beliche / Mezzanine"\`.
15. **Despenseiro/armario com espaco para gas**: Use caixa \`"Despenseiro"\`.`;

        res.json({ prompt, stats: { caixas: caixas.length, componentes: comps.length, materiais: materiais.length } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
