async function test() {
  const rut = '18251533';
  const dv = '7';

  // 1. Test Servel direct query
  try {
    const res = await fetch('https://consulta.servel.cl/api/getConsultaRut/' + rut + '-' + dv, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://consulta.servel.cl/'
      }
    });
    console.log('Servel API status:', res.status);
    if (res.ok) {
      console.log('Servel JSON:', await res.json());
    }
  } catch(e) {
    console.log('Servel error:', e.message);
  }

  // 2. Test ChileAtiende / Portal Ciudadano
  try {
    const res = await fetch(`https://api.chileatiende.gob.cl/v1/servicios?rut=${rut}`);
    console.log('ChileAtiende status:', res.status);
  } catch(e) {
    console.log('ChileAtiende error:', e.message);
  }

  // 3. Test API de consulta publica de datos de RUT de Chile
  try {
    const res = await fetch(`https://nombrerutytirma.com/backend/buscar_rut.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: `rut=${rut}-${dv}`
    });
    console.log('Nombrerutytirma.com status:', res.status);
    if (res.ok) {
      console.log('Nombrerutytirma text:', (await res.text()).slice(0, 300));
    }
  } catch(e) {
    console.log('Nombrerutytirma.com error:', e.message);
  }

  // 4. Test API alternativa de Padrón Electoral
  try {
    const res = await fetch(`https://rut.chile.services/api/${rut}-${dv}`);
    console.log('Chile.services status:', res.status);
    if (res.ok) {
      console.log('Chile.services JSON:', await res.json());
    }
  } catch(e) {
    console.log('Chile.services error:', e.message);
  }
}

test();
