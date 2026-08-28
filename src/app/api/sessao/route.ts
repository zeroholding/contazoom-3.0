/**
 * GET /api/sessao — quem está logado e o que essa pessoa pode fazer.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 6.
 *
 * `/api/auth/me` devolve apenas `{ id, email, name }` — não devolve o papel.
 * Sem o papel no cliente, a tela só descobre que a pessoa não pode concluir uma
 * etapa depois de clicar e tomar 403, o que é uma experiência ruim e ainda
 * gera log de erro para uso normal do sistema.
 *
 * Esta rota é adição: `/api/auth/me` continua igual, e nada que já existe passa
 * a depender daqui. As permissões são calculadas pelos MESMOS predicados que as
 * rotas de escrita usam, então a tela nunca oferece um botão que a API recusa.
 *
 * O cliente usa isto para ESCONDER ou DESABILITAR ação — não para autorizar.
 * A autorização real continua no servidor, em cada rota.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  PAPEL_DESCRICAO,
  PAPEL_ICONE,
  PAPEL_LABEL,
  PAPEL_RESUMO,
  PAPEIS_INTERNOS,
  podeAlterarRegime,
  podeConcluirEtapa,
  podeCriarProcesso,
  podeEncerrarTarefa,
  podeGerenciarBloqueio,
  podeGerenciarEmpresa,
  podeGerenciarUsuarios,
  podeReabrirTarefa,
  podeRetornarEtapa,
  requireSessao,
} from "@/lib/api-guard";
import { RESPONSAVEL } from "@/lib/tarefa-etapas";

export async function GET(req: NextRequest) {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) return sessao;

  const { papel } = sessao;

  return NextResponse.json({
    userId: sessao.userId,
    email: sessao.email,
    nome: sessao.nome,
    papel,
    papelLabel: PAPEL_LABEL[papel] ?? papel,
    papelDescricao: PAPEL_DESCRICAO[papel] ?? "",
    papelResumo: PAPEL_RESUMO[papel] ?? "",
    papelIcone: PAPEL_ICONE[papel] ?? "User",
    interno: PAPEIS_INTERNOS.includes(papel),
    permissoes: {
      // Concluir etapa depende de QUAL etapa; devolvemos os três casos para a
      // tela decidir por etapa sem uma ida ao servidor por cartão.
      concluirEtapaComercial: podeConcluirEtapa(papel, RESPONSAVEL.COMERCIAL_CZ),
      concluirEtapaEscritorio: podeConcluirEtapa(papel, RESPONSAVEL.ESCRITORIO),
      concluirEtapaAmbos: podeConcluirEtapa(papel, RESPONSAVEL.AMBOS),
      retornarEtapa: podeRetornarEtapa(papel),
      encerrarTarefa: podeEncerrarTarefa(papel),
      reabrirTarefa: podeReabrirTarefa(papel),
      gerenciarBloqueio: podeGerenciarBloqueio(papel),
      criarProcesso: podeCriarProcesso(papel),
      gerenciarEmpresa: podeGerenciarEmpresa(papel),
      alterarRegime: podeAlterarRegime(papel),
      gerenciarUsuarios: podeGerenciarUsuarios(papel),
    },
  });
}
