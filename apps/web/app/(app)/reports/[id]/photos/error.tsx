'use client';

import { useRouter } from 'next/navigation';

export default function PhotosError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return <div role="alert" style={{ padding: 32 }}>
    <h2>Não foi possível carregar as fotos</h2>
    <p>Verifique a conexão e tente novamente. As fotos enviadas continuam salvas.</p>
    <button onClick={() => { router.refresh(); reset(); }}>Tentar novamente</button>
  </div>;
}
