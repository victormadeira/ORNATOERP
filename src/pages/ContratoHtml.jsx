// ── Valor por extenso (PT-BR) ───────────────────────────────────────────────
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function extenso999(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const parts = [];
    const c = Math.floor(n / 100);
    const r = n % 100;
    if (c > 0) parts.push(CENTENAS[c]);
    if (r > 0) {
        if (r < 20) {
            parts.push(UNIDADES[r]);
        } else {
            const d = Math.floor(r / 10);
            const u = r % 10;
            parts.push(DEZENAS[d]);
            if (u > 0) parts.push(UNIDADES[u]);
        }
    }
    return parts.join(' e ');
}

export function valorExtenso(valor) {
    if (!valor || valor <= 0) return 'zero reais';
    const v = Math.round(valor * 100); // centavos totais
    const reais = Math.floor(v / 100);
    const centavos = v % 100;

    const partes = [];

    if (reais > 0) {
        if (reais >= 1000000) {
            const milhoes = Math.floor(reais / 1000000);
            const restoMilhao = reais % 1000000;
            partes.push(milhoes === 1 ? 'um milhão' : `${extenso999(milhoes)} milhões`);
            if (restoMilhao > 0) {
                const milhares = Math.floor(restoMilhao / 1000);
                const unidades = restoMilhao % 1000;
                if (milhares > 0) {
                    partes.push(milhares === 1 ? 'mil' : `${extenso999(milhares)} mil`);
                }
                if (unidades > 0) {
                    partes.push(extenso999(unidades));
                }
            }
        } else if (reais >= 1000) {
            const milhares = Math.floor(reais / 1000);
            const unidades = reais % 1000;
            partes.push(milhares === 1 ? 'mil' : `${extenso999(milhares)} mil`);
            if (unidades > 0) {
                partes.push(extenso999(unidades));
            }
        } else {
            partes.push(extenso999(reais));
        }
        partes.push(reais === 1 ? 'real' : 'reais');
    }

    if (centavos > 0) {
        if (reais > 0) partes.push('e');
        partes.push(extenso999(centavos));
        partes.push(centavos === 1 ? 'centavo' : 'centavos');
    }

    return partes.join(' ');
}

// ── Formatar data ───────────────────────────────────────────────────────────
function fmtData(d) {
    if (!d) return new Date().toLocaleDateString('pt-BR');
    if (d instanceof Date) return d.toLocaleDateString('pt-BR');
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function fmtDataExtenso() {
    const d = new Date();
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// ── Meios de pagamento (display) ────────────────────────────────────────────
const MEIO_LABEL = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
    cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
    boleto: 'Boleto', cheque: 'Cheque', '': 'Sem definir',
};

// ── Template padrão do contrato ─────────────────────────────────────────────
export const DEFAULT_CONTRATO_TEMPLATE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARCENARIA PLANEJADA

Pelo presente instrumento particular, as partes abaixo qualificadas:

CONTRATADA: {empresa_nome}, inscrita no CNPJ sob nº {empresa_cnpj}, com sede em {empresa_endereco}, {empresa_cidade}/{empresa_estado}, telefone {empresa_telefone}, e-mail {empresa_email}.

CONTRATANTE: {cliente_nome}, inscrito(a) no CPF/CNPJ sob nº {cliente_cpf}{cliente_cnpj}, residente em {cliente_endereco}, {cliente_cidade}, telefone {cliente_telefone}, e-mail {cliente_email}.

Celebram o presente contrato, mediante as seguintes cláusulas e condições:

CLÁUSULA 1ª — DO OBJETO
O presente contrato tem por objeto a fabricação e instalação de móveis planejados sob medida para o projeto "{projeto_nome}" (Proposta nº {numero}), compreendendo os seguintes ambientes: {ambientes_lista}.
Local da obra: {endereco_obra}.
Os móveis serão fabricados em MDF de primeira linha, com ferragens de qualidade, conforme especificações detalhadas na Proposta Comercial (Anexo I), parte integrante deste contrato.
Parágrafo Único: Decorações, eletrodomésticos, eletroeletrônicos, iluminações, mármores, granitos, móveis extras, cortinas, papéis de parede e similares eventualmente presentes em imagens, renderizações ou materiais ilustrativos têm efeito meramente decorativo e não fazem parte deste contrato.

CLÁUSULA 2ª — DO CADERNO TÉCNICO E APROVAÇÃO DO PROJETO
A CONTRATADA elaborará o Caderno Técnico contendo o projeto detalhado dos móveis, com medidas, materiais, acabamentos e demais especificações.
a) O CONTRATANTE deverá aprovar o Caderno Técnico por escrito (assinatura física ou confirmação por e-mail) no prazo de 5 (cinco) dias úteis após o recebimento. A não manifestação nesse prazo será considerada atraso por responsabilidade exclusiva do CONTRATANTE.
b) A aprovação do Caderno Técnico constitui aceite formal e definitivo do projeto. Após a aprovação, qualquer alteração solicitada pelo CONTRATANTE poderá implicar em acréscimo de prazo e valor, devendo ser formalizada por escrito e aprovada pela CONTRATADA.
c) A CONTRATADA somente dará início à produção dos móveis após cumulativamente: (i) aprovação do Caderno Técnico; e (ii) confirmação do pagamento da entrada.
Parágrafo Único: A assinatura do presente contrato, a aprovação do Caderno Técnico e a Proposta Comercial prevalecem sobre imagens meramente ilustrativas, renderizações, perspectivas e conversas informais. Somente documentos formais assinados ou aprovados por e-mail oficial da CONTRATADA vinculam as partes.

