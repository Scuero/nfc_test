async function test() {
  const rut = '18251533';
  const dv = '7';

  const endpoints = [
    `https://rutapi.cl/v1/rut/${rut}`,
    `https://api.libreapi.cl/rut/v2?rut=${rut}`,
    `https://nombrerutytirma.cl/api/v1/rut/${rut}`,
    `https://api.rutify.cl/v1/rut/${rut}`,
    `https://rutificador-api.herokuapp.com/api/v1/rut/${rut}`,
    `https://chile.rut.workers.dev/?rut=${rut}`,
    `https://rut.digital/api/v1/rut/${rut}-${dv}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(3000)
      });
      console.log(url, 'Status:', res.status);
      if (res.ok) {
        console.log('SUCCESS:', await res.text());
      }
    } catch (e) {
      console.log(url, 'Error:', e.message);
    }
  }
}

test();
