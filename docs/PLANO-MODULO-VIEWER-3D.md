# Plano: Viewer 3D de Modulo Montado

> **Status:** Planejamento futuro
> **Prioridade:** Feature diferenciadora (nenhum concorrente tem)
> **Dependencia principal:** Plugin SketchUp exportar `transformation` de cada peca

---

## Visao Geral

Ferramenta que permite visualizar um movel completo em 3D, com todas as pecas posicionadas.
O operador/montador escaneia o QR code de uma etiqueta e ve:
1. O movel inteiro montado
2. A peca em destaque (highlight) na posicao correta dentro do movel
3. Vista explodida para entender a montagem

**Flow principal:**
```
QR Code da etiqueta
     |
     v
GET /api/cnc/modulo-viewer/:loteId/:moduloId?peca=:pecaId
     |
     v
Retorna JSON com todas as pecas do modulo + machining_json
     |
     v
ModuloViewer3D monta o movel em 3D
     |
     v
Peca selecionada fica destacada (cor diferente, pulsante)
```

---

## Pre-requisitos

### 1. Plugin SketchUp: Exportar Transformation (OBRIGATORIO)

Adicionar no plugin de exportacao do SketchUp o campo `transformation` de cada `ComponentInstance`.
Esse campo contem a matriz 4x4 de posicao/rotacao/escala da peca dentro do modelo.

**Snippet Ruby para o plugin:**

```ruby
# Dentro do loop que percorre as entities de cada modulo:
# entity = Sketchup::ComponentInstance

if entity.respond_to?(:transformation)
  t = entity.transformation
  # Exportar como array 16 floats (coluna-major, padrao SketchUp)
  transform_array = [
    t.xaxis.x, t.xaxis.y, t.xaxis.z, 0,
    t.yaxis.x, t.yaxis.y, t.yaxis.z, 0,
    t.zaxis.x, t.zaxis.y, t.zaxis.z, 0,
    t.origin.x.to_mm, t.origin.y.to_mm, t.origin.z.to_mm, 1
  ]
  entity_data['upmtransform'] = transform_array
end
```

**Formato do campo `upmtransform`:**
```json
{
  "upmtransform": [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    150.5, 0, 300, 1
  ]
}
```

Array de 16 floats, coluna-major (mesmo formato do SketchUp).
Os 3 ultimos valores antes do 1 final sao a posicao X, Y, Z em milimetros.

### 2. Backend: Armazenar Transform

Adicionar coluna na tabela `cnc_pecas`:

```sql
ALTER TABLE cnc_pecas ADD COLUMN transform_json TEXT DEFAULT NULL;
```

No parser do JSON de importacao (server/routes/cnc.js, funcao de parse):

```javascript
// Dentro do loop que processa cada entity/peca:
if (ent.upmtransform && Array.isArray(ent.upmtransform) && ent.upmtransform.length === 16) {
    pecaData.transform_json = JSON.stringify(ent.upmtransform);
}
```

### 3. Backend: Endpoint do Modulo Viewer

```javascript
// GET /api/cnc/modulo-viewer/:loteId/:moduloId
router.get('/modulo-viewer/:loteId/:moduloId', (req, res) => {
    const { loteId, moduloId } = req.params;
    const pecaIdHighlight = req.query.peca || null;

    // Buscar todas as pecas deste modulo neste lote
    const pecas = db.prepare(`
        SELECT id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
               comprimento, largura, espessura, material, material_code,
               borda_dir, borda_esq, borda_frontal, borda_traseira,
               machining_json, machining_json_b, transform_json,
               upmdraw, acabamento, observacao
        FROM cnc_pecas
        WHERE lote_id = ? AND modulo_id = ?
        ORDER BY upmcode, id
    `).all(loteId, moduloId);

    if (pecas.length === 0) return res.status(404).json({ error: 'Modulo nao encontrado' });

    // Dimensoes do modulo (extrair da primeira peca que tenha)
    // OU buscar do JSON original do lote se disponivel
    const moduloInfo = {
        modulo_id: moduloId,
        modulo_desc: pecas[0].modulo_desc,
        // Dimensoes podem ser inferidas das laterais + tampo/base
        // ou vir do JSON original
    };

    res.json({
        modulo: moduloInfo,
        pecas: pecas.map(p => ({
            ...p,
            machining_json: p.machining_json ? JSON.parse(p.machining_json) : null,
            machining_json_b: p.machining_json_b ? JSON.parse(p.machining_json_b) : null,
            transform: p.transform_json ? JSON.parse(p.transform_json) : null,
        })),
        highlight: pecaIdHighlight,
    });
});
```

