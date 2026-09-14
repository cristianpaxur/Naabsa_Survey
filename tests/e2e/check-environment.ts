export default function checkEnvironment() {
  if (process.env.NAABSA_TEST_DATABASE !== 'isolated') {
    throw new Error('E2E cria e remove dados. Configure um projeto exclusivo de testes e NAABSA_TEST_DATABASE=isolated.');
  }
}
