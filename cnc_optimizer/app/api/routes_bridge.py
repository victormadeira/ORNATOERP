"""Bridge endpoints — interface entre Express (ERP) e o motor Python.

O Express lê os dados do SQLite, monta um payload normalizado
e envia para estes endpoints. O Python processa e retorna no
formato que o Express espera para devolver ao React.

POST /api/v1/bridge/optimize  — Nesting (single ou multi-lot)
POST /api/v1/bridge/gcode     — Geracao de G-code
"""

from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/bridge", tags=["bridge"])


# ---------------------------------------------------------------------------
# Modelos de request/response — formato do Express
# ---------------------------------------------------------------------------

class BridgePiece(BaseModel):
    """Peca vinda do Express (formato cnc_pecas)."""
    id: int
    persistent_id: str = ""
    comprimento: float            # length mm
    largura: float                # width mm
    quantidade: int = 1
    material_code: str = ""
    espessura: float = 0
    allow_rotate: bool = True
    lote_id: int | None = None    # para multi-lot tracking
    classificacao: str = "normal"  # normal | pequena | super_pequena
    # Campos opcionais para bordas, acabamento, usinagem
    descricao: str = ""
    upmcode: str = ""
    upmdraw: str = ""


class BridgeSheet(BaseModel):
    """Chapa vinda do Express (formato cnc_chapas)."""
    id: int = 0
    nome: str = ""
    material_code: str = ""
    espessura_nominal: float = 18
    espessura_real: float = 18.5
    comprimento: float = 2750     # length mm
    largura: float = 1850         # width mm
    refilo: float = 10            # border trim mm
    kerf: float = 4               # blade width mm
    veio: str = "sem_veio"        # sem_veio | horizontal | vertical
    preco: float = 0


class BridgeScrap(BaseModel):
    """Retalho disponivel."""
    id: int
    material_code: str = ""
    espessura_real: float = 18.5
    comprimento: float = 0
    largura: float = 0
    disponivel: bool = True


class BridgeConfig(BaseModel):
    """Configuracao de otimizacao vinda do Express."""
    spacing: float = 7            # espaco_pecas mm
    kerf: float = 4               # kerf padrao
    modo: str = "maxrects"        # maxrects | guillotine | shelf
    permitir_rotacao: bool | None = None  # None = usar logica de veio
    usar_retalhos: bool = True
    iteracoes: int = 300
    considerar_sobra: bool = True
    sobra_min_largura: float = 300
    sobra_min_comprimento: float = 600
    direcao_corte: str = "misto"  # misto | horizontal | vertical
    limiar_pequena: float = 400
    limiar_super_pequena: float = 200
    classificar_pecas: bool = True
    vacuum_aware: bool = True


class OptimizeRequest(BaseModel):
    """Request completo de otimizacao."""
    pieces: list[BridgePiece]
    sheets: list[BridgeSheet]
    scraps: list[BridgeScrap] = Field(default_factory=list)
    config: BridgeConfig = Field(default_factory=BridgeConfig)


class GcodeMachine(BaseModel):
    """Configuracao da maquina CNC vinda do Express."""
    id: int = 0
    nome: str = "CNC Router"
    fabricante: str = ""
    modelo: str = ""
    extensao_arquivo: str = ".nc"
    gcode_header: str = "%\nG90 G54 G17"
    gcode_footer: str = "G0 Z200.000\nM5\nM30\n%"
    z_seguro: float = 30
    vel_vazio: float = 20000
    vel_corte: float = 4000
    vel_aproximacao: float = 8000
    rpm_padrao: int = 18000
    profundidade_extra: float = 0.2
    z_origin: str = "mesa"
    coordenada_zero: str = "canto_esq_inf"
    eixo_x_invertido: bool = False
    eixo_y_invertido: bool = False
    exportar_lado_a: bool = True
    exportar_lado_b: bool = False
    exportar_furos: bool = True
    exportar_rebaixos: bool = True
    exportar_usinagens: bool = True
    usar_onion_skin: bool = False
    onion_skin_espessura: float = 0.5
    usar_tabs: bool = False
    usar_lead_in: bool = True
    feed_rate_pct_pequenas: int = 50
    feed_rate_area_max: float = 500
    troca_ferramenta_cmd: str = "M6"
    spindle_on_cmd: str = "M3"
    spindle_off_cmd: str = "M5"
    casas_decimais: int = 3
    comentario_prefixo: str = ";"