### 4. QR Code na Etiqueta

A etiqueta ja tem QR code. Alterar o conteudo para incluir URL do viewer:

```
https://ornato.app/modulo-viewer/{loteId}/{moduloId}?peca={pecaId}
```

Ou manter o QR atual e adicionar um botao "Ver no movel" na tela de detalhes da peca.

---

## Arquitetura do Componente

```
src/components/ModuloViewer3D.jsx     — Componente principal
src/components/ModuloViewer3D.css     — Estilos (se necessario)
```

### Pipeline de renderizacao

```
1. FETCH      Buscar JSON do modulo (todas as pecas + transforms)
      |
2. PARSE      Para cada peca: extrair dimensoes, machining, transform
      |
3. BUILD      Para cada peca: gerar geometria 3D
      |        - Com CSG (furos/rebaixos reais) se performance OK
      |        - Com BoxGeometry simplificado se mobile/muitas pecas
      |
4. POSITION   Aplicar transform do SketchUp a cada peca
      |        - Converter matriz 4x4 do SketchUp para Three.js
      |        - Fallback: tabela de regras por upmcode
      |
5. ASSEMBLE   Adicionar todas as pecas a um THREE.Group
      |
6. HIGHLIGHT  Destacar a peca selecionada
      |
7. CONTROLS   OrbitControls + slider de explosao + botoes de vista
```

---

## Implementacao: ModuloViewer3D.jsx

### Estrutura do componente

```jsx
export default function ModuloViewer3D({ loteId, moduloId, highlightPecaId }) {
    // State
    const [modulo, setModulo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [explosion, setExplosion] = useState(0); // 0=montado, 1=explodido
    const [selectedPeca, setSelectedPeca] = useState(highlightPecaId);
    const [viewMode, setViewMode] = useState('assembled'); // assembled | exploded | xray
    const canvasRef = useRef(null);

    // Fetch module data
    useEffect(() => {
        fetch(`/api/cnc/modulo-viewer/${loteId}/${moduloId}`)
            .then(r => r.json())
            .then(data => { setModulo(data); setLoading(false); });
    }, [loteId, moduloId]);

    // Build 3D scene when data loads
    useEffect(() => {
        if (!modulo || !canvasRef.current) return;
        buildScene(modulo, canvasRef.current, {
            explosion,
            selectedPeca,
            viewMode,
        });
    }, [modulo, explosion, selectedPeca, viewMode]);

    return (
        <div className="modulo-viewer">
            <canvas ref={canvasRef} />
            {/* Controles */}
            <ViewerControls
                explosion={explosion}
                onExplosionChange={setExplosion}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
            />
            {/* Lista de pecas */}
            <PecasList
                pecas={modulo?.pecas}
                selected={selectedPeca}
                onSelect={setSelectedPeca}
            />
            {/* Info da peca selecionada */}
            {selectedPeca && (
                <PecaInfoPanel peca={modulo?.pecas.find(p => p.id == selectedPeca)} />
            )}
        </div>
    );
}
```

### Aplicar Transform do SketchUp