CLÁUSULA 3ª — DO VALOR E FORMA DE PAGAMENTO
O valor total dos serviços é de {valor_total} ({valor_total_extenso}), a ser pago conforme condições abaixo:
{parcelas_descricao}
{desconto}
Parágrafo Primeiro: O atraso no pagamento de qualquer parcela acarretará multa de 2% (dois por cento) sobre o valor da parcela em atraso, acrescida de juros de mora de 1% (um por cento) ao mês e correção monetária pelo INPC, calculados pro rata die.
Parágrafo Segundo: O inadimplemento de qualquer parcela por prazo superior a 30 (trinta) dias importará no vencimento antecipado de todas as parcelas vincendas, tornando exigível o saldo total do contrato.

CLÁUSULA 4ª — DO PRAZO DE ENTREGA E MONTAGEM
O prazo estimado para fabricação e instalação dos móveis é de {prazo_entrega}, contados a partir da aprovação e assinatura do Caderno Técnico pelo CONTRATANTE, cumulativamente com a confirmação do pagamento da entrada, conforme Cláusula 2ª, alínea "c".
Parágrafo Primeiro: A montagem poderá ocorrer em etapas, conforme programação de produção e logística da CONTRATADA, sem que a entrega parcial configure descumprimento contratual.
Parágrafo Segundo: Eventuais atrasos causados por alterações solicitadas pelo CONTRATANTE serão acrescidos ao prazo original, mediante comunicação por escrito.
Parágrafo Terceiro: O prazo de entrega ficará automaticamente suspenso, sem qualquer ônus para a CONTRATADA, nas seguintes hipóteses:
a) Local da obra não disponível ou em condições inadequadas para montagem (paredes sem reboco ou acabamento, piso inacabado, pontos elétricos/hidráulicos pendentes, pintura não concluída);
b) Paredes fora de esquadro, desníveis de piso, vícios construtivos ou quaisquer irregularidades no imóvel que demandem ajustes no projeto ou na montagem;
c) Atraso nas obras civis ou de terceiros que impossibilitem o acesso ou a instalação;
d) Impossibilidade de acesso ao local: restrições de condomínio, falta de autorização de entrada, indisponibilidade de elevador de serviço, horários de carga/descarga não liberados;
e) Falta de fornecimento de planta hidráulica e elétrica conforme Cláusula 6ª;
f) Caso fortuito ou força maior, nos termos do art. 393 do Código Civil.
Parágrafo Quarto: Cada suspensão reinicia a programação conforme agenda disponível da CONTRATADA. O reagendamento está sujeito à disponibilidade de equipe e rota de montagem.
Parágrafo Quinto: Visitas de montagem frustradas por culpa do CONTRATANTE (local não liberado, obras inacabadas, acesso negado) configuram visita improdutiva, podendo a CONTRATADA cobrar taxa de remobilização de equipe e transporte, mediante aviso prévio.

CLÁUSULA 5ª — DA MEDIÇÃO, TOLERÂNCIAS E INTERFERÊNCIAS DE OBRA
As medidas finais serão validadas pela CONTRATADA na data da medição técnica. Qualquer modificação posterior na obra civil, gesso, revestimento, paginação, ponto hidráulico ou elétrico, rodapé, soleira, mármore, esquadria ou parede é de responsabilidade exclusiva do CONTRATANTE.
Parágrafo Primeiro: Divergências entre o projeto arquitetônico e a obra executada que exijam adaptação dos móveis poderão gerar custos e prazos adicionais, mediante orçamento complementar.
Parágrafo Segundo: Por se tratar de móveis sob medida e material industrializado, são consideradas normais e aceitáveis:
a) Pequenas variações de tonalidade, desenho do padrão e textura decorrentes de lote, sentido do veio e natureza do MDF/revestimento;
b) Pequenas folgas técnicas e alinhamentos compatíveis com o sistema de montagem;
c) Emendas técnicas quando necessárias para viabilizar a instalação;
d) Diferenças visuais decorrentes de iluminação ambiente.
Parágrafo Terceiro: A CONTRATADA não se responsabiliza por ocultar integralmente defeitos de alvenaria, empenos de parede, desalinho de piso, forro, revestimento, rodapé, mármore e esquadrias. Soluções de compensação técnica, arremates e ajustes são aceitas quando necessárias para viabilizar a instalação e não constituem defeito de fabricação.

