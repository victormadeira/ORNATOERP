/**
 * orcamentos.valor_venda is the negotiated amount, already discounted by the
 * quote editor. Payment metadata describes that discount; it must not be
 * deducted a second time when creating receivables.
 * This helper is pure so its contract can be tested without loading db.js.
 */
export function valorFinalOrcamento(orcamento) {
    const value = Number(orcamento?.valor_venda);
    if (!Number.isFinite(value) || value < 0) throw new Error('Valor de venda inválido.');
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