```javascript
/**
 * Converter transform array do SketchUp (coluna-major 4x4)
 * para THREE.Matrix4 e aplicar ao mesh.
 *
 * SketchUp usa:
 *   X = largura (vermelho)
 *   Y = profundidade (verde)
 *   Z = altura (azul)
 *
 * Three.js usa:
 *   X = largura
 *   Y = altura (vertical)
 *   Z = profundidade
 *
 * Conversao: trocar Y e Z do SketchUp.
 */
function applySketchUpTransform(mesh, transformArray) {
    if (!transformArray || transformArray.length !== 16) return;

    // SketchUp matrix (column-major): indices [0..15]
    // [m00, m10, m20, m30, m01, m11, m21, m31, m02, m12, m22, m32, m03, m13, m23, m33]
    const m = transformArray;

    // Trocar Y e Z para Three.js
    // SketchUp (x, y, z) -> Three.js (x, z, y)
    // Posicao: col 3 (indices 12,13,14)
    //   SKU: tx=m[12], ty=m[13], tz=m[14]
    //   THR: tx=m[12], ty=m[14], tz=m[13]
    //
    // Rotacao: trocar linhas/colunas Y<->Z na matriz 3x3

    const mat = new THREE.Matrix4();
    mat.set(
        m[0],  m[8],  m[4],  m[12],       // col 0: X SKU -> X THR, swap Y/Z
        m[2],  m[10], m[6],  m[14],       // col 1: Z SKU -> Y THR (altura)
        m[1],  m[9],  m[5],  m[13],       // col 2: Y SKU -> Z THR (profundidade)
        m[3],  m[11], m[7],  m[15]        // col 3: homogeneo
    );

    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(mat);
    mesh.matrixWorldNeedsUpdate = true;
}
```

### Fallback: Tabela de Regras por upmcode (Caminho A)

Quando `transform_json` nao estiver disponivel, usar regras baseadas no codigo da peca.

```javascript
const PIECE_RULES = {
    // ── LATERAIS ──
    'CM_LAT_ESQ':     { orientation: 'VERTICAL',   pos: (p, m) => ({ x: 0, y: 0, z: 0 }) },
    'CM_LAT_ESQ_DUP': { orientation: 'VERTICAL',   pos: (p, m) => ({ x: 0, y: 0, z: 0 }) },
    'CM_LAT_DIR':     { orientation: 'VERTICAL',   pos: (p, m) => ({ x: m.W - p.thickness, y: 0, z: 0 }) },
    'CM_LAT_DIR_DUP': { orientation: 'VERTICAL',   pos: (p, m) => ({ x: m.W - p.thickness, y: 0, z: 0 }) },

    // ── BASE E TAMPO ──
    'CM_BAS':         { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: 0 }) },
    'CM_BAS_CAN':     { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: 0 }) },
    'CM_TAM':         { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: m.H - p.thickness }) },
    'CM_TAM_DUP':     { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: m.H - p.thickness }) },
    'CM_TAM_ENG':     { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: m.H - p.thickness }) },

    // ── FUNDO ──
    'CM_FUN_VER':     { orientation: 'BACK_PANEL',  pos: (p, m) => ({ x: m.LT, y: m.D - p.thickness, z: 0 }) },
    'CM_FUN_HOR':     { orientation: 'BACK_PANEL',  pos: (p, m) => ({ x: 0, y: m.D - p.thickness, z: 0 }) },

    // ── PRATELEIRAS ──
    'CM_PRA':         { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: 'INFER_Z' }) },

    // ── REGUAS ──
    'CM_REG':         { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: 'INFER_Z' }) },
    'CM_REG_DEI':     { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: 0, y: 0, z: 'INFER_Z' }) },
    'CM_REG_FEC':     { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: m.D - p.width, z: 'INFER_Z' }) },

    // ── DIVISORIAS ──
    'CM_DIV':         { orientation: 'VERTICAL',    pos: (p, m) => ({ x: 'INFER_X', y: 0, z: p.thickness }) },

    // ── PORTAS ──
    'CHPOR':          { orientation: 'VERTICAL',    pos: (p, m) => ({ x: 0, y: -p.thickness, z: 0 }) },

    // ── TAMPONAMENTO (fora do corpo) ──
    'CM_LAT_ESQ_TAM':     { orientation: 'VERTICAL',   pos: (p, m) => ({ x: -p.thickness, y: 0, z: 0 }) },
    'CM_LAT_DIR_TAM':     { orientation: 'VERTICAL',   pos: (p, m) => ({ x: m.W, y: 0, z: 0 }) },
    'CM_BAS_TAM':         { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: 0, y: 0, z: -p.thickness }) },
    'CM_TAM_TAM':         { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: 0, y: 0, z: m.H }) },

    // ── GAVETAS ──
    'CM_LEG':         { orientation: 'VERTICAL',    pos: (p, m) => ({ x: m.LT, y: 0, z: 'INFER_Z' }) },
    'CM_LDG':         { orientation: 'VERTICAL',    pos: (p, m) => ({ x: m.W - m.LT - p.thickness, y: 0, z: 'INFER_Z' }) },
    'CM_CFG':         { orientation: 'VERTICAL',    pos: (p, m) => ({ x: m.LT + p.thickness, y: 0, z: 'INFER_Z' }) },
    'CM_TRG':         { orientation: 'VERTICAL',    pos: (p, m) => ({ x: m.LT + p.thickness, y: m.D - p.thickness, z: 'INFER_Z' }) },
    'CM_FUN_GAV_VER': { orientation: 'HORIZONTAL',  pos: (p, m) => ({ x: m.LT, y: 0, z: 'INFER_Z' }) },
};

// Orientacoes -> rotacoes Three.js
// Peca CSG sai com: X=comprimento, Y=espessura(vertical), Z=largura
// (apos a rotacao -PI/2 do ExtrudeGeometry que ja fazemos)
const ORIENTATIONS = {
    HORIZONTAL: { x: 0, y: 0, z: 0 },
    // L->Z(alt), W->Z(prof), T->X
    VERTICAL:   { x: 0, y: 0, z: -Math.PI / 2 },
    // L->Z(alt), W->X(larg), T->Y(prof)
    BACK_PANEL: { x: Math.PI / 2, y: 0, z: 0 },
};
```