class GcodeTool(BaseModel):
    """Ferramenta CNC."""
    codigo: str = "T01"
    nome: str = ""
    tipo: str = "contorno"
    diametro: float = 6.0
    profundidade_corte: float = 6.0
    velocidade_rpm: int = 18000
    tool_code: str = ""


class GcodeRequest(BaseModel):
    """Request de geracao de G-code."""
    plano: dict                    # plano_json do Express
    maquina: GcodeMachine = Field(default_factory=GcodeMachine)
    ferramentas: list[GcodeTool] = Field(default_factory=list)
    usinagem_tipos: list[dict] = Field(default_factory=list)
    pecas_db: list[dict] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helper: converter formatos
# ---------------------------------------------------------------------------

def _classify_piece(comprimento: float, largura: float,
                    limiar_pequena: float = 400,
                    limiar_super_pequena: float = 200) -> str:
    """Classificar peca por tamanho (identico ao JS)."""
    min_dim = min(comprimento, largura)
    if min_dim < limiar_super_pequena:
        return "super_pequena"
    if min_dim < limiar_pequena:
        return "pequena"
    return "normal"


def _pieces_to_internal(pieces: list[BridgePiece], sheet_veio: str = "sem_veio",
                        config: BridgeConfig | None = None):
    """Converter pecas do formato Express para o formato interno Python."""
    from app.core.domain.models import Piece
    from app.core.domain.enums import GrainDirection

    grain_map = {
        "sem_veio": GrainDirection.NONE,
        "horizontal": GrainDirection.HORIZONTAL,
        "vertical": GrainDirection.VERTICAL,
    }
    sheet_grain = grain_map.get(sheet_veio, GrainDirection.NONE)

    internal = []
    for p in pieces:
        # Filtrar peças inválidas (largura=0 ou comprimento=0)
        if p.comprimento <= 0 or p.largura <= 0:
            continue
        # Veio: se chapa tem veio, peca herda (rotacao travada)
        grain = sheet_grain if sheet_veio != "sem_veio" else GrainDirection.NONE
        internal.append(Piece(
            id=p.id,
            persistent_id=p.persistent_id or f"P{p.id:03d}",
            length=p.comprimento,
            width=p.largura,
            quantity=p.quantidade,
            material_code=p.material_code,
            grain=grain,
        ))
    return internal


def _sheets_to_internal(sheets: list[BridgeSheet]):
    """Converter chapas do formato Express para o formato interno Python."""
    from app.core.domain.models import Sheet
    from app.core.domain.enums import GrainDirection

    grain_map = {
        "sem_veio": GrainDirection.NONE,
        "horizontal": GrainDirection.HORIZONTAL,
        "vertical": GrainDirection.VERTICAL,
    }
    internal = []
    for s in sheets:
        internal.append(Sheet(
            id=s.id,
            name=s.nome or f"Chapa {s.material_code}",
            length=s.comprimento,
            width=s.largura,
            thickness_real=s.espessura_real,
            thickness_nominal=s.espessura_nominal,
            material_code=s.material_code,
            price=s.preco,
            trim=s.refilo,
            kerf=s.kerf,
            grain=grain_map.get(s.veio, GrainDirection.NONE),
        ))
    return internal


