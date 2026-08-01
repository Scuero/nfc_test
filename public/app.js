document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scan-btn');
  const cameraBtn = document.getElementById('camera-btn');
  const cameraFeed = document.getElementById('camera-feed');
  const userNameHeading = document.getElementById('user-name');
  const userAgeHeading = document.getElementById('user-age');
  const userExtraText = document.getElementById('user-extra');
  const statusBox = document.getElementById('status-box');
  const resultCard = document.getElementById('result-card');
  const tramiteInput = document.getElementById('tramite-input');

  function showStatus(message, type = 'info') {
    statusBox.className = `status-box ${type}`;
    statusBox.innerHTML = message;
  }

  function hideStatus() {
    statusBox.className = 'status-box';
    statusBox.innerHTML = '';
  }

  /**
   * Procesa cualquier cadena MRZ o datos de la Cédula Chilena (ej: SURNAMES<<GIVEN_NAMES y YYMMDD)
   */
  function parseChileanData(inputStr) {
    if (!inputStr) return { name: null, age: null };

    const str = inputStr.toUpperCase().replace(/\s+/g, ' ');
    let name = null;
    let age = null;

    // 1. Parser de Nombre ICAO 9303 / MRZ
    const matchName = str.match(/[A-Z<]{10,}/g);
    if (matchName) {
      for (const candidate of matchName) {
        if (candidate.includes('<<')) {
          const parts = candidate.split('<<');
          const surnames = parts[0].replace(/</g, ' ').trim();
          const givenNames = parts[1] ? parts[1].replace(/</g, ' ').trim() : '';
          if (surnames || givenNames) {
            name = `${givenNames} ${surnames}`.trim();
            break;
          }
        }
      }
    }

    // 2. Parser de Fecha de Nacimiento (YYMMDD -> Edad)
    const matchDate = str.match(/\b(\d{6})\b/);
    if (matchDate) {
      const yy = parseInt(matchDate[1].substring(0, 2), 10);
      const mm = parseInt(matchDate[1].substring(2, 4), 10);
      const dd = parseInt(matchDate[1].substring(4, 6), 10);

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
        }
      }
    }

    return { name, age };
  }

  /**
   * Actualiza la UI con Nombre, Edad y Detalles obtenidos
   */
  async function updateIdentityResult(rawText, serialNumber = null) {
    resultCard.classList.add('active');
    const tramiteVal = tramiteInput.value.trim();

    const { name: localName, age: localAge } = parseChileanData(rawText + ' ' + tramiteVal);

    let finalName = localName;
    let finalAge = localAge;

    // Si no se extrajo localmente, consultar endpoint de apoyo Express
    if (!finalName || finalAge === null) {
      try {
        const resp = await fetch('/api/parse-cedula', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mrzData: rawText, tramite: tramiteVal })
        });
        const data = await resp.json();
        if (data.success) {
          if (data.nombre && data.nombre !== 'No detectado') finalName = data.nombre;
          if (data.edad !== null && data.edad !== undefined) finalAge = data.edad;
        }
      } catch (e) {
        console.warn('Endpoint /api/parse-cedula:', e);
      }
    }

    // Renderizar resultados
    userNameHeading.textContent = `Nombre: ${finalName || 'Cédula de Identidad de Chile'}`;
    userAgeHeading.textContent = `Edad: ${finalAge !== null ? finalAge + ' años' : 'Información no especificada en el código'}`;
    userExtraText.textContent = `Tipo: e-ID Chileno (ICAO 9303)${serialNumber ? ' | Chip ID: ' + serialNumber : ''}${tramiteVal ? ' | Trámite: ' + tramiteVal : ''}`;

    showStatus('¡Datos de Cédula actualizados correctamente!', 'success');
  }

  // Verificar compatibilidad Web NFC
  if (!('NDEFReader' in window)) {
    showStatus('Web NFC no está soportado en este navegador. Utilice Chrome en Android con NFC activo.', 'error');
    scanBtn.disabled = true;
  } else {
    scanBtn.addEventListener('click', async () => {
      hideStatus();
      userNameHeading.textContent = 'Nombre: Escaneando...';
      userAgeHeading.textContent = 'Edad: Escaneando...';
      scanBtn.disabled = true;

      try {
        showStatus('Aproxime la Cédula Chilena o DNI a la antena posterior del teléfono...', 'info');

        const ndef = new NDEFReader();
        await ndef.scan();

        showStatus('Buscando chip NFC/eMRTD... Mantenga la Cédula firme.', 'info');

        // Evento readingerror: Ocurre cuando la Cédula Chilena ISO-DEP no tiene registros NDEF pero hace sonar la antena NFC
        ndef.addEventListener('readingerror', () => {
          console.log('NFC detectado (Cédula Chilena ISO-DEP). Procesando datos...');
          const inputVal = tramiteInput.value.trim();
          updateIdentityResult(inputVal);
          scanBtn.disabled = false;
        });

        // Evento reading: Ocurre si la etiqueta entrega registros NDEF de texto
        ndef.addEventListener('reading', async ({ message, serialNumber }) => {
          let payloadText = '';
          if (message.records) {
            for (const rec of message.records) {
              if (rec.data) {
                payloadText += ' ' + new TextDecoder('utf-8').decode(rec.data);
              }
            }
          }
          updateIdentityResult(payloadText, serialNumber);
          scanBtn.disabled = false;
        });

      } catch (err) {
        console.error(err);
        showStatus(`Error NFC: ${err.message || err.name}`, 'error');
        scanBtn.disabled = false;
      }
    });
  }

  // Soporte para escáner de código PDF417 / MRZ con Cámara
  cameraBtn.addEventListener('click', async () => {
    if (!('BarcodeDetector' in window)) {
      alert('Tu navegador no soporta BarcodeDetector nativo. Ingresa los datos manualmente en la casilla.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraFeed.srcObject = stream;
      cameraFeed.style.display = 'block';
      showStatus('Apunte la cámara al código de barras (reverso de la Cédula)...', 'info');

      const barcodeDetector = new BarcodeDetector({ formats: ['pdf417', 'qr_code', 'code_128'] });
      
      const interval = setInterval(async () => {
        try {
          const barcodes = await barcodeDetector.detect(cameraFeed);
          if (barcodes.length > 0) {
            clearInterval(interval);
            const scannedValue = barcodes[0].rawValue;
            console.log('Código escaneado:', scannedValue);
            
            tramiteInput.value = scannedValue;
            stream.getTracks().forEach(t => t.stop());
            cameraFeed.style.display = 'none';

            updateIdentityResult(scannedValue);
          }
        } catch (e) {
          console.error(e);
        }
      }, 500);
    } catch (e) {
      alert('Error al acceder a la cámara: ' + e.message);
    }
  });

  // Al escribir o pegar directamente en el input, actualizar en tiempo real
  tramiteInput.addEventListener('input', () => {
    const val = tramiteInput.value.trim();
    if (val.length > 5) {
      updateIdentityResult(val);
    }
  });
});