### Inferencia de Posicao Z (Prateleiras, Reguas)

```javascript
/**
 * Inferir posicao Z de uma prateleira analisando os furos twister
 * nas laterais do modulo.
 *
 * Logica: furos twister na lateral esquerda, face top (face interna),
 * a posicao X do furo corresponde a posicao Z no modulo montado.
 * Agrupar furos por proximidade para identificar cada prateleira.
 */
function inferShelfZ(piece, allPieces) {
    const lateral = allPieces.find(p =>
        p.upmcode === 'CM_LAT_ESQ' && p.machining_json
    );
    if (!lateral) return distributeEvenly(piece, allPieces);

    const mach = typeof lateral.machining_json === 'string'
        ? JSON.parse(lateral.machining_json) : lateral.machining_json;
    if (!mach?.workers) return distributeEvenly(piece, allPieces);

    const workers = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);

    // Coletar posicoes X dos twisters na face top
    const twisters = [];
    for (const w of workers) {
        const tool = (w.tool || w.tool_code || '').toLowerCase();
        const face = (w.face || w.quadrant || '').toLowerCase();
        if (tool.includes('twister') && face === 'top') {
            twisters.push(Number(w.x ?? w.position_x ?? 0));
        }
    }

    if (twisters.length === 0) return distributeEvenly(piece, allPieces);

    // Agrupar por proximidade (50mm tolerancia)
    const sorted = [...twisters].sort((a, b) => a - b);
    const groups = [];
    let current = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] < 50) {
            current.push(sorted[i]);
        } else {
            groups.push(current.reduce((a, b) => a + b, 0) / current.length);
            current = [sorted[i]];
        }
    }
    groups.push(current.reduce((a, b) => a + b, 0) / current.length);

    // Cada grupo = uma prateleira. Encontrar o indice desta prateleira.
    const prateleiras = allPieces.filter(p => p.upmcode === 'CM_PRA');
    const idx = prateleiras.indexOf(piece);
    if (idx >= 0 && idx < groups.length) return groups[idx];

    return distributeEvenly(piece, allPieces);
}

function distributeEvenly(piece, allPieces) {
    const shelves = allPieces.filter(p => p.upmcode === piece.upmcode);
    const idx = shelves.indexOf(piece);
    const count = shelves.length;
    const lateral = allPieces.find(p => p.upmcode?.includes('LAT'));
    const LT = lateral ? Number(lateral.espessura || 15.5) : 15.5;
    const base = allPieces.find(p => p.upmcode === 'CM_BAS');
    const tampo = allPieces.find(p => p.upmcode === 'CM_TAM');
    const baseZ = base ? Number(base.espessura || 0) : 0;
    const tampoZ = tampo ? (Number(tampo.comprimento || 700)) : 700; // altura modulo
    const spacing = (tampoZ - baseZ) / (count + 1);
    return baseZ + spacing * (idx + 1);
}
```