def _build_express_response(layout_result, config: BridgeConfig,
                            sheet_info: BridgeSheet,
                            elapsed_ms: float) -> dict:
    """Converter resultado interno para formato que Express espera (plano)."""
    chapas = []
    for sl in layout_result.sheets:
        sheet = sl.sheet
        pecas_out = []
        for p in sl.placements:
            # Usar effective (ja considera rotacao)
            cls = _classify_piece(
                p.effective_length, p.effective_width,
                config.limiar_pequena, config.limiar_super_pequena,
            )
            peca_info = {
                "pecaId": p.piece_id,
                "instancia": p.instance,
                "x": round(p.x, 1),
                "y": round(p.y, 1),
                "w": round(p.effective_length, 1),
                "h": round(p.effective_width, 1),
                "rotated": p.rotated,
            }
            if cls != "normal":
                peca_info["classificacao"] = cls
                if cls == "super_pequena":
                    peca_info["corte"] = {
                        "passes": 2, "velocidade": "lenta",
                        "tabs": False, "fixacao": "onion_skin",
                        "motivo": "MDF/melamina: sem tabs para evitar lascar a face",
                    }
                elif cls == "pequena":
                    peca_info["corte"] = {
                        "passes": 1, "velocidade": "media",
                        "tabs": False, "fixacao": "ordem_pequenas_primeiro",
                        "motivo": "MDF/melamina: sem tabs para evitar retrabalho na borda",
                    }
            pecas_out.append(peca_info)

        # Retalhos: extrair do espaco livre
        retalhos_out = []
        if config.considerar_sobra:
            retalhos_out = _detect_remnants(
                sl, sheet,
                config.sobra_min_largura,
                config.sobra_min_comprimento,
            )

        # Usar dados da chapa real do layout (suporte multi-material)
        s = sl.sheet
        chapa_info = {
            "idx": sl.index,
            "material": s.name or sheet_info.nome,
            "material_code": s.material_code or sheet_info.material_code,
            "comprimento": s.length,
            "largura": s.width,
            "refilo": s.trim,
            "kerf": config.kerf,
            "preco": getattr(s, 'price', 0) or sheet_info.preco,
            "veio": s.grain.value if hasattr(s.grain, 'value') else sheet_info.veio,
            "aproveitamento": round(sl.occupancy, 2),
            "pecas": pecas_out,
            "retalhos": retalhos_out,
            "cortes": sl.cuts or [],
        }
        chapas.append(chapa_info)

    total_chapas = len(chapas)
    aprov_medio = (
        round(sum(c["aproveitamento"] for c in chapas) / total_chapas, 2)
        if total_chapas > 0 else 0
    )

    plano = {
        "chapas": chapas,
        "retalhos": [],
        "materiais": {},
        "modo": config.modo,
        "direcao_corte": config.direcao_corte,
        "classificacao": {
            "limiar_pequena": config.limiar_pequena,
            "limiar_super_pequena": config.limiar_super_pequena,
            "ativo": config.classificar_pecas,
        },
        "aproveitamento": aprov_medio,
    }

    return {
        "ok": True,
        "total_chapas": total_chapas,
        "aproveitamento": aprov_medio,
        "total_combinacoes_testadas": 0,
        "modo": config.modo,
        "motor": "python",
        "tempo_ms": round(elapsed_ms, 1),
        "plano": plano,
    }


