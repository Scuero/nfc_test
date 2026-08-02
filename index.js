import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
// Servir archivos estáticos desde la carpeta /public
app.use(express.static(path.join(__dirname, 'public')));

// Helper para formatear RUN chileno sin errores de dígitos
function formatRun(raw) {
  if (!raw) return null;
  let body = '';
  let dv = '';
  if (raw.includes('-')) {
    const parts = raw.split('-');
    body = parts[0].replace(/[^0-9]/g, '');
    dv = parts[1].replace(/[^0-9kK]/g, '').toUpperCase();
  } else {
    const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length < 8) return clean;
    body = clean.slice(0, -1);
    dv = clean.slice(-1);
  }
  if (!body) return raw;
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

function parseYYMMDD(str, isBirth = true) {
  if (!str || str.length !== 6) return null;
  const yy = parseInt(str.substring(0, 2), 10);
  const mm = parseInt(str.substring(2, 4), 10);
  const dd = parseInt(str.substring(4, 6), 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYear = new Date().getFullYear();
  let century = isBirth ? ((yy > (currentYear % 100)) ? 1900 : 2000) : ((yy < 50) ? 2000 : 1900);
  const fullYear = century + yy;
  const birthDateObj = new Date(fullYear, mm - 1, dd);

  const today = new Date();
  let calculatedAge = today.getFullYear() - birthDateObj.getFullYear();
  const monthDiff = today.getMonth() - birthDateObj.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
    calculatedAge--;
  }

  const formatted = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${fullYear}`;
  return { formatted, age: calculatedAge };
}

// Endpoint para decodificar todos los datos de la Cédula Chilena (PDF417 / MRZ / URL Registro Civil)
app.post('/api/parse-cedula', (req, res) => {
  try {
    const { mrzData, tramite } = req.body;
    if (!mrzData && !tramite) {
      return res.status(400).json({ error: 'mrzData o tramite es requerido' });
    }

    const inputStr = (mrzData || '') + ' ' + (tramite || '');
    const cleanStr = inputStr.trim().toUpperCase();

    let fullName = 'No detectado';
    let run = null;
    let serial = null;
    let birthDateStr = null;
    let age = null;
    let expiryDateStr = null;
    let gender = null;

    // 1. Extraer desde URL del Registro Civil de Chile
    if (cleanStr.includes('REGISTROCIVIL.CL') || cleanStr.includes('RUN=')) {
      try {
        const urlString = inputStr.startsWith('http') ? inputStr.split(' ')[0] : 'https://' + inputStr.split(' ')[0];
        const urlObj = new URL(urlString);
        const params = new URLSearchParams(urlObj.search);

        if (params.has('RUN')) {
          run = formatRun(params.get('RUN'));
        }
        if (params.has('serial')) {
          serial = params.get('serial');
        }
        if (params.has('mrz')) {
          const mrzVal = params.get('mrz');
          if (mrzVal.length >= 24) {
            const birthRaw = mrzVal.substring(10, 16);
            const expiryRaw = mrzVal.substring(17, 23);

            const birthParsed = parseYYMMDD(birthRaw, true);
            if (birthParsed) {
              birthDateStr = birthParsed.formatted;
              age = birthParsed.age;
            }
            const expiryParsed = parseYYMMDD(expiryRaw, false);
            if (expiryParsed) {
              expiryDateStr = expiryParsed.formatted;
            }
          }
        }
      } catch (e) {
        console.warn('API URL parse error:', e);
      }
    }

    // 2. Nombre completo ICAO 9303 (SURNAMES<<GIVEN_NAMES)
    const mrzNameMatch = cleanStr.match(/([A-Z<]{8,})/g);
    if (mrzNameMatch) {
      for (const candidate of mrzNameMatch) {
        if (candidate.includes('<<')) {
          const parts = candidate.split('<<');
          const surnames = parts[0].replace(/P<CHL|IDCHL|[0-9<]/g, ' ').replace(/</g, ' ').trim();
          const givenNames = parts[1] ? parts[1].replace(/[0-9<]/g, ' ').replace(/</g, ' ').trim() : '';
          if (surnames || givenNames) {
            fullName = `${givenNames} ${surnames}`.replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
    }

    // 3. RUN fallback
    if (!run) {
      const runMatch = cleanStr.match(/RUN[=:]?\s*(\d{7,8}-?[Kk0-9])/i) || cleanStr.match(/\b(\d{7,8}-?[Kk0-9])\b/);
      if (runMatch) {
        run = formatRun(runMatch[1]);
      }
    }

    // 4. Serial fallback
    if (!serial) {
      const serialMatch = cleanStr.match(/IDCHL([A-Z0-9]{8,12})/i) || cleanStr.match(/\b(50\d{7,8}|5\d{8}|A\d{8,9}|\d{9,10})\b/);
      if (serialMatch) {
        serial = serialMatch[1].replace(/</g, '');
      }
    }

    // 5. Fechas fallback desde par MRZ
    if (!birthDateStr) {
      const mrzDatePair = cleanStr.match(/\b(\d{6})\d[MF](\d{6})\b/);
      if (mrzDatePair) {
        const birthParsed = parseYYMMDD(mrzDatePair[1], true);
        if (birthParsed) {
          birthDateStr = birthParsed.formatted;
          age = birthParsed.age;
        }
        const expiryParsed = parseYYMMDD(mrzDatePair[2], false);
        if (expiryParsed) {
          expiryDateStr = expiryParsed.formatted;
        }
      }
    }

    res.json({
      success: true,
      data: {
        nombreCompleto: fullName !== 'No detectado' ? fullName : (run ? `Titular RUN ${run}` : 'No detectado'),
        run: run || 'No detectado',
        numeroTramite: serial || tramite || 'No detectado',
        fechaNacimiento: birthDateStr || 'No especificada',
        edad: age,
        fechaVencimiento: expiryDateStr || 'No especificada',
        nacionalidad: 'Chile (CHL)',
        documento: 'Cédula de Identidad de Chile (e-ID)'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor NDEF DNI / Cédula Chilena iniciado en el puerto ${PORT}`);
});
