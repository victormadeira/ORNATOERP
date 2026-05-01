// ═══════════════════════════════════════════════════════════════
// etiquetaPresets.js — Modelos profissionais de etiqueta CNC
// Baseados no padrão industrial Ornato (exemplo de referência)
// ═══════════════════════════════════════════════════════════════

// Todos os presets seguem o sistema de elementos do EditorEtiquetas:
// tipo: 'texto' | 'retangulo' | 'barcode' | 'qrcode' | 'diagrama_bordas'
//       'miniatura_peca' | 'minimapa' | 'imagem'
// Coordenadas em mm, origem top-left do label.

// ─────────────────────────────────────────────────────────────
// PRESET 1 — Industrial Completa (190×130mm)
// Reproduz o layout de referência com todas as seções:
// bandas de fita, Usinagem A/B, cliente, módulo, peça,
// miniatura 2D, obs e barcodes de expedição.
// ─────────────────────────────────────────────────────────────
const INDUSTRIAL_COMPLETA = {
    nome: 'Industrial Completa ★ (190×130mm)',
    largura: 190,
    altura: 130,
    colunas_impressao: 1,
    margem_pagina: 5,
    gap_etiquetas: 3,
    elementos: [
        // ── Borda externa ────────────────────────────────────
        { id: 'a_frame', tipo: 'retangulo', x: 0, y: 0, w: 190, h: 130, preenchimento: 'none', bordaCor: '#000', bordaLargura: 0.6 },

        // ── Banda superior (fita frontal) ─────────────────────
        { id: 'a_top_rect', tipo: 'retangulo', x: 0, y: 0, w: 190, h: 5.5, preenchimento: '#f0f0f0', bordaCor: '#000', bordaLargura: 0.4 },
        { id: 'a_top_txt',  tipo: 'texto', x: 6, y: 1.2, w: 178, h: 4, texto: '{{borda_cor_frontal}} | {{borda_frontal}}', fontSize: 2.8, fontWeight: 700, alinhamento: 'middle' },

        // ── Banda inferior (fita traseira) ───────────────────
        { id: 'a_bot_rect', tipo: 'retangulo', x: 0, y: 124.5, w: 190, h: 5.5, preenchimento: '#f0f0f0', bordaCor: '#000', bordaLargura: 0.4 },
        { id: 'a_bot_txt',  tipo: 'texto', x: 6, y: 125.8, w: 178, h: 4, texto: '{{borda_cor_traseira}} | {{borda_traseira}}', fontSize: 2.8, fontWeight: 700, alinhamento: 'middle' },

        // ── Banda lateral esquerda (fita esq, rotacionada) ───
        { id: 'a_left_rect', tipo: 'retangulo', x: 0, y: 5.5, w: 5.5, h: 119, preenchimento: '#f0f0f0', bordaCor: '#000', bordaLargura: 0.4 },
        { id: 'a_left_txt',  tipo: 'texto',     x: 0, y: 5.5, w: 5.5, h: 119, texto: '{{borda_cor_esq}} | {{borda_esq}}', fontSize: 2.8, fontWeight: 700, alinhamento: 'middle', rotacao: -90 },

        // ── Faixa preta lateral direita (número de controle grande) ──
        { id: 'a_right_bg',   tipo: 'retangulo', x: 174.5, y: 5.5,  w: 15.5, h: 119,  preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },
        { id: 'a_right_ctrl', tipo: 'texto',     x: 174.5, y: 5.5,  w: 15.5, h: 82,   texto: '{{controle}}', fontSize: 11, fontWeight: 900, cor: '#ffffff', alinhamento: 'middle', rotacao: 90, variavel: 'controle' },
        { id: 'a_right_bor',  tipo: 'texto',     x: 174.5, y: 90,   w: 15.5, h: 34.5, texto: '{{borda_cor_dir}} | {{borda_dir}}', fontSize: 2.2, cor: '#ffffff', alinhamento: 'middle', rotacao: 90 },

        // ── Divisória horizontal superior ─────────────────────
        { id: 'a_div_top', tipo: 'retangulo', x: 5.5, y: 22, w: 169, h: 0.35, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },

        // ── Barcode Usinagem A (top esquerda) ────────────────
        { id: 'a_usia_box', tipo: 'retangulo', x: 5.5, y: 5.5, w: 82, h: 16.5, preenchimento: 'none', bordaCor: '#bbb', bordaLargura: 0.2 },
        { id: 'a_bc_usia',  tipo: 'barcode',   x: 6.5, y: 6,   w: 80, h: 12.5, barcodeVariavel: 'usi_a' },
        { id: 'a_lbl_usia', tipo: 'texto',     x: 6.5, y: 19.5, w: 35, h: 2.5, texto: 'Usinagem A:', fontSize: 2.2, fontWeight: 600, cor: '#444' },

        // ── Divisória vertical top section ───────────────────
        { id: 'a_top_vdiv', tipo: 'retangulo', x: 90, y: 5.5, w: 0.3, h: 16.5, preenchimento: '#ccc', bordaCor: 'none', bordaLargura: 0 },

        // ── Info material (top direita) ───────────────────────
        { id: 'a_lbl_mat',   tipo: 'texto',     x: 92,  y: 7,    w: 30, h: 3,   texto: 'Material:', fontSize: 2.3, fontWeight: 600, cor: '#555' },
        { id: 'a_mat_val',   tipo: 'texto',     x: 92,  y: 10.5, w: 79, h: 5,   texto: '{{material}}', fontSize: 3.5, fontWeight: 700, variavel: 'material' },
        { id: 'a_mat_esp',   tipo: 'texto',     x: 92,  y: 16,   w: 65, h: 3,   texto: 'Esp: {{espessura}}mm', fontSize: 2.2, cor: '#666' },
        { id: 'a_mat_sw',    tipo: 'retangulo', x: 165, y: 7,    w: 7,  h: 7,   preenchimento: '#111', bordaCor: '#333', bordaLargura: 0.2, raio: 0.5 },

        // ── Divisória vertical entre colunas (coluna client / coluna peça) ──
        { id: 'a_col_div', tipo: 'retangulo', x: 100.5, y: 22, w: 0.3, h: 72, preenchimento: '#ccc', bordaCor: 'none', bordaLargura: 0 },

        // ── Coluna cliente (x 5.5..100) ──────────────────────
        { id: 'a_lbl_cli', tipo: 'texto', x: 7, y: 23.5, w: 35, h: 3,   texto: 'Cliente', fontSize: 2.5, fontWeight: 700, cor: '#555' },
        { id: 'a_cli_val', tipo: 'texto', x: 7, y: 27.5, w: 90, h: 8,   texto: '{{cliente}}', fontSize: 7.5, fontWeight: 800, cor: '#e53e3e', variavel: 'cliente' },

        { id: 'a_d1', tipo: 'retangulo', x: 5.5, y: 37.5, w: 95, h: 0.25, preenchimento: '#ddd', bordaCor: 'none', bordaLargura: 0 },

        { id: 'a_lbl_proj', tipo: 'texto', x: 7, y: 38.5, w: 35, h: 3,   texto: 'Descrição projeto', fontSize: 2.5, fontWeight: 700, cor: '#555' },
        { id: 'a_proj_val', tipo: 'texto', x: 7, y: 42,   w: 90, h: 6,   texto: '{{projeto}}', fontSize: 5.5, fontWeight: 700, variavel: 'projeto' },

        { id: 'a_d2', tipo: 'retangulo', x: 5.5, y: 50, w: 95, h: 0.25, preenchimento: '#ddd', bordaCor: 'none', bordaLargura: 0 },

        { id: 'a_lbl_mod', tipo: 'texto', x: 7, y: 51,   w: 35, h: 3,   texto: 'Módulo', fontSize: 2.5, fontWeight: 700, cor: '#555' },
        { id: 'a_mod_val', tipo: 'texto', x: 7, y: 54.5, w: 90, h: 6,   texto: '{{modulo_desc}}', fontSize: 5, fontWeight: 700, variavel: 'modulo_desc' },

        { id: 'a_d3', tipo: 'retangulo', x: 5.5, y: 62, w: 95, h: 0.25, preenchimento: '#ddd', bordaCor: 'none', bordaLargura: 0 },

        { id: 'a_lbl_peca', tipo: 'texto', x: 7, y: 63,   w: 35, h: 3,   texto: 'Peça', fontSize: 2.5, fontWeight: 700, cor: '#555' },
        { id: 'a_peca_val', tipo: 'texto', x: 7, y: 66.5, w: 90, h: 6,   texto: '{{descricao}}', fontSize: 5, fontWeight: 700, variavel: 'descricao' },

        // ── Linha + IDs ───────────────────────────────────────
        { id: 'a_ids_line', tipo: 'retangulo', x: 5.5, y: 74.5, w: 95, h: 0.45, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },

        { id: 'a_lbl_idm',  tipo: 'texto', x: 7,    y: 76,   w: 26, h: 2.8, texto: 'ID Mód.', fontSize: 2.3, fontWeight: 600, cor: '#555' },
        { id: 'a_idm_val',  tipo: 'texto', x: 7,    y: 79.5, w: 26, h: 5.5, texto: '{{modulo_id}}', fontSize: 5, fontWeight: 800, variavel: 'modulo_id' },

        { id: 'a_vd1', tipo: 'retangulo', x: 36.5, y: 74.5, w: 0.3, h: 20, preenchimento: '#aaa', bordaCor: 'none', bordaLargura: 0 },

        { id: 'a_lbl_ctrl', tipo: 'texto', x: 38,   y: 76,   w: 26, h: 2.8, texto: 'Controle', fontSize: 2.3, fontWeight: 600, cor: '#555' },
        { id: 'a_ctrl_val', tipo: 'texto', x: 38,   y: 79.5, w: 26, h: 5.5, texto: '{{controle}}', fontSize: 5, fontWeight: 800, variavel: 'controle' },

        { id: 'a_vd2', tipo: 'retangulo', x: 67.5, y: 74.5, w: 0.3, h: 20, preenchimento: '#aaa', bordaCor: 'none', bordaLargura: 0 },

        { id: 'a_lbl_fita', tipo: 'texto', x: 69,   y: 76,   w: 28, h: 2.8, texto: 'Fita de borda', fontSize: 2.3, fontWeight: 600, cor: '#555' },
        { id: 'a_fita_val', tipo: 'texto', x: 69,   y: 79.5, w: 28, h: 5.5, texto: '{{fita_resumo}}', fontSize: 4.5, fontWeight: 800, variavel: 'fita_resumo' },

        // Diagrama bordas + código de barras
        { id: 'a_diag', tipo: 'diagrama_bordas', x: 7, y: 86, w: 14, h: 8, diagramaCor: '#22c55e' },
        { id: 'a_lbl_cod', tipo: 'texto', x: 7,  y: 95, w: 30, h: 3, texto: 'Cód: {{codigo}}', fontSize: 2.2, cor: '#555', variavel: 'codigo' },

        // ── Coluna peça direita (x 101..174) ─────────────────
        { id: 'a_lbl_comp', tipo: 'texto', x: 102.5, y: 23, w: 70, h: 3.5, texto: 'Comprimento: {{comprimento}}mm', fontSize: 2.8, fontWeight: 600 },
        { id: 'a_mini',     tipo: 'miniatura_peca', x: 104, y: 27.5, w: 63, h: 53 },
        // "Largura: Xmm" rotacionado na lateral
        { id: 'a_lbl_larg', tipo: 'texto', x: 101, y: 27.5, w: 3, h: 53, texto: '{{largura}}mm', fontSize: 2.5, fontWeight: 600, alinhamento: 'middle', rotacao: -90 },
        { id: 'a_esp_v',    tipo: 'texto', x: 102.5, y: 82, w: 70, h: 4, texto: 'Espessura: {{espessura}}mm', fontSize: 2.5, cor: '#555' },
        { id: 'a_acab_v',   tipo: 'texto', x: 102.5, y: 87, w: 70, h: 4, texto: 'Acab: {{acabamento}} · ID: {{peca_id}}', fontSize: 2.5, cor: '#555' },

        // ── OBS bar ───────────────────────────────────────────
        { id: 'a_obs_line', tipo: 'retangulo', x: 5.5, y: 94, w: 169, h: 0.45, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },
        { id: 'a_obs_lbl',  tipo: 'texto',     x: 7,    y: 95, w: 12, h: 3.5, texto: 'OBS:', fontSize: 2.5, fontWeight: 700 },
        { id: 'a_obs_val',  tipo: 'texto',     x: 20,   y: 95, w: 153, h: 7.5, texto: '{{observacao}}', fontSize: 2.5, variavel: 'observacao' },

        // ── Barcodes inferiores ───────────────────────────────
        { id: 'a_bc_line', tipo: 'retangulo', x: 5.5,  y: 103.5, w: 169,  h: 0.45, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },

        // Expedição (esquerda)
        { id: 'a_bc_exp',    tipo: 'barcode', x: 6.5,  y: 104.5, w: 77,  h: 17, barcodeVariavel: 'controle' },
        { id: 'a_lbl_exp',   tipo: 'texto',   x: 6.5,  y: 122,   w: 30,  h: 2.5, texto: 'Expedição', fontSize: 2.3, fontWeight: 600, cor: '#444' },

        // Divisória entre barcodes
        { id: 'a_bc_vdiv', tipo: 'retangulo', x: 86.5, y: 103.5, w: 0.3, h: 21, preenchimento: '#aaa', bordaCor: 'none', bordaLargura: 0 },

        // Usinagem B (direita)
        { id: 'a_bc_usib',   tipo: 'barcode', x: 88,   y: 104.5, w: 77,  h: 17, barcodeVariavel: 'usi_b' },
        { id: 'a_lbl_usib',  tipo: 'texto',   x: 138,  y: 122,   w: 27,  h: 2.5, texto: 'Usinagem B:', fontSize: 2.3, fontWeight: 600, cor: '#444', alinhamento: 'end' },
    ],
};