def _detect_remnants(sheet_layout, sheet, min_w: float, min_h: float) -> list[dict]:
    """Detectar retalhos no espaco livre da chapa usando decomposicao em celulas.

    Algoritmo: cria grade com bordas das pecas, identifica celulas livres,
    e agrupa em retangulos maximais.

    min_w = sobra_min_largura (menor dimensao minima, ex: 300mm)
    min_h = sobra_min_comprimento (maior dimensao minima, ex: 600mm)

    Coordenadas de saida: espaco util (0-based, mesma referencia das pecas).
    """
    if not sheet_layout.placements:
        return []

    def _valid(w: float, h: float) -> bool:
        short, long = min(w, h), max(w, h)
        return short >= min_w and long >= min_h

    placements = sheet_layout.placements
    trim = sheet.trim if sheet else 0

    # Detectar se pecas estao em coords absolutas (incluem trim) ou usaveis (0-based)
    min_piece_x = min(p.x for p in placements)
    min_piece_y = min(p.y for p in placements)
    # Se a menor coord de peca >= trim, pecas estao em coords absolutas
    coords_absolute = (min_piece_x >= trim - 0.5 and trim > 0)

    if coords_absolute:
        area_left = trim
        area_right = sheet.length - trim
        area_top = trim
        area_bottom = sheet.width - trim
        offset = trim  # subtrair no output para converter a usavel
    else:
        area_left = 0
        area_right = sheet.length - 2 * trim
        area_top = 0
        area_bottom = sheet.width - 2 * trim
        offset = 0

    usable_w = area_right - area_left
    usable_h = area_bottom - area_top

    # 1. Coletar coordenadas unicas (bordas das pecas + limites da area util)
    xs_set = {area_left, area_right}
    ys_set = {area_top, area_bottom}
    for p in placements:
        px1, py1 = p.x, p.y
        px2 = p.x + p.effective_length
        py2 = p.y + p.effective_width
        # Clampar dentro da area util
        xs_set.add(max(area_left, min(area_right, px1)))
        xs_set.add(max(area_left, min(area_right, px2)))
        ys_set.add(max(area_top, min(area_bottom, py1)))
        ys_set.add(max(area_top, min(area_bottom, py2)))

    xs = sorted(xs_set)
    ys = sorted(ys_set)

    # 2. Criar grade de celulas e marcar ocupadas
    nx, ny = len(xs) - 1, len(ys) - 1
    if nx <= 0 or ny <= 0:
        return []

    occupied = [[False] * ny for _ in range(nx)]
    for p in placements:
        px1, py1 = p.x, p.y
        px2, py2 = p.x + p.effective_length, p.y + p.effective_width
        for ci in range(nx):
            cell_x1, cell_x2 = xs[ci], xs[ci + 1]
            if cell_x2 <= px1 + 0.5 or cell_x1 >= px2 - 0.5:
                continue
            for cj in range(ny):
                cell_y1, cell_y2 = ys[cj], ys[cj + 1]
                if cell_y2 <= py1 + 0.5 or cell_y1 >= py2 - 0.5:
                    continue
                occupied[ci][cj] = True

    # 3. Encontrar retangulos maximais livres usando histograma
    # Para cada coluna, calcular altura livre acima (incluindo a celula atual)
    # Depois usar algoritmo de "maior retangulo no histograma" por linha
    height = [[0] * ny for _ in range(nx)]
    for ci in range(nx):
        for cj in range(ny):
            if not occupied[ci][cj]:
                height[ci][cj] = (height[ci][cj - 1] + 1) if cj > 0 else 1
            else:
                height[ci][cj] = 0

    # Para cada linha (cj), encontrar retangulos maximais usando as alturas
    all_rects = []
    for cj in range(ny):
        # Stack-based largest rectangle in histogram (por coluna)
        stack = []  # stack of (start_ci, height)
        for ci in range(nx + 1):
            h = height[ci][cj] if ci < nx else 0
            start = ci
            while stack and stack[-1][1] > h:
                sci, sh = stack.pop()
                # Retangulo: de xs[sci] a xs[ci], altura sh celulas acima de cj
                rx = xs[sci]
                rw = xs[ci] - rx if ci < len(xs) else xs[-1] - rx
                ry = ys[cj - sh + 1]
                rh = ys[cj + 1] - ry
                if rw > 5 and rh > 5:  # ignorar gaps de kerf
                    all_rects.append((rx, ry, rw, rh, rw * rh))
                start = sci
            stack.append((start, h))

    # Deduplicar: remover retangulos contidos em outros maiores
    all_rects.sort(key=lambda r: -r[4])  # maior area primeiro
    raw_rects = []
    for rx, ry, rw, rh, area in all_rects:
        # Verificar se este retangulo esta contido em algum ja aceito
        contained = False
        for ex, ey, ew, eh in raw_rects:
            if rx >= ex - 0.5 and ry >= ey - 0.5 and rx + rw <= ex + ew + 0.5 and ry + rh <= ey + eh + 0.5:
                contained = True
                break
        if not contained:
            raw_rects.append((rx, ry, rw, rh))

    # 4. Tentar merge de retangulos adjacentes
    merged = True
    rects = list(raw_rects)
    while merged:
        merged = False
        new_rects = []
        skip = set()
        for i in range(len(rects)):
            if i in skip:
                continue
            rx, ry, rw, rh = rects[i]
            for j in range(i + 1, len(rects)):
                if j in skip:
                    continue
                ox, oy, ow, oh = rects[j]
                tol = 1.0
                # Horizontal merge: same row, adjacent
                if abs(ry - oy) < tol and abs(rh - oh) < tol and abs(rx + rw - ox) < tol:
                    rw = rw + ow
                    skip.add(j)
                    merged = True
                elif abs(ry - oy) < tol and abs(rh - oh) < tol and abs(ox + ow - rx) < tol:
                    rx, rw = ox, ow + rw
                    skip.add(j)
                    merged = True
                # Vertical merge: same column, adjacent
                elif abs(rx - ox) < tol and abs(rw - ow) < tol and abs(ry + rh - oy) < tol:
                    rh = rh + oh
                    skip.add(j)
                    merged = True
                elif abs(rx - ox) < tol and abs(rw - ow) < tol and abs(oy + oh - ry) < tol:
                    ry, rh = oy, oh + rh
                    skip.add(j)
                    merged = True
            new_rects.append((rx, ry, rw, rh))
        rects = new_rects

    # 5. Filtrar por dimensoes minimas e converter a coords usaveis (0-based)
    remnants = []
    for rx, ry, rw, rh in rects:
        if _valid(rw, rh):
            remnants.append({
                "x": round(rx - offset, 1),
                "y": round(ry - offset, 1),
                "w": round(rw, 1),
                "h": round(rh, 1),
            })

    return remnants


