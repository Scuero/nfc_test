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

// Helper para formatear RUN chileno
function formatRun(raw) {
  if (!raw) return null;
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 8) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

// Endpoint para decodificar todos los datos de la Cédula Chilena (PDF417 / MRZ)
app.post('/api/parse-cedula', (req, res) => {
  try {
    const { mrzData, tramite } = req.body;
    if (!mrzData && !tramite) {
      return res.status(400).json({ error: 'mrzData o tramite es requerido' });
    }

    const inputStr = (mrzData || '') + ' ' + (tramite || '');
    const cleanStr = inputStr.replace(/\s+/g, ' ').toUpperCase();

    let fullName = 'No detectado';
    let run = null;
    let serial = null;
    let birthDateStr = null;
    let age = null;
    let expiryDateStr = null;
    let gender = null;

    // 1. Nombre completo ICAO 9303 (SURNAMES<<GIVEN_NAMES)
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

    // 2. RUN / RUT
    const runMatch = cleanStr.match(/\b(\d{7,8}[-kK0-9])\b/) || cleanStr.match(/CHL(\d{7,8}[K0-9])/);
    if (runMatch) {
      run = formatRun(runMatch[1]);
    }

    // 3. N° de Trámite / Serial
    const serialMatch = cleanStr.match(/IDCHL([A-Z0-9]{8,12})/i) || cleanStr.match(/\b(50\d{7,8}|A\d{8,9}|\d{9,10})\b/);
    if (serialMatch) {
      serial = serialMatch[1].replace(/</g, '');
    }

    // 4. Fechas (Nacimiento YYMMDD / Vencimiento YYMMDD)
    const mrzDatePair = cleanStr.match(/\b(\d{6})\d[MF](\d{6})\b/);
    if (mrzDatePair) {
      // Birth date
      const yyB = parseInt(mrzDatePair[1].substring(0, 2), 10);
      const mmB = parseInt(mrzDatePair[1].substring(2, 4), 10);
      const ddB = parseInt(mrzDatePair[1].substring(4, 6), 10);
      const currentYear = new Date().getFullYear();
      const centuryB = (yyB > (currentYear % 100)) ? 1900 : 2000;
      const fullYearB = centuryB + yyB;
      const birthDateObj = new Date(fullYearB, mmB - 1, ddB);
      
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDateObj.getFullYear();
      const monthDiff = today.getMonth() - birthDateObj.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
        calculatedAge--;
      }
      age = calculatedAge;
      birthDateStr = `${String(ddB).padStart(2, '0')}/${String(mmB).padStart(2, '0')}/${fullYearB}`;

      // Expiry date
      const yyE = parseInt(mrzDatePair[2].substring(0, 2), 10);
      const mmE = parseInt(mrzDatePair[2].substring(2, 4), 10);
      const ddE = parseInt(mrzDatePair[2].substring(4, 6), 10);
      const fullYearE = 2000 + yyE;
      expiryDateStr = `${String(ddE).padStart(2, '0')}/${String(mmE).padStart(2, '0')}/${fullYearE}`;
    }

    res.json({
      success: true,
      data: {
        nombreCompleto: fullName,
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
