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
      showStatus('Por favor, aproxime su DNI a la parte posterior del teléfono...', 'info');

      const ndef = new NDEFReader();
      await ndef.scan();

      showStatus('Buscando señal NFC... Mantenga el documento firme.', 'info');

      ndef.addEventListener('readingerror', () => {
        showStatus('Error al leer la etiqueta NFC. Intente nuevamente aproximando el DNI.', 'error');
        userNameHeading.textContent = 'Nombre: Error de lectura';
        scanBtn.disabled = false;
      });

      ndef.addEventListener('reading', ({ message, serialNumber }) => {
        console.log('Lectura NFC detectada. Serial Number:', serialNumber);
        showStatus('¡Documento detectado! Procesando datos...', 'success');

        const tramiteKey = tramiteInput.value.trim();
        let nameExtracted = '';

        if (message.records && message.records.length > 0) {
          for (const record of message.records) {
            console.log(`Record type: ${record.recordType}, mediaType: ${record.mediaType}`);

            if (record.data) {
              const textDecoder = new TextDecoder('utf-8');
              const decodedString = textDecoder.decode(record.data);
              console.log('Payload decodificado:', decodedString);

              // Intentar extraer texto legible de los registros
              if (record.recordType === 'text') {
                nameExtracted = decodedString;
              } else {
                // Si viene un payload binario o datos raw de ICAO / DNI NDEF
                const cleanText = decodedString.replace(/[^\x20-\x7E\xC0-\xFF]/g, ' ').trim();
                if (cleanText.length > 0) {
                  nameExtracted = cleanText;
                }
              }
            }
          }
        }

        // Si no se extrajo texto de los registros NDEF, mostrar el serial NDEF / ID de chip como respaldo
        if (!nameExtracted) {
          if (serialNumber) {
            nameExtracted = `Chip ID: ${serialNumber}`;
          } else {
            nameExtracted = 'Lectura finalizada (sin datos de texto)';
          }
        }

        // Si se ingresó número de trámite, incluirlo en la visualización
        const tramiteText = tramiteKey ? ` (Trámite: ${tramiteKey})` : '';

        // Actualizar dinámicamente el contenedor <h2 id="user-name">
        userNameHeading.textContent = `Nombre: ${nameExtracted}${tramiteText}`;
        showStatus('Lectura completada con éxito.', 'success');
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
