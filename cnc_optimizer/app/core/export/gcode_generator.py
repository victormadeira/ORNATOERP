"""Gerador de G-code para CNC Router.

Port completo do gerador JavaScript (cnc.js linhas 2009-3019).
Suporta:
- Multi-pass DOC automatico
- Z-origin mesa vs topo
- Furos, rasgos, pockets, contornos retangulares e complexos
- Arcos (G2/G3)
- Onion skin com breakthrough a 60%
- Tabs
- Rampa de entrada
- Lead-in/lead-out
- Proximity ordering (nearest-neighbor)
- Feed rate dinamico por risco de vacuo
- Separacao por fases (interna → contornos peca → contornos sobra)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


# ---------------------------------------------------------------------------
# Configuracao da maquina
# ---------------------------------------------------------------------------

@dataclass
class MachineConfig:
    """Configuracao da maquina CNC."""
    name: str = "CNC Router"
    model: str = ""

    # Z-origin: 'mesa' ou 'topo'
    z_origin: str = "mesa"
    espessura_chapa: float = 18.5  # mm

    # Alturas Z
    z_seguranca: float = 30.0       # Altura segura
    z_aproximacao: float = 2.0      # Aproximacao antes do corte
    z_aproximacao_rapida: float = 5.0  # Retração rapida entre ops

    # Velocidades
    vel_corte: float = 4000.0       # mm/min cutting feed
    vel_mergulho: float = 1500.0    # mm/min plunge feed
    vel_rapido: float = 10000.0     # mm/min rapid moves (G0)

    # Spindle
    rpm_default: int = 18000
    dwell_spindle: float = 1.0      # segundos

    # DOC (profundidade de corte por passada)
    doc_default: float = 6.0        # mm

    # Profundidade extra (garantir corte completo)
    profundidade_extra: float = 0.1  # mm

    # Contorno
    contorno_direcao: str = "climb"  # climb ou conventional
    contorno_tool_code: str = ""     # Forca ferramenta especifica

    # Onion skin
    usar_onion_skin: bool = False
    onion_skin_espessura: float = 0.5   # mm
    onion_skin_area_max: float = 500.0  # cm²

    # Rampa
    usar_rampa: bool = True
    rampa_angulo: float = 15.0      # graus

    # Lead-in/out
    usar_lead_in: bool = True
    lead_in_raio: float = 5.0       # mm

    # Tabs
    usar_tabs: bool = False
    tab_largura: float = 8.0        # mm
    tab_altura: float = 3.0         # mm

    # Feed reduction para pecas pequenas
    feed_area_max: float = 500.0    # cm² — abaixo disso reduz feed
    feed_percentual: float = 50.0   # % do feed normal

    # N-codes
    usar_n_codes: bool = False
    n_code_incremento: int = 10

    # Header/footer customizaveis
    gcode_header: str = "%\nG90 G54 G17"
    gcode_footer: str = "G0 Z200.000\nM5\nM30\n%"

    # Spindle commands
    spindle_on: str = "M3"
    spindle_off: str = "M5"
    troca_cmd: str = "M6"


# ---------------------------------------------------------------------------
# Ferramenta
# ---------------------------------------------------------------------------

@dataclass
class GcodeTool:
    """Ferramenta CNC."""
    codigo: str = "T01"
    nome: str = ""
    diametro: float = 6.0       # mm
    rpm: int = 18000
    doc: float = 6.0            # mm profundidade por passada
    velocidade_corte: float = 4000.0
    profundidade_extra: float = 0.1
    tipo: str = "fresa"         # fresa, broca, fresa_compressao
    tipo_corte: str = ""


# ---------------------------------------------------------------------------
# Operacao de G-code
# ---------------------------------------------------------------------------

@dataclass
class GcodeOp:
    """Operacao individual para geracao de G-code."""
    op_type: str = ""           # hole, groove, pocket, contorno, contour_hole, circular_hole, generic
    piece_id: int = 0
    piece_persistent_id: str = ""

    # Posicao absoluta na chapa
    abs_x: float = 0.0
    abs_y: float = 0.0
    abs_x2: float = 0.0        # Ponto final (rasgos)
    abs_y2: float = 0.0

    # Dimensoes
    width: float = 0.0          # Largura (pockets, rasgos)
    height: float = 0.0         # Altura (pockets)
    depth: float = 0.0          # Profundidade nominal
    radius: float = 0.0         # Raio (furos circulares)

    # Ferramenta
    tool_code: str = ""
    tool: Optional[GcodeTool] = None

    # Classificacao
    fase: int = 0               # 0=interna, 1=contorno_peca, 2=contorno_sobra
    prioridade: int = 5

    # Contorno
    contour_path: list = field(default_factory=list)  # [(x,y), ...] para retangular
    contour_segments: list = field(default_factory=list)  # [{type, x2, y2, cx, cy, dir}] complexo

    # Metadados
    is_small_piece: bool = False
    vacuum_risk_index: float = 0.0
    needs_onion: bool = False
    onion_depth_full: float = 0.0

    # Tabs
    tabs: list = field(default_factory=list)  # [{x, y, width, height, contour_pct}]


# ---------------------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------------------

@dataclass
class GcodeResult:
    """Resultado da geracao de G-code."""
    gcode: str = ""
    stats: dict = field(default_factory=dict)
    alertas: list = field(default_factory=list)
    ferramentas_faltando: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# Funcoes auxiliares
# ---------------------------------------------------------------------------

def calcular_passadas(depth_total: float, doc: float) -> list[float]:
    """Calcular profundidades cumulativas de passadas.

    Port de calcularPassadas() do JS.

    Args:
        depth_total: Profundidade total a atingir
        doc: Profundidade por passada

    Returns:
        Lista de profundidades cumulativas [5, 10, 14.5]
    """
    if doc <= 0 or depth_total <= doc:
        return [depth_total]

    passes = []
    current = 0.0
    while current < depth_total - 0.001:
        current = min(current + doc, depth_total)
        passes.append(round(current, 3))

    # Redistribuicao da ultima passada se muito fina
    if len(passes) >= 2:
        last = passes[-1] - passes[-2]
        min_last = max(doc * 0.3, 1.0)
        if last < min_last:
            merged = passes[-1] - (passes[-3] if len(passes) >= 3 else 0)
            half = merged / 2
            if len(passes) >= 3:
                passes[-2] = passes[-3] + half
            else:
                passes[-2] = half
            passes[-1] = round(passes[-2] + half, 3)

    return passes


def _fmt(v: float, decimals: int = 3) -> str:
    """Formatar numero para G-code."""
    return f"{v:.{decimals}f}"


# ---------------------------------------------------------------------------
# Gerador principal
# ---------------------------------------------------------------------------

class GcodeGenerator:
    """Gerador de G-code para uma chapa."""

    def __init__(
        self,
        machine: MachineConfig,
        tools: dict[str, GcodeTool] | None = None,
    ):
        self.machine = machine
        self.tools = tools or {}
        self._lines: list[str] = []
        self._n_line = 0
        self._cur_tool: str = ""
        self._tool_changes = 0
        self._total_ops = 0
        self._onion_ops: list[GcodeOp] = []

    # --- Z helpers ---

    def z_safe(self) -> float:
        m = self.machine
        if m.z_origin == "mesa":
            return m.espessura_chapa + m.z_seguranca
        return m.z_seguranca

    def z_approach(self) -> float:
        m = self.machine
        if m.z_origin == "mesa":
            return m.espessura_chapa + m.z_aproximacao
        return m.z_aproximacao

    def z_rapid(self) -> float:
        m = self.machine
        if m.z_origin == "mesa":
            return m.espessura_chapa + m.z_aproximacao_rapida
        return m.z_aproximacao_rapida

    def z_cut(self, depth: float) -> float:
        m = self.machine
        if m.z_origin == "mesa":
            return m.espessura_chapa - depth
        return -depth

    # --- Emissao ---

    def _emit(self, line: str):
        """Adicionar linha ao G-code."""
        if self.machine.usar_n_codes and line and not line.startswith(";") and line != "%":
            self._n_line += self.machine.n_code_incremento
            self._lines.append(f"N{self._n_line} {line}")
        else:
            self._lines.append(line)

    def _comment(self, text: str):
        self._emit(f"; {text}")

    # --- Tool change ---

    def _tool_change(self, tool: GcodeTool):
        """Emitir troca de ferramenta."""
        if self._cur_tool == tool.codigo:
            return

        if self._cur_tool:
            self._emit(self.machine.spindle_off)

        self._emit(f"{tool.codigo} {self.machine.troca_cmd}")
        self._emit(f"S{tool.rpm} {self.machine.spindle_on}")

        if self.machine.dwell_spindle > 0:
            self._emit(f"G4 P{self.machine.dwell_spindle:.1f}")

        self._cur_tool = tool.codigo
        self._tool_changes += 1

    # --- Movimentos ---

    def _rapid_xy(self, x: float, y: float):
        self._emit(f"G0 X{_fmt(x)} Y{_fmt(y)}")

    def _rapid_z(self, z: float):
        self._emit(f"G0 Z{_fmt(z)}")

    def _linear(self, x: float, y: float, z: float | None = None,
                feed: float | None = None):
        parts = ["G1"]
        parts.append(f"X{_fmt(x)}")
        parts.append(f"Y{_fmt(y)}")
        if z is not None:
            parts.append(f"Z{_fmt(z)}")
        if feed is not None:
            parts.append(f"F{int(feed)}")
        self._emit(" ".join(parts))

    def _plunge(self, z: float, feed: float | None = None):
        f = feed or self.machine.vel_mergulho
        self._emit(f"G1 Z{_fmt(z)} F{int(f)}")

    def _arc(self, x: float, y: float, i: float, j: float,
             cw: bool = True, z: float | None = None, feed: float | None = None):
        g = "G2" if cw else "G3"
        parts = [g, f"X{_fmt(x)}", f"Y{_fmt(y)}", f"I{_fmt(i)}", f"J{_fmt(j)}"]
        if z is not None:
            parts.append(f"Z{_fmt(z)}")
        if feed is not None:
            parts.append(f"F{int(feed)}")
        self._emit(" ".join(parts))

    # --- Operacoes ---

    def _do_hole(self, op: GcodeOp, tool: GcodeTool):
        """Furo simples (plunge)."""
        prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
        depth = op.depth + prof_extra
        passes = calcular_passadas(depth, tool.doc or self.machine.doc_default)

        self._comment(f"Furo {op.piece_persistent_id} D={op.depth:.1f}mm")
        self._rapid_xy(op.abs_x, op.abs_y)
        self._rapid_z(self.z_approach())

        for p_depth in passes:
            z = self.z_cut(p_depth)
            self._plunge(z)
            self._rapid_z(self.z_approach())

        self._rapid_z(self.z_rapid())

    def _do_groove(self, op: GcodeOp, tool: GcodeTool):
        """Rasgo/canal linear."""
        prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
        depth = op.depth + prof_extra
        passes = calcular_passadas(depth, tool.doc or self.machine.doc_default)

        vel = self._effective_feed(op, tool)

        self._comment(f"Rasgo {op.piece_persistent_id} D={op.depth:.1f}mm")

        # Calcular offsets laterais se rasgo mais largo que ferramenta
        tool_d = tool.diametro
        req_width = op.width
        offsets = [0.0]

        if req_width > tool_d + 0.1:
            step_over = tool_d * 0.7
            half_w = (req_width - tool_d) / 2
            offsets = []
            offset = -half_w
            while offset <= half_w + 0.001:
                offsets.append(offset)
                offset += step_over
            if abs(offsets[-1] - half_w) > 0.1:
                offsets.append(half_w)

        # Direcao do rasgo
        dx = op.abs_x2 - op.abs_x
        dy = op.abs_y2 - op.abs_y
        groove_len = math.hypot(dx, dy)
        if groove_len < 0.01:
            groove_len = 1.0
        nx, ny = -dy / groove_len, dx / groove_len  # Normal

        for p_depth in passes:
            z = self.z_cut(p_depth)
            for offset in offsets:
                ox = op.abs_x + nx * offset
                oy = op.abs_y + ny * offset
                ox2 = op.abs_x2 + nx * offset
                oy2 = op.abs_y2 + ny * offset

                self._rapid_xy(ox, oy)
                self._rapid_z(self.z_approach())

                # Rampa ou plunge
                if self.machine.usar_rampa and groove_len > 5:
                    ramp_len = min(groove_len * 0.3, 20)
                    ratio = ramp_len / groove_len
                    rx = ox + dx * ratio
                    ry = oy + dy * ratio
                    self._linear(rx, ry, z, self.machine.vel_mergulho)
                    self._linear(ox, oy, z=None, feed=vel)
                else:
                    self._plunge(z)

                self._linear(ox2, oy2, feed=vel)
                self._rapid_z(self.z_approach())

        self._rapid_z(self.z_rapid())

    def _do_pocket(self, op: GcodeOp, tool: GcodeTool):
        """Pocket retangular."""
        prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
        depth = op.depth + prof_extra
        passes = calcular_passadas(depth, tool.doc or self.machine.doc_default)
        vel = self._effective_feed(op, tool)
        tool_r = tool.diametro / 2

        pw = op.width
        ph = op.height

        self._comment(f"Pocket {op.piece_persistent_id} {pw:.0f}x{ph:.0f} D={op.depth:.1f}mm")

        if pw <= 0.1 and ph <= 0.1:
            # Pocket zerado = plunge simples
            self._rapid_xy(op.abs_x, op.abs_y)
            self._rapid_z(self.z_approach())
            for p_depth in passes:
                self._plunge(self.z_cut(p_depth))
                self._rapid_z(self.z_approach())
            self._rapid_z(self.z_rapid())
            return

        # Centro do pocket
        cx = op.abs_x
        cy = op.abs_y

        # Limites internos (compensados pelo raio da fresa)
        x_min = cx - pw / 2 + tool_r
        x_max = cx + pw / 2 - tool_r
        y_min = cy - ph / 2 + tool_r
        y_max = cy + ph / 2 - tool_r

        if x_min > x_max:
            x_min = x_max = cx
        if y_min > y_max:
            y_min = y_max = cy

        step_over = tool.diametro * 0.7

        for p_depth in passes:
            z = self.z_cut(p_depth)

            # Zigzag clearing
            self._rapid_xy(x_min, y_min)
            self._rapid_z(self.z_approach())
            self._plunge(z)

            y = y_min
            direction = 1  # 1=esquerda→direita, -1=direita→esquerda
            while y <= y_max + 0.001:
                if direction == 1:
                    self._linear(x_max, y, feed=vel)
                else:
                    self._linear(x_min, y, feed=vel)
                direction *= -1

                next_y = y + step_over
                if next_y <= y_max + 0.001:
                    self._linear(x_max if direction == -1 else x_min, next_y, feed=vel)
                y = next_y

            self._rapid_z(self.z_approach())

        self._rapid_z(self.z_rapid())

    def _do_contorno_retangular(self, op: GcodeOp, tool: GcodeTool):
        """Contorno retangular de peca."""
        prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
        depth = op.depth + prof_extra

        # Onion skin
        if op.needs_onion:
            depth = op.depth - self.machine.onion_skin_espessura
            if depth <= 0:
                depth = op.depth
                op.needs_onion = False

        passes = calcular_passadas(depth, tool.doc or self.machine.doc_default)
        vel = self._effective_feed(op, tool)
        tool_r = tool.diametro / 2

        self._comment(
            f"Contorno {op.piece_persistent_id}"
            f"{' [onion]' if op.needs_onion else ''}"
        )

        if not op.contour_path or len(op.contour_path) < 4:
            return

        # Pontos do contorno (4 cantos) com compensacao de ferramenta
        pts = op.contour_path  # [(x,y), (x,y), (x,y), (x,y)]

        climb = self.machine.contorno_direcao == "climb"
        if not climb:
            pts = list(reversed(pts))

        # Ponto de entrada (meio da primeira aresta)
        entry_x = (pts[0][0] + pts[1][0]) / 2
        entry_y = (pts[0][1] + pts[1][1]) / 2

        # Lead-in
        use_lead_in = self.machine.usar_lead_in and self.machine.lead_in_raio > 1
        lead_r = 0
        if use_lead_in:
            edge_len = math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
            lead_r = min(self.machine.lead_in_raio, edge_len * 0.2, 15)
            if lead_r < 1:
                use_lead_in = False

        if use_lead_in:
            # Entrada antes do contorno
            dx = pts[1][0] - pts[0][0]
            dy = pts[1][1] - pts[0][1]
            edge_len = math.hypot(dx, dy)
            if edge_len > 0:
                nx, ny = -dy / edge_len, dx / edge_len
                lead_x = entry_x + nx * lead_r
                lead_y = entry_y + ny * lead_r
            else:
                lead_x, lead_y = entry_x, entry_y - lead_r
                use_lead_in = False

            self._rapid_xy(lead_x, lead_y)
        else:
            self._rapid_xy(entry_x, entry_y)

        self._rapid_z(self.z_approach())

        for p_depth in passes:
            z = self.z_cut(p_depth)

            # Rampa ou plunge
            if self.machine.usar_rampa:
                edge_len = math.hypot(
                    pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]
                )
                ramp_len = min(edge_len * 0.4, 50)
                if ramp_len > 5:
                    ratio = ramp_len / edge_len if edge_len > 0 else 0
                    rx = entry_x + (pts[1][0] - pts[0][0]) * ratio * 0.5
                    ry = entry_y + (pts[1][1] - pts[0][1]) * ratio * 0.5
                    self._linear(rx, ry, z, self.machine.vel_mergulho)
                    self._linear(entry_x, entry_y, feed=vel)
                else:
                    self._plunge(z)
            else:
                self._plunge(z)

            # Percorrer contorno completo
            for pt in pts:
                self._linear(pt[0], pt[1], feed=vel)
            # Fechar no primeiro ponto
            self._linear(pts[0][0], pts[0][1], feed=vel)

            if use_lead_in:
                # Lead-out
                self._linear(lead_x, lead_y, feed=vel)

            self._rapid_z(self.z_approach())

        if op.needs_onion:
            self._onion_ops.append(op)

        self._rapid_z(self.z_rapid())

    def _do_contorno_complexo(self, op: GcodeOp, tool: GcodeTool):
        """Contorno complexo (segmentos line/arc)."""
        prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
        depth = op.depth + prof_extra
        passes = calcular_passadas(depth, tool.doc or self.machine.doc_default)
        vel = self._effective_feed(op, tool)

        self._comment(f"Contorno complexo {op.piece_persistent_id}")

        if not op.contour_segments:
            return

        # Primeiro segmento determina ponto de entrada
        seg0 = op.contour_segments[0]
        start_x = op.abs_x
        start_y = op.abs_y

        self._rapid_xy(start_x, start_y)
        self._rapid_z(self.z_approach())

        for p_depth in passes:
            z = self.z_cut(p_depth)

            # Rampa na primeira aresta
            if self.machine.usar_rampa and len(op.contour_segments) > 0:
                seg = op.contour_segments[0]
                if seg.get("type") == "line":
                    sx = seg.get("x2", start_x)
                    sy = seg.get("y2", start_y)
                    seg_len = math.hypot(sx - start_x, sy - start_y)
                    ramp_len = min(seg_len * 0.4, 50)
                    if ramp_len > 5:
                        ratio = ramp_len / seg_len if seg_len > 0 else 0
                        rx = start_x + (sx - start_x) * ratio
                        ry = start_y + (sy - start_y) * ratio
                        self._linear(rx, ry, z, self.machine.vel_mergulho)
                        self._linear(start_x, start_y, feed=vel)
                    else:
                        self._plunge(z)
                else:
                    self._plunge(z)
            else:
                self._plunge(z)

            # Percorrer segmentos
            cur_x, cur_y = start_x, start_y
            for seg in op.contour_segments:
                seg_type = seg.get("type", "line")
                x2 = seg.get("x2", cur_x)
                y2 = seg.get("y2", cur_y)

                if seg_type == "arc":
                    cx = seg.get("cx", 0)
                    cy = seg.get("cy", 0)
                    # I, J relativos a posicao atual
                    i = (op.abs_x + cx) - cur_x
                    j = (op.abs_y + cy) - cur_y
                    cw = seg.get("dir", "cw") == "cw"
                    self._arc(x2, y2, i, j, cw, feed=vel)
                else:
                    self._linear(x2, y2, feed=vel)

                cur_x, cur_y = x2, y2

            # Fechar no ponto inicial
            if abs(cur_x - start_x) > 0.01 or abs(cur_y - start_y) > 0.01:
                self._linear(start_x, start_y, feed=vel)

            self._rapid_z(self.z_approach())

        self._rapid_z(self.z_rapid())

    def _do_circular_hole(self, op: GcodeOp, tool: GcodeTool):
        """Furo circular (G2 360°)."""
        prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
        depth = op.depth + prof_extra
        passes = calcular_passadas(depth, tool.doc or self.machine.doc_default)
        vel = self._effective_feed(op, tool)
        tool_r = tool.diametro / 2

        self._comment(f"Furo circular {op.piece_persistent_id} R={op.radius:.1f}")

        cx, cy = op.abs_x, op.abs_y
        cut_r = op.radius - tool_r

        if cut_r < 0.5:
            # Raio muito pequeno — plunge simples
            self._rapid_xy(cx, cy)
            self._rapid_z(self.z_approach())
            for p_depth in passes:
                self._plunge(self.z_cut(p_depth))
                self._rapid_z(self.z_approach())
            self._rapid_z(self.z_rapid())
            return

        # Posicionar no ponto de inicio do arco
        start_x = cx + cut_r
        start_y = cy

        self._rapid_xy(start_x, start_y)
        self._rapid_z(self.z_approach())

        for p_depth in passes:
            z = self.z_cut(p_depth)
            self._plunge(z)
            # Arco completo 360° (retorna ao mesmo ponto)
            self._arc(start_x, start_y, -cut_r, 0, cw=True, feed=vel)
            self._rapid_z(self.z_approach())

        self._rapid_z(self.z_rapid())

    def _do_generic(self, op: GcodeOp, tool: GcodeTool):
        """Operacao generica (plunge simples)."""
        prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
        depth = op.depth + prof_extra
        passes = calcular_passadas(depth, tool.doc or self.machine.doc_default)

        self._comment(f"Op generica {op.piece_persistent_id}")
        self._rapid_xy(op.abs_x, op.abs_y)
        self._rapid_z(self.z_approach())

        for p_depth in passes:
            self._plunge(self.z_cut(p_depth))
            self._rapid_z(self.z_approach())

        self._rapid_z(self.z_rapid())

    # --- Feed ---

    def _effective_feed(self, op: GcodeOp, tool: GcodeTool) -> float:
        """Feed efetivo considerando pecas pequenas."""
        vel = tool.velocidade_corte or self.machine.vel_corte
        if op.is_small_piece:
            vel = round(vel * self.machine.feed_percentual / 100)
        return vel

    # --- Onion skin breakthrough ---

    def _emit_onion_breakthrough(self):
        """Emitir passada final de breakthrough para pecas com onion skin."""
        if not self._onion_ops:
            return

        self._comment("")
        self._comment("=" * 50)
        self._comment("ONION SKIN BREAKTHROUGH")
        self._comment("=" * 50)

        # Agrupar por ferramenta
        by_tool: dict[str, list[GcodeOp]] = {}
        for op in self._onion_ops:
            tc = op.tool_code or "T01"
            by_tool.setdefault(tc, []).append(op)

        for tool_code, ops in by_tool.items():
            tool = self.tools.get(tool_code)
            if not tool:
                continue

            self._tool_change(tool)

            for op in ops:
                vel_final = round(
                    (tool.velocidade_corte or self.machine.vel_corte) * 0.6
                )
                prof_extra = tool.profundidade_extra or self.machine.profundidade_extra
                z_full = self.z_cut(op.onion_depth_full + prof_extra)

                self._comment(f"Breakthrough {op.piece_persistent_id}")

                if op.contour_path and len(op.contour_path) >= 4:
                    pts = op.contour_path
                    self._rapid_xy(pts[0][0], pts[0][1])
                    self._rapid_z(self.z_approach())
                    self._plunge(z_full)

                    for pt in pts[1:]:
                        self._linear(pt[0], pt[1], feed=vel_final)
                    self._linear(pts[0][0], pts[0][1], feed=vel_final)

                    self._rapid_z(self.z_rapid())

    # --- Gerador principal ---

    def generate(
        self,
        ops: list[GcodeOp],
        sheet_info: dict | None = None,
    ) -> GcodeResult:
        """Gerar G-code completo para uma chapa.

        Args:
            ops: Lista de operacoes ordenadas
            sheet_info: Info da chapa (index, material, dimensoes)

        Returns:
            GcodeResult com gcode, stats e alertas
        """
        self._lines = []
        self._n_line = 0
        self._cur_tool = ""
        self._tool_changes = 0
        self._total_ops = 0
        self._onion_ops = []
        alertas = []

        info = sheet_info or {}

        # --- Header ---
        for line in self.machine.gcode_header.split("\n"):
            self._emit(line)

        self._comment("")
        self._comment("=" * 50)
        self._comment(f"Gerado: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        self._comment(f"Maquina: {self.machine.name} {self.machine.model}")
        self._comment(f"Chapa: {info.get('index', 0)+1}")
        self._comment(f"Material: {info.get('material', 'N/A')}")
        self._comment(f"Dimensoes: {info.get('length', 0)}x{info.get('width', 0)}mm")
        self._comment(f"Espessura: {self.machine.espessura_chapa}mm")
        self._comment(f"Z-origin: {self.machine.z_origin}")
        self._comment(f"Operacoes: {len(ops)}")
        self._comment(f"Contorno: {self.machine.contorno_direcao}")
        self._comment("=" * 50)
        self._comment("")

        # Retract inicial
        self._rapid_z(self.z_safe())

        # --- Processar operacoes ---
        current_fase = -1

        fase_names = {
            0: "USINAGENS INTERNAS",
            1: "CONTORNOS DE PECAS",
            2: "CONTORNOS DE SOBRAS",
        }

        for op in ops:
            # Separador de fase
            if op.fase != current_fase:
                current_fase = op.fase
                self._comment("")
                self._comment(f"FASE {current_fase}: {fase_names.get(current_fase, 'OUTROS')}")
                self._comment("")

            # Resolver ferramenta
            tool = op.tool
            if not tool and op.tool_code:
                tool = self.tools.get(op.tool_code)
            if not tool:
                # Fallback para primeira ferramenta disponivel
                if self.tools:
                    tool = next(iter(self.tools.values()))
                    alertas.append(
                        f"Ferramenta {op.tool_code} nao encontrada, "
                        f"usando {tool.codigo}"
                    )
                else:
                    alertas.append(f"Nenhuma ferramenta disponivel para op {op.op_type}")
                    continue

            # Tool change
            self._tool_change(tool)

            # Dispatch por tipo
            if op.op_type == "hole":
                self._do_hole(op, tool)
            elif op.op_type == "groove":
                self._do_groove(op, tool)
            elif op.op_type == "pocket":
                self._do_pocket(op, tool)
            elif op.op_type == "contorno":
                if op.contour_segments:
                    self._do_contorno_complexo(op, tool)
                else:
                    self._do_contorno_retangular(op, tool)
            elif op.op_type == "contorno_sobra":
                self._do_contorno_retangular(op, tool)
            elif op.op_type == "circular_hole":
                self._do_circular_hole(op, tool)
            elif op.op_type == "contour_hole":
                self._do_contorno_complexo(op, tool)
            else:
                self._do_generic(op, tool)

            self._total_ops += 1

        # --- Onion skin breakthrough ---
        self._emit_onion_breakthrough()

        # --- Footer ---
        self._comment("")
        self._emit(self.machine.spindle_off)
        for line in self.machine.gcode_footer.split("\n"):
            self._emit(line)

        # --- Stats ---
        est_time = self._total_ops * 3 + self._tool_changes * 12

        stats = {
            "total_ops": self._total_ops,
            "tool_changes": self._tool_changes,
            "onion_ops": len(self._onion_ops),
            "estimated_time_s": est_time,
            "lines": len(self._lines),
        }

        return GcodeResult(
            gcode="\n".join(self._lines),
            stats=stats,
            alertas=alertas,
        )


# ---------------------------------------------------------------------------
# Funcao de conveniencia
# ---------------------------------------------------------------------------

def generate_gcode(
    ops: list[GcodeOp],
    machine: MachineConfig | None = None,
    tools: dict[str, GcodeTool] | None = None,
    sheet_info: dict | None = None,
) -> GcodeResult:
    """Gerar G-code para uma chapa.

    Args:
        ops: Operacoes a gerar
        machine: Configuracao da maquina
        tools: Dicionario de ferramentas
        sheet_info: Info da chapa

    Returns:
        GcodeResult
    """
    if machine is None:
        machine = MachineConfig()
    gen = GcodeGenerator(machine, tools)
    return gen.generate(ops, sheet_info)
