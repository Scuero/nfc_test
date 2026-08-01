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

// Endpoint para decodificar estructura ICAO 9303 / MRZ / PDF417 de Cédula Chilena
app.post('/api/parse-cedula', (req, res) => {
  try {
    const { mrzData, tramite } = req.body;
    if (!mrzData && !tramite) {
      return res.status(400).json({ error: 'mrzData o tramite es requerido' });
    }

    const inputStr = (mrzData || '') + ' ' + (tramite || '');
    const cleanStr = inputStr.replace(/\s+/g, ' ').toUpperCase();

    let fullName = 'No detectado';
    let birthDateStr = null;
    let age = null;

    // 1. Extraer Nombre desde formato ICAO 9303 MRZ (SURNAMES<<GIVEN_NAMES)
    const mrzNameMatch = cleanStr.match(/([A-Z<]{10,})/);
    if (mrzNameMatch) {
      const parts = mrzNameMatch[0].split('<<');
      if (parts.length >= 2) {
        const surnames = parts[0].replace(/</g, ' ').trim();
        const givenNames = parts[1].replace(/</g, ' ').trim();
        if (surnames || givenNames) {
          fullName = `${givenNames} ${surnames}`.trim();
        }
      }
    }

    // 2. Extraer Fecha de Nacimiento (formato ICAO YYMMDD ej: 850315 -> 15/03/1985)
    // O desde URL/PDF417 chileno
    const dateMatch = cleanStr.match(/(\d{6})/);
    if (dateMatch) {
      const yy = parseInt(dateMatch[1].substring(0, 2), 10);
      const mm = parseInt(dateMatch[1].substring(2, 4), 10);
      const dd = parseInt(dateMatch[1].substring(4, 6), 10);

      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const currentYear = new Date().getFullYear();
        const century = (yy > (currentYear % 100)) ? 1900 : 2000;
        const fullYear = century + yy;
        
        const birthDate = new Date(fullYear, mm - 1, dd);
        const today = new Date();
        
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }

        if (calculatedAge >= 0 && calculatedAge <= 120) {
          age = calculatedAge;
          birthDateStr = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${fullYear}`;
        }
      }
    }

    res.json({
      success: true,
      nombre: fullName,
      edad: age,
      fechaNacimiento: birthDateStr,
      tramite: tramite || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor NDEF DNI / Cédula Chilena iniciado en el puerto ${PORT}`);
});
