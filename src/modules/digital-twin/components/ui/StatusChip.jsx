// @ts-check
import React from 'react';

const LABELS = {
  ok: 'OK',
  pendente: 'Pendente',
  erro: 'Erro',
  usinado: 'Usinado',
};

/**
 * @param {{ status: 'ok'|'pendente'|'erro'|'usinado' }} props
 */
export function StatusChip({ status }) {
  return (
    <span className={`dt-chip dt-chip-${status}`}>{LABELS[status] ?? status}</span>
  );
}
