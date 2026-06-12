import { Placeholder } from '@/components/Placeholder';

/**
 * Rota de impressão (fora do grupo (app)) — PRD §7. Será protegida por
 * PRINT_SERVICE_TOKEN e renderizará o document_json na implementação 004.
 */
export default function PrintPage() {
  return (
    <Placeholder
      title="Impressão / PDF"
      route="/reports/[id]/print"
      impl="004"
    />
  );
}