# ---------------------------------------------------------------------------
# Endpoint: Otimizacao (Nesting)
# ---------------------------------------------------------------------------

@router.post("/optimize")
async def bridge_optimize(request: OptimizeRequest) -> dict:
    """Receber pecas/chapas do Express e retornar plano otimizado.

    O Express cuida de:
    - Ler DB (lotes, pecas, chapas, config, retalhos)
    - Agrupar pecas por material
    - Salvar resultado no DB (plano_json, pos_x, pos_y)

    Este endpoint recebe dados ja agrupados de UM material group.
    """
    from app.core.nesting.layout_builder import build_optimal_layout, NestingConfig

    t0 = time.time()

    try:
        if not request.pieces:
            raise HTTPException(400, "Nenhuma peca enviada")
        if not request.sheets:
            raise HTTPException(400, "Nenhuma chapa disponivel")

        cfg = request.config
        sheet = request.sheets[0]  # Chapa deste material group

        # Validar pecas — rejeitar dimensoes zero
        valid_pieces = []
        warnings = []
        for p in request.pieces:
            if p.comprimento <= 0 or p.largura <= 0:
                warnings.append(
                    f"Peca {p.persistent_id or p.id} ignorada: "
                    f"dimensao invalida {p.comprimento}x{p.largura}"
                )
                continue
            valid_pieces.append(p)

        if not valid_pieces:
            raise HTTPException(400, "Nenhuma peca com dimensoes validas")

        # Debug log
        total_expanded = sum(p.quantidade for p in valid_pieces)
        print(f"  [BRIDGE] Recebido: {len(valid_pieces)} peças raw, "
              f"{total_expanded} expanded, sheet={sheet.material_code} "
              f"({sheet.comprimento}x{sheet.largura}, refilo={sheet.refilo})")
        for p in valid_pieces:
            if p.quantidade > 1:
                print(f"    Peça {p.id}: {p.comprimento}x{p.largura} qty={p.quantidade}")

        # Normalizar material_code das peças para a chapa resolvida
        # O Express já agrupou por chapa, mas as peças podem ter codes diferentes
        # (ex: mdf18, mdp18 → todos usam MDF_18.5_BRANCO_TX)
        sheet_material = sheet.material_code
        for p in valid_pieces:
            if p.material_code != sheet_material:
                p.material_code = sheet_material

        # Converter para formato interno
        pieces = _pieces_to_internal(valid_pieces, sheet.veio, cfg)
        sheets = _sheets_to_internal(request.sheets)

        # Config de nesting — usa defaults otimos do NestingConfig
        allow_rot = cfg.permitir_rotacao if cfg.permitir_rotacao is not None else True

        # Mapear modo → bin_types (guilhotina forçada quando selecionada)
        mode_to_bins = {
            "guillotine": ["guillotine"],
            "maxrects": ["maxrects", "guillotine", "shelf"],
            "shelf": ["shelf"],
        }
        bin_types = mode_to_bins.get(cfg.modo, ["maxrects", "guillotine", "shelf"])

        # Mapear direcao_corte → split_direction (para GuillotineBin)
        dir_map = {"misto": "auto", "horizontal": "horizontal", "vertical": "vertical"}
        split_dir = dir_map.get(cfg.direcao_corte, "auto")

        nesting_config = NestingConfig(
            spacing=cfg.spacing,
            kerf=cfg.kerf,
            allow_rotation=allow_rot,
            try_remnants=cfg.usar_retalhos,
            min_remnant_width=cfg.sobra_min_largura,
            min_remnant_length=cfg.sobra_min_comprimento,
            vacuum_aware=cfg.vacuum_aware,
            bin_types=bin_types,
            split_direction=split_dir,
            # rr_iterations, rr_window_size, max_combinations, compact_passes
            # usam os defaults otimos do NestingConfig (800, 80, 300, 15)
        )

        # Rodar otimizacao
        result = build_optimal_layout(pieces, sheets, config=nesting_config)

        elapsed = (time.time() - t0) * 1000
        response = _build_express_response(result, cfg, sheet, elapsed)
        if warnings:
            response["warnings"] = warnings
        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Erro na otimizacao Python: {str(e)}")