---

## Vista Explodida

```javascript
class ExplodedViewController {
    constructor(moduleGroup) {
        this.group = moduleGroup;
        this.originals = new Map();
        this.factor = 0;

        // Salvar posicoes originais
        moduleGroup.children.forEach(child => {
            this.originals.set(child.name, {
                pos: child.position.clone(),
                mat: child.matrix.clone(),
            });
        });
    }

    setExplosion(factor) {
        this.factor = Math.max(0, Math.min(1, factor));
        const dist = 80 * this.factor; // mm

        this.group.children.forEach(child => {
            const orig = this.originals.get(child.name);
            if (!orig) return;
            const code = child.userData.code || '';
            const offset = this.getOffset(code, dist);

            if (child.matrixAutoUpdate === false) {
                // Transform do SketchUp: modificar a matrix diretamente
                child.matrix.copy(orig.mat);
                child.matrix.elements[12] += offset.x;
                child.matrix.elements[13] += offset.y;
                child.matrix.elements[14] += offset.z;
            } else {
                child.position.set(
                    orig.pos.x + offset.x,
                    orig.pos.y + offset.y,
                    orig.pos.z + offset.z,
                );
            }
            child.matrixWorldNeedsUpdate = true;
        });
    }

    getOffset(code, dist) {
        // Cada tipo afasta numa direcao diferente
        if (code.includes('LAT_ESQ')) return { x: -dist, y: 0, z: 0 };
        if (code.includes('LAT_DIR')) return { x: dist, y: 0, z: 0 };
        if (code === 'CM_BAS')       return { x: 0, y: -dist, z: 0 };
        if (code === 'CM_TAM')       return { x: 0, y: dist, z: 0 };
        if (code.includes('FUN'))    return { x: 0, y: 0, z: dist };
        if (code.includes('PRA'))    return { x: 0, y: 0, z: -dist * 0.5 };
        if (code.includes('REG'))    return { x: 0, y: 0, z: -dist * 0.3 };
        if (code.includes('CHPOR')) return { x: 0, y: 0, z: -dist * 1.5 };
        if (code.includes('DIV'))    return { x: 0, y: 0, z: -dist * 0.3 };
        if (/LEG|LDG|CFG|TRG|FUN_GAV/.test(code)) return { x: 0, y: 0, z: -dist * 2 };
        return { x: 0, y: 0, z: 0 };
    }

    animateTo(target, duration = 800) {
        const start = this.factor;
        const t0 = performance.now();
        const tick = (now) => {
            const t = Math.min((now - t0) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            this.setExplosion(start + (target - start) * eased);
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }
}
```

---

## Highlight da Peca Selecionada

```javascript
function highlightPiece(moduleGroup, pecaId) {
    moduleGroup.children.forEach(child => {
        const isSelected = String(child.userData.pid) === String(pecaId);
        const mats = Array.isArray(child.material) ? child.material : [child.material];

        mats.forEach(mat => {
            if (isSelected) {
                mat.emissive = new THREE.Color(0x2563eb);
                mat.emissiveIntensity = 0.4;
                mat.transparent = false;
                mat.opacity = 1;
            } else {
                mat.emissive = new THREE.Color(0x000000);
                mat.emissiveIntensity = 0;
                mat.transparent = true;
                mat.opacity = 0.35; // outras pecas ficam translucidas
            }
        });
    });
}
```

