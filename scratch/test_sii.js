async function test() {
  const rut = '18251533';
  const dv = '7';

  // Test 1: SII (Servicio de Impuestos Internos) o consulta pública de RUT
  try {
    const res = await fetch(`https://seia.sea.gob.cl/busqueda/buscarPersona.php?rut=${rut}-${dv}`);
    console.log('SEA status:', res.status);
    if (res.ok) {
      console.log('SEA text:', (await res.text()).slice(0, 500));
    }
  } catch(e) {
    console.log('SEA error:', e.message);
  }

  // Test 2: Mercado Público / API de Compras Públicas
  try {
    const res = await fetch(`https://api.mercadopublico.cl/sistemaproveedores/busqueda/rut/${rut}`);
    console.log('MercadoPublico status:', res.status);
    if (res.ok) {
      console.log('MercadoPublico text:', (await res.text()).slice(0, 500));
    }
  } catch(e) {
    console.log('MercadoPublico error:', e.message);
  }
}

test();
