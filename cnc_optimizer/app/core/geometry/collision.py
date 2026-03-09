"""Deteccao de colisao entre poligonos.

Usa Shapely STRtree para busca espacial eficiente
quando ha muitas pecas no layout.
"""

from __future__ import annotations

from shapely.geometry import Polygon, MultiPolygon
from shapely import STRtree


# ---------------------------------------------------------------------------
# Colisao par-a-par
# ---------------------------------------------------------------------------

def polygons_collide(a: Polygon, b: Polygon, tolerance: float = 0.01) -> bool:
    """Verificar se dois poligonos colidem (overlap ou tocam).

    Dois poligonos colidem se a intersecao tem area > tolerance.
    Tocar nas bordas (intersecao = linha) NAO e colisao.

    Args:
        a: Primeiro poligono
        b: Segundo poligono
        tolerance: Area minima de intersecao para considerar colisao (mm²)

    Returns:
        True se colidem (overlap com area)
    """
    if not a.is_valid or not b.is_valid:
        return True  # Conservador: poligono invalido = colisao

    # Fast check: bounding boxes nao se sobrepoem
    ax0, ay0, ax1, ay1 = a.bounds
    bx0, by0, bx1, by1 = b.bounds
    if ax1 < bx0 or bx1 < ax0 or ay1 < by0 or by1 < ay0:
        return False

    # Verificar intersecao real
    if not a.intersects(b):
        return False

    # Intersecao pode ser ponto ou linha (nao e colisao real)
    intersection = a.intersection(b)
    return intersection.area > tolerance


def polygon_overlaps_any(
    poly: Polygon,
    placed: list[Polygon],
    tolerance: float = 0.01,
) -> bool:
    """Verificar se poligono colide com algum dos ja colocados.

    Busca linear — usar CollisionIndex para listas grandes.

    Args:
        poly: Poligono a testar
        placed: Lista de poligonos ja colocados
        tolerance: Area minima de intersecao (mm²)

    Returns:
        True se colide com algum
    """
    for other in placed:
        if polygons_collide(poly, other, tolerance):
            return True
    return False


def minimum_distance(a: Polygon, b: Polygon) -> float:
    """Calcular distancia minima entre dois poligonos.

    Args:
        a: Primeiro poligono
        b: Segundo poligono

    Returns:
        Distancia minima em mm (0 se tocam ou se sobrepoem)
    """
    return a.distance(b)


def overlap_area(a: Polygon, b: Polygon) -> float:
    """Calcular area de sobreposicao entre dois poligonos.

    Args:
        a: Primeiro poligono
        b: Segundo poligono

    Returns:
        Area de sobreposicao em mm² (0 se nao se sobrepoem)
    """
    if not a.intersects(b):
        return 0.0
    intersection = a.intersection(b)
    return intersection.area


# ---------------------------------------------------------------------------
# Indice espacial para busca eficiente (STRtree)
# ---------------------------------------------------------------------------

class CollisionIndex:
    """Indice espacial para deteccao de colisao eficiente.

    Usa Shapely STRtree (Sort-Tile-Recursive) para consultas
    espaciais em O(log n) em vez de O(n).

    Ideal para layouts com muitas pecas (>10).
    """

    def __init__(self):
        """Inicializar indice vazio."""
        self._polygons: list[Polygon] = []
        self._tree: STRtree | None = None
        self._dirty: bool = False

    @property
    def count(self) -> int:
        """Numero de poligonos no indice."""
        return len(self._polygons)

    def add(self, poly: Polygon) -> int:
        """Adicionar poligono ao indice.

        Args:
            poly: Poligono a adicionar

        Returns:
            Indice do poligono adicionado
        """
        idx = len(self._polygons)
        self._polygons.append(poly)
        self._dirty = True
        return idx

    def add_many(self, polys: list[Polygon]) -> list[int]:
        """Adicionar varios poligonos ao indice.

        Args:
            polys: Lista de poligonos

        Returns:
            Lista de indices
        """
        indices = []
        for poly in polys:
            indices.append(self.add(poly))
        return indices

    def _rebuild(self):
        """Reconstruir STRtree se necessario."""
        if self._dirty and self._polygons:
            self._tree = STRtree(self._polygons)
            self._dirty = False

    def query_collisions(self, poly: Polygon, tolerance: float = 0.01) -> list[int]:
        """Encontrar indices de poligonos que colidem com poly.

        Usa STRtree para filtrar por bounding box primeiro,
        depois verifica intersecao real.

        Args:
            poly: Poligono a testar
            tolerance: Area minima de intersecao (mm²)

        Returns:
            Lista de indices de poligonos que colidem
        """
        if not self._polygons:
            return []

        self._rebuild()

        # Query STRtree — retorna indices dos candidatos por bbox
        candidates = self._tree.query(poly)

        # Verificar colisao real
        collisions = []
        for idx in candidates:
            other = self._polygons[idx]
            if polygons_collide(poly, other, tolerance):
                collisions.append(int(idx))

        return collisions

    def has_collision(self, poly: Polygon, tolerance: float = 0.01) -> bool:
        """Verificar se poligono colide com algum no indice.

        Args:
            poly: Poligono a testar
            tolerance: Area minima de intersecao (mm²)

        Returns:
            True se colide com algum
        """
        if not self._polygons:
            return False

        self._rebuild()

        candidates = self._tree.query(poly)

        for idx in candidates:
            other = self._polygons[idx]
            if polygons_collide(poly, other, tolerance):
                return True

        return False

    def query_nearby(self, poly: Polygon, max_distance: float) -> list[int]:
        """Encontrar poligonos proximos (dentro de max_distance).

        Util para encontrar vizinhos para compactacao.

        Args:
            poly: Poligono de referencia
            max_distance: Distancia maxima em mm

        Returns:
            Lista de indices de poligonos proximos
        """
        if not self._polygons:
            return []

        self._rebuild()

        # Expandir bbox por max_distance para query
        expanded = poly.buffer(max_distance)
        candidates = self._tree.query(expanded)

        nearby = []
        for idx in candidates:
            other = self._polygons[idx]
            dist = poly.distance(other)
            if dist <= max_distance:
                nearby.append(int(idx))

        return nearby

    def clear(self):
        """Limpar indice."""
        self._polygons.clear()
        self._tree = None
        self._dirty = False

    def get_polygon(self, index: int) -> Polygon:
        """Obter poligono por indice.

        Args:
            index: Indice do poligono

        Returns:
            Poligono
        """
        return self._polygons[index]

    def get_all(self) -> list[Polygon]:
        """Obter todos os poligonos.

        Returns:
            Lista de todos os poligonos no indice
        """
        return list(self._polygons)
