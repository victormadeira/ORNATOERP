"""Geracao de pontos candidatos para placement de pecas.

Dois modos:
- Fast path retangular: logica MaxRects / Bottom-Left
- Path irregular (NFP): pontos baseados em IFP e NFPs
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from shapely.geometry import Polygon, box, MultiPolygon
from shapely.ops import unary_union

from app.core.domain.models import Piece, Sheet, Placement
from app.core.domain.enums import NestingHeuristic


# ---------------------------------------------------------------------------
# Estruturas de dados
# ---------------------------------------------------------------------------

@dataclass
class FreeRect:
    """Retangulo livre na chapa (MaxRects)."""
    x: float
    y: float
    w: float
    h: float

    @property
    def area(self) -> float:
        return self.w * self.h

    @property
    def right(self) -> float:
        return self.x + self.w

    @property
    def top(self) -> float:
        return self.y + self.h

    def contains(self, pw: float, ph: float) -> bool:
        """Verifica se uma peca cabe neste retangulo."""
        return pw <= self.w + 0.001 and ph <= self.h + 0.001


@dataclass
class CandidatePoint:
    """Ponto candidato para posicionamento."""
    x: float
    y: float
    rotation: float = 0
    score: float = float("inf")
    free_rect_index: int = -1
    heuristic_used: str = ""

    @property
    def key(self) -> tuple:
        """Chave unica para deduplicacao."""
        return (round(self.x, 1), round(self.y, 1), self.rotation)


# ---------------------------------------------------------------------------
# MaxRects Bin (Fast Path Retangular)
# ---------------------------------------------------------------------------

class MaxRectsBin:
    """Bin de retangulos livres estilo MaxRects.

    Port do MaxRectsRect do JS nesting-engine.js:65-280.
    Gerencia lista de retangulos livres e posiciona pecas.
    """

    def __init__(self, width: float, height: float, spacing: float = 7.0,
                 split_dir: str = "auto"):
        """Inicializar bin com dimensoes e spacing.

        Args:
            width: Largura util da chapa (apos refilo)
            height: Altura util da chapa (apos refilo)
            spacing: Espacamento minimo entre pecas (mm)
            split_dir: Direcao de corte - "horizontal", "vertical", "auto"/"misto"
        """
        self.width = width
        self.height = height
        self.spacing = spacing
        self.split_dir = split_dir
        self.free_rects: list[FreeRect] = [FreeRect(0, 0, width, height)]
        self.used_rects: list[dict] = []

    def find_best(
        self,
        pw: float,
        ph: float,
        allow_rotate: bool = True,
        heuristic: NestingHeuristic = NestingHeuristic.BSSF,
        piece_class: str = "normal",
    ) -> Optional[CandidatePoint]:
        """Encontrar melhor posicao para uma peca.

        Testa todas as free rects com a heuristica dada.

        Args:
            pw: Largura da peca
            ph: Altura da peca
            allow_rotate: Permitir rotacao 90 graus
            heuristic: Heuristica de placement
            piece_class: Classificacao CNC (normal, pequena, super_pequena)

        Returns:
            Melhor CandidatePoint ou None
        """
        pw_s = pw + self.spacing
        ph_s = ph + self.spacing

        best: Optional[CandidatePoint] = None
        best_score = float("inf")

        for idx, fr in enumerate(self.free_rects):
            # Orientacao normal
            if fr.contains(pw_s, ph_s):
                score = self._score_placement(
                    fr, pw_s, ph_s, pw, ph, heuristic, piece_class
                )
                # Rotation penalty: penalizar orientacao que nao favorece a direcao
                # horizontal: pecas largas (pw > ph) sao preferidas → penalizar se pw < ph
                # vertical: pecas altas (ph > pw) sao preferidas → penalizar se ph < pw
                if self.split_dir == "horizontal" and pw < ph - 0.1:
                    score += 5000
                elif self.split_dir == "vertical" and ph < pw - 0.1:
                    score += 5000
                if score < best_score:
                    best_score = score
                    best = CandidatePoint(
                        x=fr.x, y=fr.y, rotation=0, score=score,
                        free_rect_index=idx,
                        heuristic_used=heuristic.value,
                    )

            # Orientacao rotacionada (90 graus)
            if allow_rotate and abs(pw - ph) > 0.1:
                if fr.contains(ph_s, pw_s):
                    score = self._score_placement(
                        fr, ph_s, pw_s, ph, pw, heuristic, piece_class
                    )
                    # Mesma penalidade direcional para orientacao rotacionada
                    # Na rotacao, ph vira a largura e pw vira a altura
                    if self.split_dir == "horizontal" and ph < pw - 0.1:
                        score += 5000
                    elif self.split_dir == "vertical" and pw < ph - 0.1:
                        score += 5000
                    if score < best_score:
                        best_score = score
                        best = CandidatePoint(
                            x=fr.x, y=fr.y, rotation=90, score=score,
                            free_rect_index=idx,
                            heuristic_used=heuristic.value,
                        )

        return best

    def find_best_multi_heuristic(
        self,
        pw: float,
        ph: float,
        allow_rotate: bool = True,
        piece_class: str = "normal",
    ) -> Optional[CandidatePoint]:
        """Encontrar melhor posicao testando TODAS as heuristicas.

        Port da logica multi-heuristic do JS (linhas 777-827).

        Args:
            pw: Largura da peca
            ph: Altura da peca
            allow_rotate: Permitir rotacao
            piece_class: Classificacao CNC

        Returns:
            Melhor CandidatePoint entre todas as heuristicas
        """
        best: Optional[CandidatePoint] = None

        for h in NestingHeuristic:
            candidate = self.find_best(pw, ph, allow_rotate, h, piece_class)
            if candidate is not None:
                if best is None or candidate.score < best.score:
                    best = candidate

        return best

    def place_rect(self, x: float, y: float, pw: float, ph: float,
                   piece_ref: dict | None = None) -> None:
        """Colocar peca na posicao e atualizar free rects.

        Args:
            x: Posicao X
            y: Posicao Y
            pw: Largura da peca (sem spacing)
            ph: Altura da peca (sem spacing)
            piece_ref: Referencia a peca original
        """
        pw_s = pw + self.spacing
        ph_s = ph + self.spacing

        placed = {
            "x": x, "y": y,
            "w": pw_s, "h": ph_s,
            "real_w": pw, "real_h": ph,
            "ref": piece_ref,
        }
        self.used_rects.append(placed)

        # Particionar free rects afetados
        new_free: list[FreeRect] = []
        to_remove: list[int] = []

        for idx, fr in enumerate(self.free_rects):
            # Verificar se o retangulo colocado intersecta este free rect
            if not self._rects_overlap(
                x, y, pw_s, ph_s,
                fr.x, fr.y, fr.w, fr.h,
            ):
                continue

            to_remove.append(idx)

            # Gerar ate 4 novos retangulos ao redor do placement
            # Esquerda
            if x > fr.x:
                left_w = x - fr.x
                if left_w > 1:
                    new_free.append(FreeRect(fr.x, fr.y, left_w, fr.h))

            # Direita
            right_x = x + pw_s
            if right_x < fr.right:
                right_w = fr.right - right_x
                if right_w > 1:
                    new_free.append(FreeRect(right_x, fr.y, right_w, fr.h))

            # Abaixo (em cima no coord system)
            if y > fr.y:
                bottom_h = y - fr.y
                if bottom_h > 1:
                    new_free.append(FreeRect(fr.x, fr.y, fr.w, bottom_h))

            # Acima
            top_y = y + ph_s
            if top_y < fr.top:
                top_h = fr.top - top_y
                if top_h > 1:
                    new_free.append(FreeRect(fr.x, top_y, fr.w, top_h))

        # Remover rects particionados (ordem reversa)
        for idx in sorted(to_remove, reverse=True):
            self.free_rects.pop(idx)

        # Adicionar novos
        self.free_rects.extend(new_free)

        # Podar retangulos dominados
        self._prune_dominated()

    def occupancy(self) -> float:
        """Calcular taxa de ocupacao (0-100)."""
        total_area = self.width * self.height
        if total_area == 0:
            return 0
        used_area = sum(r["real_w"] * r["real_h"] for r in self.used_rects)
        return (used_area / total_area) * 100

    def remaining_free_area(self) -> float:
        """Area livre total (pode ter sobreposicao entre free rects)."""
        return sum(fr.area for fr in self.free_rects)

    # --- Funcoes internas ---

    def _score_placement(
        self,
        fr: FreeRect,
        pw_s: float, ph_s: float,
        pw: float, ph: float,
        heuristic: NestingHeuristic,
        piece_class: str,
    ) -> float:
        """Calcular score de uma posicao usando a heuristica.

        Port do _tryFit do JS.
        """
        if heuristic == NestingHeuristic.BSSF:
            # Best Short Side Fit
            score = min(fr.w - pw_s, fr.h - ph_s)
        elif heuristic == NestingHeuristic.BLSF:
            # Best Long Side Fit
            score = max(fr.w - pw_s, fr.h - ph_s)
        elif heuristic == NestingHeuristic.BAF:
            # Best Area Fit
            score = fr.area - (pw_s * ph_s)
        elif heuristic == NestingHeuristic.BL:
            # Bottom-Left
            score = fr.y * 100000 + fr.x
        elif heuristic == NestingHeuristic.CP:
            # Contact Point (perimetro em contato)
            contact = self._contact_length(fr.x, fr.y, pw, ph)
            score = -contact  # Mais contato = melhor (score negativo)
        else:
            score = fr.y * 100000 + fr.x  # Fallback BL

        # Directional override: force placement direction
        # horizontal = rows (fill left-to-right, then next row) → prioritize Y then X
        # vertical = columns (fill top-to-bottom, then next column) → prioritize X then Y
        if self.split_dir == "horizontal":
            score = fr.y * 100000 + fr.x
        elif self.split_dir == "vertical":
            score = fr.x * 100000 + fr.y

        # Edge-affinity: pecas grandes preferencialmente nas bordas da chapa
        # Isso concentra o espaco vazio em retangulos maiores (sobras mais uteis)
        max_side = max(pw, ph)
        if max_side > 0.35 * max(self.width, self.height):
            edge_bonus = 0.0
            tol = self.spacing + 1.0
            # Bonus por encostar em cada borda
            if fr.x < tol:
                edge_bonus += ph  # Encosta borda esquerda
            if fr.y < tol:
                edge_bonus += pw  # Encosta borda inferior
            if abs(fr.x + pw_s - self.width) < tol + self.spacing:
                edge_bonus += ph  # Encosta borda direita
            if abs(fr.y + ph_s - self.height) < tol + self.spacing:
                edge_bonus += pw  # Encosta borda superior
            # Peso sutil para nao atrapalhar ocupacao (tie-breaker)
            if edge_bonus > 0:
                weight = 0.05 * (max_side / max(self.width, self.height))
                base = abs(score) if score != 0 else 100
                score -= edge_bonus * weight * base / max(pw, ph, 1)

        # Vacuum-aware: pecas pequenas preferencialmente na periferia
        if piece_class != "normal":
            cx = self.width / 2
            cy = self.height / 2
            pcx = fr.x + pw / 2
            pcy = fr.y + ph / 2
            max_dist = math.sqrt(cx ** 2 + cy ** 2)
            if max_dist > 0:
                dist = math.sqrt((pcx - cx) ** 2 + (pcy - cy) ** 2) / max_dist
                weight = 0.4 if piece_class == "super_pequena" else 0.2
                # Mais longe do centro = melhor (diminui o score)
                score -= dist * weight * abs(score) if score != 0 else dist * weight * 100

        return score

    def _contact_length(self, x: float, y: float, pw: float, ph: float) -> float:
        """Calcular perimetro em contato com outras pecas ou bordas.

        Contato com bordas do bin e pecas ja colocadas.
        """
        contact = 0.0

        # Contato com bordas
        if abs(x) < 0.1:
            contact += ph  # Borda esquerda
        if abs(y) < 0.1:
            contact += pw  # Borda inferior
        if abs(x + pw - self.width) < self.spacing + 0.1:
            contact += ph  # Borda direita
        if abs(y + ph - self.height) < self.spacing + 0.1:
            contact += pw  # Borda superior

        # Contato com pecas ja colocadas
        for rect in self.used_rects:
            rx, ry = rect["x"], rect["y"]
            rw, rh = rect["w"], rect["h"]

            # Verifica adjacencia horizontal
            if abs(x + pw + self.spacing - rx) < 1 or abs(rx + rw - x) < 1:
                overlap_y = max(0, min(y + ph, ry + rh) - max(y, ry))
                contact += overlap_y

            # Verifica adjacencia vertical
            if abs(y + ph + self.spacing - ry) < 1 or abs(ry + rh - y) < 1:
                overlap_x = max(0, min(x + pw, rx + rw) - max(x, rx))
                contact += overlap_x

        return contact

    @staticmethod
    def _rects_overlap(
        x1: float, y1: float, w1: float, h1: float,
        x2: float, y2: float, w2: float, h2: float,
    ) -> bool:
        """Verificar se dois retangulos se sobrepoem."""
        return not (
            x1 >= x2 + w2 or x2 >= x1 + w1 or
            y1 >= y2 + h2 or y2 >= y1 + h1
        )

    def _prune_dominated(self):
        """Remover free rects que estao totalmente contidos em outros."""
        to_remove = set()
        n = len(self.free_rects)

        for i in range(n):
            if i in to_remove:
                continue
            for j in range(n):
                if i == j or j in to_remove:
                    continue
                fi = self.free_rects[i]
                fj = self.free_rects[j]
                # i esta contido em j?
                if (fi.x >= fj.x and fi.y >= fj.y and
                    fi.right <= fj.right + 0.01 and
                    fi.top <= fj.top + 0.01):
                    to_remove.add(i)
                    break

        if to_remove:
            self.free_rects = [
                fr for idx, fr in enumerate(self.free_rects)
                if idx not in to_remove
            ]


# ---------------------------------------------------------------------------
# GuillotineBin (para esquadrejadeira) — Layout em Faixas
# ---------------------------------------------------------------------------

class GuillotineBin:
    """Bin Guillotine para corte na esquadrejadeira — layout em faixas.

    Organiza pecas em faixas horizontais com cortes de ponta a ponta:
    - Cortes horizontais cruzam TODA a largura da chapa
    - Cortes verticais cruzam TODA a altura da faixa
    - Compativel 100% com esquadrejadeira / serra de esquadro

    Estrutura do layout:
        +--[V1]--[V2]--[V3]----------+
        | peca1 | peca2 | peca3 | ... |  Faixa 1 (h = maior peca)
        +========[H1]=================+  <- corte H de ponta a ponta
        | peca4 | peca5 |   sobra     |  Faixa 2
        +========[H2]=================+  <- corte H de ponta a ponta
        |          sobra              |
        +-----------------------------+
    """

    # Limiar: reusar faixa se desperdicio de altura < 25% da faixa
    STRIP_REUSE_THRESHOLD = 0.25

    def __init__(self, width: float, height: float,
                 spacing: float = 7.0, kerf: float = 4.0,
                 split_dir: str = "auto"):
        self.width = width
        self.height = height
        self.spacing = spacing
        self.kerf = kerf
        self.split_dir = split_dir  # auto/horizontal: faixas H; vertical: faixas V
        self.strips: list[dict] = []  # [{y, h, used_w}]
        self.used_rects: list[dict] = []
        self.cuts: list[dict] = []  # Cortes de ponta a ponta

    @property
    def free_rects(self) -> list[FreeRect]:
        """Compatibilidade: areas livres como lista de FreeRect."""
        rects = []
        for strip in self.strips:
            remaining = self.width - strip["used_w"]
            if remaining > 1:
                rects.append(FreeRect(strip["used_w"], strip["y"],
                                      remaining, strip["h"]))
        # Area livre abaixo de todas as faixas
        next_y = self._next_strip_y()
        remaining_h = self.height - next_y
        if remaining_h > 1:
            rects.append(FreeRect(0, next_y, self.width, remaining_h))
        return rects

    def _next_strip_y(self) -> float:
        """Posicao Y onde a proxima faixa comecaria."""
        if not self.strips:
            return 0
        last = self.strips[-1]
        return last["y"] + last["h"] + self.kerf

    def find_best(
        self,
        pw: float, ph: float,
        allow_rotate: bool = True,
        heuristic: NestingHeuristic = NestingHeuristic.BSSF,
        piece_class: str = "normal",
    ) -> Optional[CandidatePoint]:
        """Encontrar melhor posicao usando layout de faixas.

        Prioridade:
        1. Faixa existente com encaixe bom (desperdicio < 25%)
        2. Nova faixa (desperdicio 0)
        3. Faixa existente com encaixe ruim (ultima opcao)
        """
        pw_s = pw + self.spacing
        ph_s = ph + self.spacing

        best: Optional[CandidatePoint] = None
        best_score = float("inf")

        orientations = [(pw_s, ph_s, 0)]
        if allow_rotate and abs(pw - ph) > 0.1:
            orientations.append((ph_s, pw_s, 90))

        for w_s, h_s, rot in orientations:
            # --- Faixas existentes ---
            for i, strip in enumerate(self.strips):
                remaining_w = self.width - strip["used_w"]
                if w_s > remaining_w + 0.01 or h_s > strip["h"] + 0.01:
                    continue

                h_waste = strip["h"] - h_s
                h_waste_ratio = h_waste / strip["h"] if strip["h"] > 0 else 1.0

                if h_waste_ratio <= self.STRIP_REUSE_THRESHOLD:
                    # Bom encaixe: score baixo (prioridade 1)
                    score = h_waste + strip["y"] * 0.0001
                else:
                    # Encaixe ruim: score alto (prioridade 3)
                    score = 10000 + h_waste + strip["y"] * 0.0001

                if score < best_score:
                    best_score = score
                    best = CandidatePoint(
                        x=strip["used_w"], y=strip["y"],
                        rotation=rot, score=score,
                        free_rect_index=i,
                        heuristic_used=heuristic.value,
                    )

            # --- Nova faixa ---
            next_y = self._next_strip_y()
            if next_y + h_s <= self.height + 0.01 and w_s <= self.width + 0.01:
                # Nova faixa: desperdicio 0, score medio (prioridade 2)
                # Fica entre bom encaixe e encaixe ruim
                score = 5000 + next_y * 0.0001
                if score < best_score:
                    best_score = score
                    best = CandidatePoint(
                        x=0, y=next_y,
                        rotation=rot, score=score,
                        free_rect_index=-1,
                        heuristic_used=heuristic.value,
                    )

        return best

    def find_best_multi_heuristic(
        self,
        pw: float, ph: float,
        allow_rotate: bool = True,
        piece_class: str = "normal",
    ) -> Optional[CandidatePoint]:
        """Para layout de faixas, todas heuristicas convergem."""
        return self.find_best(pw, ph, allow_rotate, NestingHeuristic.BSSF, piece_class)

    def place_rect(self, x: float, y: float, pw: float, ph: float,
                   piece_ref: dict | None = None) -> None:
        """Colocar peca e atualizar faixa."""
        pw_s = pw + self.spacing
        ph_s = ph + self.spacing

        self.used_rects.append({
            "x": x, "y": y,
            "w": pw_s, "h": ph_s,
            "real_w": pw, "real_h": ph,
            "ref": piece_ref,
        })

        # Encontrar ou criar faixa
        target_strip = None
        for strip in self.strips:
            if abs(strip["y"] - y) < 0.5:
                target_strip = strip
                break

        if target_strip is None:
            target_strip = {"y": y, "h": ph_s, "used_w": 0}
            self.strips.append(target_strip)
            self.strips.sort(key=lambda s: s["y"])

        target_strip["used_w"] = max(target_strip["used_w"], x + pw_s)

        # Reconstruir cortes
        self._rebuild_cuts()

    def _rebuild_cuts(self) -> None:
        """Reconstruir sequencia de cortes de ponta a ponta."""
        self.cuts = []

        for i, strip in enumerate(self.strips):
            # Corte horizontal entre faixas (LARGURA TOTAL da chapa)
            if i > 0:
                prev = self.strips[i - 1]
                cut_y = prev["y"] + prev["h"]
                self.cuts.append({
                    "dir": "Horizontal",
                    "x": 0,
                    "y": cut_y,
                    "length": self.width,
                })

            # Cortes verticais dentro da faixa (ALTURA TOTAL da faixa)
            strip_pieces = sorted(
                [r for r in self.used_rects if abs(r["y"] - strip["y"]) < 0.5],
                key=lambda p: p["x"],
            )

            for j in range(len(strip_pieces) - 1):
                p = strip_pieces[j]
                cut_x = p["x"] + p["w"]
                self.cuts.append({
                    "dir": "Vertical",
                    "x": cut_x,
                    "y": strip["y"],
                    "length": strip["h"],
                })

        # Corte horizontal apos ultima faixa (separar sobra inferior)
        if self.strips:
            last = self.strips[-1]
            bottom_y = last["y"] + last["h"]
            remaining = self.height - bottom_y
            if remaining > self.kerf + 1:
                self.cuts.append({
                    "dir": "Horizontal",
                    "x": 0,
                    "y": bottom_y,
                    "length": self.width,
                })

    def occupancy(self) -> float:
        """Calcular taxa de ocupacao (0-100)."""
        total_area = self.width * self.height
        if total_area == 0:
            return 0
        used_area = sum(r["real_w"] * r["real_h"] for r in self.used_rects)
        return (used_area / total_area) * 100

    def remaining_free_area(self) -> float:
        """Area livre total."""
        return sum(fr.area for fr in self.free_rects)


# ---------------------------------------------------------------------------
# ShelfBin (prateleira)
# ---------------------------------------------------------------------------

class ShelfBin:
    """Bin baseado em prateleiras (shelves).

    Ideal para pecas com alturas semelhantes.
    """

    def __init__(self, width: float, height: float, spacing: float = 7.0):
        self.width = width
        self.height = height
        self.spacing = spacing
        self.shelves: list[dict] = []  # {y, h, used_w, pieces}
        self.used_rects: list[dict] = []

    def find_best(
        self,
        pw: float, ph: float,
        allow_rotate: bool = True,
        heuristic: NestingHeuristic = NestingHeuristic.BSSF,
        piece_class: str = "normal",
    ) -> Optional[CandidatePoint]:
        """Encontrar melhor prateleira para a peca."""
        pw_s = pw + self.spacing
        ph_s = ph + self.spacing

        best: Optional[CandidatePoint] = None
        best_waste = float("inf")

        # Tentar prateleiras existentes
        for shelf in self.shelves:
            # Orientacao normal
            if pw_s <= (self.width - shelf["used_w"]) and ph <= shelf["h"]:
                waste = shelf["h"] - ph
                if waste < best_waste:
                    best_waste = waste
                    best = CandidatePoint(
                        x=shelf["used_w"], y=shelf["y"],
                        rotation=0, score=waste,
                    )

            # Rotacionada
            if allow_rotate and abs(pw - ph) > 0.1:
                if ph_s <= (self.width - shelf["used_w"]) and pw <= shelf["h"]:
                    waste = shelf["h"] - pw
                    if waste < best_waste:
                        best_waste = waste
                        best = CandidatePoint(
                            x=shelf["used_w"], y=shelf["y"],
                            rotation=90, score=waste,
                        )

        # Nova prateleira?
        next_y = sum(s["h"] + self.spacing for s in self.shelves) if self.shelves else 0
        if next_y + ph_s <= self.height + 0.01:
            # Nova shelf com peca normal
            waste = 0  # Nova shelf = sem desperdicio vertical
            if best is None or waste < best_waste:
                best = CandidatePoint(
                    x=0, y=next_y, rotation=0, score=-1,  # Prioridade para nova shelf
                )

        if allow_rotate and abs(pw - ph) > 0.1:
            if next_y + pw_s <= self.height + 0.01:
                if best is None:
                    best = CandidatePoint(
                        x=0, y=next_y, rotation=90, score=-1,
                    )

        return best

    def find_best_multi_heuristic(
        self,
        pw: float, ph: float,
        allow_rotate: bool = True,
        piece_class: str = "normal",
    ) -> Optional[CandidatePoint]:
        """Encontrar melhor posicao testando todas as heuristicas."""
        # ShelfBin nao tem heuristicas multiplas — reutiliza find_best
        return self.find_best(pw, ph, allow_rotate, NestingHeuristic.BSSF, piece_class)

    def place_rect(self, x: float, y: float, pw: float, ph: float,
                   piece_ref: dict | None = None) -> None:
        """Colocar peca na prateleira."""
        pw_s = pw + self.spacing

        # Encontrar ou criar shelf
        target_shelf = None
        for shelf in self.shelves:
            if abs(shelf["y"] - y) < 0.1:
                target_shelf = shelf
                break

        if target_shelf is None:
            target_shelf = {"y": y, "h": ph, "used_w": 0, "pieces": []}
            self.shelves.append(target_shelf)

        target_shelf["used_w"] += pw_s
        target_shelf["pieces"].append(piece_ref)

        self.used_rects.append({
            "x": x, "y": y,
            "w": pw_s, "h": ph,
            "real_w": pw, "real_h": ph,
            "ref": piece_ref,
        })

    def occupancy(self) -> float:
        total_area = self.width * self.height
        if total_area == 0:
            return 0
        used_area = sum(r["real_w"] * r["real_h"] for r in self.used_rects)
        return (used_area / total_area) * 100


# ---------------------------------------------------------------------------
# Factory de bins
# ---------------------------------------------------------------------------

BIN_TYPES = {
    "maxrects": MaxRectsBin,
    "guillotine": GuillotineBin,
    "shelf": ShelfBin,
}


def create_bin(
    bin_type: str,
    width: float,
    height: float,
    spacing: float = 7.0,
    kerf: float = 4.0,
    **kwargs,
) -> MaxRectsBin | GuillotineBin | ShelfBin:
    """Criar bin pelo tipo.

    Args:
        bin_type: "maxrects", "guillotine", "shelf"
        width: Largura util
        height: Altura util
        spacing: Espacamento entre pecas
        kerf: Largura do disco (guillotine)

    Returns:
        Instancia do bin
    """
    if bin_type == "guillotine":
        return GuillotineBin(width, height, spacing, kerf, **kwargs)
    elif bin_type == "shelf":
        return ShelfBin(width, height, spacing)
    else:
        split_dir = kwargs.get("split_dir", "auto")
        return MaxRectsBin(width, height, spacing, split_dir=split_dir)