---

## Otimizacao de Performance

### LOD (Level of Detail)

Para mobile e modulos com muitas pecas, usar geometria simplificada:

```javascript
function buildPieceMesh(peca, detailLevel) {
    if (detailLevel === 'high') {
        // CSG completo (furos, rebaixos, contorno)
        return buildCSGPiece(peca, sc);
    }

    if (detailLevel === 'medium') {
        // Contorno extrudado sem CSG (furos/rebaixos nao subtraidos)
        // Mais rapido, forma correta, sem detalhes internos
        return buildBaseShape(comp, larg, esp, workers, sc);
    }

    // 'low': BoxGeometry colorido
    const geo = new THREE.BoxGeometry(comp * sc, esp * sc, larg * sc);
    const mat = new THREE.MeshStandardMaterial({
        color: getMaterialColor(peca.material),
        roughness: 0.6,
    });
    return new THREE.Mesh(geo, mat);
}

// Escolha automatica baseada no dispositivo
function getDetailLevel(pecaCount) {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    if (isMobile) return 'low';
    if (pecaCount > 20) return 'medium';
    return 'high';
}
```

### Cache de Geometrias

Pecas iguais (mesmo persistent_id) compartilham geometria:

```javascript
const geometryCache = new Map();

function getCachedGeometry(peca, detailLevel, sc) {
    const key = `${peca.persistent_id}_${detailLevel}`;
    if (geometryCache.has(key)) return geometryCache.get(key).clone();

    const geo = buildPieceMesh(peca, detailLevel);
    geometryCache.set(key, geo);
    return geo.clone();
}
```

### Web Worker (futuro)

Para CSG pesado, mover o calculo para um Web Worker:

```javascript
// worker-csg.js
self.onmessage = (e) => {
    const { peca, sc } = e.data;
    const result = buildCSGPiece(peca, sc);
    // Transferir geometry buffers
    self.postMessage({
        positions: result.geometry.attributes.position.array,
        normals: result.geometry.attributes.normal.array,
        indices: result.geometry.index.array,
    }, [
        result.geometry.attributes.position.array.buffer,
        result.geometry.attributes.normal.array.buffer,
        result.geometry.index.array.buffer,
    ]);
};
```

---

## UI do Viewer

### Controles

```
+-----------------------------------------------+
|  [Montado] [Semi] [Explodido]   [X-Ray]       |
|                                                 |
|  Explosao: ====o===================== 0.2       |
|                                                 |
|           +-------------------------+           |
|           |                         |           |
|           |      3D VIEWER          |           |
|           |      (Three.js)         |           |
|           |                         |           |
|           +-------------------------+           |
|                                                 |
|  Vistas: [Frente] [Tras] [Lado] [Cima] [Iso]  |
|                                                 |
|  Lista de Pecas:                                |
|  > CM_LAT_ESQ  Lateral Esquerda   700x550x15.5 |
|  > CM_LAT_DIR  Lateral Direita    700x550x15.5 |
|    CM_BAS      Base               1168x550x15.5 |
|    CM_TAM      Tampo              1168x550x15.5 |
|    CM_PRA      Prateleira         1168x520x15.5 |
|    CM_FUN_VER  Fundo              700x1168x3    |
+-----------------------------------------------+
```

### Vistas predefinidas

```javascript
const CAMERA_VIEWS = {
    frente:     { pos: [0, 0, -dist],   target: center },
    tras:       { pos: [0, 0, dist],    target: center },
    esquerda:   { pos: [-dist, 0, 0],   target: center },
    direita:    { pos: [dist, 0, 0],    target: center },
    cima:       { pos: [0, dist, 0],    target: center },
    isometrica: { pos: [dist*0.7, dist*0.5, -dist*0.7], target: center },
};
```

