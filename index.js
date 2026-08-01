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

// Endpoint para decodificar estructura ICAO 9303 DG1 de Cédula Chilena
app.post('/api/parse-cedula', (req, res) => {
  try {
    const { mrzData, tramite } = req.body;
    if (!mrzData) {
      return res.status(400).json({ error: 'mrzData es requerido' });
    }
    
    // Parser de MRZ ICAO 9303 para Cédula Chilena
    const cleanMrz = mrzData.replace(/\s+/g, '');
    const nameMatch = cleanMrz.match(/([A-Z<]{10,})/);
    
    let fullName = 'No detectado';
    if (nameMatch) {
      const parts = nameMatch[0].split('<<');
      if (parts.length >= 2) {
        const surnames = parts[0].replace(/</g, ' ').trim();
        const givenNames = parts[1].replace(/</g, ' ').trim();
        fullName = `${givenNames} ${surnames}`;
      }
    }

    res.json({
      success: true,
      nombre: fullName,
      tramite: tramite || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor NDEF DNI / Cédula Chilena iniciado en el puerto ${PORT}`);
});