CLÁUSULA 6ª — DAS OBRIGAÇÕES DO CONTRATANTE
a) Efetuar os pagamentos nas datas e condições estipuladas;
b) Disponibilizar o local da obra em condições adequadas para instalação: paredes rebocadas e no esquadro, piso instalado e nivelado, pontos elétricos e hidráulicos finalizados, pintura concluída;
c) Entregar a planta hidráulica e elétrica do imóvel com antecedência mínima de 10 (dez) dias úteis antes da data prevista para montagem. A não entrega isenta a CONTRATADA de quaisquer danos a encanamentos, fiações ou instalações ocultas;
d) Deixar o local totalmente limpo e livre de móveis ou objetos que possam impossibilitar a montagem;
e) Fornecer, caso necessário, todo material elétrico e hidráulico complementar para a montagem (cabos, fios, canos, fita isolante, fitas e luminárias de LED, etc.). Na ausência desses materiais, a equipe poderá paralisar os serviços sem que isso configure atraso da CONTRATADA;
f) Garantir acesso adequado ao local da montagem, incluindo autorização de condomínio, reserva de elevador de serviço, vaga para carga/descarga e horário compatível;
g) Comunicar a CONTRATADA sobre quaisquer irregularidades no local da obra antes da montagem.
Parágrafo Primeiro: Custos de içamento, transporte especial, taxa condominial, estacionamento e logística extraordinária não previstos na proposta não estão inclusos e serão cobrados à parte, mediante orçamento prévio.
Parágrafo Segundo: O presente contrato não inclui serviços de instalações hidráulicas e elétricas. Qualquer serviço extra, incluindo instalação de eletrônicos e eletrodomésticos, deverá ser aprovado formalmente pela CONTRATADA e cobrado por ela.

CLÁUSULA 7ª — DAS OBRIGAÇÕES DA CONTRATADA
a) Fabricar os móveis conforme Caderno Técnico aprovado e especificações da Proposta Comercial;
b) Utilizar materiais de primeira qualidade conforme especificado;
c) Realizar a instalação completa dos móveis no local indicado;
d) Cumprir os prazos estipulados, ressalvadas as hipóteses da Cláusula 4ª;
e) Deixar o local limpo ao final da montagem, retirando restos de materiais e embalagens;
f) Fornecer garantia conforme Cláusula 9ª.
Parágrafo Único: A CONTRATADA responsabiliza-se por avarias causadas em paredes e portas durante a montagem, desde que identificadas e registradas por escrito no ato do ocorrido ou em até 48 (quarenta e oito) horas após a conclusão da montagem, exceto danos decorrentes de vícios construtivos preexistentes ou pintura final de acabamento.

CLÁUSULA 8ª — DO ACEITE PROVISÓRIO E ACEITE FINAL
Aceite Provisório: Ocorre quando os móveis estiverem instalados e aptos ao uso funcional, ainda que existam pequenos ajustes, regulagens ou acabamentos finais pendentes. O Aceite Provisório será formalizado no Termo de Entrega, onde serão registradas todas as pendências.
Aceite Final: Ocorre após a conclusão integral das pendências registradas no Termo de Entrega, encerrando a fase de instalação e montagem.
Parágrafo Primeiro: A necessidade de ajustes finos, regulagens de portas e gavetas, instalação de acabamentos finais ou pequenos reparos estéticos (assistência técnica), que não impeçam a utilização substancial e funcional dos móveis, não caracteriza inadimplemento da CONTRATADA e não autoriza o CONTRATANTE a reter, sustar ou atrasar qualquer pagamento.
Parágrafo Segundo: O pagamento da parcela final está vinculado ao Aceite Provisório (instalação funcional), e não ao Aceite Final.