### Modo X-Ray

Todas as pecas ficam translucidas exceto a selecionada:

```javascript
function setXRayMode(moduleGroup, selectedPecaId) {
    moduleGroup.children.forEach(child => {
        const isSelected = String(child.userData.pid) === String(selectedPecaId);
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
            mat.transparent = true;
            mat.opacity = isSelected ? 1.0 : 0.08;
            mat.depthWrite = isSelected;
            if (isSelected) {
                mat.emissive = new THREE.Color(0x2563eb);
                mat.emissiveIntensity = 0.3;
            }
        });
    });
}
```

---

## Rota Frontend

```javascript
// Em src/App.jsx, adicionar rota:
<Route path="/modulo-viewer/:loteId/:moduloId" element={<ModuloViewerPage />} />

// Pagina wrapper:
function ModuloViewerPage() {
    const { loteId, moduloId } = useParams();
    const searchParams = new URLSearchParams(window.location.search);
    const pecaId = searchParams.get('peca');

    return (
        <ModuloViewer3D
            loteId={loteId}
            moduloId={moduloId}
            highlightPecaId={pecaId}
        />
    );
}
```

---

## Dados Disponiveis Hoje

| Campo | Tabela/Fonte | Status |
|-------|-------------|--------|
| modulo_id | cnc_pecas | Disponivel |
| modulo_desc | cnc_pecas | Disponivel |
| upmcode (CM_LAT_ESQ etc) | cnc_pecas | Disponivel |
| comprimento, largura, espessura | cnc_pecas | Disponivel |
| machining_json | cnc_pecas | Disponivel |
| material, material_code | cnc_pecas | Disponivel |
| bordas | cnc_pecas | Disponivel |
| persistent_id | cnc_pecas | Disponivel |
| transform_json | cnc_pecas | **NAO EXISTE** (precisa adicionar) |
| Dimensoes do modulo (H, W, D) | SketchUp JSON | Disponivel no import, **nao armazenado** |

### Campos que precisam ser adicionados:

1. `transform_json TEXT` na tabela `cnc_pecas`
2. `modulo_altura`, `modulo_largura`, `modulo_profundidade` na tabela `cnc_pecas` (ou tabela separada `cnc_modulos`)
3. Plugin SketchUp exportar `entity.transformation` como array 16 floats

---

## Fases de Implementacao

### Fase 1: Prova de conceito (1-2 dias)
- Componente ModuloViewer3D com BoxGeometry colorido por peca
- Posicionamento via tabela de regras (Caminho A)
- Vista basica com OrbitControls
- Testar com 2-3 modulos reais do sistema

### Fase 2: Interatividade (1 dia)
- Raycaster para selecionar pecas
- Highlight da peca selecionada
- Painel de informacoes da peca
- Slider de vista explodida

### Fase 3: Rota + QR Code (0.5 dia)
- Endpoint `/api/cnc/modulo-viewer/:loteId/:moduloId`
- Rota frontend `/modulo-viewer/:loteId/:moduloId?peca=:id`
- Botao "Ver no movel" na tela de detalhes da peca
- QR code na etiqueta apontando para a rota

### Fase 4: Plugin SketchUp + Transform real (1-2 dias)
- Adicionar export de `transformation` no plugin Ruby
- Coluna `transform_json` no banco
- Parser no backend para armazenar o transform
- `applySketchUpTransform()` no viewer
- Tabela de regras vira fallback

### Fase 5: Polish (1-2 dias)
- CSG real nas pecas (nivel de detalhe alto)
- LOD para mobile
- Modo X-Ray
- Animacoes suaves
- Cache de geometrias
- Responsivo mobile

---

## Estimativa Total: 5-8 dias uteis

Quando priorizar essa feature, comecar pela **Fase 4** (plugin SketchUp) em paralelo com a **Fase 1** (viewer basico). O transform real e o que faz a diferenca entre "funciona 80%" e "funciona 100%".
