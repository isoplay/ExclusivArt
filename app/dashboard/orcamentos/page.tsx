import { Suspense } from 'react'
import { getCategoriasComComponentes, getMateriaisDisponiveis } from '../pedidos/actions'
import { getOrcamentos } from './actions'
import { OrcamentosContent } from './orcamentos-content'

export default async function OrcamentosPage() {
  const [orcamentos, materiais, dadosForm] = await Promise.all([
    getOrcamentos(),
    getMateriaisDisponiveis(),
    getCategoriasComComponentes(),
  ])

  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando orçamentos...</div>}>
      <OrcamentosContent
        orcamentos={orcamentos}
        materiais={materiais}
        categorias={dadosForm.categorias}
        grupos={dadosForm.grupos}
        componentes={dadosForm.componentes}
        maodeobra={dadosForm.maodeobra}
      />
    </Suspense>
  )
}