CLÁUSULA 9ª — DA GARANTIA
A CONTRATADA oferece as seguintes garantias, contadas a partir da data do Aceite Provisório:
a) Garantia estrutural: 5 (cinco) anos para defeitos de fabricação na estrutura dos móveis (caixas, tamponamentos, fundos, fixações estruturais);
b) Garantia de acessórios e acabamentos: 2 (dois) anos para ferragens, corrediças, dobradiças e acabamentos especiais (palhinha, tecidos, revestimentos diferenciados);
c) Garantia contra oxidação: 6 (seis) meses para corrediças e dobradiças metálicas de aço zincado em ambientes úmidos (banheiro, área de serviço, cozinha com bancada).
Parágrafo Primeiro: A garantia não cobre e fica automaticamente cancelada nas seguintes hipóteses:
a) Danos causados por uso inadequado, acidentes, impactos, quedas ou ações da natureza;
b) Manchas causadas por agentes químicos, abrasivos ou produtos de limpeza inadequados;
c) Danos causados por chuvas, inundações, infiltrações, maresia, umidade da alvenaria ou exposição inadequada;
d) Consertos, desmontagens ou remontagens realizados por terceiros não autorizados;
e) Danos decorrentes de transporte, mudança ou excesso de peso;
f) Danos causados por insetos, principalmente cupim;
g) Não observância das instruções de conservação e limpeza;
h) Desalinhamentos ou movimentações decorrentes de acomodação natural da obra, dilatação térmica ou recalque do imóvel;
i) Uso comercial quando o projeto foi concebido para uso residencial;
j) Desgaste natural de itens consumíveis (fitas de borda, feltros, amortecedores).
Parágrafo Segundo: Para acionar a garantia, o CONTRATANTE deverá comunicar a CONTRATADA por escrito (e-mail ou WhatsApp oficial), que terá prazo de 15 (quinze) dias úteis para realizar vistoria técnica e, sendo procedente, prazo razoável para execução do reparo.

CLÁUSULA 10ª — DA ASSISTÊNCIA TÉCNICA
A assistência técnica compreende exclusivamente: ajustes finos, regulagens de portas e gavetas, reaperto de ferragens, retoques estéticos menores e correção de defeitos cobertos pela garantia.
Parágrafo Primeiro: Não se consideram assistência técnica e serão cobrados como serviço adicional:
a) Alterações de projeto, acabamento, cor ou padrão por preferência do CONTRATANTE após a aprovação do Caderno Técnico;
b) Inclusão de itens, módulos ou acessórios não contratados;
c) Reparos ou adaptações decorrentes de erro de obra civil, reforma, intervenção de terceiros ou alterações posteriores na arquitetura do imóvel;
d) Desmontagem e remontagem por solicitação do CONTRATANTE (mudança, reforma, troca de revestimento etc.);
e) Revisões decorrentes de obra fora de esquadro, recalque, infiltração ou vícios construtivos do imóvel.

CLÁUSULA 11ª — DAS ALTERAÇÕES NO PROJETO
O CONTRATANTE não poderá solicitar modificações diretamente aos montadores durante a instalação. Qualquer alteração deverá ser comunicada por escrito à CONTRATADA.
Parágrafo Único: Alterações solicitadas após a aprovação do Caderno Técnico poderão implicar em acréscimo de prazo e valor, mediante orçamento complementar aprovado pelo CONTRATANTE antes da execução.

CLÁUSULA 12ª — DA RESCISÃO E DISTRATO
Em caso de rescisão por iniciativa do CONTRATANTE:
a) Antes do início da produção: multa de 20% (vinte por cento) sobre o valor total do contrato;
b) Após o início da produção: multa de 20% (vinte por cento) sobre o valor total, acrescida do ressarcimento integral de todos os custos já incorridos pela CONTRATADA.
Parágrafo Primeiro: Considera-se início da produção qualquer das seguintes atividades: compra de matéria-prima, emissão de pedido a fornecedores, elaboração de projeto executivo e engenharia detalhada, corte e usinagem de peças, ou separação logística de materiais.
Parágrafo Segundo: Os valores pagos pelo CONTRATANTE poderão ser retidos para compensar despesas administrativas, engenharia, medição, projeto executivo, compras realizadas e produção parcial, restituindo-se eventual saldo em até 30 (trinta) dias.
Parágrafo Terceiro: Em caso de rescisão por parte da CONTRATADA, sem justa causa, esta devolverá os valores pagos, devidamente corrigidos pelo INPC, no prazo de 30 (trinta) dias.

CLÁUSULA 13ª — DA RESERVA DE DOMÍNIO E INADIMPLEMENTO
Fica reservado à CONTRATADA o direito de propriedade sobre os móveis objeto deste contrato até a total quitação do valor previsto na Cláusula 3ª.
Parágrafo Primeiro: Enquanto não quitado integralmente, o CONTRATANTE obriga-se a zelar pela conservação dos móveis, sendo-lhe vedado alterar sua estrutura sem autorização da CONTRATADA.
Parágrafo Segundo: Em caso de inadimplemento, a CONTRATADA poderá, a seu critério e sem prejuízo das demais penalidades:
a) Suspender a montagem e reter módulos pendentes de instalação;
b) Realizar cobrança extrajudicial e judicial do saldo devedor;
c) Protestar os títulos e negativar o CONTRATANTE nos órgãos de proteção ao crédito;
d) Exercer a faculdade de reintegração na posse dos móveis, hipótese em que os custos de retirada, transporte e armazenamento serão de responsabilidade do CONTRATANTE.

