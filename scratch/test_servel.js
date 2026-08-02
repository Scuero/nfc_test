async function test() {
  const res = await fetch('https://consulta.servel.cl/js/app.99ba638a.js');
  const js = await res.text();

  console.log('JS length:', js.length);

  const matches = js.match(/https?:\/\/[^"'`\s]+/g) || [];
  console.log('URLs found:', matches);

  const apiPaths = js.match(/["']\/[^"'`\s]*api[^"'`\s]*["']/gi) || [];
  console.log('API Paths found:', apiPaths);

  const rutMatches = js.match(/["'][^"'`\s]*rut[^"'`\s]*["']/gi) || [];
  console.log('RUT strings found:', rutMatches.slice(0, 30));
}

test();