// ─────────────────────────────────────────────────────────────
// PRESET 2 — Expedição Rápida (105×74mm / A7)
// Formato compacto com foco em código de barras,
// cliente e dados de rastreamento para expedição.
// ─────────────────────────────────────────────────────────────
const EXPEDICAO_RAPIDA = {
    nome: 'Expedição Rápida (105×74mm)',
    largura: 105,
    altura: 74,
    colunas_impressao: 2,
    margem_pagina: 8,
    gap_etiquetas: 3,
    elementos: [
        // ── Frame ─────────────────────────────────────────────
        { id: 'b_frame', tipo: 'retangulo', x: 0, y: 0, w: 105, h: 74, preenchimento: 'none', bordaCor: '#000', bordaLargura: 0.5 },

        // ── Faixa preta header com empresa ───────────────────
        { id: 'b_head_bg', tipo: 'retangulo', x: 0, y: 0, w: 105, h: 8, preenchimento: '#111', bordaCor: 'none', bordaLargura: 0 },
        { id: 'b_head_emp', tipo: 'texto', x: 3, y: 1.5, w: 55, h: 5.5, texto: '{{empresa_nome}}', fontSize: 4.5, fontWeight: 800, cor: '#fff', variavel: 'empresa_nome' },
        { id: 'b_head_lote', tipo: 'texto', x: 63, y: 3, w: 40, h: 4, texto: 'EXPEDIÇÃO', fontSize: 3.2, fontWeight: 700, cor: '#f59e0b', alinhamento: 'end' },

        // ── Barcode expedição (grande, logo abaixo do header) ─
        { id: 'b_bc_exp', tipo: 'barcode', x: 3, y: 9, w: 99, h: 18, barcodeVariavel: 'controle' },

        // ── Linha divisória ───────────────────────────────────
        { id: 'b_div1', tipo: 'retangulo', x: 0, y: 28, w: 105, h: 0.4, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },

        // ── Dados cliente (left column) ───────────────────────
        { id: 'b_lbl_cli', tipo: 'texto', x: 3, y: 29.5, w: 35, h: 3, texto: 'Cliente', fontSize: 2.3, fontWeight: 700, cor: '#555' },
        { id: 'b_cli_val', tipo: 'texto', x: 3, y: 33,   w: 60, h: 5.5, texto: '{{cliente}}', fontSize: 5, fontWeight: 800, cor: '#1e40af', variavel: 'cliente' },

        { id: 'b_lbl_proj', tipo: 'texto', x: 3, y: 40, w: 35, h: 3, texto: 'Projeto', fontSize: 2.3, fontWeight: 700, cor: '#555' },
        { id: 'b_proj_val', tipo: 'texto', x: 3, y: 43.5, w: 60, h: 4, texto: '{{projeto}}', fontSize: 3.8, fontWeight: 700, variavel: 'projeto' },

        { id: 'b_lbl_peca', tipo: 'texto', x: 3, y: 49, w: 35, h: 3, texto: 'Peça', fontSize: 2.3, fontWeight: 700, cor: '#555' },
        { id: 'b_peca_val', tipo: 'texto', x: 3, y: 52.5, w: 60, h: 4.5, texto: '{{descricao}}', fontSize: 3.8, fontWeight: 700, variavel: 'descricao' },

        // ── Vertical divider ──────────────────────────────────
        { id: 'b_vdiv', tipo: 'retangulo', x: 66, y: 28, w: 0.3, h: 46, preenchimento: '#ccc', bordaCor: 'none', bordaLargura: 0 },

        // ── QR Code (right) ───────────────────────────────────
        { id: 'b_qr', tipo: 'qrcode', x: 67, y: 29, w: 18, h: 18, barcodeVariavel: 'controle' },

        // ── Dimensões (right column) ──────────────────────────
        { id: 'b_lbl_dim', tipo: 'texto', x: 87, y: 29.5, w: 15, h: 3, texto: 'Dim.', fontSize: 2.3, fontWeight: 700, cor: '#555' },
        { id: 'b_comp_v',  tipo: 'texto', x: 67,  y: 48, w: 36, h: 3.5, texto: 'C: {{comprimento}}mm', fontSize: 2.8, fontWeight: 600 },
        { id: 'b_larg_v',  tipo: 'texto', x: 67,  y: 52.5, w: 36, h: 3.5, texto: 'L: {{largura}}mm', fontSize: 2.8, fontWeight: 600 },
        { id: 'b_esp_v',   tipo: 'texto', x: 67,  y: 57,  w: 36, h: 3.5, texto: 'E: {{espessura}}mm', fontSize: 2.8, fontWeight: 600 },

        // ── Linha divisória inferior ──────────────────────────
        { id: 'b_div2', tipo: 'retangulo', x: 0, y: 59, w: 105, h: 0.4, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },

        // ── Footer: material + controle + diagrama ────────────
        { id: 'b_mat_v',   tipo: 'texto', x: 3, y: 60.5, w: 60, h: 3.5, texto: '{{material}} · {{espessura}}mm', fontSize: 2.5, fontWeight: 600, variavel: 'material' },
        { id: 'b_diag',    tipo: 'diagrama_bordas', x: 3, y: 64.5, w: 10, h: 7, diagramaCor: '#22c55e' },
        { id: 'b_fita_v',  tipo: 'texto', x: 14.5, y: 65.5, w: 50, h: 4, texto: '{{fita_resumo}}', fontSize: 2.2, cor: '#333', variavel: 'fita_resumo' },
        { id: 'b_ctrl_v',  tipo: 'texto', x: 80, y: 60.5, w: 22, h: 3, texto: 'Ctrl:', fontSize: 2, cor: '#555' },
        { id: 'b_ctrl_n',  tipo: 'texto', x: 80, y: 63.5, w: 22, h: 7, texto: '{{controle}}', fontSize: 6, fontWeight: 800, alinhamento: 'end', variavel: 'controle' },
        { id: 'b_mod_v',   tipo: 'texto', x: 3, y: 70.5, w: 60, h: 3, texto: 'Módulo: {{modulo_desc}}', fontSize: 2.2, cor: '#666', variavel: 'modulo_desc' },
    ],
};

