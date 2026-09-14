import Link from 'next/link';

export default function AdminSpecsPage() {
  return <section style={{padding:'32px 40px',maxWidth:780}}>
    <h1>Modelos de relatório</h1>
    <p>A edição de modelos por esta tela ainda não está disponível.</p>
    <p>Os modelos de Draft Survey e MSC são mantidos pela equipe responsável pelo sistema. Relatórios existentes preservam a versão usada na criação.</p>
    <Link href="/dashboard">Voltar aos relatórios</Link>
  </section>;
}
