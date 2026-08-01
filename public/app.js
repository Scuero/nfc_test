document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scan-btn');
  const userNameHeading = document.getElementById('user-name');
  const statusBox = document.getElementById('status-box');
  const resultCard = document.getElementById('result-card');
  const tramiteInput = document.getElementById('tramite-input');

  function showStatus(message, type = 'info') {
    statusBox.className = `status-box ${type}`;
    statusBox.textContent = message;
  }

  function hideStatus() {
    statusBox.className = 'status-box';
    statusBox.textContent = '';
  }

  /**
   * Función para parsear estructuras MRZ ICAO 9303 de Cédulas Chilenas y DNI.
   * En formato ICAO TD1 (Cédula de Chile):
   * '<<' separa los Apellidos de los Nombres.
   * Ejemplo: PEREZ<GONZALEZ<<JUAN<CARLOS -> JUAN CARLOS PEREZ GONZALEZ
   */
  function parseICAO9303Name(mrzText) {
    if (!mrzText) return null;

    // Buscar patrones de MRZ chileno/ICAO (letras y relleno '<')
    const match = mrzText.match(/[A-Z<]{10,}/g);
    if (match) {
      for (const candidate of match) {
        if (candidate.includes('<<')) {
          const parts = candidate.split('<<');
          const surnames = parts[0].replace(/</g, ' ').trim();
          const givenNames = parts[1] ? parts[1].replace(/</g, ' ').trim() : '';
          
          if (surnames && givenNames) {
            return `${givenNames} ${surnames}`;
          } else if (surnames) {
            return surnames;
          }
        }
      }
    }

    // Si no tiene '<<', limpiar los caracteres '<' sobrantes
    const cleanText = mrzText.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    return cleanText.length > 2 ? cleanText : null;
  }

  // Verificar compatibilidad de Web NFC
  if (!('NDEFReader' in window)) {
    showStatus('Web NFC no está soportado en este navegador o dispositivo. Requiere Chrome en Android con NFC activo y conexión HTTPS.', 'error');
    scanBtn.disabled = true;
    return;
  }

  scanBtn.addEventListener('click', async () => {
    hideStatus();
    userNameHeading.textContent = 'Nombre: Escaneando...';
    resultCard.classList.add('active');
    scanBtn.disabled = true;

    try {
      showStatus('Aproxime la Cédula Chilena o DNI a la antena posterior del teléfono...', 'info');

      const ndef = new NDEFReader();
      await ndef.scan();

      showStatus('Buscando chip NFC/eMRTD... Mantenga el documento firme.', 'info');

      ndef.addEventListener('readingerror', () => {
        showStatus('Error al leer la tarjeta. Mantenga la Cédula apoyada en la antena NFC.', 'error');
        userNameHeading.textContent = 'Nombre: Error de lectura';
        scanBtn.disabled = false;
      });

      ndef.addEventListener('reading', async ({ message, serialNumber }) => {
        console.log('Lectura NFC detectada. Serial Number:', serialNumber);
        showStatus('¡Documento o Cédula detectada! Procesando chip...', 'success');

        const tramiteKey = tramiteInput.value.trim();
        let extractedName = null;
        let rawPayloadText = '';

        if (message.records && message.records.length > 0) {
          for (const record of message.records) {
            console.log(`Record type: ${record.recordType}, mediaType: ${record.mediaType}`);

            if (record.data) {
              const textDecoder = new TextDecoder('utf-8');
              const decodedString = textDecoder.decode(record.data);
              rawPayloadText += ' ' + decodedString;

              // Intentar parsear el formato ICAO 9303 / Cédula Chilena
              const parsedName = parseICAO9303Name(decodedString);
              if (parsedName) {
                extractedName = parsedName;
                break;
              }
            }
          }
        }

        // Si se capturó texto pero no se formateó el nombre, llamar al backend de apoyo
        if (!extractedName && rawPayloadText.trim().length > 0) {
          try {
            const resp = await fetch('/api/parse-cedula', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mrzData: rawPayloadText, tramite: tramiteKey })
            });
            const data = await resp.json();
            if (data.success && data.nombre !== 'No detectado') {
              extractedName = data.nombre;
            }
          } catch (e) {
            console.warn('Endpoint de apoyo /api/parse-cedula no disponible:', e);
          }
        }

        // Si el chip es ICAO 9303 protegido (como la Cédula Chilena en Web NFC que entrega solo el Chip ID)
        if (!extractedName) {
          if (serialNumber) {
            extractedName = `Cédula Detectada (Chip ID: ${serialNumber})`;
          } else {
            extractedName = 'Cédula Chilena / DNI Detectado';
          }
        }

        const tramiteInfo = tramiteKey ? ` | N° Trámite: ${tramiteKey}` : '';
        userNameHeading.textContent = `Nombre: ${extractedName}${tramiteInfo}`;
        
        showStatus('Lectura finalizada con éxito.', 'success');
        scanBtn.disabled = false;
      });

    } catch (error) {
      console.error('Error Web NFC:', error);
      let errorMsg = 'Error al iniciar escaneo NFC.';

      if (error.name === 'NotAllowedError') {
        errorMsg = 'Permiso denegado para acceder a la antena NFC.';
      } else if (error.name === 'NotSupportedError') {
        errorMsg = 'NFC no es soportado en este dispositivo.';
      } else {
        errorMsg = `Error: ${error.message || error.name}`;
      }

      showStatus(errorMsg, 'error');
      userNameHeading.textContent = 'Nombre: Esperando escaneo...';
      scanBtn.disabled = false;
      resultCard.classList.remove('active');
    }
  });
});