// ─────────────────────────────────────────────────────────────
// PRESET 3 — Técnica de Produção (150×100mm)
// Foco em dados técnicos para a bancada: dimensões grandes,
// miniatura da peça, posição na chapa e usinagens.
// ─────────────────────────────────────────────────────────────
const TECNICA_PRODUCAO = {
    nome: 'Técnica de Produção (150×100mm)',
    largura: 150,
    altura: 100,
    colunas_impressao: 1,
    margem_pagina: 6,
    gap_etiquetas: 3,
    elementos: [
        // ── Frame ─────────────────────────────────────────────
        { id: 'c_frame', tipo: 'retangulo', x: 0, y: 0, w: 150, h: 100, preenchimento: 'none', bordaCor: '#000', bordaLargura: 0.6 },

        // ── Header strip ─────────────────────────────────────
        { id: 'c_head', tipo: 'retangulo', x: 0, y: 0, w: 150, h: 9, preenchimento: '#1a1a2e', bordaCor: 'none', bordaLargura: 0 },
        { id: 'c_lbl_ctrl', tipo: 'texto', x: 3, y: 2, w: 25, h: 5.5, texto: '{{controle}}', fontSize: 5, fontWeight: 900, cor: '#f59e0b', variavel: 'controle' },
        { id: 'c_lbl_pnome', tipo: 'texto', x: 30, y: 2.5, w: 85, h: 4.5, texto: '{{descricao}}', fontSize: 4, fontWeight: 700, cor: '#ffffff', variavel: 'descricao' },
        // Barcode no header (small)
        { id: 'c_bc_small', tipo: 'barcode', x: 118, y: 0.5, w: 30, h: 8, barcodeVariavel: 'controle' },

        // ── Coluna esquerda (x=0..75, y=9..100) ──────────────
        // Material bloco
        { id: 'c_mat_bg', tipo: 'retangulo', x: 0, y: 9, w: 75, h: 18, preenchimento: '#f8f8f8', bordaCor: '#e0e0e0', bordaLargura: 0.2 },
        { id: 'c_mat_lbl', tipo: 'texto', x: 3, y: 10.5, w: 35, h: 3, texto: 'Material', fontSize: 2.4, fontWeight: 700, cor: '#555' },
        { id: 'c_mat_val', tipo: 'texto', x: 3, y: 14,   w: 70, h: 5, texto: '{{material}}', fontSize: 4.5, fontWeight: 700, variavel: 'material' },
        { id: 'c_esp_val', tipo: 'texto', x: 3, y: 20,   w: 50, h: 4, texto: 'Espessura: {{espessura}}mm', fontSize: 3, fontWeight: 600 },

        // Divisória
        { id: 'c_d1', tipo: 'retangulo', x: 0, y: 27, w: 75, h: 0.3, preenchimento: '#ddd', bordaCor: 'none', bordaLargura: 0 },

        // Dimensões bloco (grandes)
        { id: 'c_dim_lbl', tipo: 'texto', x: 3, y: 28.5, w: 35, h: 3, texto: 'Dimensões', fontSize: 2.4, fontWeight: 700, cor: '#555' },
        { id: 'c_comp_lbl', tipo: 'texto', x: 3, y: 32.5, w: 20, h: 3, texto: 'COMP.', fontSize: 2, fontWeight: 600, cor: '#888' },
        { id: 'c_comp_val', tipo: 'texto', x: 3, y: 36,   w: 70, h: 8, texto: '{{comprimento}}mm', fontSize: 8, fontWeight: 900, variavel: 'comprimento' },
        { id: 'c_larg_lbl', tipo: 'texto', x: 3, y: 46,   w: 20, h: 3, texto: 'LARG.', fontSize: 2, fontWeight: 600, cor: '#888' },
        { id: 'c_larg_val', tipo: 'texto', x: 3, y: 49.5, w: 70, h: 8, texto: '{{largura}}mm', fontSize: 8, fontWeight: 900, variavel: 'largura' },

        // Divisória
        { id: 'c_d2', tipo: 'retangulo', x: 0, y: 59, w: 75, h: 0.3, preenchimento: '#ddd', bordaCor: 'none', bordaLargura: 0 },

        // Cliente + Módulo + Peça (texto denso)
        { id: 'c_cli_lbl', tipo: 'texto', x: 3, y: 60.5, w: 20, h: 3, texto: 'Cliente', fontSize: 2.2, fontWeight: 600, cor: '#555' },
        { id: 'c_cli_val', tipo: 'texto', x: 3, y: 63.5, w: 70, h: 4.5, texto: '{{cliente}}', fontSize: 4, fontWeight: 700, cor: '#e53e3e', variavel: 'cliente' },
        { id: 'c_mod_lbl', tipo: 'texto', x: 3, y: 69.5, w: 20, h: 3, texto: 'Módulo', fontSize: 2.2, fontWeight: 600, cor: '#555' },
        { id: 'c_mod_val', tipo: 'texto', x: 3, y: 72.5, w: 70, h: 4, texto: '{{modulo_desc}}', fontSize: 3.5, fontWeight: 700, variavel: 'modulo_desc' },
        { id: 'c_proj_lbl', tipo: 'texto', x: 3, y: 78, w: 20, h: 3, texto: 'Projeto', fontSize: 2.2, fontWeight: 600, cor: '#555' },
        { id: 'c_proj_val', tipo: 'texto', x: 3, y: 81, w: 70, h: 4, texto: '{{projeto}}', fontSize: 3.5, fontWeight: 700, variavel: 'projeto' },

        // Divisória
        { id: 'c_d3', tipo: 'retangulo', x: 0, y: 87, w: 75, h: 0.3, preenchimento: '#ddd', bordaCor: 'none', bordaLargura: 0 },

        // Bordas (diagrama + resumo)
        { id: 'c_diag', tipo: 'diagrama_bordas', x: 3, y: 88.5, w: 12, h: 9, diagramaCor: '#3b82f6' },
        { id: 'c_fita_val', tipo: 'texto', x: 17, y: 89.5, w: 56, h: 7, texto: '{{fita_resumo}}', fontSize: 2.8, cor: '#333', variavel: 'fita_resumo' },

        // ── Divisória vertical central ────────────────────────
        { id: 'c_vdiv', tipo: 'retangulo', x: 75.5, y: 9, w: 0.3, h: 91, preenchimento: '#bbb', bordaCor: 'none', bordaLargura: 0 },

        // ── Coluna direita: miniatura + minimapa ──────────────
        { id: 'c_lbl_vista', tipo: 'texto', x: 78, y: 10.5, w: 68, h: 3, texto: 'Vista da peça', fontSize: 2.4, fontWeight: 700, cor: '#555' },

        // Miniatura da peça (grande)
        { id: 'c_mini', tipo: 'miniatura_peca', x: 78, y: 14, w: 70, h: 45 },

        // Minimapa (posição na chapa)
        { id: 'c_lbl_chapa', tipo: 'texto', x: 78, y: 61, w: 70, h: 3, texto: 'Posição na chapa', fontSize: 2.4, fontWeight: 700, cor: '#555' },
        { id: 'c_mapa', tipo: 'minimapa', x: 78, y: 65, w: 70, h: 33 },

        // Barcodes UsiA + UsiB embaixo
        { id: 'c_div_bc', tipo: 'retangulo', x: 75.5, y: 76, w: 74.5, h: 0.3, preenchimento: '#ccc', bordaCor: 'none', bordaLargura: 0 },
        { id: 'c_bc_usia', tipo: 'barcode', x: 77, y: 76.5, w: 35, h: 14, barcodeVariavel: 'usi_a' },
        { id: 'c_lbl_usia', tipo: 'texto', x: 77, y: 91, w: 20, h: 3, texto: 'Usinagem A:', fontSize: 2, fontWeight: 600, cor: '#444' },
        { id: 'c_bc_usib', tipo: 'barcode', x: 114, y: 76.5, w: 35, h: 14, barcodeVariavel: 'usi_b' },
        { id: 'c_lbl_usib', tipo: 'texto', x: 128, y: 91, w: 21, h: 3, texto: 'Usinagem B:', fontSize: 2, fontWeight: 600, cor: '#444', alinhamento: 'end' },

        // Acabamento + ID peça (footer)
        { id: 'c_div_ft', tipo: 'retangulo', x: 0, y: 96, w: 150, h: 0.3, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },
        { id: 'c_ft_txt', tipo: 'texto', x: 3, y: 97, w: 144, h: 3, texto: 'Acab: {{acabamento}} · ID Peça: {{peca_id}} · Código: {{codigo}}', fontSize: 2.2, cor: '#555' },
    ],
};