# ---------------------------------------------------------------------------
# Endpoint: G-code
# ---------------------------------------------------------------------------

@router.post("/gcode")
async def bridge_gcode(request: GcodeRequest) -> dict:
    """Gerar G-code a partir de plano otimizado.

    Recebe o plano_json + config de maquina do Express.
    Retorna G-code por chapa no formato que o Express espera.
    """
    from app.core.export.gcode_generator import (
        GcodeGenerator, GcodeOp as InternalGcodeOp,
        MachineConfig, GcodeTool as InternalTool,
        generate_gcode,
    )

    try:
        maq = request.maquina
        plano = request.plano

        if not plano or "chapas" not in plano:
            raise HTTPException(400, "plano_json invalido")

        # Montar config da maquina
        machine = MachineConfig(
            name=maq.nome,
            model=maq.modelo,
            z_origin=maq.z_origin or "mesa",
            espessura_chapa=0,  # sera definido por chapa
            z_seguranca=maq.z_seguro,
            z_aproximacao=2.0,
            z_aproximacao_rapida=maq.z_seguro / 5,
            vel_corte=maq.vel_corte,
            vel_mergulho=maq.vel_aproximacao,
            rpm_default=maq.rpm_padrao,
            profundidade_extra=maq.profundidade_extra,
            usar_onion_skin=maq.usar_onion_skin,
            onion_skin_espessura=maq.onion_skin_espessura,
            usar_tabs=maq.usar_tabs,
            usar_lead_in=maq.usar_lead_in,
            gcode_header=maq.gcode_header,
            gcode_footer=maq.gcode_footer,
            spindle_on=maq.spindle_on_cmd,
            spindle_off=maq.spindle_off_cmd,
            troca_cmd=maq.troca_ferramenta_cmd,
        )

        # Montar mapa de ferramentas
        tool_map = {}
        for ft in request.ferramentas:
            tool_map[ft.codigo] = InternalTool(
                codigo=ft.codigo,
                nome=ft.nome,
                diametro=ft.diametro,
                rpm=ft.velocidade_rpm,
                doc=ft.profundidade_corte,
                velocidade_corte=maq.vel_corte,
            )

        # Gerar G-code por chapa
        chapas_result = []
        all_alertas = []
        extensao = maq.extensao_arquivo if hasattr(maq, 'extensao_arquivo') else ".nc"

        for i, chapa in enumerate(plano["chapas"]):
            # Construir operacoes a partir das pecas da chapa
            ops = _build_ops_from_chapa(
                chapa, i, request.pecas_db,
                request.usinagem_tipos, tool_map, machine,
            )

            # Configurar espessura para esta chapa
            machine.espessura_chapa = chapa.get("espessura_real", 18.5)

            sheet_info = {
                "length": chapa.get("comprimento", 2750),
                "width": chapa.get("largura", 1850),
                "thickness": chapa.get("espessura_real", 18.5),
                "material_code": chapa.get("material_code", ""),
            }

            if ops:
                result = generate_gcode(ops, machine, tool_map, sheet_info)
                gcode = result.gcode
                stats = result.stats
                alertas = result.alertas
            else:
                gcode = ""
                stats = {}
                alertas = ["Nenhuma operacao para esta chapa"]

            all_alertas.extend(alertas)

            chapas_result.append({
                "idx": i,
                "gcode": gcode,
                "filename": f"Chapa{str(i + 1).zfill(2)}{extensao}",
                "stats": stats,
                "alertas": alertas,
                "material": chapa.get("material", ""),
                "pecas_count": len(chapa.get("pecas", [])),
            })

        validacao = {
            "maquina": {
                "id": maq.id, "nome": maq.nome,
                "fabricante": maq.fabricante, "modelo": maq.modelo,
            },
            "ferramentas_faltando": [],
            "anti_arrasto": {
                "onion_skin": maq.usar_onion_skin,
                "tabs": maq.usar_tabs,
                "lead_in": maq.usar_lead_in,
                "feed_reducao": f"{maq.feed_rate_pct_pequenas}% para pecas < {maq.feed_rate_area_max}cm²",
            },
        }

        return {
            "ok": True,
            "chapas": chapas_result,
            "extensao": extensao,
            "validacao": validacao,
            "alertas": all_alertas,
            "total_chapas": len(chapas_result),
            "motor": "python",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Erro na geracao de G-code Python: {str(e)}")


def _build_ops_from_chapa(chapa: dict, chapa_idx: int,
                          pecas_db: list[dict],
                          usinagem_tipos: list[dict],
                          tool_map: dict,
                          machine: MachineConfig) -> list:
    """Construir operacoes de G-code a partir dos dados da chapa.

    Replica a logica de generateGcodeForChapa() do JS.
    """
    from app.core.export.gcode_generator import GcodeOp

    refilo = chapa.get("refilo", 10)
    espessura = chapa.get("espessura_real", 18.5)
    prof_extra = machine.profundidade_extra

    # Mapa de pecas do DB para lookup de usinagem
    pecas_map = {p.get("id", 0): p for p in pecas_db}

    ops = []

    # Ferramenta de contorno padrao (maior diametro disponivel)
    contorno_tool = None
    if tool_map:
        contorno_tool = max(tool_map.values(), key=lambda t: t.diametro)

    for peca_info in chapa.get("pecas", []):
        peca_id = peca_info.get("pecaId", 0)
        x = peca_info.get("x", 0) + refilo
        y = peca_info.get("y", 0) + refilo
        w = peca_info.get("w", 0)
        h = peca_info.get("h", 0)
        rotated = peca_info.get("rotated", False)

        peca_db = pecas_map.get(peca_id, {})
        persistent_id = peca_db.get("persistent_id", f"P{peca_id:03d}")
        cls = peca_info.get("classificacao", "normal")

        # Verificar se peca eh pequena (feed reduction)
        is_small = cls in ("pequena", "super_pequena")
        area_cm2 = (w * h) / 100

        # TODO: futuramente parsear usinagens da peca (furos, rasgos, pockets)
        # Por enquanto, geramos apenas o contorno retangular de corte

        # Contorno retangular da peca (fase 1 = contorno de peca)
        tool_code = contorno_tool.codigo if contorno_tool else "T01"
        ops.append(GcodeOp(
            op_type="contorno",
            piece_id=peca_id,
            piece_persistent_id=persistent_id,
            abs_x=x,
            abs_y=y,
            width=w,
            height=h,
            depth=espessura + prof_extra,
            tool_code=tool_code,
            fase=1,
            contour_path=[
                [x, y],
                [x + w, y],
                [x + w, y + h],
                [x, y + h],
            ],
            is_small_piece=is_small,
            needs_onion=is_small and machine.usar_onion_skin,
            onion_depth_full=espessura + prof_extra if is_small else 0,
        ))

    # Contornos de retalhos (fase 2)
    for ret in chapa.get("retalhos", []):
        rx = ret.get("x", 0) + refilo
        ry = ret.get("y", 0) + refilo
        rw = ret.get("w", 0)
        rh = ret.get("h", 0)
        tool_code = contorno_tool.codigo if contorno_tool else "T01"
        ops.append(GcodeOp(
            op_type="contorno",
            piece_id=0,
            piece_persistent_id="RETALHO",
            abs_x=rx,
            abs_y=ry,
            width=rw,
            height=rh,
            depth=espessura + prof_extra,
            tool_code=tool_code,
            fase=2,
            contour_path=[
                [rx, ry],
                [rx + rw, ry],
                [rx + rw, ry + rh],
                [rx, ry + rh],
            ],
        ))

    # Ordenar: fase 0 (internos) → fase 1 (contornos peca) → fase 2 (contornos sobra)
    ops.sort(key=lambda o: (o.fase, o.prioridade))

    return ops
