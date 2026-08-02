async function testApis() {
  const run = '18251533-7';
  const cleanRun = '182515337';

  console.log('--- TEST APIS DE CHILE ---');

  // Test 1: libreapi.cl
  try {
    const res = await fetch(`https://libreapi.cl/rut/${run}`);
    console.log('libreapi status:', res.status);
    if (res.ok) {
      const json = await res.json();
      console.log('libreapi data:', json);
    }
  } catch (e) {
    console.log('libreapi err:', e.message);
  }

  // Test 2: rutapi.cl
  try {
    const res = await fetch(`https://rutapi.cl/v1/rut/${cleanRun}`);
    console.log('rutapi status:', res.status);
    if (res.ok) {
      const json = await res.json();
      console.log('rutapi data:', json);
    }
  } catch (e) {
    console.log('rutapi err:', e.message);
  }

  // Test 3: nombrerutyfirma / rutificador open search
  try {
    const res = await fetch(`https://api.nombrerutyfirma.cl/v1/rut/${cleanRun}`);
    console.log('nombrerutyfirma status:', res.status);
    if (res.ok) {
      const json = await res.json();
      console.log('nombrerutyfirma data:', json);
    }
  } catch (e) {
    console.log('nombrerutyfirma err:', e.message);
  }
}

testApis();