CLÁUSULA 14ª — DAS PENALIDADES
Parágrafo Primeiro: Sem prejuízo das penalidades específicas previstas neste contrato (multa por atraso, vencimento antecipado, multa rescisória), a parte que descumprir quaisquer compromissos assumidos ficará sujeita a honorários advocatícios de 20% (vinte por cento) sobre o valor em discussão, além de custas judiciais e extrajudiciais.
Parágrafo Segundo: As penalidades específicas previstas em cláusulas próprias (multa por atraso de parcela, vencimento antecipado, multa rescisória) não se confundem entre si e serão aplicadas conforme a natureza de cada descumprimento, vedada a cumulação em duplicidade sobre o mesmo fato.

CLÁUSULA 15ª — DO ARMAZENAMENTO
Caso os móveis estejam prontos e o CONTRATANTE não libere o local para montagem, a CONTRATADA concederá tolerância de 15 (quinze) dias corridos sem custos adicionais.
Parágrafo Primeiro: Ultrapassado o prazo de tolerância, será cobrada taxa de armazenamento de 1% (um por cento) do valor total do contrato por mês ou fração, até a efetiva liberação para montagem.
Parágrafo Segundo: A CONTRATADA não se responsabiliza por danos aos móveis armazenados após 90 (noventa) dias do prazo original de entrega por culpa exclusiva do CONTRATANTE.

CLÁUSULA 16ª — DA IMAGEM E PORTFÓLIO
Salvo oposição expressa manifestada por escrito pelo CONTRATANTE, a CONTRATADA poderá fotografar o projeto concluído para fins de portfólio, divulgação em redes sociais e materiais comerciais, preservando-se dados pessoais e endereço do CONTRATANTE.

CLÁUSULA 17ª — DAS DISPOSIÇÕES FINAIS
O presente contrato vigora até o Aceite Final dos móveis, passando então a representar documento de compra e venda para fins de garantia.
O cumprimento do prazo de entrega fica vinculado ao pagamento da entrada dentro do prazo combinado.
Casos omissos serão resolvidos de comum acordo entre as partes, observando-se a legislação civil brasileira vigente.

CLÁUSULA 18ª — DO FORO
Fica eleito o foro da comarca de {empresa_cidade}/{empresa_estado} para dirimir quaisquer controvérsias oriundas deste contrato.

E por estarem assim justos e contratados, firmam o presente instrumento em duas vias de igual teor, juntamente com duas testemunhas.