// ─────────────────────────────────────────────────────────────
// PRESET 4 — Controle de Materiais Compacta (80×50mm)
// Mínimo essencial para controle interno por material.
// ─────────────────────────────────────────────────────────────
const CONTROLE_COMPACTA = {
    nome: 'Controle Compacta (80×50mm)',
    largura: 80,
    altura: 50,
    colunas_impressao: 3,
    margem_pagina: 5,
    gap_etiquetas: 2,
    elementos: [
        { id: 'd_frame', tipo: 'retangulo', x: 0, y: 0, w: 80, h: 50, preenchimento: 'none', bordaCor: '#000', bordaLargura: 0.5 },

        // Header strip azul
        { id: 'd_head', tipo: 'retangulo', x: 0, y: 0, w: 80, h: 7, preenchimento: '#1B2A4A', bordaCor: 'none', bordaLargura: 0 },
        { id: 'd_head_t', tipo: 'texto', x: 3, y: 1.5, w: 55, h: 5, texto: '{{descricao}}', fontSize: 4, fontWeight: 800, cor: '#fff', variavel: 'descricao' },
        { id: 'd_ctrl_n', tipo: 'texto', x: 60, y: 2, w: 18, h: 4, texto: '{{controle}}', fontSize: 3.5, fontWeight: 700, cor: '#C9A96E', alinhamento: 'end', variavel: 'controle' },

        // Barcode
        { id: 'd_bc', tipo: 'barcode', x: 3, y: 8, w: 74, h: 14, barcodeVariavel: 'controle' },

        // Divider
        { id: 'd_div', tipo: 'retangulo', x: 0, y: 23, w: 80, h: 0.4, preenchimento: '#000', bordaCor: 'none', bordaLargura: 0 },

        // Material
        { id: 'd_mat_v', tipo: 'texto', x: 3, y: 24.5, w: 50, h: 4, texto: '{{material}}', fontSize: 3.5, fontWeight: 700, variavel: 'material' },
        { id: 'd_esp_v', tipo: 'texto', x: 3, y: 29.5, w: 50, h: 3.5, texto: 'Esp: {{espessura}}mm', fontSize: 3, fontWeight: 600 },

        // Dimensões
        { id: 'd_dim_v', tipo: 'texto', x: 3, y: 34.5, w: 60, h: 4, texto: '{{comprimento}} × {{largura}}mm', fontSize: 3.5, fontWeight: 700 },

        // Cliente
        { id: 'd_cli_v', tipo: 'texto', x: 3, y: 40, w: 55, h: 4, texto: '{{cliente}}', fontSize: 3.2, fontWeight: 700, cor: '#1e40af', variavel: 'cliente' },

        // Diagrama bordas
        { id: 'd_diag', tipo: 'diagrama_bordas', x: 65, y: 24, w: 12, h: 9, diagramaCor: '#22c55e' },

        // Módulo
        { id: 'd_mod_v', tipo: 'texto', x: 3, y: 45.5, w: 74, h: 3.5, texto: 'Módulo: {{modulo_desc}}', fontSize: 2.5, cor: '#555', variavel: 'modulo_desc' },
    ],
};