{empresa_cidade}, {data_hoje}.`;

// ── Substituir variáveis no template ────────────────────────────────────────
function replaceVars(template, vars) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return vars[key] !== undefined ? vars[key] : match;
    });
}

// ── buildContratoHtml ───────────────────────────────────────────────────────
export function buildContratoHtml({
    empresa, cliente, orcamento, ambientes,
    pagamento, pvComDesconto, template,
    prazoEntrega, enderecoObra, propostaHtml,
}) {
    const descontoR = (pagamento?.desconto?.valor || 0) > 0
        ? (pagamento.desconto.tipo === '%' ? pvComDesconto / (1 - pagamento.desconto.valor / 100) * (pagamento.desconto.valor / 100) : pagamento.desconto.valor)
        : 0;

    // Gerar descrição das parcelas
    const parcelasDesc = (pagamento?.blocos || []).map((b, i) => {
        const val = pvComDesconto * ((Number(b.percentual) || 0) / 100);
        const parc = Number(b.parcelas) || 1;
        const meio = MEIO_LABEL[b.meio] || b.meio;
        const desc = b.descricao || `Pagamento ${i + 1}`;
        if (parc > 1) {
            return `- ${desc}: ${parc}x de R$ ${(val / parc).toFixed(2).replace('.', ',')} via ${meio} (${b.percentual}% = R$ ${val.toFixed(2).replace('.', ',')})`;
        }
        return `- ${desc}: R$ ${val.toFixed(2).replace('.', ',')} via ${meio} (${b.percentual}%)`;
    }).join('\n');

    const descontoDesc = descontoR > 0
        ? `Desconto concedido: ${pagamento.desconto.tipo === '%' ? pagamento.desconto.valor + '%' : 'R$ ' + pagamento.desconto.valor.toFixed(2).replace('.', ',')} (R$ ${descontoR.toFixed(2).replace('.', ',')}).`
        : '';

    const ambientesLista = ambientes.map(a => a.nome).filter(Boolean).join(', ') || '\u2014';

    // Dados formatados em negrito para destaque no contrato
    const bold = (v) => v ? `<strong>${v}</strong>` : '_______________';

    const vars = {
        empresa_nome: bold(empresa?.nome),
        empresa_cnpj: bold(empresa?.cnpj),
        empresa_endereco: bold(empresa?.endereco),
        empresa_cidade: empresa?.cidade || '_______________',
        empresa_estado: empresa?.estado || '_______________',
        empresa_telefone: bold(empresa?.telefone),
        empresa_email: bold(empresa?.email),
        cliente_nome: bold(cliente?.nome),
        cliente_cpf: cliente?.cpf ? `<strong>${cliente.cpf}</strong>` : '',
        cliente_cnpj: cliente?.cnpj ? `<strong>${cliente.cnpj}</strong>` : '',
        cliente_endereco: bold([cliente?.endereco, cliente?.numero, cliente?.complemento, cliente?.bairro].filter(Boolean).join(', ')),
        cliente_cidade: bold([cliente?.cidade, cliente?.estado].filter(Boolean).join('/')),
        cliente_telefone: bold(cliente?.telefone),
        cliente_email: bold(cliente?.email),
        projeto_nome: bold(orcamento?.projeto),
        numero: bold(orcamento?.numero),
        endereco_obra: bold(enderecoObra),
        prazo_entrega: bold(prazoEntrega || 'A combinar'),
        validade_proposta: orcamento?.validadeProposta || '15 dias',
        valor_total: `<strong>R$ ${pvComDesconto.toFixed(2).replace('.', ',')}</strong>`,
        valor_total_extenso: valorExtenso(pvComDesconto),
        parcelas_descricao: parcelasDesc || 'A definir.',
        desconto: descontoDesc,
        ambientes_lista: bold(ambientesLista),
        data_hoje: fmtDataExtenso(),
    };

    const tpl = template || DEFAULT_CONTRATO_TEMPLATE;
    const conteudo = replaceVars(tpl, vars);

    // ── Cores dinamicas ──
    const corPrimaria = empresa?.proposta_cor_primaria || '#1B2A4A';
    const corAccent = empresa?.proposta_cor_accent || '#C9A96E';

    // ── Logo e watermark ──
    const logoSrc = empresa?.logo_path || empresa?.logo || '';
    const watermarkSrc = empresa?.logo_watermark_path || empresa?.logo_watermark || '';
    const watermarkOpacity = empresa?.logo_watermark_opacity ?? 0.04;

    // ── Info empresa para header ──
    const empresaNome = empresa?.nome || '';
    const empresaCnpj = empresa?.cnpj || '';
    const empresaEnd = [empresa?.endereco, empresa?.cidade ? `${empresa.cidade}/${empresa.estado || ''}` : ''].filter(Boolean).join(', ');
    const empresaContato = [empresa?.telefone, empresa?.email].filter(Boolean);

    // Formatar termos-chave em negrito no corpo do texto
    function boldTerms(text) {
        return text
            .replace(/\bCONTRATADA\b/g, '<strong>CONTRATADA</strong>')
            .replace(/\bCONTRATANTE\b/g, '<strong>CONTRATANTE</strong>')
            .replace(/\bCaderno T[eé]cnico\b/g, '<strong>Caderno T\u00E9cnico</strong>')
            .replace(/\bTermo de Entrega\b/g, '<strong>Termo de Entrega</strong>')
            .replace(/\bAceite Provis[oó]rio\b/g, '<strong>Aceite Provis\u00F3rio</strong>')
            .replace(/\bAceite Final\b/g, '<strong>Aceite Final</strong>')
            .replace(/\bProposta Comercial\b/g, '<strong>Proposta Comercial</strong>');
    }

    // Converter quebras de linha em HTML
    const conteudoHtml = conteudo
        .split('\n')
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            // Detectar clausulas (titulos) e titulo do contrato
            if (/^CL[AÁ]USULA\s+\d/i.test(trimmed) || /^CONTRATO DE /i.test(trimmed)) {
                return `<p class="clausula-titulo">${trimmed}</p>`;
            }
            // Paragrafos (Paragrafo Primeiro, Unico, etc)
            if (/^Par[aá]grafo/i.test(trimmed)) {
                return `<p class="paragrafo">${boldTerms(trimmed)}</p>`;
            }
            // Itens com letra (a), b), etc)
            if (/^[a-z]\)/.test(trimmed)) {
                return `<p class="item-letra">${boldTerms(trimmed)}</p>`;
            }
            // Linhas com "- " (parcelas)
            if (trimmed.startsWith('- ')) {
                return `<p class="item-parcela">\u2022 ${trimmed.slice(2)}</p>`;
            }
            return `<p class="texto">${boldTerms(trimmed)}</p>`;
        })
        .join('\n');

    // ── ANEXO I — Resumo dos ambientes e móveis (sem proposta completa) ──
    let anexoHtml = '';
    if (ambientes && ambientes.length > 0) {
        const R = (v) => `R$ ${(v || 0).toFixed(2).replace('.', ',')}`;
        const ambRows = ambientes.map(amb => {
            const itens = (amb.itens || amb.linhas || []);
            const itensList = itens.map(it => {
                const nome = it.nome || it.titulo || it.descricao || 'Item';
                const qtd = it.qtd || 1;
                return `<tr><td style="padding:4px 10px;font-size:10.5px;color:#555;border-bottom:1px solid #f0f0f0">${nome}</td><td style="padding:4px 10px;text-align:center;font-size:10.5px;color:#555;border-bottom:1px solid #f0f0f0">${qtd}</td></tr>`;
            }).join('');
            return `
            <div style="margin-bottom:14px">
                <div style="font-weight:700;font-size:12px;color:${corPrimaria};padding:6px 10px;background:#f8f8f8;border-radius:4px;margin-bottom:4px">${amb.nome || 'Ambiente'}</div>
                ${itens.length > 0 ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:4px 10px;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #eee">Móvel / Item</th><th style="text-align:center;padding:4px 10px;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #eee;width:60px">Qtd</th></tr></thead><tbody>${itensList}</tbody></table>` : '<p style="font-size:10.5px;color:#999;padding:4px 10px">Sem itens detalhados</p>'}
            </div>`;
        }).join('');

        anexoHtml = `
    <div style="page-break-before: always"></div>
    <div class="anexo-header">ANEXO I \u2014 RELAÇÃO DE AMBIENTES E MÓVEIS</div>
    <div class="anexo-sub">Parte integrante do contrato \u00B7 Ref. Proposta n\u00BA ${orcamento?.numero || '\u2014'}</div>
    <div class="anexo-content" style="margin-top:16px">
        ${ambRows}
        <div style="margin-top:16px;padding:10px;background:#f8f8f8;border-radius:6px;font-size:11px;color:#555">
            <strong>Valor total:</strong> R$ ${pvComDesconto.toFixed(2).replace('.', ',')}
            ${descontoR > 0 ? ` <span style="color:#999">(desconto de R$ ${descontoR.toFixed(2).replace('.', ',')} já aplicado)</span>` : ''}
        </div>
        <p style="font-size:9.5px;color:#999;margin-top:10px;font-style:italic">
            As especificações completas de materiais, acabamentos e dimensões constam na Proposta Comercial nº ${orcamento?.numero || '\u2014'},
            disponível para consulta pelo link enviado ao contratante.
        </p>
    </div>`;
    }

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
    @page { margin: 20mm 18mm; size: A4; }
    body {
        font-family: 'Segoe UI', Tahoma, Geneva, sans-serif;
        color: #333; line-height: 1.5;
        margin: 0; padding: 0;
        font-style: normal;
    }

    /* ══════════ WATERMARK ══════════ */
    .wm {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        opacity: ${watermarkOpacity}; z-index: -1; pointer-events: none;
    }
    .wm img { width: 420px; height: auto; }

    /* ══════════ HEADER ══════════ */
    .header {
        display: flex; align-items: center;
        gap: 16px; padding-bottom: 10px;
        border-bottom: 2.5px solid ${corPrimaria};
        margin-bottom: 18px;
    }
    .header-logo img {
        max-height: 55px; max-width: 100px;
        object-fit: contain;
    }
    .header-info { flex: 1; }
    .h-detail {
        font-size: 10px; color: #666;
        line-height: 1.4; margin-top: 2px;
    }

    /* ══════════ TITULO ══════════ */
    .contrato-titulo {
        text-align: center; margin: 8px 0 4px;
        font-size: 14px; font-weight: 700;
        color: ${corPrimaria}; letter-spacing: 0.5px;
        text-transform: uppercase;
    }
    .contrato-sub {
        text-align: center; font-size: 9.5px;
        color: #888; margin-bottom: 16px;
    }

    /* ══════════ CONTEUDO ══════════ */
    .content { margin-bottom: 8px; }
    .clausula-titulo {
        margin: 16px 0 4px; font-weight: 700;
        font-size: 11px; color: ${corPrimaria};
        text-transform: uppercase;
    }
    .texto {
        margin: 2px 0; font-size: 10.5px;
        line-height: 1.55; text-align: justify;
        color: #444; font-style: normal;
    }
    .paragrafo {
        margin: 6px 0 2px; font-size: 10.5px;
        line-height: 1.55; text-align: justify;
        color: #444; font-weight: 600;
    }
    .item-letra {
        margin: 1px 0 1px 20px;
        font-size: 10px; color: #444;
        line-height: 1.5;
    }
    .item-parcela {
        margin: 1px 0 1px 14px;
        font-size: 10px; color: #444;
        line-height: 1.5;
    }

    /* ══════════ ASSINATURAS ══════════ */
    .sig-section { margin-top: 36px; page-break-inside: avoid; }
    .sig-date {
        font-size: 11px; color: #555;
        margin-bottom: 40px;
    }
    .sig-grid {
        display: flex; justify-content: space-between;
        gap: 60px;
    }
    .sig-block { flex: 1; text-align: center; }
    .sig-line { border-top: 1px solid #555; padding-top: 5px; }
    .sig-name { font-size: 11px; font-weight: 700; color: #222; }
    .sig-role { font-size: 9px; color: #888; margin-top: 1px; }
    .sig-doc { font-size: 8px; color: #bbb; margin-top: 2px; }

    /* ══════════ TESTEMUNHAS ══════════ */
    .test-section {
        margin-top: 50px; page-break-inside: avoid;
    }
    .test-label {
        font-size: 10px; font-weight: 700;
        color: #555; margin-bottom: 30px;
    }
    .test-grid {
        display: flex; justify-content: space-between;
        gap: 60px;
    }
    .test-block { flex: 1; text-align: center; }
    .test-line { border-top: 1px solid #999; padding-top: 5px; }
    .test-info { font-size: 9px; color: #888; }
    .test-cpf { font-size: 8px; color: #bbb; margin-top: 1px; }

    /* ══════════ FOOTER ══════════ */
    .footer {
        margin-top: 20px; text-align: center;
        font-size: 8px; color: #bbb;
        border-top: 1px solid #eee; padding-top: 6px;
    }

    /* ══════════ ANEXO ══════════ */
    .anexo-header {
        text-align: center; font-size: 13px;
        font-weight: 700; color: ${corPrimaria};
        letter-spacing: 0.5px; margin: 18px 0 4px;
        text-transform: uppercase;
    }
    .anexo-sub {
        text-align: center; font-size: 9.5px;
        color: #888; margin-bottom: 14px;
    }
    .anexo-content { }
</style></head><body>

    <!-- WATERMARK -->
    ${watermarkSrc ? `<div class="wm"><img src="${watermarkSrc}" /></div>` : ''}

    <!-- HEADER -->
    <div class="header">
        ${logoSrc ? `<div class="header-logo"><img src="${logoSrc}" /></div>` : ''}
        <div class="header-info">
            ${empresaCnpj ? `<div class="h-detail">CNPJ: ${empresaCnpj}</div>` : ''}
            ${empresaEnd ? `<div class="h-detail">${empresaEnd}</div>` : ''}
            ${empresaContato.length > 0 ? `<div class="h-detail">${empresaContato.join(' \u00B7 ')}</div>` : ''}
        </div>
    </div>

    <!-- TITULO -->
    <div class="contrato-titulo">Contrato de Presta\u00E7\u00E3o de Servi\u00E7os de Marcenaria</div>
    <div class="contrato-sub">${orcamento?.numero ? `Ref. Proposta n\u00BA ${orcamento.numero} \u00B7 ` : ''}${fmtData()}</div>

    <!-- CONTEUDO -->
    <div class="content">
        ${conteudoHtml}
    </div>

    <!-- ASSINATURAS -->
    <div class="sig-section">
        <div class="sig-date"><strong>${empresa?.cidade || ''}${empresa?.estado ? '/' + empresa.estado : ''}</strong>, ${fmtDataExtenso()}.</div>
        <div class="sig-grid">
            <div class="sig-block">
                <div class="sig-line">
                    <div class="sig-name">${empresaNome || 'CONTRATADA'}</div>
                    <div class="sig-role">CONTRATADA</div>
                    ${empresaCnpj ? `<div class="sig-doc">CNPJ: ${empresaCnpj}</div>` : ''}
                </div>
            </div>
            <div class="sig-block">
                <div class="sig-line">
                    <div class="sig-name">${cliente?.nome || 'CONTRATANTE'}</div>
                    <div class="sig-role">CONTRATANTE</div>
                    ${(cliente?.cpf || cliente?.cnpj) ? `<div class="sig-doc">${cliente?.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}: ${cliente?.tipo_pessoa === 'juridica' ? (cliente?.cnpj || '') : (cliente?.cpf || '')}</div>` : ''}
                </div>
            </div>
        </div>
    </div>

    <!-- TESTEMUNHAS -->
    <div class="test-section">
        <div class="test-label">TESTEMUNHAS:</div>
        <div class="test-grid">
            <div class="test-block">
                <div class="test-line">
                    <div class="test-info">Nome: ________________________________</div>
                    <div class="test-cpf">CPF: ________________________________</div>
                </div>
            </div>
            <div class="test-block">
                <div class="test-line">
                    <div class="test-info">Nome: ________________________________</div>
                    <div class="test-cpf">CPF: ________________________________</div>
                </div>
            </div>
        </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
        Documento gerado em ${fmtData()} \u00B7 ${empresa?.nome || ''} \u00B7 ${empresa?.telefone || ''} \u00B7 ${empresa?.email || ''}
    </div>

    <!-- ANEXO I \u2014 PROPOSTA -->
    ${anexoHtml}

</body></html>`;
}