// ─────────────────────────────────────────────────────────────
// Exportações
// ─────────────────────────────────────────────────────────────
export const ETIQUETA_PRESETS = [
    INDUSTRIAL_COMPLETA,
    EXPEDICAO_RAPIDA,
    TECNICA_PRODUCAO,
    CONTROLE_COMPACTA,
];

export const PRESET_DESCRICOES = {
    0: {
        icon: '🏭',
        badge: 'INDUSTRIAL',
        badgeColor: '#dc2626',
        descricao: 'Layout completo: bandas de fita de borda, Usinagem A/B, dados de cliente, módulo, miniatura 2D e barcodes de expedição.',
        uso: 'Produção CNC / Corte e expedição final',
    },
    1: {
        icon: '📦',
        badge: 'EXPEDIÇÃO',
        badgeColor: '#f59e0b',
        descricao: 'Formato compacto A7 com barcode grande, QR code, dados do cliente e rastreamento rápido.',
        uso: 'Separação e expedição logística',
    },
    2: {
        icon: '🔧',
        badge: 'PRODUÇÃO',
        badgeColor: '#3b82f6',
        descricao: 'Dimensões em destaque, miniatura da peça, posição na chapa e informações técnicas completas.',
        uso: 'Bancada de corte e montagem',
    },
    3: {
        icon: '📋',
        badge: 'CONTROLE',
        badgeColor: '#8b5cf6',
        descricao: 'Formato pequeno para controle interno: material, dimensões, barcode e diagrama de bordas.',
        uso: 'Estoque e controle de materiais',
    },
};
